'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { ClientLookupField } from '../../components/clients/ClientLookupField';
import { ClientQuickCreateModal } from '../../components/clients/ClientQuickCreateModal';
import { CommercialVisitCard } from '../../components/informe/CommercialVisitCard';
import { WeeklyReportCard } from '../../components/informe/WeeklyReportCard';
import { VisitReportCard, type VisitLinkAction } from '../../components/visits/VisitReportCard';
import {
  ApiError,
  deleteCommercialVisit,
  deleteVisitReport,
  deleteWeeklyReport,
  linkVisitReportClient,
  listInformeFeed,
} from '../../lib/api-client';
import { isAdmin, isVisitLinkCurator } from '../../lib/roles';
import { useToast } from '../../lib/toast/ToastProvider';
import type { ClientSummary, InformeFeedItem, VisitReportSummary } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';
import { useFocusTrap } from '../../lib/use-focus-trap';

// Pagina "Resumo" (Administracao + Comercial + Cadastro — ver
// isVisitReportViewer; acessada pelo menu do avatar e pelas notificacoes
// situacionais de visita): feed COMBINADO dos 3 tipos de formulario —
// informe do prospector (badge Prospeccao), visita do comercial (Visita)
// e relatorio semanal (Relatorio) — de todos os autores, mais recentes
// primeiro, com "Carregar mais" (append). Cards sao accordions por tipo;
// admin pode excluir qualquer item (autor-ou-admin no backend).
// CURADORIA do vinculo (so informes de prospeccao): ADM/Cadastro vinculam
// o informe a um cliente do cadastro (modal com lookup pre-carregado com o
// nome anotado), cadastram-e-vinculam (ClientQuickCreateModal prefilled) ou
// removem o vinculo. Backend: GET /informe-feed?scope=all +
// PATCH /visit-reports/:id/client.

const PAGE_LIMIT = 20;

// Mensagens pt-BR pros erros conhecidos do vinculo (backend fala ingles).
function translateLinkError(cause: unknown): string {
  if (cause instanceof ApiError) {
    const code =
      cause.details && typeof cause.details === 'object'
        ? (cause.details as { code?: string }).code
        : undefined;
    if (code === 'VISIT_CLIENT_INACTIVE') return 'Este cliente está inativo no cadastro.';
    if (code === 'VISIT_CLIENT_NOT_FOUND') return 'Cliente não encontrado no cadastro.';
    if (cause.status === 403) return 'Sem permissão para esta ação.';
    if (cause.status === 0) return 'Sem conexão com o servidor. Verifique sua internet.';
  }
  return 'Tente novamente.';
}

function deleteLabels(item: InformeFeedItem) {
  if (item.type === 'COMMERCIAL_VISIT') {
    return { title: 'Excluir visita?', success: 'Visita excluída' };
  }
  if (item.type === 'WEEKLY_REPORT') {
    return { title: 'Excluir relatório?', success: 'Relatório excluído' };
  }
  return { title: 'Excluir informe?', success: 'Informe excluído' };
}

export default function ResumoPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: ['ADMIN', 'COMMERCIAL', 'CADASTRO'],
  });
  const toast = useToast();

  const [items, setItems] = useState<InformeFeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accordion: ids dos cards expandidos (toggle independente por card).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Exclusao (admin): item alvo do modal de confirmacao + request em voo.
  const [deleteTarget, setDeleteTarget] = useState<InformeFeedItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Curadoria do vinculo (ADM/Cadastro): informe alvo + modo do fluxo
  // ('lookup' = modal de busca; 'create' = ClientQuickCreateModal).
  const [linkTarget, setLinkTarget] = useState<{
    report: VisitReportSummary;
    mode: 'lookup' | 'create';
  } | null>(null);
  const [linkClient, setLinkClient] = useState<ClientSummary | null>(null);
  // Prefill do cadastro rapido: nome digitado no lookup (se veio do estado
  // vazio "Cadastrar e vincular") ou o nome anotado pelo prospector.
  const [linkCreateName, setLinkCreateName] = useState('');
  const [linking, setLinking] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<VisitReportSummary | null>(null);

  const linkModalFocusTrapRef = useFocusTrap(linkTarget?.mode === 'lookup');

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
        const response = await listInformeFeed(session, {
          scope: 'all',
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

  // Substitui o informe na lista pelo retorno do PATCH de vinculo (mesma
  // view do feed; so recarimba o discriminante type).
  const upsertReport = useCallback((updated: VisitReportSummary) => {
    setItems((current) =>
      current.map((item) =>
        item.type === 'VISIT_REPORT' && item.id === updated.id
          ? { ...updated, type: 'VISIT_REPORT' as const }
          : item
      )
    );
  }, []);

  const closeLinkFlow = useCallback(() => {
    setLinkTarget(null);
    setLinkClient(null);
    setLinkCreateName('');
    setUnlinkTarget(null);
  }, []);

  const handleLinkAction = useCallback((report: VisitReportSummary, action: VisitLinkAction) => {
    if (action === 'unlink') {
      setUnlinkTarget(report);
      return;
    }
    setLinkClient(null);
    setLinkCreateName(report.newClient?.name ?? '');
    setLinkTarget({ report, mode: action === 'create' ? 'create' : 'lookup' });
  }, []);

  // Vincula (clientId) ou desvincula (null) e reflete a resposta na lista.
  const performLink = useCallback(
    async (report: VisitReportSummary, clientId: string | null) => {
      if (!session || linking) {
        return;
      }

      setLinking(true);
      try {
        const response = await linkVisitReportClient(session, report.id, clientId);
        upsertReport(response.report);
        closeLinkFlow();
        toast.success({
          title: clientId ? 'Cliente vinculado' : 'Vínculo removido',
          description: clientId
            ? `Informe vinculado a ${response.report.client?.displayName ?? 'cliente'}.`
            : 'O informe voltou para aguardando vínculo.',
        });
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 404) {
          // Informe sumiu no servidor (excluido em outra sessao).
          removeFromList(report.id);
          closeLinkFlow();
          toast.info({ title: 'Este informe já havia sido excluído' });
        } else {
          toast.error({
            title: clientId ? 'Não foi possível vincular' : 'Não foi possível remover o vínculo',
            description: translateLinkError(cause),
          });
        }
      } finally {
        setLinking(false);
      }
    },
    [session, linking, upsertReport, closeLinkFlow, removeFromList, toast]
  );

  // ESC fecha o modal de vinculo (useFocusTrap so captura Tab).
  useEffect(() => {
    if (linkTarget?.mode !== 'lookup') {
      return;
    }
    function handleEsc(event: KeyboardEvent) {
      if (event.key === 'Escape' && !linking) {
        closeLinkFlow();
      }
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [linkTarget, linking, closeLinkFlow]);

  const handleConfirmDelete = useCallback(async () => {
    if (!session || !deleteTarget || deleting) {
      return;
    }

    setDeleting(true);
    try {
      // Despacha o delete pelo tipo do item.
      if (deleteTarget.type === 'COMMERCIAL_VISIT') {
        await deleteCommercialVisit(session, deleteTarget.id);
      } else if (deleteTarget.type === 'WEEKLY_REPORT') {
        await deleteWeeklyReport(session, deleteTarget.id);
      } else {
        await deleteVisitReport(session, deleteTarget.id);
      }
      removeFromList(deleteTarget.id);
      setDeleteTarget(null);
      toast.success({ title: deleteLabels(deleteTarget).success });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        // Ja sumiu no servidor (excluido em outra sessao): alinha a lista.
        removeFromList(deleteTarget.id);
        setDeleteTarget(null);
        toast.info({ title: 'Este envio já havia sido excluído' });
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
  const canLinkClient = isVisitLinkCurator(session.user.role);

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
                <h2 className="inf-intro-title">Informes</h2>
                <p className="inf-intro-sub">Formulários da equipe, mais recentes primeiro.</p>
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
                {items.map((item) => {
                  if (item.type === 'COMMERCIAL_VISIT') {
                    return (
                      <CommercialVisitCard
                        key={item.id}
                        visit={item}
                        expanded={expandedIds.has(item.id)}
                        onToggle={() => toggleExpanded(item.id)}
                        canDelete={canDelete}
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
                        canDelete={canDelete}
                        onRequestDelete={setDeleteTarget}
                      />
                    );
                  }
                  return (
                    <VisitReportCard
                      key={item.id}
                      report={item}
                      typeBadge="Prospecção"
                      expanded={expandedIds.has(item.id)}
                      onToggle={() => toggleExpanded(item.id)}
                      canDelete={canDelete}
                      showLinkStatus
                      canLinkClient={canLinkClient}
                      onLinkAction={handleLinkAction}
                      onRequestDelete={() => setDeleteTarget(item)}
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
                  {deleteLabels(deleteTarget).title}
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

      {/* Vincular cliente — lookup pre-carregado com o nome anotado; o
          estado vazio do dropdown oferece "Cadastrar e vincular". */}
      {linkTarget?.mode === 'lookup'
        ? createPortal(
            <div
              className="app-modal-backdrop"
              onClick={() => {
                if (!linking) {
                  closeLinkFlow();
                }
              }}
            >
              <section
                ref={linkModalFocusTrapRef}
                className="app-modal is-themed sample-detail-lookup-modal rsm-link-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="rsm-link-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="rsm-link-title" className="app-modal-title">
                      {linkTarget.report.client ? 'Alterar vínculo' : 'Vincular cliente'}
                    </h3>
                    <p className="app-modal-description">
                      Escolha o cliente do cadastro para este informe.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="app-modal-close"
                    onClick={closeLinkFlow}
                    disabled={linking}
                    aria-label="Fechar"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </header>

                <form
                  className="app-modal-content"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (linkClient && !linking) {
                      void performLink(linkTarget.report, linkClient.id);
                    }
                  }}
                >
                  {linkTarget.report.newClient?.name ? (
                    <div className="rsm-link-context">
                      <span className="rsm-link-context-label">Anotado pelo prospector</span>
                      <p className="rsm-link-context-name">{linkTarget.report.newClient.name}</p>
                      {linkTarget.report.newClient.city || linkTarget.report.newClient.phone ? (
                        <p className="rsm-link-context-meta">
                          {[linkTarget.report.newClient.city, linkTarget.report.newClient.phone]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <ClientLookupField
                    session={session}
                    label="Cliente do cadastro"
                    kind="any"
                    required
                    selectedClient={linkClient}
                    onSelectClient={setLinkClient}
                    initialSearch={linkTarget.report.newClient?.name ?? ''}
                    maxResults={10}
                    onRequestCreate={(search) => {
                      setLinkCreateName(search || (linkTarget.report.newClient?.name ?? ''));
                      setLinkTarget({ report: linkTarget.report, mode: 'create' });
                    }}
                    createLabel="Cadastrar e vincular"
                    createButtonStyle="inline-cta"
                  />

                  <div className="app-modal-actions">
                    <button
                      type="submit"
                      className="app-modal-submit"
                      disabled={!linkClient || linking}
                    >
                      {linking ? 'Vinculando…' : 'Vincular'}
                    </button>
                    <button
                      type="button"
                      className="app-modal-secondary"
                      onClick={closeLinkFlow}
                      disabled={linking}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )
        : null}

      {/* Cadastrar e vincular — cria o cliente (prefill com o anotado) e
          vincula na sequencia (onCreated -> performLink). */}
      {linkTarget?.mode === 'create' ? (
        <ClientQuickCreateModal
          session={session}
          open
          title="Cadastrar e vincular"
          initialSearch={linkCreateName}
          initialPersonType="PF"
          initialIsSeller
          initialIsBuyer={false}
          initialPhone={linkTarget.report.newClient?.phone ?? undefined}
          onClose={closeLinkFlow}
          onCreated={(client) => {
            void performLink(linkTarget.report, client.id);
          }}
        />
      ) : null}

      {/* Remover vinculo — confirmacao; o informe volta a aguardando
          vinculo (re-vinculavel, por isso is-warning e nao is-danger). */}
      {unlinkTarget
        ? createPortal(
            <div
              className="app-modal-backdrop"
              onClick={() => {
                if (!linking) {
                  setUnlinkTarget(null);
                }
              }}
            >
              <section
                className="app-modal is-themed app-confirm-modal"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="rsm-unlink-title"
                aria-describedby="rsm-unlink-description"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="rsm-unlink-title" className="app-modal-title">
                      Remover vínculo?
                    </h3>
                  </div>
                </header>

                <div className="app-modal-content">
                  <div className="app-confirm-modal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                      <path d="m3 3 18 18" />
                    </svg>
                  </div>
                  <p id="rsm-unlink-description" className="app-confirm-modal-message">
                    O informe volta para “aguardando vínculo”. Você pode vincular de novo depois.
                  </p>
                </div>

                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={() => setUnlinkTarget(null)}
                    disabled={linking}
                    autoFocus
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="app-modal-submit is-warning"
                    onClick={() => void performLink(unlinkTarget, null)}
                    disabled={linking}
                  >
                    {linking ? 'Removendo…' : 'Remover'}
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </AppShell>
  );
}
