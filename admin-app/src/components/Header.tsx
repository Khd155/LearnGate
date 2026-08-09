import { useEffect, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useStore } from '../store/useStore';
import { api, ApiError, clearSession } from '../lib/api';
import { adminLabel } from '../lib/adminLabel';

interface ImpersonateResponse {
  token: string;
  student: { id: string; name: string; school: string };
  trial: boolean;
}

export default function Header() {
  const session = useStore((s) => s.session);
  const dark = useStore((s) => s.dark);
  const toggleDark = useStore((s) => s.toggleDark);
  const unreadCounts = useStore((s) => s.unreadCounts);
  const loadUnreadCounts = useStore((s) => s.loadUnreadCounts);
  const setTab = useStore((s) => s.setTab);
  const setConversationFocusStudentId = useStore((s) => s.setConversationFocusStudentId);
  const pushToast = useStore((s) => s.pushToast);
  const [impersonating, setImpersonating] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUnreadCounts();
    // 30s polling stays as a fallback even with the WebSocket connected —
    // see the matching comment in the student app's startNotifPolling.
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadUnreadCounts();
    }, 30000);

    // Experimental real-time layer (see /dev/monitoring): refresh unread
    // counts immediately when a new message/ticket event arrives instead of
    // waiting for the next poll. Silently does nothing if it can't connect.
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    let stopped = false;

    const connect = () => {
      if (stopped || !session?.token) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(session.token)}`);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'new_message' || data.type === 'new_ticket' || data.type === 'ticket_reply') {
            loadUnreadCounts();
          }
        } catch { /* ignore malformed frames */ }
      };
      ws.onclose = () => {
        if (stopped) return;
        backoff = Math.min(backoff * 2, 30000);
        reconnectTimer = setTimeout(connect, backoff);
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    return () => {
      clearInterval(id);
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [loadUnreadCounts, session?.token]);

  const totalUnread = unreadCounts.reduce((sum, c) => sum + (c.cnt || 0), 0);

  const logout = () => {
    clearSession();
    window.location.href = '/';
  };

  const openProfile = async () => {
    setPhone('');
    setProfileOpen(true);
    try {
      const res = await api.get<{ admin: { phone?: string } }>('/auth/profile');
      setPhone(res.admin?.phone || '');
    } catch {}
  };

  const savePhone = async () => {
    if (phone && !/^\d{10}$/.test(phone)) {
      pushToast('error', 'رقم الجوال يجب أن يكون ١٠ أرقام');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/auth/profile', { phone });
      pushToast('success', 'تم حفظ رقم الجوال ✅');
      setProfileOpen(false);
    } catch (e) {
      pushToast('error', e instanceof ApiError ? e.message : 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const impersonate = async () => {
    setImpersonating(true);
    try {
      const res = await api.post<ImpersonateResponse>('/auth/impersonate');
      const sess = {
        role: 'student',
        id: res.student.id,
        code: 'trial',
        name: res.student.name,
        school: res.student.school || '',
        token: res.token,
        expiry: Date.now() + 25 * 60 * 1000,
        trial: true,
      };
      localStorage.setItem('lg_xsession_student', JSON.stringify(sess));
      sessionStorage.setItem('lg_session_student', JSON.stringify(sess));
      localStorage.setItem('lg_active_role', 'student');
      window.location.href = '/';
    } catch (e) {
      pushToast('error', e instanceof ApiError ? e.message : 'فشل بدء وضع المعاينة');
      setImpersonating(false);
    }
  };

  return (
    <>
      <header
        className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 text-white shadow-md sm:gap-4 sm:px-6 sm:py-4"
        style={{ background: 'linear-gradient(135deg,#3F7CB8 0%,#4A96A0 55%,#4FA877 100%)' }}
      >
        <img src="/logo-white.png" alt="" className="h-9 w-auto shrink-0 sm:h-10" />

        {/* Title — flex-1 + min-w-0 prevents overflow into adjacent items */}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-white sm:text-lg">لوحة المشرف</h1>
          <p className="truncate text-xs text-white/75 sm:text-sm">
            {session?.school && session.school !== '*' ? session.school : 'جميع المدارس'}
          </p>
        </div>

        <div className="ms-auto flex shrink-0 items-center gap-2">
          {/* Dark mode toggle */}
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onClick={toggleDark}
                  className="hidden h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/10 text-base hover:bg-white/20 sm:flex"
                  aria-label="تبديل الوضع الليلي"
                >
                  {dark ? '🌙' : '☀️'}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white" sideOffset={6}>
                  {dark ? 'الوضع الليلي مفعّل' : 'الوضع الفاتح مفعّل'}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>

          {/* Notifications */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/10 text-base hover:bg-white/20"
                aria-label="الإشعارات"
              >
                🔔
                {totalUnread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 w-80 rounded-xl border border-slate-200 bg-white p-2 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <p className="px-2 py-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  الرسائل غير المقروءة
                </p>
                {unreadCounts.length === 0 ? (
                  <p className="px-2 py-4 text-center text-sm text-slate-400">لا توجد رسائل جديدة</p>
                ) : (
                  <div className="max-h-80 space-y-1 overflow-y-auto">
                    {unreadCounts.map((c) => (
                      <DropdownMenu.Item
                        key={c.student_id}
                        onSelect={() => {
                          setConversationFocusStudentId(c.student_id);
                          setTab('conversations');
                        }}
                        className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <span className="truncate">{c.student_name}</span>
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                          {c.cnt}
                        </span>
                      </DropdownMenu.Item>
                    ))}
                  </div>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {/* عرض كطالب — visible on sm+ */}
          <button
            type="button"
            onClick={impersonate}
            disabled={impersonating}
            className="hidden h-9 items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 text-sm font-bold hover:bg-white/20 disabled:opacity-60 sm:flex"
          >
            🧪 {impersonating ? 'جارٍ…' : 'عرض كطالب'}
          </button>

          {/* Profile dropdown — replaces standalone خروج button */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="flex shrink-0 items-center gap-2 rounded-full border border-white/25 bg-white/10 py-1.5 ps-1.5 pe-2.5 hover:bg-white/20 sm:pe-3"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
                  {session?.name?.trim()?.charAt(0) || '؟'}
                </div>
                <div className="hidden text-right sm:block">
                  <p className="max-w-[110px] truncate text-sm font-bold leading-tight text-white">
                    {adminLabel(session?.name)}
                  </p>
                  <p className="text-[11px] leading-tight text-white/70">
                    {session?.role === 'director' ? 'مدير عام' : 'مشرف'}
                  </p>
                </div>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 w-52 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <DropdownMenu.Item
                  onSelect={openProfile}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <span>👤</span>
                  <span>الملف الشخصي</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={impersonate}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-700 sm:hidden"
                >
                  <span>🧪</span>
                  <span>{impersonating ? 'جارٍ…' : 'عرض كطالب'}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
                <DropdownMenu.Item
                  onSelect={logout}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-rose-600 outline-none hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20"
                >
                  <span>🚪</span>
                  <span>تسجيل خروج</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      {/* Profile edit modal */}
      {profileOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setProfileOpen(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
            <h2 className="mb-4 text-lg font-bold text-slate-800 dark:text-white">الملف الشخصي</h2>
            <div className="mb-3">
              <p className="mb-1 text-sm font-medium text-slate-500 dark:text-slate-400">الاسم</p>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
                {session?.name ? adminLabel(session.name) : '—'}
              </p>
            </div>
            <div className="mb-5">
              <label className="mb-1 block text-sm font-medium text-slate-500 dark:text-slate-400">
                رقم الجوال
              </label>
              <input
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="05xxxxxxxx"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:focus:border-indigo-400"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={savePhone}
                disabled={saving}
                className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? 'جارٍ الحفظ…' : 'حفظ'}
              </button>
              <button
                onClick={() => setProfileOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
