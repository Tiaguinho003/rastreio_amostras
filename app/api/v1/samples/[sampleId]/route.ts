import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sampleId: string }> }
) {
  const params = await context.params;
  return executeBackend('getSampleDetail', request, {
    params: { sampleId: params.sampleId },
  });
}
