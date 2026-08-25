import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { configureApi, clearSession } from './lib/api';
import DashboardLayout from './components/DashboardLayout';

const SITE_ROOT = import.meta.env.VITE_SITE_ROOT ?? '/';

export default function App() {
  const session = useStore((s) => s.session);
  const initSession = useStore((s) => s.initSession);
  const dark = useStore((s) => s.dark);

  useEffect(() => {
    // A 401 from ANY in-flight request (a background tab's fetch, a stale
    // poll, the tab the admin is actually looking at) used to hard-redirect
    // instantly via window.location.href — no warning, whatever the admin
    // was doing just vanishes. Most of the time this fires because the JWT
    // genuinely expired (4h admin session), which does need a re-login, but
    // it should read as "your session ended" rather than the screen randomly
    // breaking. `redirected` guards against several concurrent requests
    // 401-ing at once and stacking up duplicate toasts/redirects.
    let redirected = false;
    configureApi({
      getToken: () => useStore.getState().session?.token ?? null,
      onUnauthorized: () => {
        if (redirected) return;
        redirected = true;
        useStore.getState().pushToast('error', 'انتهت صلاحية جلستك — يُعاد توجيهك لتسجيل الدخول…');
        clearSession();
        setTimeout(() => { window.location.href = SITE_ROOT; }, 1200);
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
      <div className="flex h-screen items-center justify-center bg-[#f4f8fb] dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
          <p>جاري التحقق من الجلسة…</p>
        </div>
      </div>
    );
  }

  return <DashboardLayout />;
}
