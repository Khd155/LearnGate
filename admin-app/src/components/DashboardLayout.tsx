import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import Header from './Header';
import StatsCards from './StatsCards';
import TopImprovingStudents from './TopImprovingStudents';
import TabsNavigation from './TabsNavigation';
import StudentsTable from './StudentsTable';
import StatisticsTab from './StatisticsTab';
import ConversationsTab from './ConversationsTab';
import BroadcastTab from './BroadcastTab';
import QuestionsTab from './QuestionsTab';
import DiffTab from './DiffTab';
import ToastSystem from './ToastSystem';

const STATS_POLL_MS = 45000;

export default function DashboardLayout() {
  const tab = useStore((s) => s.tab);
  const loadCore = useStore((s) => s.loadCore);
  const loadStats = useStore((s) => s.loadStats);

  useEffect(() => {
    loadCore();
    loadStats();
  }, [loadCore, loadStats]);

  // Realtime-ish updates: poll the stats endpoint, paused while the tab is hidden.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadStats();
    }, STATS_POLL_MS);
    return () => clearInterval(id);
  }, [loadStats]);

  return (
    <div className="min-h-screen bg-[#f4f8fb] dark:bg-gradient-to-b dark:from-slate-950 dark:to-slate-900">
      <Header />
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <StatsCards />
        <TopImprovingStudents />
        <TabsNavigation />
        <div key={tab} className="animate-tab-enter">
          {tab === 'students' && <StudentsTable />}
          {tab === 'stats' && <StatisticsTab />}
          {tab === 'conversations' && <ConversationsTab />}
          {tab === 'broadcast' && <BroadcastTab />}
          {tab === 'questions' && <QuestionsTab />}
          {tab === 'diff' && <DiffTab />}
        </div>
      </main>
      <ToastSystem />
    </div>
  );
}
