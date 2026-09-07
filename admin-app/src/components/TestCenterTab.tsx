import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import QuickSendButton from './QuickSendButton';

type SubTab = 'diagnostic' | 'quiz';

interface ProgressStudent { id: string; name: string; firstScore: number; lastScore: number; improvementPct: number; attempts: number; classification: 'improving' | 'stable' | 'declining' }
interface ProgressRes { total: number; improving: number; stable: number; declining: number; students: ProgressStudent[] }

function SubTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm font-bold transition-colors',
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
      )}
    >
      {children}
    </button>
  );
}

const card = 'rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900';

// ── Diagnostic tab ──────────────────────────────────────────────────────────

interface DiagTier { count: number; pct: number }
interface DiagnosticOverviewRes {
  testedCount: number; notStartedCount: number;
  tiers: { excellent: DiagTier; good: DiagTier; needs_support: DiagTier; below: DiagTier; not_started: { count: number } };
  weakestSkills: { skillId: string; skillName: string; avgPct: number; sampleSize: number; weakCount: number }[];
  mostNeedingSupport: { id: string; name: string; school: string; lastScore: number; weakestSkillName: string | null; weakestSkillPct: number | null }[];
}

const TIER_META = {
  excellent:      { label: 'متفوقون',        range: '90–100%', chip: '🟢', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  good:           { label: 'جيد جدًا',        range: '70–89%',  chip: '🟡', bar: 'bg-amber-400',   text: 'text-amber-600 dark:text-amber-400' },
  needs_support:  { label: 'يحتاجون دعمًا',    range: '50–69%',  chip: '🟠', bar: 'bg-orange-500',  text: 'text-orange-600 dark:text-orange-400' },
  below:          { label: 'دون المطلوب',     range: '< 50%',   chip: '🔴', bar: 'bg-rose-500',    text: 'text-rose-600 dark:text-rose-400' },
} as const;
const TIER_ORDER = ['excellent', 'good', 'needs_support', 'below'] as const;

function skillBarColor(pct: number) {
  return pct < 50 ? 'bg-rose-500' : pct < 70 ? 'bg-orange-400' : pct < 90 ? 'bg-amber-400' : 'bg-emerald-500';
}

function DiagnosticSection() {
  const session = useStore((s) => s.session);
  const openStudentProfile = useStore((s) => s.openStudentProfile);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<DiagnosticOverviewRes | null>(null);
  const [progress, setProgress] = useState<ProgressRes | null>(null);

  useEffect(() => {
    const schoolQuery = session?.school && session.school !== '*' ? `?school=${encodeURIComponent(session.school)}` : '';
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<DiagnosticOverviewRes>(`/analytics/diagnostic-overview${schoolQuery}`),
      api.get<ProgressRes>(`/analytics/progress${schoolQuery}`),
    ])
      .then(([o, p]) => { if (!cancelled) { setOverview(o); setProgress(p); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.school]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score distribution — 5 tiles: 4 score tiers + not-started/skipped */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {TIER_ORDER.map((tier) => {
          const meta = TIER_META[tier];
          const data = overview?.tiers[tier];
          return (
            <div key={tier} className={card}>
              <p className="text-xs text-slate-400">{meta.chip} {meta.label}</p>
              <p className={cn('mt-1 text-2xl font-extrabold', meta.text)}>{data?.count ?? 0}</p>
              <p className="text-[11px] text-slate-400">{meta.range} · {data?.pct ?? 0}% من المختبرين</p>
            </div>
          );
        })}
        <div className={card}>
          <p className="text-xs text-slate-400">⚪ لم يبدأوا / تم التخطي</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-500">{overview?.notStartedCount ?? 0}</p>
          <p className="text-[11px] text-slate-400">من إجمالي الطلاب</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Weakest skills — horizontal progress bars */}
        <div className={card}>
          <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">🎯 أضعف المهارات في التشخيصي</h3>
          {!overview?.weakestSkills.length ? (
            <p className="py-6 text-center text-sm text-slate-400">لا توجد بيانات كافية بعد</p>
          ) : (
            <div className="space-y-3">
              {overview.weakestSkills.map((s) => (
                <div key={s.skillId || s.skillName}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{s.skillName}</span>
                    <span className="text-slate-400">{s.avgPct}% · {s.weakCount} طالب ضعيف</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={cn('h-full rounded-full', skillBarColor(s.avgPct))} style={{ width: `${s.avgPct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Most needing support — score + own weakest skill + quick actions */}
        <div className={card}>
          <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">🆘 الطلاب الأكثر احتياجًا للدعم</h3>
          {!overview?.mostNeedingSupport.length ? (
            <p className="py-6 text-center text-sm text-slate-400">لا يوجد طلاب بحاجة لدعم حاليًا 🎉</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {overview.mostNeedingSupport.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-700 dark:text-slate-200">{s.name}</p>
                    <p className="truncate text-[11px] text-slate-400">
                      {s.weakestSkillName ? `أضعف مهارة: ${s.weakestSkillName} (${s.weakestSkillPct}%)` : '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">{s.lastScore}%</span>
                    <QuickSendButton studentId={s.id} defaultText={`مرحبًا ${s.name}، لاحظنا أنك بحاجة لبعض الدعم في التشخيصي — هل تحتاج مساعدة؟`} />
                    <button type="button" onClick={() => openStudentProfile(s.id)} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">📄 الملف</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Improvement path — first vs last attempt */}
      <div className={card}>
        <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">📈 مسار التحسّن (مقارنة أول محاولة بآخر محاولة)</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{progress?.improving ?? 0}</p>
            <p className="text-[11px] text-slate-400">▲ يتحسّن</p>
          </div>
          <div>
            <p className="text-xl font-bold text-slate-500">{progress?.stable ?? 0}</p>
            <p className="text-[11px] text-slate-400">— مستقر</p>
          </div>
          <div>
            <p className="text-xl font-bold text-rose-600 dark:text-rose-400">{progress?.declining ?? 0}</p>
            <p className="text-[11px] text-slate-400">▼ يتراجع</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          المقارنة الذاتية بين أول وآخر محاولة تشخيصية لكل طالب أعاد الاختبار — من أصل {progress?.total ?? 0} طالب لديهم محاولتان أو أكثر.
        </p>
      </div>
    </div>
  );
}

// ── Quiz Skills (short quizzes) tab ─────────────────────────────────────────

interface LevelStat { level: 'easy' | 'medium' | 'advanced'; passRate: number; reachedCount: number; completedCount: number; opened: boolean }
interface SkillMatrixEntry { id: string; section: 'verbal' | 'quantitative'; level: 'easy' | 'medium' | 'advanced'; skillId: string; skillName: string; masteredCount: number; masteryPct: number }
interface LeaderboardEntry { id: string; name: string; mastered: number; reachedAt: string | null }
interface QuizHubOverviewRes { totalStudents: number; totalSkills: number; catalogueSkills?: number; levelStats: LevelStat[]; skillMatrix: SkillMatrixEntry[]; leaderboard: LeaderboardEntry[] }

// Podium treatment for the top three. Each rank owns its metal: ring + soft
// surface tint + the bar fill, so the standing reads at a glance without
// leaning on the rank number alone. Only #1 gets the glow.
const PODIUM = [
  {
    ring: 'border-amber-300/80 dark:border-amber-500/40',
    surface: 'bg-gradient-to-b from-amber-50/90 to-white/60 dark:from-amber-500/10 dark:to-slate-900/40',
    glow: 'shadow-[0_0_0_1px_rgba(245,158,11,.18),0_10px_30px_-12px_rgba(245,158,11,.55)]',
    medal: 'text-amber-500', bar: 'bg-gradient-to-l from-amber-400 to-amber-500', label: 'المركز الأول',
  },
  {
    ring: 'border-slate-300/80 dark:border-slate-500/40',
    surface: 'bg-gradient-to-b from-slate-50/90 to-white/60 dark:from-slate-400/10 dark:to-slate-900/40',
    glow: '', medal: 'text-slate-400', bar: 'bg-gradient-to-l from-slate-300 to-slate-400', label: 'المركز الثاني',
  },
  {
    ring: 'border-orange-300/70 dark:border-orange-700/40',
    surface: 'bg-gradient-to-b from-orange-50/80 to-white/60 dark:from-orange-600/10 dark:to-slate-900/40',
    glow: '', medal: 'text-orange-600/80', bar: 'bg-gradient-to-l from-orange-300 to-orange-500', label: 'المركز الثالث',
  },
] as const;

function MedalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7.2 3h9.6l-3.4 6.2a4.9 4.9 0 0 0-2.8 0Z" />
      <circle cx="12" cy="15.5" r="5.5" />
      <path d="m12 12.6 1 2.1 2.2.3-1.6 1.6.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.6 2.2-.3Z" />
    </svg>
  );
}
function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0Z" /><path d="M17 5h2.5a2.5 2.5 0 0 1-2.5 4" />
      <path d="M7 5H4.5A2.5 2.5 0 0 0 7 9" /><path d="M12 14v3" /><path d="M9 20h6" /><path d="M10 17h4l.5 3h-5Z" />
    </svg>
  );
}
interface EngagedStudent { id: string; name: string; school: string; skillsTouched: number; totalAttempts: number; passedCount: number; lastAttemptAt: string | null; coveragePct: number }
interface QuizEngagementRes { totalStudents: number; participants: number; participationRate: number; totalSkills: number; topEngaged: EngagedStudent[] }
interface SettingsRes { settings: { quiz_pass_ratio: { value: number; default: number; label: string } } }

const LEVEL_META: Record<'easy' | 'medium' | 'advanced', { label: string; sub: string; chip: string; text: string; ring: string }> = {
  easy:     { label: 'المستوى الأول', sub: 'سهل',   chip: '🟢', text: 'text-emerald-600 dark:text-emerald-400', ring: 'border-emerald-200 dark:border-emerald-900' },
  medium:   { label: 'المستوى الثاني', sub: 'متوسط', chip: '🟡', text: 'text-amber-600 dark:text-amber-400',   ring: 'border-amber-200 dark:border-amber-900' },
  advanced: { label: 'المستوى الثالث', sub: 'متقدم', chip: '🟣', text: 'text-violet-600 dark:text-violet-400', ring: 'border-violet-200 dark:border-violet-900' },
};
const SECTION_LABEL: Record<'verbal' | 'quantitative', string> = { verbal: 'القسم اللفظي', quantitative: 'القسم الكمي' };

// Pass-ratio banner — embedded at the top of the quiz hub, not a separate
// standalone card (per the "بنر مدمج" ask). director/dev can edit inline.
function PassRatioBanner() {
  const session = useStore((s) => s.session);
  const pushToast = useStore((s) => s.pushToast);
  const canEdit = session?.role === 'director' || session?.role === 'dev';
  const [ratio, setRatio] = useState<number | null>(null);
  const [defaultRatio, setDefaultRatio] = useState(0.8);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<SettingsRes>('/settings')
      .then((r) => {
        setRatio(r.settings.quiz_pass_ratio.value);
        setDefaultRatio(r.settings.quiz_pass_ratio.default);
        setDraft(String(r.settings.quiz_pass_ratio.value));
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0.5 || n > 1) {
      pushToast('error', 'النسبة يجب أن تكون بين 0.5 و1 (مثال: 0.8 = 80%)');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/settings', { key: 'quiz_pass_ratio', value: n });
      setRatio(n);
      setEditing(false);
      pushToast('success', 'تم تحديث نسبة النجاح — تسري على كل محاولة جديدة');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/30">
      <div className="flex items-center gap-2 text-sm">
        <span>⚙️</span>
        <span className="font-bold text-slate-700 dark:text-slate-200">نسبة النجاح المطلوبة لاجتياز أي مهارة</span>
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span className="text-[11px] text-slate-400">الافتراضي {Math.round(defaultRatio * 100)}%</span>
      </div>
      {ratio === null ? (
        <span className="text-xs text-slate-400">…</span>
      ) : !canEdit ? (
        <span className="rounded-lg bg-white px-3 py-1 text-sm font-bold text-indigo-700 dark:bg-slate-900 dark:text-indigo-300">{Math.round(ratio * 100)}%</span>
      ) : editing ? (
        <div className="flex items-center gap-2">
          <input
            type="number" min={0.5} max={1} step={0.05} value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <span className="text-xs text-slate-400">({Math.round((Number(draft) || 0) * 100)}%)</span>
          <button type="button" onClick={save} disabled={saving || Number(draft) === ratio} className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? '…' : 'حفظ'}
          </button>
          <button type="button" onClick={() => { setEditing(false); setDraft(String(ratio)); }} className="text-xs text-slate-400 hover:text-slate-600">إلغاء</button>
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="rounded-lg bg-white px-3 py-1 text-sm font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-slate-900 dark:text-indigo-300">
          {Math.round(ratio * 100)}% ✎
        </button>
      )}
    </div>
  );
}

function QuizSkillsSection() {
  const session = useStore((s) => s.session);
  const openStudentProfile = useStore((s) => s.openStudentProfile);
  const [loading, setLoading] = useState(true);
  const [hub, setHub] = useState<QuizHubOverviewRes | null>(null);
  const [engagement, setEngagement] = useState<QuizEngagementRes | null>(null);

  useEffect(() => {
    const schoolQuery = session?.school && session.school !== '*' ? `?school=${encodeURIComponent(session.school)}` : '';
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<QuizHubOverviewRes>(`/analytics/quiz-hub-overview${schoolQuery}`),
      api.get<QuizEngagementRes>(`/analytics/quiz-engagement${schoolQuery}`),
    ])
      .then(([h, eng]) => { if (!cancelled) { setHub(h); setEngagement(eng); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.school]);

  const matrixBySection = useMemo(() => {
    const bySection: Record<'verbal' | 'quantitative', Record<'easy' | 'medium' | 'advanced', SkillMatrixEntry[]>> = {
      verbal: { easy: [], medium: [], advanced: [] },
      quantitative: { easy: [], medium: [], advanced: [] },
    };
    for (const s of hub?.skillMatrix ?? []) bySection[s.section][s.level].push(s);
    return bySection;
  }, [hub]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-14 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        <div className="skeleton h-80 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PassRatioBanner />

      {/* Per-level stat cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(['easy', 'medium', 'advanced'] as const).map((level) => {
          const meta = LEVEL_META[level];
          const stat = hub?.levelStats.find((l) => l.level === level);
          return (
            <div key={level} className={cn(card, 'border-2', meta.ring)}>
              <p className="text-xs font-bold text-slate-400">{meta.chip} {meta.label} — {meta.sub}</p>
              <p className={cn('mt-1 text-2xl font-extrabold', meta.text)}>{stat?.passRate ?? 0}%</p>
              <p className="text-[11px] text-slate-400">نسبة الاجتياز عبر مهارات المستوى</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>{stat?.reachedCount ?? 0} طالب وصلوا له</span>
                {level === 'advanced' ? (
                  <span className="font-semibold text-violet-600 dark:text-violet-400">{stat?.completedCount ?? 0} أنهوا المرحلة</span>
                ) : (
                  <span className={stat?.opened ? 'font-semibold text-emerald-600 dark:text-emerald-400' : ''}>{stat?.opened ? 'مفتوح' : 'لم يُفتح بعد'}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* School-wide skill mastery matrix — verbal + quantitative */}
      <div className={card}>
        <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">🗺️ مصفوفة تقدّم المهارات على مستوى المدرسة</h3>
        <div className="grid gap-5 lg:grid-cols-2">
          {(['verbal', 'quantitative'] as const).map((section) => (
            <div key={section}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{SECTION_LABEL[section]}</p>
              <div className="space-y-3">
                {(['easy', 'medium', 'advanced'] as const).map((level) => (
                  <div key={level}>
                    <p className={cn('mb-1 text-[11px] font-bold', LEVEL_META[level].text)}>{LEVEL_META[level].chip} {LEVEL_META[level].sub}</p>
                    <div className="space-y-1.5">
                      {matrixBySection[section][level].map((s) => (
                        <div key={s.id} className="flex items-center gap-2 text-xs">
                          <span className="w-28 shrink-0 truncate text-slate-600 dark:text-slate-300">{s.skillName}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className={cn('h-full rounded-full', skillBarColor(s.masteryPct))} style={{ width: `${s.masteryPct}%` }} />
                          </div>
                          <span className="w-10 shrink-0 text-end font-bold text-slate-500 dark:text-slate-400">{s.masteryPct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Mastery leaderboard */}
        <div className={card}>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
            <TrophyIcon className="h-4 w-4 text-amber-500" />
            لوحة شرف المهارات
          </h3>
          <p className="mb-4 text-[11px] text-slate-400">
            تُحتسب المهارة عند اجتياز اختبارها التقويمي فقط — من أصل {hub?.totalSkills ?? 30} مهارة معتمدة
          </p>
          {!hub?.leaderboard.length ? (
            <p className="py-6 text-center text-sm text-slate-400">لا يوجد طلاب أتقنوا مهارة بعد</p>
          ) : (
            <>
              {/* Podium — top three */}
              <div className="mb-3 grid gap-2.5 sm:grid-cols-3">
                {hub.leaderboard.slice(0, 3).map((s, i) => {
                  const p = PODIUM[i];
                  const pct = Math.round((s.mastered / (hub.totalSkills || 30)) * 100);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openStudentProfile(s.id)}
                      className={cn(
                        'group flex flex-col items-center rounded-2xl border p-3 text-center backdrop-blur-sm transition-all duration-300',
                        'hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
                        p.ring, p.surface, p.glow,
                      )}
                    >
                      <div className="relative">
                        <MedalIcon className={cn('h-9 w-9 transition-transform duration-300 group-hover:scale-110', p.medal)} />
                        <span className="absolute -bottom-1 -start-1 rounded-full bg-white px-1.5 text-[10px] font-black text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
                          {i + 1}
                        </span>
                      </div>
                      <span className="mt-2 text-[10px] font-bold text-slate-400">{p.label}</span>
                      <span className="mt-0.5 w-full truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">{s.name}</span>
                      <span className="mt-1 text-[11px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
                        {s.mastered}<span className="text-slate-400">/{hub.totalSkills}</span>
                      </span>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700/60">
                        <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', p.bar)} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="mt-1 text-[10px] font-bold tabular-nums text-slate-400">{pct}%</span>
                    </button>
                  );
                })}
              </div>

              {/* The rest */}
              {hub.leaderboard.length > 3 && (
                <ol className="space-y-1.5">
                  {hub.leaderboard.slice(3).map((s, i) => {
                    const pct = Math.round((s.mastered / (hub.totalSkills || 30)) * 100);
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => openStudentProfile(s.id)}
                          className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 py-2 text-start transition-colors duration-200 hover:border-indigo-200 hover:bg-indigo-50/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-indigo-900 dark:hover:bg-indigo-950/30"
                        >
                          <span className="w-6 shrink-0 text-center text-[11px] font-black tabular-nums text-slate-400">{i + 4}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-slate-700 dark:text-slate-200">{s.name}</span>
                            <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/60">
                              <span className="block h-full rounded-full bg-indigo-400/90 transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
                            </span>
                          </span>
                          <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
                            {s.mastered}<span className="text-slate-400">/{hub.totalSkills}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </div>

        {/* Participation — most engaged by attempts (existing signal) */}
        <div className={card}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">🧩 الأكثر مشاركة (بعدد المحاولات)</h3>
            {engagement && (
              <span className="text-[11px] text-slate-400">
                {engagement.participants} من {engagement.totalStudents} شاركوا ({engagement.participationRate}%)
              </span>
            )}
          </div>
          {!engagement?.topEngaged.length ? (
            <p className="py-6 text-center text-sm text-slate-400">لا توجد بعد أي محاولات مسجّلة</p>
          ) : (
            <ul className="space-y-1.5">
              {engagement.topEngaged.slice(0, 6).map((s, i) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900/60">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="font-bold text-indigo-500">#{i + 1}</span>
                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">{s.name}</span>
                  </span>
                  <span className="shrink-0 text-slate-400">{s.totalAttempts} محاولة</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TestCenterTab() {
  const [sub, setSub] = useState<SubTab>('diagnostic');
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <SubTabButton active={sub === 'diagnostic'} onClick={() => setSub('diagnostic')}>تشخيصي</SubTabButton>
        <SubTabButton active={sub === 'quiz'} onClick={() => setSub('quiz')}>قصيرة</SubTabButton>
      </div>
      {sub === 'diagnostic' ? <DiagnosticSection /> : <QuizSkillsSection />}
    </div>
  );
}
