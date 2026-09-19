import { useState } from 'react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/cn';
import QuestionsTab from './QuestionsTab';
import DiffTab from './DiffTab';
import ProfileRequestsTab, { useProfileRequestsCount } from './ProfileRequestsTab';

type SubTab = 'questions' | 'diff' | 'profileRequests';

const UserEditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19.5 12.5 21 14l-4.5 4.5H15v-1.5Z" />
  </svg>
);

function SubTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors',
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
  // Anyone who can already edit a student's record directly (via the
  // Students tab) can also review these — no new permission flag needed.
  const canReviewProfileRequests = ['admin', 'director', 'dev'].includes(session?.role || '');
  const pendingProfileRequests = useProfileRequestsCount(canReviewProfileRequests);

  const [sub, setSub] = useState<SubTab>(canEditQuestions ? 'questions' : canViewDiff ? 'diff' : 'profileRequests');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canEditQuestions && (
          <SubTabButton active={sub === 'questions'} onClick={() => setSub('questions')}>📝 الأسئلة</SubTabButton>
        )}
        {canViewDiff && (
          <SubTabButton active={sub === 'diff'} onClick={() => setSub('diff')}>🔍 مقارنة الإجابات</SubTabButton>
        )}
        {canReviewProfileRequests && (
          <SubTabButton active={sub === 'profileRequests'} onClick={() => setSub('profileRequests')}>
            <UserEditIcon />
            طلبات تعديل البيانات
            {pendingProfileRequests > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {pendingProfileRequests}
              </span>
            )}
          </SubTabButton>
        )}
      </div>
      {sub === 'questions' && canEditQuestions && <QuestionsTab />}
      {sub === 'diff' && canViewDiff && <DiffTab />}
      {sub === 'profileRequests' && canReviewProfileRequests && <ProfileRequestsTab />}
    </div>
  );
}
