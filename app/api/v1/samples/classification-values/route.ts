import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// Valores distintos de um campo de classificacao (?field=padrao|aspecto|
// catacao|certif) — alimenta as opcoes dos filtros multi-select de /samples.
export async function GET(request: NextRequest) {
  return executeBackend('listClassificationValues', request);
}
