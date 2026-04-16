'use client';

import { SalesAvailabilityCard } from '../SalesAvailabilityCard';
import { SampleSearchField } from '../SampleSearchField';
import { getRoleLabel } from '../../lib/roles';
import { useOperationModal } from './useOperationModal';
import { OperationModal } from './OperationModal';
import type {
  DashboardPendingResponse,
  DashboardSalesAvailabilityResponse,
  SessionData,
} from '../../lib/types';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia,';
  if (hour < 18) return 'Boa tarde,';
  return 'Boa noite,';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface DashboardMobileProps {
  session: SessionData;
  data: DashboardPendingResponse | null;
  salesData: DashboardSalesAvailabilityResponse | null;
  error: string | null;
}

export function DashboardMobile({ session, data, salesData, error }: DashboardMobileProps) {
  const {
    activeOperationPanel,
    focusTrapRef,
    modalCloseButtonRef,
    openOperationPanel,
    closeOperationModal,
    operationModalData,
  } = useOperationModal(data);

  const fullName = session.user.fullName ?? session.user.username;
  const firstName = fullName.split(' ')[0];
  const roleLabel = getRoleLabel(session.user.role);
  const initials = getInitials(fullName);

  return (
    <div className="dashboard-mobile">
      <section className="dashboard-page">
        <section className="dashboard-hero">
          <div className="dashboard-hero-header">
            <div className="dashboard-greeting">
              <span className="dashboard-greeting-label">{getGreeting()}</span>
              <span className="dashboard-greeting-name">{firstName}</span>
              <span className="dashboard-greeting-role">{roleLabel}</span>
            </div>
            <button
              type="button"
              className="dashboard-hero-avatar"
              aria-label="Abrir menu de perfil"
              onClick={() => window.dispatchEvent(new CustomEvent('open-profile-sheet'))}
            >
              <span className="dashboard-hero-avatar-initials">{initials}</span>
            </button>
          </div>
          <div className="dashboard-hero-search">
            <SampleSearchField
              session={session}
              placeholder="Buscar por lote"
              submitLabel="Buscar"
            />
          </div>
        </section>

        <section className="dashboard-sheet">
          <section className="dashboard-sheet-section is-slot-operations">
            <div className="dashboard-section-heading">
              <h2 className="dashboard-section-title">Operacoes</h2>
            </div>
            {error ? <p className="error">{error}</p> : null}
            {data ? (
              <div className="dashboard-operations-grid">
                <button
                  type="button"
                  className="dashboard-operation-card dashboard-op-print"
                  onClick={(event) => openOperationPanel('print_pending', event.currentTarget)}
                  aria-expanded={activeOperationPanel === 'print_pending'}
                  aria-controls="dashboard-operation-modal-print-pending"
                  aria-haspopup="dialog"
                >
                  <span className="dashboard-operation-icon-wrap" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <rect x="4" y="8" width="16" height="10" rx="2.2" />
                      <path d="M7 8V5h10v3" />
                      <path d="M8 13h8" />
                    </svg>
                    {data.printPending.total > 0 ? (
                      <span className="dashboard-operation-badge">{data.printPending.total}</span>
                    ) : null}
                  </span>
                  <span className="dashboard-operation-label">Impressão</span>
                </button>

                <button
                  type="button"
                  className="dashboard-operation-card dashboard-op-classification"
                  onClick={(event) =>
                    openOperationPanel('classification_pending', event.currentTarget)
                  }
                  aria-expanded={activeOperationPanel === 'classification_pending'}
                  aria-controls="dashboard-operation-modal-classification-pending"
                  aria-haspopup="dialog"
                >
                  <span className="dashboard-operation-icon-wrap" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M4 9.5V5.8A1.8 1.8 0 0 1 5.8 4h3.7" />
                      <path d="m20 8.2-8.6 8.6a2.2 2.2 0 0 1-3.1 0L5.2 13.7a2.2 2.2 0 0 1 0-3.1L13.8 2 20 8.2Z" />
                      <circle cx="14.6" cy="6.1" r="1" />
                    </svg>
                    {data.classificationPending.total +
                      (data.classificationInProgress?.total ?? 0) >
                    0 ? (
                      <span className="dashboard-operation-badge">
                        {data.classificationPending.total +
                          (data.classificationInProgress?.total ?? 0)}
                      </span>
                    ) : null}
                  </span>
                  <span className="dashboard-operation-label">Classificação</span>
                </button>
              </div>
            ) : (
              <div className="dashboard-operations-grid">
                <div
                  className="dashboard-operation-card dashboard-skeleton-card"
                  aria-hidden="true"
                >
                  <span className="dashboard-skeleton-icon-wrap" />
                  <span className="dashboard-skeleton-line dashboard-skeleton-line-sm" />
                </div>
                <div
                  className="dashboard-operation-card dashboard-skeleton-card"
                  aria-hidden="true"
                >
                  <span className="dashboard-skeleton-icon-wrap" />
                  <span className="dashboard-skeleton-line dashboard-skeleton-line-sm" />
                </div>
                <div
                  className="dashboard-operation-card dashboard-skeleton-card"
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
              <div className="sales-card sales-card-skeleton" aria-hidden="true">
                <div className="sales-card-hero">
                  <div className="sales-card-hero-left">
                    <span
                      className="dashboard-skeleton-line dashboard-skeleton-line-sm"
                      style={{ background: 'rgba(255,255,255,0.15)', width: '60%' }}
                    />
                    <span
                      className="dashboard-skeleton-line dashboard-skeleton-line-lg"
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        width: '40%',
                        height: '32px',
                      }}
                    />
                  </div>
                </div>
                <div style={{ background: '#ffffff', padding: '18px 20px' }}>
                  <span
                    className="dashboard-skeleton-line dashboard-skeleton-line-sm"
                    style={{
                      background: '#e8e3d5',
                      width: '50%',
                      marginBottom: '10px',
                      display: 'block',
                    }}
                  />
                  <span
                    className="dashboard-skeleton-line"
                    style={{
                      background: '#e8e3d5',
                      width: '100%',
                      height: '10px',
                      borderRadius: '5px',
                      display: 'block',
                    }}
                  />
                </div>
              </div>
            )}
          </section>
        </section>
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
