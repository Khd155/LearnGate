import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useStore } from '../store/useStore';
import { api, ApiError } from '../lib/api';
import { resetStudentTest } from '../lib/students';
import ConfirmDialog from './ConfirmDialog';
import type { Plan, Student } from '../types';

interface Props {
  student: Student | null;
  onOpenChange: (open: boolean) => void;
  onMessage: (student: Student) => void;
}

export default function StudentModal({ student, onOpenChange, onMessage }: Props) {
  const updateStudent = useStore((s) => s.updateStudent);
  const removeStudent = useStore((s) => s.removeStudent);
  const pushToast = useStore((s) => s.pushToast);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [history, setHistory] = useState<Plan[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (student) {
      setName(student.name);
      setCode(student.code);
      setPhone(student.phone || '');
      setHistory(null);
      setHistoryLoading(true);
      api
        .get<{ plans: Plan[] }>(`/plans/history?studentId=${encodeURIComponent(student.id)}`)
        .then((res) => setHistory(res.plans || []))
        .catch(() => setHistory([]))
        .finally(() => setHistoryLoading(false));
    }
  }, [student]);

  const changed = useMemo(() => {
    if (!student) return {};
    // code/national-ID is intentionally excluded here — only the dev panel may change it;
    // the admin dashboard can only edit name/phone (enforced server-side too).
    const patch: Partial<Pick<Student, 'name' | 'phone'>> = {};
    if (name.trim() !== student.name) patch.name = name.trim();
    if (phone.trim() !== (student.phone || '')) patch.phone = phone.trim();
    return patch;
  }, [student, name, phone]);

  if (!student) return null;

  const save = async () => {
    if (!Object.keys(changed).length) {
      pushToast('success', 'لا توجد تغييرات لحفظها');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/students/${student.id}`, changed);
      updateStudent(student.id, changed);
      pushToast('success', 'تم حفظ التعديلات');
    } catch (e) {
      pushToast('error', e instanceof ApiError ? e.message : 'فشل حفظ التعديلات');
    } finally {
      setSaving(false);
    }
  };

  const doReset = async () => {
    setResetting(true);
    try {
      const res = await resetStudentTest(student.id);
      pushToast('success', `تمت إعادة تعيين الاختبار (${res.deleted} سجل)`);
      setResetOpen(false);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل إعادة تعيين الاختبار');
    } finally {
      setResetting(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/students/${student.id}`);
      removeStudent(student.id);
      pushToast('success', 'تم حذف الطالب');
      setDeleteOpen(false);
      onOpenChange(false);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل حذف الطالب');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog.Root open={!!student} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 animate-fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl animate-fade-in dark:bg-slate-800">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white">بيانات الطالب</Dialog.Title>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">الاسم</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  رقم السجل المدني
                </label>
                <input
                  value={code}
                  disabled
                  readOnly
                  className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 font-mono text-sm text-slate-500 outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400"
                  inputMode="numeric"
                />
                <p className="mt-1 text-xs text-slate-400">🔒 تعديل رقم السجل المدني متاح فقط من لوحة المطوّر</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">الجوال</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={save}
                disabled={saving || !Object.keys(changed).length}
                className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'جارٍ الحفظ…' : '💾 حفظ التعديلات'}
              </button>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onMessage(student)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                📩 رسالة
              </button>
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                className="rounded-xl border border-amber-200 px-3 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/50"
              >
                🔁 إعادة الاختبار
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/50"
              >
                🗑️ حذف
              </button>
            </div>

            <div className="mt-6">
              <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">📋 نشاط الطالب</h3>
              {historyLoading ? (
                <div className="space-y-2">
                  <div className="skeleton h-10 rounded-lg" />
                  <div className="skeleton h-10 rounded-lg" />
                </div>
              ) : !history?.length ? (
                <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400 dark:bg-slate-900">
                  لا يوجد نشاط مسجّل لهذا الطالب
                </p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {history.map((p) => {
                    const gaps = Array.isArray(p.gaps) ? p.gaps : [];
                    return (
                      <div
                        key={p.id}
                        className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            {p.status === 'active' ? 'خطة معتمدة' : 'خطة بانتظار الاعتماد'}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(p.created_at).toLocaleDateString('ar-SA')}
                          </span>
                        </div>
                        {gaps.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {gaps.slice(0, 6).map((g, i) => (
                              <span
                                key={i}
                                className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                              >
                                {g.skillName} ({g.pct}%)
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
                aria-label="إغلاق"
              >
                ✕
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="إعادة تعيين الاختبار؟"
        description={`سيتم حذف جميع نتائج اختبار ${student.name} السابقة، ويمكنه إعادة الاختبار من جديد.`}
        confirmLabel="إعادة التعيين"
        loading={resetting}
        onConfirm={doReset}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف الطالب؟"
        description={`سيتم حذف ${student.name} نهائياً من النظام. هذا الإجراء لا يمكن التراجع عنه.`}
        confirmLabel="حذف"
        danger
        loading={deleting}
        onConfirm={doDelete}
      />
    </>
  );
}
