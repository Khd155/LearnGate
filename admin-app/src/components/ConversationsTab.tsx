import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/cn';

export default function ConversationsTab() {
  const threads = useStore((s) => s.threads);
  const threadsLoading = useStore((s) => s.threadsLoading);
  const loadThreads = useStore((s) => s.loadThreads);
  const activeThreadStudentId = useStore((s) => s.activeThreadStudentId);
  const setActiveThreadStudentId = useStore((s) => s.setActiveThreadStudentId);
  const conversationFocusStudentId = useStore((s) => s.conversationFocusStudentId);
  const setConversationFocusStudentId = useStore((s) => s.setConversationFocusStudentId);
  const messagesByStudent = useStore((s) => s.messagesByStudent);
  const messagesLoading = useStore((s) => s.messagesLoading);
  const loadMessages = useStore((s) => s.loadMessages);
  const sendMessage = useStore((s) => s.sendMessage);
  const students = useStore((s) => s.students);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (conversationFocusStudentId) {
      setActiveThreadStudentId(conversationFocusStudentId);
      setConversationFocusStudentId(null);
    }
  }, [conversationFocusStudentId, setActiveThreadStudentId, setConversationFocusStudentId]);

  useEffect(() => {
    if (activeThreadStudentId) loadMessages(activeThreadStudentId);
  }, [activeThreadStudentId, loadMessages]);

  const messages = activeThreadStudentId ? messagesByStudent[activeThreadStudentId] || [] : [];

  const prevThreadRef = useRef<string | null>(null);
  useEffect(() => {
    // Always jump to the bottom when switching to a different thread, but
    // for a refresh within the same thread (real-time event, poll) only
    // auto-scroll if the admin is already near the bottom — otherwise it
    // yanks them back down while they're scrolled up reading older messages.
    const switchedThread = prevThreadRef.current !== activeThreadStudentId;
    prevThreadRef.current = activeThreadStudentId;
    const el = messagesScrollRef.current;
    const nearBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (switchedThread || nearBottom) bottomRef.current?.scrollIntoView({ behavior: switchedThread ? 'auto' : 'smooth' });
  }, [messages.length, activeThreadStudentId]);

  const activeStudentName =
    threads.find((t) => t.student_id === activeThreadStudentId)?.student_name ||
    students.find((s) => s.id === activeThreadStudentId)?.name ||
    '';

  const handleSend = async () => {
    if (!draft.trim() || !activeThreadStudentId) return;
    setSending(true);
    try {
      await sendMessage(activeThreadStudentId, draft.trim());
      setDraft('');
    } catch {
      /* toast already pushed by store */
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid h-[calc(100vh-200px)] min-h-[420px] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-[280px_1fr] dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-y-auto overscroll-contain border-e border-slate-200 dark:border-slate-800">
        {threadsLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-xl" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">لا توجد محادثات بعد</p>
        ) : (
          threads.map((t) => (
            <button
              key={t.student_id}
              type="button"
              onClick={() => setActiveThreadStudentId(t.student_id)}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-4 py-3 text-start transition dark:border-slate-800',
                activeThreadStudentId === t.student_id
                  ? 'bg-indigo-50 dark:bg-indigo-950/40'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-medium text-slate-800 dark:text-slate-100">{t.student_name}</span>
                {t.unread > 0 && (
                  <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {t.unread}
                  </span>
                )}
              </div>
              <span className="line-clamp-1 text-xs text-slate-400">{t.last_msg}</span>
              <span className="text-[10px] text-slate-300 dark:text-slate-600">
                {new Date(t.last_at).toLocaleString('ar-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="flex flex-col">
        {!activeThreadStudentId ? (
          <div className="flex flex-1 items-center justify-center text-slate-400">اختر محادثة لعرضها</div>
        ) : (
          <>
            <div className="border-b border-slate-200 px-4 py-3 font-bold text-slate-800 dark:border-slate-800 dark:text-white">
              {activeStudentName}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-4" ref={messagesScrollRef}>
              {messagesLoading ? (
                <div className="space-y-2">
                  <div className="skeleton h-10 w-2/3 rounded-xl" />
                  <div className="skeleton ms-auto h-10 w-1/2 rounded-xl" />
                </div>
              ) : messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">لا توجد رسائل</p>
              ) : (
                <>
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn('flex', m.sender_type === 'admin' ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[70%] rounded-2xl px-4 py-2 text-sm break-words',
                          m.sender_type === 'admin'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
                        )}
                      >
                        <p>{m.body}</p>
                        <p
                          className={cn(
                            'mt-1 flex items-center gap-1 text-[10px] opacity-70',
                            m.sender_type === 'admin' ? 'justify-end text-indigo-100' : 'text-slate-400',
                          )}
                        >
                          <span>{new Date(m.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
                          {/* Read receipt — only meaningful (and only shown) on the admin's own
                              sent messages: it tells the admin whether the student has read it.
                              A student's own messages never carry this, since is_read there tracks
                              the admin's read state, not something the student needs to see. */}
                          {m.sender_type === 'admin' && (
                            <span title={m.is_read ? 'قرأها الطالب' : 'لم يقرأها الطالب بعد'}>
                              {m.is_read ? (
                                <svg width="14" height="10" viewBox="0 0 16 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M1 5.5 4.5 9 11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                  <path d="M5.5 5.5 9 9 15.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : (
                                <svg width="12" height="10" viewBox="0 0 13 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M1 5.5 4.5 9 11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </>
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
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {sending ? '…' : 'إرسال'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
