import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/cn';
import type { Plan, PlanGap } from '../types';

type TypeFilter = 'all' | 'verbal' | 'quantitative' | 'both';

function planScore(gaps: PlanGap[], category?: 'verbal' | 'quantitative'): number | null {
  const filtered = category ? gaps.filter((g) => g.category === category) : gaps;
  return filtered.length ? Math.round(filtered.reduce((s, g) => s + g.pct, 0) / filtered.length) : null;
}

interface Ranked {
  studentId: string;
  name: string;
  delta: number;
  latestScore: number;
  type: 'verbal' | 'quantitative' | 'both';
}

const TYPE_LABEL: Record<Ranked['type'], string> = { verbal: 'لفظي', quantitative: 'كمي', both: 'كلاهما' };
const MEDALS = ['🥇', '🥈', '🥉'];

export default function TopImprovingStudents() {
  const students = useStore((s) => s.students);
  const plans = useStore((s) => s.plans);
  const [limit, setLimit] = useState<5 | 10>(5);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const ranked = useMemo<Ranked[]>(() => {
    const byStudent = new Map<string, Plan[]>();
    for (const p of plans) {
      if (!byStudent.has(p.student_id)) byStudent.set(p.student_id, []);
      byStudent.get(p.student_id)!.push(p);
    }
    const nameOf = new Map(students.map((s) => [s.id, s.name]));

    const rows: Ranked[] = [];
    for (const [studentId, studentPlans] of byStudent) {
      const sorted = [...studentPlans].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      if (sorted.length < 2) continue;
      const latestGaps = Array.isArray(sorted[0].gaps) ? (sorted[0].gaps as PlanGap[]) : [];
      const prevGaps = Array.isArray(sorted[1].gaps) ? (sorted[1].gaps as PlanGap[]) : [];
      const latestScore = planScore(latestGaps);
      const prevScore = planScore(prevGaps);
      if (latestScore === null || prevScore === null) continue;

      const hasVerbal = latestGaps.some((g) => g.category === 'verbal');
      const hasQuant = latestGaps.some((g) => g.category === 'quantitative');
      const type: Ranked['type'] = hasVerbal && hasQuant ? 'both' : hasVerbal ? 'verbal' : 'quantitative';

      rows.push({ studentId, name: nameOf.get(studentId) || 'طالب', delta: latestScore - prevScore, latestScore, type });
    }

    const filtered = typeFilter === 'all' ? rows : rows.filter((r) => r.type === typeFilter || r.type === 'both');
    return filtered.sort((a, b) => b.delta - a.delta).slice(0, limit);
  }, [students, plans, limit, typeFilter]);

  if (!plans.length) return null;

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white">
          <span>🏆</span> أفضل الطلاب تقدمًا
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <option value="all">كل الأقسام</option>
            <option value="verbal">لفظي</option>
            <option value="quantitative">كمي</option>
            <option value="both">كلاهما</option>
          </select>
          <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            {([5, 10] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLimit(n)}
                className={cn(
                  'px-2.5 py-1.5 text-xs font-bold transition',
                  limit === n
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {ranked.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">لا توجد بيانات تقدّم كافية بعد (تحتاج محاولتين على الأقل)</p>
      ) : (
        <div className="space-y-2">
          {ranked.map((r, i) => {
            const isUp = r.delta >= 0;
            return (
              <div
                key={r.studentId}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3',
                  i < 3
                    ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20'
                    : 'border-slate-100 dark:border-slate-800',
                )}
              >
                <span className="w-7 shrink-0 text-center text-lg">{i < 3 ? MEDALS[i] : i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{r.name}</span>
                    <span
                      className={cn(
                        'flex shrink-0 items-center gap-1 text-xs font-extrabold',
                        isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                      )}
                    >
                      {isUp ? '↑' : '↓'} {isUp ? '+' : ''}
                      {r.delta}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-indigo-500 to-indigo-400"
                      style={{ width: `${r.latestScore}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{TYPE_LABEL[r.type]}</span>
                    <span>{r.latestScore}% حاليًا</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
