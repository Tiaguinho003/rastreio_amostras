'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, getCurrentSession } from '../lib/api-client';

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

const SPLASH_DURATION_MS = 2800;
const EXIT_ANIMATION_MS = 700;
const SPLASH_COOLDOWN_MS = 5 * 60 * 1000;
const STORAGE_KEY = 'splash-last-shown';

function isCooldownExpired(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    return Date.now() - Number(raw) >= SPLASH_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function recordSplashTimestamp(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* storage unavailable */
  }
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

    const t1 = setTimeout(() => setExiting(true), SPLASH_DURATION_MS);
    const t2 = setTimeout(() => {
      setVisible(false);
      activeRef.current = false;
      recordSplashTimestamp();

      if (isOffline()) {
        router.replace('/offline');
        return;
      }

      getCurrentSession()
        .then(() => router.replace('/dashboard'))
        .catch((cause) => {
          if (cause instanceof ApiError) {
            router.replace('/login');
          } else if (isOffline()) {
            router.replace('/offline');
          } else {
            router.replace('/login');
          }
        });
    }, SPLASH_DURATION_MS + EXIT_ANIMATION_MS);

    timersRef.current = [t1, t2];
  }, [router]);

  useEffect(() => {
    if (!isCooldownExpired()) {
      setVisible(false);

      if (isOffline()) {
        router.replace('/offline');
        return;
      }

      getCurrentSession()
        .then(() => router.replace('/dashboard'))
        .catch(() => {
          if (isOffline()) {
            router.replace('/offline');
          } else {
            router.replace('/login');
          }
        });
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
        isCooldownExpired()
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
          <span
            key={i}
            className="splash-particle"
            style={{ '--p': i } as React.CSSProperties}
          />
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
        <p className="splash-title">Rastreio de Amostras</p>
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
