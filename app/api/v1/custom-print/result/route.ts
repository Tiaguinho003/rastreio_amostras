import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../_lib/adapter';

// Print agent reporta o resultado (DONE/FAILED) de uma Etiqueta de Aprovacao.
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);

  return executeBackend('resolveCustomPrintJob', request, { body });
}
