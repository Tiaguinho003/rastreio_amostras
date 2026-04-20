'use client';

import { useEffect, useState } from 'react';

import {
  getDashboardOperationalMetrics,
  getDashboardCommercialMetrics,
  getDashboardRecentActivity,
} from '../../lib/api-client';
import { useOperationModal } from './useOperationModal';
import { OperationModal } from './OperationModal';
import { MetricsCard } from './MetricsCard';
import { RecentActivityList } from './RecentActivityList';
import type {
  DashboardOperationalMetricsResponse,
  DashboardPendingResponse,
  DashboardRecentActivityItem,
  DashboardSalesAvailabilityResponse,
  SessionData,
} from '../../lib/types';

type BandKey = 'over30' | 'from15to30' | 'under15';

const BAND_COLORS: Record<BandKey, string> = {
  over30: '#C0392B',
  from15to30: '#E5A100',
  under15: '#27AE60',
};

function DonutChart({
  bands,
  total,
}: {
  bands: DashboardSalesAvailabilityResponse['bands'];
  total: number;
}) {
  const size = 72;
  const center = size / 2;
  const radius = 26;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const gap = 2;

  if (total === 0) {
    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="dd-donut">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#e8e3d5"
          strokeWidth={strokeWidth}
        />
      </svg>
    );
  }

  const segments = (
    [
      { key: 'over30' as const, value: bands.over30 },
      { key: 'from15to30' as const, value: bands.from15to30 },
      { key: 'under15' as const, value: bands.under15 },
    ] as const
  ).filter((s) => s.value > 0);

  let offset = 0;
  const rings = segments.map((segment) => {
    const length = (segment.value / total) * circumference;
    const dash = Math.max(0, length - (segments.length > 1 ? gap : 0));
    const el = (
      <circle
        key={segment.key}
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={BAND_COLORS[segment.key]}
        strokeWidth={strokeWidth}
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${center} ${center})`}
        strokeLinecap="butt"
      />
    );
    offset += length;
    return el;
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="dd-donut">
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="#f0ebdf"
        strokeWidth={strokeWidth}
      />
      {rings}
    </svg>
  );
}

interface DashboardDesktopProps {
  session: SessionData;
  data: DashboardPendingResponse | null;
  salesData: DashboardSalesAvailabilityResponse | null;
  error: string | null;
}

export function DashboardDesktop({ session, data, salesData, error }: DashboardDesktopProps) {
  const {
    activeOperationPanel,
    focusTrapRef,
    modalCloseButtonRef,
    openOperationPanel,
    closeOperationModal,
    operationModalData,
  } = useOperationModal(data);

  const [operationalMetrics, setOperationalMetrics] =
    useState<DashboardOperationalMetricsResponse | null>(null);
  const [commercialMetrics, setCommercialMetrics] =
    useState<DashboardOperationalMetricsResponse | null>(null);
  const [recentActivity, setRecentActivity] = useState<DashboardRecentActivityItem[] | null>(null);

  useEffect(() => {
    if (!session) return;
    const isDesktop = window.matchMedia('(min-width: 901px)').matches;
    if (!isDesktop) return;

    function refetchAll() {
      if (!session) return;
      getDashboardOperationalMetrics(session)
        .then(setOperationalMetrics)
        .catch(() => {});
      getDashboardCommercialMetrics(session)
        .then(setCommercialMetrics)
        .catch(() => {});
      getDashboardRecentActivity(session)
        .then((response) => setRecentActivity(response.items))
        .catch(() => {});
    }

    refetchAll();

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refetchAll();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refetchAll);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refetchAll);
    };
  }, [session]);

  const printTotal = data?.printPending.total ?? 0;
  const classificationTotal =
    (data?.classificationPending.total ?? 0) + (data?.classificationInProgress?.total ?? 0);

  return (
    <div className="dashboard-desktop">
      <section className="dashboard-page">
        {error ? <p className="error">{error}</p> : null}

        <div className="dd-summary-row">
          {data ? (
            <button
              type="button"
              className="dd-card dd-card-print"
              onClick={(event) => openOperationPanel('print_pending', event.currentTarget)}
              aria-expanded={activeOperationPanel === 'print_pending'}
              aria-controls="dashboard-operation-modal-print-pending"
              aria-haspopup="dialog"
            >
              <span className="dd-card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <rect x="4" y="8" width="16" height="10" rx="2.2" />
                  <path d="M7 8V5h10v3" />
                  <path d="M8 13h8" />
                </svg>
              </span>
              <strong className="dd-card-count">{printTotal}</strong>
              <span className="dd-card-label">Impressao pendente</span>
            </button>
          ) : (
            <div className="dd-card dd-card-skeleton" aria-hidden="true">
              <span className="dd-card-icon-placeholder" />
              <span className="dd-card-count-placeholder" />
              <span className="dd-card-label-placeholder" />
            </div>
          )}

          {data ? (
            <button
              type="button"
              className="dd-card dd-card-classification"
              onClick={(event) => openOperationPanel('classification_pending', event.currentTarget)}
              aria-expanded={activeOperationPanel === 'classification_pending'}
              aria-controls="dashboard-operation-modal-classification-pending"
              aria-haspopup="dialog"
            >
              <span className="dd-card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M4 9.5V5.8A1.8 1.8 0 0 1 5.8 4h3.7" />
                  <path d="m20 8.2-8.6 8.6a2.2 2.2 0 0 1-3.1 0L5.2 13.7a2.2 2.2 0 0 1 0-3.1L13.8 2 20 8.2Z" />
                  <circle cx="14.6" cy="6.1" r="1" />
                </svg>
              </span>
              <strong className="dd-card-count">{classificationTotal}</strong>
              <span className="dd-card-label">Classificacao pendente</span>
            </button>
          ) : (
            <div className="dd-card dd-card-skeleton" aria-hidden="true">
              <span className="dd-card-icon-placeholder" />
              <span className="dd-card-count-placeholder" />
              <span className="dd-card-label-placeholder" />
            </div>
          )}

          {salesData ? (
            <div className="dd-card dd-card-sales">
              <div className="dd-card-sales-info">
                <span className="dd-card-sales-kicker">Disponiveis para venda</span>
                <strong className="dd-card-count">{salesData.total}</strong>
                <span className="dd-card-sales-unit">amostras</span>
              </div>
              <DonutChart bands={salesData.bands} total={salesData.total} />
            </div>
          ) : (
            <div className="dd-card dd-card-sales dd-card-skeleton" aria-hidden="true">
              <span className="dd-card-count-placeholder" style={{ width: '40%' }} />
              <span
                className="dd-card-icon-placeholder"
                style={{ width: 72, height: 72, borderRadius: '50%', justifySelf: 'end' }}
              />
            </div>
          )}
        </div>

        <div className="dd-metrics-row">
          <MetricsCard
            kicker="Operacional"
            subtitle="Registro → Classificacao (ultimos 5 dias)"
            data={operationalMetrics}
            color="#5f8c6a"
            id="operational"
          />
          <MetricsCard
            kicker="Comercial"
            subtitle="Classificacao → Venda (ultimas 4 semanas)"
            data={commercialMetrics}
            color="#3a6ea3"
            id="commercial"
            unitMode="days"
          />
        </div>

        <RecentActivityList items={recentActivity} />
      </section>

      {operationModalData ? (
        <OperationModal
          data={operationModalData}
          focusTrapRef={focusTrapRef}
          modalCloseButtonRef={modalCloseButtonRef}
          onClose={closeOperationModal}
        />
      ) : null}
    </div>
  );
}
