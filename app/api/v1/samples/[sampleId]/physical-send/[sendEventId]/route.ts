import { NextRequest, NextResponse } from 'next/server';

import { readJsonBody } from '../../../../_lib/adapter';
import { getBackendApi } from '../../../../_lib/backend-api';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ sampleId: string; sendEventId: string }> }
) {
  const params = await context.params;
  const body = await readJsonBody(request);

  const api = getBackendApi();
  const result = await api.updatePhysicalSampleSend({
    headers: Object.fromEntries(request.headers.entries()),
    params: { sampleId: params.sampleId, sendEventId: params.sendEventId },
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    body,
  });

  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ sampleId: string; sendEventId: string }> }
) {
  const params = await context.params;

  const api = getBackendApi();
  const result = await api.cancelPhysicalSampleSend({
    headers: Object.fromEntries(request.headers.entries()),
    params: { sampleId: params.sampleId, sendEventId: params.sendEventId },
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    body: null,
  });

  return NextResponse.json(result.body, { status: result.status });
}
