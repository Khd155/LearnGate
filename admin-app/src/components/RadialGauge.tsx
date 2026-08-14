import { cn } from '../lib/cn';

type Tone = 'default' | 'danger' | 'warn' | 'good';

const toneStroke: Record<Tone, string> = {
  default: '#6366f1',
  danger: '#e11d48',
  warn: '#d97706',
  good: '#10b981',
};

const toneText: Record<Tone, string> = {
  default: 'text-indigo-600 dark:text-indigo-400',
  danger: 'text-rose-600 dark:text-rose-400',
  warn: 'text-amber-600 dark:text-amber-400',
  good: 'text-emerald-600 dark:text-emerald-400',
};

function toneFor(pct: number, invert = false): Tone {
  const p = invert ? 100 - pct : pct;
  if (p >= 70) return 'good';
  if (p >= 40) return 'warn';
  return 'danger';
}

/**
 * Circular gauge for a single 0-100 rate. `invert` means "lower is better"
 * (e.g. at-risk rate) so the color bands flip.
 */
export default function RadialGauge({
  label,
  pct,
  hint,
  size = 96,
  stroke = 10,
  invert = false,
  tone,
  valueLabel,
}: {
  label: string;
  pct: number | null;
  hint?: string;
  size?: number;
  stroke?: number;
  invert?: boolean;
  tone?: Tone;
  valueLabel?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * c;
  const resolvedTone = tone ?? (pct === null ? 'default' : toneFor(clamped, invert));

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-100 dark:text-slate-800" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={toneStroke[resolvedTone]}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-lg font-extrabold leading-none', toneText[resolvedTone])}>
            {valueLabel ?? (pct === null ? '—' : `${pct}%`)}
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{label}</p>
        {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}
