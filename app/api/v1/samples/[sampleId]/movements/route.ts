import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../../_lib/adapter';

type RouteContext = {
  params: Promise<{
    sampleId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  return executeBackend('listSampleMovements', request, {
    params: { sampleId: params.sampleId }
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const body = await readJsonBody(request);
  return executeBackend('createSampleMovement', request, {
    params: { sampleId: params.sampleId },
    body
  });
}
