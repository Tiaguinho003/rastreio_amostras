import { NextRequest, NextResponse } from 'next/server';

import { readJsonBody } from '../../../_lib/adapter';
import { getBackendApi } from '../../../_lib/backend-api';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sampleId: string }> }
) {
  const params = await context.params;
  const body = await readJsonBody(request);

  const api = getBackendApi();
  const result = await api.recordPhysicalSampleSent({
    headers: Object.fromEntries(request.headers.entries()),
    params: { sampleId: params.sampleId },
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    body,
  });

  return NextResponse.json(result.body, { status: result.status });
}
