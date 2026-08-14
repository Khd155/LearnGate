import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { testStatusColor, testStatusLabel } from '../lib/status';
import type { Plan, PlanGap } from '../types';

function planScore(p: Plan): number | null {
  const gaps = Array.isArray(p.gaps) ? (p.gaps as PlanGap[]) : [];
  return gaps.length ? Math.round(gaps.reduce((s, g) => s + g.pct, 0) / gaps.length) : null;
}

function levelColor(pct: number | null): string {
  if (pct === null) return 'bg-slate-100 text-slate-500';
  if (pct <= 30) return 'bg-rose-100 text-rose-700';
  if (pct <= 49) return 'bg-amber-100 text-amber-700';
  if (pct <= 70) return 'bg-sky-100 text-sky-700';
  return 'bg-emerald-100 text-emerald-700';
}

const card = 'rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900';

export default function StudentProfilePage() {
  const profileStudentId = useStore((s) => s.profileStudentId);
  const students = useStore((s) => s.students);
  const testResults = useStore((s) => s.testResults);
  const statusOf = useStore((s) => s.statusOf);
  const setTab = useStore((s) => s.setTab);
  const setConversationFocusStudentId = useStore((s) => s.setConversationFocusStudentId);
  const threads = useStore((s) => s.threads);
  const loadThreads = useStore((s) => s.loadThreads);
  const messagesByStudent = useStore((s) => s.messagesByStudent);
  const messagesLoading = useStore((s) => s.messagesLoading);
  const loadMessages = useStore((s) => s.loadMessages);
  const sendMessage = useStore((s) => s.sendMessage);

  const student = useMemo(() => students.find((s) => s.id === profileStudentId) || null, [students, profileStudentId]);

  const [history, setHistory] = useState<Plan[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  useEffect(() => {
    if (!profileStudentId) return;
    setHistory(null);
    setHistoryLoading(true);
    api
      .get<{ plans: Plan[] }>(`/plans/history?studentId=${encodeURIComponent(profileStudentId)}`)
      .then((res) => setHistory(res.plans || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
    loadMessages(profileStudentId);
  }, [profileStudentId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [profileStudentId]);

  if (!student) {
    return (
      <div className={card}>
        <p className="text-sm text-slate-500">تعذّر إيجاد بيانات هذا الطالب.</p>
        <button
          type="button"
          onClick={() => setTab('students')}
          className="mt-3 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          ← العودة لقائمة الطلاب
        </button>
      </div>
    );
  }

  const status = statusOf(student.id);
  const colors = testStatusColor(status);

  // Trajectory: chronological attempts oldest → newest (history comes newest-first)
  const attemptsAsc = [...(history || [])].reverse();
  const trajectory = attemptsAsc
    .map((p, i) => ({ index: i + 1, score: planScore(p), date: p.created_at }))
    .filter((t) => t.score !== null);
  const firstScore = trajectory[0]?.score ?? null;
  const lastScore = trajectory[trajectory.length - 1]?.score ?? null;
  const improvement = firstScore !== null && lastScore !== null ? lastScore - firstScore : null;

  const latestGeneralTests = testResults
    .filter((t) => t.student_id === student.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const thread = threads.find((t) => t.student_id === student.id);
  const messages = messagesByStudent[student.id] || [];

  const handleSend = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await sendMessage(student.id, draft.trim());
      setDraft('');
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch {
      /* toast already pushed */
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setTab('students')}
          className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          → العودة للطلاب
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setConversationFocusStudentId(student.id);
              setTab('conversations');
            }}
            className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
          >
            💬 فتح المحادثة الكاملة
          </button>
        </div>
      </div>

      {/* Zone: basic info */}
      <div className={cn(card, 'flex flex-wrap items-center gap-x-8 gap-y-3')}>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{student.name}</h2>
          <p className="text-sm text-slate-400">
            {student.school || '—'} · رقم الدخول <span className="font-mono">{student.code}</span> · {student.phone || 'بدون جوال'}
          </p>
        </div>
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', colors.bg, colors.text)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', colors.dot)} />
          {testStatusLabel(status)}
        </span>
        {improvement !== null && (
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-bold',
              improvement > 0
                ? 'bg-emerald-100 text-emerald-700'
                : improvement < 0
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-slate-100 text-slate-600',
            )}
          >
            {improvement > 0 ? '▲' : improvement < 0 ? '▼' : '—'} تحسّن {improvement > 0 ? '+' : ''}{improvement}% منذ أول محاولة
          </span>
        )}
        <span className="text-xs text-slate-400">عضو منذ {new Date(student.created_at).toLocaleDateString('ar-SA')}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          {/* Trajectory */}
          <div className={card}>
            <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">📈 مسار التحسّن (مقارنة ذاتية بين المحاولات)</h3>
            {trajectory.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">لا توجد محاولات مكتملة بعد لعرض المسار</p>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {trajectory.map((t, i) => (
                  <div key={i} className="flex shrink-0 items-center gap-2">
                    <div className="flex flex-col items-center">
                      <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', levelColor(t.score))}>{t.score}%</span>
                      <span className="mt-1 text-[10px] text-slate-400">قدرات {t.index}</span>
                    </div>
                    {i < trajectory.length - 1 && <span className="text-slate-300">→</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All attempts (diagnostic full history) */}
          <div className={card}>
            <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">📋 كل محاولات الاختبار التشخيصي (اختبار القدرات)</h3>
            {historyLoading ? (
              <div className="space-y-2">
                <div className="skeleton h-12 rounded-xl" />
                <div className="skeleton h-12 rounded-xl" />
              </div>
            ) : !history?.length ? (
              <p className="py-6 text-center text-sm text-slate-400">لا يوجد نشاط مسجّل لهذا الطالب</p>
            ) : (
              <div className="space-y-2">
                {history.map((p, idx) => {
                  const score = planScore(p);
                  const attemptNumber = history.length - idx;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <span className="min-w-[72px] text-sm font-semibold text-slate-700 dark:text-slate-200">قدرات {attemptNumber}</span>
                      <span className="flex-1 text-xs text-slate-400">{new Date(p.created_at).toLocaleString('ar-SA')}</span>
                      {score !== null ? (
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', levelColor(score))}>{score}%</span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs text-slate-400 dark:bg-slate-700">لم يكتمل</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* General/quiz tests */}
          {latestGeneralTests.length > 0 && (
            <div className={card}>
              <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">🧪 نتائج الاختبارات القصيرة</h3>
              <div className="space-y-2">
                {latestGeneralTests.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <span className="flex-1 text-xs text-slate-400">{new Date(t.created_at).toLocaleString('ar-SA')}</span>
                    <span className="text-slate-600 dark:text-slate-300">{t.correct}/{t.total}</span>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', levelColor(t.score))}>{Math.round(t.score)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity log gap note */}
          <div className={cn(card, 'border-dashed')}>
            <h3 className="mb-1 text-sm font-bold text-slate-700 dark:text-slate-200">🕒 سجل النشاط (Activity Timeline)</h3>
            <p className="text-xs text-slate-400">
              لا توجد حاليًا واجهة API متاحة لدور الإدارة تُرجع جدول <code dir="ltr">logs</code> مفلترًا حسب طالب محدد — نقطة
              النهاية الوحيدة القادرة على قراءة هذا الجدول (<code dir="ltr">GET /api/dev/logs</code>) مقصورة على دور{' '}
              <code dir="ltr">dev</code> فقط ولا تقبل معامل <code dir="ltr">student_id</code>. تمت الإشارة إلى هذا كفجوة بيانات
              بدل إضافة أو تعديل واجهة برمجية، التزامًا بقيد "عدم إنشاء واجهات جديدة إلا للضرورة القصوى".
            </p>
          </div>
        </div>

        {/* Inline messages panel */}
        <div className={cn(card, 'flex h-[560px] flex-col p-0')}>
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">💬 المحادثة</h3>
            {thread ? (
              <p className="text-[11px] text-slate-400">
                آخر رسالة {new Date(thread.last_at).toLocaleString('ar-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400">لا توجد محادثة سابقة مع هذا الطالب</p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {messagesLoading ? (
              <div className="space-y-2">
                <div className="skeleton h-10 w-2/3 rounded-xl" />
                <div className="skeleton ms-auto h-10 w-1/2 rounded-xl" />
              </div>
            ) : messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">لا توجد رسائل بعد</p>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className={cn('flex', m.sender_type === 'admin' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                        m.sender_type === 'admin'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
                      )}
                    >
                      <p>{m.body}</p>
                      <p className={cn('mt-1 text-[10px] opacity-70', m.sender_type === 'admin' ? 'text-indigo-100' : 'text-slate-400')}>
                        {new Date(m.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="اكتب رسالة…"
              maxLength={2000}
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {sending ? '…' : 'إرسال'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
