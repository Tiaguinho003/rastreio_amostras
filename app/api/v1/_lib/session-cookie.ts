import type { NextRequest } from 'next/server';

import { shouldUseSecureSessionCookie } from '../../../../src/auth/session-cookie-policy.js';
import { SESSION_COOKIE_NAME } from '../../../../src/auth/session-cookie.js';

function isSecureRequest(request: NextRequest) {
  return shouldUseSecureSessionCookie({
    configuredValue: process.env.SESSION_COOKIE_SECURE,
    forwardedProto: request.headers.get('x-forwarded-proto'),
    requestProtocol: request.nextUrl.protocol,
  });
}

export function buildSessionCookie(token: string, expiresAt: string, request: NextRequest) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isSecureRequest(request),
    path: '/',
    expires: new Date(expiresAt),
  };
}

export function buildClearedSessionCookie(request: NextRequest) {
  return {
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isSecureRequest(request),
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  };
}
