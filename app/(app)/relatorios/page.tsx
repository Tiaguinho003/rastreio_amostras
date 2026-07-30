'use client';

import { RelatoriosViewer } from '../../../components/informe/RelatoriosViewer';
import { useRequireRole } from '../../../lib/auth/AuthProvider';
import { INFORME_ROLES } from '../../../lib/roles';

// Pagina "Relatorios" (rota /relatorios — unifica os antigos /informe e /resumo).
// Todo papel nao-PROSPECTOR (INFORME_ROLES = NON_PROSPECTOR_ROLES) e VIEWER: ve
// TODOS os relatorios (scope=all) e cria (Visita p/ todos; Semanal so ADMIN +
// COMMERCIAL). O PROSPECTOR nao usa esta pagina (formulario no sheet do
// dashboard dele). Unificacao 2026-07-15.

export default function RelatoriosPage() {
  const { session } = useRequireRole(INFORME_ROLES);

  if (!session) {
    return null;
  }

  return <RelatoriosViewer session={session} canCreate />;
}
