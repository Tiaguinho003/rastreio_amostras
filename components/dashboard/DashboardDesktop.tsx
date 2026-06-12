'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

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
  const router = useRouter();
  const {
    activeOperationPanel,
    open: operationModalOpen,
    openOperationPanel,
    closeOperationModal,
    operationModalData,
  } = useOperationModal(data);

  const [operationalMetrics, setOperationalMetrics] =
    useState<DashboardOperationalMetricsResponse | null>(null);
  const [commercialMetrics, setCommercialMetrics] =
    useState<DashboardOperationalMetricsResponse | null>(null);
  const [recentActivity, setRecentActivity] = useState<DashboardRecentActivityItem[] | null>(null);
  // Throttle pro refetch on focus/visibilitychange: evita N requests
  // em Alt+Tab rapido. 30s alinha com o Cache-Control do endpoint.
  const lastFetchRef = useRef<number>(0);

  useEffect(() => {
    if (!session) return;
    const isDesktop = window.matchMedia('(min-width: 901px)').matches;
    if (!isDesktop) return;

    const REFETCH_THROTTLE_MS = 30_000;

    function refetchAll() {
      if (!session) return;
      lastFetchRef.current = Date.now();
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

    function refetchAllThrottled() {
      if (Date.now() - lastFetchRef.current < REFETCH_THROTTLE_MS) return;
      refetchAll();
    }

    refetchAll();

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refetchAllThrottled();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refetchAllThrottled);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refetchAllThrottled);
    };
  }, [session]);

  // Q.print: card "Impressao pendente" cortado definitivamente (decisao
  // Q.1.c #20). PrintJob agora vive como informacao auxiliar dentro do
  // detalhe da amostra, nao no dashboard.
  const classificationTotal = data?.classificationPending.total ?? 0;

  return (
    <div className="dashboard-desktop">
      <section className="dashboard-page">
        {error ? <p className="error">{error}</p> : null}

        <div className="dd-summary-row">
          {data ? (
            <button
              type="button"
              className="dd-card dd-card-classification"
              onClick={(event) => openOperationPanel('classification_pending', event.currentTarget)}
              aria-expanded={activeOperationPanel === 'classification_pending'}
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

          {data ? (
            <button
              type="button"
              className="dd-card dd-card-clients"
              onClick={() => router.push('/clients?incomplete=true')}
              aria-label={`Cadastros pendentes (${data.clientsIncomplete.total})`}
            >
              <span className="dd-card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                  <path d="M17 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                  <path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                </svg>
              </span>
              <strong className="dd-card-count">{data.clientsIncomplete.total}</strong>
              <span className="dd-card-label">Cadastros pendentes</span>
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

      <OperationModal
        open={operationModalOpen}
        data={operationModalData}
        onClose={closeOperationModal}
        onItemAction={(sampleId) => {
          closeOperationModal();
          router.push(`/camera?sampleId=${sampleId}`);
        }}
      />
    </div>
  );
}
