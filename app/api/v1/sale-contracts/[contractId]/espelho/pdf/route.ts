import { NextRequest, NextResponse } from 'next/server';

import { getBackendApi } from '../../../../_lib/backend-api';

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

// Espelho de Corretagem (Fase E): serve o PDF do demonstrativo de comissao como
// binario (regenerado a cada requisicao — D71). Molde da rota .../[id]/pdf do
// contrato. `?side=seller|buyer` (D72) define a parte/lado da comissao. Autentica
// pelo cookie de sessao (lido nos headers pelo resolveActorContext).
export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;

  const api = getBackendApi();
  const result = await api.exportEspelhoPdf({
    headers: Object.fromEntries(request.headers.entries()),
    params: { contractId: params.contractId },
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    body: {},
  });

  if (result.status !== 200) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const payload = result.body as { fileName: string; contentType: string; buffer: Buffer };
  const pdfBytes = Buffer.isBuffer(payload.buffer)
    ? payload.buffer
    : Buffer.from(payload.buffer ?? []);
  const fileName =
    typeof payload.fileName === 'string' && payload.fileName.trim()
      ? payload.fileName
      : 'espelho-corretagem.pdf';

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': payload.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Content-Length': String(pdfBytes.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
