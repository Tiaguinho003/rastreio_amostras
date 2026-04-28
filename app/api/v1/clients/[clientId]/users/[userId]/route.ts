import { NextRequest } from 'next/server';

import { executeBackend } from '../../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    clientId: string;
    userId: string;
  }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('removeCommercialUserFromClient', request, { params });
}
