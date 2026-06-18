import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    visitId: string;
  }>;
};

// Curadoria do vinculo visita comercial -> cliente (pagina /resumo,
// ADMIN/CADASTRO). So vale para clientKind=NEW (cliente novo, sem vinculo);
// EXISTING e born-linked pelo lookup do form e o service rejeita. Body
// {clientId: string | null} — null desvincula (volta a "aguardando vinculo").
export async function PATCH(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await readJsonBody(request);
  return executeBackend('linkCommercialVisitClient', request, { params, body });
}
