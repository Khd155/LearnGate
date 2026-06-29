import { cn } from '../lib/cn';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  gradient: string;
  deltaPct?: number;
}

export default function StatCard({ label, value, icon, gradient, deltaPct }: StatCardProps) {
  const hasDelta = typeof deltaPct === 'number';
  const isUp = (deltaPct ?? 0) >= 0;

  return (
    <div
      className={cn(
        'card-hover group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900',
      )}
    >
      <div
        className={cn(
          'absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br opacity-20 blur-2xl transition-opacity group-hover:opacity-30',
          gradient,
        )}
      />
      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900 dark:text-white">{value}</p>
          {hasDelta && (
            <p
              className={cn(
                'mt-1 flex items-center gap-1 text-xs font-bold',
                isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
              )}
            >
              <span>{isUp ? '▲' : '▼'}</span>
              <span>{Math.abs(deltaPct ?? 0)}% آخر 7 أيام</span>
            </p>
          )}
        </div>
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xl shadow-inner',
            gradient,
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
