import * as Select from '@radix-ui/react-select';
import SearchInput from './SearchInput';
import type { DerivedStatus } from '../lib/status';
import { GRADE_LEVELS, type GradeLevel } from '../types';
import { DownloadIcon, PlusIcon, ChevronDownIcon } from './Icons';

export type GradeFilter = GradeLevel | 'all';

export type SortKey = 'name' | 'status' | 'score_asc' | 'recent' | 'last_active_desc' | 'last_active_asc';

const STATUS_LABELS: Record<DerivedStatus | 'all', string> = {
  all: 'كل الحالات',
  not_started: 'لم يبدأ',
  started: 'بدأ',
  finished: 'انتهى',
};

const SORT_LABELS: Record<SortKey, string> = {
  name: 'ترتيب بالاسم',
  status: 'ترتيب بالحالة',
  score_asc: 'الأداء (الأضعف أولاً)',
  recent: 'الأحدث انضمامًا',
  last_active_desc: 'آخر نشاط (الأحدث أولاً)',
  last_active_asc: 'آخر نشاط (الأقدم أولاً)',
};

interface Props {
  search: string;
  onSearch: (v: string) => void;
  statusFilter: DerivedStatus | 'all';
  onStatusFilter: (v: DerivedStatus | 'all') => void;
  gradeFilter: GradeFilter;
  onGradeFilter: (v: GradeFilter) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  onAdd: () => void;
  onExport: () => void;
}

function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <Select.Item
      value={value}
      className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-indigo-50 data-[highlighted]:text-indigo-700 dark:data-[highlighted]:bg-indigo-950 dark:data-[highlighted]:text-indigo-300"
    >
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  );
}

const triggerCls =
  'flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700';

export default function FiltersBar({
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  gradeFilter,
  onGradeFilter,
  sort,
  onSort,
  onAdd,
  onExport,
}: Props) {
  return (
    // A single wrapping row: the search box takes the leftover space so the
    // controls stay packed next to it instead of the add button being pushed
    // to the far edge by me-auto, which left a wide dead gap mid-bar in RTL.
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="min-w-[200px] flex-1">
        <SearchInput value={search} onChange={onSearch} />
      </div>

      <Select.Root value={statusFilter} onValueChange={(v) => onStatusFilter(v as DerivedStatus | 'all')}>
        <Select.Trigger className={triggerCls}>
          <Select.Value>{STATUS_LABELS[statusFilter]}</Select.Value>
          <Select.Icon><ChevronDownIcon className="h-4 w-4 text-slate-400" /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <Select.Viewport>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="not_started">لم يبدأ</SelectItem>
              <SelectItem value="started">بدأ</SelectItem>
              <SelectItem value="finished">انتهى</SelectItem>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <Select.Root value={gradeFilter} onValueChange={(v) => onGradeFilter(v as GradeFilter)}>
        <Select.Trigger className={triggerCls}>
          <Select.Value>{gradeFilter === 'all' ? 'جميع المراحل' : gradeFilter}</Select.Value>
          <Select.Icon><ChevronDownIcon className="h-4 w-4 text-slate-400" /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <Select.Viewport>
              <SelectItem value="all">جميع المراحل</SelectItem>
              {GRADE_LEVELS.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <Select.Root value={sort} onValueChange={(v) => onSort(v as SortKey)}>
        <Select.Trigger className={triggerCls}>
          <Select.Value>{SORT_LABELS[sort]}</Select.Value>
          <Select.Icon><ChevronDownIcon className="h-4 w-4 text-slate-400" /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <Select.Viewport>
              <SelectItem value="name">ترتيب بالاسم</SelectItem>
              <SelectItem value="status">ترتيب بالحالة</SelectItem>
              <SelectItem value="score_asc">الأداء (الأضعف أولاً)</SelectItem>
              <SelectItem value="recent">الأحدث انضمامًا</SelectItem>
              <SelectItem value="last_active_desc">آخر نشاط (الأحدث أولاً)</SelectItem>
              <SelectItem value="last_active_asc">آخر نشاط (الأقدم أولاً)</SelectItem>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <button
        type="button"
        onClick={onExport}
        className={triggerCls + ' font-medium'}
      >
        <DownloadIcon className="h-4 w-4 text-slate-400" />
        تصدير Excel
      </button>

      <button
        type="button"
        onClick={onAdd}
        className="flex h-11 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700 dark:shadow-none"
      >
        <PlusIcon className="h-4 w-4" />
        إضافة طالب
      </button>
    </div>
  );
}
