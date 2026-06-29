import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { useStore } from '../store/useStore';
import { api, ApiError } from '../lib/api';
import { resetStudentTest } from '../lib/students';
import ConfirmDialog from './ConfirmDialog';
import type { Plan, Student, GeneralTestResult } from '../types';

function planScore(p: Plan): number | null {
  const gaps = Array.isArray(p.gaps) ? p.gaps : [];
  return gaps.length ? Math.round(gaps.reduce((s, g) => s + g.pct, 0) / gaps.length) : null;
}

function levelLabel(pct: number | null): string {
  if (pct === null) return '—';
  if (pct <= 30) return 'ضعيف';
  if (pct <= 49) return 'دون المتوسط';
  if (pct <= 70) return 'متوسط';
  return 'مرتفع';
}

function levelColor(pct: number | null): string {
  if (pct === null) return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
  if (pct <= 30) return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300';
  if (pct <= 49) return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
  if (pct <= 70) return 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300';
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
}

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

  const [gtResults, setGtResults] = useState<GeneralTestResult[] | null>(null);
  const [gtTitles, setGtTitles] = useState<Record<number, string>>({});
  const [gtLoading, setGtLoading] = useState(false);

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

      setGtResults(null);
      setGtLoading(true);
      Promise.all([
        api.get<{ results: GeneralTestResult[] }>(`/general-tests/results?studentId=${encodeURIComponent(student.id)}`),
        api.get<{ tests: { test_num: number; title: string }[] }>('/general-tests'),
      ])
        .then(([resultsRes, testsRes]) => {
          setGtResults(resultsRes.results || []);
          setGtTitles(Object.fromEntries((testsRes.tests || []).map((t) => [t.test_num, t.title])));
        })
        .catch(() => setGtResults([]))
        .finally(() => setGtLoading(false));
    }
  }, [student]);

  const trendData = useMemo(() => {
    if (!history) return [];
    return [...history].reverse().map((p, i) => ({ n: i + 1, score: planScore(p) ?? 0 }));
  }, [history]);

  const gtByTest = useMemo(() => {
    const map = new Map<number, GeneralTestResult[]>();
    if (!gtResults) return map;
    for (const r of gtResults) {
      const arr = map.get(r.test_num) || [];
      arr.push(r);
      map.set(r.test_num, arr);
    }
    return map;
  }, [gtResults]);

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
      await resetStudentTest(student.id);
      pushToast('success', 'تم السماح للطالب بإعادة الاختبار');
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
                <p className="mt-1 text-xs text-slate-400">🔒 لا يمكن تعديل رقم السجل المدني من هنا</p>
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
                🔓 سماح بإعادة الاختبار
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
              <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">📋 سجل اختبارات القدرات</h3>
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
                <>
                  {trendData.length > 1 && (
                    <div className="mb-2 h-20 w-full rounded-lg border border-slate-100 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                          <XAxis dataKey="n" tick={{ fontSize: 10 }} tickFormatter={(n) => `ق${n}`} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={30} />
                          <Tooltip formatter={(v) => [`${v}%`, 'النسبة']} labelFormatter={(n) => `قدرات ${n}`} />
                          <Line type="monotone" dataKey="score" stroke="#3F7CB8" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {history.map((p, idx) => {
                      const gaps = Array.isArray(p.gaps) ? p.gaps : [];
                      const score = planScore(p);
                      const attemptNumber = history.length - idx;
                      return (
                        <div
                          key={p.id}
                          className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              قدرات {attemptNumber} — {p.status === 'active' ? 'خطة معتمدة' : 'خطة بانتظار الاعتماد'}
                            </span>
                            <span className="text-xs text-slate-400">
                              {new Date(p.created_at).toLocaleDateString('ar-SA')}
                            </span>
                          </div>
                          {score !== null && (
                            <div className="mt-1 flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${levelColor(score)}`}>
                                {score}%
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">{levelLabel(score)}</span>
                            </div>
                          )}
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
                </>
              )}
            </div>

            <div className="mt-6">
              <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">🧪 نتائج الاختبارات العامة</h3>
              {gtLoading ? (
                <div className="space-y-2">
                  <div className="skeleton h-10 rounded-lg" />
                  <div className="skeleton h-10 rounded-lg" />
                </div>
              ) : !gtByTest.size ? (
                <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400 dark:bg-slate-900">
                  لم يخض هذا الطالب أي اختبار عام بعد
                </p>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {Array.from(gtByTest.entries()).map(([testNum, attempts]) => {
                    const latest = attempts[attempts.length - 1];
                    const chartData = attempts.map((a, i) => ({ n: i + 1, score: a.score }));
                    return (
                      <div
                        key={testNum}
                        className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            {gtTitles[testNum] || `اختبار عام رقم ${testNum}`}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${levelColor(latest.score)}`}>
                            {latest.score}% ({latest.correct}/{latest.total})
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {attempts.length} {attempts.length === 1 ? 'محاولة' : 'محاولات'} — آخرها{' '}
                          {new Date(latest.created_at).toLocaleDateString('ar-SA')}
                        </div>
                        {attempts.length > 1 && (
                          <div className="mt-1 h-14 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                                <XAxis dataKey="n" tick={{ fontSize: 9 }} hide />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} width={26} />
                                <Tooltip formatter={(v) => [`${v}%`, 'النسبة']} />
                                <Line type="monotone" dataKey="score" stroke="#4FA877" strokeWidth={2} dot={{ r: 2 }} />
                              </LineChart>
                            </ResponsiveContainer>
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
        title="السماح بإعادة الاختبار؟"
        description={`سيمكن ${student.name} من إعادة الاختبار الآن دون حذف نتائجه السابقة.`}
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
