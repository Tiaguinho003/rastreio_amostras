'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { HeaderAvatarMenu } from '../HeaderAvatarMenu';
import { InformeCreateFab } from './InformeCreateFab';
import { WeeklyReportCard } from './WeeklyReportCard';
import { VisitReportCard } from '../visits/VisitReportCard';
import {
  ApiError,
  cancelVisitReport,
  cancelWeeklyReport,
  listInformeFeed,
} from '../../lib/api-client';
import { isWeeklyReportAuthor } from '../../lib/roles';
import { useToast } from '../../lib/toast/ToastProvider';
import type { InformeFeedItem, SessionData } from '../../lib/types';

// Pagina "Relatorios" (rota /relatorios): feed COMBINADO (scope=all) de VISITA
// (unificada: prospector + comercial) + SEMANAL de TODOS os autores, mais
// recentes primeiro, com "Carregar mais". Cards accordion por tipo; so o autor
// CANCELA (soft) o proprio item — cancelado fica no historico, marcado. FAB de
// criacao: Visita (todos) + Semanal (so ADMIN + COMMERCIAL). Unificacao
// 2026-07-15 (curadoria de vinculo + fila offline removidas).

const PAGE_LIMIT = 20;

function cancelLabels(item: InformeFeedItem) {
  if (item.type === 'WEEKLY_REPORT') {
    return { title: 'Cancelar relatório?', success: 'Relatório cancelado' };
  }
  return { title: 'Cancelar visita?', success: 'Visita cancelada' };
}

interface RelatoriosViewerProps {
  session: SessionData;
  onLogout: () => void | Promise<void>;
  // Mostra o FAB de criacao (Visita p/ todos; Semanal so ADMIN + COMMERCIAL).
  canCreate: boolean;
}

export function RelatoriosViewer({ session, onLogout, canCreate }: RelatoriosViewerProps) {
  const toast = useToast();

  const [items, setItems] = useState<InformeFeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [cancelTarget, setCancelTarget] = useState<InformeFeedItem | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadPage = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      if (mode === 'replace') {
        setInitialLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const response = await listInformeFeed(session, { page: targetPage, limit: PAGE_LIMIT });
        setItems((current) =>
          mode === 'append' ? [...current, ...response.items] : response.items
        );
        setTotal(response.page.total);
        setHasNext(response.page.hasNext);
        setPage(response.page.page);
      } catch (cause) {
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Não foi possível carregar os relatórios. Verifique sua conexão.'
        );
      } finally {
        if (mode === 'replace') {
          setInitialLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [session]
  );

  useEffect(() => {
    void loadPage(1, 'replace');
  }, [loadPage]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Cancelamento soft: substitui o item na lista (fica marcado como "Cancelado").
  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget || cancelling) {
      return;
    }
    setCancelling(true);
    try {
      const updated =
        cancelTarget.type === 'WEEKLY_REPORT'
          ? (await cancelWeeklyReport(session, cancelTarget.id)).report
          : (await cancelVisitReport(session, cancelTarget.id)).report;
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      const label = cancelLabels(cancelTarget);
      setCancelTarget(null);
      toast.success({ title: label.success });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        setCancelTarget(null);
        void loadPage(1, 'replace');
        toast.info({ title: 'Este item já havia sido cancelado' });
      } else {
        toast.error({
          title: 'Não foi possível cancelar',
          description: cause instanceof ApiError ? cause.message : 'Tente novamente.',
        });
      }
    } finally {
      setCancelling(false);
    }
  }, [session, cancelTarget, cancelling, loadPage, toast]);

  const canCreateWeekly = isWeeklyReportAuthor(session.user.role);
  const userFullName = session.user.fullName ?? session.user.username;
  const userAvatarInitials = userFullName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const showEmpty = !initialLoading && !error && items.length === 0;

  return (
    <>
      <section className="sdv-page">
        <header className="sdv-header">
          <div className="sdv-header-top">
            <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <span className="sdv-header-title">Relatórios</span>
            <HeaderAvatarMenu session={session} onLogout={onLogout} />
            <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
              <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
            </Link>
          </div>
        </header>

        <section className="sdv-content informe-content rsm-content">
          <div className="rsm-feed">
            <header className="inf-intro rsm-intro">
              <div className="rsm-intro-text">
                <h2 className="inf-intro-title">Relatórios</h2>
              </div>
              {!initialLoading && !error ? (
                <span className="rsm-total-chip">
                  {total} {total === 1 ? 'envio' : 'envios'}
                </span>
              ) : null}
            </header>

            {initialLoading ? (
              <div className="rsm-list" aria-hidden="true">
                <div className="rsm-skeleton-card" />
                <div className="rsm-skeleton-card" />
                <div className="rsm-skeleton-card" />
              </div>
            ) : null}

            {error && items.length === 0 ? (
              <div className="rsm-empty">
                <p className="rsm-empty-title">Não foi possível carregar os relatórios</p>
                <p className="rsm-empty-sub">{error}</p>
                <button
                  type="button"
                  className="rsm-retry-btn"
                  onClick={() => void loadPage(1, 'replace')}
                >
                  Tentar novamente
                </button>
              </div>
            ) : null}

            {showEmpty ? (
              <div className="rsm-empty">
                <span className="rsm-empty-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M4 13h4l2 3h4l2-3h4" />
                    <path d="M4 13V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
                    <path d="M4 13v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                  </svg>
                </span>
                <p className="rsm-empty-title">Nenhum relatório ainda</p>
                <p className="rsm-empty-sub">As visitas e os relatórios semanais aparecem aqui.</p>
              </div>
            ) : null}

            {!initialLoading && items.length > 0 ? (
              <div className="rsm-list">
                {items.map((item) => {
                  if (item.type === 'WEEKLY_REPORT') {
                    return (
                      <WeeklyReportCard
                        key={item.id}
                        report={item}
                        expanded={expandedIds.has(item.id)}
                        onToggle={() => toggleExpanded(item.id)}
                        canDelete={item.user?.id === session.user.id}
                        onRequestDelete={() => setCancelTarget(item)}
                      />
                    );
                  }
                  return (
                    <VisitReportCard
                      key={item.id}
                      report={item}
                      expanded={expandedIds.has(item.id)}
                      onToggle={() => toggleExpanded(item.id)}
                      canDelete={item.user?.id === session.user.id}
                      onRequestDelete={() => setCancelTarget(item)}
                    />
                  );
                })}
              </div>
            ) : null}

            {!initialLoading && hasNext ? (
              <button
                type="button"
                className="rsm-load-more"
                disabled={loadingMore}
                onClick={() => void loadPage(page + 1, 'append')}
              >
                {loadingMore ? 'Carregando…' : 'Carregar mais'}
              </button>
            ) : null}

            {error && items.length > 0 ? <p className="rsm-feed-error">{error}</p> : null}
          </div>
        </section>

        {/* FAB de criacao — IRMAO de .sdv-content (fora do scroller). */}
        {canCreate ? (
          <div className="rsm-fab-anchor">
            <InformeCreateFab
              session={session}
              canCreateWeekly={canCreateWeekly}
              onSubmitted={() => void loadPage(1, 'replace')}
            />
          </div>
        ) : null}
      </section>

      {cancelTarget ? (
        <div
          className="app-modal-backdrop is-scrim-dark"
          onClick={() => {
            if (!cancelling) {
              setCancelTarget(null);
            }
          }}
        >
          <section
            className="app-modal is-themed app-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="rsm-cancel-title"
            aria-describedby="rsm-cancel-description"
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
              <h3 id="rsm-cancel-title" className="app-confirm-modal-title">
                {cancelLabels(cancelTarget).title}
              </h3>
              <p id="rsm-cancel-description" className="app-confirm-modal-message">
                Ele fica no histórico marcado como “Cancelado”. Se errou, cancele e envie outro.
              </p>
            </div>

            <div className="app-modal-actions">
              <button
                type="button"
                className="app-modal-secondary"
                onClick={() => setCancelTarget(null)}
                disabled={cancelling}
                autoFocus
              >
                Voltar
              </button>
              <button
                type="button"
                className="app-modal-submit is-danger"
                onClick={() => void handleConfirmCancel()}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelando…' : 'Cancelar'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
