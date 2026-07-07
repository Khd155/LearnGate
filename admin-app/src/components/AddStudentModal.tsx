import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useStore } from '../store/useStore';
import { api, ApiError } from '../lib/api';
import type { Student } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddStudentModal({ open, onOpenChange }: Props) {
  const addStudent = useStore((s) => s.addStudent);
  const pushToast = useStore((s) => s.pushToast);
  const session = useStore((s) => s.session);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; code?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setCode('');
    setPhone('');
    setErrors({});
  };

  const validate = () => {
    const next: { name?: string; code?: string } = {};
    if (!name.trim()) next.name = 'الاسم مطلوب';
    else if (name.length > 100) next.name = 'الاسم طويل جداً (الحد 100 حرف)';
    if (!/^\d{10}$/.test(code)) next.code = 'رقم السجل المدني يجب أن يكون 10 أرقام';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ student: Student }>('/students', {
        name: name.trim(),
        code,
        school: session?.school && session.school !== '*' ? session.school : undefined,
        phone: phone.trim(),
      });
      addStudent(res.student);
      pushToast('success', 'تمت إضافة الطالب بنجاح');
      reset();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErrors((prev) => ({ ...prev, code: e.message }));
      } else {
        pushToast('error', e instanceof Error ? e.message : 'فشل إضافة الطالب');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl animate-fade-in dark:bg-slate-800">
          <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white">إضافة طالب جديد</Dialog.Title>
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">الاسم</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder="اسم الطالب"
              />
              {errors.name && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.name}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                رقم السجل المدني
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder="1234567890"
                inputMode="numeric"
              />
              {errors.code && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.code}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                الجوال (اختياري)
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder="05xxxxxxxx"
              />
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
              disabled={submitting}
              onClick={submit}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? 'جارٍ الإضافة…' : 'إضافة'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
