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
const BACKGROUND_COOLDOWN_MS = 30 * 1000;

const SESSION_KEY = 'splash-shown-this-session';
const BACKGROUND_KEY = 'splash-last-background';

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

function isBackgroundCooldownExpired(): boolean {
  try {
    const raw = localStorage.getItem(BACKGROUND_KEY);
    if (!raw) return true;
    return Date.now() - Number(raw) >= BACKGROUND_COOLDOWN_MS;
  } catch {
    return true;
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

  const runSplash = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;

    setVisible(true);
    setExiting(false);

    timersRef.current.forEach(clearTimeout);

    const startedAt = Date.now();

    resolveDestination().then((destination) => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);

      const t1 = setTimeout(() => setExiting(true), remaining);
      const t2 = setTimeout(() => {
        setVisible(false);
        activeRef.current = false;
        markShownThisSession();
        recordBackgroundTimestamp();
        router.replace(destination);
      }, remaining + EXIT_ANIMATION_MS);

      timersRef.current = [t1, t2];
    });
  }, [router]);

  useEffect(() => {
    if (wasShownThisSession()) {
      setVisible(false);
      resolveDestination().then((dest) => router.replace(dest));
      return;
    }

    runSplash();

    return () => timersRef.current.forEach(clearTimeout);
  }, [runSplash, router]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        !activeRef.current &&
        isBackgroundCooldownExpired()
      ) {
        runSplash();
      }
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
