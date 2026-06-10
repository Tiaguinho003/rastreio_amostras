'use client';

import { useEffect } from 'react';

import type { SessionData } from '../types';
import { flushVisitOutbox } from './visit-sync';

// Gatilhos automaticos da fila offline de informes, montado UMA vez por
// pagina (no AppShell — toda pagina autenticada dispara):
//   * ao montar (abrir o app / navegar);
//   * quando a internet volta (evento `online`);
//   * quando o app volta pro primeiro plano (visibilitychange) — os
//     gatilhos realistas no iOS PWA, onde nao existe Background Sync.
// O resultado e anunciado pelo evento VISIT_SYNC_COMPLETED_EVENT (ver
// visit-sync.ts); o lock do flush garante que gatilhos concorrentes
// compartilham a mesma rodada.
export function useVisitOutboxAutoSync(session: SessionData | null) {
  useEffect(() => {
    if (!session) {
      return;
    }

    const tryFlush = () => {
      if (!navigator.onLine) {
        return;
      }
      void flushVisitOutbox(session).catch(() => undefined);
    };

    tryFlush();

    const handleOnline = () => tryFlush();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        tryFlush();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [session]);
}
