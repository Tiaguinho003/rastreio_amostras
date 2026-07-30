import { NextRequest, NextResponse } from 'next/server';

import { getBackendApi } from '../../../../_lib/backend-api';

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

// Espelho de Corretagem (Fase E): serve o PDF do demonstrativo de comissao como
// binario. Molde da rota .../[id]/pdf do contrato. Autentica pelo cookie de sessao
// (lido nos headers pelo resolveActorContext). Dois modos:
//   `?side=seller|buyer` (D72) — gera do contrato FRESCO, para a previa;
//   `?logId=<uuid>` (RC-D103) — re-renderiza um espelho GUARDADO do snapshot
//   congelado na entrega. 410 ESPELHO_EXPIRED quando a retencao venceu (RC-D105).
// Os BYTES continuam sem persistir (D71): o que fica guardado sao os numeros.
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
