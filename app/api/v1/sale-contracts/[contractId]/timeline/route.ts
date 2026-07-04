import { NextRequest } from 'next/server';

import { executeBackend } from '../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

// Timeline do modal de Detalhes (Fase J, D125): auditorias agregadas do
// contrato (criacao/edicoes, agio, aprovacoes, marcos de status, espelhos)
// em ordem decrescente, com os nomes dos atores resolvidos.
export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('getSaleContractTimeline', request, { params });
}
