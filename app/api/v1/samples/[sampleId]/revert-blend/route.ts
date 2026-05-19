import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../../_lib/adapter';

// Liga A3.2: POST /api/v1/samples/:sampleId/revert-blend — reverte uma
// liga existente (status -> INVALIDATED). Ver Liga F8 + Wave A2.3.
// Restrita a liga sem venda/perda (Liga F8.4).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sampleId: string }> }
) {
  const params = await context.params;
  const body = await readJsonBody(request);

  return executeBackend('revertBlend', request, {
    params: { sampleId: params.sampleId },
    body,
  });
}
