'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { ClientsBrowser } from '../../components/clients/ClientsBrowser';
import { useRequireAuth } from '../../lib/use-auth';
import { NON_PROSPECTOR_ROLES } from '../../lib/roles';

export default function ClientsPageWrapper() {
  return (
    <Suspense>
      <ClientsPage />
    </Suspense>
  );
}

// Pagina Clientes (COMMERCIAL / CLASSIFIER / REGISTRATION): casca (guard +
// AppShell + header). Toda a experiencia de lista vive no <ClientsBrowser>,
// componente compartilhado com a aba "Clientes" de /cadastros.
function ClientsPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: NON_PROSPECTOR_ROLES,
  });
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL ?incomplete=true (card "Cadastros pendentes" do dashboard) — so a
  // pagina le a URL; repassa ao browser via prop (o browser nao usa
  // useSearchParams pra poder rodar tambem em /cadastros, que nao tem Suspense).
  const incompleteFromUrl = searchParams.get('incomplete') === 'true';

  if (loading || !session) {
    return null;
  }

  const userFullName = session.user.fullName ?? session.user.username;
  const userAvatarInitials = userFullName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="clients-page-v2">
        {/* Header */}
        <header className="clients-v2-header">
          <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div className="clients-v2-header-center">
            <h2 className="nsv2-title">Clientes</h2>
          </div>
          <HeaderAvatarMenu session={session} onLogout={logout} />
          <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
            <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
          </Link>
        </header>

        {/* Casca transitoria da F1: o detalhe abre no overlay de /cadastros.
            Esta pagina vira redirect no proximo commit. */}
        <ClientsBrowser
          session={session}
          storageKey="clients-list-snapshot-v3"
          initialIncomplete={incompleteFromUrl}
          onOpenClient={(id) => router.push(`/cadastros?cliente=${encodeURIComponent(id)}`)}
        />
      </section>
    </AppShell>
  );
}
