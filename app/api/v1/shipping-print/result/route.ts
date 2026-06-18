import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../_lib/adapter';

// Print agent reporta o resultado (DONE/FAILED) de uma Etiqueta de Envio.
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);

  return executeBackend('resolveShippingPrintJob', request, { body });
}
