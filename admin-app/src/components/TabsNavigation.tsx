import { useEffect, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useStore, type TabKey } from '../store/useStore';
import { cn } from '../lib/cn';
import { HomeIcon, FlaskIcon, UsersIcon, ChatIcon, MegaphoneIcon, SettingsIcon } from './Icons';

type TabDef = { key: TabKey; label: string; Icon: (p: { className?: string }) => React.ReactElement };

const BASE_TABS: TabDef[] = [
  { key: 'dashboard', label: 'لوحة المعلومات', Icon: HomeIcon },
  { key: 'testcenter', label: 'مركز الاختبارات', Icon: FlaskIcon },
  { key: 'students', label: 'الطلاب', Icon: UsersIcon },
  { key: 'conversations', label: 'المحادثات', Icon: ChatIcon },
  { key: 'broadcast', label: 'الرسائل الجماعية', Icon: MegaphoneIcon },
];

const ADMIN_TAB: TabDef = { key: 'admin', label: 'الإدارة', Icon: SettingsIcon };

export default function TabsNavigation() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const session = useStore((s) => s.session);
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const canViewDiff =
    session?.role === 'director' || session?.role === 'dev' || !!session?.permissions?.includes('view_diff');
  const canEditQuestions =
    session?.role === 'director' || session?.role === 'dev' || !!session?.permissions?.includes('edit_questions');
  const showAdmin = canViewDiff || canEditQuestions;
  const TABS = [...BASE_TABS, ...(showAdmin ? [ADMIN_TAB] : [])];

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
    if (el && listRef.current) {
      const listRect = listRef.current.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setIndicator({ left: elRect.left - listRect.left, width: elRect.width });
    }
  }, [tab, TABS.length]);

  return (
    <Tabs.Root dir="rtl" value={tab} onValueChange={(v) => setTab(v as TabKey)}>
      <Tabs.List
        ref={listRef}
        dir="rtl"
        className="relative flex gap-1 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800"
      >
        {TABS.map((t) => (
          <Tabs.Trigger
            key={t.key}
            value={t.key}
            data-tab={t.key}
            className={cn(
              'flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors',
              tab === t.key
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <t.Icon className="h-4 w-4 shrink-0" />
            <span>{t.label}</span>
          </Tabs.Trigger>
        ))}
        <div
          className="absolute bottom-0 h-0.5 rounded-full bg-indigo-600 transition-all duration-300 ease-out dark:bg-indigo-400"
          style={{ left: indicator.left, width: indicator.width }}
        />
      </Tabs.List>
    </Tabs.Root>
  );
}
