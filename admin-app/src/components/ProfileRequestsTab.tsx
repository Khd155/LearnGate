import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useStore } from '../store/useStore';

interface ProfileRequest {
  id: string;
  student_id: string;
  student_name: string;
  school: string;
  field_name: 'name' | 'phone' | string;
  old_value: string | null;
  new_value: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
}

const FIELD_LABEL: Record<string, string> = {
  name: 'الاسم الكامل',
  phone: 'رقم الجوال',
};

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return `منذ ${Math.floor(hours / 24)} يوم`;
}

// A tiny pub/sub so the sidebar badge (mounted once in AdminTab) and the
// tab's own list (mounted only while the sub-tab is open) agree on the
// pending count without prop drilling or adding this to the global store —
// review() below emits after each approve/reject.
type CountListener = (n: number) => void;
const countListeners = new Set<CountListener>();
function emitCount(n: number) {
  countListeners.forEach((l) => l(n));
}

export function useProfileRequestsCount(enabled = true) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.get<{ pendingCount: number }>('/admin/profile-requests?status=PENDING')
      .then((r) => { if (!cancelled) setCount(r.pendingCount || 0); })
      .catch(() => {});
    countListeners.add(setCount);
    return () => { cancelled = true; countListeners.delete(setCount); };
  }, [enabled]);
  return count;
}

export default function ProfileRequestsTab() {
  const pushToast = useStore((s) => s.pushToast);
  const [requests, setRequests] = useState<ProfileRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  // Reject requires a reason (shown to the student), so "رفض" opens this
  // inline box on the card instead of firing the request immediately.
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get<{ requests: ProfileRequest[] }>('/admin/profile-requests?status=PENDING')
      .then((r) => { setRequests(r.requests || []); setError(''); emitCount((r.requests || []).length); })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) return;
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, action: 'approve' | 'reject', reason?: string) => {
    setBusyId(id);
    try {
      await api.post(`/admin/profile-requests/${id}/review`, { action, reason });
      setRequests((prev) => {
        const next = prev.filter((r) => r.id !== id);
        emitCount(next.length);
        return next;
      });
      pushToast('success', action === 'approve' ? 'تم قبول طلب التعديل' : 'تم رفض طلب التعديل');
      setRejectingId(null);
      setRejectReason('');
    } catch (e) {
      pushToast('error', e instanceof ApiError ? e.message : 'تعذّر تنفيذ الإجراء');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-slate-400">
        <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
        جاري تحميل الطلبات…
      </div>
    );
  }

  if (error) {
    return <div className="py-10 text-center text-rose-500">{error}</div>;
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900">
        لا توجد طلبات تعديل بيانات معلقة
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <div
          key={r.id}
          className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-bold text-slate-800 dark:text-white">{r.student_name}</p>
              <p className="text-xs text-slate-400">{r.school || '—'} · {timeAgo(r.created_at)}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {FIELD_LABEL[r.field_name] || r.field_name}
            </span>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/20">
              <p className="mb-1 text-[11px] font-semibold text-rose-400">القيمة السابقة</p>
              <p dir="auto" className="truncate text-sm font-bold text-rose-700 dark:text-rose-300">{r.old_value || '—'}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <p className="mb-1 text-[11px] font-semibold text-emerald-500">القيمة الجديدة</p>
              <p dir="auto" className="truncate text-sm font-bold text-emerald-700 dark:text-emerald-300">{r.new_value}</p>
            </div>
          </div>

          {rejectingId === r.id ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="سبب الرفض (سيظهر للطالب)…"
                maxLength={500}
                rows={2}
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === r.id || !rejectReason.trim()}
                  onClick={() => review(r.id, 'reject', rejectReason.trim())}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  <XIcon /> تأكيد الرفض
                </button>
                <button
                  type="button"
                  onClick={() => { setRejectingId(null); setRejectReason(''); }}
                  className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  تراجع
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => review(r.id, 'approve')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <CheckIcon /> قبول
              </button>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => { setRejectingId(r.id); setRejectReason(''); }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                <XIcon /> رفض
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
