'use client';

import type { SessionData } from './types';

/**
 * Merges user fields from an API response into the current session without
 * force-casts. Each field is individually validated: if the response is
 * missing a field or has the wrong type, the current session value is kept.
 *
 * This eliminates `as typeof session` casts and protects against malformed
 * API responses corrupting the session state.
 */
export function mergeUserIntoSession(
  currentSession: SessionData,
  responseUser: unknown
): SessionData {
  if (!responseUser || typeof responseUser !== 'object') {
    return currentSession;
  }

  const u = responseUser as Record<string, unknown>;
  const cur = currentSession.user;

  return {
    ...currentSession,
    user: {
      id: cur.id,
      username: typeof u.username === 'string' ? u.username : cur.username,
      email: typeof u.email === 'string' ? u.email : cur.email,
      fullName: typeof u.fullName === 'string' ? u.fullName : cur.fullName,
      displayName: typeof u.fullName === 'string' ? u.fullName : cur.displayName,
      role: typeof u.role === 'string' ? (u.role as typeof cur.role) : cur.role,
      status: typeof u.status === 'string' ? (u.status as typeof cur.status) : cur.status,
      initialPasswordDecision:
        typeof u.initialPasswordDecision === 'string'
          ? (u.initialPasswordDecision as typeof cur.initialPasswordDecision)
          : cur.initialPasswordDecision,
      pendingEmailChange:
        'pendingEmailChange' in u
          ? u.pendingEmailChange && typeof u.pendingEmailChange === 'object'
            ? (u.pendingEmailChange as typeof cur.pendingEmailChange)
            : null
          : cur.pendingEmailChange,
    },
  };
}
