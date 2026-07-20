'use client';

import { useParams } from 'next/navigation';

import { AppShell } from '../../../components/AppShell';
import { ClientDetailView } from '../../../components/clients/ClientDetailView';
import { useRequireAuth } from '../../../lib/use-auth';
import { CLIENT_MANAGEMENT_ROLES } from '../../../lib/roles';

// Casca transitoria da F1 do redesign: o conteudo inteiro do detalhe vive em
// <ClientDetailView> (components/clients). No proximo commit esta rota vira
// redirect pra /cadastros?cliente=<id> e a casca morre.
export default function ClientDetailPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: CLIENT_MANAGEMENT_ROLES,
    unauthorizedRedirectTo: '/clients',
  });
  const params = useParams<{ clientId: string }>();
  const clientId = typeof params.clientId === 'string' ? params.clientId : '';

  if (loading || !session) return null;

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <ClientDetailView session={session} clientId={clientId} />
    </AppShell>
  );
}
