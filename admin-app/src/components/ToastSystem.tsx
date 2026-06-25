import { useStore } from '../store/useStore';
import { cn } from '../lib/cn';

export default function ToastSystem() {
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);

  if (!toasts.length) return null;

  return (
    <div className="fixed left-1/2 top-4 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'animate-toast-in flex items-start gap-2 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm',
            t.type === 'success'
              ? 'border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50/95 text-rose-800 dark:border-rose-800 dark:bg-rose-950/90 dark:text-rose-200',
          )}
        >
          <span className="mt-0.5 text-base leading-none">{t.type === 'success' ? '✅' : '⚠️'}</span>
          <p className="flex-1 text-sm leading-snug">{t.message}</p>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="rounded-md p-0.5 text-current/60 hover:text-current"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
