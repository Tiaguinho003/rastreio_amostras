import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

// Fila de Etiquetas de Envio pendentes (lida pelo print agent — fase 5).
export async function GET(request: NextRequest) {
  return executeBackend('getPendingShippingPrintJobs', request);
}
