import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

// DELETE = cancelamento SOFT (relatorio imutavel; fica no historico). So o
// proprio autor (no service).
export async function DELETE(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('cancelWeeklyReport', request, { params });
}
