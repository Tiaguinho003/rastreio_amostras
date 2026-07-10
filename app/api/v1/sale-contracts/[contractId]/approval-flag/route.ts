import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

// AP23: toggle rapido Sim/Nao do requiresApproval (do modal de Detalhes). Auth +
// ADMIN/COMMERCIAL no service; travas AP20 (so EMITIDO; Sim->Nao so sem etiqueta).
export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await readJsonBody(request);
  return executeBackend('setSaleContractApprovalFlag', request, { params, body });
}
