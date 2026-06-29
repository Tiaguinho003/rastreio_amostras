import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../_lib/adapter';

export async function GET(request: NextRequest) {
  return executeBackend('listSaleContracts', request);
}

// Fechamento (Futuro): cria um contrato FUTURO direto (sem lote).
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  return executeBackend('createFutureSaleContract', request, { body });
}
