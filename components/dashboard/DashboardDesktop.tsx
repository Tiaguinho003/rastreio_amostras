'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { getDashboardRecentSends } from '../../lib/api-client';
import { SalesAvailabilityCard } from '../SalesAvailabilityCard';
import { EventsCalendarCard } from './EventsCalendarCard';
import { RecentSendsCard } from './RecentSendsCard';
import { useOperationModal } from './useOperationModal';
import { OperationModal } from './OperationModal';
import { StatCard } from './StatCard';
import type {
  DashboardPendingResponse,
  DashboardRecentSendsResponse,
  DashboardSalesAvailabilityResponse,
  SessionData,
} from '../../lib/types';

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

  const [recentSends, setRecentSends] = useState<DashboardRecentSendsResponse | null>(null);
  // Throttle pro refetch on focus/visibilitychange: evita N requests
  // em Alt+Tab rapido.
  const lastFetchRef = useRef<number>(0);

  useEffect(() => {
    if (!session) return undefined;

    // So o breakpoint ATIVO busca (o twin mobile fica montado mas inerte via
    // CSS). `active` evita setState apos unmount; o listener de 'change' do
    // matchMedia re-busca ao ENTRAR no desktop num resize (senao o card
    // ficava travado no skeleton — nada disparava o fetch).
    const mq = window.matchMedia('(min-width: 901px)');
    let active = true;
    const REFETCH_THROTTLE_MS = 30_000;

    function refetchAll() {
      if (!active || !mq.matches) return;
      lastFetchRef.current = Date.now();
      getDashboardRecentSends(session)
        .then((response) => {
          if (active) setRecentSends(response);
        })
        .catch(() => {});
    }

    function refetchAllThrottled() {
      if (Date.now() - lastFetchRef.current < REFETCH_THROTTLE_MS) return;
      refetchAll();
    }

    refetchAll();

    function handleBreakpointChange() {
      if (mq.matches) refetchAll();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refetchAllThrottled();
      }
    }

    mq.addEventListener('change', handleBreakpointChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refetchAllThrottled);
    return () => {
      active = false;
      mq.removeEventListener('change', handleBreakpointChange);
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
        {error ? (
          <p className="dashboard-error-banner" role="status">
            {error}
          </p>
        ) : null}

        {/* Layout DSH-D4/D5/D6 + E20: coluna ESQUERDA = pendencias (2
            StatCards, tamanho preservado) + pilha donut/Ultimos envios;
            coluna DIREITA inteira = card de Eventos, do topo (linha das
            pendencias) ate a base. */}
        <div className="dd-content-grid">
          <div className="dd-left-col">
            <div className="dd-summary-row">
              {data ? (
                <>
                  <StatCard
                    title="Classificação pendente"
                    value={classificationTotal}
                    onClick={(event) =>
                      openOperationPanel('classification_pending', event.currentTarget)
                    }
                    ariaExpanded={activeOperationPanel === 'classification_pending'}
                    ariaHasPopup="dialog"
                    icon={
                      <svg viewBox="0 0 24 24" focusable="false">
                        <ellipse cx="12" cy="12" rx="6.2" ry="9" />
                        <path d="M12 4.6 Q 13 8.5 12 12 Q 11 15.5 12 19.4" />
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
                </>
              ) : (
                Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="dd-stat-card is-skeleton" aria-hidden="true" />
                ))
              )}
            </div>
            <div className="dd-left-stack">
              {salesData ? (
                <SalesAvailabilityCard data={salesData} compact />
              ) : (
                <div className="sales-card sales-card-skeleton" aria-hidden="true" />
              )}
              <RecentSendsCard items={recentSends ? recentSends.items : null} />
            </div>
          </div>
          <EventsCalendarCard />
        </div>
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
