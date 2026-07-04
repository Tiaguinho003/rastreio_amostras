import { NextRequest } from 'next/server';

import { executeBackend } from '../../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

// Prefill da Etiqueta de Aprovacao a partir do contrato (D115/D116): 5 campos
// + lotes ja quebrados do "Lote de origem" da amostra + o texto original de
// referencia. 404 inexistente; 409 status inelegivel.
export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('getApprovalLabelPrefill', request, { params });
}
