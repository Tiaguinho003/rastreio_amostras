import { NextRequest, NextResponse } from 'next/server';

import { executeBackend } from '../../_lib/adapter';
import { buildClearedSessionCookie } from '../../_lib/session-cookie';

export async function POST(request: NextRequest) {
  const response = await executeBackend('logout', request);
  response.cookies.set(buildClearedSessionCookie(request));
  return response;
}
