'use client';

import { AppShell } from '../../components/AppShell';
import { RelatoriosViewer } from '../../components/informe/RelatoriosViewer';
import { useRequireAuth } from '../../lib/use-auth';
import { INFORME_ROLES } from '../../lib/roles';

// Pagina "Relatorios" (rota /informe — unificada com o antigo /resumo).
// ACESSO UNIFICADO (2026-07-15): todo papel nao-PROSPECTOR (INFORME_ROLES =
// NON_PROSPECTOR_ROLES) e VIEWER — ve TODOS os informes (scope=all) e cria
// (canCreate). O COMMERCIAL, que via so os proprios (scope=mine), passa a ver
// todos; o ramo "meus" (InformeCommercialPage) foi aposentado. PROSPECTOR nao usa
// esta pagina (formulario no sheet do dashboard dele).

export default function InformePage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: INFORME_ROLES,
  });

  if (loading || !session) {
    return null;
  }

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <RelatoriosViewer session={session} onLogout={logout} canCreate />
    </AppShell>
  );
}
