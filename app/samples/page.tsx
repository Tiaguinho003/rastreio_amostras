'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { AppShell } from '../../components/AppShell';
import { CommercialStatusBadge } from '../../components/CommercialStatusBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError, listSamples } from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { CommercialStatus, SampleSnapshot } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';

const SAMPLE_PAGE_LIMIT = 15;
const HARVEST_OPTIONS = ['24/25', '25/26'] as const;
const STATUS_FILTER_OPTIONS = [
  { value: 'PRINT_PENDING', label: 'Impressao pendente' },
  { value: 'CLASSIFICATION_PENDING', label: 'Classificacao pendente' },
  { value: 'CLASSIFIED', label: 'Classificada' },
] as const;
const COMMERCIAL_FILTER_OPTIONS: Array<{ value: CommercialStatus; label: string }> = [
  { value: 'OPEN', label: 'Em aberto' },
  { value: 'PARTIALLY_SOLD', label: 'Venda parcial' },
  { value: 'SOLD', label: 'Vendido' },
  { value: 'LOST', label: 'Perdido' },
];
type PeriodMode = 'exact' | 'month' | 'year';
type StatusGroupFilter = '' | (typeof STATUS_FILTER_OPTIONS)[number]['value'];
type FilterSectionId =
  | 'owner'
  | 'buyer'
  | 'status'
  | 'commercialStatus'
  | 'harvest'
  | 'sacks'
  | 'period';

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
  periodValue: '',
};

const AGING_BANDS = ['over30', 'from15to30', 'under15'] as const;
type AgingBand = (typeof AGING_BANDS)[number];
const AGING_LABELS: Record<AgingBand, string> = {
  over30: 'Mais de 30 dias',
  from15to30: 'Entre 15 e 30 dias',
  under15: 'Ate 15 dias',
};

const FILTER_SECTION_ORDER: FilterSectionId[] = [
  'owner',
  'buyer',
  'status',
  'commercialStatus',
  'harvest',
  'sacks',
  'period',
];

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
    case 'OPEN':
      return 'Em aberto';
    case 'PARTIALLY_SOLD':
      return 'Venda parcial';
    case 'SOLD':
      return 'Vendido';
    case 'LOST':
      return 'Perdido';
    default:
      return '';
  }
}

function getCommercialStatusTheme(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'is-commercial-open';
    case 'PARTIALLY_SOLD':
      return 'is-commercial-partial';
    case 'SOLD':
      return 'is-commercial-sold';
    case 'LOST':
      return 'is-commercial-lost';
    default:
      return '';
  }
}

function getCardStatusColor(status: string): string {
  switch (status) {
    case 'REGISTRATION_CONFIRMED':
    case 'QR_PENDING_PRINT':
      return '#C0392B';
    case 'QR_PRINTED':
      return '#E67E22';
    case 'CLASSIFICATION_IN_PROGRESS':
      return '#2980B9';
    case 'CLASSIFIED':
      return '#27AE60';
    case 'INVALIDATED':
      return '#C0392B';
    default:
      return '#999';
  }
}

function getCardStatusLabel(status: string): string {
  switch (status) {
    case 'REGISTRATION_CONFIRMED':
    case 'QR_PENDING_PRINT':
      return 'Em aberto';
    case 'QR_PRINTED':
      return 'Impressa';
    case 'CLASSIFICATION_IN_PROGRESS':
      return 'Classificando';
    case 'CLASSIFIED':
      return 'Finalizada';
    case 'INVALIDATED':
      return 'Invalidada';
    default:
      return '';
  }
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
    periodValue: filters.periodValue.trim(),
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
  return (
    COMMERCIAL_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? 'Qualquer status'
  );
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
  return (
    FILTER_SECTION_ORDER.find((sectionId) => hasFilterSectionValue(sectionId, filters)) ?? 'owner'
  );
}

/* ── Snapshot do estado da lista (preserva scroll e itens ao voltar da detail) ── */

const SAMPLES_SNAPSHOT_KEY = 'samples-list-snapshot-v1';

interface SamplesSnapshot {
  items: SampleSnapshot[];
  total: number;
  nextCursor: { createdAt: string; id: string } | null;
  scrollTop: number;
  searchInput: string;
  appliedSearch: string;
  appliedHiddenFilters: HiddenFilters;
  agingParam: string | null;
}

function readSamplesSnapshot(): SamplesSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SAMPLES_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed as SamplesSnapshot;
  } catch {
    return null;
  }
}

function writeSamplesSnapshot(snapshot: SamplesSnapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SAMPLES_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignora quota/serialization errors — snapshot é otimização, não crítico */
  }
}

function clearSamplesSnapshot() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SAMPLES_SNAPSHOT_KEY);
  } catch {
    /* ignora */
  }
}

/* ── Samples list reducer (scroll infinito com cursor) ── */

type SampleCursor = { createdAt: string; id: string };
type SamplesListStatus = 'loading-initial' | 'loading-more' | 'idle' | 'error';

interface SamplesListState {
  items: SampleSnapshot[];
  total: number;
  nextCursor: SampleCursor | null;
  status: SamplesListStatus;
  error: string | null;
}

type SamplesListAction =
  | { type: 'fetch-initial' }
  | { type: 'fetch-more' }
  | {
      type: 'success-initial';
      items: SampleSnapshot[];
      total: number;
      nextCursor: SampleCursor | null;
    }
  | {
      type: 'success-more';
      items: SampleSnapshot[];
      nextCursor: SampleCursor | null;
    }
  | { type: 'error'; message: string };

const SAMPLES_INITIAL: SamplesListState = {
  items: [],
  total: 0,
  nextCursor: null,
  status: 'loading-initial',
  error: null,
};

function samplesListReducer(state: SamplesListState, action: SamplesListAction): SamplesListState {
  switch (action.type) {
    case 'fetch-initial':
      return { ...SAMPLES_INITIAL, status: 'loading-initial' };
    case 'fetch-more':
      return { ...state, status: 'loading-more', error: null };
    case 'success-initial':
      return {
        items: action.items,
        total: action.total,
        nextCursor: action.nextCursor,
        status: 'idle',
        error: null,
      };
    case 'success-more':
      return {
        ...state,
        items: [...state.items, ...action.items],
        nextCursor: action.nextCursor,
        status: 'idle',
        error: null,
      };
    case 'error':
      return { ...state, status: 'error', error: action.message };
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
  const { session, loading, logout, setSession } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const agingParam = searchParams.get('aging');
  const activeAging: AgingBand | null =
    agingParam && AGING_BANDS.includes(agingParam as AgingBand) ? (agingParam as AgingBand) : null;

  const [initialSnapshot] = useState<SamplesSnapshot | null>(() => {
    const snap = readSamplesSnapshot();
    if (!snap) return null;
    if (snap.agingParam !== agingParam) {
      clearSamplesSnapshot();
      return null;
    }
    return snap;
  });

  const [samplesState, dispatchSamples] = useReducer(
    samplesListReducer,
    initialSnapshot,
    (snap): SamplesListState => {
      if (!snap) return SAMPLES_INITIAL;
      return {
        items: snap.items,
        total: snap.total,
        nextCursor: snap.nextCursor,
        status: 'idle',
        error: null,
      };
    }
  );
  const [searchInput, setSearchInput] = useState(() => initialSnapshot?.searchInput ?? '');
  const [appliedSearch, setAppliedSearch] = useState(() => initialSnapshot?.appliedSearch ?? '');
  const [draftHiddenFilters, setDraftHiddenFilters] = useState<HiddenFilters>(
    () => initialSnapshot?.appliedHiddenFilters ?? EMPTY_HIDDEN_FILTERS
  );
  const [appliedHiddenFilters, setAppliedHiddenFilters] = useState<HiddenFilters>(
    () => initialSnapshot?.appliedHiddenFilters ?? EMPTY_HIDDEN_FILTERS
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtersTrapRef = useFocusTrap(filtersOpen);
  const [activeFilterSection, setActiveFilterSection] = useState<FilterSectionId | null>(() =>
    initialSnapshot ? getInitialFilterSection(initialSnapshot.appliedHiddenFilters) : 'owner'
  );
  const skipNextFetchRef = useRef(initialSnapshot !== null);
  const pendingScrollRestoreRef = useRef<number | null>(
    initialSnapshot ? initialSnapshot.scrollTop : null
  );
  const samplesScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const filterCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFilterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const filterSectionRefs = useRef<Partial<Record<FilterSectionId, HTMLElement | null>>>({});
  const hasDraftHiddenFilters = useMemo(
    () => hasAnyHiddenFilter(draftHiddenFilters),
    [draftHiddenFilters]
  );
  const hasAppliedHiddenFilters = useMemo(
    () => hasAnyHiddenFilter(appliedHiddenFilters),
    [appliedHiddenFilters]
  );
  const activeHiddenFiltersCount = useMemo(
    () => countActiveHiddenFilters(appliedHiddenFilters),
    [appliedHiddenFilters]
  );
  const filterSections = useMemo<
    Array<{ id: FilterSectionId; label: string; summary: string; active: boolean }>
  >(
    () => [
      {
        id: 'owner',
        label: 'Proprietario',
        summary: getFilterSectionSummary('owner', draftHiddenFilters),
        active: hasFilterSectionValue('owner', draftHiddenFilters),
      },
      {
        id: 'buyer',
        label: 'Comprador',
        summary: getFilterSectionSummary('buyer', draftHiddenFilters),
        active: hasFilterSectionValue('buyer', draftHiddenFilters),
      },
      {
        id: 'status',
        label: 'Status',
        summary: getFilterSectionSummary('status', draftHiddenFilters),
        active: hasFilterSectionValue('status', draftHiddenFilters),
      },
      {
        id: 'commercialStatus',
        label: 'Status comercial',
        summary: getFilterSectionSummary('commercialStatus', draftHiddenFilters),
        active: hasFilterSectionValue('commercialStatus', draftHiddenFilters),
      },
      {
        id: 'harvest',
        label: 'Safra',
        summary: getFilterSectionSummary('harvest', draftHiddenFilters),
        active: hasFilterSectionValue('harvest', draftHiddenFilters),
      },
      {
        id: 'sacks',
        label: 'Sacas',
        summary: getFilterSectionSummary('sacks', draftHiddenFilters),
        active: hasFilterSectionValue('sacks', draftHiddenFilters),
      },
      {
        id: 'period',
        label: 'Periodo',
        summary: getFilterSectionSummary('period', draftHiddenFilters),
        active: hasFilterSectionValue('period', draftHiddenFilters),
      },
    ],
    [draftHiddenFilters]
  );

  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (pending === null) return;
    pendingScrollRestoreRef.current = null;
    samplesScrollRef.current?.scrollTo({ top: pending });
  }, []);

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
    // closeFilters e funcao local nao memoizada; effect deve disparar so quando filtersOpen muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          inline: 'nearest',
        });
      }
    }, 0);

    return () => window.clearTimeout(scrollTimer);
  }, [activeFilterSection, filtersOpen]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    const abortController = new AbortController();
    let active = true;
    dispatchSamples({ type: 'fetch-initial' });
    samplesScrollRef.current?.scrollTo({ top: 0 });

    listSamples(
      session,
      {
        limit: SAMPLE_PAGE_LIMIT,
        search: appliedSearch || undefined,
        owner: appliedHiddenFilters.owner || undefined,
        buyer: appliedHiddenFilters.buyer || undefined,
        statusGroup: appliedHiddenFilters.statusGroup || undefined,
        commercialStatus: appliedHiddenFilters.commercialStatus || undefined,
        harvest: appliedHiddenFilters.harvest || undefined,
        sacksMin: appliedHiddenFilters.sacksMin || undefined,
        sacksMax: appliedHiddenFilters.sacksMax || undefined,
        ...buildPeriodQuery(appliedHiddenFilters),
        classifiedAging: activeAging || undefined,
      },
      {
        signal: abortController.signal,
      }
    )
      .then((response) => {
        if (!active) {
          return;
        }

        dispatchSamples({
          type: 'success-initial',
          items: response.items,
          total: response.page.total,
          nextCursor: response.page.nextCursor,
        });
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }

        dispatchSamples({
          type: 'error',
          message: cause instanceof ApiError ? cause.message : 'Falha ao carregar registros',
        });
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [activeAging, appliedHiddenFilters, appliedSearch, session]);

  useEffect(() => {
    if (!session) return;
    if (samplesState.status !== 'idle') return;
    if (!samplesState.nextCursor) return;

    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const scrollRoot = samplesScrollRef.current;
    const cursor = samplesState.nextCursor;
    let abortController: AbortController | null = null;
    let cancelled = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (cancelled) return;

        abortController = new AbortController();
        dispatchSamples({ type: 'fetch-more' });

        listSamples(
          session,
          {
            limit: SAMPLE_PAGE_LIMIT,
            cursorCreatedAt: cursor.createdAt,
            cursorId: cursor.id,
            search: appliedSearch || undefined,
            owner: appliedHiddenFilters.owner || undefined,
            buyer: appliedHiddenFilters.buyer || undefined,
            statusGroup: appliedHiddenFilters.statusGroup || undefined,
            commercialStatus: appliedHiddenFilters.commercialStatus || undefined,
            harvest: appliedHiddenFilters.harvest || undefined,
            sacksMin: appliedHiddenFilters.sacksMin || undefined,
            sacksMax: appliedHiddenFilters.sacksMax || undefined,
            ...buildPeriodQuery(appliedHiddenFilters),
            classifiedAging: activeAging || undefined,
          },
          { signal: abortController.signal }
        )
          .then((response) => {
            if (cancelled) return;
            dispatchSamples({
              type: 'success-more',
              items: response.items,
              nextCursor: response.page.nextCursor,
            });
          })
          .catch((cause) => {
            if (cancelled) return;
            if (cause instanceof DOMException && cause.name === 'AbortError') return;
            dispatchSamples({
              type: 'error',
              message:
                cause instanceof ApiError ? cause.message : 'Falha ao carregar mais registros',
            });
          });
      },
      { root: scrollRoot, rootMargin: '200px' }
    );

    observer.observe(sentinel);

    return () => {
      cancelled = true;
      observer.disconnect();
      abortController?.abort();
    };
  }, [
    activeAging,
    appliedHiddenFilters,
    appliedSearch,
    samplesState.nextCursor,
    samplesState.status,
    session,
  ]);

  function clearAging() {
    clearSamplesSnapshot();
    router.replace('/samples', { scroll: false });
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeAging) clearAging();
    clearSamplesSnapshot();
    setAppliedSearch(searchInput.trim());
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeAging) clearAging();
    clearSamplesSnapshot();
    const nextFilters = normalizeHiddenFilters(draftHiddenFilters);
    setAppliedHiddenFilters(nextFilters);
    setDraftHiddenFilters(nextFilters);
    setActiveFilterSection(getInitialFilterSection(nextFilters));
    setFiltersOpen(false);
  }

  function handleClearFiltersOnly() {
    if (activeAging) clearAging();
    clearSamplesSnapshot();
    setDraftHiddenFilters(EMPTY_HIDDEN_FILTERS);
    setAppliedHiddenFilters(EMPTY_HIDDEN_FILTERS);
    setActiveFilterSection('owner');
  }

  const saveSnapshotBeforeLeave = useCallback(() => {
    writeSamplesSnapshot({
      items: samplesState.items,
      total: samplesState.total,
      nextCursor: samplesState.nextCursor,
      scrollTop: samplesScrollRef.current?.scrollTop ?? 0,
      searchInput,
      appliedSearch,
      appliedHiddenFilters,
      agingParam,
    });
  }, [
    samplesState.items,
    samplesState.total,
    samplesState.nextCursor,
    searchInput,
    appliedSearch,
    appliedHiddenFilters,
    agingParam,
  ]);

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

  if (loading || !session) {
    return null;
  }

  const isLoadingInitial = samplesState.status === 'loading-initial';
  const isLoadingMore = samplesState.status === 'loading-more';
  const hasReachedEnd =
    samplesState.status === 'idle' &&
    samplesState.items.length > 0 &&
    samplesState.nextCursor === null;

  function renderFilterFields() {
    return (
      <div className="samples-filter-fields">
        <label className="samples-filter-field">
          <span className="samples-filter-field-label">Proprietario</span>
          <input
            className="samples-filter-field-input"
            value={draftHiddenFilters.owner}
            onChange={(event) =>
              setDraftHiddenFilters((c) => ({ ...c, owner: event.target.value }))
            }
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
            onChange={(event) =>
              setDraftHiddenFilters((c) => ({ ...c, buyer: event.target.value }))
            }
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
                onClick={() =>
                  setDraftHiddenFilters((c) => ({
                    ...c,
                    commercialStatus: c.commercialStatus === option.value ? '' : option.value,
                  }))
                }
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
                onClick={() =>
                  setDraftHiddenFilters((c) => ({
                    ...c,
                    harvest: c.harvest === option ? '' : option,
                  }))
                }
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
              onChange={(event) =>
                setDraftHiddenFilters((c) => ({
                  ...c,
                  sacksMin: event.target.value.replace(/\D+/g, ''),
                }))
              }
              placeholder="De"
            />
            <input
              className="samples-filter-field-input"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={draftHiddenFilters.sacksMax}
              onChange={(event) =>
                setDraftHiddenFilters((c) => ({
                  ...c,
                  sacksMax: event.target.value.replace(/\D+/g, ''),
                }))
              }
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
              onChange={(event) =>
                setDraftHiddenFilters((c) => ({
                  ...c,
                  periodMode: event.target.value as PeriodMode,
                  periodValue: '',
                }))
              }
            >
              <option value="exact">Data</option>
              <option value="month">Mes</option>
              <option value="year">Ano</option>
            </select>
            <input
              className="samples-filter-field-input"
              type={getPeriodInputType(draftHiddenFilters.periodMode)}
              value={draftHiddenFilters.periodValue}
              onChange={(event) =>
                setDraftHiddenFilters((c) => ({
                  ...c,
                  periodValue: normalizePeriodValueForMode(c.periodMode, event.target.value),
                }))
              }
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

  const fullName = session.user.fullName ?? session.user.username;
  const avatarInitials = fullName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="samples-page-v2">
        <header className="samples-page-v2-header">
          <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div className="samples-page-v2-header-center">
            <h2 className="nsv2-title">Amostras</h2>
          </div>
          <button
            type="button"
            className="nsv2-avatar"
            aria-label="Abrir menu de perfil"
            onClick={() => window.dispatchEvent(new CustomEvent('open-profile-sheet'))}
          >
            <span className="nsv2-avatar-initials">{avatarInitials}</span>
          </button>
        </header>

        {/* Search bar — in green area, dashboard style */}
        <div className="hero-search-wrap">
          <form className="hero-search-bar" role="search" onSubmit={handleSearchSubmit}>
            <svg
              className="hero-search-icon"
              viewBox="0 0 24 24"
              focusable="false"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m16.2 16.2 4.1 4.1" />
            </svg>
            <input
              className="hero-search-input"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar por lote ou proprietario"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className={`hero-search-filter-btn${activeHiddenFiltersCount > 0 ? ' has-filters' : ''}`}
              aria-label="Filtros avancados"
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
              {activeHiddenFiltersCount > 0 ? (
                <span className="hero-search-filter-badge">{activeHiddenFiltersCount}</span>
              ) : null}
            </button>
          </form>
        </div>

        <section className="samples-page-v2-sheet">
          {activeAging ? (
            <div className="spv2-aging-banner">
              <span className="spv2-aging-banner-text">
                {AGING_LABELS[activeAging]} — classificadas, em aberto
              </span>
              <button
                type="button"
                className="spv2-aging-banner-clear"
                onClick={clearAging}
                aria-label="Limpar filtro"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          ) : null}

          {/* Section 2: Count */}
          <div className="spv2-list-meta">
            <span className="spv2-list-count">{samplesState.total} registros</span>
          </div>

          {/* Section 3: Card list */}
          {isLoadingInitial ? (
            <div className="spv2-list-scroll">
              <div className="spv2-empty">
                <p className="spv2-empty-text">Carregando...</p>
              </div>
            </div>
          ) : samplesState.items.length === 0 ? (
            <div className="spv2-list-scroll">
              <div className="spv2-empty">
                <svg className="spv2-empty-icon" viewBox="0 0 40 56" aria-hidden="true">
                  <ellipse cx="20" cy="28" rx="17" ry="25" fill="#ddd" />
                  <path
                    d="M20 5c-3.5 8-4.2 16-1 23s3.5 15 1 23"
                    fill="none"
                    stroke="rgba(0,0,0,0.1)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <p className="spv2-empty-text">Nenhuma amostra encontrada</p>
                <p className="spv2-empty-sub">Tente outro filtro ou termo de busca</p>
              </div>
            </div>
          ) : (
            <div ref={samplesScrollRef} className="spv2-list-scroll">
              {samplesState.items.map((sample, i) => {
                const statusColor = getCardStatusColor(sample.status);
                const statusLabel = getCardStatusLabel(sample.status);
                return (
                  <Link
                    key={sample.id}
                    href={`/samples/${sample.id}`}
                    className="spv2-card"
                    style={{ animationDelay: `${i * 0.04}s` }}
                    onClick={saveSnapshotBeforeLeave}
                  >
                    <span className="spv2-card-bar" style={{ background: statusColor }} />
                    <div className="spv2-card-content">
                      <div className="spv2-card-top">
                        <span className="spv2-card-code">
                          {sample.internalLotNumber ?? sample.id}
                        </span>
                        <span
                          className="spv2-card-badge"
                          style={{
                            color: statusColor,
                            background: `${statusColor}14`,
                            borderColor: `${statusColor}33`,
                          }}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="spv2-card-bottom">
                        <span className="spv2-card-owner">
                          {sample.declared.owner || 'Nao informado'}
                        </span>
                        <span className="spv2-card-sep" />
                        <span className="spv2-card-detail">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="2" y="7" width="20" height="14" rx="2" />
                            <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
                          </svg>
                          {sample.declared.sacks ?? '—'} sacas
                        </span>
                      </div>
                    </div>
                    <svg className="spv2-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </Link>
                );
              })}

              {isLoadingMore
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={`skel-${i}`} className="spv2-card spv2-card-skeleton" aria-hidden />
                  ))
                : null}

              {samplesState.nextCursor ? (
                <div ref={loadMoreRef} className="spv2-load-sentinel" aria-hidden />
              ) : null}

              {hasReachedEnd ? <p className="spv2-list-end">Você chegou ao fim</p> : null}
            </div>
          )}
        </section>
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
              <div className="samples-filter-modal-content">{renderFilterFields()}</div>

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
    </AppShell>
  );
}
