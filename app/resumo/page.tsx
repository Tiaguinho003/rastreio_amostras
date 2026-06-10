'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { UserAvatar } from '../../components/UserAvatar';
import { ApiError, deleteVisitReport, listVisitReports } from '../../lib/api-client';
import { isAdmin } from '../../lib/roles';
import { useToast } from '../../lib/toast/ToastProvider';
import type { VisitReportSummary } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';
import { getVisitFarmSizeLabel, getVisitInterestDetailLabel } from '../../lib/visit-report';

// Pagina "Resumo" (Administracao + Comercial + Cadastro — ver
// isVisitReportViewer; acessada pelo menu do avatar e pelas notificacoes
// situacionais de visita): feed dos informes enviados pela equipe na pagina
// /informe. Mais recentes primeiro, com "Carregar mais" (append) no rodape.
// Cards sao accordions: colapsados mostram so cabecalho + cliente; o clique
// expande revelando as respostas e, para admin, o "Excluir informe"
// (DELETE /visit-reports/:id e admin-only no backend).
// Backend: GET /visit-reports (VISIT_REPORT_VIEWER_ROLES no service).

const PAGE_LIMIT = 20;

// Acima disso entre o preenchimento (capturedAt, fila offline) e a chegada
// ao servidor (createdAt), o card ganha o marcador "enviado depois".
const OFFLINE_GAP_MS = 5 * 60 * 1000;

function formatVisitDateTime(value: string): string {
  const date = new Date(value);
  const day = date.toLocaleDateString('pt-BR');
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

function wasSentLater(report: VisitReportSummary): boolean {
  if (!report.capturedAt) {
    return false;
  }

  const gap = new Date(report.createdAt).getTime() - new Date(report.capturedAt).getTime();
  return Number.isFinite(gap) && gap > OFFLINE_GAP_MS;
}

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
                {items.map((report) => {
                  const isNewClient = report.clientKind === 'NEW';
                  const clientName = isNewClient
                    ? (report.newClient?.name ?? '—')
                    : (report.client?.displayName ?? '—');
                  const clientMeta = isNewClient
                    ? [report.newClient?.city, report.newClient?.phone].filter(Boolean).join(' · ')
                    : report.client
                      ? `Código ${report.client.code}`
                      : null;
                  const isExpanded = expandedIds.has(report.id);

                  return (
                    <article
                      key={report.id}
                      className={`rsm-card${isExpanded ? ' is-expanded' : ''}`}
                    >
                      <button
                        type="button"
                        className="rsm-card-toggle"
                        aria-expanded={isExpanded}
                        onClick={() => toggleExpanded(report.id)}
                      >
                        <header className="rsm-card-head">
                          <UserAvatar
                            size="sm"
                            user={{
                              fullName: report.user?.fullName ?? report.user?.username ?? '—',
                              username: report.user?.username ?? '—',
                            }}
                          />
                          <div className="rsm-card-head-text">
                            <p className="rsm-card-user">
                              {report.user?.fullName ?? report.user?.username ?? 'Usuário'}
                            </p>
                            <p className="rsm-card-when">
                              {formatVisitDateTime(report.capturedAt ?? report.createdAt)}
                              {wasSentLater(report) ? (
                                <span
                                  className="rsm-offline-tag"
                                  title={`Recebido em ${formatVisitDateTime(report.createdAt)}`}
                                >
                                  enviado depois
                                </span>
                              ) : null}
                            </p>
                          </div>
                        </header>

                        <div className="rsm-card-client">
                          <span
                            className={`rsm-client-icon${isNewClient ? ' is-new' : ''}`}
                            aria-hidden="true"
                          >
                            {isNewClient ? (
                              <svg viewBox="0 0 24 24" focusable="false">
                                <circle cx="10" cy="8" r="4" />
                                <path d="M3 21c0-3.9 3.1-7 7-7 1.2 0 2.4 0.3 3.4 0.9" />
                                <path d="M18 14v6" />
                                <path d="M15 17h6" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" focusable="false">
                                <circle cx="12" cy="8" r="4" />
                                <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
                              </svg>
                            )}
                          </span>
                          <div className="rsm-card-client-text">
                            <p className="rsm-client-name">
                              {clientName}
                              {isNewClient ? (
                                <span className="rsm-client-tag">Cliente novo</span>
                              ) : null}
                            </p>
                            {clientMeta ? <p className="rsm-client-meta">{clientMeta}</p> : null}
                          </div>
                          <span className="rsm-card-chevron" aria-hidden="true">
                            <svg viewBox="0 0 24 24" focusable="false">
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </span>
                        </div>
                      </button>

                      <div className="rsm-card-details">
                        <div className="rsm-card-details-inner">
                          <dl className="rsm-answers">
                            <div className="rsm-answer">
                              <dt>Tamanho da fazenda</dt>
                              <dd>{getVisitFarmSizeLabel(report.farmSize)}</dd>
                              {report.farmSizeNotes ? (
                                <dd className="rsm-answer-notes">“{report.farmSizeNotes}”</dd>
                              ) : null}
                            </div>
                            <div className="rsm-answer">
                              <dt>Interesse em comercializar</dt>
                              <dd>{getVisitInterestDetailLabel(report.interestLevel)}</dd>
                              {report.interestNotes ? (
                                <dd className="rsm-answer-notes">“{report.interestNotes}”</dd>
                              ) : null}
                            </div>
                            <div className="rsm-answer">
                              <dt>Já comercializa</dt>
                              <dd>
                                {report.sellsCurrently
                                  ? report.sellsToWhom
                                    ? `Sim — ${report.sellsToWhom}`
                                    : 'Sim'
                                  : 'Não'}
                              </dd>
                            </div>
                            {report.generalNotes !== null ? (
                              <div className="rsm-answer">
                                <dt>Observações gerais</dt>
                                <dd>{report.generalNotes}</dd>
                              </div>
                            ) : null}
                          </dl>

                          {canDelete ? (
                            <button
                              type="button"
                              className="rsm-delete-btn"
                              tabIndex={isExpanded ? undefined : -1}
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeleteTarget(report);
                              }}
                            >
                              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                <path d="M3 6h18" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                              Excluir informe
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
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
