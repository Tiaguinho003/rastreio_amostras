import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../_lib/adapter';

// Enfileira uma Etiqueta de Aprovacao (modal do leque "+" em /samples).
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);

  return executeBackend('enqueueCustomPrintJob', request, { body });
}
