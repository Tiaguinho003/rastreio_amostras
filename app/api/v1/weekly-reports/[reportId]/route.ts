import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('deleteWeeklyReport', request, { params });
}
