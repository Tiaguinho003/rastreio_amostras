import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../../_lib/adapter';

export async function PATCH(request: NextRequest) {
  const body = await readJsonBody(request);
  return executeBackend('updateCurrentUserProfile', request, { body });
}
