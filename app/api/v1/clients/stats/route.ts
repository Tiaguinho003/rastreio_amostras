import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

export async function GET(request: NextRequest) {
  // KPI row de /cadastros (RD14): 4 contagens globais de clientes. Mesmo
  // racional de cache dos recent-sends — fresco, mas nao a cada Alt+Tab.
  return executeBackend('getClientStats', request, {
    responseHeaders: {
      'Cache-Control': 'private, max-age=30, must-revalidate',
    },
  });
}
