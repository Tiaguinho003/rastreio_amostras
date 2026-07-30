'use client';

import { Suspense } from 'react';

import { DashboardDesktop } from '../../../components/dashboard/DashboardDesktop';
import { DashboardMobile } from '../../../components/dashboard/DashboardMobile';
import { ProspectorDashboard } from '../../../components/dashboard/prospector/ProspectorDashboard';
import { useAuth } from '../../../lib/auth/AuthProvider';
import { isProspector } from '../../../lib/roles';

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
  const { session, logout } = useAuth();

  // PROSPECTOR tem um dashboard dedicado e nao pode chamar os feeds do
  // dashboard padrao (403 na allowlist de API).
  const prospector = isProspector(session?.user.role);

  if (!session) {
    return null;
  }

  return prospector ? (
    <ProspectorDashboard session={session} onLogout={logout} />
  ) : (
    <>
      <DashboardMobile session={session} />
      <DashboardDesktop session={session} />
    </>
  );
}
