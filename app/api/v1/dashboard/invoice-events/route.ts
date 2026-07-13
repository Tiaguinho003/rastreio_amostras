import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// Faturamento (DSB-D11): feed de eventos de faturamento do card de Eventos — agendado
// (EMITIDO, no invoiceDate) e realizado (FATURADO/PAGO, no invoicedAt). SEM gate de
// papel (todos os não-PROSPECTOR veem tudo, como o embarque). Janela `?from&to` =
// 'YYYY-MM-DD'. Cache-Control private/max-age=30 (molde shipment-events).
export async function GET(request: NextRequest) {
  return executeBackend('getDashboardInvoiceEvents', request, {
    responseHeaders: {
      'Cache-Control': 'private, max-age=30, must-revalidate',
    },
  });
}
