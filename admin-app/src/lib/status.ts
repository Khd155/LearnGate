export type DerivedStatus = 'not_started' | 'started' | 'finished';

export function testStatusLabel(status: DerivedStatus): string {
  switch (status) {
    case 'finished':
      return 'انتهى';
    case 'started':
      return 'بدأ';
    default:
      return 'لم يبدأ';
  }
}

export function testStatusColor(status: DerivedStatus): { bg: string; text: string; dot: string } {
  switch (status) {
    case 'finished':
      return {
        bg: 'bg-emerald-100 dark:bg-emerald-500/15',
        text: 'text-emerald-700 dark:text-emerald-400',
        dot: 'bg-emerald-500',
      };
    case 'started':
      return {
        bg: 'bg-amber-100 dark:bg-amber-500/15',
        text: 'text-amber-700 dark:text-amber-400',
        dot: 'bg-amber-500',
      };
    default:
      return {
        bg: 'bg-slate-100 dark:bg-slate-500/15',
        text: 'text-slate-600 dark:text-slate-400',
        dot: 'bg-slate-400',
      };
  }
}
