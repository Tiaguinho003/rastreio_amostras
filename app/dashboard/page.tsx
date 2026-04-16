'use client';

import { AppShell } from '../../components/AppShell';
import { DashboardDesktop } from '../../components/dashboard/DashboardDesktop';
import { DashboardMobile } from '../../components/dashboard/DashboardMobile';
import { useDashboardData } from '../../components/dashboard/useDashboardData';
import { useRequireAuth } from '../../lib/use-auth';

export default function DashboardPage() {
  const { session, loading, logout, setSession } = useRequireAuth();
  const { data, salesData, error } = useDashboardData(session);

  if (loading || !session) {
    return null;
  }

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <DashboardMobile session={session} data={data} salesData={salesData} error={error} />
      <DashboardDesktop session={session} data={data} salesData={salesData} error={error} />
    </AppShell>
  );
}
