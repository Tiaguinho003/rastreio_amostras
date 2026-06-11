'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { HeaderAvatarMenu } from '../../HeaderAvatarMenu';
import { VisitReportCard } from '../../visits/VisitReportCard';
import { VisitReportFormSheet } from '../../visits/VisitReportFormSheet';
import { flushVisitOutbox } from '../../../lib/offline/visit-sync';
import { countVisitOutbox, VISIT_OUTBOX_CHANGED_EVENT } from '../../../lib/offline/visit-outbox';
import { useOnlineStatus } from '../../../lib/offline/use-online-status';
import { getRoleLabel } from '../../../lib/roles';
import { useToast } from '../../../lib/toast/ToastProvider';
import type { SessionData } from '../../../lib/types';
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

  const { stats, items, hasNext, loadingMore, error, refresh, loadMore } =
    useProspectorDashboardData(session);

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
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <rect x="5.5" y="3.5" width="13" height="17" rx="2.2" />
                      <path d="M9 8h6" />
                      <path d="M9 11.5h6" />
                      <path d="M9 15h4" />
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
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <circle cx="10" cy="8" r="4" />
                      <path d="M3 21c0-3.9 3.1-7 7-7 1.2 0 2.4 0.3 3.4 0.9" />
                      <path d="M18 14v6" />
                      <path d="M15 17h6" />
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
                <p className="rsm-empty-title">Nenhum informe ainda</p>
                <p className="rsm-empty-sub">
                  Toque no botão + para registrar sua primeira visita.
                </p>
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

            {error && items && items.length > 0 ? <p className="rsm-feed-error">{error}</p> : null}
          </section>
        </section>
      </section>

      {/* Botao central "+" — ocupa a posicao/tamanho do botao da camera da
          tabbar (que o prospector nao tem). */}
      <button
        type="button"
        className="prospector-fab"
        aria-label="Novo informe de visita"
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
    </div>
  );
}
