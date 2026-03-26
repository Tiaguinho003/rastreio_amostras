'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getCurrentSession, logout as logoutRequest } from './api-client';
import { isRoleAllowed } from './roles';
import type { SessionData, UserRole } from './types';

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
          : cur.pendingEmailChange
    }
  };
}

export function useAuthState() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failureReason, setFailureReason] = useState<'session-expired' | 'session-ended' | null>(null);

  useEffect(() => {
    let active = true;

    getCurrentSession()
      .then((currentSession) => {
        if (!active) {
          return;
        }

        setFailureReason(null);
        setSession(currentSession);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          const maybeCode =
            error.details && typeof error.details === 'object' && 'code' in error.details
              ? error.details.code
              : null;
          setFailureReason(maybeCode === 'SESSION_EXPIRED' ? 'session-expired' : 'session-ended');
        } else {
          setFailureReason(null);
        }

        setSession(null);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return {
    session,
    loading,
    setSession,
    failureReason,
    replaceSession(nextSession: SessionData | null) {
      setSession(nextSession);
    }
  };
}

type UseRequireAuthOptions = {
  allowedRoles?: UserRole[];
  unauthenticatedRedirectTo?: string;
  unauthorizedRedirectTo?: string;
};

export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const {
    allowedRoles = null,
    unauthenticatedRedirectTo = '/login',
    unauthorizedRedirectTo = '/dashboard'
  } = options;

  const router = useRouter();
  const { session, loading, replaceSession, failureReason } = useAuthState();
  const isAuthorized = useMemo(() => {
    if (!session) {
      return false;
    }

    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    return isRoleAllowed(session.user.role, allowedRoles);
  }, [allowedRoles, session]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!session) {
      router.replace(failureReason ? `${unauthenticatedRedirectTo}?reason=${failureReason}` : unauthenticatedRedirectTo);
      return;
    }

    if (!isAuthorized) {
      router.replace(unauthorizedRedirectTo);
    }
  }, [failureReason, isAuthorized, loading, router, session, unauthenticatedRedirectTo, unauthorizedRedirectTo]);

  const logout = useCallback(async () => {
    try {
      await logoutRequest(session);
    } catch {
      // local cleanup still wins
    }

    replaceSession(null);
    router.replace('/login');
  }, [replaceSession, router, session]);

  return useMemo(
    () => ({
      session: isAuthorized ? session : null,
      loading,
      logout,
      isAuthorized,
      setSession: replaceSession
    }),
    [isAuthorized, loading, logout, replaceSession, session]
  );
}
