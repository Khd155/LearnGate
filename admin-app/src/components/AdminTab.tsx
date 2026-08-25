import { useState } from 'react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/cn';
import QuestionsTab from './QuestionsTab';
import DiffTab from './DiffTab';

type SubTab = 'questions' | 'diff';

function SubTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm font-bold transition-colors',
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
      )}
    >
      {children}
    </button>
  );
}

export default function AdminTab() {
  const session = useStore((s) => s.session);
  const canViewDiff =
    session?.role === 'director' || session?.role === 'dev' || !!session?.permissions?.includes('view_diff');
  const canEditQuestions =
    session?.role === 'director' || session?.role === 'dev' || !!session?.permissions?.includes('edit_questions');

  const [sub, setSub] = useState<SubTab>(canEditQuestions ? 'questions' : 'diff');

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {canEditQuestions && (
          <SubTabButton active={sub === 'questions'} onClick={() => setSub('questions')}>📝 الأسئلة</SubTabButton>
        )}
        {canViewDiff && (
          <SubTabButton active={sub === 'diff'} onClick={() => setSub('diff')}>🔍 مقارنة الإجابات</SubTabButton>
        )}
      </div>
      {sub === 'questions' && canEditQuestions && <QuestionsTab />}
      {sub === 'diff' && canViewDiff && <DiffTab />}
    </div>
  );
}
