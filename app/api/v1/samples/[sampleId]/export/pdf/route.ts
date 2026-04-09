import { NextRequest, NextResponse } from 'next/server';

import { readJsonBody } from '../../../../_lib/adapter';
import { getBackendApi } from '../../../../_lib/backend-api';

type ExportPdfBody = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sampleId: string }> }
) {
  const params = await context.params;
  const body = await readJsonBody(request);

  const api = getBackendApi();
  const result = await api.exportSamplePdf({
    headers: Object.fromEntries(request.headers.entries()),
    params: { sampleId: params.sampleId },
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    body,
  });

  if (result.status !== 200) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const payload = result.body as ExportPdfBody;
  const pdfBytes = Buffer.isBuffer(payload.buffer)
    ? payload.buffer
    : Buffer.from(payload.buffer ?? []);
  const responseBody = new Uint8Array(pdfBytes);
  const safeFileName =
    typeof payload.fileName === 'string' && payload.fileName.trim()
      ? payload.fileName
      : 'laudo.pdf';
  const contentType =
    typeof payload.contentType === 'string' && payload.contentType.trim()
      ? payload.contentType
      : 'application/pdf';

  return new NextResponse(responseBody, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${safeFileName}"`,
      'Content-Length': String(pdfBytes.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
