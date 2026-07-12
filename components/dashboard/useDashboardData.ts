'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, getDashboardSalesAvailability } from '../../lib/api-client';
import type { DashboardSalesAvailabilityResponse, SessionData } from '../../lib/types';

const REFETCH_THROTTLE_MS = 30_000;

export function useDashboardData(session: SessionData | null) {
  const [salesData, setSalesData] = useState<DashboardSalesAvailabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Throttle pro refetch em visibilitychange: evita N requests em Alt+Tab
  // rapido — mesmo padrao do DashboardDesktop.
  const lastFetchRef = useRef<number>(0);

  const refreshDashboard = useCallback(() => {
    if (!session) {
      return () => {};
    }

    let active = true;
    lastFetchRef.current = Date.now();
    setError(null);

    getDashboardSalesAvailability(session)
      .then((salesResponse) => {
        if (active) {
          setSalesData(salesResponse);
        }
      })
      .catch((cause) => {
        if (active) {
          if (cause instanceof ApiError) {
            setError(cause.message);
          } else {
            setError('Não foi possível carregar o painel.');
          }
        }
      });

    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    return refreshDashboard();
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

  return { salesData, error };
}
