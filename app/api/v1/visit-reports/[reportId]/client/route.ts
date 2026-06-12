import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

// Curadoria do vinculo informe -> cliente (pagina /resumo, ADMIN/CADASTRO).
// Body {clientId: string | null} — null desvincula (volta a "aguardando
// vinculo").
export async function PATCH(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await readJsonBody(request);
  return executeBackend('linkVisitReportClient', request, { params, body });
}
