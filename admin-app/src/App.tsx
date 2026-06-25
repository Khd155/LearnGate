import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { configureApi, clearSession } from './lib/api';
import DashboardLayout from './components/DashboardLayout';

const SITE_ROOT = '/';

export default function App() {
  const session = useStore((s) => s.session);
  const initSession = useStore((s) => s.initSession);
  const dark = useStore((s) => s.dark);

  useEffect(() => {
    configureApi({
      getToken: () => useStore.getState().session?.token ?? null,
      onUnauthorized: () => {
        clearSession();
        window.location.href = SITE_ROOT;
      },
    });
    initSession();
  }, [initSession]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    if (session === null) {
      // initSession ran and found nothing valid — bounce to the main site
      const t = setTimeout(() => {
        if (!useStore.getState().session) window.location.href = SITE_ROOT;
      }, 50);
      return () => clearTimeout(t);
    }
  }, [session]);

  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
          <p>جاري التحقق من الجلسة…</p>
        </div>
      </div>
    );
  }

  return <DashboardLayout />;
}
