'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, getDashboardPending, getDashboardSalesAvailability } from '../../lib/api-client';
import type {
  DashboardPendingResponse,
  DashboardSalesAvailabilityResponse,
  SessionData,
} from '../../lib/types';

export function useDashboardData(session: SessionData | null) {
  const [data, setData] = useState<DashboardPendingResponse | null>(null);
  const [salesData, setSalesData] = useState<DashboardSalesAvailabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshDashboard = useCallback(() => {
    if (!session) {
      return () => {};
    }

    let active = true;
    setError(null);

    Promise.all([getDashboardPending(session), getDashboardSalesAvailability(session)])
      .then(([pendingResponse, salesResponse]) => {
        if (active) {
          setData(pendingResponse);
          setSalesData(salesResponse);
        }
      })
      .catch((cause) => {
        if (active) {
          if (cause instanceof ApiError) {
            setError(cause.message);
          } else {
            setError('Falha ao carregar dashboard');
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
      if (document.visibilityState === 'visible') {
        refreshDashboard();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, refreshDashboard]);

  return { data, salesData, error };
}
