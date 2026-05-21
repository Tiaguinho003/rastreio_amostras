import { NextRequest } from 'next/server';

import { executeBackend } from '../../../_lib/adapter';

// Liga B4 Fase 2: GET /api/v1/samples/:sampleId/blend-feasibility — viabilidade
// da venda de uma liga: árvore recursiva de descendentes com saldos + as
// origens que bloqueiam a cascata pelo hard block quantitativo F7.6.
// Consumido pela pré-validação do modal de venda (Fase 5) e pelo flag de
// viabilidade no detalhe da liga (Fase 7).
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sampleId: string }> }
) {
  const params = await context.params;
  return executeBackend('getBlendFeasibility', request, {
    params: { sampleId: params.sampleId },
  });
}
