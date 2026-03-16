'use client';

import { useEffect } from 'react';

export function PwaRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !window.isSecureContext) {
      return;
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Best effort registration; app functionality must not depend on the service worker.
    });
  }, []);

  return null;
}
