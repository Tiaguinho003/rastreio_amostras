import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../../_lib/adapter';

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  return executeBackend('savePushSubscription', request, { body });
}

export async function DELETE(request: NextRequest) {
  const body = await readJsonBody(request);
  return executeBackend('deletePushSubscription', request, { body });
}
