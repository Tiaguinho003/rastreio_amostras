import { NextRequest, NextResponse } from 'next/server';

import { readJsonBody } from '../../_lib/adapter';
import { getBackendApi } from '../../_lib/backend-api';
import { buildSessionCookie } from '../../_lib/session-cookie';

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  const api = getBackendApi();
  const result = await api.login({
    headers: Object.fromEntries(request.headers.entries()),
    params: {},
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    body
  });

  if (result.status !== 200) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const payload = result.body as {
    accessToken: string;
    expiresAt: string;
    sessionId: string;
    user: Record<string, unknown>;
  };
  const response = NextResponse.json(
    {
      expiresAt: payload.expiresAt,
      sessionId: payload.sessionId,
      user: payload.user
    },
    { status: 200 }
  );

  response.cookies.set(buildSessionCookie(payload.accessToken, payload.expiresAt, request));
  return response;
}
