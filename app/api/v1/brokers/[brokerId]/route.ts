import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    brokerId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await readJsonBody(request);
  return executeBackend('updateBroker', request, { params, body });
}
