'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, getMyVisitReportStats, listVisitReports } from '../../../lib/api-client';
import { VISIT_SYNC_COMPLETED_EVENT, type VisitSyncResult } from '../../../lib/offline/visit-sync';
import type { SessionData, VisitReportStatsResponse, VisitReportSummary } from '../../../lib/types';

// Dados do dashboard do prospector: contadores (hoje + clientes novos no
// mes) e a lista paginada dos PROPRIOS informes (o backend forca o escopo
// por userId). Refresh automatico em tres momentos: volta ao primeiro
// plano (com throttle, padrao do recent-activity), envio online pelo sheet
// (refresh() chamado pelo dashboard) e conclusao do sync da fila offline
// (evento global VISIT_SYNC_COMPLETED_EVENT com sent > 0).

const PAGE_LIMIT = 20;
const REFETCH_THROTTLE_MS = 30_000;

export function useProspectorDashboardData(session: SessionData) {
  const [stats, setStats] = useState<VisitReportStatsResponse | null>(null);
  // null = primeira carga em andamento (skeletons); [] = carregado e vazio.
  const [items, setItems] = useState<VisitReportSummary[] | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    lastFetchRef.current = Date.now();
    setError(null);

    try {
      const [statsResponse, listResponse] = await Promise.all([
        getMyVisitReportStats(session),
        listVisitReports(session, { page: 1, limit: PAGE_LIMIT }),
      ]);
      if (!mountedRef.current) {
        return;
      }
      setStats(statsResponse);
      setItems(listResponse.items);
      setHasNext(listResponse.page.hasNext);
      setPage(listResponse.page.page);
    } catch (cause) {
      if (!mountedRef.current) {
        return;
      }
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível carregar seus informes. Verifique sua conexão.'
      );
    }
  }, [session]);

  const loadMore = useCallback(async () => {
    if (loadingMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const response = await listVisitReports(session, { page: page + 1, limit: PAGE_LIMIT });
      if (!mountedRef.current) {
        return;
      }
      setItems((current) => [...(current ?? []), ...response.items]);
      setHasNext(response.page.hasNext);
      setPage(response.page.page);
    } catch (cause) {
      if (!mountedRef.current) {
        return;
      }
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível carregar mais informes. Verifique sua conexão.'
      );
    } finally {
      if (mountedRef.current) {
        setLoadingMore(false);
      }
    }
  }, [session, page, loadingMore]);

  // Primeira carga.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Volta ao primeiro plano: refetch com throttle (alt+tab/troca de app
  // rapida nao gera N requests — mesmo criterio do recent-activity).
  useEffect(() => {
    function refreshThrottled() {
      if (Date.now() - lastFetchRef.current < REFETCH_THROTTLE_MS) {
        return;
      }
      void refresh();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refreshThrottled();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refreshThrottled);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refreshThrottled);
    };
  }, [refresh]);

  // Fila offline sincronizou informes: o servidor mudou de verdade — sem
  // throttle. O toast de sucesso fica com o listener global do AppShell.
  useEffect(() => {
    const handleSyncCompleted = (event: Event) => {
      const result = (event as CustomEvent<VisitSyncResult>).detail;
      if (result && result.sent > 0) {
        void refresh();
      }
    };

    window.addEventListener(VISIT_SYNC_COMPLETED_EVENT, handleSyncCompleted);
    return () => window.removeEventListener(VISIT_SYNC_COMPLETED_EVENT, handleSyncCompleted);
  }, [refresh]);

  return { stats, items, hasNext, loadingMore, error, refresh, loadMore };
}
