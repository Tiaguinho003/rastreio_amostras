'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { HeaderAvatarMenu } from '../../HeaderAvatarMenu';
import { VisitReportCard } from '../../visits/VisitReportCard';
import { VisitReportFormSheet } from '../../visits/VisitReportFormSheet';
import { ApiError, deleteVisitReport } from '../../../lib/api-client';
import { flushVisitOutbox } from '../../../lib/offline/visit-sync';
import { countVisitOutbox, VISIT_OUTBOX_CHANGED_EVENT } from '../../../lib/offline/visit-outbox';
import { useOnlineStatus } from '../../../lib/offline/use-online-status';
import { getRoleLabel } from '../../../lib/roles';
import { useToast } from '../../../lib/toast/ToastProvider';
import type { SessionData, VisitReportSummary } from '../../../lib/types';
import { useFocusTrap } from '../../../lib/use-focus-trap';
import { getGreeting, getInitials } from '../greeting';
import { useProspectorDashboardData } from './useProspectorDashboardData';

// Dashboard dedicado do PROSPECTOR — a "home" do app restrito dele
// (tabbar so com Inicio + Perfil). Layout unico responsivo reutilizando as
// classes do dashboard padrao (.dashboard-hero/.dashboard-sheet/cards) +
// lista de informes com os cards rsm-* do /resumo. O FAB central abre o
// formulario de visita num BottomSheet; o lembrete push diario chega com
// /dashboard?informe=novo e abre o sheet sozinho.

interface ProspectorDashboardProps {
  session: SessionData;
  onLogout: () => void | Promise<void>;
}

export function ProspectorDashboard({ session, onLogout }: ProspectorDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const isOnline = useOnlineStatus();

  // Busca por nome do cliente: filtra ao digitar (debounce de 250ms), so a
  // partir da 2a letra; apagar abaixo disso limpa o filtro sozinho. O
  // filtro roda no servidor — total e paginacao acompanham.
  const [searchTerm, setSearchTerm] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const trimmed = searchTerm.trim();
    const next = trimmed.length >= 2 ? trimmed : '';
    const timer = window.setTimeout(() => setSearch(next), 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const { stats, items, total, hasNext, loadingMore, error, refresh, loadMore } =
    useProspectorDashboardData(session, search);

  // Sheet do formulario: `open` controla intencao, `mounted` presenca no
  // DOM (delayed unmount de 400ms pro slide-down do BottomSheet terminar —
  // mesmo padrao do NewSampleModal em /samples).
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMounted, setSheetMounted] = useState(false);

  useEffect(() => {
    if (sheetOpen) {
      setSheetMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setSheetMounted(false), 400);
    return () => window.clearTimeout(timer);
  }, [sheetOpen]);

  // Deep link do lembrete push (?informe=novo): abre o sheet e limpa a URL
  // pra refresh/back nao reabrirem o formulario.
  useEffect(() => {
    if (searchParams.get('informe') === 'novo') {
      setSheetOpen(true);
      router.replace('/dashboard', { scroll: false });
    }
  }, [searchParams, router]);

  // Accordion da lista (multiplos cards podem ficar abertos — mesma UX do
  // /resumo).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((reportId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      return next;
    });
  }, []);

  // Chip de pendencias da fila offline — mesmo comportamento da pagina
  // /informe (contador segue o outbox via evento; "Enviar agora" quando
  // online). O resultado do flush e anunciado pelo listener global do
  // AppShell; o refresh da lista/cards vem pelo VISIT_SYNC_COMPLETED_EVENT.
  const [pendingCount, setPendingCount] = useState(0);
  const [manualSyncing, setManualSyncing] = useState(false);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await countVisitOutbox(session.user.id));
  }, [session]);

  useEffect(() => {
    void refreshPendingCount();
    const handleChanged = () => void refreshPendingCount();
    window.addEventListener(VISIT_OUTBOX_CHANGED_EVENT, handleChanged);
    return () => window.removeEventListener(VISIT_OUTBOX_CHANGED_EVENT, handleChanged);
  }, [refreshPendingCount]);

  async function handleManualSync() {
    if (manualSyncing) {
      return;
    }

    setManualSyncing(true);
    try {
      const result = await flushVisitOutbox(session);
      if (result.sent === 0 && result.failed === 0 && !result.authExpired && result.remaining > 0) {
        toast.error({
          title: 'Não foi possível enviar agora',
          description: 'Verifique sua conexão e tente novamente.',
        });
      }
    } finally {
      setManualSyncing(false);
    }
  }

  // Envio pelo sheet: online o servidor ja tem o informe — refetch imediato
  // de cards + lista. Offline (queued) nada mudou no servidor; o chip de
  // pendencias ja comunica e o refresh vem depois, com o sync.
  const handleSubmitted = useCallback(
    (info: { queued: boolean }) => {
      if (!info.queued) {
        void refresh();
      }
    },
    [refresh]
  );

  // Exclusao do proprio informe (lixeira do card): confirmacao em modal
  // central; confirmado, o informe some da lista e cards/contador refazem
  // a conta no servidor.
  const [deleteTarget, setDeleteTarget] = useState<VisitReportSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteTrapRef = useFocusTrap(deleteTarget !== null);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) {
      return;
    }

    setDeleting(true);
    try {
      await deleteVisitReport(session, deleteTarget.id);
      setDeleteTarget(null);
      toast.success({ title: 'Informe excluído' });
      void refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        // Ja sumiu no servidor (excluido em outra sessao do proprio autor):
        // alinha.
        setDeleteTarget(null);
        toast.info({ title: 'Informe já havia sido excluído' });
        void refresh();
      } else {
        toast.error({
          title: 'Não foi possível excluir',
          description: cause instanceof ApiError ? cause.message : 'Tente novamente.',
        });
      }
    } finally {
      setDeleting(false);
    }
  }, [session, deleteTarget, deleting, refresh, toast]);

  const fullName = session.user.fullName ?? session.user.username;
  const firstName = fullName.split(' ')[0];
  const roleLabel = getRoleLabel(session.user.role);
  const initials = getInitials(fullName);

  const listLoading = items === null && !error;
  const listEmpty = items !== null && items.length === 0;

  return (
    <div className="prospector-dashboard">
      <section className="dashboard-page">
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
          {/* Busca por nome do cliente — mesma posicao/visual da busca de
              lote do dashboard padrao (classes do sample-search-field). */}
          <div className="dashboard-hero-search">
            <div className="sample-search-field prospector-search-field">
              <input
                type="text"
                inputMode="search"
                autoComplete="off"
                placeholder="Buscar por cliente"
                aria-label="Buscar informes por nome do cliente"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <span className="sample-search-icon-button prospector-search-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.8-3.8" />
                </svg>
              </span>
            </div>
          </div>
        </section>

        <section className="dashboard-sheet">
          <section className="dashboard-sheet-section is-slot-operations">
            <div className="dashboard-section-heading">
              <h2 className="dashboard-section-title">Prospecção</h2>
            </div>
            {error && !stats ? <p className="error">{error}</p> : null}
            {stats ? (
              <div className="dashboard-operations-grid">
                <div className="dashboard-operation-card is-wide is-static">
                  <span className="dashboard-operation-icon-wrap" aria-hidden="true">
                    {/* Prancheta com check — visita registrada. */}
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <rect x="5.5" y="4" width="13" height="17" rx="2.2" />
                      <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
                      <path d="m9 13.5 2.3 2.3 4.4-5" />
                    </svg>
                  </span>
                  <span className="dashboard-operation-content">
                    <span className="dashboard-operation-title">Visitas</span>
                    <span className="dashboard-operation-divider" aria-hidden="true" />
                    <span className="dashboard-operation-subtitle">Hoje</span>
                  </span>
                  <span
                    className="dashboard-operation-badge"
                    aria-label={`${stats.todayCount} visitas enviadas hoje`}
                  >
                    {stats.todayCount}
                  </span>
                </div>

                <div className="dashboard-operation-card is-wide is-static">
                  <span className="dashboard-operation-icon-wrap" aria-hidden="true">
                    {/* Pessoa + sinal de adicionar — cliente novo prospectado. */}
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <circle cx="10" cy="8" r="3.5" />
                      <path d="M3.5 20a6.5 6.5 0 0 1 13 0" />
                      <path d="M18.5 11.5v6" />
                      <path d="M15.5 14.5h6" />
                    </svg>
                  </span>
                  <span className="dashboard-operation-content">
                    <span className="dashboard-operation-title">Clientes novos</span>
                    <span className="dashboard-operation-divider" aria-hidden="true" />
                    <span className="dashboard-operation-subtitle">Hoje</span>
                  </span>
                  <span
                    className="dashboard-operation-badge"
                    aria-label={`${stats.todayNewClientsCount} clientes novos hoje`}
                  >
                    {stats.todayNewClientsCount}
                  </span>
                </div>
              </div>
            ) : !error ? (
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
            ) : null}
          </section>

          <section className="dashboard-sheet-section dashboard-sheet-content is-slot-activities">
            <div className="dashboard-section-heading">
              <h2 className="dashboard-section-title">Últimos informes</h2>
            </div>

            {total !== null ? (
              <div className="prospector-list-meta">
                <span className="spv2-list-count">
                  {total} {total === 1 ? 'registro' : 'registros'}
                </span>
              </div>
            ) : null}

            {pendingCount > 0 ? (
              <div className="inf-pending" role="status">
                <span className="inf-pending-badge">{pendingCount}</span>
                <span className="inf-pending-text">
                  {pendingCount === 1 ? 'informe aguardando envio' : 'informes aguardando envio'}
                </span>
                {isOnline ? (
                  <button
                    type="button"
                    className="inf-pending-send"
                    disabled={manualSyncing}
                    onClick={() => void handleManualSync()}
                  >
                    {manualSyncing ? 'Enviando…' : 'Enviar agora'}
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* So esta area rola — hero, busca e cards de contagem ficam
                sempre visiveis (scroll interno, ver CSS). */}
            <div className="prospector-list-scroll">
              {listLoading ? (
                <div className="rsm-list" aria-hidden="true">
                  <div className="rsm-skeleton-card" />
                  <div className="rsm-skeleton-card" />
                  <div className="rsm-skeleton-card" />
                </div>
              ) : null}

              {error && (items?.length ?? 0) === 0 ? (
                <div className="rsm-empty">
                  <p className="rsm-empty-title">Não foi possível carregar os informes</p>
                  <p className="rsm-empty-sub">{error}</p>
                  <button type="button" className="rsm-retry-btn" onClick={() => void refresh()}>
                    Tentar novamente
                  </button>
                </div>
              ) : null}

              {listEmpty && !error ? (
                <div className="rsm-empty">
                  <span className="rsm-empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M4 13h4l2 3h4l2-3h4" />
                      <path d="M4 13V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
                      <path d="M4 13v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                    </svg>
                  </span>
                  {search ? (
                    <>
                      <p className="rsm-empty-title">Nenhum informe encontrado</p>
                      <p className="rsm-empty-sub">Nenhum cliente combina com a busca.</p>
                    </>
                  ) : (
                    <>
                      <p className="rsm-empty-title">Nenhum informe ainda</p>
                      <p className="rsm-empty-sub">
                        Toque no botão + para registrar sua primeira visita.
                      </p>
                    </>
                  )}
                </div>
              ) : null}

              {items && items.length > 0 ? (
                <div className="rsm-list">
                  {items.map((report) => (
                    <VisitReportCard
                      key={report.id}
                      report={report}
                      expanded={expandedIds.has(report.id)}
                      onToggle={() => toggleExpanded(report.id)}
                      quickDelete={report.user?.id === session.user.id}
                      onRequestDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              ) : null}

              {items && items.length > 0 && hasNext ? (
                <button
                  type="button"
                  className="rsm-load-more"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              ) : null}

              {error && items && items.length > 0 ? (
                <p className="rsm-feed-error">{error}</p>
              ) : null}
            </div>
          </section>
        </section>
      </section>

      {/* Botao central "+" — ocupa a posicao/tamanho do botao da camera da
          tabbar (que o prospector nao tem). */}
      <button
        type="button"
        className="prospector-fab"
        aria-label="Nova visita"
        onClick={() => setSheetOpen(true)}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>

      {sheetMounted ? (
        <VisitReportFormSheet
          open={sheetOpen}
          session={session}
          onClose={() => setSheetOpen(false)}
          onSubmitted={handleSubmitted}
        />
      ) : null}

      {/* Confirmacao de exclusao — portal pro body (skill modals; fora do
          contexto de empilhamento da pagina). */}
      {deleteTarget
        ? createPortal(
            <div
              className="app-modal-backdrop is-scrim-dark"
              onClick={() => {
                if (!deleting) {
                  setDeleteTarget(null);
                }
              }}
            >
              <section
                ref={deleteTrapRef}
                className="app-modal is-themed app-confirm-modal"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="prospector-delete-title"
                aria-describedby="prospector-delete-description"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="app-modal-content">
                  <div className="app-confirm-modal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17v.01" />
                    </svg>
                  </div>
                  <h3 id="prospector-delete-title" className="app-confirm-modal-title">
                    Excluir informe?
                  </h3>
                  <p id="prospector-delete-description" className="app-confirm-modal-message">
                    Esta ação não pode ser desfeita.
                  </p>
                </div>

                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={() => setDeleteTarget(null)}
                    disabled={deleting}
                    autoFocus
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="app-modal-submit is-danger"
                    onClick={() => void handleConfirmDelete()}
                    disabled={deleting}
                  >
                    {deleting ? 'Excluindo…' : 'Excluir'}
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
