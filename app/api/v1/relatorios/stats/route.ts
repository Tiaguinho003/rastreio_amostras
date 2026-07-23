import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// Cards da pagina "Relatorios" (2 KPIs de visita: total + esta semana).
// Sem Cache-Control: o refresh pos-envio de uma visita precisa ser imediato
// (mesma pagina que cria) — igual ao visit-reports/stats do prospector.
export async function GET(request: NextRequest) {
  return executeBackend('getRelatoriosStats', request);
}
