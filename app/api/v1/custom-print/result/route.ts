import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../_lib/adapter';

// TEMPORARIO: print agent reporta o resultado (DONE/FAILED) de uma etiqueta avulsa.
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);

  return executeBackend('resolveCustomPrintJob', request, { body });
}
