import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// Embarque (EMB7/EMB26): feed de eventos de embarque do card de Eventos — agendado
// (requiresShipment + EMITIDO/FATURADO, no invoiceDate) e realizado (shippedAt). SEM
// gate de papel (todos os não-PROSPECTOR veem tudo). Janela `?from&to` = 'YYYY-MM-DD'.
// Cache-Control private/max-age=30 (molde payment/approval-events).
export async function GET(request: NextRequest) {
  return executeBackend('getDashboardShipmentEvents', request, {
    responseHeaders: {
      'Cache-Control': 'private, max-age=30, must-revalidate',
    },
  });
}
