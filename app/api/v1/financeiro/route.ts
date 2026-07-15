import { NextRequest } from 'next/server';

import { executeBackend } from '../_lib/adapter';

// Financeiro (Fase F): corretagem a receber por fechamento — todo nao-PROSPECTOR
// (FINANCEIRO_ROLES = NON_PROSPECTOR_ROLES desde 2026-07-15; era ADMIN + COMMERCIAL),
// escopo aberto (todos veem TODOS os fechamentos; own-only revogado — D140).
// Relatorio derivado, on-demand, paginado por cursor (S86: ?search/?limit/?cursor).
export async function GET(request: NextRequest) {
  return executeBackend('listBrokerReceivables', request);
}
