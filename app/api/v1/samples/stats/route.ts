import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

export async function GET(request: NextRequest) {
  // KPI row da lista de Lotes (FV /samples): contagens globais de amostras.
  // Mesmo racional de cache do /clients/stats e dos recent-sends — fresco, mas
  // nao a cada Alt+Tab. Cliente combina com cachePolicy 'default'.
  return executeBackend('getSampleStats', request, {
    responseHeaders: {
      'Cache-Control': 'private, max-age=30, must-revalidate',
    },
  });
}
