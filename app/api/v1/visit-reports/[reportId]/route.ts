import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

// DELETE = cancelamento SOFT (a visita e imutavel; marca "Cancelado" e fica no
// historico). Mesma semantica do "Deletar lote". So o proprio autor (no service).
export async function DELETE(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('cancelVisitReport', request, { params });
}
