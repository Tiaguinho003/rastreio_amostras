'use client';

import Link from 'next/link';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { InformeCommercialPage } from '../../components/informe/InformeCommercialPage';
import { RelatoriosViewer } from '../../components/informe/RelatoriosViewer';
import { useRequireAuth } from '../../lib/use-auth';
import { isAdmin, isVisitReportViewer, INFORME_ROLES } from '../../lib/roles';

// Pagina "Relatorios" (rota /informe — unificada com o antigo /resumo),
// adaptativa por papel:
// - ADMIN/CADASTRO (viewers): RelatoriosViewer — feed de TODOS (scope=all) +
//   curadoria de vinculo; ADMIN tambem cria (FAB).
// - COMMERCIAL: InformeCommercialPage — feed dos PROPRIOS (scope=mine) + FAB.
// - REGISTRATION: placeholder vazio (sem formularios proprios).
// - CLASSIFIER: NAO acessa (Metricas na navbar; guard -> /dashboard).
// - PROSPECTOR: nao usa esta pagina (formulario no sheet do dashboard).

export default function InformePage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: INFORME_ROLES,
  });

  if (loading || !session) {
    return null;
  }

  const role = session.user.role;

  // ADMIN/CADASTRO: visao de supervisao (todos os formularios + curadoria).
  // ADMIN tambem cria (canCreate).
  if (isVisitReportViewer(role)) {
    return (
      <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
        <RelatoriosViewer session={session} onLogout={logout} canCreate={isAdmin(role)} />
      </AppShell>
    );
  }

  // COMMERCIAL: feed dos proprios envios + FAB de criacao.
  if (role === 'COMMERCIAL') {
    return (
      <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
        <InformeCommercialPage session={session} onLogout={logout} />
      </AppShell>
    );
  }

  // REGISTRATION (e qualquer outro papel sem formularios proprios): placeholder.
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
            <span className="sdv-header-title">Relatórios</span>
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
