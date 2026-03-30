'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { SalesAvailabilityCard } from '../../components/SalesAvailabilityCard';
import { SampleSearchField } from '../../components/SampleSearchField';
import { ApiError, getDashboardPending, getDashboardSalesAvailability } from '../../lib/api-client';
import { getRoleLabel } from '../../lib/roles';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { useRequireAuth } from '../../lib/use-auth';
import type { DashboardPendingResponse, DashboardSalesAvailabilityResponse, SampleSnapshot } from '../../lib/types';

type OperationPanel = 'print_pending' | 'classification_pending' | 'classification_in_progress' | null;
type OperationPanelKey = Exclude<OperationPanel, null>;

interface OperationModalData {
  modalId: string;
  title: string;
  emptyMessage: string;
  total: number;
  items: SampleSnapshot[];
  themeClass: string;
}

const DASHBOARD_LATEST_LIMIT = 10;

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
function renderMainSampleValue(value: string | number | null) {
  if (value === null || value === '') {
    return 'Nao informado';
  }

  return String(value);
}

function formatCreationTimestamp(value: string) {
  const timestamp = new Date(value);
  const date = timestamp.toLocaleDateString('pt-BR');
  const time = timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date} - ${time}`;
}

function formatLatestSummary(sample: SampleSnapshot) {
  const owner = renderMainSampleValue(sample.declared.owner);
  const harvest = renderMainSampleValue(sample.declared.harvest);
  const sacks = renderMainSampleValue(sample.declared.sacks);
  return `${owner} | Safra ${harvest} | Saca ${sacks}`;
}

function buildOperationModalData(
  data: DashboardPendingResponse,
  activePanel: OperationPanel
): OperationModalData | null {
  if (activePanel === null) {
    return null;
  }

  if (activePanel === 'print_pending') {
    return {
      modalId: 'dashboard-operation-modal-print-pending',
      title: 'Impressao pendente',
      emptyMessage: 'Nenhuma amostra com impressao pendente.',
      total: data.printPending.total,
      items: data.printPending.items,
      themeClass: 'is-status-print-pending'
    };
  }

  if (activePanel === 'classification_pending') {
    return {
      modalId: 'dashboard-operation-modal-classification-pending',
      title: 'Classificacoes pendentes',
      emptyMessage: 'Nenhuma amostra com classificacao pendente.',
      total: data.classificationPending.total,
      items: data.classificationPending.items,
      themeClass: 'is-status-classification-pending'
    };
  }

  return {
    modalId: 'dashboard-operation-modal-classification-in-progress',
    title: 'Classificacoes em andamento',
    emptyMessage: 'Nenhuma amostra com classificacao em andamento.',
    total: data.classificationInProgress.total,
    items: data.classificationInProgress.items,
    themeClass: 'is-status-classification-progress'
  };
}

function getStatusThemeClass(status: string): string {
  switch (status) {
    case 'REGISTRATION_CONFIRMED':
    case 'QR_PENDING_PRINT':
      return 'is-status-print-pending';
    case 'QR_PRINTED':
      return 'is-status-classification-pending';
    case 'CLASSIFICATION_IN_PROGRESS':
      return 'is-status-classification-progress';
    case 'CLASSIFIED':
      return 'is-status-success';
    case 'INVALIDATED':
      return 'is-status-danger';
    default:
      return 'is-status-neutral';
  }
}

function LatestRegistrationCard({ sample }: { sample: SampleSnapshot }) {
  return (
    <Link href={`/samples/${sample.id}`} className={`dashboard-latest-registration-card ${getStatusThemeClass(sample.status)}`}>
      <div className="dashboard-latest-registration-main">
        <p className="dashboard-latest-registration-title">{sample.internalLotNumber ?? sample.id}</p>
        <p className="dashboard-latest-registration-subtitle">{formatLatestSummary(sample)}</p>
        <p className="dashboard-latest-registration-meta">
          <span className="dashboard-latest-registration-meta-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <rect x="4.5" y="5.5" width="15" height="14" rx="2.2" />
              <path d="M7.5 3.8v3.2" />
              <path d="M16.5 3.8v3.2" />
              <path d="M4.5 9.5h15" />
            </svg>
          </span>
          <span>{formatCreationTimestamp(sample.createdAt)}</span>
        </p>
      </div>

      <div className="dashboard-latest-registration-leading" aria-hidden="true" />

      <div className="dashboard-latest-registration-trailing" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { session, loading, logout } = useRequireAuth();
  const [data, setData] = useState<DashboardPendingResponse | null>(null);
  const [salesData, setSalesData] = useState<DashboardSalesAvailabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeOperationPanel, setActiveOperationPanel] = useState<OperationPanel>(null);
  const focusTrapRef = useFocusTrap(activeOperationPanel !== null);
  const modalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastOperationTriggerRef = useRef<HTMLButtonElement | null>(null);

  const refreshDashboard = useCallback(() => {
    if (!session) {
      return () => {};
    }

    let active = true;
    setError(null);

    Promise.all([
      getDashboardPending(session),
      getDashboardSalesAvailability(session)
    ])
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

  useEffect(() => {
    if (!activeOperationPanel) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setActiveOperationPanel(null);
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      modalCloseButtonRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        lastOperationTriggerRef.current?.focus();
      }, 0);
    };
  }, [activeOperationPanel]);

  if (loading || !session) {
    return null;
  }

  function openOperationPanel(panel: OperationPanelKey, trigger: HTMLButtonElement) {
    lastOperationTriggerRef.current = trigger;
    setActiveOperationPanel((current) => (current === panel ? null : panel));
  }

  function closeOperationModal() {
    setActiveOperationPanel(null);
  }

  const operationModalData = data ? buildOperationModalData(data, activeOperationPanel) : null;
  const latestRegistrationItems = data ? data.latestRegistrations.items.slice(0, DASHBOARD_LATEST_LIMIT) : [];
  const fullName = session.user.fullName ?? session.user.username;
  const firstName = fullName.split(' ')[0];
  const roleLabel = getRoleLabel(session.user.role);
  const initials = getInitials(fullName);

  return (
    <AppShell session={session} onLogout={logout}>
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
            <SampleSearchField session={session} placeholder="Buscar por lote" submitLabel="Buscar" />
          </div>
        </section>

        <section className="dashboard-sheet">
          <section className="dashboard-sheet-section">
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
                  onClick={(event) => openOperationPanel('classification_pending', event.currentTarget)}
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
                    {data.classificationPending.total > 0 ? (
                      <span className="dashboard-operation-badge">{data.classificationPending.total}</span>
                    ) : null}
                  </span>
                  <span className="dashboard-operation-label">Classificação</span>
                </button>

                <button
                  type="button"
                  className="dashboard-operation-card dashboard-op-progress"
                  onClick={(event) => openOperationPanel('classification_in_progress', event.currentTarget)}
                  aria-expanded={activeOperationPanel === 'classification_in_progress'}
                  aria-controls="dashboard-operation-modal-classification-in-progress"
                  aria-haspopup="dialog"
                >
                  <span className="dashboard-operation-icon-wrap" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M20 7v4h-4" />
                      <path d="M4 17v-4h4" />
                      <path d="M18.3 11A7 7 0 0 0 6 8.7" />
                      <path d="M5.7 13A7 7 0 0 0 18 15.3" />
                    </svg>
                    {data.classificationInProgress.total > 0 ? (
                      <span className="dashboard-operation-badge">{data.classificationInProgress.total}</span>
                    ) : null}
                  </span>
                  <span className="dashboard-operation-label">Classificando</span>
                </button>
              </div>
            ) : (
              <div className="dashboard-operations-grid">
                <div className="dashboard-operation-card dashboard-skeleton-card" aria-hidden="true">
                  <span className="dashboard-skeleton-icon-wrap" />
                  <span className="dashboard-skeleton-line dashboard-skeleton-line-sm" />
                </div>
                <div className="dashboard-operation-card dashboard-skeleton-card" aria-hidden="true">
                  <span className="dashboard-skeleton-icon-wrap" />
                  <span className="dashboard-skeleton-line dashboard-skeleton-line-sm" />
                </div>
                <div className="dashboard-operation-card dashboard-skeleton-card" aria-hidden="true">
                  <span className="dashboard-skeleton-icon-wrap" />
                  <span className="dashboard-skeleton-line dashboard-skeleton-line-sm" />
                </div>
              </div>
            )}
          </section>

          <section className="dashboard-sheet-section dashboard-sheet-content">
            {salesData ? (
              <SalesAvailabilityCard data={salesData} />
            ) : (
              <div className="sales-card sales-card-skeleton" aria-hidden="true">
                <div className="sales-card-hero">
                  <div className="sales-card-hero-left">
                    <span className="dashboard-skeleton-line dashboard-skeleton-line-sm" style={{ background: 'rgba(255,255,255,0.15)', width: '60%' }} />
                    <span className="dashboard-skeleton-line dashboard-skeleton-line-lg" style={{ background: 'rgba(255,255,255,0.2)', width: '40%', height: '32px' }} />
                  </div>
                </div>
                <div style={{ background: '#ffffff', padding: '18px 20px' }}>
                  <span className="dashboard-skeleton-line dashboard-skeleton-line-sm" style={{ background: '#e8e3d5', width: '50%', marginBottom: '10px', display: 'block' }} />
                  <span className="dashboard-skeleton-line" style={{ background: '#e8e3d5', width: '100%', height: '10px', borderRadius: '5px', display: 'block' }} />
                </div>
              </div>
            )}
          </section>
        </section>
      </section>

      {operationModalData ? (
        <div className="dashboard-modal-backdrop" onClick={closeOperationModal}>
          <section
            ref={focusTrapRef}
            id={operationModalData.modalId}
            className={`app-modal app-modal-dashboard ${operationModalData.themeClass}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-operation-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="dashboard-operation-modal-title" className="app-modal-title">
                  {operationModalData.title}
                </h3>
              </div>
              <button
                ref={modalCloseButtonRef}
                type="button"
                className="app-modal-close"
                onClick={closeOperationModal}
                aria-label="Fechar modal"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            {operationModalData.items.length === 0 ? (
              <p className="app-modal-empty">{operationModalData.emptyMessage}</p>
            ) : (
              <div className="app-modal-list">
                {operationModalData.items.map((sample) => (
                  <Link
                    key={sample.id}
                    href={`/samples/${sample.id}`}
                    className="app-modal-card"
                    onClick={closeOperationModal}
                  >
                    <div className="app-modal-card-body">
                      <strong className="app-modal-card-title">{sample.internalLotNumber ?? sample.id}</strong>
                      <p className="app-modal-card-line">
                        {renderMainSampleValue(sample.declared.owner)}
                      </p>
                      <p className="app-modal-card-meta">
                        {formatCreationTimestamp(sample.createdAt)}
                      </p>
                    </div>
                    <span className="app-modal-card-indicator" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
