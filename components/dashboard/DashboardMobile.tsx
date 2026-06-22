'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { HeaderAvatarMenu } from '../HeaderAvatarMenu';
import { SalesAvailabilityCard } from '../SalesAvailabilityCard';
import { getDashboardRecentActivity } from '../../lib/api-client';
import { getRoleLabel } from '../../lib/roles';
import { getGreeting, getInitials } from './greeting';
import { useOperationModal } from './useOperationModal';
import { OperationModal } from './OperationModal';
import { RecentActivityListMobile } from './RecentActivityListMobile';
import type {
  DashboardPendingResponse,
  DashboardRecentActivityItem,
  DashboardSalesAvailabilityResponse,
  SessionData,
} from '../../lib/types';

interface DashboardMobileProps {
  session: SessionData;
  data: DashboardPendingResponse | null;
  salesData: DashboardSalesAvailabilityResponse | null;
  error: string | null;
  onLogout: () => void | Promise<void>;
}

export function DashboardMobile({
  session,
  data,
  salesData,
  error,
  onLogout,
}: DashboardMobileProps) {
  const router = useRouter();
  const {
    activeOperationPanel,
    open: operationModalOpen,
    openOperationPanel,
    closeOperationModal,
    classifySample,
    operationModalData,
  } = useOperationModal(data);

  const fullName = session.user.fullName ?? session.user.username;
  const firstName = fullName.split(' ')[0];
  const roleLabel = getRoleLabel(session.user.role);
  const initials = getInitials(fullName);

  // Recent activity: pattern espelhado do DashboardDesktop. Throttle de
  // 30s alinha com o Cache-Control private/max-age=30 do endpoint —
  // Alt+Tab/troca de app rapida nao gera N requests.
  const [recentActivity, setRecentActivity] = useState<DashboardRecentActivityItem[] | null>(null);
  const lastRecentFetchRef = useRef<number>(0);

  useEffect(() => {
    // So o mobile (<=900px) busca; no desktop o twin fica montado mas inerte
    // (evita request + timer fantasma). `active` evita setState apos unmount;
    // o listener de 'change' re-busca ao ENTRAR no mobile num resize.
    const mq = window.matchMedia('(max-width: 900px)');
    let active = true;
    const REFETCH_THROTTLE_MS = 30_000;

    function refetchRecent() {
      if (!active || !mq.matches) return;
      lastRecentFetchRef.current = Date.now();
      getDashboardRecentActivity(session)
        .then((response) => {
          if (active) setRecentActivity(response.items);
        })
        .catch(() => {});
    }

    function refetchRecentThrottled() {
      if (Date.now() - lastRecentFetchRef.current < REFETCH_THROTTLE_MS) return;
      refetchRecent();
    }

    refetchRecent();

    function handleBreakpointChange() {
      if (mq.matches) refetchRecent();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refetchRecentThrottled();
      }
    }

    mq.addEventListener('change', handleBreakpointChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refetchRecentThrottled);
    return () => {
      active = false;
      mq.removeEventListener('change', handleBreakpointChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refetchRecentThrottled);
    };
  }, [session]);

  return (
    <div className="dashboard-mobile">
      <section className="dashboard-page">
        {/* Scroll simples da pagina inteira: a saudacao (hero) e o sheet
            vivem dentro do .dashboard-scroll e rolam juntos como uma pagina
            normal — nada fica fixo no topo. */}
        <div className="dashboard-scroll">
          <section className="dashboard-hero">
            <div className="dashboard-hero-header">
              <div className="dashboard-greeting">
                <span className="dashboard-greeting-label">{getGreeting()}</span>
                <span className="dashboard-greeting-name">{firstName}</span>
                <span className="dashboard-greeting-role">
                  <svg
                    className="dashboard-greeting-role-icon"
                    viewBox="0 0 24 24"
                    focusable="false"
                    aria-hidden="true"
                  >
                    <path d="M12 3 5 5.5v6c0 4.5 3 8.3 7 9.5 4-1.2 7-5 7-9.5v-6L12 3z" />
                    <path d="m9 12 2 2 4-4.5" />
                  </svg>
                  {roleLabel}
                </span>
              </div>
              <HeaderAvatarMenu session={session} onLogout={onLogout} />
              <Link href="/profile" className="dashboard-hero-avatar" aria-label="Ir para perfil">
                <span className="dashboard-hero-avatar-initials">{initials}</span>
              </Link>
            </div>
          </section>

          <section className="dashboard-sheet">
            <section className="dashboard-sheet-section is-slot-operations">
              {error ? <p className="error">{error}</p> : null}
              {data ? (
                <div className="dashboard-operations-grid">
                  {/* Q.print: card "Impressão" cortado definitivamente (decisao
                    Q.1.c #20). PrintJob vive no detalhe da amostra, nao aqui. */}
                  <button
                    type="button"
                    className="dashboard-operation-card dashboard-op-classification is-wide"
                    onClick={(event) =>
                      openOperationPanel('classification_pending', event.currentTarget)
                    }
                    aria-expanded={activeOperationPanel === 'classification_pending'}
                    aria-haspopup="dialog"
                  >
                    <span className="dashboard-operation-icon-wrap" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                        {/* Corpo do grao: elipse vertical (rx:ry ~ 1:1.45). */}
                        <ellipse cx="12" cy="12" rx="6.2" ry="9" />
                        {/* Fenda central — clara (cor do icon-wrap) pra
                          contrastar com o corpo verde-escuro do grao no
                          design do mockup (glifo solido verde sobre
                          container verde-claro). */}
                        <path
                          d="M12 4.6 Q 13 8.5 12 12 Q 11 15.5 12 19.4"
                          style={{
                            fill: 'none',
                            stroke: '#e8f1ec',
                            strokeWidth: 1.7,
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                          }}
                        />
                      </svg>
                    </span>
                    <span className="dashboard-operation-content">
                      <span className="dashboard-operation-title">Lotes</span>
                      <span className="dashboard-operation-subtitle">Pendentes</span>
                    </span>
                    {data.classificationPending.total > 0 ? (
                      <span className="dashboard-operation-badge">
                        {data.classificationPending.total}
                      </span>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    className="dashboard-operation-card dashboard-op-clients is-wide"
                    onClick={() => router.push('/clients?incomplete=true')}
                    aria-label={`Clientes pendentes (${data.clientsIncomplete.total})`}
                  >
                    <span className="dashboard-operation-icon-wrap" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                        <circle cx="12" cy="7.5" r="4" />
                        <path d="M4.5 20.5v-1.5c0-3.3 3.36-5.7 7.5-5.7s7.5 2.4 7.5 5.7v1.5z" />
                      </svg>
                    </span>
                    <span className="dashboard-operation-content">
                      <span className="dashboard-operation-title">Clientes</span>
                      <span className="dashboard-operation-subtitle">Pendentes</span>
                    </span>
                    {data.clientsIncomplete.total > 0 ? (
                      <span className="dashboard-operation-badge">
                        {data.clientsIncomplete.total}
                      </span>
                    ) : null}
                  </button>
                </div>
              ) : (
                <div className="dashboard-operations-grid">
                  <div
                    className="dashboard-operation-card dashboard-skeleton-card is-wide"
                    aria-hidden="true"
                  >
                    <span className="dashboard-skeleton-icon-wrap" />
                    <span className="dashboard-skeleton-line dashboard-skeleton-line-sm" />
                  </div>
                  <div
                    className="dashboard-operation-card dashboard-skeleton-card is-wide"
                    aria-hidden="true"
                  >
                    <span className="dashboard-skeleton-icon-wrap" />
                    <span className="dashboard-skeleton-line dashboard-skeleton-line-sm" />
                  </div>
                </div>
              )}
            </section>

            <section className="dashboard-sheet-section dashboard-sheet-content is-slot-sales">
              {salesData ? (
                <SalesAvailabilityCard data={salesData} />
              ) : (
                <div className="sales-card sales-card-skeleton" aria-hidden="true" />
              )}
            </section>

            <section className="dashboard-sheet-section dashboard-sheet-content is-slot-activities">
              <RecentActivityListMobile items={recentActivity} />
            </section>
          </section>
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
