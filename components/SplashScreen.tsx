'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, getCurrentSession } from '../lib/api-client';

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

const MIN_SPLASH_MS = 1200;
const EXIT_ANIMATION_MS = 700;
const BACKGROUND_COOLDOWN_MS = 60 * 1000;
const DASHBOARD_REDIRECT_AFTER_MS = 15 * 60 * 1000;

const SESSION_KEY = 'splash-shown-this-session';
const BACKGROUND_KEY = 'splash-last-background';

type SplashMode = 'initial' | 'resume';

function wasShownThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markShownThisSession(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {}
}

function getBackgroundElapsedMs(): number | null {
  try {
    const raw = localStorage.getItem(BACKGROUND_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return null;
    return Date.now() - parsed;
  } catch {
    return null;
  }
}

function recordBackgroundTimestamp(): void {
  try {
    localStorage.setItem(BACKGROUND_KEY, String(Date.now()));
  } catch {}
}

function resolveDestination(): Promise<string> {
  if (isOffline()) {
    return Promise.resolve('/offline');
  }

  return getCurrentSession()
    .then(() => '/dashboard')
    .catch((cause) => {
      if (cause instanceof ApiError) {
        return '/login';
      }
      return isOffline() ? '/offline' : '/login';
    });
}

export function SplashScreen() {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const activeRef = useRef(false);

  const runSplash = useCallback(
    (mode: SplashMode, backgroundElapsedMs: number) => {
      if (activeRef.current) return;
      activeRef.current = true;

      setVisible(true);
      setExiting(false);

      timersRef.current.forEach(clearTimeout);

      const startedAt = Date.now();
      const forceDashboard =
        mode === 'resume' && backgroundElapsedMs >= DASHBOARD_REDIRECT_AFTER_MS;

      resolveDestination().then((sessionDestination) => {
        let navigateTo: string | null;

        if (mode === 'initial') {
          navigateTo = sessionDestination;
        } else if (sessionDestination !== '/dashboard') {
          navigateTo = sessionDestination;
        } else if (forceDashboard) {
          navigateTo = '/dashboard';
        } else {
          navigateTo = null;
        }

        if (navigateTo) {
          router.replace(navigateTo);
        }

        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);

        const t1 = setTimeout(() => setExiting(true), remaining);
        const t2 = setTimeout(() => {
          setVisible(false);
          activeRef.current = false;
          markShownThisSession();
        }, remaining + EXIT_ANIMATION_MS);

        timersRef.current = [t1, t2];
      });
    },
    [router]
  );

  useEffect(() => {
    if (wasShownThisSession()) {
      setVisible(false);
      resolveDestination().then((dest) => {
        if (dest !== '/dashboard') {
          router.replace(dest);
        }
      });
      return;
    }

    runSplash('initial', 0);

    return () => timersRef.current.forEach(clearTimeout);
  }, [runSplash, router]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        recordBackgroundTimestamp();
        return;
      }

      if (document.visibilityState !== 'visible' || activeRef.current) {
        return;
      }

      const elapsed = getBackgroundElapsedMs();
      if (elapsed === null || elapsed < BACKGROUND_COOLDOWN_MS) {
        return;
      }

      runSplash('resume', elapsed);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [runSplash]);

  if (!visible) return null;

  return (
    <div className={`splash-screen${exiting ? ' is-exiting' : ''}`} aria-hidden="true">
      <div className="splash-particles">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="splash-particle" style={{ '--p': i } as React.CSSProperties} />
        ))}
      </div>

      <div className="splash-center">
        <div className="splash-logo-glow" />
        <Image
          src="/logo-safras-branco.png"
          alt=""
          width={1024}
          height={299}
          priority
          className="splash-logo"
        />
      </div>

      <div className="splash-footer">
        <div className="splash-progress-track">
          <div className="splash-progress-fill" />
        </div>
        <p className="splash-status">
          Preparando tudo<span className="splash-dots">...</span>
        </p>
      </div>
    </div>
  );
}
