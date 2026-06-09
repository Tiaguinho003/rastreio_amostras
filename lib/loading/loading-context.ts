'use client';

import { createContext, useContext, useEffect } from 'react';

export type LoadingController = {
  begin: () => void;
  end: () => void;
};

export const LoadingContext = createContext<LoadingController | null>(null);

/**
 * Registra um carregamento global enquanto `active` for `true`. É contado por
 * fonte (auth, dados da página, etc.) — o loader de página aparece se QUALQUER
 * fonte estiver carregando. Seguro fora do provider (no-op).
 *
 * O loader em si só aparece se o carregamento passar de um limiar curto (ver
 * `LoadingProvider`), então carregamentos rápidos não piscam a tela.
 */
export function useGlobalLoading(active: boolean): void {
  const ctx = useContext(LoadingContext);

  useEffect(() => {
    if (!ctx || !active) {
      return;
    }
    ctx.begin();
    return () => ctx.end();
  }, [ctx, active]);
}
