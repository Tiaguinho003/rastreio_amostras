import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// Faturamento (DSB-D11): feed de eventos de faturamento do card de Eventos. Só o
// AGENDADO — contrato `EMITIDO`, no `invoiceDate`. O ramo "realizado" saiu com a
// RC-D62: `FATURADO`/`PAGO` e a coluna `invoicedAt` não existem mais, e faturar
// deixou de ser ato registrável. SEM gate de papel (todos os não-PROSPECTOR veem
// tudo). Janela `?from&to` = 'YYYY-MM-DD'. Cache-Control private/max-age=30.
export async function GET(request: NextRequest) {
  return executeBackend('getDashboardInvoiceEvents', request, {
    responseHeaders: {
      'Cache-Control': 'private, max-age=30, must-revalidate',
    },
  });
}
