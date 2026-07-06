import { NextRequest } from 'next/server';

import { executeBackend } from '../_lib/adapter';

// Financeiro (Fase F, D128 = ADMIN-only): corretagem a receber por fechamento.
// Relatorio derivado, on-demand, paginado por cursor (S86: ?search/?limit/?cursor).
export async function GET(request: NextRequest) {
  return executeBackend('listBrokerReceivables', request);
}
