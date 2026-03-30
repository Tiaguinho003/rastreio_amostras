import { NextRequest } from 'next/server';

import { executeBackend } from '../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    warehouseId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('getWarehouseImpact', request, { params });
}
