import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useStore } from '../store/useStore';
import { api } from '../lib/api';
import ConfirmDialog from './ConfirmDialog';

interface Question {
  id: string;
  qnum: number;
  type: string;
  skill_id: string;
  text: string;
  opt1: string;
  opt2: string;
  opt3: string;
  opt4: string;
  ans: number;
  created_at: string;
}

const SKILL_META: Record<string, { name: string; category: 'verbal' | 'quantitative' }> = {
  v1: { name: 'الاستيعاب القرائي', category: 'verbal' },
  v2: { name: 'الخطأ السياقي', category: 'verbal' },
  v3: { name: 'المفردة الشاذة', category: 'verbal' },
  v4: { name: 'التناظر اللفظي', category: 'verbal' },
  v5: { name: 'إكمال الجمل', category: 'verbal' },
  q1: { name: 'الحساب', category: 'quantitative' },
  q2: { name: 'الجبر', category: 'quantitative' },
  q3: { name: 'الهندسة والقياس', category: 'quantitative' },
  q4: { name: 'المقارنات الكمية', category: 'quantitative' },
  q5: { name: 'الإحصاء والاحتمالات', category: 'quantitative' },
};

const VERBAL_SKILLS = Object.entries(SKILL_META).filter(([, m]) => m.category === 'verbal');
const QUANT_SKILLS = Object.entries(SKILL_META).filter(([, m]) => m.category === 'quantitative');

function skillLabel(skillId: string) {
  return SKILL_META[skillId]?.name || skillId;
}

interface FormState {
  skill_id: string;
  text: string;
  opt1: string;
  opt2: string;
  opt3: string;
  opt4: string;
  ans: number;
}

const EMPTY_FORM: FormState = { skill_id: 'v1', text: '', opt1: '', opt2: '', opt3: '', opt4: '', ans: 0 };

function QuestionFormModal({
  open,
  onOpenChange,
  initial,
  title,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: FormState;
  title: string;
  onSubmit: (f: FormState) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);

  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  const opts = [form.opt1, form.opt2, form.opt3, form.opt4];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl animate-fade-in dark:bg-slate-800 max-h-[90vh] overflow-y-auto">
          <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white">{title}</Dialog.Title>
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">المهارة</label>
              <select
                value={form.skill_id}
                onChange={(e) => setForm((f) => ({ ...f, skill_id: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <optgroup label="لفظي">
                  {VERBAL_SKILLS.map(([id, m]) => (
                    <option key={id} value={id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="كمي">
                  {QUANT_SKILLS.map(([id, m]) => (
                    <option key={id} value={id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">نص السؤال</label>
              <textarea
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                الخيارات (اختر الإجابة الصحيحة)
              </label>
              {opts.map((val, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ans"
                    checked={form.ans === i}
                    onChange={() => setForm((f) => ({ ...f, ans: i }))}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  <input
                    value={val}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [`opt${i + 1}`]: e.target.value }) as FormState)
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    placeholder={`خيار ${i + 1}`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                إلغاء
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={submitting || !form.text.trim()}
              onClick={() => onSubmit(form)}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function QuestionsTab() {
  const pushToast = useStore((s) => s.pushToast);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Question | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ questions: Question[] }>('/questions');
      setQuestions(res.questions);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل تحميل الأسئلة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const q of questions) c[q.skill_id] = (c[q.skill_id] || 0) + 1;
    return c;
  }, [questions]);

  const filtered = useMemo(() => {
    if (skillFilter === 'all') return questions;
    return questions.filter((q) => q.skill_id === skillFilter);
  }, [questions, skillFilter]);

  const handleAdd = async (f: FormState) => {
    setSubmitting(true);
    try {
      const nextQnum = questions.length ? Math.max(...questions.map((q) => q.qnum)) + 1 : 1;
      await api.post('/questions', {
        action: 'append',
        questions: [
          {
            qnum: nextQnum,
            type: SKILL_META[f.skill_id].category,
            skillId: f.skill_id,
            text: f.text,
            opts: [f.opt1, f.opt2, f.opt3, f.opt4],
            ans: f.ans,
          },
        ],
      });
      pushToast('success', 'تمت إضافة السؤال');
      setAddOpen(false);
      load();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل إضافة السؤال');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (f: FormState) => {
    if (!editTarget) return;
    setSubmitting(true);
    try {
      await api.patch(`/questions/${editTarget.id}`, {
        qnum: editTarget.qnum,
        type: SKILL_META[f.skill_id].category,
        skill_id: f.skill_id,
        text: f.text,
        opt1: f.opt1,
        opt2: f.opt2,
        opt3: f.opt3,
        opt4: f.opt4,
        ans: f.ans,
      });
      pushToast('success', 'تم تعديل السؤال');
      setEditTarget(null);
      load();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل تعديل السؤال');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/questions/${deleteTarget.id}`);
      pushToast('success', 'تم حذف السؤال');
      setDeleteTarget(null);
      load();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'فشل حذف السؤال');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={skillFilter}
          onChange={(e) => setSkillFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        >
          <option value="all">كل المهارات ({questions.length})</option>
          <optgroup label="لفظي">
            {VERBAL_SKILLS.map(([id, m]) => (
              <option key={id} value={id}>
                {m.name} ({counts[id] || 0})
              </option>
            ))}
          </optgroup>
          <optgroup label="كمي">
            {QUANT_SKILLS.map(([id, m]) => (
              <option key={id} value={id}>
                {m.name} ({counts[id] || 0})
              </option>
            ))}
          </optgroup>
        </select>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
        >
          + إضافة سؤال
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-12 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 text-right">#</th>
                <th className="px-3 py-2 text-right">المهارة</th>
                <th className="px-3 py-2 text-right">السؤال</th>
                <th className="px-3 py-2 text-right">الإجابة الصحيحة</th>
                <th className="px-3 py-2 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((q) => {
                const opts = [q.opt1, q.opt2, q.opt3, q.opt4];
                const ansText = opts[Number(q.ans)] ?? '—';
                return (
                  <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{q.qnum}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">
                      {skillLabel(q.skill_id)}
                    </td>
                    <td className="max-w-md truncate px-3 py-2 text-slate-800 dark:text-slate-200" title={q.text}>
                      {q.text}
                    </td>
                    <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">{ansText}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditTarget(q)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(q)}
                          className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                    لا توجد أسئلة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <QuestionFormModal
        open={addOpen}
        onOpenChange={setAddOpen}
        initial={EMPTY_FORM}
        title="إضافة سؤال جديد"
        onSubmit={handleAdd}
        submitting={submitting}
      />

      <QuestionFormModal
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        initial={
          editTarget
            ? {
                skill_id: editTarget.skill_id,
                text: editTarget.text,
                opt1: editTarget.opt1,
                opt2: editTarget.opt2,
                opt3: editTarget.opt3,
                opt4: editTarget.opt4,
                ans: Number(editTarget.ans),
              }
            : EMPTY_FORM
        }
        title="تعديل السؤال"
        onSubmit={handleEdit}
        submitting={submitting}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="حذف السؤال"
        description="هل أنت متأكد من حذف هذا السؤال؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
        danger
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
