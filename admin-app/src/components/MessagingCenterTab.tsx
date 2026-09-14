import { useState } from 'react';
import { cn } from '../lib/cn';
import WhatsAppDispatchTab from './WhatsAppDispatchTab';
import BroadcastTab from './BroadcastTab';
import MessageHistoryTab from './MessageHistoryTab';
import { ChatIcon, MegaphoneIcon, ClockIcon } from './Icons';

type SubTab = 'whatsapp' | 'internal' | 'history';

const SUB_TABS: { key: SubTab; label: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { key: 'whatsapp', label: 'إشعارات ورسائل واتساب', Icon: ChatIcon },
  { key: 'internal', label: 'الرسائل والتنبيهات الداخلية', Icon: MegaphoneIcon },
  { key: 'history', label: 'سجل المراسلات', Icon: ClockIcon },
];

export default function MessagingCenterTab() {
  const [sub, setSub] = useState<SubTab>('whatsapp');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSub(t.key)}
            className={cn(
              'flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              sub === t.key
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <t.Icon className="h-4 w-4 shrink-0" />
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'whatsapp' && <WhatsAppDispatchTab />}
      {sub === 'internal' && <BroadcastTab />}
      {sub === 'history' && <MessageHistoryTab />}
    </div>
  );
}
