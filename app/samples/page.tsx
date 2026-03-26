'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { CommercialStatusBadge } from '../../components/CommercialStatusBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { ClientQuickCreateModal } from '../../components/clients/ClientQuickCreateModal';
import { ApiError, getClient, listClients, listSamples } from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { formatClientDocument, formatPhone } from '../../lib/client-field-formatters';
import type { ClientRegistrationSummary, ClientStatus, ClientSummary, CommercialStatus, SampleSnapshot } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';

const SAMPLE_PAGE_LIMIT = 30;
const CLIENT_PAGE_LIMIT = 30;
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
type FilterSectionId = 'owner' | 'buyer' | 'status' | 'commercialStatus' | 'harvest' | 'sacks' | 'period';

interface HiddenFilters {
  owner: string;
  buyer: string;
  statusGroup: StatusGroupFilter;
  commercialStatus: '' | CommercialStatus;
  harvest: string;
  sacksMin: string;
  sacksMax: string;
  periodMode: PeriodMode;
  periodValue: string;
}

const EMPTY_HIDDEN_FILTERS: HiddenFilters = {
  owner: '',
  buyer: '',
  statusGroup: '',
  commercialStatus: '',
  harvest: '',
  sacksMin: '',
  sacksMax: '',
  periodMode: 'exact',
  periodValue: ''
};

const FILTER_SECTION_ORDER: FilterSectionId[] = ['owner', 'buyer', 'status', 'commercialStatus', 'harvest', 'sacks', 'period'];

function renderSampleValue(value: string | number | null) {
  if (value === null || value === '') {
    return 'Nao informado';
  }

  return String(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}

function getStatusThemeClass(status: string): string {
  switch (status) {
    case 'REGISTRATION_CONFIRMED':
    case 'QR_PENDING_PRINT':
      return 'is-status-print-pending';
    case 'QR_PRINTED':
      return 'is-status-classification-pending';
    case 'CLASSIFICATION_IN_PROGRESS':
      return 'is-status-classification-progress';
    case 'CLASSIFIED':
      return 'is-status-success';
    case 'INVALIDATED':
      return 'is-status-danger';
    default:
      return 'is-status-neutral';
  }
}

function getCommercialLabel(status: string): string {
  switch (status) {
    case 'OPEN': return 'Em aberto';
    case 'PARTIALLY_SOLD': return 'Venda parcial';
    case 'SOLD': return 'Vendido';
    case 'LOST': return 'Perdido';
    default: return '';
  }
}

function getCommercialStatusTheme(status: string): string {
  switch (status) {
    case 'OPEN': return 'is-commercial-open';
    case 'PARTIALLY_SOLD': return 'is-commercial-partial';
    case 'SOLD': return 'is-commercial-sold';
    case 'LOST': return 'is-commercial-lost';
    default: return '';
  }
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

  return formatClientDocument(client.document ?? client.cpf ?? client.cnpj ?? null, client.personType);
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
  const phone = formatPhone(client.phone) ?? 'Sem telefone';
  return `Cod. ${client.code} | ${phone} | Insc. ${client.activeRegistrationCount}/${client.registrationCount}`;
}

function clientStatusBadgeClass(status: ClientStatus) {
  return status === 'ACTIVE' ? 'status-badge-success' : 'status-badge-muted';
}

function clientStatusLabel(status: ClientStatus) {
  return status === 'ACTIVE' ? 'Ativo' : 'Inativo';
}

function getClientStatusThemeClass(status: ClientStatus): string {
  return status === 'ACTIVE' ? 'is-status-success' : 'is-status-danger';
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
    filters.sacksMin.trim().length > 0 ||
    filters.sacksMax.trim().length > 0 ||
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
    sacksMin: filters.sacksMin.trim(),
    sacksMax: filters.sacksMax.trim(),
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
  if (filters.sacksMin.trim() || filters.sacksMax.trim()) count += 1;
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

function getStatusGroupLabel(value: StatusGroupFilter) {
  return STATUS_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? 'Todos os status';
}

function getCommercialStatusLabel(value: '' | CommercialStatus) {
  return COMMERCIAL_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? 'Qualquer status';
}

function formatPeriodSummary(filters: HiddenFilters) {
  const periodValue = filters.periodValue.trim();
  if (!periodValue) {
    return 'Qualquer data';
  }

  if (filters.periodMode === 'month') {
    const [year, month] = periodValue.split('-');
    return year && month ? `Mes ${month}/${year}` : `Mes ${periodValue}`;
  }

  if (filters.periodMode === 'year') {
    return `Ano ${periodValue}`;
  }

  const [year, month, day] = periodValue.split('-');
  return year && month && day ? `Data ${day}/${month}/${year}` : `Data ${periodValue}`;
}

function formatSacksSummary(filters: HiddenFilters) {
  const sacksMin = filters.sacksMin.trim();
  const sacksMax = filters.sacksMax.trim();

  if (sacksMin && sacksMax) {
    return `De ${sacksMin} ate ${sacksMax}`;
  }

  if (sacksMin) {
    return `Minimo ${sacksMin}`;
  }

  if (sacksMax) {
    return `Ate ${sacksMax}`;
  }

  return 'Qualquer volume';
}

function hasFilterSectionValue(sectionId: FilterSectionId, filters: HiddenFilters) {
  if (sectionId === 'owner') {
    return filters.owner.trim().length > 0;
  }

  if (sectionId === 'buyer') {
    return filters.buyer.trim().length > 0;
  }

  if (sectionId === 'status') {
    return filters.statusGroup.length > 0;
  }

  if (sectionId === 'commercialStatus') {
    return filters.commercialStatus.length > 0;
  }

  if (sectionId === 'harvest') {
    return filters.harvest.trim().length > 0;
  }

  if (sectionId === 'sacks') {
    return filters.sacksMin.trim().length > 0 || filters.sacksMax.trim().length > 0;
  }

  return filters.periodValue.trim().length > 0;
}

function getFilterSectionSummary(sectionId: FilterSectionId, filters: HiddenFilters) {
  if (sectionId === 'owner') {
    return filters.owner.trim() || 'Qualquer proprietario';
  }

  if (sectionId === 'buyer') {
    return filters.buyer.trim() || 'Qualquer comprador';
  }

  if (sectionId === 'status') {
    return getStatusGroupLabel(filters.statusGroup);
  }

  if (sectionId === 'commercialStatus') {
    return getCommercialStatusLabel(filters.commercialStatus);
  }

  if (sectionId === 'harvest') {
    return filters.harvest.trim() || 'Qualquer safra';
  }

  if (sectionId === 'sacks') {
    return formatSacksSummary(filters);
  }

  return formatPeriodSummary(filters);
}

function getInitialFilterSection(filters: HiddenFilters): FilterSectionId {
  return FILTER_SECTION_ORDER.find((sectionId) => hasFilterSectionValue(sectionId, filters)) ?? 'owner';
}

/* ── Samples list reducer ── */

interface SamplesListState {
  items: SampleSnapshot[];
  total: number;
  totalPages: number;
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  loading: boolean;
  error: string | null;
}

type SamplesListAction =
  | { type: 'fetch' }
  | { type: 'success'; items: SampleSnapshot[]; total: number; totalPages: number; hasPrev: boolean; hasNext: boolean }
  | { type: 'error'; message: string }
  | { type: 'setPage'; page: number };

const SAMPLES_INITIAL: SamplesListState = {
  items: [],
  total: 0,
  totalPages: 1,
  currentPage: 1,
  hasPrev: false,
  hasNext: false,
  loading: true,
  error: null
};

function samplesListReducer(state: SamplesListState, action: SamplesListAction): SamplesListState {
  switch (action.type) {
    case 'fetch':
      return { ...state, loading: true, error: null };
    case 'success':
      return {
        ...state,
        items: action.items,
        total: action.total,
        totalPages: action.totalPages,
        hasPrev: action.hasPrev,
        hasNext: action.hasNext,
        loading: false,
        error: null
      };
    case 'error':
      return { ...state, loading: false, error: action.message };
    case 'setPage':
      return { ...state, currentPage: action.page };
    default:
      return state;
  }
}

/* ── Clients list reducer ── */

interface ClientsListState {
  items: ClientSummary[];
  total: number;
  totalPages: number;
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  detail: ClientSummary | null;
  registrations: ClientRegistrationSummary[];
  detailOpen: boolean;
  detailLoading: boolean;
  detailError: string | null;
}

type ClientsListAction =
  | { type: 'fetch' }
  | { type: 'success'; items: ClientSummary[]; total: number; totalPages: number; hasPrev: boolean; hasNext: boolean }
  | { type: 'error'; message: string }
  | { type: 'setPage'; page: number }
  | { type: 'selectClient'; id: string | null }
  | { type: 'openDetail' }
  | { type: 'closeDetail' }
  | { type: 'fetchDetail' }
  | { type: 'detailSuccess'; client: ClientSummary; registrations: ClientRegistrationSummary[] }
  | { type: 'detailError'; message: string };

const CLIENTS_INITIAL: ClientsListState = {
  items: [],
  total: 0,
  totalPages: 1,
  currentPage: 1,
  hasPrev: false,
  hasNext: false,
  loading: false,
  error: null,
  selectedId: null,
  detail: null,
  registrations: [],
  detailOpen: false,
  detailLoading: false,
  detailError: null
};

function clientsListReducer(state: ClientsListState, action: ClientsListAction): ClientsListState {
  switch (action.type) {
    case 'fetch':
      return { ...state, loading: true, error: null };
    case 'success':
      return {
        ...state,
        items: action.items,
        total: action.total,
        totalPages: action.totalPages,
        hasPrev: action.hasPrev,
        hasNext: action.hasNext,
        loading: false,
        error: null
      };
    case 'error':
      return { ...state, loading: false, error: action.message };
    case 'setPage':
      return { ...state, currentPage: action.page };
    case 'selectClient':
      return { ...state, selectedId: action.id };
    case 'openDetail':
      return { ...state, detailOpen: true, detailError: null };
    case 'closeDetail':
      return { ...state, detailOpen: false, detail: null, registrations: [], detailError: null };
    case 'fetchDetail':
      return { ...state, detailLoading: true, detailError: null };
    case 'detailSuccess':
      return { ...state, detailLoading: false, detail: action.client, registrations: action.registrations, detailError: null };
    case 'detailError':
      return { ...state, detailLoading: false, detailError: action.message };
    default:
      return state;
  }
}

export default function SamplesPageWrapper() {
  return (
    <Suspense>
      <SamplesPage />
    </Suspense>
  );
}

function SamplesPage() {
  const { session, loading, logout } = useRequireAuth();
  const searchParams = useSearchParams();
  const [recordsMode, setRecordsMode] = useState<RecordsMode>(() =>
    searchParams.get('mode') === 'clients' ? 'clients' : 'samples'
  );

  const [samplesState, dispatchSamples] = useReducer(samplesListReducer, SAMPLES_INITIAL);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [draftHiddenFilters, setDraftHiddenFilters] = useState<HiddenFilters>(EMPTY_HIDDEN_FILTERS);
  const [appliedHiddenFilters, setAppliedHiddenFilters] = useState<HiddenFilters>(EMPTY_HIDDEN_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersTrapRef = useFocusTrap(filtersOpen);
  const [activeFilterSection, setActiveFilterSection] = useState<FilterSectionId | null>('owner');

  const [clientsState, dispatchClients] = useReducer(clientsListReducer, CLIENTS_INITIAL);
  const clientDetailTrapRef = useFocusTrap(clientsState.detail !== null);
  const [clientSearchInput, setClientSearchInput] = useState('');
  const [appliedClientSearch, setAppliedClientSearch] = useState('');
  const [clientQuickCreateOpen, setClientQuickCreateOpen] = useState(false);
  const clientSearchDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (recordsMode !== 'clients') {
      return;
    }

    if (clientSearchDebounceRef.current !== null) {
      window.clearTimeout(clientSearchDebounceRef.current);
    }

    const trimmed = clientSearchInput.trim();
    if (trimmed === appliedClientSearch) {
      return;
    }

    clientSearchDebounceRef.current = window.setTimeout(() => {
      clientSearchDebounceRef.current = null;
      setAppliedClientSearch(trimmed);
      dispatchClients({ type: 'setPage', page: 1 });
    }, 400);

    return () => {
      if (clientSearchDebounceRef.current !== null) {
        window.clearTimeout(clientSearchDebounceRef.current);
        clientSearchDebounceRef.current = null;
      }
    };
  }, [clientSearchInput, recordsMode, appliedClientSearch]);

  const samplesScrollRef = useRef<HTMLDivElement | null>(null);
  const clientsScrollRef = useRef<HTMLDivElement | null>(null);
  const filterCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFilterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const filterSectionRefs = useRef<Partial<Record<FilterSectionId, HTMLElement | null>>>({});
  const clientDetailCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastClientTriggerRef = useRef<HTMLButtonElement | null>(null);
  const hasDraftHiddenFilters = useMemo(() => hasAnyHiddenFilter(draftHiddenFilters), [draftHiddenFilters]);
  const hasAppliedHiddenFilters = useMemo(() => hasAnyHiddenFilter(appliedHiddenFilters), [appliedHiddenFilters]);
  const activeHiddenFiltersCount = useMemo(() => countActiveHiddenFilters(appliedHiddenFilters), [appliedHiddenFilters]);
  const filterSections = useMemo<Array<{ id: FilterSectionId; label: string; summary: string; active: boolean }>>(() => [
    { id: 'owner', label: 'Proprietario', summary: getFilterSectionSummary('owner', draftHiddenFilters), active: hasFilterSectionValue('owner', draftHiddenFilters) },
    { id: 'buyer', label: 'Comprador', summary: getFilterSectionSummary('buyer', draftHiddenFilters), active: hasFilterSectionValue('buyer', draftHiddenFilters) },
    { id: 'status', label: 'Status', summary: getFilterSectionSummary('status', draftHiddenFilters), active: hasFilterSectionValue('status', draftHiddenFilters) },
    { id: 'commercialStatus', label: 'Status comercial', summary: getFilterSectionSummary('commercialStatus', draftHiddenFilters), active: hasFilterSectionValue('commercialStatus', draftHiddenFilters) },
    { id: 'harvest', label: 'Safra', summary: getFilterSectionSummary('harvest', draftHiddenFilters), active: hasFilterSectionValue('harvest', draftHiddenFilters) },
    { id: 'sacks', label: 'Sacas', summary: getFilterSectionSummary('sacks', draftHiddenFilters), active: hasFilterSectionValue('sacks', draftHiddenFilters) },
    { id: 'period', label: 'Periodo', summary: getFilterSectionSummary('period', draftHiddenFilters), active: hasFilterSectionValue('period', draftHiddenFilters) }
  ], [draftHiddenFilters]);

  useEffect(() => {
    samplesScrollRef.current?.scrollTo({ top: 0 });
  }, [samplesState.currentPage]);

  useEffect(() => {
    clientsScrollRef.current?.scrollTo({ top: 0 });
  }, [clientsState.currentPage]);

  useEffect(() => {
    if (recordsMode !== 'samples') {
      setFiltersOpen(false);
      setDraftHiddenFilters(appliedHiddenFilters);
      setActiveFilterSection(getInitialFilterSection(appliedHiddenFilters));
    }
  }, [appliedHiddenFilters, recordsMode]);

  useEffect(() => {
    if (!filtersOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeFilters();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onDocumentKeyDown);
    const openFocusTimer = window.setTimeout(() => {
      filterCloseButtonRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(openFocusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onDocumentKeyDown);
      window.setTimeout(() => {
        lastFilterTriggerRef.current?.focus();
      }, 0);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!filtersOpen || !activeFilterSection) {
      return;
    }

    const currentSection = filterSectionRefs.current[activeFilterSection];
    if (!currentSection || !currentSection.isConnected) {
      return;
    }

    const scrollTimer = window.setTimeout(() => {
      if (currentSection.isConnected) {
        currentSection.scrollIntoView({
          block: 'start',
          inline: 'nearest'
        });
      }
    }, 0);

    return () => window.clearTimeout(scrollTimer);
  }, [activeFilterSection, filtersOpen]);

  useEffect(() => {
    if (!session || recordsMode !== 'samples') {
      return;
    }

    const abortController = new AbortController();
    let active = true;
    dispatchSamples({ type: 'fetch' });

    listSamples(
      session,
      {
        limit: SAMPLE_PAGE_LIMIT,
        page: samplesState.currentPage,
        search: appliedSearch || undefined,
        owner: appliedHiddenFilters.owner || undefined,
        buyer: appliedHiddenFilters.buyer || undefined,
        statusGroup: appliedHiddenFilters.statusGroup || undefined,
        commercialStatus: appliedHiddenFilters.commercialStatus || undefined,
        harvest: appliedHiddenFilters.harvest || undefined,
        sacksMin: appliedHiddenFilters.sacksMin || undefined,
        sacksMax: appliedHiddenFilters.sacksMax || undefined,
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

        dispatchSamples({ type: 'success', items: response.items, total: response.page.total, totalPages: response.page.totalPages, hasPrev: response.page.hasPrev, hasNext: response.page.hasNext });
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }

        dispatchSamples({ type: 'error', message: cause instanceof ApiError ? cause.message : 'Falha ao carregar registros' });
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [appliedHiddenFilters, appliedSearch, samplesState.currentPage, recordsMode, session]);

  useEffect(() => {
    if (!session || recordsMode !== 'clients') {
      return;
    }

    const abortController = new AbortController();
    let active = true;
    dispatchClients({ type: 'fetch' });

    listClients(session, {
      search: appliedClientSearch || undefined,
      page: clientsState.currentPage,
      limit: CLIENT_PAGE_LIMIT
    }, { signal: abortController.signal })
      .then((response) => {
        if (!active) {
          return;
        }

        dispatchClients({ type: 'success', items: response.items, total: response.page.total, totalPages: response.page.totalPages, hasPrev: response.page.hasPrev, hasNext: response.page.hasNext });
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }

        dispatchClients({ type: 'error', message: cause instanceof ApiError ? cause.message : 'Falha ao carregar clientes' });
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [appliedClientSearch, clientsState.currentPage, recordsMode, session]);

  useEffect(() => {
    if (!session || !clientsState.detailOpen || !clientsState.selectedId) {
      return;
    }

    const abortController = new AbortController();
    let active = true;
    dispatchClients({ type: 'fetchDetail' });

    getClient(session, clientsState.selectedId, { signal: abortController.signal })
      .then((response) => {
        if (!active) {
          return;
        }

        dispatchClients({ type: 'detailSuccess', client: response.client, registrations: response.registrations });
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }

        dispatchClients({ type: 'detailError', message: cause instanceof ApiError ? cause.message : 'Falha ao carregar detalhes do cliente' });
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [clientsState.detailOpen, clientsState.selectedId, session]);

  useEffect(() => {
    if (!clientsState.detailOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      dispatchClients({ type: 'closeDetail' });
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    const openFocusTimer = window.setTimeout(() => {
      clientDetailCloseButtonRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(openFocusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        if (lastClientTriggerRef.current && document.body.contains(lastClientTriggerRef.current)) {
          lastClientTriggerRef.current.focus();
        } else {
          clientsScrollRef.current?.focus();
        }
      }, 0);
    };
  }, [clientsState.detailOpen]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
    dispatchSamples({ type: 'setPage', page: 1 });
  }

  function handleClientSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (clientSearchDebounceRef.current !== null) {
      window.clearTimeout(clientSearchDebounceRef.current);
      clientSearchDebounceRef.current = null;
    }
    setAppliedClientSearch(clientSearchInput.trim());
    dispatchClients({ type: 'setPage', page: 1 });
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFilters = normalizeHiddenFilters(draftHiddenFilters);
    setAppliedHiddenFilters(nextFilters);
    setDraftHiddenFilters(nextFilters);
    dispatchSamples({ type: 'setPage', page: 1 });
    setActiveFilterSection(getInitialFilterSection(nextFilters));
    setFiltersOpen(false);
  }

  function handleClearFiltersOnly() {
    setDraftHiddenFilters(EMPTY_HIDDEN_FILTERS);
    setAppliedHiddenFilters(EMPTY_HIDDEN_FILTERS);
    setActiveFilterSection('owner');
    dispatchSamples({ type: 'setPage', page: 1 });
  }

  function handleRecordsModeChange(nextMode: RecordsMode) {
    setRecordsMode(nextMode);
    setFiltersOpen(false);
    if (nextMode !== 'clients') {
      dispatchClients({ type: 'closeDetail' });
    }
  }

  function openClientDetail(clientId: string, trigger: HTMLButtonElement) {
    lastClientTriggerRef.current = trigger;
    dispatchClients({ type: 'selectClient', id: clientId });
    dispatchClients({ type: 'openDetail' });
  }

  function closeClientDetail() {
    dispatchClients({ type: 'closeDetail' });
  }

  function openFilters(trigger: HTMLButtonElement) {
    lastFilterTriggerRef.current = trigger;
    setDraftHiddenFilters(appliedHiddenFilters);
    setActiveFilterSection(getInitialFilterSection(appliedHiddenFilters));
    setFiltersOpen(true);
  }

  function closeFilters() {
    setDraftHiddenFilters(appliedHiddenFilters);
    setActiveFilterSection(getInitialFilterSection(appliedHiddenFilters));
    setFiltersOpen(false);
  }

  function toggleFilterSection(sectionId: FilterSectionId) {
    setActiveFilterSection((current) => (current === sectionId ? null : sectionId));
  }

  async function refreshClientsList(nextSearch = appliedClientSearch, nextPage = clientsState.currentPage) {
    if (!session) {
      return;
    }

    dispatchClients({ type: 'fetch' });

    try {
      const response = await listClients(session, {
        search: nextSearch || undefined,
        page: nextPage,
        limit: CLIENT_PAGE_LIMIT
      });

      dispatchClients({
        type: 'success',
        items: response.items,
        total: response.page.total,
        totalPages: response.page.totalPages,
        hasPrev: response.page.hasPrev,
        hasNext: response.page.hasNext
      });
    } catch (cause) {
      dispatchClients({
        type: 'error',
        message: cause instanceof ApiError ? cause.message : 'Falha ao carregar clientes'
      });
    }
  }

  if (loading || !session) {
    return null;
  }

  const selectedClientDocument = clientDocument(clientsState.detail);
  const selectedClientRoles = [
    clientsState.detail?.isSeller ? 'Proprietario/Vendedor' : null,
    clientsState.detail?.isBuyer ? 'Comprador' : null
  ].filter((value): value is string => Boolean(value));
  const currentVisiblePage = recordsMode === 'samples' ? samplesState.currentPage : clientsState.currentPage;
  const currentVisibleTotalPages = recordsMode === 'samples' ? samplesState.totalPages : clientsState.totalPages;
  const paginationHasPrev = recordsMode === 'samples' ? samplesState.hasPrev : clientsState.hasPrev;
  const paginationHasNext = recordsMode === 'samples' ? samplesState.hasNext : clientsState.hasNext;
  const paginationBusy = recordsMode === 'samples' ? samplesState.loading : clientsState.loading;
  const currentTotalLabel = recordsMode === 'samples' ? `${samplesState.total} registros` : `${clientsState.total} clientes`;

  function renderFilterFields() {
    return (
      <div className="samples-filter-fields">
        <label className="samples-filter-field">
          <span className="samples-filter-field-label">Proprietario</span>
          <input
            className="samples-filter-field-input"
            value={draftHiddenFilters.owner}
            onChange={(event) => setDraftHiddenFilters((c) => ({ ...c, owner: event.target.value }))}
            placeholder="Nome do proprietario"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className="samples-filter-field">
          <span className="samples-filter-field-label">Comprador</span>
          <input
            className="samples-filter-field-input"
            value={draftHiddenFilters.buyer}
            onChange={(event) => setDraftHiddenFilters((c) => ({ ...c, buyer: event.target.value }))}
            placeholder="Nome, documento ou codigo"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className="samples-filter-field">
          <span className="samples-filter-field-label">Comercial</span>
          <div className="samples-filter-chip-row">
            {COMMERCIAL_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`samples-filter-chip${draftHiddenFilters.commercialStatus === option.value ? ' is-selected' : ''}`}
                onClick={() => setDraftHiddenFilters((c) => ({ ...c, commercialStatus: c.commercialStatus === option.value ? '' : option.value }))}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="samples-filter-field">
          <span className="samples-filter-field-label">Safra</span>
          <div className="samples-filter-chip-row">
            {HARVEST_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`samples-filter-chip${draftHiddenFilters.harvest === option ? ' is-selected' : ''}`}
                onClick={() => setDraftHiddenFilters((c) => ({ ...c, harvest: c.harvest === option ? '' : option }))}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="samples-filter-field">
          <span className="samples-filter-field-label">Sacas</span>
          <div className="samples-filter-split-grid">
            <input
              className="samples-filter-field-input"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={draftHiddenFilters.sacksMin}
              onChange={(event) => setDraftHiddenFilters((c) => ({ ...c, sacksMin: event.target.value.replace(/\D+/g, '') }))}
              placeholder="De"
            />
            <input
              className="samples-filter-field-input"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={draftHiddenFilters.sacksMax}
              onChange={(event) => setDraftHiddenFilters((c) => ({ ...c, sacksMax: event.target.value.replace(/\D+/g, '') }))}
              placeholder="Ate"
            />
          </div>
        </div>

        <div className="samples-filter-field">
          <span className="samples-filter-field-label">Periodo</span>
          <div className="samples-filter-split-grid">
            <select
              className="samples-filter-field-input"
              value={draftHiddenFilters.periodMode}
              onChange={(event) => setDraftHiddenFilters((c) => ({ ...c, periodMode: event.target.value as PeriodMode, periodValue: '' }))}
            >
              <option value="exact">Data</option>
              <option value="month">Mes</option>
              <option value="year">Ano</option>
            </select>
            <input
              className="samples-filter-field-input"
              type={getPeriodInputType(draftHiddenFilters.periodMode)}
              value={draftHiddenFilters.periodValue}
              onChange={(event) => setDraftHiddenFilters((c) => ({ ...c, periodValue: normalizePeriodValueForMode(c.periodMode, event.target.value) }))}
              placeholder={getPeriodPlaceholder(draftHiddenFilters.periodMode)}
              inputMode={draftHiddenFilters.periodMode === 'year' ? 'numeric' : undefined}
              min={draftHiddenFilters.periodMode === 'year' ? '2000' : undefined}
              max={draftHiddenFilters.periodMode === 'year' ? '2100' : undefined}
              step={draftHiddenFilters.periodMode === 'year' ? '1' : undefined}
            />
          </div>
        </div>
      </div>
    );
  }

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
            <div className="samples-page-filter-control">
              <button
                type="button"
                className={`samples-page-filter-toggle${filtersOpen ? ' is-open' : ''}`}
                aria-haspopup="dialog"
                aria-expanded={filtersOpen}
                aria-controls="samples-filter-modal"
                aria-label={filtersOpen ? 'Fechar filtros' : 'Abrir filtros'}
                onClick={(event) => {
                  if (filtersOpen) {
                    closeFilters();
                    return;
                  }

                  openFilters(event.currentTarget);
                }}
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M4 6h16" />
                  <path d="M7 12h10" />
                  <path d="M10 18h4" />
                </svg>
                {activeHiddenFiltersCount > 0 ? <span className="samples-page-filter-badge">{activeHiddenFiltersCount}</span> : null}
              </button>
            </div>
          ) : null}
        </div>

        {recordsMode === 'samples' ? (samplesState.error ? <p className="error">{samplesState.error}</p> : null) : clientsState.error ? <p className="error">{clientsState.error}</p> : null}

        {recordsMode === 'samples' ? (
          samplesState.loading ? (
            <section className="samples-page-list-area">
              <header className="samples-page-list-header">
                <p className="samples-page-list-total">{currentTotalLabel}</p>
              </header>
              <div className="samples-page-list-state">
                <p className="samples-page-empty">Carregando registros...</p>
              </div>
            </section>
          ) : samplesState.items.length === 0 ? (
            <section className="samples-page-list-area">
              <header className="samples-page-list-header">
                <p className="samples-page-list-total">{currentTotalLabel}</p>
              </header>
              <div className="samples-page-list-state">
                <p className="samples-page-empty">
                  {appliedSearch || hasAppliedHiddenFilters ? 'Nenhum registro encontrado para a pesquisa aplicada.' : 'Nenhum registro cadastrado.'}
                </p>
              </div>
            </section>
          ) : (
            <section className="samples-page-list-area">
              <header className="samples-page-list-header">
                <p className="samples-page-list-total">{currentTotalLabel}</p>
              </header>
              <div ref={samplesScrollRef} className="samples-page-list-scroll" aria-label="Lista de registros cadastrados">
                <div className="samples-page-list">
                  {samplesState.items.map((sample) => (
                    <Link key={sample.id} href={`/samples/${sample.id}`} className={`dashboard-latest-registration-card samples-page-item ${getStatusThemeClass(sample.status)}`}>
                      <div className="samples-page-item-main">
                        <p className="dashboard-latest-registration-title">{sample.internalLotNumber ?? sample.id}</p>
                        <p className="dashboard-latest-registration-subtitle">{formatSampleCardSummary(sample)}</p>
                        <p className="dashboard-latest-registration-meta">{formatSampleCardMeta(sample)}</p>
                      </div>

                      <div className="samples-page-item-indicator">
                        <span className={`samples-page-item-commercial ${getCommercialStatusTheme(sample.commercialStatus)}`}>
                          {getCommercialLabel(sample.commercialStatus)}
                        </span>
                        <span className="samples-page-item-dot" aria-hidden="true" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )
        ) : clientsState.loading ? (
          <section className="samples-page-list-area">
            <header className="samples-page-list-header">
              <p className="samples-page-list-total">{currentTotalLabel}</p>
            </header>
            <div className="samples-page-list-state">
              <p className="samples-page-empty">Carregando clientes...</p>
            </div>
          </section>
        ) : clientsState.items.length === 0 ? (
          <section className="samples-page-list-area">
            <header className="samples-page-list-header">
              <p className="samples-page-list-total">{currentTotalLabel}</p>
            </header>
            <div className="samples-page-list-state">
              <p className="samples-page-empty">
                {appliedClientSearch ? 'Nenhum cliente encontrado para a pesquisa aplicada.' : 'Nenhum cliente cadastrado.'}
              </p>
            </div>
          </section>
        ) : (
          <section className="samples-page-list-area">
            <header className="samples-page-list-header">
              <p className="samples-page-list-total">{currentTotalLabel}</p>
            </header>
            <div ref={clientsScrollRef} className="samples-page-list-scroll" aria-label="Lista de clientes cadastrados" tabIndex={-1}>
              <div className="samples-page-list">
                {clientsState.items.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    className={`samples-page-item records-client-card ${getClientStatusThemeClass(client.status)}`}
                    onClick={(event) => openClientDetail(client.id, event.currentTarget)}
                  >
                    <div className="samples-page-item-main">
                      <p className="dashboard-latest-registration-title">{clientDisplayName(client)}</p>
                      <p className="dashboard-latest-registration-subtitle">{formatClientCardSummary(client)}</p>
                      <p className="dashboard-latest-registration-meta">{formatClientCardMeta(client)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        <footer className="samples-page-footer">
          <div className="samples-page-pagination-controls" role="group" aria-label="Paginacao da lista">
            <button
              type="button"
              className="samples-page-pagination-button"
              aria-label="Pagina anterior"
              disabled={!paginationHasPrev || paginationBusy}
              onClick={() => {
                if (recordsMode === 'samples') {
                  dispatchSamples({ type: 'setPage', page: samplesState.currentPage - 1 });
                  return;
                }

                dispatchClients({ type: 'setPage', page: clientsState.currentPage - 1 });
              }}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="m14.5 6-6 6 6 6" />
              </svg>
              <span className="login-visually-hidden">Anterior</span>
            </button>
            <p className="samples-page-pagination-counter">
              <strong>{currentVisiblePage}</strong>
              <span>/</span>
              <span>{currentVisibleTotalPages}</span>
            </p>
            <button
              type="button"
              className="samples-page-pagination-button"
              aria-label="Proxima pagina"
              disabled={!paginationHasNext || paginationBusy}
              onClick={() => {
                if (recordsMode === 'samples') {
                  dispatchSamples({ type: 'setPage', page: samplesState.currentPage + 1 });
                  return;
                }

                dispatchClients({ type: 'setPage', page: clientsState.currentPage + 1 });
              }}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="m9.5 6 6 6-6 6" />
              </svg>
              <span className="login-visually-hidden">Proximo</span>
            </button>
          </div>
        </footer>
      </section>

      {filtersOpen ? (
        <div className="app-modal-backdrop samples-filter-modal-backdrop" onClick={closeFilters}>
          <section
            ref={filtersTrapRef}
            id="samples-filter-modal"
            className="app-modal samples-filter-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="samples-filter-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header samples-filter-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="samples-filter-modal-title" className="app-modal-title">
                  Filtros
                </h3>
              </div>
              <button
                ref={filterCloseButtonRef}
                type="button"
                className="app-modal-close"
                onClick={closeFilters}
                aria-label="Fechar filtros"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <form className="samples-filter-modal-form" onSubmit={handleApplyFilters}>
              <div className="samples-filter-modal-content">
                {renderFilterFields()}
              </div>

              <div className="app-modal-actions samples-filter-modal-actions">
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={handleClearFiltersOnly}
                  disabled={!hasDraftHiddenFilters && !hasAppliedHiddenFilters}
                >
                  Limpar
                </button>
                <button type="submit" className="app-modal-submit">
                  Aplicar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {clientsState.detailOpen ? (
        <div className="client-modal-backdrop" onClick={closeClientDetail}>
          <section
            ref={clientDetailTrapRef}
            className="client-modal panel stack records-client-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="records-client-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="client-modal-header">
              <div className="records-client-detail-header-copy">
                <h3 id="records-client-detail-title" style={{ margin: 0 }}>
                  {clientsState.detail ? clientDisplayName(clientsState.detail) : 'Cliente'}
                </h3>
                {clientsState.detail ? (
                  <div className="records-client-detail-header-meta">
                    <span className="records-client-detail-code">Codigo {clientsState.detail.code}</span>
                    <span className={`status-badge records-client-status-badge ${clientStatusBadgeClass(clientsState.detail.status)}`}>
                      {clientStatusLabel(clientsState.detail.status)}
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

            {clientsState.detailLoading ? (
              <p style={{ margin: 0, color: 'var(--muted)' }}>Carregando detalhes do cliente...</p>
            ) : clientsState.detailError ? (
              <p className="error" style={{ margin: 0 }}>
                {clientsState.detailError}
              </p>
            ) : clientsState.detail ? (
              <>
                <article className="panel stack records-client-detail-summary">
                  <p className="records-client-detail-line">
                    <strong>Documento:</strong> {selectedClientDocument ?? 'Nao informado'}
                  </p>
                  <p className="records-client-detail-line">
                    <strong>Telefone:</strong> {formatPhone(clientsState.detail.phone) ?? 'Nao informado'}
                  </p>
                  <p className="records-client-detail-line">
                    <strong>Tipo:</strong> {clientsState.detail.personType}
                  </p>
                  <p className="records-client-detail-line">
                    <strong>Inscricoes:</strong> {clientsState.detail.activeRegistrationCount}/{clientsState.detail.registrationCount} ativas
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
                    <span style={{ color: 'var(--muted)' }}>{clientsState.registrations.length}</span>
                  </div>

                  {clientsState.registrations.length === 0 ? (
                    <p style={{ margin: 0, color: 'var(--muted)' }}>Nenhuma inscricao cadastrada.</p>
                  ) : (
                    <div className="clients-registration-list">
                      {clientsState.registrations.map((registration) => (
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

                <Link
                  href={`/clients/${clientsState.detail.id}`}
                  className="records-client-detail-manage-link"
                >
                  Gerenciar cliente
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </Link>
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
        initialSearch={clientSearchInput.trim()}
        initialPersonType="PJ"
        initialIsSeller
        initialIsBuyer={false}
        onClose={() => setClientQuickCreateOpen(false)}
        onCreated={async (client) => {
          setClientQuickCreateOpen(false);
          setRecordsMode('clients');
          setClientSearchInput('');
          setAppliedClientSearch('');
          dispatchClients({ type: 'setPage', page: 1 });
          await refreshClientsList('', 1);
          dispatchClients({ type: 'selectClient', id: client.id });
          dispatchClients({ type: 'openDetail' });
        }}
      />
    </AppShell>
  );
}
