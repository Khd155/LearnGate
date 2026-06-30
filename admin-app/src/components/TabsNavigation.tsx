import { useEffect, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useStore, type TabKey } from '../store/useStore';
import { cn } from '../lib/cn';

const BASE_TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'students', label: 'الطلاب', icon: '👥' },
  { key: 'stats', label: 'الإحصائيات', icon: '📊' },
  { key: 'diff', label: 'مقارنة الإجابات', icon: '🔍' },
  { key: 'conversations', label: 'المحادثات', icon: '💬' },
  { key: 'broadcast', label: 'رسالة جماعية', icon: '📢' },
];

const QUESTIONS_TAB: { key: TabKey; label: string; icon: string } = {
  key: 'questions',
  label: 'الأسئلة',
  icon: '📝',
};

export default function TabsNavigation() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const session = useStore((s) => s.session);
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const canEditQuestions =
    session?.role === 'director' || session?.role === 'dev' || !!session?.permissions?.includes('edit_questions');
  const TABS = canEditQuestions ? [...BASE_TABS, QUESTIONS_TAB] : BASE_TABS;

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
            <span>{t.icon}</span>
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
