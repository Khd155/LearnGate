import { cn } from '../lib/cn';

type Tone = 'default' | 'danger' | 'warn' | 'good';

const toneText: Record<Tone, string> = {
  default: 'text-indigo-600 dark:text-indigo-400',
  danger: 'text-rose-600 dark:text-rose-400',
  warn: 'text-amber-600 dark:text-amber-400',
  good: 'text-emerald-600 dark:text-emerald-400',
};
const toneChipBg: Record<Tone, string> = {
  default: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300',
  danger: 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300',
  warn: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300',
  good: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300',
};
const toneArrow: Record<Tone, string> = { good: '▲', warn: '—', danger: '▼', default: '' };

function toneFor(pct: number, invert = false): Tone {
  const p = invert ? 100 - pct : pct;
  if (p >= 70) return 'good';
  if (p >= 40) return 'warn';
  return 'danger';
}

/**
 * A rate/KPI card — replaces the old row of circular RadialGauges with a
 * readable stats-grid card (label + big number + trend badge). Pass `hero`
 * for the one standout metric of a page (larger, own row); every other
 * card uses the compact variant.
 */
export default function StatCard({
  label,
  pct,
  valueLabel,
  hint,
  invert = false,
  tone,
  hero = false,
  icon,
}: {
  label: string;
  pct: number | null;
  valueLabel?: string;
  hint?: string;
  invert?: boolean;
  tone?: Tone;
  hero?: boolean;
  icon?: string;
}) {
  const resolvedTone = tone ?? (pct === null ? 'default' : toneFor(pct, invert));
  const display = valueLabel ?? (pct === null ? '—' : `${pct}%`);

  if (hero) {
    return (
      <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
            {icon && <span className="me-1">{icon}</span>}
            {label}
          </p>
          {pct !== null && (
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', toneChipBg[resolvedTone])}>
              {toneArrow[resolvedTone]}
            </span>
          )}
        </div>
        <p className={cn('mt-2 text-4xl font-extrabold leading-none', toneText[resolvedTone])}>{display}</p>
        {hint && <p className="mt-2 text-xs text-slate-400">{hint}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
          {icon && <span className="me-1">{icon}</span>}
          {label}
        </p>
        {pct !== null && (
          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', toneChipBg[resolvedTone])}>
            {toneArrow[resolvedTone]}
          </span>
        )}
      </div>
      <p className={cn('mt-2 text-2xl font-extrabold', toneText[resolvedTone])}>{display}</p>
      {hint && <p className="mt-1 truncate text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
