import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';
import { cn } from '../lib/cn';

type SubTab = 'diagnostic' | 'quiz';

interface ProgressStudent { id: string; name: string; firstScore: number; lastScore: number; improvementPct: number; attempts: number; classification: 'improving' | 'stable' | 'declining' }
interface ProgressRes { total: number; improving: number; stable: number; declining: number; students: ProgressStudent[] }
interface SkillRow { skillId: string; skillName: string; avgPct: number; sampleSize: number }
interface SkillsRes { skills: SkillRow[]; weakest: SkillRow[] }

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

function DiagnosticSection() {
  const session = useStore((s) => s.session);
  const students = useStore((s) => s.students);
  const loadingCore = useStore((s) => s.loadingCore);
  const statusOf = useStore((s) => s.statusOf);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<ProgressRes | null>(null);
  const [skills, setSkills] = useState<SkillsRes | null>(null);

  useEffect(() => {
    const schoolQuery = session?.school && session.school !== '*' ? `?school=${encodeURIComponent(session.school)}` : '';
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<ProgressRes>(`/analytics/progress${schoolQuery}`),
      api.get<SkillsRes>(`/analytics/skills${schoolQuery}`),
    ])
      .then(([p, sk]) => { if (!cancelled) { setProgress(p); setSkills(sk); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.school]);

  const completion = useMemo(() => {
    const total = students.length || 1;
    let finished = 0, started = 0, notStarted = 0;
    for (const s of students) {
      const st = statusOf(s.id);
      if (st === 'finished') finished++;
      else if (st === 'started') started++;
      else notStarted++;
    }
    return {
      finished, started, notStarted,
      finishedPct: Math.round((finished / total) * 100),
      startedPct: Math.round((started / total) * 100),
      notStartedPct: Math.round((notStarted / total) * 100),
    };
  }, [students, statusOf]);

  const strugglingStudents = useMemo(
    () => (progress?.students ?? []).filter((s) => s.classification === 'declining' || s.lastScore < 50)
      .sort((a, b) => a.lastScore - b.lastScore)
      .slice(0, 8),
    [progress],
  );

  if (loading || loadingCore) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={card}>
          <p className="text-xs text-slate-400">أنهوا التشخيصي</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completion.finished}</p>
          <p className="text-[11px] text-slate-400">{completion.finishedPct}% من الإجمالي</p>
        </div>
        <div className={card}>
          <p className="text-xs text-slate-400">بدأوا ولم ينهوا</p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{completion.started}</p>
          <p className="text-[11px] text-slate-400">{completion.startedPct}% من الإجمالي</p>
        </div>
        <div className={card}>
          <p className="text-xs text-slate-400">لم يبدأوا</p>
          <p className="mt-1 text-2xl font-bold text-slate-500">{completion.notStarted}</p>
          <p className="text-[11px] text-slate-400">{completion.notStartedPct}% من الإجمالي</p>
        </div>
      </div>

      <div className={card}>
        <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">تصنيف التقدم (مقارنة أول محاولة بآخر محاولة)</h3>
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
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">أضعف المهارات (متوسط عبر كل الطلاب)</h3>
          {!skills?.weakest.length ? (
            <p className="text-sm text-slate-400">لا توجد بيانات كافية</p>
          ) : (
            <ul className="space-y-2">
              {skills.weakest.map((s) => (
                <li key={s.skillId || s.skillName} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-200">{s.skillName}</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    {s.avgPct}% <span className="text-[11px] font-normal text-slate-400">({s.sampleSize} طالب)</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={card}>
          <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">طلاب متعثرون (أقل الدرجات / تراجع)</h3>
          {!strugglingStudents.length ? (
            <p className="text-sm text-slate-400">لا يوجد طلاب متعثرون حاليًا 🎉</p>
          ) : (
            <ul className="space-y-2">
              {strugglingStudents.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-200">{s.name}</span>
                  <span className="flex items-center gap-1 font-bold text-slate-500">
                    <span>{s.firstScore}%</span>
                    <span className="text-slate-300">←</span>
                    <span className={s.lastScore < 50 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'}>
                      {s.lastScore}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            المقارنة الذاتية تعرض أول وآخر محاولة فقط (البيانات المتاحة من واجهة التحليلات الحالية لا تعرض كل المحاولات الوسيطة).
          </p>
        </div>
      </div>
    </div>
  );
}

interface EngagedStudent { id: string; name: string; school: string; skillsTouched: number; totalAttempts: number; passedCount: number; lastAttemptAt: string | null; coveragePct: number }
interface QuizEngagementRes { totalStudents: number; participants: number; participationRate: number; totalSkills: number; topEngaged: EngagedStudent[] }

function QuizSkillsSection() {
  const session = useStore((s) => s.session);
  const setTab = useStore((s) => s.setTab);
  const openStudentProfile = useStore((s) => s.openStudentProfile);
  const [loading, setLoading] = useState(true);
  const [engagement, setEngagement] = useState<QuizEngagementRes | null>(null);

  useEffect(() => {
    const schoolQuery = session?.school && session.school !== '*' ? `?school=${encodeURIComponent(session.school)}` : '';
    let cancelled = false;
    setLoading(true);
    api.get<QuizEngagementRes>(`/analytics/quiz-engagement${schoolQuery}`)
      .then((r) => { if (!cancelled) setEngagement(r); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.school]);

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">🧩 المشاركة في الاختبارات القصيرة (30 مهارة × 3 مستويات)</h3>
          {engagement && (
            <span className="text-[11px] text-slate-400">
              {engagement.participants} من {engagement.totalStudents} طالب شاركوا ({engagement.participationRate}%)
            </span>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">
            <div className="skeleton h-12 rounded-xl" />
            <div className="skeleton h-12 rounded-xl" />
          </div>
        ) : !engagement?.topEngaged.length ? (
          <p className="py-6 text-center text-sm text-slate-400">لا توجد بعد أي محاولات مسجّلة في نظام الاختبارات القصيرة</p>
        ) : (
          <ul className="space-y-2">
            {engagement.topEngaged.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-[11px] font-bold text-indigo-500">#{i + 1}</span>
                  <span className="truncate font-medium text-slate-700 dark:text-slate-200">{s.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-[11px] text-slate-400">
                  <span>{s.skillsTouched} مهارة ({s.coveragePct}%)</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{s.passedCount} ناجحة</span>
                  <button
                    type="button"
                    onClick={() => openStudentProfile(s.id)}
                    className="rounded-lg bg-indigo-50 px-2 py-1 font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
                  >
                    {s.totalAttempts} محاولة
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={card}>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          لعرض مؤشرات مهارة/مستوى مفصّلة لطالب محدد (تقدّم كل مهارة في القسم اللفظي والكمي) — من صفحة الملف الشخصي لأي طالب.
        </p>
        <button
          type="button"
          onClick={() => setTab('students')}
          className="mt-3 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
        >
          👥 اذهب لقائمة الطلاب ←
        </button>
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
