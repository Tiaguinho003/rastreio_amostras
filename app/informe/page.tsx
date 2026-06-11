'use client';

import Link from 'next/link';
import { useRef } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { VisitReportForm } from '../../components/visits/VisitReportForm';
import { useRequireAuth } from '../../lib/use-auth';

// Pagina "Informe" — formulario de visita (item do tabbar mobile).
// O formulario em si vive em components/visits/VisitReportForm (reutilizado
// pelo BottomSheet do dashboard do prospector); aqui fica so o shell visual:
// verde em cima (.sdv-header transparente sobre o app-shell verde — rota
// layered no AppShell) + sheet bege embaixo (.sdv-content.informe-content)
// com a navbar visivel (fora de hideMobileTabbar). O envio via POST
// /visit-reports carimba usuario + data/hora no backend; viewers leem tudo
// na pagina /resumo.

export default function InformePage() {
  const { session, loading, logout, setSession } = useRequireAuth();

  const contentRef = useRef<HTMLElement | null>(null);

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
            {/* Spacer invisivel no lugar do botao de voltar: mantem o titulo
                (flex: 1 + text-align: center) equilibrado com o avatar a direita. */}
            <span
              className="nsv2-back"
              aria-hidden="true"
              style={{ visibility: 'hidden', pointerEvents: 'none' }}
            />
            <span className="sdv-header-title">Informe</span>
            <HeaderAvatarMenu session={session} onLogout={logout} />
            <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
              <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
            </Link>
          </div>
        </header>

        <section className="sdv-content informe-content" ref={contentRef}>
          <VisitReportForm session={session} scrollContainerRef={contentRef} />
        </section>
      </section>
    </AppShell>
  );
}
