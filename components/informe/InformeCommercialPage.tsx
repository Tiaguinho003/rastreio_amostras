'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { HeaderAvatarMenu } from '../HeaderAvatarMenu';
import { CommercialVisitCard } from './CommercialVisitCard';
import { CommercialVisitFormSheet } from './CommercialVisitFormSheet';
import { InformeCreateRadialFab } from './InformeCreateRadialFab';
import { WeeklyReportCard } from './WeeklyReportCard';
import { WeeklyReportFormSheet } from './WeeklyReportFormSheet';
import {
  ApiError,
  deleteCommercialVisit,
  deleteWeeklyReport,
  listInformeFeed,
} from '../../lib/api-client';
import { useToast } from '../../lib/toast/ToastProvider';
import type { InformeFeedItem, SessionData } from '../../lib/types';
import { useFocusTrap } from '../../lib/use-focus-trap';

// Pagina /informe do papel COMMERCIAL (e ADMIN) — shell espelhando a
// /samples (header + faixa verde + sheet bege com contador e lista),
// SEM busca/filtros nesta entrega. FAB radial de LAPIS abre os dois
// formularios ("Visitas" e "Relatorio") em BottomSheets; o feed lista
// apenas os envios do PROPRIO usuario (scope=mine), tipos misturados em
// ordem cronologica com badge, lixeira por item (autor exclui o proprio).

const PAGE_LIMIT = 20;

interface InformeCommercialPageProps {
  session: SessionData;
  onLogout: () => void | Promise<void>;
}

export function InformeCommercialPage({ session, onLogout }: InformeCommercialPageProps) {
  const toast = useToast();

  const [items, setItems] = useState<InformeFeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accordion: multiplos cards podem ficar abertos (mesma UX do /resumo).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const loadPage = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      if (mode === 'replace') {
        setInitialLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const response = await listInformeFeed(session, {
          scope: 'mine',
          page: targetPage,
          limit: PAGE_LIMIT,
        });
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
            : 'Não foi possível carregar os formulários. Verifique sua conexão.'
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

  const toggleExpanded = useCallback((itemId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  // Sheets dos formularios: `open` controla intencao, `mounted` presenca
  // no DOM (delayed unmount de 400ms pro slide-down do BottomSheet).
  const [visitSheetOpen, setVisitSheetOpen] = useState(false);
  const [visitSheetMounted, setVisitSheetMounted] = useState(false);
  const [weeklySheetOpen, setWeeklySheetOpen] = useState(false);
  const [weeklySheetMounted, setWeeklySheetMounted] = useState(false);

  useEffect(() => {
    if (visitSheetOpen) {
      setVisitSheetMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setVisitSheetMounted(false), 400);
    return () => window.clearTimeout(timer);
  }, [visitSheetOpen]);

  useEffect(() => {
    if (weeklySheetOpen) {
      setWeeklySheetMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setWeeklySheetMounted(false), 400);
    return () => window.clearTimeout(timer);
  }, [weeklySheetOpen]);

  const handleSubmitted = useCallback(() => {
    void loadPage(1, 'replace');
  }, [loadPage]);

  // Exclusao com confirmacao central; despacha o delete pelo type.
  const [deleteTarget, setDeleteTarget] = useState<InformeFeedItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteTrapRef = useFocusTrap(deleteTarget !== null);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) {
      return;
    }

    setDeleting(true);
    try {
      if (deleteTarget.type === 'COMMERCIAL_VISIT') {
        await deleteCommercialVisit(session, deleteTarget.id);
      } else if (deleteTarget.type === 'WEEKLY_REPORT') {
        await deleteWeeklyReport(session, deleteTarget.id);
      }
      setDeleteTarget(null);
      toast.success({
        title: deleteTarget.type === 'WEEKLY_REPORT' ? 'Relatório excluído' : 'Visita excluída',
      });
      void loadPage(1, 'replace');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        // Ja sumiu no servidor (excluido pelo admin no /resumo): alinha.
        setDeleteTarget(null);
        toast.info({ title: 'Este envio já havia sido excluído' });
        void loadPage(1, 'replace');
      } else {
        toast.error({
          title: 'Não foi possível excluir',
          description: cause instanceof ApiError ? cause.message : 'Tente novamente.',
        });
      }
    } finally {
      setDeleting(false);
    }
  }, [session, deleteTarget, deleting, loadPage, toast]);

  const userFullName = session.user.fullName ?? session.user.username;
  const avatarInitials = userFullName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const showEmpty = !initialLoading && !error && items.length === 0;

  return (
    <section className="samples-page-v2 informe-commercial-page">
      <header className="samples-page-v2-header">
        <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="samples-page-v2-header-center">
          <h2 className="nsv2-title">Informe</h2>
        </div>
        <HeaderAvatarMenu session={session} onLogout={onLogout} />
        <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
          <span className="nsv2-avatar-initials">{avatarInitials}</span>
        </Link>
      </header>

      {/* Faixa verde da /samples sem a barra de busca — so respiro + FAB
          (o FAB e position: fixed; o wrap da a area verde da pagina). */}
      <div className="hero-search-wrap is-informe">
        <InformeCreateRadialFab
          onCreateVisit={() => setVisitSheetOpen(true)}
          onCreateWeeklyReport={() => setWeeklySheetOpen(true)}
        />
      </div>

      <section className="samples-page-v2-sheet">
        <div className="spv2-list-meta">
          <span className="spv2-list-count">
            {total} {total === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        <div className="spv2-list-scroll">
          {initialLoading ? (
            <div className="rsm-list" aria-hidden="true">
              <div className="rsm-skeleton-card" />
              <div className="rsm-skeleton-card" />
              <div className="rsm-skeleton-card" />
            </div>
          ) : null}

          {error && items.length === 0 ? (
            <div className="rsm-empty">
              <p className="rsm-empty-title">Não foi possível carregar os formulários</p>
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
                  <rect x="5.5" y="4" width="13" height="17" rx="2.2" />
                  <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
                  <path d="M9 12h6" />
                  <path d="M9 15.5h4" />
                </svg>
              </span>
              <p className="rsm-empty-title">Nenhum formulário enviado ainda</p>
              <p className="rsm-empty-sub">
                Toque no lápis para registrar uma visita ou enviar o relatório da semana.
              </p>
            </div>
          ) : null}

          {!initialLoading && items.length > 0 ? (
            <div className="rsm-list">
              {items.map((item) => {
                if (item.type === 'COMMERCIAL_VISIT') {
                  return (
                    <CommercialVisitCard
                      key={item.id}
                      visit={item}
                      expanded={expandedIds.has(item.id)}
                      onToggle={() => toggleExpanded(item.id)}
                      quickDelete
                      onRequestDelete={setDeleteTarget}
                    />
                  );
                }
                if (item.type === 'WEEKLY_REPORT') {
                  return (
                    <WeeklyReportCard
                      key={item.id}
                      report={item}
                      expanded={expandedIds.has(item.id)}
                      onToggle={() => toggleExpanded(item.id)}
                      quickDelete
                      onRequestDelete={setDeleteTarget}
                    />
                  );
                }
                // scope=mine nao retorna VISIT_REPORT — defensivo.
                return null;
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

      {visitSheetMounted ? (
        <CommercialVisitFormSheet
          open={visitSheetOpen}
          session={session}
          onClose={() => setVisitSheetOpen(false)}
          onSubmitted={handleSubmitted}
        />
      ) : null}

      {weeklySheetMounted ? (
        <WeeklyReportFormSheet
          open={weeklySheetOpen}
          session={session}
          onClose={() => setWeeklySheetOpen(false)}
          onSubmitted={handleSubmitted}
        />
      ) : null}

      {/* Confirmacao de exclusao — portal pro body (skill modals). */}
      {deleteTarget
        ? createPortal(
            <div
              className="app-modal-backdrop"
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
                aria-labelledby="informe-delete-title"
                aria-describedby="informe-delete-description"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="informe-delete-title" className="app-modal-title">
                      {deleteTarget.type === 'WEEKLY_REPORT'
                        ? 'Excluir relatório?'
                        : 'Excluir visita?'}
                    </h3>
                  </div>
                </header>

                <div className="app-modal-content">
                  <div className="app-confirm-modal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17v.01" />
                    </svg>
                  </div>
                  <p id="informe-delete-description" className="app-confirm-modal-message">
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
    </section>
  );
}
