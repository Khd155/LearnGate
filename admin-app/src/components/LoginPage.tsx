import { useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store/useStore';
import type { Session } from '../types';

interface LoginResponse {
  token: string;
  admin: { id: string; name: string; school: string; role: string };
}

export default function LoginPage() {
  const initSession = useStore((s) => s.initSession);
  const [code, setCode] = useState('');
  const [school, setSchool] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/auth/admin-login', { code, school: school || undefined });
      const { token, admin } = res;
      const role = admin.role as Session['role'];
      const session: Session = {
        token,
        expiry: Date.now() + 8 * 60 * 60 * 1000,
        role,
        code: admin.id,
        name: admin.name,
        school: admin.school,
      };
      localStorage.setItem('lg_xsession_admin', JSON.stringify(session));
      initSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[#f4f8fb] dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-lg p-8">
        <h1 className="text-center text-xl font-bold text-slate-800 dark:text-slate-100 mb-6">
          لوحة المشرف · LearnGate
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" dir="rtl">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400">رمز المشرف</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 dark:text-slate-100"
              placeholder="أدخل الرمز المكون من 10 أرقام"
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400">
              المدرسة <span className="text-slate-400 font-normal">(اختياري)</span>
            </label>
            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 dark:text-slate-100"
              placeholder="اسم المدرسة"
            />
          </div>
          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2 text-sm transition-colors"
          >
            {loading ? 'جاري الدخول…' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
