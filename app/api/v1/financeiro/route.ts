import { NextRequest } from 'next/server';

import { executeBackend } from '../_lib/adapter';

// Financeiro (Fase F): corretagem a receber por fechamento (ADMIN + COMMERCIAL,
// role-adaptive no service). Relatorio derivado, on-demand.
export async function GET(request: NextRequest) {
  return executeBackend('listBrokerReceivables', request);
}
