'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { isRoleAllowed } from './roles';
import { clearSession, getSession, isSessionExpired } from './session';
import type { SessionData, UserRole } from './types';

export function useAuthState() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loaded = getSession();
    if (loaded && !isSessionExpired(loaded)) {
      setSession(loaded);
    } else {
      clearSession();
      setSession(null);
    }
    setLoading(false);
  }, []);

  return {
    session,
    loading,
    setSession
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
  const { session, loading, setSession } = useAuthState();
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
      router.replace(unauthenticatedRedirectTo);
      return;
    }

    if (!isAuthorized) {
      router.replace(unauthorizedRedirectTo);
    }
  }, [isAuthorized, loading, router, session, unauthenticatedRedirectTo, unauthorizedRedirectTo]);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    router.replace('/login');
  }, [router, setSession]);

  return useMemo(
    () => ({
      session: isAuthorized ? session : null,
      loading,
      logout,
      isAuthorized
    }),
    [isAuthorized, loading, logout, session]
  );
}
