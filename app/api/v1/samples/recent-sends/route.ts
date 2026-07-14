import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

export async function GET(request: NextRequest) {
  // Card "Amostras enviadas" da pagina de Lotes (DSB-D14; nasceu no dashboard).
  // Cache-Control private (so browser do user, nao CDN/proxy) com max-age=30 +
  // must-revalidate: o feed precisa ser fresco mas nao a cada Alt+Tab. Cliente
  // combina com cachePolicy 'default' em getSampleRecentSends.
  return executeBackend('getSampleRecentSends', request, {
    responseHeaders: {
      'Cache-Control': 'private, max-age=30, must-revalidate',
    },
  });
}
