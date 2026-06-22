'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { getDashboardRecentActivity } from '../../lib/api-client';
import { useOperationModal } from './useOperationModal';
import { OperationModal } from './OperationModal';
import { RecentActivityList } from './RecentActivityList';
import { StatCard, formatDelta } from './StatCard';
import type {
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
    classifySample,
    operationModalData,
  } = useOperationModal(data);

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
            <>
              <StatCard
                title="Classificacao pendente"
                value={classificationTotal}
                onClick={(event) =>
                  openOperationPanel('classification_pending', event.currentTarget)
                }
                ariaExpanded={activeOperationPanel === 'classification_pending'}
                ariaHasPopup="dialog"
                icon={
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M4 9.5V5.8A1.8 1.8 0 0 1 5.8 4h3.7" />
                    <path d="m20 8.2-8.6 8.6a2.2 2.2 0 0 1-3.1 0L5.2 13.7a2.2 2.2 0 0 1 0-3.1L13.8 2 20 8.2Z" />
                    <circle cx="14.6" cy="6.1" r="1" />
                  </svg>
                }
              />
              <StatCard
                title="Cadastros pendentes"
                value={data.clientsIncomplete.total}
                onClick={() => router.push('/clients?incomplete=true')}
                ariaLabel={`Cadastros pendentes (${data.clientsIncomplete.total})`}
                icon={
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                    <path d="M17 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                    <path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  </svg>
                }
              />
              <StatCard
                title="Lotes registrados hoje"
                value={data.dailyRegistered.today}
                delta={formatDelta(data.dailyRegistered.today, data.dailyRegistered.yesterday)}
                icon={
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                    <path d="M14 3v5h5" />
                    <path d="m9.5 15 2 2 3.5-3.8" />
                  </svg>
                }
              />
              <StatCard
                title="Envios concluidos hoje"
                value={data.dailySent.today}
                delta={formatDelta(data.dailySent.today, data.dailySent.yesterday)}
                icon={
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M22 2 11 13" />
                    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
                  </svg>
                }
              />
            </>
          ) : (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="dd-stat-card is-skeleton" aria-hidden="true" />
            ))
          )}
        </div>

        <div className="dd-second-row">
          {salesData ? (
            <div className="dd-card dd-card-sales">
              <div className="dd-card-sales-info">
                <span className="dd-card-sales-kicker">Lotes disponíveis</span>
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

        <RecentActivityList items={recentActivity} />
      </section>

      <OperationModal
        open={operationModalOpen}
        data={operationModalData}
        onClose={closeOperationModal}
        onItemAction={classifySample}
      />
    </div>
  );
}
