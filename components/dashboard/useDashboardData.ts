'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, getDashboardSalesAvailability } from '../../lib/api-client';
import type { DashboardSalesAvailabilityResponse, SessionData } from '../../lib/types';

const REFETCH_THROTTLE_MS = 30_000;

export function useDashboardData(session: SessionData | null) {
  const [salesData, setSalesData] = useState<DashboardSalesAvailabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Throttle pro refetch em visibilitychange: evita N requests em Alt+Tab rapido.
  const lastFetchRef = useRef<number>(0);
  // Guarda de montagem: evita setState apos unmount. Antes o refetch por
  // visibilitychange chamava refreshDashboard() e DESCARTAVA o cleanup (o `active`
  // por-chamada nunca virava false) — o mountedRef cobre os dois caminhos.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshDashboard = useCallback(() => {
    if (!session) return;
    lastFetchRef.current = Date.now();
    setError(null);

    getDashboardSalesAvailability(session)
      .then((salesResponse) => {
        if (mountedRef.current) setSalesData(salesResponse);
      })
      .catch((cause) => {
        if (!mountedRef.current) return;
        setError(cause instanceof ApiError ? cause.message : 'Não foi possível carregar o painel.');
      });
  }, [session]);

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    if (!session) {
      return;
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (Date.now() - lastFetchRef.current < REFETCH_THROTTLE_MS) {
        return;
      }
      refreshDashboard();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, refreshDashboard]);

  // `retry` = mesma função de refresh, exposta pro botão "Tentar novamente" do
  // banner de erro do donut (decisão: mostrar erro + retry).
  return { salesData, error, retry: refreshDashboard };
}
