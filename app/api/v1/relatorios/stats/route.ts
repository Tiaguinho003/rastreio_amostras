import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// Cards do topo da pagina "Relatorios": "Visitas esta semana" (+ a semana
// anterior, p/ a UI derivar o delta) e a tendencia de 13 semanas do grafico.
// Sem Cache-Control: o refresh pos-envio de uma visita precisa ser imediato
// (mesma pagina que cria) — igual ao visit-reports/stats do prospector.
export async function GET(request: NextRequest) {
  return executeBackend('getRelatoriosStats', request);
}
