import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { api, ApiError } from '../lib/api';
import { GRADE_LEVELS, type GradeLevel } from '../types';
import { CheckIcon, ChevronDownIcon } from './Icons';

// ── The 3 approved WhatsApp templates (Meta/SendPulse, category: Utility) ──
// Preview text is the exact copy Meta approved — it carries its own emoji
// (🌟📌🎯⏳) as part of that approved content, which is fine; only the
// surrounding admin UI (buttons, labels, tabs) stays emoji-free.
type Field = { key: string; label: string; multiline?: boolean };
interface Template {
  id: string;
  title: string;
  fields: Field[];
  preview: (name: string, vals: Record<string, string>) => string;
  button?: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'student_account_access_template_1',
    title: 'إشعار الحساب وبيانات الدخول السريع',
    fields: [],
    button: 'عرض بيانات الحساب',
    preview: (name) =>
      `عزيزي الطالب ${name || '...'}،\nمرحبًا بك، تم إنشاء حسابك بنجاح في *بوابة دعم التعلّم*.\n\nيمكنك الدخول والاطلاع على حسابك والبدء *بالتدرب الذاتي* وفق خطواته الموضحة.\nوذلك عبر الزر أدناه.\n\nنسأل الله لك التوفيق والسداد.\n\nبوابة دعم التعلم`,
  },
  {
    id: 'student_general_message',
    title: 'رسالة عامة / إشعار مفتوح',
    fields: [{ key: 'body', label: 'نص الرسالة', multiline: true }],
    preview: (name, v) =>
      `السلام عليكم ورحمة الله وبركاته،\n\nعزيزي الطالب ${name || '...'}،\n\n${v.body || '(نص الرسالة)'}\n\nشاكرين لك تعاونك، وبالتوفيق 🌟\n\nبوابة دعم التعلم`,
  },
  {
    id: 'student_issue_notification',
    title: 'إشعار بوجود ملاحظة أو مشكلة فنية/دراسية',
    fields: [
      { key: 'title', label: 'عنوان الموضوع / الملاحظة' },
      { key: 'details', label: 'تفاصيل المشكلة', multiline: true },
      { key: 'action', label: 'الإجراء المتاح للطالب' },
      { key: 'note', label: 'ملاحظة مهمة' },
    ],
    preview: (name, v) =>
      `عزيزي الطالب ${name || '...'}\n\nنود إشعارك بوجود ملاحظة بخصوص: ${v.title || '...'}\n\n📌 تفاصيل المشكلة:\n${v.details || '...'}\n\n🎯 الإجراء المتاح لك:\n${v.action || '...'}\n\n⏳ ملاحظة مهمة:\n${v.note || '...'}\n\nفي حال واجهت أي صعوبة، تواصل معنا مباشرة.\nبالتوفيق 🌟\n\nبوابة دعم التعلم`,
  },
];

type TargetMode = 'single' | 'bulk';
type BulkStatus = 'all' | 'not_started' | 'cooldown' | 'active';

// Dev-only toggle for the whatsapp_dispatch_enabled setting — same "inline
// banner, not a separate settings page" pattern TestCenterTab's
// PassRatioBanner already established for quiz_pass_ratio. The backend
// itself also enforces dev-only on PATCH, this just keeps a non-dev viewer
// from seeing a control they can't use.
function DevToggleBanner({ enabled, onChanged }: { enabled: boolean; onChanged: (v: boolean) => void }) {
  const pushToast = useStore((s) => s.pushToast);
  const [saving, setSaving] = useState(false);
  const toggle = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', { key: 'whatsapp_dispatch_enabled', value: !enabled });
      onChanged(!enabled);
      pushToast('success', !enabled ? 'تم تفعيل إرسال قوالب واتساب' : 'تم تعطيل إرسال قوالب واتساب');
    } catch (e) {
      pushToast('error', e instanceof ApiError ? e.message : 'فشل حفظ الإعداد');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/30">
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
        تفعيل إرسال قوالب واتساب من مركز المراسلات (تحكم المطور)
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

export default function WhatsAppDispatchTab() {
  const students = useStore((s) => s.students);
  const statusOf = useStore((s) => s.statusOf);
  const pushToast = useStore((s) => s.pushToast);
  const session = useStore((s) => s.session);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    api.get<{ settings: { whatsapp_dispatch_enabled: { value: boolean } } }>('/settings')
      .then((r) => setEnabled(r.settings.whatsapp_dispatch_enabled.value))
      .catch(() => setEnabled(true));
  }, []);

  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const template = TEMPLATES.find((t) => t.id === templateId)!;
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => setValues({}), [templateId]);

  const [mode, setMode] = useState<TargetMode>('single');
  const [search, setSearch] = useState('');
  const [singleId, setSingleId] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<GradeLevel | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<BulkStatus>('all');
  const [sending, setSending] = useState(false);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return students.filter((s) => s.name.toLowerCase().includes(q) || s.code.includes(q)).slice(0, 8);
  }, [students, search]);

  const singleStudent = useMemo(() => students.find((s) => s.id === singleId) || null, [students, singleId]);

  const bulkTargets = useMemo(() => {
    if (mode !== 'bulk') return [];
    return students.filter((s) => {
      if (gradeFilter !== 'all' && s.grade_level !== gradeFilter) return false;
      const inCooldown = !!s.cooldown_until && new Date(s.cooldown_until).getTime() > Date.now();
      if (statusFilter === 'not_started' && statusOf(s.id) !== 'not_started') return false;
      if (statusFilter === 'cooldown' && !inCooldown) return false;
      if (statusFilter === 'active' && (statusOf(s.id) === 'not_started' || inCooldown)) return false;
      return true;
    });
  }, [students, mode, gradeFilter, statusFilter, statusOf]);

  const targets = mode === 'single' ? (singleStudent ? [singleStudent] : []) : bulkTargets;

  const previewName = mode === 'single' ? (singleStudent?.name || '') : 'اسم الطالب';
  const previewText = template.preview(previewName, values);

  const missingRequired = template.fields.some((f) => !values[f.key]?.trim());

  const send = async () => {
    if (!targets.length) { pushToast('error', 'اختر مستلمين أولاً'); return; }
    if (missingRequired) { pushToast('error', 'أكمل كل حقول القالب أولاً'); return; }
    const withPhone = targets.filter((t) => t.phone);
    if (!withPhone.length) { pushToast('error', 'لا يوجد رقم جوال لأي من المستلمين المحددين'); return; }
    setSending(true);
    try {
      // Every template variant sends one request per recipient rather than
      // batching all phones into a single call — the access-token template
      // needs a distinct button token per student, and the general-message
      // template needs each student's own name in {{1}}, so there's no
      // shared payload all recipients could share anyway.
      if (template.id === 'student_account_access_template_1') {
        // Each recipient needs their own login-access token in the button —
        // mint one per student first (same mechanism the import-batch
        // dispatcher already uses), then send one request per student since
        // the button parameter differs per recipient.
        for (const t of withPhone) {
          const { token } = await api.post<{ token: string }>('/sendpulse/mint-access-token', { studentId: t.id });
          const comps = [
            { type: 'body', parameters: [{ type: 'text', text: t.name }] },
            { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: token }] },
          ];
          await api.post('/sendpulse/send', {
            phones: [t.phone!.startsWith('+') ? t.phone : '+966' + t.phone!.replace(/^0/, '')],
            template_name: template.id,
            language_code: 'ar',
            components: comps,
            recipients: [{ phone: t.phone, studentId: t.id, studentName: t.name }],
          });
        }
      } else if (template.id === 'student_general_message') {
        for (const t of withPhone) {
          await api.post('/sendpulse/send', {
            phones: [t.phone!.startsWith('+') ? t.phone : '+966' + t.phone!.replace(/^0/, '')],
            template_name: template.id,
            language_code: 'ar',
            components: [{ type: 'body', parameters: [{ type: 'text', text: t.name }, { type: 'text', text: values.body || '' }] }],
            recipients: [{ phone: t.phone, studentId: t.id, studentName: t.name }],
          });
        }
      } else {
        for (const t of withPhone) {
          await api.post('/sendpulse/send', {
            phones: [t.phone!.startsWith('+') ? t.phone : '+966' + t.phone!.replace(/^0/, '')],
            template_name: template.id,
            language_code: 'ar',
            components: [
              { type: 'body', parameters: [{ type: 'text', text: t.name }, { type: 'text', text: values.title || '' }, { type: 'text', text: values.details || '' }, { type: 'text', text: values.action || '' }, { type: 'text', text: values.note || '' }] },
            ],
            recipients: [{ phone: t.phone, studentId: t.id, studentName: t.name }],
          });
        }
      }
      pushToast('success', `تم الإرسال إلى ${withPhone.length} ${withPhone.length === 1 ? 'طالب' : 'طالب'}`);
      setValues({});
    } catch (e) {
      pushToast('error', e instanceof ApiError ? e.message : 'تعذّر الإرسال');
    } finally {
      setSending(false);
    }
  };

  const isDev = session?.role === 'dev';

  if (enabled === false) {
    return (
      <div>
        {isDev && <DevToggleBanner enabled={false} onChanged={setEnabled} />}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950/30">
          <p className="font-bold text-amber-800 dark:text-amber-300">الميزة بانتظار التفعيل من الإدارة الفنية</p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
            هذا القسم معروض في وضع المعاينة فقط — تفعيل إرسال قوالب واتساب يتم حصرياً من لوحة المطور.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {isDev && enabled !== null && <DevToggleBanner enabled={enabled} onChanged={setEnabled} />}
      <div className="grid gap-6 lg:grid-cols-2">
      {/* ── Right (form): template + recipients + fields ── */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">القالب</h3>
          <div className="space-y-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-start text-sm transition ${
                  templateId === t.id
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="font-medium">{t.title}</span>
                {templateId === t.id && <CheckIcon className="h-4 w-4 shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">المستلمون</h3>
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${mode === 'single' ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
            >
              طالب فردي
            </button>
            <button
              type="button"
              onClick={() => setMode('bulk')}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${mode === 'bulk' ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
            >
              إرسال جماعي (دفعة)
            </button>
          </div>

          {mode === 'single' ? (
            <div className="relative">
              <input
                value={singleStudent ? singleStudent.name : search}
                onChange={(e) => { setSearch(e.target.value); setSingleId(null); }}
                placeholder="ابحث بالاسم أو رقم الدخول…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              {!singleId && searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  {searchResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSingleId(s.id); setSearch(''); }}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      <span className="text-slate-700 dark:text-slate-200">{s.name}</span>
                      <span className="font-mono text-xs text-slate-400">{s.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value as GradeLevel | 'all')}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="all">كل المراحل</option>
                  {GRADE_LEVELS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as BulkStatus)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="all">كل الحالات</option>
                  <option value="not_started">لم يبدأوا</option>
                  <option value="cooldown">في فترة استراحة</option>
                  <option value="active">نشطون</option>
                </select>
                <ChevronDownIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              <p className="col-span-2 text-xs text-slate-400">
                {bulkTargets.length} طالب مطابق ({bulkTargets.filter((t) => t.phone).length} برقم جوال)
              </p>
            </div>
          )}
        </div>

        {template.fields.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">متغيرات القالب</h3>
            <div className="space-y-3">
              {template.fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{f.label}</label>
                  {f.multiline ? (
                    <textarea
                      value={values[f.key] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      rows={3}
                      className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  ) : (
                    <input
                      value={values[f.key] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={send}
          disabled={sending || !targets.length}
          className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {sending ? 'جارٍ الإرسال…' : `إرسال${targets.length ? ` (${targets.length})` : ''}`}
        </button>
      </div>

      {/* ── Left: live WhatsApp bubble preview ── */}
      <div className="rounded-2xl border border-slate-200 bg-[#e5ddd5] p-5 dark:border-slate-800 dark:bg-slate-950">
        <p className="mb-3 text-center text-xs font-bold text-slate-500 dark:text-slate-400">معاينة حيّة</p>
        <div className="mx-auto max-w-sm rounded-2xl bg-[#075e54] p-3 shadow-xl">
          <div className="rounded-xl bg-[#ece5dd] p-3 dark:bg-slate-800">
            <div className="rounded-lg bg-white p-3 text-sm leading-relaxed text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100" style={{ whiteSpace: 'pre-line' }}>
              {previewText}
              {template.button && (
                <div className="mt-2 border-t border-slate-200 pt-2 text-center text-sm font-bold text-[#00a5f4] dark:border-slate-600">
                  {template.button}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
