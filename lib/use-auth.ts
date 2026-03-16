'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getCurrentSession, logout as logoutRequest } from './api-client';
import { isRoleAllowed } from './roles';
import type { SessionData, UserRole } from './types';

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
