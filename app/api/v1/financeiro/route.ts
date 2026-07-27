import { NextRequest } from 'next/server';

import { executeBackend } from '../_lib/adapter';

// Financeiro (Fase F): corretagem a receber por fechamento — so ADMIN
// (FINANCEIRO_ROLES apertado pela RC-D3; era NON_PROSPECTOR_ROLES), escopo aberto
// dentro disso (o ADMIN ve TODOS os fechamentos; own-only revogado — D140).
// Relatorio derivado, on-demand, paginado por cursor (S86: ?search/?limit/?cursor).
export async function GET(request: NextRequest) {
  return executeBackend('listBrokerReceivables', request);
}
