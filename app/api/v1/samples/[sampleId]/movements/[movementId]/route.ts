import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    sampleId: string;
    movementId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await readJsonBody(request);
  return executeBackend('updateSampleMovement', request, {
    params,
    body,
  });
}
