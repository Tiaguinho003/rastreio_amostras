'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { UserAvatar } from '../../components/UserAvatar';
import { ApiError, listVisitReports } from '../../lib/api-client';
import type { VisitReportSummary } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';
import { getVisitFarmSizeLabel, getVisitInterestDetailLabel } from '../../lib/visit-report';

// Pagina "Resumo" (Administracao + Comercial + Cadastro — ver
// isVisitReportViewer; acessada pelo menu do avatar e pelas notificacoes
// situacionais de visita): feed dos informes enviados pela equipe na pagina
// /informe. Mais recentes primeiro, com "Carregar mais" (append) no rodape.
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

  const [items, setItems] = useState<VisitReportSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (loading || !session) {
    return null;
  }

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

                  return (
                    <article key={report.id} className="rsm-card">
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
                      </div>

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
                      </dl>
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
    </AppShell>
  );
}
