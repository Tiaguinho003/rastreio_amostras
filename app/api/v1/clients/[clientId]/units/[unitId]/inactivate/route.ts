import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    clientId: string;
    unitId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await readJsonBody(request);
  return executeBackend('inactivateClientUnit', request, { params, body });
}
