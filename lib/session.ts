import type { SessionData } from './types';

const LEGACY_SESSION_STORAGE_KEY = 'rastreio_session_v1';
const SESSION_STORAGE_KEY = 'rastreio_session_v2';

export function saveSession(session: SessionData) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function getSession(): SessionData | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    const legacyRaw = window.localStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
    if (legacyRaw) {
      window.localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    }
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SessionData;
    if (!parsed?.accessToken || !parsed?.sessionId || !parsed?.user?.id) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    return null;
  }
}

export function clearSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
}

export function isSessionExpired(session: SessionData): boolean {
  const expiresAtMs = new Date(session.expiresAt).getTime();
  return Number.isFinite(expiresAtMs) ? Date.now() >= expiresAtMs : true;
}
