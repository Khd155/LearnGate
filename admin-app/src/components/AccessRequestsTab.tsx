import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { api, ApiError } from '../lib/api';
import { GRADE_LEVELS, type GradeLevel } from '../types';
import { CheckIcon, TrashIcon, InboxIcon, ChevronDownIcon } from './Icons';

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
      pushToast('success', action === 'approve' ? 'تم قبول الطلب وإنشاء الحساب وإرسال بيانات الدخول' : 'تم رفض/أرشفة الطلب');
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
            {action === 'approve' ? 'ملاحظة داخلية (اختياري)' : 'سبب الرفض / ملاحظة داخلية'}
          </label>
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
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

export default function AccessRequestsTab() {
  const session = useStore((s) => s.session);
  const isDev = session?.role === 'dev';

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [requests, setRequests] = useState<AccessRequest[] | null>(null);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [gradeFilter, setGradeFilter] = useState<GradeLevel | 'all'>('all');
  const [schoolFilter, setSchoolFilter] = useState<'all' | 'خالدية' | 'other'>('all');
  const [modal, setModal] = useState<{ request: AccessRequest; action: 'approve' | 'reject' } | null>(null);

  const load = () => {
    api.get<{ requests: AccessRequest[]; stats: typeof stats }>('/access-requests')
      .then((r) => { setRequests(r.requests); setStats(r.stats); })
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
      return true;
    });
  }, [requests, statusFilter, gradeFilter, schoolFilter]);

  return (
    <div className="space-y-4">
      {isDev && enabled !== null && <DevToggleBanner enabled={enabled} onChanged={setEnabled} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="إجمالي الطلبات" value={stats.total} tone="slate" />
        <StatCard label="قيد المراجعة" value={stats.pending} tone="amber" />
        <StatCard label="مقبولة" value={stats.approved} tone="emerald" />
        <StatCard label="مرفوضة/مؤرشفة" value={stats.rejected} tone="rose" />
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
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
                  <th className="px-5 py-2.5 font-medium">الاسم</th>
                  <th className="px-5 py-2.5 font-medium">الجوال</th>
                  <th className="px-5 py-2.5 font-medium">المرحلة</th>
                  <th className="px-5 py-2.5 font-medium">المدرسة</th>
                  <th className="px-5 py-2.5 font-medium">مصدر المعرفة</th>
                  <th className="px-5 py-2.5 font-medium">التاريخ</th>
                  <th className="px-5 py-2.5 font-medium">الحالة</th>
                  <th className="px-5 py-2.5 font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                    <td className="px-5 py-2.5 text-slate-700 dark:text-slate-200">{r.name}</td>
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{r.phone}</td>
                    <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300">{r.grade_level}</td>
                    <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300">{r.school}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400">{SOURCE_LABELS[r.source] || r.source || '—'}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-400">{new Date(r.created_at).toLocaleString('ar-SA')}</td>
                    <td className="px-5 py-2.5">
                      {r.status === 'pending' && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">قيد المراجعة</span>
                      )}
                      {r.status === 'approved' && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">مقبول</span>
                      )}
                      {r.status === 'rejected' && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-400" title={r.admin_note || ''}>مرفوض/مؤرشف</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      {r.status === 'pending' ? (
                        <div className="flex gap-1.5">
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
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">{r.decided_by || '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <DecisionModal
          request={modal.request}
          action={modal.action}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
