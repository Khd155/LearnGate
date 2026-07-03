import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useStore } from '../store/useStore';
import { api, ApiError } from '../lib/api';
import { resetStudentTest } from '../lib/students';
import ConfirmDialog from './ConfirmDialog';
import type { Plan, Student, PlanGap } from '../types';

function planScore(p: Plan): number | null {
  const gaps = Array.isArray(p.gaps) ? p.gaps : [];
  return gaps.length ? Math.round(gaps.reduce((s, g) => s + (g as PlanGap).pct, 0) / gaps.length) : null;
}

function cooldownDays(gaps: PlanGap[]): number {
  return gaps.reduce((t, g) => t + (g.pct <= 30 ? 3 : g.pct <= 49 ? 2 : g.pct <= 70 ? 1 : 0), 0);
}

function daysRemaining(plan: Plan): number {
  const gaps: PlanGap[] = Array.isArray(plan.gaps) ? (plan.gaps as PlanGap[]) : [];
  const isOverridden = typeof plan.admin_note === 'string' && plan.admin_note.startsWith('OVERRIDE:');
  if (isOverridden) return 0;
  const until = new Date(plan.created_at);
  until.setDate(until.getDate() + cooldownDays(gaps));
  return Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86400000));
}

function levelColor(pct: number | null): string {
  if (pct === null) return 'bg-slate-100 text-slate-500';
  if (pct <= 30) return 'bg-rose-100 text-rose-700';
  if (pct <= 49) return 'bg-amber-100 text-amber-700';
  if (pct <= 70) return 'bg-sky-100 text-sky-700';
  return 'bg-emerald-100 text-emerald-700';
}

function BarRow({ label, pct }: { label: string; pct: number }) {
  const barColor =
    pct <= 30 ? 'bg-rose-500' : pct <= 49 ? 'bg-amber-400' : pct <= 70 ? 'bg-sky-400' : 'bg-emerald-500';
  const textColor = pct <= 49 ? 'text-rose-600' : 'text-slate-600';
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-36 shrink-0 text-sm text-slate-700 dark:text-slate-200 truncate">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" style={{ height: 8 }}>
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-10 text-right text-sm font-bold ${textColor} dark:text-slate-300`}>{pct}%</span>
    </div>
  );
}

// ── Second popup: full skill breakdown for one plan ──────────────────────────
function PlanDetailDialog({
  plan,
  index,
  onClose,
}: {
  plan: Plan;
  index: number;
  onClose: () => void;
}) {
  const gaps: PlanGap[] = Array.isArray(plan.gaps) ? (plan.gaps as PlanGap[]) : [];
  const verbal = gaps.filter((g) => g.category === 'verbal');
  const quant = gaps.filter((g) => g.category === 'quantitative');
  const score = planScore(plan);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/50 animate-overlay-in" />
        <Dialog.Content className="fixed inset-0 z-[81] m-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
          <Dialog.Title className="flex items-center gap-3 text-base font-bold text-slate-900 dark:text-white">
            <span>📊 قدرات {index}</span>
            {score !== null && (
              <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${levelColor(score)}`}>{score}%</span>
            )}
            <span className="mr-auto text-xs font-normal text-slate-400">
              {new Date(plan.created_at).toLocaleDateString('ar-SA')}
            </span>
          </Dialog.Title>

          <div className="mt-5 space-y-5">
            {verbal.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">📚</span>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">لفظي</h4>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                    {verbal.length} مهارة
                  </span>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-2 dark:bg-slate-900">
                  {verbal.map((g, i) => (
                    <BarRow key={i} label={g.skillName} pct={g.pct} />
                  ))}
                </div>
              </div>
            )}

            {quant.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">🔢</span>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">كمي</h4>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                    {quant.length} مهارة
                  </span>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-2 dark:bg-slate-900">
                  {quant.map((g, i) => (
                    <BarRow key={i} label={g.skillName} pct={g.pct} />
                  ))}
                </div>
              </div>
            )}

            {gaps.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">لا توجد بيانات مهارات لهذه المحاولة</p>
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
  );
}

// ── Main component ───────────────────────────────────────────────────────────
interface Props {
  student: Student | null;
  onOpenChange: (open: boolean) => void;
  onMessage: (student: Student) => void;
}

export default function StudentModal({ student, onOpenChange, onMessage }: Props) {
  const updateStudent = useStore((s) => s.updateStudent);
  const removeStudent = useStore((s) => s.removeStudent);
  const pushToast = useStore((s) => s.pushToast);
  const session = useStore((s) => s.session);

  const canSendWhatsapp =
    session?.role === 'dev' || !!session?.permissions?.includes('send_whatsapp');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [waSending, setWaSending] = useState(false);

  const [history, setHistory] = useState<Plan[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Second-level popup state
  const [detailPlan, setDetailPlan] = useState<{ plan: Plan; index: number } | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!student) return;
    setName(student.name);
    setPhone(student.phone || '');
    setHistory(null);
    setDetailPlan(null);
    setHistoryLoading(true);
    api
      .get<{ plans: Plan[] }>(`/plans/history?studentId=${encodeURIComponent(student.id)}`)
      .then((res) => setHistory(res.plans || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [student]);

  const changed = useMemo(() => {
    if (!student) return {};
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
      await resetStudentTest(student.id);
      pushToast('success', 'تم السماح للطالب بإعادة الاختبار');
      setResetOpen(false);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل إعادة تعيين الاختبار');
    } finally {
      setResetting(false);
    }
  };

  const deletePlan = async (planId: string) => {
    setDeletingPlanId(planId);
    try {
      await api.delete(`/plans/${planId}`);
      setHistory((prev) => prev ? prev.filter((p) => p.id !== planId) : prev);
      pushToast('success', 'تم حذف الاختبار');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل حذف الاختبار');
    } finally {
      setDeletingPlanId(null);
    }
  };

  const sendWa = async () => {
    if (!student.phone) { pushToast('error', 'الطالب ليس لديه رقم جوال'); return; }
    setWaSending(true);
    try {
      const phone = student.phone.startsWith('+') ? student.phone : '+966' + student.phone.replace(/^0/, '');
      await api.post('/sendpulse/send', {
        phones: [phone],
        template_name: 'test_1',
        language_code: 'ar',
        components: [{ type: 'body', parameters: [{ type: 'text', text: student.name }] }],
      });
      pushToast('success', `تم إرسال الواتساب لـ ${student.name} ✅`);
    } catch (e) {
      pushToast('error', e instanceof ApiError ? e.message : 'تعذّر الإرسال');
    } finally {
      setWaSending(false);
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
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 animate-overlay-in" />
          <Dialog.Content className="fixed inset-0 z-[61] m-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white">بيانات الطالب</Dialog.Title>

            {/* ── Edit fields ── */}
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
                  رقم الدخول
                </label>
                <input
                  value={student.code}
                  disabled
                  readOnly
                  className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 font-mono text-sm text-slate-500 outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400"
                />
                <p className="mt-1 text-xs text-slate-400">🔒 لا يمكن تعديل رقم الدخول من هنا</p>
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

            {/* ── Action buttons ── */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => onMessage(student)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                📩 رسالة
              </button>
              {canSendWhatsapp && (
                <button
                  type="button"
                  disabled={waSending || !student.phone}
                  onClick={sendWa}
                  title={!student.phone ? 'لا يوجد رقم جوال' : 'إرسال واتساب ترحيبي'}
                  className="rounded-xl border border-emerald-200 px-3 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:border-emerald-700 dark:text-emerald-400"
                >
                  {waSending ? '…' : '📲 واتساب'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                className="rounded-xl border border-amber-200 px-3 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
              >
                🔓 إعادة الاختبار
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400"
              >
                🗑️ حذف
              </button>
            </div>

            {/* ── Plans history ── */}
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-300">📋 سجل اختبارات القدرات</h3>

              {historyLoading ? (
                <div className="space-y-2">
                  <div className="skeleton h-12 rounded-xl" />
                  <div className="skeleton h-12 rounded-xl" />
                  <div className="skeleton h-12 rounded-xl" />
                </div>
              ) : !history?.length ? (
                <p className="rounded-xl bg-slate-50 px-3 py-5 text-center text-sm text-slate-400 dark:bg-slate-900">
                  لا يوجد نشاط مسجّل لهذا الطالب
                </p>
              ) : (
                <div className="space-y-2">
                  {history.map((p, idx) => {
                    const score = planScore(p);
                    const attemptNumber = history.length - idx;
                    const gaps: PlanGap[] = Array.isArray(p.gaps) ? (p.gaps as PlanGap[]) : [];
                    const hasSkills = gaps.length > 0;

                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                      >
                        {/* Attempt label */}
                        <span className="min-w-[72px] text-sm font-semibold text-slate-700 dark:text-slate-200">
                          قدرات {attemptNumber}
                        </span>

                        {/* Date */}
                        <span className="flex-1 text-xs text-slate-400">
                          {new Date(p.created_at).toLocaleDateString('ar-SA')}
                        </span>

                        {/* Score badge */}
                        {score !== null ? (
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${levelColor(score)}`}>
                            {score}%
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs text-slate-400 dark:bg-slate-700">
                            لم يكتمل
                          </span>
                        )}

                        {/* View button */}
                        {hasSkills && (
                          <button
                            type="button"
                            onClick={() => setDetailPlan({ plan: p, index: attemptNumber })}
                            className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                          >
                            👁 عرض
                          </button>
                        )}

                        {/* Delete button */}
                        <button
                          type="button"
                          disabled={deletingPlanId === p.id}
                          onClick={() => {
                            if (confirm(`حذف اختبار قدرات ${attemptNumber}؟ لا يمكن التراجع عن هذا الإجراء.`))
                              deletePlan(p.id);
                          }}
                          className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-40 dark:bg-rose-950/40 dark:text-rose-400"
                        >
                          {deletingPlanId === p.id ? '…' : '🗑'}
                        </button>
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

      {/* ── Second-level popup: skill detail ── */}
      {detailPlan && (
        <PlanDetailDialog
          plan={detailPlan.plan}
          index={detailPlan.index}
          onClose={() => setDetailPlan(null)}
        />
      )}

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="السماح بإعادة الاختبار؟"
        description={(() => {
          const latestPlan = history?.[0];
          const rem = latestPlan ? daysRemaining(latestPlan) : 0;
          if (rem > 0) {
            return `⏳ باقي على ${student.name} ${rem} ${rem === 1 ? 'يوم' : 'أيام'} من فترة الانتظار.\nهل تريد السماح له بإعادة الاختبار الآن قبل انتهاء المدة؟`;
          }
          return `سيمكن ${student.name} من إعادة الاختبار الآن دون حذف نتائجه السابقة.`;
        })()}
        confirmLabel="سماح"
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
