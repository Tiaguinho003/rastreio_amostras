'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { RecentSendItem, RecentSendsResponse, SessionData } from './types';

const DESKTOP_MQ = '(min-width: 901px)';
// Throttle do refetch em focus/visibility: evita N requests em Alt+Tab rápido.
const REFETCH_THROTTLE_MS = 30_000;

// Feed dos cards de envios — "Amostras enviadas" (/samples) e "Aprovações
// enviadas" (aba Aprovações de /embarques) — DSB-D14; o padrão de fetch veio do
// DashboardDesktop (C1): DESKTOP-ONLY (gate matchMedia — o card já é escondido
// por CSS abaixo de 901px), refetch em focus/visibilitychange com gate de
// visibilityState + throttle 30s, e re-busca ao ENTRAR no desktop num resize
// (senão o card ficava travado no skeleton — nada disparava o fetch).
export function useRecentSendsFeed(
  // `null` enquanto a sessão carrega (useRequireAuth) — não busca nada.
  session: SessionData | null,
  fetcher: (session: SessionData) => Promise<RecentSendsResponse>
) {
  const [items, setItems] = useState<RecentSendItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);
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
    lastFetchRef.current = Date.now();
    fetcherRef
      .current(session)
      .then((response) => {
        if (!mountedRef.current) return;
        setItems(response.items);
        setError(null);
      })
      .catch(() => {
        if (mountedRef.current) setError('Não foi possível carregar os envios.');
      });
  }, [session]);

  useEffect(() => {
    fetchFeed();
    const mq = window.matchMedia(DESKTOP_MQ);
    const throttled = () => {
      if (Date.now() - lastFetchRef.current < REFETCH_THROTTLE_MS) return;
      fetchFeed();
    };
    const onBreakpoint = () => {
      if (mq.matches) fetchFeed();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') throttled();
    };
    window.addEventListener('focus', throttled);
    document.addEventListener('visibilitychange', onVisible);
    mq.addEventListener('change', onBreakpoint);
    return () => {
      window.removeEventListener('focus', throttled);
      document.removeEventListener('visibilitychange', onVisible);
      mq.removeEventListener('change', onBreakpoint);
    };
  }, [fetchFeed]);

  // `retry` = refetch imediato (sem throttle) — botão "Tentar novamente" e
  // pós-ação do caller (ex.: gerar etiqueta na aba Aprovações).
  return { items, error, retry: fetchFeed };
}
