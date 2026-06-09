'use client';

import Link from 'next/link';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { useRequireAuth } from '../../lib/use-auth';

// Pagina "Informe" — substitui o item Perfil no tabbar mobile (Perfil migrou
// pro menu do avatar no header). Conteudo ainda nao definido: placeholder "Em
// construcao". Reusa o shell e o empty-state das paginas de lista
// (.clients-page-v2 / .spv2-empty) pra herdar header, fundo e clearance do
// tabbar sem CSS novo; o navbar fica visivel (rota fora de hideMobileTabbar).
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
      <section className="clients-page-v2">
        <header className="clients-v2-header">
          <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div className="clients-v2-header-center">
            <h2 className="nsv2-title">Informe</h2>
          </div>
          <HeaderAvatarMenu session={session} onLogout={logout} />
          <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
            <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
          </Link>
        </header>

        <div className="spv2-list-scroll">
          <div className="spv2-empty">
            <p className="spv2-empty-text">Em construção</p>
            <p className="spv2-empty-sub">Esta área estará disponível em breve.</p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
