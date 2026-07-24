import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';

interface AtRiskStudent {
  id: string; name: string; school: string;
  lastActive: string | null; daysSinceActive: number | null;
  lastScore: number | null; improvementPct: number | null; reasons: string[];
}
interface AtRiskRes { total: number; inactive_count: number; low_performance_count: number; no_improvement_count: number; students: AtRiskStudent[] }

interface ProgressStudent { id: string; name: string; firstScore: number; lastScore: number; improvementPct: number; attempts: number; classification: 'improving' | 'stable' | 'declining' }
interface ProgressRes { total: number; improving: number; stable: number; declining: number; students: ProgressStudent[] }

interface SkillRow { skillId: string; skillName: string; avgPct: number; sampleSize: number }
interface SkillsRes { skills: SkillRow[]; weakest: SkillRow[] }

interface ErrorQuestion { testNum: number; qnum: number; text: string; skillId: string; wrong: number; total: number; wrongPct: number }
interface ErrorSkill { skillId: string; wrong: number; total: number; wrongPct: number }
interface ErrorsRes { topSkills: ErrorSkill[]; topQuestions: ErrorQuestion[] }

interface ActivityBucket { count: number; students: { id: string; name: string; lastActive: string | null }[] }
interface ActivityRes { active: ActivityBucket; medium: ActivityBucket; inactive: ActivityBucket }

interface HealthStudent { id: string; name: string; school: string; healthScore: number; activityScore: number; performanceScore: number; improvementScore: number }
interface HealthRes { students: HealthStudent[] }

const reasonLabel: Record<string, string> = {
  inactive: '⏱ غياب 3+ أيام',
  low_performance: '📉 أداء < 50%',
  no_improvement: '📊 بدون تحسن',
};

export default function AdvancedAnalytics() {
  const session = useStore((s) => s.session);
  const [loading, setLoading] = useState(true);
  const [atRisk, setAtRisk] = useState<AtRiskRes | null>(null);
  const [progress, setProgress] = useState<ProgressRes | null>(null);
  const [skills, setSkills] = useState<SkillsRes | null>(null);
  const [errors, setErrors] = useState<ErrorsRes | null>(null);
  const [activity, setActivity] = useState<ActivityRes | null>(null);
  const [health, setHealth] = useState<HealthRes | null>(null);

  useEffect(() => {
    const schoolQuery = session?.school && session.school !== '*' ? `?school=${encodeURIComponent(session.school)}` : '';
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<AtRiskRes>(`/analytics/at-risk${schoolQuery}`),
      api.get<ProgressRes>(`/analytics/progress${schoolQuery}`),
      api.get<SkillsRes>(`/analytics/skills${schoolQuery}`),
      api.get<ErrorsRes>(`/analytics/errors${schoolQuery}`),
      api.get<ActivityRes>(`/analytics/activity${schoolQuery}`),
      api.get<HealthRes>(`/analytics/health${schoolQuery}`),
    ]).then(([a, p, sk, er, ac, he]) => {
      if (cancelled) return;
      setAtRisk(a); setProgress(p); setSkills(sk); setErrors(er); setActivity(ac); setHealth(he);
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.school]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
      </div>
    );
  }

  const card = 'rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900';
  const healthColor = (n: number) => (n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400');

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-800 dark:text-white">📊 تحليلات متقدمة</h2>

      {/* At-risk + activity summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className={card}>
          <h3 className="mb-2 font-bold text-slate-800 dark:text-white">🚨 طلاب يحتاجون تدخل</h3>
          <p className="mb-3 text-3xl font-extrabold text-rose-600 dark:text-rose-400">{atRisk?.total ?? 0}</p>
          <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
            <li>غياب 3+ أيام: {atRisk?.inactive_count ?? 0}</li>
            <li>أداء أقل من 50%: {atRisk?.low_performance_count ?? 0}</li>
            <li>بدون تحسن: {atRisk?.no_improvement_count ?? 0}</li>
          </ul>
        </div>
        <div className={card}>
          <h3 className="mb-2 font-bold text-slate-800 dark:text-white">📈 تصنيف التقدم</h3>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between"><span className="text-emerald-600 dark:text-emerald-400">▲ يتحسّن</span><span>{progress?.improving ?? 0}</span></li>
            <li className="flex justify-between"><span className="text-slate-500">— مستقر</span><span>{progress?.stable ?? 0}</span></li>
            <li className="flex justify-between"><span className="text-rose-600 dark:text-rose-400">▼ يتراجع</span><span>{progress?.declining ?? 0}</span></li>
          </ul>
        </div>
        <div className={card}>
          <h3 className="mb-2 font-bold text-slate-800 dark:text-white">🕓 النشاط</h3>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between"><span className="text-emerald-600 dark:text-emerald-400">نشط (0-1 يوم)</span><span>{activity?.active.count ?? 0}</span></li>
            <li className="flex justify-between"><span className="text-amber-600 dark:text-amber-400">متوسط (2-3 أيام)</span><span>{activity?.medium.count ?? 0}</span></li>
            <li className="flex justify-between"><span className="text-rose-600 dark:text-rose-400">غير نشط (4+ أيام)</span><span>{activity?.inactive.count ?? 0}</span></li>
          </ul>
        </div>
      </div>

      {/* At-risk list */}
      <div className={card}>
        <h3 className="mb-3 font-bold text-slate-800 dark:text-white">🚨 قائمة الطلاب المحتاجين تدخل</h3>
        {!atRisk?.students.length ? (
          <p className="text-sm text-slate-400">لا يوجد طلاب محتاجون تدخل حاليًا 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 dark:text-slate-400">
                  <th className="pb-2">الطالب</th><th className="pb-2">آخر نشاط</th><th className="pb-2">آخر درجة</th><th className="pb-2">السبب</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.students.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 text-slate-700 dark:text-slate-200">{s.name}</td>
                    <td className="py-2 text-slate-500">{s.daysSinceActive === null ? 'لا يوجد' : `منذ ${s.daysSinceActive} يوم`}</td>
                    <td className="py-2 text-slate-500">{s.lastScore ?? '—'}{s.lastScore !== null ? '%' : ''}</td>
                    <td className="py-2 flex flex-wrap gap-1">
                      {s.reasons.map((r) => (
                        <span key={r} className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-600 dark:bg-rose-950 dark:text-rose-300">{reasonLabel[r] || r}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Weakest skills + top wrong questions */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={card}>
          <h3 className="mb-3 font-bold text-slate-800 dark:text-white">🧩 أضعف المهارات (تشخيصي)</h3>
          {!skills?.weakest.length ? (
            <p className="text-sm text-slate-400">لا توجد بيانات كافية</p>
          ) : (
            <ul className="space-y-2">
              {skills.weakest.map((s) => (
                <li key={s.skillId || s.skillName} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-200">{s.skillName}</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">{s.avgPct}% <span className="text-[11px] font-normal text-slate-400">({s.sampleSize})</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={card}>
          <h3 className="mb-3 font-bold text-slate-800 dark:text-white">❌ أكثر المهارات خطأً (محاكية)</h3>
          {!errors?.topSkills.length ? (
            <p className="text-sm text-slate-400">لا توجد بيانات كافية</p>
          ) : (
            <ul className="space-y-2">
              {errors.topSkills.slice(0, 5).map((s) => (
                <li key={s.skillId} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-200">{s.skillId || 'غير محدد'}</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">{s.wrongPct}% <span className="text-[11px] font-normal text-slate-400">({s.wrong}/{s.total})</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Health score */}
      <div className={card}>
        <h3 className="mb-3 font-bold text-slate-800 dark:text-white">💚 مؤشر صحة الطالب (Health Score)</h3>
        {!health?.students.length ? (
          <p className="text-sm text-slate-400">لا توجد بيانات كافية</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 dark:text-slate-400">
                  <th className="pb-2">الطالب</th><th className="pb-2">المؤشر</th><th className="pb-2">النشاط</th><th className="pb-2">الأداء</th><th className="pb-2">التحسن</th>
                </tr>
              </thead>
              <tbody>
                {health.students.slice(0, 10).map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 text-slate-700 dark:text-slate-200">{s.name}</td>
                    <td className={`py-2 font-bold ${healthColor(s.healthScore)}`}>{s.healthScore}</td>
                    <td className="py-2 text-slate-500">{s.activityScore}</td>
                    <td className="py-2 text-slate-500">{s.performanceScore}</td>
                    <td className="py-2 text-slate-500">{s.improvementScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
