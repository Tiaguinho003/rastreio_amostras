'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { logout as logoutRequest, recordSessionExpired } from './api-client';
import { isRoleAllowed } from './roles';
import { clearSession, getSession, isSessionExpired, saveSession } from './session';
import type { SessionData, UserRole } from './types';

export function useAuthState() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const loaded = getSession();
    if (loaded && !isSessionExpired(loaded)) {
      setSession(loaded);
    } else {
      if (loaded?.sessionId) {
        void recordSessionExpired(loaded.sessionId).catch(() => {
          // best-effort audit
        });
        setExpired(true);
      }
      clearSession();
      setSession(null);
    }
    setLoading(false);
  }, []);

  return {
    session,
    loading,
    setSession,
    expired,
    replaceSession(nextSession: SessionData | null) {
      if (nextSession) {
        saveSession(nextSession);
      } else {
        clearSession();
      }
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
  const { session, loading, replaceSession, expired } = useAuthState();
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
      router.replace(expired ? `${unauthenticatedRedirectTo}?reason=session-expired` : unauthenticatedRedirectTo);
      return;
    }

    if (!isAuthorized) {
      router.replace(unauthorizedRedirectTo);
    }
  }, [expired, isAuthorized, loading, router, session, unauthenticatedRedirectTo, unauthorizedRedirectTo]);

  const logout = useCallback(async () => {
    if (session) {
      try {
        await logoutRequest(session);
      } catch {
        // local cleanup still wins
      }
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
