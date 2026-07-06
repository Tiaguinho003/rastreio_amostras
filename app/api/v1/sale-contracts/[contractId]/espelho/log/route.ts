import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

// D127: registra a EXPORTAÇÃO do Espelho de Corretagem (clique em Exportar/
// Baixar no modal). A prévia usa GET .../espelho/pdf?preview=1, que não audita.
export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await readJsonBody(request);
  return executeBackend('logEspelhoExport', request, { params, body });
}
