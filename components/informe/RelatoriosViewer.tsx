'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { InformeCreateRadialFab } from './InformeCreateRadialFab';
import { useInformeCreateSheets } from './useInformeCreateSheets';
import { VisitsTrendChart } from './VisitsTrendChart';
import { WeeklyReportCard } from './WeeklyReportCard';
import { VisitReportCard } from '../visits/VisitReportCard';
import {
  ApiError,
  cancelVisitReport,
  cancelWeeklyReport,
  getRelatoriosStats,
  listInformeFeed,
} from '../../lib/api-client';
import { isWeeklyReportAuthor } from '../../lib/roles';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { useIsDesktop } from '../../lib/use-desktop';
import { useToast } from '../../lib/toast/ToastProvider';
import type {
  InformeFeedItem,
  InformeFeedQuery,
  InformeFeedType,
  RelatoriosStatsResponse,
  SessionData,
} from '../../lib/types';

// Pagina "Relatorios" (rota /relatorios): feed COMBINADO (scope=all) de VISITA
// (unificada: prospector + comercial) + SEMANAL de TODOS os autores, mais
// recentes primeiro, com "Carregar mais". Cards accordion por tipo; so o autor
// CANCELA (soft) o proprio item — cancelado fica no historico, marcado.
//
// Reformulacao FV desktop (RD §2.10 v2): faixa unica no topo com 2 KPIs de
// visita (esquerda) + 3 botoes de criacao (direita) e o feed num cartao de
// altura cheia com toolbar de busca. No mobile a faixa/toolbar somem (kit) e
// criar mora no FAB "leque" — Visita (todos) + Semanal (so ADMIN + COMMERCIAL)
// + Informativo (todos). Unificacao 2026-07-15 (curadoria + fila offline fora).

const PAGE_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 280;

function cancelLabels(item: InformeFeedItem) {
  if (item.type === 'WEEKLY_REPORT') {
    return { title: 'Cancelar relatório?', success: 'Relatório cancelado' };
  }
  return { title: 'Cancelar visita?', success: 'Visita cancelada' };
}

// Filtro por TIPO — chips fixos no topo do histórico (Todas/Visitas/Semanal),
// aplicam imediato (sem rascunho). `''` = "Todas" (param omitido). Status e
// Período saíram na reformulação: a busca já casa autor/cliente, e um seletor de
// autor exigiria um endpoint de autores acessível a todo viewer (/users é ADMIN).
const TYPE_CHIPS: { value: '' | InformeFeedType; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'VISIT_REPORT', label: 'Visitas' },
  { value: 'WEEKLY_REPORT', label: 'Semanal' },
];

interface RelatoriosViewerProps {
  session: SessionData;
  // Mostra as portas de criacao (Visita p/ todos; Semanal so ADMIN + COMMERCIAL;
  // Informativo p/ todos) — botoes da faixa no desktop, FAB "leque" no mobile.
  canCreate: boolean;
}

export function RelatoriosViewer({ session, canCreate }: RelatoriosViewerProps) {
  const toast = useToast();
  const isDesktop = useIsDesktop();

  const [items, setItems] = useState<InformeFeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<RelatoriosStatsResponse | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [cancelTarget, setCancelTarget] = useState<InformeFeedItem | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Filtro por tipo (chips): aplica imediato — sem rascunho/painel.
  const [typeFilter, setTypeFilter] = useState<'' | InformeFeedType>('');
  const hasActiveQuery = Boolean(debouncedSearch) || Boolean(typeFilter);

  // Params do feed (R7). Memo pra só a busca (debounced) e o tipo dispararem o
  // refetch — sem um objeto novo a cada render acionando o efeito. O backend
  // ainda aceita status/from/to; esta UI só não os envia mais.
  const feedQuery = useMemo<InformeFeedQuery>(
    () => ({
      search: debouncedSearch || undefined,
      type: typeFilter || undefined,
    }),
    [debouncedSearch, typeFilter]
  );

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
          ...feedQuery,
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
    [session, feedQuery]
  );

  // Refetch da pagina 1 na carga inicial E a cada mudanca de busca (loadPage muda
  // com feedQuery).
  useEffect(() => {
    void loadPage(1, 'replace');
  }, [loadPage]);

  // KPIs (2 cards de visita). Sao um PLUS: se falharem, a lista ainda vale e o
  // ultimo valor conhecido fica (nao zera a tela).
  const refetchStats = useCallback(() => {
    getRelatoriosStats(session)
      .then(setStats)
      .catch(() => {
        /* silencioso — os cards mostram "—" ate a proxima tentativa. */
      });
  }, [session]);

  useEffect(() => {
    refetchStats();
  }, [refetchStats]);

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

  // Uma visita/semanal criada muda a lista E os contadores.
  const handleSubmitted = useCallback(() => {
    void loadPage(1, 'replace');
    refetchStats();
  }, [loadPage, refetchStats]);

  const { openVisit, openWeekly, openInformativo, sheets } = useInformeCreateSheets({
    session,
    onSubmitted: handleSubmitted,
  });

  // Cancelamento soft: substitui o item na lista (fica marcado como "Cancelado")
  // e reconta os KPIs (uma visita cancelada sai do total).
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
      refetchStats();
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
  }, [session, cancelTarget, cancelling, loadPage, refetchStats, toast]);

  const canCreateWeekly = isWeeklyReportAuthor(session.user.role);
  const showEmpty = !initialLoading && !error && items.length === 0;

  // 1 KPI card de VISITA ("Visitas esta semana"). Funcao (nao elemento
  // compartilhado): no mobile o card da faixa (.rsm-kpis, escondida) e o da
  // chrome de lista (.fv-kpi-row) coexistem no DOM — cada wrapper precisa de
  // instancia fresca. Icone = o do leque de criacao (calendario p/ semana).
  const renderVisitKpiCards = () => (
    <article className="fv-kpi">
      <div className="fv-kpi-top">
        <span className="fv-kpi-label">Visitas esta semana</span>
        <span className="fv-kpi-icon is-blue" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <rect x="4" y="5" width="16" height="16" rx="2.2" />
            <path d="M8 3v4" />
            <path d="M16 3v4" />
            <path d="M4 10.5h16" />
          </svg>
        </span>
      </div>
      <div className="rsm-week-body">
        <span className="fv-kpi-value">
          {stats ? stats.visitsThisWeek.toLocaleString('pt-BR') : '—'}
        </span>
        {stats && stats.weeklyTrend.length > 0 ? (
          <VisitsTrendChart data={stats.weeklyTrend} />
        ) : null}
      </div>
    </article>
  );

  // Desktop: cards na faixa do topo (byte-identico ao que ja existia).
  const kpiRow = <div className="rsm-kpis">{renderVisitKpiCards()}</div>;

  // Mobile: mesmos cards em grid 2-up, dentro da rolagem (via mobileListChrome).
  const mobileKpi = <div className="fv-kpi-row">{renderVisitKpiCards()}</div>;

  // 3 botoes de criacao (direita da faixa, desktop). "Semanal" so p/ autor
  // (ADMIN + COMMERCIAL). Icones espelham o leque.
  const headActions = canCreate ? (
    <div className="fv-page-head-actions">
      <button type="button" className="fv-btn fv-btn-primary" onClick={openVisit}>
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <rect x="5.5" y="4" width="13" height="17" rx="2.2" />
          <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
          <path d="m9 13.5 2.3 2.3 4.4-5" />
        </svg>
        Nova visita
      </button>
      {canCreateWeekly ? (
        <button type="button" className="fv-btn fv-btn-secondary" onClick={openWeekly}>
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <rect x="4" y="5" width="16" height="16" rx="2.2" />
            <path d="M8 3v4" />
            <path d="M16 3v4" />
            <path d="M4 10.5h16" />
          </svg>
          Semanal
        </button>
      ) : null}
      <button type="button" className="fv-btn fv-btn-secondary" onClick={openInformativo}>
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="15" rx="2.2" />
          <circle cx="8.5" cy="10" r="1.6" />
          <path d="m4 17 4.5-4.5 3.5 3.5 3-2.5L20 17" />
        </svg>
        Informativo
      </button>
    </div>
  ) : null;

  // Toolbar do cartao (desktop): busca por autor/cliente + contagem. O kit a
  // esconde no mobile (base display:none; so /samples + /clients a acendem la).
  const toolbar = (
    <div className="fv-toolbar rsm-toolbar">
      <form
        className="fv-toolbar-search"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <svg
          className="fv-toolbar-search-icon"
          viewBox="0 0 24 24"
          focusable="false"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m16.2 16.2 4.1 4.1" />
        </svg>
        <input
          className="fv-input fv-toolbar-search-input"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Buscar por autor ou cliente..."
          aria-label="Buscar por autor ou cliente"
          autoComplete="off"
          spellCheck={false}
        />
        {searchInput ? (
          <button
            type="button"
            className="fv-toolbar-search-clear"
            aria-label="Limpar busca"
            onClick={() => setSearchInput('')}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </form>
      <span className="fv-toolbar-count">
        {total} {total === 1 ? 'relatório' : 'relatórios'}
      </span>
    </div>
  );

  // Chips fixos de TIPO no topo do histórico (Todas/Visitas/Semanal) — aplicam
  // imediato, sem rascunho/painel. Substituem o antigo painel de filtros; reusam
  // o visual .fv-choice (hairline + ring no selecionado, afunda ao clicar).
  const typeChips = (
    <div className="rsm-type-chips" role="radiogroup" aria-label="Tipo de relatório">
      {TYPE_CHIPS.map((chip) => (
        <button
          key={chip.value || 'all'}
          type="button"
          role="radio"
          aria-checked={typeFilter === chip.value}
          className={`fv-choice${typeFilter === chip.value ? ' is-selected' : ''}`}
          onClick={() => setTypeFilter(chip.value)}
        >
          <span className="fv-choice-label">{chip.label}</span>
        </button>
      ))}
    </div>
  );

  // Chrome mobile: KPI-2 + toolbar entram DENTRO da rolagem (kit FV, molde
  // /samples//cadastros). No desktop e null — a faixa tem os KPIs e a toolbar
  // fica no topo do cartao. `toolbar` e o MESMO elemento do topo; como isDesktop
  // gateia os dois lados, ele monta em no maximo um lugar por render.
  const mobileListChrome = isDesktop ? null : (
    <>
      {mobileKpi}
      {toolbar}
    </>
  );

  return (
    <>
      <section className="sdv-page relatorios-page">
        {/* Faixa unica (desktop >=901px; some no mobile pelo kit .fv-page-head):
            2 KPIs a esquerda + 3 botoes de criacao a direita, sem titulo grande
            (a top-bar FV ja mostra "Relatorios"). */}
        <div className="fv-page-head rsm-page-head">
          {kpiRow}
          {headActions}
        </div>

        <section className="sdv-content informe-content rsm-content">
          {isDesktop ? toolbar : null}

          <div className="rsm-feed">
            {/* Chrome mobile (KPI-2 + toolbar) como PRIMEIRO filho do feed, antes
                de qualquer ramo, pra a busca seguir visivel em vazio/erro/sem-
                resultado. No desktop e null (a faixa/toolbar do topo cuidam). */}
            {mobileListChrome}
            {/* Chips de tipo — 1º filho fixo do feed (ambos breakpoints), acima
                da lista, seguem visíveis em vazio/erro/carregando. */}
            {typeChips}

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
                <p className="rsm-empty-title">
                  {hasActiveQuery ? 'Nenhum relatório encontrado' : 'Nenhum relatório ainda'}
                </p>
                <p className="rsm-empty-sub">
                  {hasActiveQuery
                    ? 'Ajuste a busca ou o tipo.'
                    : 'As visitas e os relatórios semanais aparecem aqui.'}
                </p>
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

        {/* FAB "leque" de criacao — mobile-only: a regra
            `.relatorios-page .rsm-fab-anchor` e display:none >=901px, onde criar
            mora nos botoes da faixa. IRMAO de .sdv-content (fora do scroller). */}
        {canCreate ? (
          <div className="rsm-fab-anchor">
            <InformeCreateRadialFab
              onCreateVisit={openVisit}
              onCreateWeeklyReport={openWeekly}
              onCreateInformativo={openInformativo}
              canCreateWeekly={canCreateWeekly}
            />
          </div>
        ) : null}

        {sheets}
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
