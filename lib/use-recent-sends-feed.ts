'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useRevalidate } from './revalidation/use-revalidate';
import type { RevalidationSubject } from './revalidation/subjects';
import type { SessionData } from './types';

const DESKTOP_MQ = '(min-width: 901px)';
// Throttle do refetch em focus/visibility: evita N requests em Alt+Tab rápido.
const REFETCH_THROTTLE_MS = 30_000;

// Feed de card-lista do desktop. Nasceu servindo "Amostras enviadas" e
// "Aprovações enviadas" (DSB-D14) — hoje sobrou só o card de **Avisos**
// (DSB-D19), que é o único chamador. DESKTOP-ONLY: gate `matchMedia` (o card já
// é escondido por CSS abaixo de 901px) e re-busca ao ENTRAR no desktop num
// resize — senão o card ficava travado no skeleton, porque nada disparava o
// fetch. Genérico por `T` (o item) + `errorMessage`.
//
// F3 do ciclo SN: os listeners de focus/visibilitychange que este hook mantinha
// por conta própria saíram — quem cuida disso agora é o `useRevalidate`, que
// traz junto a origem que faltava (o BARRAMENTO). O poll fica DESLIGADO: o
// dashboard é a tela que mais fica aberta parada, e uma request por minuto por
// aba aberta é custo de banco sem contrapartida (o foreground já cobre).
export function useRecentSendsFeed<T>(
  // `null` enquanto a sessão carrega (AuthProvider) — não busca nada.
  session: SessionData | null,
  fetcher: (session: SessionData) => Promise<{ items: T[] }>,
  errorMessage = 'Não foi possível carregar os envios.',
  subjects: readonly RevalidationSubject[] = []
) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guarda de montagem: o retry pode disparar fora do ciclo do effect.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Latest-ref: aceita fetcher inline no caller sem re-rodar o effect.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const fetchFeed = useCallback(() => {
    if (!session) return;
    if (!window.matchMedia(DESKTOP_MQ).matches) return;
    fetcherRef
      .current(session)
      .then((response) => {
        if (!mountedRef.current) return;
        setItems(response.items);
        setError(null);
      })
      .catch(() => {
        if (mountedRef.current) setError(errorMessage);
      });
  }, [session, errorMessage]);

  useRevalidate({
    subjects,
    enabled: Boolean(session),
    onRevalidate: fetchFeed,
    pollMs: null,
    throttleMs: REFETCH_THROTTLE_MS,
  });

  useEffect(() => {
    fetchFeed();
    const mq = window.matchMedia(DESKTOP_MQ);
    const onBreakpoint = () => {
      if (mq.matches) fetchFeed();
    };
    mq.addEventListener('change', onBreakpoint);
    return () => {
      mq.removeEventListener('change', onBreakpoint);
    };
  }, [fetchFeed]);

  // `retry` = refetch imediato — botão "Tentar novamente" e pós-ação do caller.
  return { items, error, retry: fetchFeed };
}
