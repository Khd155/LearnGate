import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import StatCard from './StatCard';

interface CardDef {
  label: string;
  value: string | number;
  icon: string;
  gradient: string;
  deltaPct?: number;
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
  const apiStats = useStore((s) => s.stats);

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
    {
      label: 'إجمالي الطلاب',
      value: stats.total,
      icon: '👥',
      gradient: 'from-indigo-500 to-indigo-400',
      deltaPct: apiStats?.cards.students.deltaPct,
    },
    { label: 'أنهوا الاختبار', value: stats.finished, icon: '✅', gradient: 'from-emerald-500 to-emerald-400' },
    { label: 'لم يبدأوا', value: stats.notStarted, icon: '⏳', gradient: 'from-amber-500 to-amber-400' },
    {
      label: 'متوسط الدرجات',
      value: `${stats.avg}%`,
      icon: '📈',
      gradient: 'from-fuchsia-500 to-fuchsia-400',
      deltaPct: apiStats?.cards.avgScore.deltaPct,
    },
    {
      label: 'خطط دراسية نشطة',
      value: apiStats?.cards.plansActive.value ?? '—',
      icon: '📋',
      gradient: 'from-cyan-500 to-cyan-400',
      deltaPct: apiStats?.cards.plansActive.deltaPct,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} gradient={c.gradient} deltaPct={c.deltaPct} />
      ))}
    </div>
  );
}
