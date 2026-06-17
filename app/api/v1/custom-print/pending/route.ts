import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// Fila de Etiquetas de Aprovacao pendentes (lida pelo print agent).
export async function GET(request: NextRequest) {
  return executeBackend('getPendingCustomPrintJobs', request);
}
