// Arabic relative "last seen" formatting — shared by the Dashboard's Zone-1
// cards, the students table, and the student profile header badge, so
// "آخر نشاط" always reads the same way everywhere it appears.
export function formatLastActive(iso: string | null): string {
  if (!iso) return 'لم يبدأ بعد';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'لم يبدأ بعد';
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;
  const months = Math.floor(days / 30);
  if (months < 12) return `منذ ${months} شهر`;
  const years = Math.floor(months / 12);
  return `منذ ${years} سنة`;
}

export function formatCooldownUntil(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' });
}
