import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

export async function GET(request: NextRequest) {
  // Cache-Control private (so browser do user, nao CDN/proxy) com
  // max-age=30 + must-revalidate: o feed de envios precisa ser fresco
  // mas nao a cada Alt+Tab. Cliente combina com cachePolicy 'default'
  // em getDashboardRecentSends.
  return executeBackend('getDashboardRecentSends', request, {
    responseHeaders: {
      'Cache-Control': 'private, max-age=30, must-revalidate',
    },
  });
}
