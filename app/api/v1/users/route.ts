import { NextRequest } from 'next/server';

import { executeBackend, readJsonBody } from '../_lib/adapter';

export async function GET(request: NextRequest) {
  return executeBackend('listUsers', request);
}

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  return executeBackend('createUser', request, { body });
}
