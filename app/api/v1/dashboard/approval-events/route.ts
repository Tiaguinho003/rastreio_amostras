import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// F2 (reforma Aprovacao AP6/AP7/AP10): feed do "lembrete de aprovacao" do card de
// Eventos — contratos que precisam de aprovacao (requiresApproval + EMITIDO) e ainda
// nao geraram a etiqueta, todo dia de max(hoje, invoiceDate-lead) ate a janela. SEM
// gate de papel (todos os nao-PROSPECTOR veem tudo). Janela `?from&to` = 'YYYY-MM-DD'.
// Cache-Control private/max-age=30 (molde payment-events).
export async function GET(request: NextRequest) {
  return executeBackend('getDashboardApprovalEvents', request, {
    responseHeaders: {
      'Cache-Control': 'private, max-age=30, must-revalidate',
    },
  });
}
