import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import Header from './Header';
import TabsNavigation from './TabsNavigation';
import DashboardTab from './DashboardTab';
import StudentsTable from './StudentsTable';
import TestCenterTab from './TestCenterTab';
import ConversationsTab from './ConversationsTab';
import BroadcastTab from './BroadcastTab';
import AdminTab from './AdminTab';
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
        <TabsNavigation />
        <div key={tab} className="animate-tab-enter">
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'students' && <StudentsTable />}
          {tab === 'testcenter' && <TestCenterTab />}
          {tab === 'conversations' && <ConversationsTab />}
          {tab === 'broadcast' && <BroadcastTab />}
          {tab === 'admin' && <AdminTab />}
        </div>
      </main>
      <ToastSystem />
    </div>
  );
}
