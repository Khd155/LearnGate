import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { testStatusColor, testStatusLabel } from '../lib/status';
import type { Plan, PlanGap } from '../types';

function planScore(p: Plan): number | null {
  const gaps = Array.isArray(p.gaps) ? (p.gaps as PlanGap[]) : [];
  return gaps.length ? Math.round(gaps.reduce((s, g) => s + g.pct, 0) / gaps.length) : null;
}

interface QuizSkillEntry {
  quizSkillId: string;
  skillId: string;
  skillName: string;
  status: 'not_started' | 'passed' | 'failed' | string;
  bestCorrect: number;
  bestTotal: number;
  attempts: number;
  hasQuestions: boolean;
}
interface QuizLevelEntry {
  level: 'easy' | 'medium' | 'advanced';
  locked: boolean;
  progressPct: number;
  skills: QuizSkillEntry[];
}
interface QuizStructureTree {
  verbal: QuizLevelEntry[];
  quantitative: QuizLevelEntry[];
}

const LEVEL_LABEL: Record<string, string> = { easy: 'المستوى الأول — سهل', medium: 'المستوى الثاني — متوسط', advanced: 'المستوى الثالث — متقدم' };
const SECTION_LABEL: Record<string, string> = { verbal: 'القسم اللفظي', quantitative: 'القسم الكمي' };

// GET /api/analytics/student-logs?studentId= — replaces the old placeholder
// note explaining that no such API existed. School-scoped server-side via
// the same _resolveTargetStudentId() authorization GET /api/journey uses.
interface ActivityLogEntry { id: string; level: string; category: string; message: string; created_at: string }
const LOG_CATEGORY_ICON: Record<string, string> = {
  login: '🔓', plan: '📋', 'quiz-skills': '🧩', questions: '📝',
  ticket: '🎫', message: '💬', broadcast: '📣', settings: '⚙️',
};

// Mirrors GET /api/journey — same shape computeJourney() in
// functions/_lib/journey.js returns, plus the raw `tree` the route handler
// attaches alongside it. This is the SAME endpoint the student's own "مسار
// الإنجاز" home screen calls, so the admin view can never disagree with what
// the student sees.
interface JourneySkillRef { quizSkillId: string; skillId: string; skillName: string; section: string; level: string; bestCorrect: number; bestTotal: number; attempts: number }
interface JourneyNextAction { type: string; label: string; detail?: string; section?: string; level?: string; quizSkillId?: string }
interface JourneySkillSummary { skillId: string; skillName: string; section: string; pct: number }
interface Journey {
  diagnostic: { done: boolean; gaps: PlanGap[] | null };
  overallProgressPct: number;
  passedNodes: number;
  totalNodes: number;
  sections: { verbal: { passed: number; total: number; progressPct: number }; quantitative: { passed: number; total: number; progressPct: number } };
  stage: string;
  stageLabel: string;
  nextAction: JourneyNextAction;
  needsReview: JourneySkillRef[];
  strongest: JourneySkillSummary | null;
  weakest: JourneySkillSummary | null;
  health: { healthScore: number; activityScore: number; performanceScore: number; improvementScore: number; lastActive: string | null } | null;
  finalMock: { available: boolean; attempted: boolean; attempts?: number; bestScore?: number | null; title?: string } | null;
  badge: { code: string; label: string } | null;
  tree: QuizStructureTree;
}

function levelColor(pct: number | null): string {
  if (pct === null) return 'bg-slate-100 text-slate-500';
  if (pct <= 30) return 'bg-rose-100 text-rose-700';
  if (pct <= 49) return 'bg-amber-100 text-amber-700';
  if (pct <= 70) return 'bg-sky-100 text-sky-700';
  return 'bg-emerald-100 text-emerald-700';
}

const card = 'rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900';

export default function StudentProfilePage() {
  const profileStudentId = useStore((s) => s.profileStudentId);
  const students = useStore((s) => s.students);
  const testResults = useStore((s) => s.testResults);
  const statusOf = useStore((s) => s.statusOf);
  const setTab = useStore((s) => s.setTab);
  const setConversationFocusStudentId = useStore((s) => s.setConversationFocusStudentId);
  const threads = useStore((s) => s.threads);
  const loadThreads = useStore((s) => s.loadThreads);
  const messagesByStudent = useStore((s) => s.messagesByStudent);
  const messagesLoading = useStore((s) => s.messagesLoading);
  const loadMessages = useStore((s) => s.loadMessages);
  const sendMessage = useStore((s) => s.sendMessage);

  const student = useMemo(() => students.find((s) => s.id === profileStudentId) || null, [students, profileStudentId]);

  const [history, setHistory] = useState<Plan[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // GET /api/journey?studentId= — the same endpoint the student's own home
  // screen calls; replaces the old standalone GET /api/quiz-structure fetch
  // (the tree is now attached to the journey response, so this is one fetch
  // instead of two, and the admin view is guaranteed to match what the
  // student sees rather than deriving its own progress reading).
  const [journey, setJourney] = useState<Journey | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyError, setJourneyError] = useState(false);
  // Which level's skills are expanded per section — accordion, one open
  // level per section at a time, defaulting to wherever the student's own
  // journey next-action points (falls back to the first reachable
  // incomplete level once the journey response arrives; see the effect below).
  const [openLevel, setOpenLevel] = useState<Record<'verbal' | 'quantitative', string>>({ verbal: 'easy', quantitative: 'easy' });
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  useEffect(() => {
    if (!profileStudentId) return;
    setHistory(null);
    setHistoryLoading(true);
    api
      .get<{ plans: Plan[] }>(`/plans/history?studentId=${encodeURIComponent(profileStudentId)}`)
      .then((res) => setHistory(res.plans || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
    loadMessages(profileStudentId);

    setJourney(null);
    setJourneyError(false);
    setJourneyLoading(true);
    api
      .get<{ journey: Journey }>(`/journey?studentId=${encodeURIComponent(profileStudentId)}`)
      .then((res) => setJourney(res.journey))
      .catch(() => setJourneyError(true))
      .finally(() => setJourneyLoading(false));

    setActivityLogs(null);
    setActivityLoading(true);
    api
      .get<{ logs: ActivityLogEntry[] }>(`/analytics/student-logs?studentId=${encodeURIComponent(profileStudentId)}`)
      .then((res) => setActivityLogs(res.logs || []))
      .catch(() => setActivityLogs([]))
      .finally(() => setActivityLoading(false));
  }, [profileStudentId, loadMessages]);

  // Default accordion state: open whichever level the journey's own
  // next-best-action points to for each section, or — once that section is
  // fully done, or before any action is known — the first unlocked,
  // not-yet-complete level; falls back to "easy" if nothing qualifies.
  useEffect(() => {
    if (!journey?.tree) return;
    const next: Record<'verbal' | 'quantitative', string> = { verbal: 'easy', quantitative: 'easy' };
    for (const section of ['verbal', 'quantitative'] as const) {
      if (journey.nextAction.section === section && journey.nextAction.level) {
        next[section] = journey.nextAction.level;
        continue;
      }
      const active = journey.tree[section].find((l) => !l.locked && l.progressPct < 100);
      next[section] = active?.level ?? journey.tree[section][journey.tree[section].length - 1]?.level ?? 'easy';
    }
    setOpenLevel(next);
  }, [journey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [profileStudentId]);

  if (!student) {
    return (
      <div className={card}>
        <p className="text-sm text-slate-500">تعذّر إيجاد بيانات هذا الطالب.</p>
        <button
          type="button"
          onClick={() => setTab('students')}
          className="mt-3 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          ← العودة لقائمة الطلاب
        </button>
      </div>
    );
  }

  const status = statusOf(student.id);
  const colors = testStatusColor(status);

  // Trajectory: chronological attempts oldest → newest (history comes newest-first)
  const attemptsAsc = [...(history || [])].reverse();
  const trajectory = attemptsAsc
    .map((p, i) => ({ index: i + 1, score: planScore(p), date: p.created_at }))
    .filter((t) => t.score !== null);
  const firstScore = trajectory[0]?.score ?? null;
  const lastScore = trajectory[trajectory.length - 1]?.score ?? null;
  const improvement = firstScore !== null && lastScore !== null ? lastScore - firstScore : null;

  const latestGeneralTests = testResults
    .filter((t) => t.student_id === student.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const thread = threads.find((t) => t.student_id === student.id);
  const messages = messagesByStudent[student.id] || [];

  const handleSend = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await sendMessage(student.id, draft.trim());
      setDraft('');
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch {
      /* toast already pushed */
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setTab('students')}
          className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          → العودة للطلاب
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setConversationFocusStudentId(student.id);
              setTab('conversations');
            }}
            className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
          >
            💬 فتح المحادثة الكاملة
          </button>
        </div>
      </div>

      {/* Zone: basic info */}
      <div className={cn(card, 'flex flex-wrap items-center gap-x-8 gap-y-3')}>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{student.name}</h2>
          <p className="text-sm text-slate-400">
            {student.school || '—'} · رقم الدخول <span className="font-mono">{student.code}</span> · {student.phone || 'بدون جوال'}
          </p>
        </div>
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', colors.bg, colors.text)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', colors.dot)} />
          {testStatusLabel(status)}
        </span>
        {improvement !== null && (
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-bold',
              improvement > 0
                ? 'bg-emerald-100 text-emerald-700'
                : improvement < 0
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-slate-100 text-slate-600',
            )}
          >
            {improvement > 0 ? '▲' : improvement < 0 ? '▼' : '—'} تحسّن {improvement > 0 ? '+' : ''}{improvement}% منذ أول محاولة
          </span>
        )}
        <span className="text-xs text-slate-400">عضو منذ {new Date(student.created_at).toLocaleDateString('ar-SA')}</span>
      </div>

      {/* مسار الإنجاز — same GET /api/journey the student's own home screen
          renders, so what the admin sees here can never disagree with what
          the student sees. */}
      <div className={card}>
        <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">🧭 مسار الإنجاز</h3>
        {journeyLoading ? (
          <div className="skeleton h-24 rounded-xl" />
        ) : journeyError || !journey ? (
          <p className="py-4 text-sm text-slate-400">تعذّر تحميل مسار الإنجاز لهذا الطالب.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col items-center justify-center rounded-full border-4 border-indigo-100 dark:border-indigo-950" style={{ width: 64, height: 64 }}>
                <span className="text-lg font-extrabold text-indigo-600 dark:text-indigo-300">{journey.overallProgressPct}%</span>
              </div>
              <div className="min-w-[160px] flex-1">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{journey.stageLabel}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {journey.passedNodes}/{journey.totalNodes} مهارة مكتملة · اللفظي {journey.sections.verbal.progressPct}% · الكمي {journey.sections.quantitative.progressPct}%
                </p>
              </div>
              {journey.health && (
                <div className="text-center">
                  <p className={cn('text-lg font-extrabold', journey.health.healthScore >= 70 ? 'text-emerald-600 dark:text-emerald-400' : journey.health.healthScore >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')}>
                    {journey.health.healthScore}
                  </p>
                  <p className="text-[11px] text-slate-400">مؤشر الجاهزية</p>
                </div>
              )}
              {journey.badge && (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  🏆 {journey.badge.label}
                </span>
              )}
            </div>

            {!journey.diagnostic.done ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">لم يبدأ الطالب التشخيص الذاتي بعد.</p>
            ) : journey.nextAction.type !== 'done' && (
              <div className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs dark:bg-indigo-950/60">
                <span className="font-bold text-indigo-600 dark:text-indigo-300">الخطوة التالية:</span>
                <span className="text-slate-700 dark:text-slate-200">{journey.nextAction.label}</span>
              </div>
            )}

            {(journey.strongest || journey.weakest) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {journey.strongest && (
                  <p className="rounded-xl border border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
                    💪 أقوى مهارة: <b className="text-slate-700 dark:text-slate-200">{journey.strongest.skillName}</b> — <span className="font-bold text-emerald-600 dark:text-emerald-400">{journey.strongest.pct}%</span>
                  </p>
                )}
                {journey.weakest && (
                  <p className="rounded-xl border border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
                    🎯 تحتاج تركيز: <b className="text-slate-700 dark:text-slate-200">{journey.weakest.skillName}</b> — <span className="font-bold text-rose-600 dark:text-rose-400">{journey.weakest.pct}%</span>
                  </p>
                )}
              </div>
            )}

            {journey.needsReview.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold text-rose-600 dark:text-rose-400">🔴 يحتاج مراجعة ({journey.needsReview.length})</p>
                <div className="flex flex-wrap gap-2">
                  {journey.needsReview.map((r) => (
                    <span key={r.quizSkillId} className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                      {r.skillName} ({r.bestCorrect}/{r.bestTotal})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          {/* Trajectory */}
          <div className={card}>
            <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">📈 مسار التحسّن (مقارنة ذاتية بين المحاولات)</h3>
            {trajectory.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">لا توجد محاولات مكتملة بعد لعرض المسار</p>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {trajectory.map((t, i) => (
                  <div key={i} className="flex shrink-0 items-center gap-2">
                    <div className="flex flex-col items-center">
                      <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', levelColor(t.score))}>{t.score}%</span>
                      <span className="mt-1 text-[10px] text-slate-400">قدرات {t.index}</span>
                    </div>
                    {i < trajectory.length - 1 && <span className="text-slate-300">→</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All attempts (diagnostic full history) */}
          <div className={card}>
            <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">📋 كل محاولات الاختبار التشخيصي (اختبار القدرات)</h3>
            {historyLoading ? (
              <div className="space-y-2">
                <div className="skeleton h-12 rounded-xl" />
                <div className="skeleton h-12 rounded-xl" />
              </div>
            ) : !history?.length ? (
              <p className="py-6 text-center text-sm text-slate-400">لا يوجد نشاط مسجّل لهذا الطالب</p>
            ) : (
              <div className="space-y-2">
                {history.map((p, idx) => {
                  const score = planScore(p);
                  const attemptNumber = history.length - idx;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <span className="min-w-[72px] text-sm font-semibold text-slate-700 dark:text-slate-200">قدرات {attemptNumber}</span>
                      <span className="flex-1 text-xs text-slate-400">{new Date(p.created_at).toLocaleString('ar-SA')}</span>
                      {score !== null ? (
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', levelColor(score))}>{score}%</span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs text-slate-400 dark:bg-slate-700">لم يكتمل</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* General/quiz tests */}
          {latestGeneralTests.length > 0 && (
            <div className={card}>
              <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">🧪 نتائج الاختبارات القصيرة</h3>
              <div className="space-y-2">
                {latestGeneralTests.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <span className="flex-1 text-xs text-slate-400">{new Date(t.created_at).toLocaleString('ar-SA')}</span>
                    <span className="text-slate-600 dark:text-slate-300">{t.correct}/{t.total}</span>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', levelColor(t.score))}>{Math.round(t.score)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quiz-skills (short quizzes) progress — per-skill, fraction not percentage.
              Reads the same tree the journey summary card above uses (one fetch). */}
          <div className={card}>
            <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">🧩 مؤشرات الاختبارات القصيرة (تقدّم كل مهارة بكل مستوى)</h3>
            {journeyLoading ? (
              <div className="space-y-2">
                <div className="skeleton h-12 rounded-xl" />
                <div className="skeleton h-12 rounded-xl" />
              </div>
            ) : journeyError || !journey ? (
              <p className="py-4 text-sm text-slate-400">تعذّر تحميل بيانات الاختبارات القصيرة لهذا الطالب.</p>
            ) : (
              <div className="space-y-5">
                {(['verbal', 'quantitative'] as const).map((section) => (
                  <div key={section}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{SECTION_LABEL[section]}</p>
                    <div className="space-y-2">
                      {journey.tree[section].map((lvl) => {
                        const isOpen = !lvl.locked && openLevel[section] === lvl.level;
                        return (
                          <div key={lvl.level} className="rounded-xl border border-slate-100 dark:border-slate-800">
                            <button
                              type="button"
                              disabled={lvl.locked}
                              onClick={() => setOpenLevel((prev) => ({ ...prev, [section]: prev[section] === lvl.level ? '' : lvl.level }))}
                              className={cn(
                                'flex w-full items-center justify-between px-3 py-2 text-start',
                                lvl.locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                                isOpen && 'border-b border-slate-100 dark:border-slate-800',
                              )}
                            >
                              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                {LEVEL_LABEL[lvl.level]} {lvl.locked && <span className="ms-1 text-slate-400">🔒</span>}
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">{lvl.progressPct}% مكتمل</span>
                                {!lvl.locked && <span className={cn('text-[10px] text-slate-400 transition-transform', isOpen && 'rotate-180')}>▾</span>}
                              </span>
                            </button>
                            {isOpen && (
                              <div className="grid grid-cols-1 gap-1.5 p-3 sm:grid-cols-2">
                                {lvl.skills.map((sk) => (
                                  <div key={sk.quizSkillId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs dark:bg-slate-900/60">
                                    <span className="text-slate-600 dark:text-slate-300">{sk.skillName}</span>
                                    {sk.status === 'not_started' ? (
                                      <span className="text-slate-400">لم تبدأ</span>
                                    ) : (
                                      <span className={cn('font-bold', sk.status === 'passed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                                        {sk.bestCorrect}/{sk.bestTotal}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity timeline — GET /api/analytics/student-logs, school-scoped */}
          <div className={card}>
            <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">🕒 سجل النشاط</h3>
            {activityLoading ? (
              <div className="space-y-2">
                <div className="skeleton h-10 rounded-xl" />
                <div className="skeleton h-10 rounded-xl" />
              </div>
            ) : !activityLogs?.length ? (
              <p className="py-6 text-center text-sm text-slate-400">لا يوجد نشاط مسجّل لهذا الطالب بعد</p>
            ) : (
              <ul className="space-y-2">
                {activityLogs.map((log) => (
                  <li key={log.id} className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/60">
                    <span className="mt-0.5 shrink-0">{LOG_CATEGORY_ICON[log.category] || '•'}</span>
                    <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">{log.message}</span>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {new Date(log.created_at).toLocaleString('ar-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Inline messages panel */}
        <div className={cn(card, 'flex h-[560px] flex-col p-0')}>
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">💬 المحادثة</h3>
            {thread ? (
              <p className="text-[11px] text-slate-400">
                آخر رسالة {new Date(thread.last_at).toLocaleString('ar-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400">لا توجد محادثة سابقة مع هذا الطالب</p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {messagesLoading ? (
              <div className="space-y-2">
                <div className="skeleton h-10 w-2/3 rounded-xl" />
                <div className="skeleton ms-auto h-10 w-1/2 rounded-xl" />
              </div>
            ) : messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">لا توجد رسائل بعد</p>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className={cn('flex', m.sender_type === 'admin' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                        m.sender_type === 'admin'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
                      )}
                    >
                      <p>{m.body}</p>
                      <p className={cn('mt-1 flex items-center gap-1 text-[10px] opacity-70', m.sender_type === 'admin' ? 'justify-end text-indigo-100' : 'text-slate-400')}>
                        <span>{new Date(m.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
                        {m.sender_type === 'admin' && (
                          <span title={m.is_read ? 'قرأها الطالب' : 'لم يقرأها الطالب بعد'}>
                            {m.is_read ? (
                              <svg width="14" height="10" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1 5.5 4.5 9 11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M5.5 5.5 9 9 15.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            ) : (
                              <svg width="12" height="10" viewBox="0 0 13 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1 5.5 4.5 9 11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="اكتب رسالة…"
              maxLength={2000}
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {sending ? '…' : 'إرسال'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
