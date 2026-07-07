import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/cn';

interface CardDef {
  label: string;
  value: string | number;
  icon: string;
  gradient: string;
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-28 rounded-2xl" />
      ))}
    </div>
  );
}

export default function StatsCards() {
  const students = useStore((s) => s.students);
  const loadingCore = useStore((s) => s.loadingCore);
  const statusOf = useStore((s) => s.statusOf);
  const latestScoreOf = useStore((s) => s.latestScoreOf);

  const stats = useMemo(() => {
    const total = students.length;
    let finished = 0;
    let notStarted = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    for (const s of students) {
      const status = statusOf(s.id);
      if (status === 'finished') finished++;
      if (status === 'not_started') notStarted++;
      const score = latestScoreOf(s.id);
      if (score !== null) {
        scoreSum += score;
        scoreCount++;
      }
    }
    const avg = scoreCount ? Math.round(scoreSum / scoreCount) : 0;
    return { total, finished, notStarted, avg };
  }, [students, statusOf, latestScoreOf]);

  if (loadingCore) return <Skeleton />;

  const cards: CardDef[] = [
    { label: 'إجمالي الطلاب', value: stats.total, icon: '👥', gradient: 'from-indigo-500 to-indigo-400' },
    { label: 'أنهوا الاختبار', value: stats.finished, icon: '✅', gradient: 'from-emerald-500 to-emerald-400' },
    { label: 'لم يبدأوا', value: stats.notStarted, icon: '⏳', gradient: 'from-amber-500 to-amber-400' },
    { label: 'متوسط الدرجات', value: `${stats.avg}%`, icon: '📈', gradient: 'from-fuchsia-500 to-fuchsia-400' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className={cn(
            'group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900',
          )}
        >
          <div
            className={cn(
              'absolute -left-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br opacity-20 blur-2xl transition-opacity group-hover:opacity-30',
              c.gradient,
            )}
          />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{c.label}</p>
              <p className="mt-1 text-3xl font-extrabold text-slate-900 dark:text-white">{c.value}</p>
            </div>
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-xl shadow-inner',
                c.gradient,
              )}
            >
              {c.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
