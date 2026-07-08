import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// F1 (Eventos-Dashboard E24/D138): feed de "pagamentos de contrato" do card de
// Eventos (agendado = paymentDate; realizado = paidAt), escopado por papel
// (ADMIN + COMMERCIAL; gate no service). Janela `?from&to` = 'YYYY-MM-DD' (a
// quinzena visivel do card). Cache-Control private/max-age=30 (molde recent-sends).
export async function GET(request: NextRequest) {
  return executeBackend('getDashboardPaymentEvents', request, {
    responseHeaders: {
      'Cache-Control': 'private, max-age=30, must-revalidate',
    },
  });
}
