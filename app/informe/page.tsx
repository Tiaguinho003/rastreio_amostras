'use client';

import Link from 'next/link';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { useRequireAuth } from '../../lib/use-auth';

// Pagina "Informe" (item do tabbar mobile; Perfil migrou pro menu do avatar).
// Conteudo ainda nao definido: placeholder "Em construcao". Segue o padrao das
// demais paginas: verde em cima (.sdv-header transparente sobre o app-shell
// verde — rota layered no AppShell) + bege embaixo (.sdv-content). Navbar
// visivel (fora de hideMobileTabbar).
export default function InformePage() {
  const { session, loading, logout, setSession } = useRequireAuth();

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
      <section className="sdv-page">
        <header className="sdv-header">
          <div className="sdv-header-top">
            <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <span className="sdv-header-title">Informe</span>
            <HeaderAvatarMenu session={session} onLogout={logout} />
            <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
              <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
            </Link>
          </div>
        </header>

        <section className="sdv-content informe-content">
          <p className="informe-empty-text">Em construção</p>
          <p className="informe-empty-sub">Esta área estará disponível em breve.</p>
        </section>
      </section>
    </AppShell>
  );
}
