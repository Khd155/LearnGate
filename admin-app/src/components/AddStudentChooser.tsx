import * as Dialog from '@radix-ui/react-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManual: () => void;
  onImport: () => void;
}

export default function AddStudentChooser({ open, onOpenChange, onManual, onImport }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl animate-fade-in dark:bg-slate-800">
          <Dialog.Title className="text-lg font-bold text-slate-900 dark:text-white">إضافة طالب</Dialog.Title>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">اختر طريقة الإضافة</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onManual();
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-5 text-center transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-600 dark:hover:bg-indigo-950/40"
            >
              <span className="text-3xl">✍️</span>
              <span className="text-sm font-bold text-slate-800 dark:text-white">إضافة يدوية</span>
              <span className="text-xs text-slate-400">طالب واحد بالنموذج</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onImport();
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-5 text-center transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-600 dark:hover:bg-emerald-950/40"
            >
              <span className="text-3xl">📥</span>
              <span className="text-sm font-bold text-slate-800 dark:text-white">استيراد من Excel</span>
              <span className="text-xs text-slate-400">عدد كبير دفعة واحدة</span>
            </button>
          </div>
          <Dialog.Close asChild>
            <button
              type="button"
              className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              إلغاء
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
