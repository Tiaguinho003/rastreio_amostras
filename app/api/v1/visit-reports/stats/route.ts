import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// Contadores do dashboard do prospector (sempre do proprio usuario).
// Sem Cache-Control: o refresh pos-envio do formulario precisa ser imediato.
export async function GET(request: NextRequest) {
  return executeBackend('getMyVisitReportStats', request);
}
