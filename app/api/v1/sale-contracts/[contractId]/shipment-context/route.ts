import { NextRequest } from 'next/server';

import { executeBackend } from '../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

// Resumo do embarque pro modal de confirmacao (worklist + portao do pagamento).
// Auth-only (todos os nao-PROSPECTOR).
export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('getSaleContractShipmentContext', request, { params });
}
