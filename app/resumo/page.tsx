'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { VisitReportCard } from '../../components/visits/VisitReportCard';
import { ApiError, deleteVisitReport, listVisitReports } from '../../lib/api-client';
import { isAdmin } from '../../lib/roles';
import { useToast } from '../../lib/toast/ToastProvider';
import type { VisitReportSummary } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';

// Pagina "Resumo" (Administracao + Comercial + Cadastro — ver
// isVisitReportViewer; acessada pelo menu do avatar e pelas notificacoes
// situacionais de visita): feed dos informes enviados pela equipe na pagina
// /informe. Mais recentes primeiro, com "Carregar mais" (append) no rodape.
// Cards sao accordions (components/visits/VisitReportCard, compartilhado
// com o dashboard do prospector): colapsados mostram so cabecalho +
// cliente; o clique expande revelando as respostas e, para admin, o
// "Excluir informe" (DELETE /visit-reports/:id e admin-only no backend).
// Backend: GET /visit-reports (VISIT_REPORT_VIEWER_ROLES no service).

const PAGE_LIMIT = 20;

export default function ResumoPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: ['ADMIN', 'COMMERCIAL', 'CADASTRO'],
  });
  const toast = useToast();

  const [items, setItems] = useState<VisitReportSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accordion: ids dos cards expandidos (toggle independente por card).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Exclusao (admin): informe alvo do modal de confirmacao + request em voo.
  const [deleteTarget, setDeleteTarget] = useState<VisitReportSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPage = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      if (!session) {
        return;
      }

      if (mode === 'replace') {
        setInitialLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const response = await listVisitReports(session, { page: targetPage, limit: PAGE_LIMIT });
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
            : 'Não foi possível carregar os informes. Verifique sua conexão.'
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
    if (session) {
      void loadPage(1, 'replace');
    }
  }, [session, loadPage]);

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

  const removeFromList = useCallback((reportId: string) => {
    setItems((current) => current.filter((item) => item.id !== reportId));
    setTotal((current) => Math.max(0, current - 1));
    setExpandedIds((current) => {
      if (!current.has(reportId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(reportId);
      return next;
    });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!session || !deleteTarget || deleting) {
      return;
    }

    setDeleting(true);
    try {
      await deleteVisitReport(session, deleteTarget.id);
      removeFromList(deleteTarget.id);
      setDeleteTarget(null);
      toast.success({ title: 'Informe excluído' });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        // Ja sumiu no servidor (excluido em outra sessao): alinha a lista.
        removeFromList(deleteTarget.id);
        setDeleteTarget(null);
        toast.info({ title: 'Informe já havia sido excluído' });
      } else {
        toast.error({
          title: 'Não foi possível excluir',
          description: cause instanceof ApiError ? cause.message : 'Tente novamente.',
        });
      }
    } finally {
      setDeleting(false);
    }
  }, [session, deleteTarget, deleting, removeFromList, toast]);

  if (loading || !session) {
    return null;
  }

  const canDelete = isAdmin(session.user.role);

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
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="sdv-page">
        <header className="sdv-header">
          <div className="sdv-header-top">
            <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <span className="sdv-header-title">Resumo</span>
            <HeaderAvatarMenu session={session} onLogout={logout} />
            <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
              <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
            </Link>
          </div>
        </header>

        <section className="sdv-content informe-content">
          <div className="rsm-feed">
            <header className="inf-intro rsm-intro">
              <div className="rsm-intro-text">
                <h2 className="inf-intro-title">Informes de visita</h2>
                <p className="inf-intro-sub">Envios da equipe, mais recentes primeiro.</p>
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
                <p className="rsm-empty-title">Não foi possível carregar os informes</p>
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
                <p className="rsm-empty-title">Nenhum informe ainda</p>
                <p className="rsm-empty-sub">Os envios do formulário de visita aparecem aqui.</p>
              </div>
            ) : null}

            {!initialLoading && items.length > 0 ? (
              <div className="rsm-list">
                {items.map((report) => (
                  <VisitReportCard
                    key={report.id}
                    report={report}
                    expanded={expandedIds.has(report.id)}
                    onToggle={() => toggleExpanded(report.id)}
                    canDelete={canDelete}
                    onRequestDelete={setDeleteTarget}
                  />
                ))}
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
      </section>

      {deleteTarget ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            if (!deleting) {
              setDeleteTarget(null);
            }
          }}
        >
          <section
            className="app-modal is-themed app-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="rsm-delete-title"
            aria-describedby="rsm-delete-description"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="rsm-delete-title" className="app-modal-title">
                  Excluir informe?
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
              <p id="rsm-delete-description" className="app-confirm-modal-message">
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
        </div>
      ) : null}
    </AppShell>
  );
}
