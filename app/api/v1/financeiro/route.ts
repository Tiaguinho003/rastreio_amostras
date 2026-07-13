import { NextRequest } from 'next/server';

import { executeBackend } from '../_lib/adapter';

// Financeiro (Fase F): corretagem a receber por fechamento — ADMIN + COMMERCIAL,
// escopo aberto (ambos veem TODOS os fechamentos; own-only revogado 2026-07-13).
// Relatorio derivado, on-demand, paginado por cursor (S86: ?search/?limit/?cursor).
export async function GET(request: NextRequest) {
  return executeBackend('listBrokerReceivables', request);
}
