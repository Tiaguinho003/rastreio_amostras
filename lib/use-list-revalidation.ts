'use client';

import { useEffect, useRef } from 'react';

// Revalidação silenciosa de listas com snapshot de sessão (/samples, /clients).
// O snapshot dá a primeira pintura instantânea (scroll preservado), mas os
// dados congelavam até o usuário mexer em filtro/busca — num PWA que vive dias
// em background, outro usuário criava lotes e a lista nunca atualizava.
// Mesmo padrão do dashboard (DashboardDesktop/use-recent-sends-feed): refetch
// ao voltar visível/focado com throttle + polling enquanto a página está visível.
//
// O chamador decide COMO revalidar (onRevalidate dispara um refetch silencioso
// que mantém a lista atual na tela até a resposta chegar) e QUANDO aceitar
// (guards de load em andamento/modo seleção ficam no chamador, via `enabled`
// ou dentro do próprio onRevalidate).

const DEFAULT_POLL_MS = 60_000;
const DEFAULT_THROTTLE_MS = 30_000;

// 'foreground' = o app/aba voltou ao primeiro plano; 'poll' = intervalo com a
// página visível. O chamador pode tratar diferente (ex.: pausar só o poll
// durante o modo Liga).
export type ListRevalidationSource = 'foreground' | 'poll';

export function useListRevalidation({
  enabled,
  onRevalidate,
  pollMs = DEFAULT_POLL_MS,
  throttleMs = DEFAULT_THROTTLE_MS,
}: {
  enabled: boolean;
  onRevalidate: (source: ListRevalidationSource) => void;
  pollMs?: number;
  throttleMs?: number;
}) {
  const lastRunRef = useRef<number>(Date.now());
  // Latest-ref: listeners/interval estáveis mesmo se o callback re-criar.
  const onRevalidateRef = useRef(onRevalidate);
  onRevalidateRef.current = onRevalidate;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function run(source: ListRevalidationSource) {
      lastRunRef.current = Date.now();
      onRevalidateRef.current(source);
    }

    function handleReturnToForeground() {
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (Date.now() - lastRunRef.current < throttleMs) {
        return;
      }
      run('foreground');
    }

    function handleInterval() {
      if (document.visibilityState !== 'visible') {
        return;
      }
      run('poll');
    }

    document.addEventListener('visibilitychange', handleReturnToForeground);
    window.addEventListener('focus', handleReturnToForeground);
    const intervalId = window.setInterval(handleInterval, pollMs);

    return () => {
      document.removeEventListener('visibilitychange', handleReturnToForeground);
      window.removeEventListener('focus', handleReturnToForeground);
      window.clearInterval(intervalId);
    };
  }, [enabled, pollMs, throttleMs]);
}
