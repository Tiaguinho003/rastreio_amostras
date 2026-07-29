import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

// RC-D99: cascata do "Nº compra" da etiqueta de aprovação. Escrita estreita (só a
// coluna + version), fora do "Editar" — que re-snapshotaria a etapa 2 inteira e
// deixaria uma linha "EDIÇÃO" na timeline. Auth + não-PROSPECTOR no service;
// congelado fora de EMITIDO, como a própria etiqueta.
export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await readJsonBody(request);
  return executeBackend('setSaleContractPurchaseNumber', request, { params, body });
}
