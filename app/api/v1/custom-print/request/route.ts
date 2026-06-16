import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../_lib/adapter';

// TEMPORARIO: enfileira uma etiqueta avulsa (card do dashboard admin).
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);

  return executeBackend('enqueueCustomPrintJob', request, { body });
}
