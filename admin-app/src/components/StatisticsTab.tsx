import { useMemo } from 'react';
import { useStore } from '../store/useStore';

export default function StatisticsTab() {
  const students = useStore((s) => s.students);
  const loadingCore = useStore((s) => s.loadingCore);
  const statusOf = useStore((s) => s.statusOf);
  const latestScoreOf = useStore((s) => s.latestScoreOf);

  const data = useMemo(() => {
    const total = students.length || 1;
    let finished = 0;
    let started = 0;
    let notStarted = 0;
    const scored: { name: string; score: number }[] = [];
    for (const s of students) {
      const st = statusOf(s.id);
      if (st === 'finished') finished++;
      else if (st === 'started') started++;
      else notStarted++;
      const score = latestScoreOf(s.id);
      if (score !== null) scored.push({ name: s.name, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return {
      finishedPct: Math.round((finished / total) * 100),
      startedPct: Math.round((started / total) * 100),
      notStartedPct: Math.round((notStarted / total) * 100),
      finished,
      started,
      notStarted,
      top: scored.slice(0, 5),
      bottom: scored.slice(-5).reverse(),
    };
  }, [students, statusOf, latestScoreOf]);

  if (loadingCore) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="skeleton h-64 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  if (!students.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900">
        لا توجد بيانات كافية لعرض الإحصائيات
      </div>
    );
  }

  const bars = [
    { label: 'انتهى', pct: data.finishedPct, count: data.finished, color: 'bg-emerald-500' },
    { label: 'بدأ', pct: data.startedPct, count: data.started, color: 'bg-amber-500' },
    { label: 'لم يبدأ', pct: data.notStartedPct, count: data.notStarted, color: 'bg-slate-400' },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="grid gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 font-bold text-slate-800 dark:text-white">🏆 الأعلى أداءً</h3>
          {data.top.length === 0 ? (
            <p className="text-sm text-slate-400">لا توجد نتائج بعد</p>
          ) : (
            <ul className="space-y-2">
              {data.top.map((p, i) => (
                <li key={p.name + i} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-200">{i + 1}. {p.name}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{p.score}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 font-bold text-slate-800 dark:text-white">📉 الأقل أداءً</h3>
          {data.bottom.length === 0 ? (
            <p className="text-sm text-slate-400">لا توجد نتائج بعد</p>
          ) : (
            <ul className="space-y-2">
              {data.bottom.map((p, i) => (
                <li key={p.name + i} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-200">{i + 1}. {p.name}</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">{p.score}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-4 font-bold text-slate-800 dark:text-white">توزيع حالة الاختبار</h3>
        <div className="space-y-4">
          {bars.map((b) => (
            <div key={b.label}>
              <div className="mb-1 flex justify-between text-sm text-slate-600 dark:text-slate-300">
                <span>{b.label}</span>
                <span>
                  {b.count} ({b.pct}%)
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full ${b.color} rounded-full transition-all duration-500`}
                  style={{ width: `${b.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
