import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';

interface RawAnswer {
  q: number | string;
  a: number | string | null;
  corr: number | string;
}

interface ResultRow {
  id: string;
  student_id: string;
  student_name: string;
  school: string;
  test_type: string;
  score: number;
  correct: number;
  total: number;
  answers: RawAnswer[];
  created_at: string;
}

const LETTER: Record<number, string> = { 1: 'أ', 2: 'ب', 3: 'ج', 4: 'د' };

function toLetter(v: number | string | null): string {
  if (v === null || v === undefined) return '—';
  if (v === 'dk') return '؟';
  return LETTER[Number(v)] ?? String(v);
}

function isCorrect(a: number | string | null, corr: number | string): boolean {
  if (a === null || a === undefined || a === 'dk') return false;
  return String(a) === String(corr);
}

export default function DiffTab() {
  const session = useStore((s) => s.session);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [error, setError] = useState('');
  const [testType, setTestType] = useState<'pre' | 'post'>('pre');
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    const school = session?.school && session.school !== '*' ? `&school=${encodeURIComponent(session.school)}` : '';
    api.get<{ results: ResultRow[] }>(`/test-results?withAnswers=1${school}`)
      .then(r => { setResults(r.results || []); setError(''); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [session]);

  // Latest result per student for selected test_type
  const latestByStudent = useMemo(() => {
    const map = new Map<string, ResultRow>();
    for (const r of results) {
      if (r.test_type !== testType) continue;
      if (!r.answers?.length) continue;
      const ex = map.get(r.student_id);
      if (!ex || r.created_at > ex.created_at) map.set(r.student_id, r);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.student_name.localeCompare(b.student_name, 'ar'),
    );
  }, [results, testType]);

  // All unique question numbers sorted
  const qnums = useMemo(() => {
    const set = new Set<number>();
    for (const r of latestByStudent) {
      for (const a of r.answers ?? []) set.add(Number(a.q));
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [latestByStudent]);

  // Correct answer per question (from first student who has it)
  const correctAnswers = useMemo(() => {
    const map = new Map<number, number | string>();
    for (const r of latestByStudent) {
      for (const a of r.answers ?? []) {
        if (!map.has(Number(a.q))) map.set(Number(a.q), a.corr);
      }
    }
    return map;
  }, [latestByStudent]);

  if (loading) {
    return (
      <div className="py-16 text-center text-slate-400">
        <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
        جاري تحميل الإجابات…
      </div>
    );
  }

  if (error) {
    return <div className="py-10 text-center text-rose-500">{error}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {(['pre', 'post'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTestType(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                testType === t
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {t === 'pre' ? 'اختبار قبلي' : 'اختبار بعدي'}
            </button>
          ))}
        </div>
        {latestByStudent.length > 0 && (
          <span className="text-sm text-slate-400">
            {latestByStudent.length} طالب · {qnums.length} سؤال
          </span>
        )}
      </div>

      {latestByStudent.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          لا توجد نتائج لهذا الاختبار بعد
        </div>
      ) : (
        <>
          {/* ── Compact grid view ── */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="sticky right-0 z-10 min-w-[56px] bg-slate-50 px-3 py-3 text-center text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    سؤال
                  </th>
                  <th className="sticky right-[56px] z-10 min-w-[48px] bg-slate-50 px-3 py-3 text-center text-xs font-semibold text-emerald-600 dark:bg-slate-800 dark:text-emerald-400">
                    ✓
                  </th>
                  {latestByStudent.map((r) => (
                    <th
                      key={r.student_id}
                      className="max-w-[72px] px-2 py-3 text-center text-xs font-medium text-slate-600 dark:text-slate-300"
                      title={r.student_name}
                    >
                      <div className="truncate" style={{ maxWidth: 72 }}>
                        {r.student_name.split(' ')[0]}
                      </div>
                      <div className="mt-0.5 text-[10px] font-normal text-indigo-500 dark:text-indigo-400">
                        {r.score}%
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qnums.map((qn) => {
                  const corrAns = correctAnswers.get(qn);
                  const isExpanded = expandedQ === qn;
                  return (
                    <tr
                      key={qn}
                      className={`cursor-pointer border-b border-slate-50 transition-colors last:border-0 dark:border-slate-800/50 ${
                        isExpanded
                          ? 'bg-indigo-50 dark:bg-indigo-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                      }`}
                      onClick={() => setExpandedQ(isExpanded ? null : qn)}
                    >
                      {/* Question number */}
                      <td className="sticky right-0 z-10 min-w-[56px] bg-inherit px-3 py-2 text-center text-xs font-bold text-slate-700 dark:text-slate-200">
                        {qn}
                      </td>
                      {/* Correct answer */}
                      <td className="sticky right-[56px] z-10 min-w-[48px] bg-inherit px-3 py-2 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {corrAns !== undefined ? toLetter(corrAns) : '—'}
                      </td>
                      {/* Each student's answer */}
                      {latestByStudent.map((r) => {
                        const ans = r.answers?.find((a) => Number(a.q) === qn);
                        if (!ans || ans.a === null || ans.a === undefined) {
                          return (
                            <td
                              key={r.student_id}
                              className="px-2 py-2 text-center text-xs text-slate-300 dark:text-slate-600"
                            >
                              —
                            </td>
                          );
                        }
                        const corr = isCorrect(ans.a, ans.corr);
                        return (
                          <td
                            key={r.student_id}
                            className={`px-2 py-2 text-center text-xs font-bold ${
                              ans.a === 'dk'
                                ? 'text-slate-400 dark:text-slate-500'
                                : corr
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-500 dark:text-rose-400'
                            }`}
                          >
                            {toLetter(ans.a)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              {/* Score summary footer */}
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  <td
                    colSpan={2}
                    className="sticky right-0 z-10 bg-slate-50 px-3 py-2.5 text-center text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  >
                    النتيجة
                  </td>
                  {latestByStudent.map((r) => (
                    <td
                      key={r.student_id}
                      className={`px-2 py-2.5 text-center text-xs font-bold ${
                        r.score >= 70
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : r.score >= 50
                          ? 'text-amber-500 dark:text-amber-400'
                          : 'text-rose-500 dark:text-rose-400'
                      }`}
                    >
                      {r.score}%
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-slate-400 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <span className="font-bold text-emerald-600 dark:text-emerald-400">أ</span>
              إجابة صحيحة
            </span>
            <span className="flex items-center gap-1">
              <span className="font-bold text-rose-500 dark:text-rose-400">أ</span>
              إجابة خاطئة
            </span>
            <span className="flex items-center gap-1">
              <span className="text-slate-400">؟</span>
              ما أعرف
            </span>
            <span className="flex items-center gap-1">
              <span>—</span>
              ما أجاب
            </span>
            <span className="flex items-center gap-1">
              <span className="font-bold text-emerald-600 dark:text-emerald-400">✓</span>
              الإجابة الصحيحة للسؤال
            </span>
          </div>
        </>
      )}
    </div>
  );
}
