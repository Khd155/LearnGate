import { useEffect } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useStore } from '../store/useStore';
import { clearSession } from '../lib/api';

export default function Header() {
  const session = useStore((s) => s.session);
  const dark = useStore((s) => s.dark);
  const toggleDark = useStore((s) => s.toggleDark);
  const unreadCounts = useStore((s) => s.unreadCounts);
  const loadUnreadCounts = useStore((s) => s.loadUnreadCounts);
  const setTab = useStore((s) => s.setTab);
  const setConversationFocusStudentId = useStore((s) => s.setConversationFocusStudentId);

  useEffect(() => {
    loadUnreadCounts();
    const id = setInterval(loadUnreadCounts, 30000);
    return () => clearInterval(id);
  }, [loadUnreadCounts]);

  const totalUnread = unreadCounts.reduce((sum, c) => sum + (c.cnt || 0), 0);

  const logout = () => {
    clearSession();
    window.location.href = '/';
  };

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-4 px-6 py-4 text-white shadow-md"
      style={{ background: 'linear-gradient(135deg,#3F7CB8 0%,#4A96A0 55%,#4FA877 100%)' }}
    >
      <img src="/logo-white.png" alt="" className="h-10 w-auto shrink-0" />

      <div>
        <h1 className="text-lg font-bold text-white">لوحة المشرف</h1>
        <p className="text-sm text-white/75">
          {session?.school && session.school !== '*' ? session.school : 'جميع المدارس'}
        </p>
      </div>

      <div className="hidden items-center gap-2.5 rounded-full border border-white/25 bg-white/10 py-1.5 ps-3 pe-1.5 sm:flex">
        <div className="text-end">
          <p className="text-sm font-bold leading-tight text-white">{session?.name}</p>
          <p className="text-[11px] leading-tight text-white/70">
            {session?.role === 'director' ? 'مدير عام' : 'مشرف'}
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
          {session?.name?.trim()?.charAt(0) || '؟'}
        </div>
      </div>

      <div className="ms-auto flex items-center gap-3">
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={toggleDark}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/10 text-lg hover:bg-white/20"
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

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/10 text-lg hover:bg-white/20"
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

        <button
          type="button"
          onClick={logout}
          className="flex h-10 items-center justify-center rounded-full border border-white/30 bg-white/10 px-4 text-sm font-bold hover:bg-white/20"
        >
          خروج
        </button>
      </div>
    </header>
  );
}
