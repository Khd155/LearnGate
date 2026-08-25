import { useState } from 'react';
import { useStore } from '../store/useStore';

/**
 * Inline "send a quick reminder" control for the Dashboard's "يحتاج إجراءً
 * اليوم" rows — expands a small text field in place instead of navigating
 * to the full conversation screen. Reuses the store's existing
 * `sendMessage(studentId, body)` (same call the Student Profile page's own
 * composer uses) — no new API.
 */
export default function QuickSendButton({ studentId, defaultText }: { studentId: string; defaultText: string }) {
  const sendMessage = useStore((s) => s.sendMessage);
  const pushToast = useStore((s) => s.pushToast);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(defaultText);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(studentId, text.trim());
      pushToast('success', 'تم إرسال التذكير');
      setOpen(false);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل الإرسال');
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setText(defaultText);
          setOpen(true);
        }}
        title="إرسال تذكير سريع"
        className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300"
      >
        ⚡
      </button>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') send();
          if (e.key === 'Escape') setOpen(false);
        }}
        autoFocus
        className="w-32 min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white sm:w-44"
      />
      <button
        type="button"
        onClick={send}
        disabled={sending || !text.trim()}
        className="shrink-0 rounded-lg bg-indigo-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {sending ? '…' : 'إرسال'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="shrink-0 text-[11px] text-slate-400 hover:text-slate-600">
        إلغاء
      </button>
    </div>
  );
}
