'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { CommercialStatusBadge } from '../../components/CommercialStatusBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError, listSamples } from '../../lib/api-client';
import type { CommercialStatus, SampleSnapshot } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';

const SAMPLE_PAGE_LIMIT = 30;
const HARVEST_OPTIONS = ['24/25', '25/26'] as const;
const STATUS_FILTER_OPTIONS = [
  { value: 'PRINT_PENDING', label: 'Impressao pendente' },
  { value: 'CLASSIFICATION_PENDING', label: 'Classificacao pendente' },
  { value: 'CLASSIFICATION_IN_PROGRESS', label: 'Classificacao em andamento' },
  { value: 'CLASSIFIED', label: 'Classificada' }
] as const;
const COMMERCIAL_FILTER_OPTIONS: Array<{ value: CommercialStatus; label: string }> = [
  { value: 'OPEN', label: 'Em aberto' },
  { value: 'SOLD', label: 'Vendido' },
  { value: 'LOST', label: 'Perdido' }
];
type PeriodMode = 'exact' | 'month' | 'year';
type StatusGroupFilter = '' | (typeof STATUS_FILTER_OPTIONS)[number]['value'];

interface HiddenFilters {
  owner: string;
  statusGroup: StatusGroupFilter;
  commercialStatus: '' | CommercialStatus;
  harvest: string;
  periodMode: PeriodMode;
  periodValue: string;
}

const EMPTY_HIDDEN_FILTERS: HiddenFilters = {
  owner: '',
  statusGroup: '',
  commercialStatus: '',
  harvest: '',
  periodMode: 'exact',
  periodValue: ''
};

function renderSampleValue(value: string | number | null) {
  if (value === null || value === '') {
    return 'Nao informado';
  }

  return String(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}

function hasAnyHiddenFilter(filters: HiddenFilters) {
  return (
    filters.owner.trim().length > 0 ||
    filters.statusGroup.length > 0 ||
    filters.commercialStatus.length > 0 ||
    filters.harvest.trim().length > 0 ||
    filters.periodValue.trim().length > 0
  );
}

function normalizeHiddenFilters(filters: HiddenFilters): HiddenFilters {
  return {
    owner: filters.owner.trim(),
    statusGroup: filters.statusGroup,
    commercialStatus: filters.commercialStatus,
    harvest: filters.harvest.trim(),
    periodMode: filters.periodMode,
    periodValue: filters.periodValue.trim()
  };
}

function countActiveHiddenFilters(filters: HiddenFilters) {
  let count = 0;
  if (filters.owner.trim()) count += 1;
  if (filters.statusGroup) count += 1;
  if (filters.commercialStatus) count += 1;
  if (filters.harvest.trim()) count += 1;
  if (filters.periodValue.trim()) count += 1;
  return count;
}

function buildPeriodQuery(filters: HiddenFilters) {
  const normalizedValue = filters.periodValue.trim();
  if (!normalizedValue) {
    return {};
  }

  if (filters.periodMode === 'month') {
    return { createdMonth: normalizedValue };
  }

  if (filters.periodMode === 'year') {
    return { createdYear: normalizedValue };
  }

  return { createdDate: normalizedValue };
}

function getPeriodInputType(periodMode: PeriodMode) {
  if (periodMode === 'month') {
    return 'month';
  }

  if (periodMode === 'year') {
    return 'number';
  }

  return 'date';
}

function getPeriodInputLabel(periodMode: PeriodMode) {
  if (periodMode === 'month') {
    return 'Mes';
  }

  if (periodMode === 'year') {
    return 'Ano';
  }

  return 'Data';
}

function getPeriodPlaceholder(periodMode: PeriodMode) {
  if (periodMode === 'year') {
    return '2026';
  }

  return '';
}

function normalizePeriodValueForMode(periodMode: PeriodMode, value: string) {
  if (periodMode === 'year') {
    return value.replace(/[^0-9]/g, '').slice(0, 4);
  }

  return value;
}

export default function SamplesPage() {
  const { session, loading, logout } = useRequireAuth();
  const [items, setItems] = useState<SampleSnapshot[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasPrev, setHasPrev] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [draftHiddenFilters, setDraftHiddenFilters] = useState<HiddenFilters>(EMPTY_HIDDEN_FILTERS);
  const [appliedHiddenFilters, setAppliedHiddenFilters] = useState<HiddenFilters>(EMPTY_HIDDEN_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtersWrapRef = useRef<HTMLDivElement | null>(null);
  const hasDraftHiddenFilters = useMemo(() => hasAnyHiddenFilter(draftHiddenFilters), [draftHiddenFilters]);
  const hasAppliedHiddenFilters = useMemo(() => hasAnyHiddenFilter(appliedHiddenFilters), [appliedHiddenFilters]);
  const activeHiddenFiltersCount = useMemo(() => countActiveHiddenFilters(appliedHiddenFilters), [appliedHiddenFilters]);

  useEffect(() => {
    if (!filtersOpen) {
      return;
    }

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!filtersWrapRef.current?.contains(target)) {
        setFiltersOpen(false);
      }
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFiltersOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const abortController = new AbortController();
    let active = true;
    setLoadingList(true);
    setError(null);

    listSamples(
      session,
      {
        limit: SAMPLE_PAGE_LIMIT,
        page: currentPage,
        search: appliedSearch || undefined,
        owner: appliedHiddenFilters.owner || undefined,
        statusGroup: appliedHiddenFilters.statusGroup || undefined,
        commercialStatus: appliedHiddenFilters.commercialStatus || undefined,
        harvest: appliedHiddenFilters.harvest || undefined,
        ...buildPeriodQuery(appliedHiddenFilters)
      },
      {
        signal: abortController.signal
      }
    )
      .then((response) => {
        if (!active) {
          return;
        }

        setItems(response.items);
        setTotal(response.page.total);
        setTotalPages(response.page.totalPages);
        setHasPrev(response.page.hasPrev);
        setHasNext(response.page.hasNext);
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }

        if (cause instanceof ApiError) {
          setError(cause.message);
        } else {
          setError('Falha ao carregar registros');
        }
      })
      .finally(() => {
        if (active) {
          setLoadingList(false);
        }
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [appliedHiddenFilters, appliedSearch, currentPage, session]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
    setCurrentPage(1);
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedHiddenFilters(normalizeHiddenFilters(draftHiddenFilters));
    setCurrentPage(1);
    setFiltersOpen(false);
  }

  function handleClearFiltersOnly() {
    setDraftHiddenFilters(EMPTY_HIDDEN_FILTERS);
    setAppliedHiddenFilters(EMPTY_HIDDEN_FILTERS);
    setCurrentPage(1);
    setError(null);
  }

  function handleClearAll() {
    setSearchInput('');
    setAppliedSearch('');
    setDraftHiddenFilters(EMPTY_HIDDEN_FILTERS);
    setAppliedHiddenFilters(EMPTY_HIDDEN_FILTERS);
    setCurrentPage(1);
    setFiltersOpen(false);
    setError(null);
  }

  if (loading || !session) {
    return null;
  }

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="panel stack samples-page-panel">
        <div className="row samples-page-header-row">
          <h2 style={{ margin: 0 }}>Registros</h2>
          <div className="samples-page-filter-control" ref={filtersWrapRef}>
            <button
              type="button"
              className={`samples-page-filter-toggle${filtersOpen ? ' is-open' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={filtersOpen}
              aria-label="Abrir filtros"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M4 6h16" />
                <path d="M7 12h10" />
                <path d="M10 18h4" />
              </svg>
              {activeHiddenFiltersCount > 0 ? <span className="samples-page-filter-badge">{activeHiddenFiltersCount}</span> : null}
            </button>

            <section
              className={`samples-page-filter-popover${filtersOpen ? ' is-open' : ''}`}
              aria-hidden={!filtersOpen}
              role="dialog"
              aria-label="Filtros"
            >
              <form className="stack" onSubmit={handleApplyFilters}>
                <label className="samples-page-filter">
                  <span className="samples-page-filter-label">Proprietario</span>
                  <input
                    value={draftHiddenFilters.owner}
                    onChange={(event) =>
                      setDraftHiddenFilters((current) => ({
                        ...current,
                        owner: event.target.value
                      }))
                    }
                    placeholder="Nome exato do proprietario"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Filtro por proprietario"
                  />
                </label>

                <div className="samples-page-filter">
                  <span className="samples-page-filter-label">Status</span>
                  <div className="samples-page-status-chip-row">
                    {STATUS_FILTER_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`samples-page-status-chip${draftHiddenFilters.statusGroup === option.value ? ' is-selected' : ''}`}
                        onClick={() =>
                          setDraftHiddenFilters((current) => ({
                            ...current,
                            statusGroup: current.statusGroup === option.value ? '' : option.value
                          }))
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="samples-page-filter">
                  <span className="samples-page-filter-label">Status comercial</span>
                  <div className="samples-page-harvest-chip-row">
                    {COMMERCIAL_FILTER_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`samples-page-harvest-chip${
                          draftHiddenFilters.commercialStatus === option.value ? ' is-selected' : ''
                        }`}
                        onClick={() =>
                          setDraftHiddenFilters((current) => ({
                            ...current,
                            commercialStatus: current.commercialStatus === option.value ? '' : option.value
                          }))
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="samples-page-filter">
                  <span className="samples-page-filter-label">Safra</span>
                  <div className="samples-page-harvest-chip-row">
                    {HARVEST_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`samples-page-harvest-chip${draftHiddenFilters.harvest === option ? ' is-selected' : ''}`}
                        onClick={() =>
                          setDraftHiddenFilters((current) => ({
                            ...current,
                            harvest: current.harvest === option ? '' : option
                          }))
                        }
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="samples-page-filter samples-page-period-filter">
                  <span className="samples-page-filter-label">Periodo</span>
                  <div className="samples-page-period-grid">
                    <select
                      value={draftHiddenFilters.periodMode}
                      onChange={(event) =>
                        setDraftHiddenFilters((current) => ({
                          ...current,
                          periodMode: event.target.value as PeriodMode,
                          periodValue: ''
                        }))
                      }
                      aria-label="Modo do periodo"
                    >
                      <option value="exact">Data</option>
                      <option value="month">Mes</option>
                      <option value="year">Ano</option>
                    </select>
                    <input
                      type={getPeriodInputType(draftHiddenFilters.periodMode)}
                      value={draftHiddenFilters.periodValue}
                      onChange={(event) =>
                        setDraftHiddenFilters((current) => ({
                          ...current,
                          periodValue: normalizePeriodValueForMode(current.periodMode, event.target.value)
                        }))
                      }
                      placeholder={getPeriodPlaceholder(draftHiddenFilters.periodMode)}
                      inputMode={draftHiddenFilters.periodMode === 'year' ? 'numeric' : undefined}
                      min={draftHiddenFilters.periodMode === 'year' ? '2000' : undefined}
                      max={draftHiddenFilters.periodMode === 'year' ? '2100' : undefined}
                      step={draftHiddenFilters.periodMode === 'year' ? '1' : undefined}
                      aria-label={getPeriodInputLabel(draftHiddenFilters.periodMode)}
                    />
                  </div>
                </div>

                <div className="row samples-page-filter-actions">
                  <button type="submit">Aplicar filtros</button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleClearFiltersOnly}
                    disabled={!hasDraftHiddenFilters && !hasAppliedHiddenFilters}
                  >
                    Limpar filtros
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>

        <form className="sample-search samples-page-search-bar" role="search" onSubmit={handleSearchSubmit}>
          <label className="sample-search-field">
            <span className="sample-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m16.2 16.2 4.1 4.1" />
              </svg>
            </span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Pesquisas amostra"
              autoComplete="off"
              spellCheck={false}
              aria-label="Pesquisar por lote ou proprietario"
            />
          </label>
          <button type="submit" className="sample-search-submit">
            Buscar
          </button>
          <button
            type="button"
            className="secondary sample-search-clear"
            onClick={handleClearAll}
            disabled={searchInput.trim().length === 0 && !appliedSearch && !hasAppliedHiddenFilters && !hasDraftHiddenFilters}
          >
            Limpar
          </button>
        </form>

        {error ? <p className="error">{error}</p> : null}

        {loadingList ? (
          <section className="samples-page-list-area">
            <p className="samples-page-empty">Carregando registros...</p>
          </section>
        ) : items.length === 0 ? (
          <section className="samples-page-list-area">
            <p className="samples-page-empty">
              {appliedSearch || hasAppliedHiddenFilters ? 'Nenhum registro encontrado para a pesquisa aplicada.' : 'Nenhum registro cadastrado.'}
            </p>
          </section>
        ) : (
          <section className="samples-page-list-area">
            <div className="samples-page-list-scroll" aria-label="Lista de registros cadastrados">
              <div className="samples-page-list">
                {items.map((sample) => (
                  <Link key={sample.id} href={`/samples/${sample.id}`} className="panel stack samples-page-item">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{sample.internalLotNumber ?? sample.id}</strong>
                      <div className="status-badge-group">
                        <StatusBadge status={sample.status} />
                        <CommercialStatusBadge status={sample.commercialStatus} />
                      </div>
                    </div>
                    <p style={{ margin: 0, color: 'var(--muted)' }}>
                      Proprietario: {renderSampleValue(sample.declared.owner)} | Sacas: {renderSampleValue(sample.declared.sacks)} | Safra:{' '}
                      {renderSampleValue(sample.declared.harvest)}
                    </p>
                    <p style={{ margin: 0, color: 'var(--muted)' }}>
                      Registrada: {formatDate(sample.createdAt)} | Atualizada: {formatDate(sample.updatedAt)}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <footer className="samples-page-footer">
          <p style={{ margin: 0, color: 'var(--muted)' }}>Total encontrado: {total}</p>
          <div className="row samples-page-pagination-controls">
            <button
              type="button"
              className="secondary"
              disabled={!hasPrev || loadingList}
              onClick={() => setCurrentPage((page) => page - 1)}
            >
              Anterior
            </button>
            <p style={{ margin: 0, color: 'var(--muted)' }}>
              Pagina {currentPage} de {totalPages}
            </p>
            <button
              type="button"
              className="secondary"
              disabled={!hasNext || loadingList}
              onClick={() => setCurrentPage((page) => page + 1)}
            >
              Proximo
            </button>
          </div>
        </footer>
      </section>
    </AppShell>
  );
}
