// DEPRECATED: classificacao agora e feita exclusivamente pela camera (/classification/confirm)
import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../../../_lib/adapter';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sampleId: string }> }
) {
  const params = await context.params;
  const body = await readJsonBody(request);

  return executeBackend('completeClassification', request, {
    params: { sampleId: params.sampleId },
    body,
  });
}
