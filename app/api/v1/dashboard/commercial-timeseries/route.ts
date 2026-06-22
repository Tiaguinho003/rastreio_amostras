import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

export async function GET(request: NextRequest) {
  // Cache-Control private (browser do user, nao CDN/proxy) com max-age=60: a
  // serie e por dia util, muda devagar — refetches dentro da janela vem do
  // disk cache. Combina com cachePolicy 'default' em
  // getDashboardCommercialTimeseries.
  return executeBackend('getDashboardCommercialTimeseries', request, {
    responseHeaders: {
      'Cache-Control': 'private, max-age=60, must-revalidate',
    },
  });
}
