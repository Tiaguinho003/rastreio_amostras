'use client';

import Link from 'next/link';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { InformeCommercialPage } from '../../components/informe/InformeCommercialPage';
import { useRequireAuth } from '../../lib/use-auth';
import { isAdmin, NON_PROSPECTOR_ROLES } from '../../lib/roles';

// Pagina "Informe" — formularios POR PAPEL.
// COMMERCIAL (e ADMIN): pagina propria espelhando a /samples, com FAB de
// lapis abrindo os formularios "Visitas" e "Relatorio" e o feed dos
// proprios envios (components/informe/InformeCommercialPage).
// CLASSIFIER/REGISTRATION/CADASTRO: placeholder (formularios em construcao).
// PROSPECTOR nao usa esta pagina (guard redireciona pro /dashboard) — o
// formulario dele abre no sheet do dashboard.

export default function InformePage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: NON_PROSPECTOR_ROLES,
  });

  if (loading || !session) {
    return null;
  }

  if (session.user.role === 'COMMERCIAL' || isAdmin(session.user.role)) {
    return (
      <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
        <InformeCommercialPage session={session} onLogout={logout} />
      </AppShell>
    );
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

        <section className="sdv-content informe-content">
          <div className="informe-placeholder">
            <div className="rsm-empty">
              <span className="rsm-empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <rect x="5.5" y="4" width="13" height="17" rx="2.2" />
                  <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
                  <path d="M9 12h6" />
                  <path d="M9 15.5h4" />
                </svg>
              </span>
              <p className="rsm-empty-title">Nenhum formulário disponível</p>
              <p className="rsm-empty-sub">Os formulários do seu perfil vão aparecer aqui.</p>
            </div>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
