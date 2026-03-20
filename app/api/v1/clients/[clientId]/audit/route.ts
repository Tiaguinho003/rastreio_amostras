import { NextRequest } from 'next/server';

import { executeBackend } from '../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    clientId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('listClientAuditEvents', request, { params });
}
