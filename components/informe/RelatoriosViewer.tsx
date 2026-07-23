'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { InformeCreateRadialFab } from './InformeCreateRadialFab';
import { useInformeCreateSheets } from './useInformeCreateSheets';
import { WeeklyReportCard } from './WeeklyReportCard';
import { BottomSheet } from '../BottomSheet';
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
import { useToast } from '../../lib/toast/ToastProvider';
import type {
  InformeFeedItem,
  InformeFeedQuery,
  InformeFeedStatus,
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

// Filtros laterais (desktop): `''` = "Todos" (param omitido). Autor fica de fora
// desta rodada — a busca ja casa por nome de autor, e um seletor de autor exigiria
// um endpoint de autores distintos acessivel a TODO viewer (o /users e ADMIN-only).
interface RelatoriosFilters {
  type: '' | InformeFeedType;
  status: '' | InformeFeedStatus;
  from: string;
  to: string;
}

const EMPTY_FILTERS: RelatoriosFilters = { type: '', status: '', from: '', to: '' };

const TYPE_OPTIONS: { value: '' | InformeFeedType; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'VISIT_REPORT', label: 'Visita' },
  { value: 'WEEKLY_REPORT', label: 'Semanal' },
];

const STATUS_OPTIONS: { value: '' | InformeFeedStatus; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'cancelled', label: 'Cancelados' },
];

interface RelatoriosViewerProps {
  session: SessionData;
  // Mostra as portas de criacao (Visita p/ todos; Semanal so ADMIN + COMMERCIAL;
  // Informativo p/ todos) — botoes da faixa no desktop, FAB "leque" no mobile.
  canCreate: boolean;
}

export function RelatoriosViewer({ session, canCreate }: RelatoriosViewerProps) {
  const toast = useToast();

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

  // Filtros laterais: `applied` alimenta o feed; `draft` e o que o painel edita
  // ate o "Aplicar" (mesmo padrao de /samples).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<RelatoriosFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<RelatoriosFilters>(EMPTY_FILTERS);

  const activeFilterCount =
    (appliedFilters.type ? 1 : 0) +
    (appliedFilters.status ? 1 : 0) +
    (appliedFilters.from || appliedFilters.to ? 1 : 0);
  const draftHasFilters =
    Boolean(draftFilters.type) ||
    Boolean(draftFilters.status) ||
    Boolean(draftFilters.from) ||
    Boolean(draftFilters.to);
  const hasActiveQuery = Boolean(debouncedSearch) || activeFilterCount > 0;

  // Params do feed (R7). Memo pra so a busca (debounced) e os filtros APLICADOS
  // dispararem o refetch — sem um objeto novo a cada render acionando o efeito.
  const feedQuery = useMemo<InformeFeedQuery>(
    () => ({
      search: debouncedSearch || undefined,
      type: appliedFilters.type || undefined,
      status: appliedFilters.status || undefined,
      from: appliedFilters.from || undefined,
      to: appliedFilters.to || undefined,
    }),
    [debouncedSearch, appliedFilters]
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

  // Painel de filtros: abre com o rascunho sincronizado ao que esta aplicado.
  const openFilters = useCallback(() => {
    setDraftFilters(appliedFilters);
    setFiltersOpen(true);
  }, [appliedFilters]);

  const handleApplyFilters = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAppliedFilters(draftFilters);
      setFiltersOpen(false);
    },
    [draftFilters]
  );

  const handleClearFilters = useCallback(() => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  }, []);

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

  // Δ da semana (this vs. last) derivado na UI — o endpoint so devolve os counts.
  const weekDelta = stats ? stats.visitsThisWeek - stats.visitsLastWeek : null;
  const weekDeltaDir =
    weekDelta == null || weekDelta === 0 ? 'flat' : weekDelta > 0 ? 'up' : 'down';
  const weekDeltaText =
    weekDelta == null
      ? ' '
      : weekDelta === 0
        ? 'igual à semana passada'
        : `${weekDelta > 0 ? '+' : '−'}${Math.abs(weekDelta)} vs. semana passada`;

  // 2 KPI cards de VISITA (esquerda da faixa). Icones = os do leque de criacao
  // (prancheta-check p/ visita, calendario p/ semana).
  const kpiRow = (
    <div className="rsm-kpis">
      <article className="fv-kpi">
        <div className="fv-kpi-top">
          <span className="fv-kpi-label">Total de visitas</span>
          <span className="fv-kpi-icon is-green" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <rect x="5.5" y="4" width="13" height="17" rx="2.2" />
              <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
              <path d="m9 13.5 2.3 2.3 4.4-5" />
            </svg>
          </span>
        </div>
        <div className="fv-kpi-metric">
          <span className="fv-kpi-value">
            {stats ? stats.totalVisits.toLocaleString('pt-BR') : '—'}
          </span>
        </div>
      </article>

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
        <div className="fv-kpi-metric">
          <span className="fv-kpi-value">
            {stats ? stats.visitsThisWeek.toLocaleString('pt-BR') : '—'}
          </span>
          <span className={`fv-kpi-delta${weekDeltaDir !== 'flat' ? ` is-${weekDeltaDir}` : ''}`}>
            {weekDeltaDir === 'up' ? (
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M7 17 17 7" />
                <path d="M8 7h9v9" />
              </svg>
            ) : weekDeltaDir === 'down' ? (
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="m7 7 10 10" />
                <path d="M17 8v9H8" />
              </svg>
            ) : null}
            {weekDeltaText}
          </span>
        </div>
      </article>
    </div>
  );

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
      <button
        type="button"
        className="fv-btn fv-btn-secondary fv-toolbar-filter"
        aria-haspopup="dialog"
        aria-expanded={filtersOpen}
        onClick={() => (filtersOpen ? setFiltersOpen(false) : openFilters())}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M4 6h16" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
        <span className="fv-toolbar-filter-label">Filtros</span>
        {activeFilterCount > 0 ? <span className="fv-btn-badge">{activeFilterCount}</span> : null}
      </button>
      {activeFilterCount > 0 ? (
        <button type="button" className="fv-toolbar-clear" onClick={handleClearFilters}>
          Limpar
        </button>
      ) : null}
      <span className="fv-toolbar-count">
        {total} {total === 1 ? 'relatório' : 'relatórios'}
      </span>
    </div>
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
          {toolbar}

          <div className="rsm-feed">
            {/* Mobile mantem a legenda de contagem enxuta; no desktop a contagem
                vive na toolbar (esta .rsm-intro fica display:none >=901px). */}
            {!initialLoading && !error ? (
              <header className="rsm-intro">
                <span className="rsm-total-chip">
                  {total} {total === 1 ? 'relatório' : 'relatórios'}
                </span>
              </header>
            ) : null}

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
                    ? 'Ajuste a busca ou os filtros.'
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

      {/* Filtros laterais (desktop = painel direito; mobile = bottom sheet, mas
          o gatilho — "Filtros" da toolbar — so existe no desktop por ora).
          Rascunho + Aplicar/Limpar, molde do painel de /samples. */}
      <BottomSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        ariaLabel="Filtros de relatórios"
        className="side-sheet fv-filter-sheet relatorios-filter-sheet"
        footer={
          <div className="fv-filter-actions">
            <button
              type="button"
              className="fv-btn fv-btn-secondary"
              onClick={handleClearFilters}
              disabled={!draftHasFilters && activeFilterCount === 0}
            >
              Limpar
            </button>
            <button type="submit" form="relatorios-filter-form" className="fv-btn fv-btn-primary">
              Aplicar
            </button>
          </div>
        }
      >
        <form
          id="relatorios-filter-form"
          className="relatorios-filter-sheet-form"
          onSubmit={handleApplyFilters}
        >
          <div className="samples-filter-field">
            <span className="samples-filter-field-label">Tipo</span>
            <div className="fv-choice-group" role="radiogroup" aria-label="Tipo de relatório">
              {TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value || 'all'}
                  type="button"
                  role="radio"
                  aria-checked={draftFilters.type === option.value}
                  className={`fv-choice${draftFilters.type === option.value ? ' is-selected' : ''}`}
                  onClick={() => setDraftFilters((current) => ({ ...current, type: option.value }))}
                >
                  <span className="fv-choice-label">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="samples-filter-field">
            <span className="samples-filter-field-label">Status</span>
            <div className="fv-choice-group" role="radiogroup" aria-label="Status">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value || 'all'}
                  type="button"
                  role="radio"
                  aria-checked={draftFilters.status === option.value}
                  className={`fv-choice${draftFilters.status === option.value ? ' is-selected' : ''}`}
                  onClick={() =>
                    setDraftFilters((current) => ({ ...current, status: option.value }))
                  }
                >
                  <span className="fv-choice-label">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="samples-filter-field">
            <span className="samples-filter-field-label">Período</span>
            <div className="samples-filter-split-grid">
              <input
                className={`samples-filter-field-input${draftFilters.from === '' ? ' is-placeholder' : ' is-active'}`}
                type="date"
                value={draftFilters.from}
                max={draftFilters.to || undefined}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, from: event.target.value }))
                }
                aria-label="Data inicial"
              />
              <input
                className={`samples-filter-field-input${draftFilters.to === '' ? ' is-placeholder' : ' is-active'}`}
                type="date"
                value={draftFilters.to}
                min={draftFilters.from || undefined}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, to: event.target.value }))
                }
                aria-label="Data final"
              />
            </div>
          </div>
        </form>
      </BottomSheet>

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
