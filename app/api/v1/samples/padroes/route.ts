import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// Valores distintos de `padrao` (classificacao) — alimenta as opcoes do filtro
// de /samples (multi-selecao, estilo "autofiltro do Excel").
export async function GET(request: NextRequest) {
  return executeBackend('listPadroes', request);
}
