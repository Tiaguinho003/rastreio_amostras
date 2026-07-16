import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// AP31/DSB-D19: feed do card de "Avisos" do dashboard — aprovação a enviar (contrato
// marcado + EMITIDO + sem etiqueta, dentro da janela de lead-time OU "À definir", D144).
// Binário (some quando a etiqueta é gerada), sem janela de data — é "pendente agora".
// Auth-only (todos os não-PROSPECTOR; PROSPECTOR barrado no allowlist central).
// Cache-Control private/max-age=30 (molde payment-events).
export async function GET(request: NextRequest) {
  return executeBackend('getDashboardAvisos', request, {
    responseHeaders: {
      'Cache-Control': 'private, max-age=30, must-revalidate',
    },
  });
}
