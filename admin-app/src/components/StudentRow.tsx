import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Checkbox from '@radix-ui/react-checkbox';
import type { Student } from '../types';
import { testStatusColor, testStatusLabel, type DerivedStatus } from '../lib/status';
import { cn } from '../lib/cn';

interface Props {
  student: Student;
  status: DerivedStatus;
  score: number | null;
  lastMessage: string | null;
  unreadCount: number;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (student: Student) => void;
  onOpenProfile: (student: Student) => void;
  onResetTest: (student: Student) => void;
  onDelete: (student: Student) => void;
  onMessage: (student: Student) => void;
}

export default function StudentRow({
  student,
  status,
  score,
  lastMessage,
  unreadCount,
  selected,
  onToggleSelect,
  onOpen,
  onOpenProfile,
  onResetTest,
  onDelete,
  onMessage,
}: Props) {
  const colors = testStatusColor(status);
  return (
    <tr className="animate-row-in group border-b border-slate-100 last:border-0 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/50" style={{ transition: 'background-color 150ms ease' }}>
      <td className="w-10 px-4 py-3">
        <Checkbox.Root
          checked={selected}
          onCheckedChange={() => onToggleSelect(student.id)}
          className="flex h-5 w-5 items-center justify-center rounded-md border border-slate-300 bg-white data-[state=checked]:border-indigo-600 data-[state=checked]:bg-indigo-600 dark:border-slate-600 dark:bg-slate-800"
        >
          <Checkbox.Indicator className="text-white text-xs">✓</Checkbox.Indicator>
        </Checkbox.Root>
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => onOpenProfile(student)}
          title="فتح الملف العلمي الكامل"
          className="font-medium text-slate-900 hover:text-indigo-600 hover:underline dark:text-white dark:hover:text-indigo-400"
        >
          {student.name}
        </button>
      </td>
      <td className="px-4 py-3 font-mono text-sm text-slate-600 dark:text-slate-300">{student.code}</td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{student.phone || '—'}</td>
      <td className="px-4 py-3">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', colors.bg, colors.text)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', colors.dot)} />
          {testStatusLabel(status)}
        </span>
      </td>
      <td className="px-4 py-3">
        {score === null ? (
          <span className="text-sm text-slate-400">—</span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
              score >= 70
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                : score >= 50
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
            )}
            title={score < 50 ? 'أداء ضعيف — يحتاج متابعة' : score >= 70 ? 'أداء متقدم' : 'أداء متوسط'}
          >
            {score >= 70 ? '▲' : score < 50 ? '▼' : '—'} {score}%
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="max-w-[160px] truncate">{lastMessage || '—'}</span>
          {unreadCount > 0 && (
            <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={() => onOpen(student)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:text-indigo-400 dark:hover:bg-indigo-950/50"
          aria-label="تعديل بيانات الطالب"
          title="تعديل"
        >
          ✏️
        </button>
      </td>
      <td className="px-4 py-3 text-end">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-700 focus:opacity-100 dark:hover:bg-slate-700"
              aria-label="إجراءات"
            >
              ⋮
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            >
              <DropdownMenu.Item
                onSelect={() => onOpenProfile(student)}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                🔬 الملف العلمي
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => onMessage(student)}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                💬 رسالة
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => onResetTest(student)}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                🔓 سماح بإعادة الاختبار
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
              <DropdownMenu.Item
                onSelect={() => onDelete(student)}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm text-rose-600 outline-none hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
              >
                🗑️ حذف
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </td>
    </tr>
  );
}
