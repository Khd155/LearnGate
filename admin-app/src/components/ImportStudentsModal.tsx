import { useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as XLSX from 'xlsx';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';
import { GRADE_LEVELS, type GradeLevel } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'upload' | 'mapping' | 'preview' | 'done';

type FieldKey = 'name' | 'phone' | 'gradeLevel';

interface PreviewRow {
  index: number;
  name: string;
  phone: string;
  gradeLevel: string;
  status: 'new' | 'invalid' | 'duplicate_in_file' | 'duplicate_existing';
  error: string;
}

interface CreatedStudent {
  id: string;
  code: string;
  name: string;
  phone: string;
  gradeLevel: string;
}

const STATUS_LABEL: Record<PreviewRow['status'], string> = {
  new: 'جاهز',
  invalid: 'غير صالح',
  duplicate_in_file: 'مكرر في الملف',
  duplicate_existing: 'مسجّل مسبقاً',
};

const HEADER_HINTS: Record<FieldKey, string[]> = {
  name: ['اسم الطالب', 'الاسم', 'اسم', 'name'],
  phone: ['رقم الجوال', 'الجوال', 'جوال', 'phone', 'mobile'],
  gradeLevel: ['المرحلة الدراسية', 'المرحلة', 'الصف', 'grade', 'stage'],
};

function IconUpload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12M12 16l-4-4M12 16l4-4" />
      <path d="M4 20h16" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
function IconWhatsapp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.6 14.3c-.2.6-1.3 1.2-1.8 1.3-.5.1-1 .1-3.2-.7-2.7-1.1-4.5-3.8-4.6-4-.1-.2-1.1-1.5-1.1-2.8 0-1.3.7-2 1-2.2.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5.3.6.9 2 1 2.1.1.2.1.4 0 .6-.5 1-1 1-.7 1.5.7 1.2 1.3 1.7 2.2 2.2.5.3.8.3 1 0 .3-.3.9-1 1.1-1.4.2-.3.5-.3.8-.2.3.1 2 1 2.3 1.1.3.2.5.3.6.4.1.2.1.9-.1 1.7Z" />
    </svg>
  );
}

function readSheet(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّر قراءة الملف'));
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target!.result as ArrayBuffer), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false });
        resolve(aoa.map((row) => row.map((cell) => String(cell ?? '').trim())));
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function detectColumn(headerRow: string[], field: FieldKey): number | null {
  const hints = HEADER_HINTS[field];
  for (let i = 0; i < headerRow.length; i++) {
    const h = headerRow[i].toLowerCase();
    if (hints.some((hint) => h.includes(hint.toLowerCase()))) return i;
  }
  return null;
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['اسم الطالب', 'رقم الجوال', 'المرحلة الدراسية'],
    ['محمد أحمد العمري', '0512345678', 'ثالث ثانوي'],
    ['فهد سالم القحطاني', '', 'ثالث ثانوي'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'طلاب');
  XLSX.writeFile(wb, 'students-template.xlsx');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function exportBatchXls(batchStudents: { code: string; name: string; phone: string; grade_level: string }[]) {
  const headers = ['الاسم', 'رقم الدخول', 'الجوال', 'المرحلة الدراسية'];
  const todayStr = new Date().toISOString().slice(0, 10);
  const textCell = (v: string) => `<td style="mso-number-format:'\\@';text-align:right;">${escapeHtml(v)}</td>`;
  const cell = (v: string) => `<td style="text-align:right;">${escapeHtml(v)}</td>`;
  const headerRow = `<tr>${headers.map((h) => `<td style="font-weight:bold;background:#E2E8F0;text-align:center;">${escapeHtml(h)}</td>`).join('')}</tr>`;
  const dataRows = batchStudents
    .map((s) => `<tr>${[cell(s.name || ''), textCell(s.code || ''), textCell(s.phone || ''), cell(s.grade_level || '')].join('')}</tr>`)
    .join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><style>table{border-collapse:collapse;font-family:Tahoma,Arial,sans-serif;font-size:13px;direction:rtl;}td{border:1px solid #CBD5E1;padding:6px 10px;}</style></head>
<body><table>
<tr><td colspan="4" style="text-align:center;font-weight:bold;font-size:18px;background:#0F172A;color:#FFFFFF;padding:16px;">دفعة استيراد جديدة — بوابة دعم التعلم</td></tr>
${headerRow}
${dataRows}
<tr><td colspan="4" style="text-align:center;font-style:italic;color:#475569;">تاريخ التصدير: ${todayStr}</td></tr>
</table></body></html>`;
  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `دفعة-طلاب-${todayStr}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ImportStudentsModal({ open, onOpenChange }: Props) {
  const loadCore = useStore((s) => s.loadCore);
  const pushToast = useStore((s) => s.pushToast);

  const [step, setStep] = useState<Step>('upload');
  const [parsing, setParsing] = useState(false);
  const [sheet, setSheet] = useState<string[][] | null>(null);
  const [startRow, setStartRow] = useState(1);
  const [mapping, setMapping] = useState<Record<FieldKey, number | null>>({ name: null, phone: null, gradeLevel: null });
  const [uniformGradeLevel, setUniformGradeLevel] = useState<GradeLevel | ''>('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [batchId, setBatchId] = useState<string | null>(null);
  const [createdStudents, setCreatedStudents] = useState<CreatedStudent[]>([]);
  const [exporting, setExporting] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchProgress, setDispatchProgress] = useState({ sent: 0, failed: 0 });
  const [dispatchDone, setDispatchDone] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setParsing(false);
    setSheet(null);
    setStartRow(1);
    setMapping({ name: null, phone: null, gradeLevel: null });
    setUniformGradeLevel('');
    setPreviewRows(null);
    setPreviewing(false);
    setConfirming(false);
    setBatchId(null);
    setCreatedStudents([]);
    setExporting(false);
    setDispatching(false);
    setDispatchProgress({ sent: 0, failed: 0 });
    setDispatchDone(false);
  };

  const headerRow = sheet?.[0] ?? [];
  const bodyPreviewRows = useMemo(() => (sheet ? sheet.slice(startRow, startRow + 3) : []), [sheet, startRow]);

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const aoa = await readSheet(file);
      if (!aoa.length) {
        pushToast('error', 'الملف فارغ');
        return;
      }
      setSheet(aoa);
      const detected: Record<FieldKey, number | null> = {
        name: detectColumn(aoa[0], 'name'),
        phone: detectColumn(aoa[0], 'phone'),
        gradeLevel: detectColumn(aoa[0], 'gradeLevel'),
      };
      setMapping(detected);
      setStartRow(1);
      setStep('mapping');
    } catch {
      pushToast('error', 'تعذّر قراءة الملف، تأكد أنه ملف Excel صالح');
    } finally {
      setParsing(false);
    }
  };

  const buildRawRows = () => {
    if (!sheet) return [];
    return sheet.slice(startRow).map((r) => ({
      name: mapping.name !== null ? r[mapping.name] || '' : '',
      phone: mapping.phone !== null ? r[mapping.phone] || '' : '',
      gradeLevel: mapping.gradeLevel !== null ? r[mapping.gradeLevel] || '' : '',
    })).filter((r) => r.name || r.phone);
  };

  const runPreview = async () => {
    if (mapping.name === null) {
      pushToast('error', 'حدد عمود اسم الطالب أولاً');
      return;
    }
    if (!uniformGradeLevel && mapping.gradeLevel === null) {
      pushToast('error', 'حدد عمود المرحلة الدراسية أو طبّق مرحلة موحدة على الملف');
      return;
    }
    setPreviewing(true);
    try {
      const res = await api.post<{ rows: PreviewRow[]; total: number; validCount: number }>('/admin/students/import-preview', {
        rows: buildRawRows(),
        uniformGradeLevel: uniformGradeLevel || undefined,
      });
      setPreviewRows(res.rows);
      setStep('preview');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل تحليل الملف');
    } finally {
      setPreviewing(false);
    }
  };

  const validRows = useMemo(() => (previewRows ?? []).filter((r) => r.status === 'new'), [previewRows]);

  const confirmImport = async () => {
    if (!validRows.length) return;
    setConfirming(true);
    try {
      const res = await api.post<{ batchId: string; created: CreatedStudent[]; skipped: number }>('/admin/students/import-confirm', {
        rows: validRows.map((r) => ({ name: r.name, phone: r.phone, gradeLevel: r.gradeLevel })),
      });
      // Deliberately NOT calling loadCore() here: it flips the global
      // `loadingCore` flag, which StudentsTable uses for an early-return
      // skeleton render that unmounts its entire subtree — including this
      // modal — wiping this component's local `step`/batch state back to
      // its initial values the moment it remounts. The background refresh
      // happens once, on the explicit "إنهاء" action below, after the user
      // is done looking at this screen — never mid-flow.
      setBatchId(res.batchId);
      setCreatedStudents(res.created);
      setStep('done');
      pushToast('success', `تمت إضافة ${res.created.length} طالب في دفعة جديدة`);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل الاستيراد');
    } finally {
      setConfirming(false);
    }
  };

  const exportBatch = async () => {
    if (!batchId) return;
    setExporting(true);
    try {
      const res = await api.get<{ students: { code: string; name: string; phone: string; grade_level: string }[] }>(
        `/admin/students/export-batch/${batchId}`,
      );
      exportBatchXls(res.students);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل التصدير');
    } finally {
      setExporting(false);
    }
  };

  const dispatchWhatsapp = async () => {
    if (!batchId) return;
    setDispatching(true);
    setDispatchDone(false);
    setDispatchProgress({ sent: 0, failed: 0 });
    const poll = setInterval(async () => {
      try {
        const s = await api.get<{ sent: number; failed: number }>(`/admin/students/dispatch-status/${batchId}`);
        setDispatchProgress(s);
      } catch {
        /* ignore transient poll errors */
      }
    }, 1200);
    try {
      const res = await api.post<{ total: number; sent: number; failed: number }>(`/admin/students/whatsapp-dispatch-batch/${batchId}`);
      setDispatchProgress({ sent: res.sent, failed: res.failed });
      pushToast(res.failed > 0 ? 'error' : 'success', `تم الإرسال — نجح ${res.sent} / فشل ${res.failed} من ${res.total}`);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل إرسال رسائل الواتساب');
    } finally {
      clearInterval(poll);
      setDispatching(false);
      setDispatchDone(true);
    }
  };

  const total = createdStudents.length;
  const dispatchPct = total ? Math.min(100, Math.round(((dispatchProgress.sent + dispatchProgress.failed) / total) * 100)) : 0;

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
          <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white">استيراد ذكي للطلاب</Dialog.Title>

          {step === 'upload' && (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                ارفع ملف Excel يحتوي بيانات الطلاب — سيتم التعرف تلقائياً على أعمدة الاسم والجوال والمرحلة الدراسية، مع إمكانية المطابقة اليدوية إن لزم.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <IconDownload /> تحميل القالب
                </button>
                <button
                  type="button"
                  disabled={parsing}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  <IconUpload /> {parsing ? 'جارٍ القراءة…' : 'رفع ملف Excel'}
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
          )}

          {step === 'mapping' && sheet && (
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">صف بداية البيانات</label>
                <select
                  value={startRow}
                  onChange={(e) => setStartRow(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                >
                  {sheet.slice(0, Math.min(5, sheet.length)).map((_, i) => (
                    <option key={i} value={i + 1}>
                      البدء من الصف {i + 2} (تخطي {i + 1} صف ترويسة)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(['name', 'phone', 'gradeLevel'] as FieldKey[]).map((field) => (
                  <div key={field}>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      {field === 'name' ? 'عمود الاسم الكامل' : field === 'phone' ? 'عمود رقم الجوال' : 'عمود المرحلة الدراسية'}
                    </label>
                    <select
                      value={mapping[field] ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value === '' ? null : Number(e.target.value) }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="">— بدون —</option>
                      {headerRow.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `عمود ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/40">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">تطبيق مرحلة موحدة على كامل الملف:</span>
                {GRADE_LEVELS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setUniformGradeLevel((v) => (v === g ? '' : g))}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                      uniformGradeLevel === g
                        ? 'bg-indigo-600 text-white'
                        : 'border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300'
                    }`}
                  >
                    تطبيق {g} على كامل الملف
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-right text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                    <tr className="text-slate-500 dark:text-slate-400">
                      <th className="px-3 py-2 font-medium">الاسم</th>
                      <th className="px-3 py-2 font-medium">الجوال</th>
                      <th className="px-3 py-2 font-medium">المرحلة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bodyPreviewRows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">{mapping.name !== null ? r[mapping.name] : '—'}</td>
                        <td className="px-3 py-1.5">{mapping.phone !== null ? r[mapping.phone] || '—' : '—'}</td>
                        <td className="px-3 py-1.5">{uniformGradeLevel || (mapping.gradeLevel !== null ? r[mapping.gradeLevel] || '—' : '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400">معاينة أول 3 صفوف بعد صف البداية المحدد.</p>
            </div>
          )}

          {step === 'preview' && previewRows && (
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {previewRows.length} سجل — <span className="font-bold text-emerald-600 dark:text-emerald-400">{validRows.length} جاهز للاستيراد</span>
                  {validRows.length < previewRows.length && (
                    <span className="font-bold text-rose-600 dark:text-rose-400"> · {previewRows.length - validRows.length} مستبعد</span>
                  )}
                </span>
                <button type="button" onClick={() => setStep('mapping')} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  تعديل المطابقة
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-right text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                    <tr className="text-slate-500 dark:text-slate-400">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">الاسم</th>
                      <th className="px-3 py-2 font-medium">الجوال</th>
                      <th className="px-3 py-2 font-medium">المرحلة</th>
                      <th className="px-3 py-2 font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r) => (
                      <tr key={r.index} className={r.status !== 'new' ? 'bg-rose-50 dark:bg-rose-950/30' : ''}>
                        <td className="px-3 py-1.5 text-slate-400">{r.index + 1}</td>
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5">{r.phone || '—'}</td>
                        <td className="px-3 py-1.5">{r.gradeLevel || '—'}</td>
                        <td className="px-3 py-1.5">
                          {r.status === 'new' ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              <IconCheck /> {STATUS_LABEL[r.status]}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-rose-600 dark:text-rose-400" title={r.error}>
                              {STATUS_LABEL[r.status]}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                تم إنشاء دفعة جديدة بعدد {total} طالب بأرقام دخول جديدة.
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-right text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                    <tr className="text-slate-500 dark:text-slate-400">
                      <th className="px-3 py-2 font-medium">الاسم</th>
                      <th className="px-3 py-2 font-medium">رقم الدخول</th>
                      <th className="px-3 py-2 font-medium">الجوال</th>
                      <th className="px-3 py-2 font-medium">المرحلة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {createdStudents.map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-1.5">{s.name}</td>
                        <td className="px-3 py-1.5 font-mono">{s.code}</td>
                        <td className="px-3 py-1.5">{s.phone || '—'}</td>
                        <td className="px-3 py-1.5">{s.gradeLevel || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={exportBatch}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <IconDownload /> {exporting ? 'جارٍ التصدير…' : 'تصدير بيانات الدفعة الحالية (Excel)'}
                </button>
                <button
                  type="button"
                  disabled={dispatching}
                  onClick={dispatchWhatsapp}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <IconWhatsapp /> {dispatching ? 'جارٍ الإرسال…' : `إرسال بيانات الدخول عبر واتساب للدفعة الحالية (${total})`}
                </button>
              </div>
              {(dispatching || dispatchDone) && (
                <div className="space-y-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${dispatchPct}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    نجح {dispatchProgress.sent} · فشل {dispatchProgress.failed} من {total}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            {step === 'done' ? (
              <button
                type="button"
                onClick={() => {
                  loadCore().catch(() => {});
                  reset();
                  onOpenChange(false);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                إنهاء
              </button>
            ) : (
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  إلغاء
                </button>
              </Dialog.Close>
            )}
            {step === 'mapping' && (
              <button
                type="button"
                disabled={previewing}
                onClick={runPreview}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {previewing ? 'جارٍ التحليل…' : 'معاينة البيانات'}
              </button>
            )}
            {step === 'preview' && (
              <button
                type="button"
                disabled={confirming || validRows.length === 0}
                onClick={confirmImport}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {confirming ? 'جارٍ الاستيراد…' : `تأكيد الاستيراد (${validRows.length})`}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
