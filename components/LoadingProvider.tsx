'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { LoadingContext } from '../lib/loading/loading-context';
import { SplashVisual } from './SplashVisual';

// Carregamentos abaixo deste limiar NÃO mostram nada (não piscam a tela toda);
// só quando a página realmente demora é que o loader da marca aparece.
const SHOW_DELAY_MS = 480;
// Duração da animação de saída (`splash-exit`) antes de desmontar.
const EXIT_MS = 700;

/**
 * Provider do loader global de página. Conta fontes de carregamento (via
 * `useGlobalLoading`) e, quando alguma demora além do limiar, mostra o visual
 * da marca (logo + barra + bolinhas) — o mesmo do boot. Substitui o antigo
 * "Carregando..." verde das páginas.
 */
export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const begin = useCallback(() => setCount((c) => c + 1), []);
  const end = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);
  const value = useMemo(() => ({ begin, end }), [begin, end]);

  return (
    <LoadingContext.Provider value={value}>
      {children}
      <GlobalLoadingOverlay active={count > 0} />
    </LoadingContext.Provider>
  );
}

function GlobalLoadingOverlay({ active }: { active: boolean }) {
  // hidden -> (active por >SHOW_DELAY) -> shown -> (active false) -> exiting -> hidden
  const [phase, setPhase] = useState<'hidden' | 'shown' | 'exiting'>('hidden');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearShow = () => {
      if (showTimer.current) {
        clearTimeout(showTimer.current);
        showTimer.current = null;
      }
    };
    const clearExit = () => {
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
    };

    if (active) {
      clearExit();
      if (phaseRef.current === 'exiting') {
        // Re-ativou enquanto saía: volta a mostrar na hora (já estava visível).
        setPhase('shown');
      } else if (phaseRef.current !== 'shown' && !showTimer.current) {
        showTimer.current = setTimeout(() => {
          showTimer.current = null;
          setPhase('shown');
        }, SHOW_DELAY_MS);
      }
    } else {
      // Parou de carregar: cancela uma exibição agendada; se já visível, sai.
      clearShow();
      if (phaseRef.current === 'shown' && !exitTimer.current) {
        exitTimer.current = setTimeout(() => {
          exitTimer.current = null;
          setPhase('hidden');
        }, EXIT_MS);
        setPhase('exiting');
      }
    }
  }, [active]);

  useEffect(
    () => () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    []
  );

  // `hidden` -> null garante que o portal só roda client-side (SSR seguro).
  if (phase === 'hidden') {
    return null;
  }

  return createPortal(
    <SplashVisual pageLoader exiting={phase === 'exiting'} statusText="Carregando" />,
    document.body
  );
}
