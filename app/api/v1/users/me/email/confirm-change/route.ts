import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../../../_lib/adapter';

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  return executeBackend('confirmCurrentUserEmailChange', request, { body });
}
