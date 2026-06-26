import { useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as XLSX from 'xlsx';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';
import type { Student } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportRow {
  name: string;
  code: string;
  phone: string;
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['اسم الطالب', 'السجل المدني', 'رقم الجوال'],
    ['محمد أحمد العمري', '1234567890', '0512345678'],
    ['فهد سالم القحطاني', '1098765432', ''],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'طلاب');
  XLSX.writeFile(wb, 'students-template.xlsx');
}

function readExcel(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّر قراءة الملف'));
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target!.result as ArrayBuffer), { type: 'array' });
        resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false }));
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function rowErrors(row: ImportRow, index: number, allRows: ImportRow[], existing: Student[]): string[] {
  const errs: string[] = [];
  if (!row.name.trim()) errs.push('الاسم مطلوب');
  if (!/^\d{10}$/.test(row.code)) errs.push('السجل المدني يجب أن يكون 10 أرقام');
  else {
    const dupInFile = allRows.some((r, i) => i !== index && r.code === row.code);
    if (dupInFile) errs.push('السجل المدني مكرر في الملف');
    const dupExisting = existing.some((s) => s.code === row.code);
    if (dupExisting) errs.push('السجل المدني مسجّل مسبقاً في النظام');
  }
  if (row.phone) {
    const dupPhoneInFile = allRows.some((r, i) => i !== index && r.phone && r.phone === row.phone);
    if (dupPhoneInFile) errs.push('رقم الجوال مكرر في الملف');
  }
  return errs;
}

export default function ImportStudentsModal({ open, onOpenChange }: Props) {
  const students = useStore((s) => s.students);
  const session = useStore((s) => s.session);
  const loadCore = useStore((s) => s.loadCore);
  const pushToast = useStore((s) => s.pushToast);

  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRows(null);
    setParsing(false);
    setSubmitting(false);
  };

  const errorsByRow = useMemo(() => {
    if (!rows) return [];
    return rows.map((row, i) => rowErrors(row, i, rows, students));
  }, [rows, students]);

  const validCount = errorsByRow.filter((e) => e.length === 0).length;

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const raw = await readExcel(file);
      const parsed: ImportRow[] = raw
        .map((r) => ({
          name: String(r['اسم الطالب'] ?? r['الاسم'] ?? r['name'] ?? '').trim(),
          code: String(r['السجل المدني'] ?? r['رقم السجل المدني'] ?? r['code'] ?? '').trim(),
          phone: String(r['رقم الجوال'] ?? r['الجوال'] ?? r['phone'] ?? '').trim(),
        }))
        .filter((r) => r.name || r.code);
      if (!parsed.length) {
        pushToast('error', 'لم يتم العثور على صفوف صالحة في الملف — تأكد من أعمدة "اسم الطالب" و"السجل المدني"');
        setParsing(false);
        return;
      }
      setRows(parsed);
    } catch {
      pushToast('error', 'تعذّر قراءة الملف، تأكد أنه ملف Excel صالح');
    } finally {
      setParsing(false);
    }
  };

  const updateCell = (i: number, field: keyof ImportRow, value: string) => {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[i] = { ...next[i], [field]: field === 'code' ? value.replace(/\D/g, '').slice(0, 10) : value };
      return next;
    });
  };

  const removeRow = (i: number) => {
    setRows((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev));
  };

  const submit = async () => {
    if (!rows) return;
    const validRows = rows.filter((_, i) => errorsByRow[i].length === 0);
    if (!validRows.length) return;
    setSubmitting(true);
    try {
      const payload = validRows.map((r) => ({
        name: r.name.trim(),
        code: r.code,
        phone: r.phone.trim(),
        school: session?.school && session.school !== '*' ? session.school : undefined,
      }));
      const res = await api.post<{ added: number; updated: number; skipped: number; total: number }>(
        '/students',
        payload,
      );
      pushToast('success', `تمت إضافة ${res.added} طالب${res.skipped ? ` (تجاهل ${res.skipped} مكرر)` : ''}`);
      await loadCore();
      reset();
      onOpenChange(false);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل الاستيراد');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] flex max-h-[85vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white p-6 shadow-2xl animate-fade-in dark:bg-slate-800">
          <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white">استيراد طلاب من Excel</Dialog.Title>

          {!rows ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                الملف يجب أن يحتوي على عمودي "اسم الطالب" و"السجل المدني" (10 أرقام)، وعمود "رقم الجوال" اختياري.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  ⬇️ تحميل القالب
                </button>
                <button
                  type="button"
                  disabled={parsing}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {parsing ? 'جارٍ القراءة…' : '📤 رفع ملف Excel'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) handleFile(file);
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {rows.length} سجل — <span className="font-bold text-emerald-600 dark:text-emerald-400">{validCount} صالح</span>
                  {validCount < rows.length && (
                    <span className="font-bold text-rose-600 dark:text-rose-400"> · {rows.length - validCount} به مشاكل</span>
                  )}
                </span>
                <button type="button" onClick={() => setRows(null)} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  رفع ملف آخر
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-right text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                    <tr className="text-slate-500 dark:text-slate-400">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">الاسم</th>
                      <th className="px-3 py-2 font-medium">السجل المدني</th>
                      <th className="px-3 py-2 font-medium">الجوال</th>
                      <th className="px-3 py-2 font-medium">الحالة</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const errs = errorsByRow[i];
                      const hasError = errs.length > 0;
                      return (
                        <tr key={i} className={hasError ? 'bg-rose-50 dark:bg-rose-950/30' : ''}>
                          <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                          <td className="px-3 py-1.5">
                            <input
                              value={row.name}
                              onChange={(e) => updateCell(i, 'name', e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              value={row.code}
                              onChange={(e) => updateCell(i, 'code', e.target.value)}
                              inputMode="numeric"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              value={row.phone}
                              onChange={(e) => updateCell(i, 'phone', e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            {hasError ? (
                              <span className="text-xs font-medium text-rose-600 dark:text-rose-400" title={errs.join(' · ')}>
                                ⚠️ {errs[0]}
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ صالح</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <button type="button" onClick={() => removeRow(i)} className="text-slate-400 hover:text-rose-600" title="حذف">
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                إلغاء
              </button>
            </Dialog.Close>
            {rows && (
              <button
                type="button"
                disabled={submitting || validCount === 0}
                onClick={submit}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? 'جارٍ الاستيراد…' : `✅ تأكيد الاستيراد (${validCount})`}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
