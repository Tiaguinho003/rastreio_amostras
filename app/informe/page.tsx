'use client';

import { AppShell } from '../../components/AppShell';
import { InformeCommercialPage } from '../../components/informe/InformeCommercialPage';
import { RelatoriosViewer } from '../../components/informe/RelatoriosViewer';
import { useRequireAuth } from '../../lib/use-auth';
import { isAdmin, isVisitReportViewer, INFORME_ROLES } from '../../lib/roles';

// Pagina "Relatorios" (rota /informe — unificada com o antigo /resumo),
// adaptativa por papel:
// - ADMIN (viewer): RelatoriosViewer — feed de TODOS (scope=all) + curadoria de
//   vinculo; tambem cria (FAB).
// - COMMERCIAL: InformeCommercialPage — feed dos PROPRIOS (scope=mine) + FAB.
// - Os demais NAO acessam (guard -> /dashboard): CLASSIFIER, CADASTRO (saiu em
//   2026-06-28) e REGISTRATION (saiu em 2026-07-10 — nao tem formulario proprio).
// - PROSPECTOR: nao usa esta pagina (formulario no sheet do dashboard).
//
// INFORME_ROLES cobre exatamente os dois ramos abaixo; nao ha terceiro caso.

export default function InformePage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: INFORME_ROLES,
  });

  if (loading || !session) {
    return null;
  }

  const role = session.user.role;

  // ADMIN: visao de supervisao (todos os formularios + curadoria) + criacao
  // (canCreate).
  if (isVisitReportViewer(role)) {
    return (
      <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
        <RelatoriosViewer session={session} onLogout={logout} canCreate={isAdmin(role)} />
      </AppShell>
    );
  }

  // COMMERCIAL: feed dos proprios envios + FAB de criacao.
  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <InformeCommercialPage session={session} onLogout={logout} />
    </AppShell>
  );
}
