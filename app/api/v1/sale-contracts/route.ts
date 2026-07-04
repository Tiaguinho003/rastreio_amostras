import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../_lib/adapter';

export async function GET(request: NextRequest) {
  return executeBackend('listSaleContracts', request);
}

// Fechamento (D97): cria um contrato JA EMITIDO num passo so — à vista
// (type=MERCADO_A_VISTA, registra a venda no lote) ou Futuro (type=FUTURO).
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  return executeBackend('createSaleContract', request, { body });
}
