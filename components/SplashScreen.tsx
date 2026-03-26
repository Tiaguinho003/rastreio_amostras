'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

const SPLASH_DURATION_MS = 2800;
const EXIT_ANIMATION_MS = 700;

export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('splash-shown') === '1') {
        setVisible(false);
        return;
      }
    } catch {
      /* sessionStorage unavailable */
    }

    const exitTimer = setTimeout(() => setExiting(true), SPLASH_DURATION_MS);
    const hideTimer = setTimeout(() => {
      setVisible(false);
      try {
        sessionStorage.setItem('splash-shown', '1');
      } catch {
        /* ignore */
      }
    }, SPLASH_DURATION_MS + EXIT_ANIMATION_MS);

    timersRef.current = [exitTimer, hideTimer];

    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

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
