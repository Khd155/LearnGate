import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';
import RadialGauge from './RadialGauge';

interface AtRiskStudent {
  id: string; name: string; school: string;
  lastActive: string | null; daysSinceActive: number | null;
  lastScore: number | null; improvementPct: number | null; reasons: string[];
}
interface AtRiskRes {
  total: number; shown: number;
  inactive_count: number; low_performance_count: number; no_improvement_count: number;
  students: AtRiskStudent[];
  neverStarted: { count: number; students: { id: string; name: string; school: string }[] };
}
interface ActivityBucket { count: number; students: { id: string; name: string; lastActive: string | null }[] }
interface ActivityRes { active: ActivityBucket; medium: ActivityBucket; inactive: ActivityBucket }
interface ProgressStudent { id: string; name: string; school: string; firstScore: number; lastScore: number; improvementPct: number; attempts: number; classification: 'improving' | 'stable' | 'declining' }
interface ProgressRes { total: number; improving: number; stable: number; declining: number; students: ProgressStudent[] }
interface SkillRow { skillId: string; skillName: string; avgPct: number; sampleSize: number }
interface SkillsRes { skills: SkillRow[]; weakest: SkillRow[] }
interface HealthStudent { id: string; name: string; school: string; healthScore: number; activityScore: number; performanceScore: number; improvementScore: number }
interface HealthRes { students: HealthStudent[] }
interface EngagedStudent { id: string; name: string; school: string; skillsTouched: number; totalAttempts: number; passedCount: number; lastAttemptAt: string | null; coveragePct: number }
interface QuizEngagementRes { totalStudents: number; participants: number; participationRate: number; totalSkills: number; topEngaged: EngagedStudent[] }

// GET /api/analytics/journey-overview — same passed/totalNodes math as a
// student's own GET /api/journey, aggregated across the whole (school-scoped)
// roster in one grouped query. Powers "توزيع الطلاب حسب التقدم" below.
interface ProgressBucket { code: string; label: string; count: number }
interface LevelCompletion { section: 'verbal' | 'quantitative'; level: 'easy' | 'medium' | 'advanced'; totalSkills: number; studentsCompleted: number; completionRate: number }
interface TopProgressingStudent { id: string; name: string; school: string; passedNodes: number; totalNodes: number; overallProgressPct: number }
interface JourneyOverviewRes {
  totalStudents: number; totalNodes: number; diagnosticCompleted: number; finalMockAttempted: number;
  buckets: ProgressBucket[]; levelCompletion: LevelCompletion[]; topProgressing: TopProgressingStudent[];
}

const BUCKET_STYLE: Record<string, { chip: string; bar: string }> = {
  advanced:       { chip: '🟢', bar: 'bg-emerald-500' },
  on_track:       { chip: '🟡', bar: 'bg-amber-400' },
  needs_support:  { chip: '🟠', bar: 'bg-orange-500' },
  stalled:        { chip: '🔴', bar: 'bg-rose-500' },
  not_started:    { chip: '⚪', bar: 'bg-slate-300 dark:bg-slate-700' },
};
const LEVEL_LABEL_SHORT: Record<string, string> = { easy: 'سهل', medium: 'متوسط', advanced: 'متقدم' };
const SECTION_LABEL_SHORT: Record<string, string> = { verbal: 'اللفظي', quantitative: 'الكمي' };

const reasonMeta: Record<string, { label: string; chip: string }> = {
  inactive: { label: 'غياب 3+ أيام', chip: '🟠' },
  low_performance: { label: 'أداء ضعيف', chip: '🔴' },
  no_improvement: { label: 'بدون تحسن', chip: '🟡' },
};

function severityChip(reasons: string[]) {
  if (reasons.includes('low_performance')) return '🔴';
  if (reasons.includes('inactive')) return '🟠';
  return '🟡';
}

export default function DashboardTab() {
  const session = useStore((s) => s.session);
  const students = useStore((s) => s.students);
  const loadingCore = useStore((s) => s.loadingCore);
  const statusOf = useStore((s) => s.statusOf);
  const stats = useStore((s) => s.stats);
  const dark = useStore((s) => s.dark);
  const setTab = useStore((s) => s.setTab);
  const setConversationFocusStudentId = useStore((s) => s.setConversationFocusStudentId);
  const setBroadcastPrefillIds = useStore((s) => s.setBroadcastPrefillIds);
  const openStudentProfile = useStore((s) => s.openStudentProfile);
  const threads = useStore((s) => s.threads);
  const loadThreads = useStore((s) => s.loadThreads);

  const [loading, setLoading] = useState(true);
  const [atRisk, setAtRisk] = useState<AtRiskRes | null>(null);
  const [activity, setActivity] = useState<ActivityRes | null>(null);
  const [progress, setProgress] = useState<ProgressRes | null>(null);
  const [skills, setSkills] = useState<SkillsRes | null>(null);
  const [health, setHealth] = useState<HealthRes | null>(null);
  const [engagement, setEngagement] = useState<QuizEngagementRes | null>(null);
  const [journeyOverview, setJourneyOverview] = useState<JourneyOverviewRes | null>(null);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Zone 1 signal: students with ZERO conversation history with any admin,
  // ever — derived client-side as students minus students appearing in
  // `threads` (threads is already school-scoped, no adminId filter → covers
  // every admin, not just the one currently logged in). No new API needed.
  const neverMessaged = useMemo(() => {
    const withThread = new Set(threads.map((t) => t.student_id));
    return students.filter((s) => !withThread.has(s.id));
  }, [students, threads]);

  useEffect(() => {
    const schoolQuery = session?.school && session.school !== '*' ? `?school=${encodeURIComponent(session.school)}` : '';
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<AtRiskRes>(`/analytics/at-risk${schoolQuery}`),
      api.get<ActivityRes>(`/analytics/activity${schoolQuery}`),
      api.get<ProgressRes>(`/analytics/progress${schoolQuery}`),
      api.get<SkillsRes>(`/analytics/skills${schoolQuery}`),
      api.get<HealthRes>(`/analytics/health${schoolQuery}`),
      api.get<QuizEngagementRes>(`/analytics/quiz-engagement${schoolQuery}`),
      api.get<JourneyOverviewRes>(`/analytics/journey-overview${schoolQuery}`),
    ])
      .then(([a, ac, p, sk, h, eng, jo]) => {
        if (cancelled) return;
        setAtRisk(a);
        setActivity(ac);
        setProgress(p);
        setSkills(sk);
        setHealth(h);
        setEngagement(eng);
        setJourneyOverview(jo);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.school]);

  // Zone 2: every figure here is a rate, not a raw count — "what does this
  // number mean" rather than "what is the number".
  const rates = useMemo(() => {
    const total = students.length || 1;
    let finished = 0;
    let notStarted = 0;
    for (const s of students) {
      const st = statusOf(s.id);
      if (st === 'finished') finished++;
      if (st === 'not_started') notStarted++;
    }
    const activeCount = (activity?.active.count ?? 0) + (activity?.medium.count ?? 0);
    const atRiskCount = atRisk?.total ?? 0;
    const withScores = progress?.total || 0;
    const avgImprovement = withScores
      ? Math.round((progress?.students ?? []).reduce((sum, s) => sum + s.improvementPct, 0) / withScores)
      : null;
    return {
      completionRate: Math.round((finished / total) * 100),
      activeRate: Math.round((activeCount / total) * 100),
      atRiskRate: Math.round((atRiskCount / total) * 100),
      diagnosticStartedRate: Math.round(((total - notStarted) / total) * 100),
      neverMessagedRate: Math.round((neverMessaged.length / total) * 100),
      avgImprovement,
    };
  }, [students, statusOf, activity, atRisk, neverMessaged, progress]);

  const needsIntervention = useMemo(() => {
    const list = atRisk?.students ?? [];
    return list.slice(0, 6);
  }, [atRisk]);

  const decliningStudents = useMemo(
    () => (progress?.students ?? []).filter((s) => s.classification === 'declining').slice(0, 6),
    [progress],
  );

  const neverMessagedShown = useMemo(() => neverMessaged.slice(0, 6), [neverMessaged]);

  // Top improvers — real server-computed improvementPct (first vs last diagnostic
  // attempt), named + ranked, so the admin can see WHO is advancing, not just a count.
  const topImproving = useMemo(
    () =>
      (progress?.students ?? [])
        .filter((s) => s.classification === 'improving')
        .sort((a, b) => b.improvementPct - a.improvementPct)
        .slice(0, 6),
    [progress],
  );

  // Struggling = advancing's mirror: lowest score + declining/no-improvement,
  // ranked worst-first — reuses at-risk's severity ordering (already sorted server-side).
  const strugglingTop = useMemo(() => (atRisk?.students ?? []).slice(0, 6), [atRisk]);

  // Whole-cohort health — average of the server's composite health_score
  // (30% activity + 40% performance + 30% improvement), a single number
  // that answers "how is this school doing overall" in one glance.
  const avgHealth = useMemo(() => {
    const list = health?.students ?? [];
    if (!list.length) return null;
    return Math.round(list.reduce((sum, s) => sum + s.healthScore, 0) / list.length);
  }, [health]);

  const gridColor = dark ? '#1e293b' : '#e2e8f0';
  const textColor = dark ? '#94a3b8' : '#64748b';
  const tooltipStyle = {
    backgroundColor: dark ? '#0f172a' : '#fff',
    border: `1px solid ${gridColor}`,
    borderRadius: 8,
    fontSize: 12,
    direction: 'rtl' as const,
  };

  if (loadingCore || loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  const goMessage = (id: string) => {
    setConversationFocusStudentId(id);
    setTab('conversations');
  };

  return (
    <div className="space-y-5">
      {/* ── Zone 1: Quick Actions — the first thing on the page. Every card is
          an actionable worklist, not a stat. ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-500 dark:text-slate-400">⚡ يحتاج إجراءً اليوم</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {/* Needs intervention */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">🔴 يحتاجون تدخلاً ({atRisk?.total ?? 0})</h3>
            </div>
            {needsIntervention.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">لا يوجد طلاب يحتاجون تدخل حاليًا 🎉</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {needsIntervention.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span>{severityChip(s.reasons)}</span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-700 dark:text-slate-200">{s.name}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {s.reasons.map((r) => reasonMeta[r]?.label || r).join(' · ')} ·{' '}
                          {s.daysSinceActive === null ? 'لا نشاط' : `منذ ${s.daysSinceActive} يوم`}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => goMessage(s.id)} className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300">💬</button>
                      <button type="button" onClick={() => openStudentProfile(s.id)} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">الملف</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Never started */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">⚪ لم يبدأوا أبدًا ({atRisk?.neverStarted.count ?? 0})</h3>
              {!!atRisk?.neverStarted.count && (
                <button
                  type="button"
                  onClick={() => {
                    setBroadcastPrefillIds(atRisk.neverStarted.students.map((s) => s.id));
                    setTab('broadcast');
                  }}
                  className="rounded-lg bg-amber-500 px-2 py-1 text-[11px] font-bold text-white hover:bg-amber-600"
                >
                  📣 تذكير جماعي
                </button>
              )}
            </div>
            {!atRisk?.neverStarted.count ? (
              <p className="py-6 text-center text-sm text-slate-400">الجميع بدأوا التشخيصي 🎉</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {atRisk.neverStarted.students.slice(0, 6).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">{s.name}</span>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => goMessage(s.id)} className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300">💬</button>
                      <button type="button" onClick={() => openStudentProfile(s.id)} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">الملف</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Declined */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">📉 تراجع أداؤهم ({progress?.declining ?? 0})</h3>
            {decliningStudents.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">لا يوجد طلاب متراجعون حاليًا 🎉</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {decliningStudents.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">{s.name}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{s.firstScore}%→{s.lastScore}%</span>
                      <button type="button" onClick={() => openStudentProfile(s.id)} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">الملف</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Never messaged — new round-2 signal */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">🔇 بدون أي تواصل معهم ({neverMessaged.length})</h3>
              {neverMessaged.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setBroadcastPrefillIds(neverMessaged.map((s) => s.id)); setTab('broadcast'); }}
                  className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  📢 مراسلة جماعية
                </button>
              )}
            </div>
            {neverMessagedShown.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">كل الطلاب لديهم تواصل مسجّل 🎉</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {neverMessagedShown.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">{s.name}</span>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => goMessage(s.id)} className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300">فتح رسالة أولى</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ── Zone 2: Command dashboard — circular gauges, not flat numbers ── */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-500 dark:text-slate-400">📊 لوحة القيادة (مؤشرات دائرية)</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <RadialGauge label="صحة المدرسة عمومًا" pct={avgHealth} hint="نشاط + أداء + تحسن (مركّب)" />
          <RadialGauge label="نسبة الإكمال" pct={rates.completionRate} hint="أنهوا التشخيصي" />
          <RadialGauge label="نسبة النشاط" pct={rates.activeRate} hint="نشطون ٠-٣ أيام" />
          <RadialGauge label="نسبة الخطر" pct={rates.atRiskRate} hint="يحتاجون تدخلًا" invert />
          <RadialGauge label="بدء التشخيصي" pct={rates.diagnosticStartedRate} hint="بدأوا ولو جزئيًا" />
          <RadialGauge
            label="متوسط التحسن"
            pct={rates.avgImprovement === null ? null : Math.max(0, Math.min(100, 50 + rates.avgImprovement))}
            valueLabel={rates.avgImprovement === null ? '—' : `${rates.avgImprovement > 0 ? '+' : ''}${rates.avgImprovement}%`}
            hint="أول محاولة ← آخر محاولة"
          />
          <RadialGauge label="بدون تواصل" pct={rates.neverMessagedRate} hint={`${neverMessaged.length} طالب`} invert />
        </div>
      </section>

      {/* ── Zone 3: who's advancing vs who's struggling, by name ── */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">🟢 الأكثر تقدمًا (نسبة التحسن)</h3>
          {topImproving.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">لا توجد بيانات تحسن كافية بعد</p>
          ) : (
            <ol className="space-y-1.5">
              {topImproving.map((s, i) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50/60 px-3 py-1.5 text-sm dark:bg-emerald-950/20">
                  <span className="flex items-center gap-2 truncate font-medium text-slate-700 dark:text-slate-200">
                    <span className="text-[11px] font-bold text-emerald-500">#{i + 1}</span>
                    {s.name}
                  </span>
                  <span className="shrink-0 font-bold text-emerald-600 dark:text-emerald-400">+{s.improvementPct}%</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-sm font-bold text-rose-700 dark:text-rose-400">🔴 الأكثر احتياجًا (الأعلى خطورة)</h3>
          {strugglingTop.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">لا يوجد طلاب في خطر حاليًا 🎉</p>
          ) : (
            <ol className="space-y-1.5">
              {strugglingTop.map((s, i) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-rose-50/60 px-3 py-1.5 text-sm dark:bg-rose-950/20">
                  <span className="flex items-center gap-2 truncate font-medium text-slate-700 dark:text-slate-200">
                    <span className="text-[11px] font-bold text-rose-500">#{i + 1}</span>
                    {s.name}
                  </span>
                  <span className="shrink-0 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                    {s.lastScore !== null ? `${s.lastScore}%` : 'بدون درجة'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* ── Zone 4: most engaged with the short-quiz system — real skill_progress aggregate ── */}
      {!!engagement && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">🧩 الأكثر تفاعلاً مع الاختبارات القصيرة</h3>
            <span className="text-[11px] text-slate-400">
              {engagement.participants} من {engagement.totalStudents} طالب خاضوا اختبارًا قصيرًا واحدًا على الأقل ({engagement.participationRate}%)
            </span>
          </div>
          {engagement.topEngaged.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">لا يوجد بعد أي محاولات مسجّلة في نظام الاختبارات القصيرة</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {engagement.topEngaged.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-[11px] font-bold text-indigo-500">#{i + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-700 dark:text-slate-200">{s.name}</p>
                      <p className="truncate text-[10px] text-slate-400">{s.skillsTouched}/{engagement.totalSkills} مهارة · {s.coveragePct}% تغطية</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openStudentProfile(s.id)}
                    className="shrink-0 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
                  >
                    {s.totalAttempts} محاولة
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Zone 5: مسار الإنجاز across the roster — same passed/totalNodes math
          as each student's own journey, aggregated in one grouped query. ── */}
      {!!journeyOverview && (
        <section className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">🧭 توزيع الطلاب حسب التقدم في مسار الإنجاز</h3>
            <div className="space-y-2.5">
              {journeyOverview.buckets.map((b) => {
                const style = BUCKET_STYLE[b.code] || BUCKET_STYLE.not_started;
                const pct = journeyOverview.totalStudents ? Math.round((b.count / journeyOverview.totalStudents) * 100) : 0;
                return (
                  <div key={b.code} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">{style.chip} {b.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-16 shrink-0 text-end text-xs font-bold text-slate-500 dark:text-slate-400">{b.count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              {journeyOverview.diagnosticCompleted} من {journeyOverview.totalStudents} أنهوا التشخيص الذاتي · التقدم = مهارات مجتازة من أصل {journeyOverview.totalNodes}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-2 text-sm font-bold text-indigo-700 dark:text-indigo-400">🏆 الأكثر تقدمًا في مسار المهارات</h3>
            <p className="mb-2 text-[11px] text-slate-400">مرتّبون حسب عدد المهارات المجتازة من أصل {journeyOverview.totalNodes} — مقياس تقدّم هيكلي، وليس متوسط درجات</p>
            {journeyOverview.topProgressing.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">لا يوجد طلاب اجتازوا مهارة بعد</p>
            ) : (
              <ol className="space-y-1.5">
                {journeyOverview.topProgressing.map((s, i) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-indigo-50/60 px-3 py-1.5 text-sm dark:bg-indigo-950/20">
                    <span className="flex items-center gap-2 truncate font-medium text-slate-700 dark:text-slate-200">
                      <span className="text-[11px] font-bold text-indigo-500">#{i + 1}</span>
                      {s.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => openStudentProfile(s.id)}
                      className="shrink-0 rounded-lg bg-indigo-100 px-2 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900 dark:text-indigo-300"
                    >
                      {s.passedNodes}/{s.totalNodes} — {s.overallProgressPct}%
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
            <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">📶 نسبة إكمال كل مستوى</h3>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {journeyOverview.levelCompletion
                .sort((a, b) => (a.section === b.section ? 0 : a.section === 'verbal' ? -1 : 1))
                .map((lc) => (
                  <div key={`${lc.section}-${lc.level}`} className="rounded-xl border border-slate-100 px-3 py-2 text-center dark:border-slate-800">
                    <p className="text-[11px] font-bold text-slate-400">{SECTION_LABEL_SHORT[lc.section]} · {LEVEL_LABEL_SHORT[lc.level]}</p>
                    <p className="mt-1 text-lg font-extrabold text-slate-700 dark:text-slate-200">{lc.completionRate}%</p>
                    <p className="text-[10px] text-slate-400">{lc.studentsCompleted} طالب</p>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* Weakest skills — decision-relevant, not decorative */}
      {!!skills?.weakest.length && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">🎯 أضعف المهارات عبر كل الطلاب</h3>
          <div className="flex flex-wrap gap-2">
            {skills.weakest.map((s) => (
              <span key={s.skillId || s.skillName} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                {s.skillName} — {s.avgPct}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Real activity chart — supports the "who dropped off" question, not decorative */}
      {stats && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">النشاط اليومي (تسجيلات دخول واختبارات)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.dailyActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => new Date(String(d)).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}
                stroke={textColor}
                fontSize={11}
              />
              <YAxis stroke={textColor} fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="logins" name="تسجيلات دخول" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="tests" name="اختبارات" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
