'use client';

import { Suspense } from 'react';

import { AppShell } from '../../components/AppShell';
import { DashboardDesktop } from '../../components/dashboard/DashboardDesktop';
import { DashboardMobile } from '../../components/dashboard/DashboardMobile';
import { ProspectorDashboard } from '../../components/dashboard/prospector/ProspectorDashboard';
import { useDashboardData } from '../../components/dashboard/useDashboardData';
import { isProspector } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';

// Suspense por causa do useSearchParams no ProspectorDashboard (deep link
// ?informe=novo do lembrete push) — mesmo padrao do SamplesPageWrapper.
export default function DashboardPageWrapper() {
  return (
    <Suspense>
      <DashboardPage />
    </Suspense>
  );
}

function DashboardPage() {
  const { session, loading, logout, setSession } = useRequireAuth();

  // PROSPECTOR tem um dashboard dedicado e nao pode chamar os stats do
  // dashboard padrao (403 na allowlist de API) — passar null faz o hook
  // nao buscar nada.
  const prospector = isProspector(session?.user.role);
  const { data, salesData, error } = useDashboardData(prospector ? null : session);

  if (loading || !session) {
    return null;
  }

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      {prospector ? (
        <ProspectorDashboard session={session} onLogout={logout} />
      ) : (
        <>
          <DashboardMobile
            session={session}
            data={data}
            salesData={salesData}
            error={error}
            onLogout={logout}
          />
          <DashboardDesktop session={session} data={data} salesData={salesData} error={error} />
        </>
      )}
    </AppShell>
  );
}
