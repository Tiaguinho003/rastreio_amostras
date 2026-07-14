import { NextRequest } from 'next/server';

import { executeBackend } from '../../../_lib/adapter';

export async function GET(request: NextRequest) {
  // Card "Aprovacoes enviadas" da aba Aprovacoes (DSB-D14; nasceu no dashboard).
  // Mesma politica de cache do feed de envios de amostra: private + max-age=30 +
  // must-revalidate, combinando com cachePolicy 'default' em getApprovalRecentSends.
  return executeBackend('getApprovalRecentSends', request, {
    responseHeaders: {
      'Cache-Control': 'private, max-age=30, must-revalidate',
    },
  });
}
