'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { CommercialStatusBadge } from '../../components/CommercialStatusBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { ClientQuickCreateModal } from '../../components/clients/ClientQuickCreateModal';
import { ApiError, getClient, listClients, listSamples } from '../../lib/api-client';
import type { ClientRegistrationSummary, ClientStatus, ClientSummary, CommercialStatus, SampleSnapshot } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';

const SAMPLE_PAGE_LIMIT = 30;
const CLIENT_PAGE_LIMIT = 20;
const HARVEST_OPTIONS = ['24/25', '25/26'] as const;
const STATUS_FILTER_OPTIONS = [
  { value: 'PRINT_PENDING', label: 'Impressao pendente' },
  { value: 'CLASSIFICATION_PENDING', label: 'Classificacao pendente' },
  { value: 'CLASSIFICATION_IN_PROGRESS', label: 'Classificacao em andamento' },
  { value: 'CLASSIFIED', label: 'Classificada' }
] as const;
const COMMERCIAL_FILTER_OPTIONS: Array<{ value: CommercialStatus; label: string }> = [
  { value: 'OPEN', label: 'Em aberto' },
  { value: 'PARTIALLY_SOLD', label: 'Venda parcial' },
  { value: 'SOLD', label: 'Vendido' },
  { value: 'LOST', label: 'Perdido' }
];
type PeriodMode = 'exact' | 'month' | 'year';
type StatusGroupFilter = '' | (typeof STATUS_FILTER_OPTIONS)[number]['value'];
type RecordsMode = 'samples' | 'clients';

interface HiddenFilters {
  owner: string;
  buyer: string;
  statusGroup: StatusGroupFilter;
  commercialStatus: '' | CommercialStatus;
  harvest: string;
  periodMode: PeriodMode;
  periodValue: string;
}

const EMPTY_HIDDEN_FILTERS: HiddenFilters = {
  owner: '',
  buyer: '',
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

function formatSampleCardSummary(sample: SampleSnapshot) {
  const owner = renderSampleValue(sample.declared.owner);
  const harvest = renderSampleValue(sample.declared.harvest);
  const sacks = renderSampleValue(sample.declared.sacks);
  return `${owner} | Safra ${harvest} | Saca ${sacks}`;
}

function formatSampleCardMeta(sample: SampleSnapshot) {
  return `Criada ${formatDate(sample.createdAt)} | Atual. ${formatDate(sample.updatedAt)}`;
}

function clientDocument(client: ClientSummary | null) {
  if (!client) {
    return null;
  }

  return client.document ?? client.cpf ?? client.cnpj ?? null;
}

function clientDisplayName(client: ClientSummary | null) {
  return client?.displayName ?? client?.fullName ?? client?.legalName ?? 'Cliente';
}

function clientRoleSummary(client: ClientSummary | null) {
  if (!client) {
    return 'Sem papel operacional';
  }

  if (client.isBuyer && client.isSeller) {
    return 'Comprador e vendedor';
  }

  if (client.isBuyer) {
    return 'Comprador';
  }

  if (client.isSeller) {
    return 'Proprietario/Vendedor';
  }

  return 'Sem papel operacional';
}

function formatClientCardSummary(client: ClientSummary) {
  const document = clientDocument(client) ?? 'Documento nao informado';
  return `${document} | ${client.personType} | ${clientRoleSummary(client)}`;
}

function formatClientCardMeta(client: ClientSummary) {
  const phone = client.phone?.trim() ? client.phone.trim() : 'Sem telefone';
  return `Cod. ${client.code} | ${phone} | Insc. ${client.activeRegistrationCount}/${client.registrationCount}`;
}

function clientStatusBadgeClass(status: ClientStatus) {
  return status === 'ACTIVE' ? 'status-badge-success' : 'status-badge-muted';
}

function clientStatusLabel(status: ClientStatus) {
  return status === 'ACTIVE' ? 'Ativo' : 'Inativo';
}

function registrationStatusBadgeClass(status: ClientRegistrationSummary['status']) {
  return status === 'ACTIVE' ? 'status-badge-success' : 'status-badge-muted';
}

function hasAnyHiddenFilter(filters: HiddenFilters) {
  return (
    filters.owner.trim().length > 0 ||
    filters.buyer.trim().length > 0 ||
    filters.statusGroup.length > 0 ||
    filters.commercialStatus.length > 0 ||
    filters.harvest.trim().length > 0 ||
    filters.periodValue.trim().length > 0
  );
}

function normalizeHiddenFilters(filters: HiddenFilters): HiddenFilters {
  return {
    owner: filters.owner.trim(),
    buyer: filters.buyer.trim(),
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
  if (filters.buyer.trim()) count += 1;
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
  const [recordsMode, setRecordsMode] = useState<RecordsMode>('samples');
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
  const [clientItems, setClientItems] = useState<ClientSummary[]>([]);
  const [clientTotal, setClientTotal] = useState(0);
  const [clientTotalPages, setClientTotalPages] = useState(1);
  const [clientPage, setClientPage] = useState(1);
  const [clientHasPrev, setClientHasPrev] = useState(false);
  const [clientHasNext, setClientHasNext] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientSearchInput, setClientSearchInput] = useState('');
  const [appliedClientSearch, setAppliedClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientDetail, setSelectedClientDetail] = useState<ClientSummary | null>(null);
  const [selectedClientRegistrations, setSelectedClientRegistrations] = useState<ClientRegistrationSummary[]>([]);
  const [clientDetailOpen, setClientDetailOpen] = useState(false);
  const [loadingClientDetail, setLoadingClientDetail] = useState(false);
  const [clientDetailError, setClientDetailError] = useState<string | null>(null);
  const [clientQuickCreateOpen, setClientQuickCreateOpen] = useState(false);

  const filtersWrapRef = useRef<HTMLDivElement | null>(null);
  const clientDetailCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastClientTriggerRef = useRef<HTMLButtonElement | null>(null);
  const hasDraftHiddenFilters = useMemo(() => hasAnyHiddenFilter(draftHiddenFilters), [draftHiddenFilters]);
  const hasAppliedHiddenFilters = useMemo(() => hasAnyHiddenFilter(appliedHiddenFilters), [appliedHiddenFilters]);
  const activeHiddenFiltersCount = useMemo(() => countActiveHiddenFilters(appliedHiddenFilters), [appliedHiddenFilters]);

  useEffect(() => {
    if (recordsMode !== 'samples') {
      setFiltersOpen(false);
    }
  }, [recordsMode]);

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
    if (!session || recordsMode !== 'samples') {
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
        buyer: appliedHiddenFilters.buyer || undefined,
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
  }, [appliedHiddenFilters, appliedSearch, currentPage, recordsMode, session]);

  useEffect(() => {
    if (!session || recordsMode !== 'clients') {
      return;
    }

    let active = true;
    setLoadingClients(true);
    setClientError(null);

    listClients(session, {
      search: appliedClientSearch || undefined,
      page: clientPage,
      limit: CLIENT_PAGE_LIMIT
    })
      .then((response) => {
        if (!active) {
          return;
        }

        setClientItems(response.items);
        setClientTotal(response.page.total);
        setClientTotalPages(response.page.totalPages);
        setClientHasPrev(response.page.hasPrev);
        setClientHasNext(response.page.hasNext);
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        setClientError(cause instanceof ApiError ? cause.message : 'Falha ao carregar clientes');
      })
      .finally(() => {
        if (active) {
          setLoadingClients(false);
        }
      });

    return () => {
      active = false;
    };
  }, [appliedClientSearch, clientPage, recordsMode, session]);

  useEffect(() => {
    if (!session || !clientDetailOpen || !selectedClientId) {
      return;
    }

    let active = true;
    setLoadingClientDetail(true);
    setClientDetailError(null);

    getClient(session, selectedClientId)
      .then((response) => {
        if (!active) {
          return;
        }

        setSelectedClientDetail(response.client);
        setSelectedClientRegistrations(response.registrations);
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        setClientDetailError(cause instanceof ApiError ? cause.message : 'Falha ao carregar detalhes do cliente');
      })
      .finally(() => {
        if (active) {
          setLoadingClientDetail(false);
        }
      });

    return () => {
      active = false;
    };
  }, [clientDetailOpen, selectedClientId, session]);

  useEffect(() => {
    if (!clientDetailOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setClientDetailOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      clientDetailCloseButtonRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        lastClientTriggerRef.current?.focus();
      }, 0);
    };
  }, [clientDetailOpen]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
    setCurrentPage(1);
  }

  function handleClientSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedClientSearch(clientSearchInput.trim());
    setClientPage(1);
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

  function handleRecordsModeChange(nextMode: RecordsMode) {
    setRecordsMode(nextMode);
    setFiltersOpen(false);
    if (nextMode !== 'clients') {
      setClientDetailOpen(false);
    }
  }

  function openClientDetail(clientId: string, trigger: HTMLButtonElement) {
    lastClientTriggerRef.current = trigger;
    setSelectedClientId(clientId);
    setSelectedClientDetail(null);
    setSelectedClientRegistrations([]);
    setClientDetailError(null);
    setClientDetailOpen(true);
  }

  function closeClientDetail() {
    setClientDetailOpen(false);
  }

  async function refreshClientsList(nextSearch = appliedClientSearch, nextPage = clientPage) {
    if (!session) {
      return;
    }

    setLoadingClients(true);
    setClientError(null);

    try {
      const response = await listClients(session, {
        search: nextSearch || undefined,
        page: nextPage,
        limit: CLIENT_PAGE_LIMIT
      });

      setClientItems(response.items);
      setClientTotal(response.page.total);
      setClientTotalPages(response.page.totalPages);
      setClientHasPrev(response.page.hasPrev);
      setClientHasNext(response.page.hasNext);
    } catch (cause) {
      setClientError(cause instanceof ApiError ? cause.message : 'Falha ao carregar clientes');
    } finally {
      setLoadingClients(false);
    }
  }

  if (loading || !session) {
    return null;
  }

  const selectedClientDocument = clientDocument(selectedClientDetail);
  const selectedClientRoles = [
    selectedClientDetail?.isSeller ? 'Proprietario/Vendedor' : null,
    selectedClientDetail?.isBuyer ? 'Comprador' : null
  ].filter((value): value is string => Boolean(value));

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="panel stack samples-page-panel">
        <header className="row samples-page-header-row">
          <div className="samples-page-header-main">
            <h2 className="samples-page-title">Registros</h2>
          </div>
        </header>

        <div className="records-mode-switch" aria-label="Tipo de registros">
          <button
            type="button"
            className={`records-mode-switch-option${recordsMode === 'samples' ? ' is-active' : ''}`}
            aria-pressed={recordsMode === 'samples'}
            onClick={() => handleRecordsModeChange('samples')}
          >
            Amostras
          </button>
          <button
            type="button"
            className={`records-mode-switch-option${recordsMode === 'clients' ? ' is-active' : ''}`}
            aria-pressed={recordsMode === 'clients'}
            onClick={() => handleRecordsModeChange('clients')}
          >
            Clientes
          </button>
        </div>

        <div className="samples-page-toolbar">
          <form
            className="sample-search samples-page-search-bar"
            role="search"
            onSubmit={recordsMode === 'samples' ? handleSearchSubmit : handleClientSearchSubmit}
          >
            <div className="sample-search-field samples-page-search-field">
              <input
                value={recordsMode === 'samples' ? searchInput : clientSearchInput}
                onChange={(event) => {
                  if (recordsMode === 'samples') {
                    setSearchInput(event.target.value);
                    return;
                  }

                  setClientSearchInput(event.target.value);
                }}
                placeholder={recordsMode === 'samples' ? 'Lote ou proprietario' : 'Nome, documento ou codigo'}
                autoComplete="off"
                spellCheck={false}
                aria-label={recordsMode === 'samples' ? 'Pesquisar por lote ou proprietario' : 'Pesquisar clientes'}
              />
              <button
                type="submit"
                className="samples-page-search-submit-icon"
                aria-label={recordsMode === 'samples' ? 'Buscar registros' : 'Buscar clientes'}
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.2 16.2 4.1 4.1" />
                </svg>
              </button>
            </div>
          </form>

          {recordsMode === 'clients' ? (
            <button
              type="button"
              className="samples-page-create-client-button"
              aria-label="Cadastrar novo cliente"
              onClick={() => setClientQuickCreateOpen(true)}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
          ) : null}

          {recordsMode === 'samples' ? (
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

              {filtersOpen ? (
                <button
                  type="button"
                  className="samples-page-filter-backdrop"
                  aria-label="Fechar filtros"
                  onClick={() => setFiltersOpen(false)}
                />
              ) : null}

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

                  <label className="samples-page-filter">
                    <span className="samples-page-filter-label">Comprador</span>
                    <input
                      value={draftHiddenFilters.buyer}
                      onChange={(event) =>
                        setDraftHiddenFilters((current) => ({
                          ...current,
                          buyer: event.target.value
                        }))
                      }
                      placeholder="Nome, documento ou codigo do comprador"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label="Filtro por comprador"
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
          ) : null}
        </div>

        {recordsMode === 'samples' ? (error ? <p className="error">{error}</p> : null) : clientError ? <p className="error">{clientError}</p> : null}

        {recordsMode === 'samples' ? (
          loadingList ? (
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
                    <Link key={sample.id} href={`/samples/${sample.id}`} className="dashboard-latest-registration-card samples-page-item">
                      <div className="dashboard-latest-registration-leading" aria-hidden="true" />

                      <div className="dashboard-latest-registration-main">
                        <div className="dashboard-latest-registration-head">
                          <p className="dashboard-latest-registration-title">{sample.internalLotNumber ?? sample.id}</p>
                          <div className="status-badge-group">
                            <StatusBadge status={sample.status} />
                            <CommercialStatusBadge status={sample.commercialStatus} />
                          </div>
                        </div>
                        <p className="dashboard-latest-registration-subtitle">{formatSampleCardSummary(sample)}</p>
                        <p className="dashboard-latest-registration-meta">{formatSampleCardMeta(sample)}</p>
                      </div>

                      <div className="dashboard-latest-registration-trailing" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )
        ) : loadingClients ? (
          <section className="samples-page-list-area">
            <p className="samples-page-empty">Carregando clientes...</p>
          </section>
        ) : clientItems.length === 0 ? (
          <section className="samples-page-list-area">
            <p className="samples-page-empty">
              {appliedClientSearch ? 'Nenhum cliente encontrado para a pesquisa aplicada.' : 'Nenhum cliente cadastrado.'}
            </p>
          </section>
        ) : (
          <section className="samples-page-list-area">
            <div className="samples-page-list-scroll" aria-label="Lista de clientes cadastrados">
              <div className="samples-page-list">
                {clientItems.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    className="dashboard-latest-registration-card samples-page-item records-client-card"
                    onClick={(event) => openClientDetail(client.id, event.currentTarget)}
                  >
                    <div className="dashboard-latest-registration-leading" aria-hidden="true" />

                    <div className="dashboard-latest-registration-main">
                      <div className="dashboard-latest-registration-head">
                        <p className="dashboard-latest-registration-title">{clientDisplayName(client)}</p>
                        <span className={`status-badge records-client-status-badge ${clientStatusBadgeClass(client.status)}`}>
                          {clientStatusLabel(client.status)}
                        </span>
                      </div>
                      <p className="dashboard-latest-registration-subtitle">{formatClientCardSummary(client)}</p>
                      <p className="dashboard-latest-registration-meta">{formatClientCardMeta(client)}</p>
                    </div>

                    <div className="dashboard-latest-registration-trailing" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        <footer className="samples-page-footer">
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            Total encontrado: {recordsMode === 'samples' ? total : clientTotal}
          </p>
          <div className="row samples-page-pagination-controls">
            <button
              type="button"
              className="secondary"
              disabled={recordsMode === 'samples' ? !hasPrev || loadingList : !clientHasPrev || loadingClients}
              onClick={() => {
                if (recordsMode === 'samples') {
                  setCurrentPage((page) => page - 1);
                  return;
                }

                setClientPage((page) => page - 1);
              }}
            >
              Anterior
            </button>
            <p style={{ margin: 0, color: 'var(--muted)' }}>
              Pagina {recordsMode === 'samples' ? currentPage : clientPage} de {recordsMode === 'samples' ? totalPages : clientTotalPages}
            </p>
            <button
              type="button"
              className="secondary"
              disabled={recordsMode === 'samples' ? !hasNext || loadingList : !clientHasNext || loadingClients}
              onClick={() => {
                if (recordsMode === 'samples') {
                  setCurrentPage((page) => page + 1);
                  return;
                }

                setClientPage((page) => page + 1);
              }}
            >
              Proximo
            </button>
          </div>
        </footer>
      </section>

      {clientDetailOpen ? (
        <div className="client-modal-backdrop" onClick={closeClientDetail}>
          <section
            className="client-modal panel stack records-client-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="records-client-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="client-modal-header">
              <div className="records-client-detail-header-copy">
                <h3 id="records-client-detail-title" style={{ margin: 0 }}>
                  {selectedClientDetail ? clientDisplayName(selectedClientDetail) : 'Cliente'}
                </h3>
                {selectedClientDetail ? (
                  <div className="records-client-detail-header-meta">
                    <span className="records-client-detail-code">Codigo {selectedClientDetail.code}</span>
                    <span className={`status-badge records-client-status-badge ${clientStatusBadgeClass(selectedClientDetail.status)}`}>
                      {clientStatusLabel(selectedClientDetail.status)}
                    </span>
                  </div>
                ) : null}
              </div>
              <button
                ref={clientDetailCloseButtonRef}
                type="button"
                className="records-client-detail-close"
                onClick={closeClientDetail}
                aria-label="Fechar detalhe do cliente"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            {loadingClientDetail ? (
              <p style={{ margin: 0, color: 'var(--muted)' }}>Carregando detalhes do cliente...</p>
            ) : clientDetailError ? (
              <p className="error" style={{ margin: 0 }}>
                {clientDetailError}
              </p>
            ) : selectedClientDetail ? (
              <>
                <article className="panel stack records-client-detail-summary">
                  <p className="records-client-detail-line">
                    <strong>Documento:</strong> {selectedClientDocument ?? 'Nao informado'}
                  </p>
                  <p className="records-client-detail-line">
                    <strong>Telefone:</strong> {selectedClientDetail.phone ?? 'Nao informado'}
                  </p>
                  <p className="records-client-detail-line">
                    <strong>Tipo:</strong> {selectedClientDetail.personType}
                  </p>
                  <p className="records-client-detail-line">
                    <strong>Inscricoes:</strong> {selectedClientDetail.activeRegistrationCount}/{selectedClientDetail.registrationCount} ativas
                  </p>
                  <div className="records-client-detail-roles">
                    {selectedClientRoles.length > 0 ? (
                      selectedClientRoles.map((role) => (
                        <span key={role} className="app-modal-chip records-client-role-chip">
                          {role}
                        </span>
                      ))
                    ) : (
                      <span className="app-modal-chip records-client-role-chip">Sem papel operacional</span>
                    )}
                  </div>
                </article>

                <article className="panel stack records-client-detail-registrations">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0 }}>Inscricoes</h4>
                    <span style={{ color: 'var(--muted)' }}>{selectedClientRegistrations.length}</span>
                  </div>

                  {selectedClientRegistrations.length === 0 ? (
                    <p style={{ margin: 0, color: 'var(--muted)' }}>Nenhuma inscricao cadastrada.</p>
                  ) : (
                    <div className="clients-registration-list">
                      {selectedClientRegistrations.map((registration) => (
                        <article key={registration.id} className="clients-registration-item records-client-registration-item">
                          <div className="records-client-registration-head">
                            <div>
                              <strong>{registration.registrationNumber}</strong>
                              <p className="records-client-registration-meta">
                                {registration.registrationType} · {registration.city}/{registration.state}
                              </p>
                            </div>
                            <span className={`status-badge records-client-status-badge ${registrationStatusBadgeClass(registration.status)}`}>
                              {registration.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </article>
              </>
            ) : (
              <p style={{ margin: 0, color: 'var(--muted)' }}>Selecione um cliente para visualizar os detalhes.</p>
            )}
          </section>
        </div>
      ) : null}

      <ClientQuickCreateModal
        session={session}
        open={clientQuickCreateOpen}
        title="Novo cliente"
        description="Cadastre rapidamente um cliente sem sair da pagina de registros."
        initialSearch={clientSearchInput.trim()}
        initialPersonType="PJ"
        initialIsSeller
        initialIsBuyer={false}
        onClose={() => setClientQuickCreateOpen(false)}
        onCreated={(client) => {
          setClientQuickCreateOpen(false);
          setRecordsMode('clients');
          setClientSearchInput('');
          setAppliedClientSearch('');
          setClientPage(1);
          setSelectedClientId(client.id);
          setSelectedClientDetail(client);
          setSelectedClientRegistrations([]);
          setClientDetailError(null);
          setClientError(null);
          setClientDetailOpen(true);
          void refreshClientsList('', 1);
        }}
      />
    </AppShell>
  );
}
