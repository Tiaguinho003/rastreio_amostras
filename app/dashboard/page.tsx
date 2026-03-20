'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { CommercialStatusBadge } from '../../components/CommercialStatusBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError, getDashboardPending } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-auth';
import type { DashboardPendingResponse, SampleSnapshot } from '../../lib/types';

type OperationPanel = 'print_pending' | 'classification_pending' | 'classification_in_progress' | null;
type OperationPanelKey = Exclude<OperationPanel, null>;

interface OperationModalData {
  modalId: string;
  title: string;
  emptyMessage: string;
  toneClass: string;
  total: number;
  items: SampleSnapshot[];
}

const DASHBOARD_LATEST_LIMIT = 10;
const DASHBOARD_MODAL_VISIBLE_ITEMS = 3;

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
      toneClass: 'dashboard-modal-tone-print',
      total: data.printPending.total,
      items: data.printPending.items
    };
  }

  if (activePanel === 'classification_pending') {
    return {
      modalId: 'dashboard-operation-modal-classification-pending',
      title: 'Classificacoes pendentes',
      emptyMessage: 'Nenhuma amostra com classificacao pendente.',
      toneClass: 'dashboard-modal-tone-classification-pending',
      total: data.classificationPending.total,
      items: data.classificationPending.items
    };
  }

  return {
    modalId: 'dashboard-operation-modal-classification-in-progress',
    title: 'Classificacoes em andamento',
    emptyMessage: 'Nenhuma amostra com classificacao em andamento.',
    toneClass: 'dashboard-modal-tone-classification-progress',
    total: data.classificationInProgress.total,
    items: data.classificationInProgress.items
  };
}

function LatestRegistrationCard({ sample }: { sample: SampleSnapshot }) {
  return (
    <Link href={`/samples/${sample.id}`} className="dashboard-latest-registration-card">
      <div className="dashboard-latest-registration-leading" aria-hidden="true" />

      <div className="dashboard-latest-registration-main">
        <div className="dashboard-latest-registration-head">
          <p className="dashboard-latest-registration-title">{sample.internalLotNumber ?? sample.id}</p>
          <StatusBadge status={sample.status} />
        </div>
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
  const [error, setError] = useState<string | null>(null);
  const [activeOperationPanel, setActiveOperationPanel] = useState<OperationPanel>(null);
  const modalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastOperationTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;
    setError(null);

    getDashboardPending(session)
      .then((response) => {
        if (active) {
          setData(response);
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
    if (!activeOperationPanel) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setActiveOperationPanel(null);
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
  const totalReceivedToday = data?.todayReceivedTotal ?? 0;
  const totalPending = data?.totalPending ?? 0;
  const operationModalMetaText = operationModalData
    ? operationModalData.total > operationModalData.items.length
      ? `Exibindo as ${operationModalData.items.length} primeiras amostras da operacao.`
      : operationModalData.items.length > DASHBOARD_MODAL_VISIBLE_ITEMS
        ? `Exibicao inicial de ${DASHBOARD_MODAL_VISIBLE_ITEMS} amostras. Role para ver as demais.`
        : null
    : null;

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="dashboard-page">
        <section className="dashboard-section-column">
          <div className="dashboard-section-heading">
            <h2 className="dashboard-section-title">Operacoes</h2>
          </div>

          <section className="panel dashboard-operations-panel">
            {error ? <p className="error">{error}</p> : null}

            {data ? (
              <div className="dashboard-operations-grid">
                <button
                  type="button"
                  className="dashboard-operation-card"
                  onClick={(event) => openOperationPanel('print_pending', event.currentTarget)}
                  aria-expanded={activeOperationPanel === 'print_pending'}
                  aria-controls="dashboard-operation-modal-print-pending"
                  aria-haspopup="dialog"
                >
                  <span className="dashboard-operation-icon dashboard-operation-icon-print" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <rect x="4" y="8" width="16" height="10" rx="2.2" />
                      <path d="M7 8V5h10v3" />
                      <path d="M8 13h8" />
                    </svg>
                  </span>
                  <span className="dashboard-operation-content">
                    <span className="dashboard-operation-title">Impressoes</span>
                    <strong className="dashboard-operation-total">{data.printPending.total}</strong>
                    <span className="dashboard-operation-description">Pendentes</span>
                  </span>
                </button>

                <button
                  type="button"
                  className="dashboard-operation-card"
                  onClick={(event) => openOperationPanel('classification_pending', event.currentTarget)}
                  aria-expanded={activeOperationPanel === 'classification_pending'}
                  aria-controls="dashboard-operation-modal-classification-pending"
                  aria-haspopup="dialog"
                >
                  <span
                    className="dashboard-operation-icon dashboard-operation-icon-classification-pending"
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M4 9.5V5.8A1.8 1.8 0 0 1 5.8 4h3.7" />
                      <path d="m20 8.2-8.6 8.6a2.2 2.2 0 0 1-3.1 0L5.2 13.7a2.2 2.2 0 0 1 0-3.1L13.8 2 20 8.2Z" />
                      <circle cx="14.6" cy="6.1" r="1" />
                    </svg>
                  </span>
                  <span className="dashboard-operation-content">
                    <span className="dashboard-operation-title">Classificacoes</span>
                    <strong className="dashboard-operation-total">{data.classificationPending.total}</strong>
                    <span className="dashboard-operation-description">Pendentes</span>
                  </span>
                </button>

                <button
                  type="button"
                  className="dashboard-operation-card"
                  onClick={(event) => openOperationPanel('classification_in_progress', event.currentTarget)}
                  aria-expanded={activeOperationPanel === 'classification_in_progress'}
                  aria-controls="dashboard-operation-modal-classification-in-progress"
                  aria-haspopup="dialog"
                >
                  <span
                    className="dashboard-operation-icon dashboard-operation-icon-classification-in-progress"
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M20 7v4h-4" />
                      <path d="M4 17v-4h4" />
                      <path d="M18.3 11A7 7 0 0 0 6 8.7" />
                      <path d="M5.7 13A7 7 0 0 0 18 15.3" />
                    </svg>
                  </span>
                  <span className="dashboard-operation-content">
                    <span className="dashboard-operation-title">Em andamento</span>
                    <strong className="dashboard-operation-total">{data.classificationInProgress.total}</strong>
                    <span className="dashboard-operation-description">{totalPending} na fila</span>
                  </span>
                </button>
              </div>
            ) : (
              <p className="dashboard-empty-state">Carregando dashboard...</p>
            )}
          </section>
        </section>

        <section className="dashboard-secondary-grid">
          <section className="dashboard-section-column dashboard-section-column-wide">
            <div className="dashboard-section-heading">
              <h2 className="dashboard-section-title">Ultimos Registros</h2>
              <Link href="/samples" className="dashboard-section-link">
                Ver todas
                <span aria-hidden="true">›</span>
              </Link>
            </div>

            <section className="panel dashboard-secondary-panel dashboard-secondary-panel-wide">
              {data ? (
                latestRegistrationItems.length === 0 ? (
                  <p className="dashboard-empty-state">Nenhuma amostra registrada recentemente.</p>
                ) : (
                  <div className="dashboard-latest-registration-scroll" aria-label="Lista de ultimos registros">
                    <div className="dashboard-latest-registration-list">
                      {latestRegistrationItems.map((sample) => (
                        <LatestRegistrationCard key={sample.id} sample={sample} />
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <p className="dashboard-empty-state">Carregando ultimos registros...</p>
              )}
            </section>
          </section>

          <section className="dashboard-section-column dashboard-section-column-actions">
            <Link href="/samples/new" className="dashboard-action-link dashboard-action-link-new">
              <span className="dashboard-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </span>
              <span className="dashboard-action-label">Nova amostra</span>
            </Link>

            <Link href="/samples" className="dashboard-action-link dashboard-action-link-search">
              <span className="dashboard-action-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.2 16.2 4.1 4.1" />
                </svg>
              </span>
              <span className="dashboard-action-label">Buscar amostra</span>
            </Link>

            <section className="panel dashboard-total-today-panel">
              <p className="dashboard-total-today-text">
                Total Hoje: <strong>{totalReceivedToday}</strong>
              </p>
              <Link href="/samples" className="dashboard-view-all-link">
                Ver Todas
                <span aria-hidden="true">›</span>
              </Link>
            </section>
          </section>
        </section>
      </section>

      {operationModalData ? (
        <div className="dashboard-modal-backdrop" onClick={closeOperationModal}>
          <section
            id={operationModalData.modalId}
            className={`dashboard-modal ${operationModalData.toneClass}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-operation-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dashboard-modal-header">
              <div className="dashboard-modal-title-wrap">
                <h3 id="dashboard-operation-modal-title" className="dashboard-modal-title">
                  {operationModalData.title}
                </h3>
              </div>
              <button
                ref={modalCloseButtonRef}
                type="button"
                className="dashboard-modal-close"
                onClick={closeOperationModal}
                aria-label="Fechar modal"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <div className="dashboard-modal-meta">
              <p className="dashboard-modal-meta-chip">
                <strong>{operationModalData.total}</strong>
                <span>total</span>
              </p>
              {operationModalMetaText ? <p className="dashboard-modal-meta-text">{operationModalMetaText}</p> : null}
            </div>

            {operationModalData.items.length === 0 ? (
              <p className="dashboard-modal-empty">{operationModalData.emptyMessage}</p>
            ) : (
              <div className="dashboard-modal-list">
                {operationModalData.items.map((sample) => (
                  <Link
                    key={sample.id}
                    href={`/samples/${sample.id}`}
                    className="dashboard-modal-item"
                    onClick={closeOperationModal}
                  >
                    <div className="dashboard-modal-item-header">
                      <strong className="dashboard-modal-item-title">{sample.internalLotNumber ?? sample.id}</strong>
                      <div className="status-badge-group">
                        <StatusBadge status={sample.status} />
                        <CommercialStatusBadge status={sample.commercialStatus} />
                      </div>
                    </div>
                    <p className="dashboard-modal-item-line">
                      <strong>Proprietario:</strong> {renderMainSampleValue(sample.declared.owner)}
                    </p>
                    <p className="dashboard-modal-item-line">
                      <strong>Criada em:</strong> {formatCreationTimestamp(sample.createdAt)}
                    </p>
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
