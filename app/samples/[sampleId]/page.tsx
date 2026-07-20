'use client';

import { useParams } from 'next/navigation';

import { AppShell } from '../../../components/AppShell';
import { SampleDetailView } from '../../../components/samples/SampleDetailView';
import { NON_PROSPECTOR_ROLES } from '../../../lib/roles';
import { useRequireAuth } from '../../../lib/use-auth';

// Casca TRANSITORIA da F2 (redesign): guard + AppShell em volta do
// SampleDetailView extraido (molde da casca interina de /clients/[clientId]
// na F1, commit 2510659). Morre no commit dos redirects da F2c, quando o
// detalhe passa a abrir como overlay em /samples?lote=<id>.
export default function SampleDetailPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: NON_PROSPECTOR_ROLES,
  });
  const params = useParams<{ sampleId: string }>();
  const sampleId = typeof params.sampleId === 'string' ? params.sampleId : '';

  if (loading || !session) {
    return null;
  }

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      {sampleId ? (
        <SampleDetailView session={session} sampleId={sampleId} />
      ) : (
        <p className="error">sampleId invalido na rota.</p>
      )}
    </AppShell>
  );
}
