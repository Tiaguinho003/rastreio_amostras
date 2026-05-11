'use client';

import { useEffect } from 'react';

export function PwaRegistration() {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !window.isSecureContext
    ) {
      return;
    }

    // Snapshot: havia um SW ja controlando esta pagina antes do registro?
    // Distingue "primeira instalacao" (nao precisa reload) de "atualizacao"
    // (precisa reload pra servir HTML/JS novos em vez do cache antigo).
    const hadControllerOnLoad = !!navigator.serviceWorker.controller;
    let refreshing = false;

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      // Reload so se ja havia SW antes (atualizacao). Em primeira instalacao
      // controllerchange tambem dispara, mas reload aqui criaria flash
      // desnecessario sem ganho.
      if (hadControllerOnLoad) {
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Best effort registration; app functionality must not depend on the service worker.
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
