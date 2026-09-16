import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { api, ApiError } from '../lib/api';
import { GRADE_LEVELS, type GradeLevel } from '../types';
import { CheckIcon, TrashIcon, InboxIcon, ChevronDownIcon, EyeIcon } from './Icons';

interface AccessRequest {
  id: string;
  name: string;
  phone: string;
  grade_level: string;
  school: string;
  is_other_school: number;
  source: string;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string;
  student_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

const SOURCE_LABELS: Record<string, string> = {
  'ترشيح من معلم / إدارة المدرسة': 'ترشيح من معلم / إدارة المدرسة',
  'توصية من زميل دراسي': 'توصية من زميل دراسي',
  'عبر منصات التواصل الاجتماعي': 'عبر منصات التواصل الاجتماعي',
  'الدعم الفني المباشر': 'الدعم الفني المباشر',
  'أخرى': 'أخرى',
};

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

// Dev-only toggle for access_requests_enabled — same inline-banner pattern
// as WhatsAppDispatchTab's DevToggleBanner (PATCH /settings is itself
// dev-gated for this key on the backend; this just keeps the control off
// a non-dev viewer's screen).
function DevToggleBanner({ enabled, onChanged }: { enabled: boolean; onChanged: (v: boolean) => void }) {
  const pushToast = useStore((s) => s.pushToast);
  const [saving, setSaving] = useState(false);
  const toggle = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', { key: 'access_requests_enabled', value: !enabled });
      onChanged(!enabled);
      pushToast('success', !enabled ? 'تم تفعيل استقبال طلبات الانضمام' : 'تم تعطيل استقبال طلبات الانضمام');
    } catch (e) {
      pushToast('error', e instanceof ApiError ? e.message : 'فشل حفظ الإعداد');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/30">
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
        تفعيل استقبال طلبات الانضمام من صفحة /request-access (تحكم المطور)
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={`rounded-lg px-3 py-1 text-sm font-bold disabled:opacity-50 ${
          enabled
            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400'
            : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-500/15 dark:text-rose-400'
        }`}
      >
        {saving ? '…' : enabled ? 'مفعّلة' : 'معطّلة'}
      </button>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'amber' | 'emerald' | 'rose' }) {
  const tones = {
    slate: 'text-slate-700 dark:text-slate-200',
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function SchoolBadge({ request }: { request: AccessRequest }) {
  const isKhaldiya = request.school === 'ثانوية الخالدية' && !request.is_other_school;
  return (
    <span
      className={
        isKhaldiya
          ? 'inline-flex items-center whitespace-nowrap rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400'
          : 'inline-flex items-center whitespace-nowrap rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400'
      }
    >
      {request.school}
    </span>
  );
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
  };
}

function DetailsModal({ request, onClose }: { request: AccessRequest; onClose: () => void }) {
  const { date, time } = fmtDate(request.created_at);
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <EyeIcon className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">تفاصيل الطلب</h3>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <Row label="الاسم الرباعي" value={request.name} />
          <Row label="رقم الجوال" value={<span className="font-mono">{request.phone}</span>} />
          <Row label="المرحلة الدراسية" value={request.grade_level} />
          <Row label="المدرسة" value={<SchoolBadge request={request} />} />
          <Row label="مصدر المعرفة" value={SOURCE_LABELS[request.source] || request.source || '—'} />
          <Row
            label="توقيت الطلب"
            value={
              <span>
                {date}
                <br />
                <span className="text-xs text-slate-400">{time}</span>
              </span>
            }
          />
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-slate-400">الملاحظات / سبب الرغبة بالانضمام</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {request.note || '— لا توجد ملاحظات —'}
          </p>
        </div>

        {request.status !== 'pending' && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {request.status === 'approved' ? 'تم القبول' : 'تم الرفض/الأرشفة'} بواسطة {request.decided_by || '—'}
            {request.admin_note && <> — {request.admin_note}</>}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          إغلاق
        </button>
      </div>
    </div>
  );
}

function DecisionModal({
  request, action, onClose, onDone,
}: {
  request: AccessRequest;
  action: 'approve' | 'reject';
  onClose: () => void;
  onDone: () => void;
}) {
  const pushToast = useStore((s) => s.pushToast);
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>((GRADE_LEVELS as readonly string[]).includes(request.grade_level) ? (request.grade_level as GradeLevel) : GRADE_LEVELS[0]);
  const [adminNote, setAdminNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.patch(`/access-requests/${request.id}`, { action, adminNote, ...(action === 'approve' ? { gradeLevel } : {}) });
      pushToast('success', action === 'approve' ? 'تم قبول الطلب وإنشاء الحساب وإرسال بيانات الدخول' : 'تم رفض/أرشفة الطلب وإرسال الإشعار عبر واتساب');
      onDone();
    } catch (e) {
      pushToast('error', e instanceof ApiError ? e.message : 'تعذّر تنفيذ الإجراء');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {action === 'approve' ? `قبول طلب "${request.name}" وإنشاء الحساب` : `رفض/أرشفة طلب "${request.name}"`}
        </h3>

        {action === 'approve' && (
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">المرحلة الدراسية</label>
            <div className="relative">
              <select
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value as GradeLevel)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {GRADE_LEVELS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              سيتم إنشاء حساب الطالب فوراً وإرسال رسالة واتساب تحتوي رابط الدخول السريع إلى {request.phone}.
            </p>
          </div>
        )}

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            {action === 'approve' ? 'ملاحظة داخلية (اختياري)' : 'سبب الرفض (سيُرسل للطالب ضمن رسالة واتساب)'}
          </label>
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          {action === 'reject' && (
            <p className="mt-2 text-xs text-slate-400">
              سيتم إرسال إشعار رفض عبر واتساب إلى {request.phone} — إذا تركت الحقل فارغاً سيُرسل نص افتراضي عام.
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50 ${
              action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {busy ? '…' : action === 'approve' ? 'تأكيد القبول والإرسال' : 'تأكيد الرفض'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Bulk confirm dialog — approves/rejects every selected pending request in
// one pass, reusing each request's own submitted grade_level as-is (no
// per-row override — that's what the single-request DecisionModal is for).
function BulkConfirmModal({
  requests, action, onClose, onDone,
}: {
  requests: AccessRequest[];
  action: 'approve' | 'reject';
  onClose: () => void;
  onDone: () => void;
}) {
  const pushToast = useStore((s) => s.pushToast);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const submit = async () => {
    setBusy(true);
    let okCount = 0, failCount = 0;
    for (const r of requests) {
      try {
        await api.patch(`/access-requests/${r.id}`, {
          action,
          // Left blank on purpose — adminNote is sent to the student
          // verbatim as {{2}} of the rejection WhatsApp template now, so an
          // internal-only label like "رفض جماعي" must never land here; the
          // backend falls back to a neutral default line when it's empty.
          adminNote: '',
          ...(action === 'approve' ? { gradeLevel: r.grade_level } : {}),
        });
        okCount++;
      } catch {
        failCount++;
      }
      setProgress((p) => p + 1);
    }
    setBusy(false);
    pushToast(
      failCount ? 'error' : 'success',
      failCount ? `تم ${okCount} وفشل ${failCount}` : action === 'approve' ? `تم قبول ${okCount} طلب وإرسال بيانات الدخول` : `تم رفض/أرشفة ${okCount} طلب`,
    );
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={busy ? undefined : onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {action === 'approve' ? `قبول ${requests.length} طلب وإنشاء الحسابات` : `رفض/أرشفة ${requests.length} طلب`}
        </h3>
        <p className="mt-2 text-xs text-slate-400">
          {action === 'approve'
            ? 'سيتم إنشاء حساب لكل طالب وإرسال بيانات الدخول عبر واتساب دفعة واحدة.'
            : 'سيتم تحويل كل الطلبات المحددة إلى مؤرشفة.'}
        </p>
        {busy && (
          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${(progress / requests.length) * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-center text-xs text-slate-400">{progress}/{requests.length}</p>
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50 ${
              action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {busy ? '…' : 'تأكيد'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccessRequestsTab() {
  const session = useStore((s) => s.session);
  const isDev = session?.role === 'dev';

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [requests, setRequests] = useState<AccessRequest[] | null>(null);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [gradeFilter, setGradeFilter] = useState<GradeLevel | 'all'>('all');
  const [schoolFilter, setSchoolFilter] = useState<'all' | 'خالدية' | 'other'>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [modal, setModal] = useState<{ request: AccessRequest; action: 'approve' | 'reject' } | null>(null);
  const [detailsRequest, setDetailsRequest] = useState<AccessRequest | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const setPendingAccessRequestsCount = useStore((s) => s.setPendingAccessRequestsCount);
  const load = () => {
    api.get<{ requests: AccessRequest[]; stats: typeof stats }>('/access-requests')
      .then((r) => {
        setRequests(r.requests);
        setStats(r.stats);
        setSelected(new Set());
        // Keeps the nav-tab badge + dashboard banner in sync the moment a
        // decision changes the pending count — no reload, no separate poll.
        setPendingAccessRequestsCount(r.stats.pending);
      })
      .catch(() => setRequests([]));
  };

  useEffect(() => {
    api.get<{ settings: { access_requests_enabled: { value: boolean } } }>('/settings')
      .then((r) => setEnabled(r.settings.access_requests_enabled.value))
      .catch(() => setEnabled(false));
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!requests) return [];
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (gradeFilter !== 'all' && r.grade_level !== gradeFilter) return false;
      if (schoolFilter === 'خالدية' && r.school !== 'ثانوية الخالدية') return false;
      if (schoolFilter === 'other' && (r.school === 'ثانوية الخالدية' && !r.is_other_school)) return false;
      if (debouncedSearch && !r.name.toLowerCase().includes(debouncedSearch) && !r.phone.includes(debouncedSearch)) return false;
      return true;
    });
  }, [requests, statusFilter, gradeFilter, schoolFilter, debouncedSearch]);

  const selectablePending = filtered.filter((r) => r.status === 'pending');
  const allSelected = selectablePending.length > 0 && selectablePending.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectablePending.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectedRequests = requests?.filter((r) => selected.has(r.id)) || [];

  return (
    <div className="space-y-4">
      {isDev && enabled !== null && <DevToggleBanner enabled={enabled} onChanged={setEnabled} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="إجمالي الطلبات" value={stats.total} tone="slate" />
        <StatCard label="قيد المراجعة" value={stats.pending} tone="amber" />
        <StatCard label="مقبولة" value={stats.approved} tone="emerald" />
        <StatCard label="مرفوضة/مؤرشفة" value={stats.rejected} tone="rose" />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative w-full max-w-xs">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو رقم الجوال…"
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pe-3 ps-9 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
          />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pe-8 ps-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="pending">قيد المراجعة</option>
            <option value="approved">مقبولة</option>
            <option value="rejected">مرفوضة/مؤرشفة</option>
            <option value="all">كل الحالات</option>
          </select>
          <ChevronDownIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
        <div className="relative">
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value as GradeLevel | 'all')}
            className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pe-8 ps-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">كل المراحل</option>
            {GRADE_LEVELS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
        <div className="relative">
          <select
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value as 'all' | 'خالدية' | 'other')}
            className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pe-8 ps-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">كل المدارس</option>
            <option value="خالدية">ثانوية الخالدية</option>
            <option value="other">مدارس خارجية</option>
          </select>
          <ChevronDownIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <InboxIcon className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">طلبات الانضمام</h3>
        </div>

        {!requests ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : !filtered.length ? (
          <p className="py-12 text-center text-sm text-slate-400">لا توجد طلبات مطابقة</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-2.5 font-medium">
                    {selectablePending.length > 0 && (
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300" />
                    )}
                  </th>
                  <th className="px-5 py-2.5 font-medium">الاسم</th>
                  <th className="px-5 py-2.5 font-medium">الجوال</th>
                  <th className="px-5 py-2.5 font-medium">المرحلة</th>
                  <th className="px-5 py-2.5 text-right font-medium">المدرسة</th>
                  <th className="px-5 py-2.5 font-medium">مصدر المعرفة</th>
                  <th className="px-5 py-2.5 font-medium">التاريخ</th>
                  <th className="min-w-[110px] px-5 py-2.5 font-medium">الحالة</th>
                  <th className="px-5 py-2.5 font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                    <td className="px-5 py-2.5">
                      {r.status === 'pending' && (
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-slate-700 dark:text-slate-200">{r.name}</td>
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{r.phone}</td>
                    <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300">{r.grade_level}</td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="flex items-center justify-start">
                        <SchoolBadge request={r} />
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400">{SOURCE_LABELS[r.source] || r.source || '—'}</td>
                    <td className="px-5 py-2.5">
                      {(() => {
                        const { date, time } = fmtDate(r.created_at);
                        return (
                          <div className="flex flex-col whitespace-nowrap text-xs text-slate-500 dark:text-slate-400" dir="rtl">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{date}</span>
                            <span className="text-[11px] text-slate-400">{time}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="min-w-[110px] px-5 py-2.5">
                      {r.status === 'pending' && (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-400">قيد المراجعة</span>
                      )}
                      {r.status === 'approved' && (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400">مقبول</span>
                      )}
                      {r.status === 'rejected' && (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-400" title={r.admin_note || ''}>مرفوض/مؤرشف</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailsRequest(r)}
                          title="عرض التفاصيل"
                          className="flex items-center rounded-lg bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                        >
                          <EyeIcon className="h-3.5 w-3.5" />
                        </button>
                        {r.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setModal({ request: r, action: 'approve' })}
                              className="flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400"
                            >
                              <CheckIcon className="h-3.5 w-3.5" /> قبول
                            </button>
                            <button
                              type="button"
                              onClick={() => setModal({ request: r, action: 'reject' })}
                              className="flex items-center gap-1 rounded-lg bg-rose-100 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-200 dark:bg-rose-500/15 dark:text-rose-400"
                            >
                              <TrashIcon className="h-3.5 w-3.5" /> رفض
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">{r.decided_by || '—'}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{selected.size} محدد</span>
            <button
              type="button"
              onClick={() => setBulkAction('approve')}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <CheckIcon className="h-3.5 w-3.5" /> قبول المحددين
            </button>
            <button
              type="button"
              onClick={() => setBulkAction('reject')}
              className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
            >
              <TrashIcon className="h-3.5 w-3.5" /> رفض المحددين
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      {modal && (
        <DecisionModal
          request={modal.request}
          action={modal.action}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load(); }}
        />
      )}

      {detailsRequest && <DetailsModal request={detailsRequest} onClose={() => setDetailsRequest(null)} />}

      {bulkAction && (
        <BulkConfirmModal
          requests={selectedRequests}
          action={bulkAction}
          onClose={() => setBulkAction(null)}
          onDone={() => { setBulkAction(null); load(); }}
        />
      )}
    </div>
  );
}
