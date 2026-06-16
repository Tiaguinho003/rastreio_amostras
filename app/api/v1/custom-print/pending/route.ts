import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// TEMPORARIO: fila de etiquetas avulsas pendentes (lida pelo print agent).
export async function GET(request: NextRequest) {
  return executeBackend('getPendingCustomPrintJobs', request);
}
