import { NextRequest, NextResponse } from 'next/server';

import { getBackendApi } from '../../../_lib/backend-api';

// RC-D27/D28: PDF de PRÉVIA da emissão — o documento que o "Emitir" vai gerar,
// montado a partir do formulário e SEM gravar nada. É o que a confirmação
// mostra antes de emitir de verdade. POST (e não GET) porque o contrato ainda
// não existe: o corpo inteiro do formulário é a entrada.
//
// Molde da rota [contractId]/pdf: chama o backend em processo (Buffer real) e
// devolve application/pdf. Autentica pelo cookie de sessão.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const api = getBackendApi();
  const result = await api.previewSaleContractPdf({
    headers: Object.fromEntries(request.headers.entries()),
    params: {},
    query: {},
    body,
  });

  if (result.status !== 200) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const payload = result.body as {
    fileName: string;
    contentType: string;
    buffer: Buffer;
    provisionalNumber: boolean;
    contractNumber: string;
  };
  const pdfBytes = Buffer.isBuffer(payload.buffer)
    ? payload.buffer
    : Buffer.from(payload.buffer ?? []);
  const fileName =
    typeof payload.fileName === 'string' && payload.fileName.trim()
      ? payload.fileName
      : 'contrato-previa.pdf';

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': payload.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Content-Length': String(pdfBytes.byteLength),
      // O cliente rotula "Nº provisório" quando o número ainda não foi alocado
      // (só a transação da emissão aloca, sob advisory lock).
      'X-Contract-Number': encodeURIComponent(payload.contractNumber ?? ''),
      'X-Provisional-Number': payload.provisionalNumber ? '1' : '0',
      'Cache-Control': 'no-store',
    },
  });
}
