'use client';

import { AppShell } from '../../components/AppShell';
import { RelatoriosViewer } from '../../components/informe/RelatoriosViewer';
import { useRequireAuth } from '../../lib/use-auth';
import { INFORME_ROLES } from '../../lib/roles';

// Pagina "Relatorios" (rota /relatorios — unifica os antigos /informe e /resumo).
// Todo papel nao-PROSPECTOR (INFORME_ROLES = NON_PROSPECTOR_ROLES) e VIEWER: ve
// TODOS os relatorios (scope=all) e cria (Visita p/ todos; Semanal so ADMIN +
// COMMERCIAL). O PROSPECTOR nao usa esta pagina (formulario no sheet do
// dashboard dele). Unificacao 2026-07-15.

export default function RelatoriosPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: INFORME_ROLES,
  });

  if (loading || !session) {
    return null;
  }

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <RelatoriosViewer session={session} canCreate />
    </AppShell>
  );
}
