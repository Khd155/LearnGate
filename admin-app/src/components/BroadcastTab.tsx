import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useStore } from '../store/useStore';
import ConfirmDialog from './ConfirmDialog';
import { adminLabel } from '../lib/adminLabel';

const MAX_LEN = 500;

export default function BroadcastTab() {
  const broadcasts = useStore((s) => s.broadcasts);
  const broadcastsLoading = useStore((s) => s.broadcastsLoading);
  const loadBroadcasts = useStore((s) => s.loadBroadcasts);
  const sendBroadcast = useStore((s) => s.sendBroadcast);
  const deleteBroadcast = useStore((s) => s.deleteBroadcast);
  const pushToast = useStore((s) => s.pushToast);
  const students = useStore((s) => s.students);
  const broadcastPrefillIds = useStore((s) => s.broadcastPrefillIds);
  const setBroadcastPrefillIds = useStore((s) => s.setBroadcastPrefillIds);

  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'all' | 'selected'>('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  useEffect(() => {
    loadBroadcasts();
  }, [loadBroadcasts]);

  useEffect(() => {
    if (broadcastPrefillIds && broadcastPrefillIds.length) {
      setMode('selected');
      setPickedIds(new Set(broadcastPrefillIds));
      setBroadcastPrefillIds(null);
    }
  }, [broadcastPrefillIds, setBroadcastPrefillIds]);

  const filteredStudents = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q) || s.code.includes(q));
  }, [students, pickerSearch]);

  const send = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 3) {
      pushToast('error', 'الرسالة قصيرة جداً (الحد الأدنى 3 أحرف)');
      return;
    }
    if (mode === 'selected' && pickedIds.size === 0) {
      pushToast('error', 'اختر طلاباً محددين أولاً');
      return;
    }
    setSending(true);
    try {
      await sendBroadcast(trimmed, mode === 'selected' ? Array.from(pickedIds) : undefined);
      pushToast('success', 'تم إرسال الرسالة الجماعية');
      setMessage('');
      setPickedIds(new Set());
      setMode('all');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل إرسال الرسالة الجماعية');
    } finally {
      setSending(false);
    }
  };

  const doDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteBroadcast(deleteId);
      pushToast('success', 'تم حذف الرسالة');
      setDeleteId(null);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل حذف الرسالة');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-4 font-bold text-slate-800 dark:text-white">📢 رسالة جماعية جديدة</h3>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('all')}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
              mode === 'all'
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            كل الطلاب
          </button>
          <button
            type="button"
            onClick={() => setMode('selected')}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
              mode === 'selected'
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            طلاب محددون {mode === 'selected' && pickedIds.size > 0 ? `(${pickedIds.size})` : ''}
          </button>
        </div>

        {mode === 'selected' && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="mb-4 w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {pickedIds.size > 0 ? `تم تحديد ${pickedIds.size} طالب — تعديل` : 'اختيار الطلاب…'}
          </button>
        )}

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
          rows={5}
          placeholder="اكتب رسالتك الجماعية هنا…"
          className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        <div className="mt-1 flex justify-between text-xs text-slate-400">
          <span>{message.length} / {MAX_LEN}</span>
        </div>

        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {sending ? 'جارٍ الإرسال…' : '📤 إرسال'}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-4 font-bold text-slate-800 dark:text-white">سجل الرسائل الجماعية</h3>
        {broadcastsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : broadcasts.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">لا توجد رسائل جماعية سابقة</p>
        ) : (
          <div className="max-h-[420px] space-y-2 overflow-y-auto">
            {broadcasts.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="flex-1 text-sm text-slate-700 dark:text-slate-200">{b.message}</p>
                  <button
                    type="button"
                    onClick={() => setDeleteId(b.id)}
                    className="text-slate-400 hover:text-rose-600"
                    aria-label="حذف"
                  >
                    🗑️
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {adminLabel(b.admin_name)} · {new Date(b.created_at).toLocaleString('ar-SA')}
                  {typeof b.targetCount === 'number' && b.targetCount > 0 ? ` · ${b.targetCount} طالب محدد` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog.Root open={pickerOpen} onOpenChange={setPickerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 animate-fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] max-h-[80vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white p-6 shadow-2xl animate-fade-in dark:bg-slate-800">
            <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white">اختيار الطلاب</Dialog.Title>
            <input
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="بحث…"
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
            <div className="mt-3 max-h-80 overflow-y-auto">
              {filteredStudents.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={pickedIds.has(s.id)}
                    onChange={() => {
                      setPickedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      });
                    }}
                  />
                  <span className="text-slate-700 dark:text-slate-200">{s.name}</span>
                  <span className="ms-auto font-mono text-xs text-slate-400">{s.code}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
                >
                  تم
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="حذف الرسالة الجماعية؟"
        description="سيتم حذف هذه الرسالة نهائياً من سجل الرسائل."
        confirmLabel="حذف"
        danger
        loading={deleting}
        onConfirm={doDelete}
      />
    </div>
  );
}
