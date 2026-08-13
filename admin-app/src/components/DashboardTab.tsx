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
import { cn } from '../lib/cn';
import StudentModal from './StudentModal';
import type { Student } from '../types';

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

function KpiCard({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'default' | 'danger' | 'warn' | 'good' }) {
  const toneClass =
    tone === 'danger'
      ? 'text-rose-600 dark:text-rose-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'good'
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-slate-800 dark:text-white';
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold leading-none', toneClass)}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
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
  const pushToast = useStore((s) => s.pushToast);
  const threads = useStore((s) => s.threads);
  const loadThreads = useStore((s) => s.loadThreads);

  const [loading, setLoading] = useState(true);
  const [atRisk, setAtRisk] = useState<AtRiskRes | null>(null);
  const [activity, setActivity] = useState<ActivityRes | null>(null);
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    const schoolQuery = session?.school && session.school !== '*' ? `?school=${encodeURIComponent(session.school)}` : '';
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<AtRiskRes>(`/analytics/at-risk${schoolQuery}`),
      api.get<ActivityRes>(`/analytics/activity${schoolQuery}`),
    ])
      .then(([a, ac]) => {
        if (cancelled) return;
        setAtRisk(a);
        setActivity(ac);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.school]);

  const kpis = useMemo(() => {
    const total = students.length;
    let finished = 0;
    let notStarted = 0;
    for (const s of students) {
      const st = statusOf(s.id);
      if (st === 'finished') finished++;
      if (st === 'not_started') notStarted++;
    }
    // "active" = logged in / touched activity within 0-3 days per /analytics/activity buckets
    const activeCount = (activity?.active.count ?? 0) + (activity?.medium.count ?? 0);
    const neverLoggedIn = atRisk?.neverStarted.count ?? 0;
    return {
      total,
      active: activeCount,
      neverLoggedIn,
      neverStartedDiagnostic: notStarted,
      atRisk: atRisk?.total ?? 0,
    };
  }, [students, statusOf, activity, atRisk]);

  const needsIntervention = useMemo(() => {
    const list = atRisk?.students ?? [];
    return list.slice(0, 8);
  }, [atRisk]);

  const recentThreads = useMemo(() => threads.slice(0, 5), [threads]);

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

  return (
    <div className="space-y-4">
      {/* Compact KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="إجمالي الطلاب" value={kpis.total} />
        <KpiCard label="نشط (٠-٣ أيام)" value={kpis.active} tone="good" />
        <KpiCard label="لم يسجّل دخول قط" value={kpis.neverLoggedIn} tone={kpis.neverLoggedIn ? 'warn' : 'default'} />
        <KpiCard label="لم يبدأ التشخيصي" value={kpis.neverStartedDiagnostic} tone={kpis.neverStartedDiagnostic ? 'warn' : 'default'} />
        <KpiCard label="يحتاجون تدخل" value={kpis.atRisk} tone={kpis.atRisk ? 'danger' : 'default'} />
        <KpiCard label="متوسط الدرجات" value={stats ? `${Math.round(stats.cards.avgScore.value ?? 0)}%` : '—'} />
      </div>

      {/* Real activity chart */}
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

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Needs intervention list */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">
            يحتاجون تدخلاً {atRisk ? `(أعلى ${needsIntervention.length} من ${atRisk.total})` : ''}
          </h3>
          {needsIntervention.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">لا يوجد طلاب يحتاجون تدخل حاليًا 🎉</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {needsIntervention.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span>{severityChip(s.reasons)}</span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-700 dark:text-slate-200">{s.name}</p>
                      <p className="truncate text-[11px] text-slate-400">
                        {s.reasons.map((r) => reasonMeta[r]?.label || r).join(' · ')} ·{' '}
                        {s.daysSinceActive === null ? 'لا نشاط' : `آخر نشاط منذ ${s.daysSinceActive} يوم`} ·{' '}
                        {s.lastScore !== null ? `آخر درجة ${s.lastScore}%` : 'بدون درجة'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setConversationFocusStudentId(s.id);
                        setTab('conversations');
                      }}
                      className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
                    >
                      💬 رسالة
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const full = students.find((st) => st.id === s.id);
                        if (full) setDetailStudent(full);
                        else pushToast('error', 'تعذّر إيجاد بيانات الطالب الكاملة');
                      }}
                      className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    >
                      تفاصيل
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!!atRisk?.neverStarted.count && (
            <button
              type="button"
              onClick={() => {
                setBroadcastPrefillIds(atRisk.neverStarted.students.map((s) => s.id));
                setTab('broadcast');
              }}
              className="mt-3 w-full rounded-lg bg-amber-500 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
            >
              📣 تذكير جماعي لمن لم يبدأ ({atRisk.neverStarted.count})
            </button>
          )}
        </div>

        {/* Last 5 conversations */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">آخر المحادثات</h3>
          {recentThreads.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">لا توجد محادثات بعد</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentThreads.map((t) => (
                <li key={t.student_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setConversationFocusStudentId(t.student_id);
                      setTab('conversations');
                    }}
                    className="flex w-full items-center justify-between gap-2 py-2.5 text-start text-sm hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-700 dark:text-slate-200">{t.student_name}</p>
                      <p className="truncate text-[11px] text-slate-400">{t.last_msg}</p>
                    </div>
                    {t.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {t.unread}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <StudentModal
        student={detailStudent}
        onOpenChange={(o) => !o && setDetailStudent(null)}
        onMessage={(st) => {
          setConversationFocusStudentId(st.id);
          setTab('conversations');
          setDetailStudent(null);
        }}
      />
    </div>
  );
}
