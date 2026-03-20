import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    clientId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('getClient', request, { params });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await readJsonBody(request);
  return executeBackend('updateClient', request, { params, body });
}
