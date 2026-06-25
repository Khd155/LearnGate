import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import Header from './Header';
import StatsCards from './StatsCards';
import TabsNavigation from './TabsNavigation';
import StudentsTable from './StudentsTable';
import StatisticsTab from './StatisticsTab';
import ConversationsTab from './ConversationsTab';
import BroadcastTab from './BroadcastTab';
import ToastSystem from './ToastSystem';

export default function DashboardLayout() {
  const tab = useStore((s) => s.tab);
  const loadCore = useStore((s) => s.loadCore);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  return (
    <div className="min-h-screen bg-[#f4f8fb] dark:bg-gradient-to-b dark:from-slate-950 dark:to-slate-900">
      <Header />
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <StatsCards />
        <TabsNavigation />
        <div className="animate-fade-in">
          {tab === 'students' && <StudentsTable />}
          {tab === 'stats' && <StatisticsTab />}
          {tab === 'conversations' && <ConversationsTab />}
          {tab === 'broadcast' && <BroadcastTab />}
        </div>
      </main>
      <ToastSystem />
    </div>
  );
}
