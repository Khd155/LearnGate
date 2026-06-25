interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export default function SearchInput({ value, onChange, placeholder }: Props) {
  return (
    <div className="relative flex-1 min-w-[200px]">
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'بحث بالاسم، الهوية، أو الجوال…'}
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pe-10 ps-4 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-900"
      />
    </div>
  );
}
