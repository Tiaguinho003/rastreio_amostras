import { NextRequest } from 'next/server';

import { executeBackend } from '../../_lib/adapter';

export async function POST(request: NextRequest) {
  return executeBackend('logout', request);
}
