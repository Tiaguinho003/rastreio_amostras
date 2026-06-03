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
import { NewSampleModal } from '../../components/NewSampleModal';
import { ClientLookupField } from '../../components/clients/ClientLookupField';
import { NotificationBell } from '../../components/NotificationBell';
import { SampleCard } from '../../components/samples/SampleCard';
import { SampleCreateRadialFab } from '../../components/samples/SampleCreateRadialFab';
import {
  BlendConfirmationSheet,
  type BlendContribution,
} from '../../components/samples/BlendConfirmationSheet';
import { SampleCreatedSuccessModal } from '../../components/samples/SampleCreatedSuccessModal';
import {
  SelectedSamplesDropdown,
  type SelectedSampleSummary,
} from '../../components/samples/SelectedSamplesDropdown';
import { SelectionModeHeader } from '../../components/samples/SelectionModeHeader';
import { ApiError, createBlend, listSamples } from '../../lib/api-client';
import { mapEligibilityReasonToLabel } from '../../lib/samples/eligibility-labels';
import { buildHarvestPresets } from '../../lib/sample-identification';
import { useToast } from '../../lib/toast/ToastProvider';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { ClientSummary, SampleEligibilityReason, SampleSnapshot } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';

const SAMPLE_PAGE_LIMIT = 20;
// Mesma fonte do registro (NewSampleModal) — desliza com o ano e cobre todas
// as safras selecionaveis ao cadastrar. Ver buildHarvestPresets.
const HARVEST_OPTIONS = buildHarvestPresets();
const DISPLAY_STATUS_FILTER_OPTIONS = [
  { value: 'OPEN', label: 'Em aberto' },
  { value: 'SOLD', label: 'Vendido' },
  { value: 'LOST', label: 'Perdido' },
  { value: 'INVALIDATED', label: 'Invalidada' },
] as const;
type DisplayStatusFilter = '' | (typeof DISPLAY_STATUS_FILTER_OPTIONS)[number]['value'];
type PeriodMode = 'exact' | 'month' | 'year';
type FilterSectionId = 'owner' | 'buyer' | 'displayStatus' | 'harvest' | 'sacks' | 'period';

interface HiddenFilters {
  ownerClients: ClientSummary[];
  buyerClients: ClientSummary[];
  displayStatus: DisplayStatusFilter;
  harvest: string;
  sacksMin: string;
  sacksMax: string;
  periodMode: PeriodMode;
  periodValue: string;
}

const EMPTY_HIDDEN_FILTERS: HiddenFilters = {
  ownerClients: [],
  buyerClients: [],
  displayStatus: '',
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
  'displayStatus',
  'harvest',
  'sacks',
  'period',
];

function hasAnyHiddenFilter(filters: HiddenFilters) {
  return (
    filters.ownerClients.length > 0 ||
    filters.buyerClients.length > 0 ||
    filters.displayStatus.length > 0 ||
    filters.harvest.trim().length > 0 ||
    filters.sacksMin.trim().length > 0 ||
    filters.sacksMax.trim().length > 0 ||
    filters.periodValue.trim().length > 0
  );
}

function normalizeHiddenFilters(filters: HiddenFilters): HiddenFilters {
  return {
    ownerClients: filters.ownerClients,
    buyerClients: filters.buyerClients,
    displayStatus: filters.displayStatus,
    harvest: filters.harvest.trim(),
    sacksMin: filters.sacksMin.trim(),
    sacksMax: filters.sacksMax.trim(),
    periodMode: filters.periodMode,
    periodValue: filters.periodValue.trim(),
  };
}

function countActiveHiddenFilters(filters: HiddenFilters) {
  let count = 0;
  if (filters.ownerClients.length > 0) count += 1;
  if (filters.buyerClients.length > 0) count += 1;
  if (filters.displayStatus) count += 1;
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

// Liga B2.2: gera clientDraftId pra idempotencia do createBlend.
// Mantido aqui (page-level) porque a chamada vem diretamente do sheet
// sem passar por um modal F3 dedicado (removido em 2026-05-19).
function buildBlendDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `blend-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

function getClientFilterLabel(client: ClientSummary): string {
  return client.displayName ?? client.fullName ?? client.legalName ?? client.tradeName ?? 'Cliente';
}

function getClientsFilterSummary(
  clients: ClientSummary[],
  emptyLabel: string,
  pluralWord: string
): string {
  if (clients.length === 0) return emptyLabel;
  if (clients.length === 1) return getClientFilterLabel(clients[0]);
  return `${clients.length} ${pluralWord}`;
}

function getDisplayStatusLabel(value: DisplayStatusFilter) {
  return (
    DISPLAY_STATUS_FILTER_OPTIONS.find((option) => option.value === value)?.label ??
    'Qualquer status'
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
    return filters.ownerClients.length > 0;
  }

  if (sectionId === 'buyer') {
    return filters.buyerClients.length > 0;
  }

  if (sectionId === 'displayStatus') {
    return filters.displayStatus.length > 0;
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
    return getClientsFilterSummary(filters.ownerClients, 'Qualquer proprietario', 'proprietarios');
  }

  if (sectionId === 'buyer') {
    return getClientsFilterSummary(filters.buyerClients, 'Qualquer comprador', 'compradores');
  }

  if (sectionId === 'displayStatus') {
    return getDisplayStatusLabel(filters.displayStatus);
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

const SAMPLES_SNAPSHOT_KEY = 'samples-list-snapshot-v2';
const SAMPLES_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

interface SamplesSnapshot {
  items: SampleSnapshot[];
  total: number;
  nextCursor: { createdAt: string; id: string } | null;
  scrollTop: number;
  searchInput: string;
  appliedSearch: string;
  appliedHiddenFilters: HiddenFilters;
  agingParam: string | null;
  savedAt: number;
}

function readSamplesSnapshot(): SamplesSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SAMPLES_SNAPSHOT_KEY);
    // Consume-once: snapshot sobrevive apenas uma leitura.
    window.sessionStorage.removeItem(SAMPLES_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > SAMPLES_SNAPSHOT_TTL_MS) return null;
    return parsed as SamplesSnapshot;
  } catch {
    return null;
  }
}

function writeSamplesSnapshot(snapshot: Omit<SamplesSnapshot, 'savedAt'>) {
  if (typeof window === 'undefined') return;
  try {
    const payload: SamplesSnapshot = { ...snapshot, savedAt: Date.now() };
    window.sessionStorage.setItem(SAMPLES_SNAPSHOT_KEY, JSON.stringify(payload));
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

/* O elemento que realmente rola depende do breakpoint: no desktop a lista rola
   no container interno (.spv2-list-scroll, height-constrained via @media
   min-width:901px); no mobile o container NAO e constrangido e quem rola e a
   janela/body. Por isso o snapshot precisa ler/escrever o scroll do scroller
   correto — senao no mobile o container reporta sempre 0 e o scroll se perde
   ao voltar da detail. */
function readListScrollTop(container: HTMLElement | null): number {
  if (container && container.scrollHeight - container.clientHeight > 1) {
    return container.scrollTop;
  }
  if (typeof window === 'undefined') return 0;
  return window.scrollY || document.documentElement.scrollTop || 0;
}

function applyListScrollTop(container: HTMLElement | null, top: number): void {
  if (container && container.scrollHeight - container.clientHeight > 1) {
    container.scrollTo({ top });
    return;
  }
  if (typeof window !== 'undefined') window.scrollTo({ top });
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
  // Modal de nova amostra: `open` controla intencao (abrir/fechar) e
  // `mounted` controla presenca no DOM. Quando o user fecha, `open`
  // vira false imediatamente (BottomSheet anima saida) mas `mounted`
  // permanece true por 400ms ate o slide-down terminar (350ms da
  // transition em `.bottom-sheet` + margem). Sem o delayed unmount, o
  // conditional render desmontava antes da animacao rodar e o user nao
  // via o sheet "correndo" pra baixo.
  // Expandable cards: ids dos cards expandidos. Multiplos podem ficar
  // abertos simultaneamente (decisao UX). Tap no card expande/contrai;
  // navegacao pra detalhe so via botao "Ver detalhes" dentro do painel.
  const [expandedSampleIds, setExpandedSampleIds] = useState<Set<string>>(() => new Set());
  const [newSampleModalOpen, setNewSampleModalOpen] = useState(false);
  const [newSampleModalMounted, setNewSampleModalMounted] = useState(false);
  // Incrementa apos criar amostra via FAB/botao pra forcar refetch da lista
  // (decisao 5.31 = a — refetch automatico).
  const [newSampleRefetchKey, setNewSampleRefetchKey] = useState(0);

  // Liga B1.4 (F1.D): modo selecao pra criar liga. Disparado via FAB → Liga.
  // selectionMode controla render do header (SelectionModeHeader vs normal),
  // navbar (body class is-selection-mode), e shape dos cards (com bolinha).
  // selectedIds persiste entre buscas/filtros — contador SEMPRE de .size.
  const [selectionMode, setSelectionMode] = useState<'idle' | 'blend'>('idle');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // Liga B1.5: popover de revisao das selecionadas (lista + X individual).
  // Abre via tap no contador, fecha via click fora / Escape / remocao da
  // ultima amostra.
  const [selectionDropdownOpen, setSelectionDropdownOpen] = useState(false);
  // Liga B2.1: bottom-sheet de confirmacao com inputs de contribuicao
  // por amostra. Abre via tap na seta -> do FAB. Fecha por Voltar /
  // backdrop / ESC / remocao da ultima amostra dentro do sheet.
  const [confirmationSheetOpen, setConfirmationSheetOpen] = useState(false);
  // Liga B2.2: loading do createBlend disparado direto do sheet (modal F3
  // removido em 2026-05-19 — caracteristicas da liga sao derivadas das
  // origens; nada coletado do operador no momento da criacao).
  const [creatingBlend, setCreatingBlend] = useState(false);
  // Liga B2.3: success modal reusando <SampleCreatedSuccessModal entity="blend">.
  const [createdBlend, setCreatedBlend] = useState<{
    sampleId: string;
    lotNumber: string;
  } | null>(null);
  const blendDraftIdRef = useRef<string>('');
  const toast = useToast();

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

  // Controle do fetch-more: estado imperativo que nao dispara re-render.
  // inFlight previne chamadas concorrentes. token invalida responses obsoletos
  // quando filtros/busca mudam durante um load-more em andamento.
  const loadMoreStateRef = useRef<{ inFlight: boolean; token: number }>({
    inFlight: false,
    token: 0,
  });
  const mountedRef = useRef(true);

  // Refs mutaveis para capturar filtros/sessao atuais dentro do callback estavel
  // de load-more, sem precisar incluir os valores nas deps do useCallback (o que
  // recriaria o callback a cada mudanca e forcaria o observer a reconectar).
  const sessionRef = useRef(session);
  const filtersRef = useRef({ appliedSearch, appliedHiddenFilters, activeAging });
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
        id: 'displayStatus',
        label: 'Status',
        summary: getFilterSectionSummary('displayStatus', draftHiddenFilters),
        active: hasFilterSectionValue('displayStatus', draftHiddenFilters),
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
    applyListScrollTop(samplesScrollRef.current, pending);
    // Belt: reaplica no proximo frame. No mobile quem rola e a janela e o
    // valor pode nao "pegar" antes do layout final / da navegacao concluir.
    const raf = requestAnimationFrame(() => applyListScrollTop(samplesScrollRef.current, pending));
    return () => cancelAnimationFrame(raf);
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
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    filtersRef.current = { appliedSearch, appliedHiddenFilters, activeAging };
  }, [appliedSearch, appliedHiddenFilters, activeAging]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Delayed unmount do NewSampleModal: monta na hora ao abrir; ao
  // fechar, mantem montado por 400ms pra que o slide-down do BottomSheet
  // termine antes do React desmontar o componente.
  useEffect(() => {
    if (newSampleModalOpen) {
      setNewSampleModalMounted(true);
      return;
    }
    const t = window.setTimeout(() => setNewSampleModalMounted(false), 400);
    return () => window.clearTimeout(t);
  }, [newSampleModalOpen]);

  const runLoadMore = useCallback((cursor: SampleCursor) => {
    const state = loadMoreStateRef.current;
    if (state.inFlight) return;
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    state.inFlight = true;
    const myToken = state.token;
    const filters = filtersRef.current;

    dispatchSamples({ type: 'fetch-more' });

    listSamples(currentSession, {
      limit: SAMPLE_PAGE_LIMIT,
      cursorCreatedAt: cursor.createdAt,
      cursorId: cursor.id,
      search: filters.appliedSearch || undefined,
      ownerClientIds: filters.appliedHiddenFilters.ownerClients.map((client) => client.id),
      buyerClientIds: filters.appliedHiddenFilters.buyerClients.map((client) => client.id),
      displayStatus: filters.appliedHiddenFilters.displayStatus || undefined,
      harvest: filters.appliedHiddenFilters.harvest || undefined,
      sacksMin: filters.appliedHiddenFilters.sacksMin || undefined,
      sacksMax: filters.appliedHiddenFilters.sacksMax || undefined,
      ...buildPeriodQuery(filters.appliedHiddenFilters),
      classifiedAging: filters.activeAging || undefined,
    })
      .then((response) => {
        state.inFlight = false;
        if (!mountedRef.current) return;
        if (state.token !== myToken) return;
        dispatchSamples({
          type: 'success-more',
          items: response.items,
          nextCursor: response.page.nextCursor,
        });
      })
      .catch((cause) => {
        state.inFlight = false;
        if (!mountedRef.current) return;
        if (state.token !== myToken) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        dispatchSamples({
          type: 'error',
          message: cause instanceof ApiError ? cause.message : 'Falha ao carregar mais registros',
        });
      });
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    // Invalida qualquer load-more em andamento: a proxima resposta obsoleta
    // sera descartada ao comparar com o token atual.
    loadMoreStateRef.current.token += 1;
    loadMoreStateRef.current.inFlight = false;

    const abortController = new AbortController();
    let active = true;
    dispatchSamples({ type: 'fetch-initial' });
    samplesScrollRef.current?.scrollTo({ top: 0 });

    listSamples(
      session,
      {
        limit: SAMPLE_PAGE_LIMIT,
        search: appliedSearch || undefined,
        ownerClientIds: appliedHiddenFilters.ownerClients.map((client) => client.id),
        buyerClientIds: appliedHiddenFilters.buyerClients.map((client) => client.id),
        displayStatus: appliedHiddenFilters.displayStatus || undefined,
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
  }, [activeAging, appliedHiddenFilters, appliedSearch, session, newSampleRefetchKey]);

  // Liga B1.4 — refetch otimista quando entra em modo selecao.
  // Lista atual permanece visivel; quando refetch retorna, atualiza com
  // eligibility + committedSacks por amostra. Selecionadas que viram
  // inelegiveis sao removidas + toast. Erro de refetch sai do modo +
  // toast.
  useEffect(() => {
    if (!session) return;
    if (selectionMode !== 'blend') return;

    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const response = await listSamples(
          session,
          {
            limit: SAMPLE_PAGE_LIMIT,
            search: appliedSearch || undefined,
            ownerClientIds: appliedHiddenFilters.ownerClients.map((client) => client.id),
            buyerClientIds: appliedHiddenFilters.buyerClients.map((client) => client.id),
            displayStatus: appliedHiddenFilters.displayStatus || undefined,
            harvest: appliedHiddenFilters.harvest || undefined,
            sacksMin: appliedHiddenFilters.sacksMin || undefined,
            sacksMax: appliedHiddenFilters.sacksMax || undefined,
            classifiedAging: activeAging || undefined,
            eligibleForBlend: true,
          },
          { signal: controller.signal }
        );

        if (cancelled) return;

        dispatchSamples({
          type: 'success-initial',
          items: response.items,
          total: response.page.total,
          nextCursor: response.page.nextCursor,
        });

        // Reconciliacao: pra cada selectedId, ver se virou inelegivel
        // -> deselecionar + toast.
        setSelectedIds((prev) => {
          if (prev.size === 0) return prev;
          const itemsById = new Map(response.items.map((s) => [s.id, s]));
          const next = new Set(prev);
          let didChange = false;
          for (const id of prev) {
            const item = itemsById.get(id);
            if (!item) continue; // não visível com filtros atuais — mantém
            if (item.eligibility && !item.eligibility.eligible) {
              next.delete(id);
              didChange = true;
              const reasonLabel = mapEligibilityReasonToLabel(item.eligibility.reason);
              toast.info({
                title: `Amostra ${item.internalLotNumber ?? '—'} removida da seleção`,
                description: reasonLabel ?? undefined,
              });
            }
          }
          return didChange ? next : prev;
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        toast.error({
          title: 'Não foi possível carregar amostras pra liga',
          description: 'Tente novamente.',
        });
        setSelectionMode('idle');
        setSelectedIds(new Set());
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionMode, session]);

  // Liga B2.1 — quando todas as amostras forem removidas via X dentro do
  // sheet, selectedIds zera e o sheet fecha automaticamente. Modo selecao
  // permanece ativo (decisao UX confirmada).
  useEffect(() => {
    if (confirmationSheetOpen && selectedIds.size === 0) {
      setConfirmationSheetOpen(false);
    }
  }, [confirmationSheetOpen, selectedIds]);

  // Liga B1.4 — body class pra esconder navbar/header normal no modo selecao.
  useEffect(() => {
    if (selectionMode === 'blend') {
      document.body.classList.add('is-selection-mode');
      return () => {
        document.body.classList.remove('is-selection-mode');
      };
    }
    return undefined;
  }, [selectionMode]);

  useEffect(() => {
    if (!session) return;
    if (samplesState.status !== 'idle') return;
    if (!samplesState.nextCursor) return;

    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const scrollRoot = samplesScrollRef.current;
    const cursor = samplesState.nextCursor;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          runLoadMore(cursor);
        }
      },
      { root: scrollRoot, rootMargin: '200px' }
    );

    observer.observe(sentinel);

    // Apenas desconecta o observer. Nao aborta o fetch em andamento:
    // se dispatch de fetch-more muda status->loading-more e dispara este
    // cleanup, o fetch continua e sua resposta ainda entra via success-more.
    return () => observer.disconnect();
  }, [runLoadMore, samplesState.nextCursor, samplesState.status, session]);

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
      scrollTop: readListScrollTop(samplesScrollRef.current),
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

  // Liga B1.4 — handlers de modo selecao.
  function enterBlendMode() {
    setSelectionMode('blend');
    setSelectedIds(new Set());
  }

  function exitBlendMode() {
    setSelectionMode('idle');
    setSelectedIds(new Set());
    setSelectionDropdownOpen(false);
    setConfirmationSheetOpen(false);
    setCreatingBlend(false);
    blendDraftIdRef.current = '';
  }

  function toggleSampleSelection(sampleId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sampleId)) next.delete(sampleId);
      else next.add(sampleId);
      return next;
    });
  }

  // Toggle do card expandido. Multiplos podem ficar abertos.
  function toggleCardExpand(sampleId: string) {
    setExpandedSampleIds((prev) => {
      const next = new Set(prev);
      if (next.has(sampleId)) next.delete(sampleId);
      else next.add(sampleId);
      return next;
    });
  }

  function showIneligibleReason(reason: SampleEligibilityReason) {
    const label = mapEligibilityReasonToLabel(reason);
    toast.info({
      title: 'Amostra indisponível pra liga',
      description: label ?? undefined,
    });
  }

  // Liga B1.5: remover individual via X no popover. Se for a ultima,
  // fecha o popover automaticamente mas mantem o modo selecao ativo
  // (decisao UX confirmada: nao sai do modo).
  function handleRemoveFromSelection(sampleId: string) {
    setSelectedIds((prev) => {
      if (!prev.has(sampleId)) return prev;
      const next = new Set(prev);
      next.delete(sampleId);
      if (next.size === 0) setSelectionDropdownOpen(false);
      return next;
    });
  }

  // Liga B2.1: abre o bottom-sheet de confirmacao. Disparado pelo FAB-seta
  // -> em /samples quando ha >=2 amostras selecionadas.
  function openConfirmation() {
    if (selectedIds.size < 2) return; // safety; seta ja vem disabled
    // Fecha o popover de revisao se estiver aberto (mutuamente exclusivos).
    setSelectionDropdownOpen(false);
    setConfirmationSheetOpen(true);
  }

  // "Voltar" no sheet ou fechamento via backdrop / ESC. Mantem modo
  // selecao + selectedIds preservados.
  function closeConfirmation() {
    setConfirmationSheetOpen(false);
  }

  // Liga B2.2 refinada em 2026-05-19: tap "Criar liga" no sheet chama
  // createBlend direto (sem modal F3 intermediario). Caracteristicas da
  // liga (dono / safra / local / notes) NAO sao coletadas — owner fica
  // null (carteira da corretora — F3.A), safra deriva das origens no
  // backend (distinct ', '), local/notes ficam null. Edicao posterior
  // permite refinar via detalhe.
  async function handleProceedToCreate(components: BlendContribution[]) {
    if (creatingBlend) return;
    if (!session) return;
    if (components.length < 2) {
      toast.error({
        title: 'Não foi possível criar liga',
        description: 'Selecione pelo menos 2 amostras antes de continuar.',
      });
      return;
    }
    if (!blendDraftIdRef.current) {
      blendDraftIdRef.current = buildBlendDraftId();
    }
    setCreatingBlend(true);
    try {
      const result = await createBlend(session, {
        clientDraftId: blendDraftIdRef.current,
        components,
        ownerClientId: null,
        ownerUnitId: null,
      });
      const sampleId = result.sample.id;
      const lotNumber = result.sample.internalLotNumber ?? sampleId;
      blendDraftIdRef.current = '';
      setCreatedBlend({ sampleId, lotNumber });
      setConfirmationSheetOpen(false);
      setSelectionMode('idle');
      setSelectedIds(new Set());
      setSelectionDropdownOpen(false);
      setNewSampleRefetchKey((current) => current + 1);
    } catch (cause) {
      const description =
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : 'Tente novamente.';
      toast.error({
        title: 'Não foi possível criar liga',
        description: description || 'Tente novamente.',
      });
    } finally {
      setCreatingBlend(false);
    }
  }

  // Liga B2.3: tap em "Ir para liga" / "Criar outra liga" / X do success
  // modal — todos fecham o modal sem navegar pro detalhe (decisao 5.29).
  // A liga ja apareceu no topo da lista via refetch disparado em
  // handleProceedToCreate.
  function handleBlendSuccessClose() {
    setCreatedBlend(null);
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

  // Filtro multi-select de cliente (proprietario/comprador): picker que
  // adiciona (ClientLookupField com clearOnSelect) + chips removiveis.
  function renderClientMultiFilter(
    kind: 'owner' | 'buyer',
    label: string,
    placeholder: string,
    emptyMessage: string,
    removeLabel: string,
    selected: ClientSummary[],
    onAdd: (client: ClientSummary) => void,
    onRemove: (clientId: string) => void
  ) {
    if (!session) return null;
    return (
      <div className="samples-filter-field">
        <span className="samples-filter-field-label">{label}</span>
        <ClientLookupField
          session={session}
          kind={kind}
          label={label}
          compact
          clearOnSelect
          selectedClient={null}
          onSelectClient={(client) => {
            if (client) onAdd(client);
          }}
          placeholder={placeholder}
          emptyMessage={emptyMessage}
        />
        {selected.length > 0 ? (
          <div className="samples-filter-tokens">
            {selected.map((client) => (
              <span key={client.id} className="samples-filter-token">
                <span className="samples-filter-token-label">{getClientFilterLabel(client)}</span>
                <button
                  type="button"
                  className="samples-filter-token-remove"
                  aria-label={`${removeLabel}: ${getClientFilterLabel(client)}`}
                  onClick={() => onRemove(client.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderFilterFields() {
    // O typeahead de cliente exige sessao nao-nula; o painel so abre logado,
    // entao isto e so o narrowing pro TS (nunca renderiza null na pratica).
    if (!session) return null;
    return (
      <div className="samples-filter-fields">
        {renderClientMultiFilter(
          'owner',
          'Proprietario',
          'Buscar proprietario',
          'Nenhum proprietario encontrado',
          'Remover proprietario',
          draftHiddenFilters.ownerClients,
          (client) =>
            setDraftHiddenFilters((c) =>
              c.ownerClients.some((existing) => existing.id === client.id)
                ? c
                : { ...c, ownerClients: [...c.ownerClients, client] }
            ),
          (clientId) =>
            setDraftHiddenFilters((c) => ({
              ...c,
              ownerClients: c.ownerClients.filter((existing) => existing.id !== clientId),
            }))
        )}

        {renderClientMultiFilter(
          'buyer',
          'Comprador',
          'Buscar comprador',
          'Nenhum comprador encontrado',
          'Remover comprador',
          draftHiddenFilters.buyerClients,
          (client) =>
            setDraftHiddenFilters((c) =>
              c.buyerClients.some((existing) => existing.id === client.id)
                ? c
                : { ...c, buyerClients: [...c.buyerClients, client] }
            ),
          (clientId) =>
            setDraftHiddenFilters((c) => ({
              ...c,
              buyerClients: c.buyerClients.filter((existing) => existing.id !== clientId),
            }))
        )}

        <div className="samples-filter-field">
          <span className="samples-filter-field-label">Status</span>
          <div className="samples-filter-chip-row">
            {DISPLAY_STATUS_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`samples-filter-chip${draftHiddenFilters.displayStatus === option.value ? ' is-selected' : ''}`}
                onClick={() =>
                  setDraftHiddenFilters((c) => ({
                    ...c,
                    displayStatus: c.displayStatus === option.value ? '' : option.value,
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
        {/* Liga B1.4: SelectionModeHeader substitui o header normal quando
            o usuario entra em modo selecao pra criar liga. CSS body class
            is-selection-mode tambem esconde o header normal por seguranca. */}
        {selectionMode === 'blend' ? <SelectionModeHeader onExit={exitBlendMode} /> : null}
        <header className="samples-page-v2-header">
          <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div className="samples-page-v2-header-center">
            <h2 className="nsv2-title">Amostras</h2>
          </div>
          <NotificationBell className="header-notification-bell" />
          <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
            <span className="nsv2-avatar-initials">{avatarInitials}</span>
          </Link>
        </header>

        {/* Search bar — in green area, dashboard style. Filtro fica
            FORA do form, alinhado a direita (mesmo padrao do "+" em /clients). */}
        <div className="hero-search-wrap">
          <form
            className={`hero-search-bar${searchInput.trim().length > 0 ? ' has-input' : ''}`}
            role="search"
            onSubmit={handleSearchSubmit}
          >
            <input
              className="hero-search-input"
              value={searchInput}
              onChange={(event) => {
                const newValue = event.target.value;
                setSearchInput(newValue);
                // Auto-reset da lista quando o user limpa o input —
                // mesmo padrao do clients (debounced), aqui aplicado
                // imediatamente pra nao precisar submeter o form.
                if (newValue.trim() === '' && appliedSearch !== '') {
                  if (activeAging) clearAging();
                  clearSamplesSnapshot();
                  setAppliedSearch('');
                }
              }}
              placeholder="Buscar por lote ou proprietario"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="hero-search-submit"
              aria-label={searchInput.trim().length > 0 ? 'Pesquisar' : 'Buscar'}
            >
              <svg
                className="hero-search-icon-search"
                viewBox="0 0 24 24"
                focusable="false"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m16.2 16.2 4.1 4.1" />
              </svg>
              <svg
                className="hero-search-icon-submit"
                viewBox="0 0 24 24"
                focusable="false"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </button>
          </form>
          {selectionMode === 'blend' ? (
            <SampleCreateRadialFab
              mode="blendArrow"
              selectedCount={selectedIds.size}
              onContinue={openConfirmation}
            />
          ) : (
            <SampleCreateRadialFab
              mode="idle"
              onCreateUnit={() => setNewSampleModalOpen(true)}
              onStartBlendSelection={enterBlendMode}
            />
          )}
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

          {/* Section 2: Count + filter btn (ou contador de selecionadas em modo blend) */}
          <div className="spv2-list-meta">
            <span className="spv2-list-count">{samplesState.total} registros</span>
            {selectionMode === 'blend' ? (
              <div className="spv2-selection-counter-wrap">
                <button
                  type="button"
                  className="spv2-selection-counter"
                  aria-label={`${selectedIds.size} amostras selecionadas — abrir revisão`}
                  aria-expanded={selectionDropdownOpen}
                  aria-haspopup="menu"
                  onClick={() => setSelectionDropdownOpen((open) => !open)}
                  disabled={selectedIds.size === 0}
                >
                  <span className="spv2-selection-counter__num">{selectedIds.size}</span>
                  <span className="spv2-selection-counter__label">
                    {selectedIds.size === 1 ? 'selecionada' : 'selecionadas'}
                  </span>
                  <svg
                    className="spv2-selection-counter__chevron"
                    viewBox="0 0 24 24"
                    focusable="false"
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {selectionDropdownOpen && selectedIds.size > 0 ? (
                  <SelectedSamplesDropdown
                    samples={samplesState.items
                      .filter((s) => selectedIds.has(s.id))
                      .map<SelectedSampleSummary>((s) => ({
                        id: s.id,
                        lot: s.internalLotNumber ?? s.id.slice(0, 8),
                        availableSacks: s.availableSacks ?? null,
                      }))}
                    onRemove={handleRemoveFromSelection}
                    onClose={() => setSelectionDropdownOpen(false)}
                  />
                ) : null}
              </div>
            ) : (
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
            )}
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
              {samplesState.items.map((sample, i) => (
                <SampleCard
                  key={sample.id}
                  sample={sample}
                  index={i}
                  onClickCapture={saveSnapshotBeforeLeave}
                  selectionMode={selectionMode === 'blend' ? 'blend' : 'idle'}
                  isSelected={selectedIds.has(sample.id)}
                  onToggleSelect={toggleSampleSelection}
                  onShowIneligibleReason={showIneligibleReason}
                  isExpanded={expandedSampleIds.has(sample.id)}
                  onToggleExpand={toggleCardExpand}
                />
              ))}

              {isLoadingMore
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={`skel-${i}`} className="spv2-skeleton-card" aria-hidden />
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

      {newSampleModalMounted ? (
        <NewSampleModal
          open={newSampleModalOpen}
          session={session}
          onClose={() => setNewSampleModalOpen(false)}
          onSuccessNavigate={() => {
            // Decisao 5.29 = b: nao navega pra /samples/[id]. Em vez disso
            // fecha o modal e dispara refetch da lista (5.31 = a) — a amostra
            // criada aparece no topo da lista atualizada.
            setNewSampleModalOpen(false);
            setNewSampleRefetchKey((current) => current + 1);
          }}
        />
      ) : null}

      {/* Liga B2.1: bottom-sheet de confirmacao com inputs de contribuicao.
          Abre via seta -> do FAB. Modal F3 removido em 2026-05-19 — tap
          em "Criar liga" no sheet chama createBlend direto. Caracteristicas
          da liga (dono / safra / local / notes) sao derivadas das origens
          no backend; nada coletado do operador na criacao. */}
      <BlendConfirmationSheet
        open={confirmationSheetOpen && selectionMode === 'blend'}
        samples={samplesState.items.filter((s) => selectedIds.has(s.id))}
        submitting={creatingBlend}
        onClose={closeConfirmation}
        onRemove={handleRemoveFromSelection}
        onProceed={handleProceedToCreate}
      />

      {/* Liga B2.3: success modal reusado com entity="blend". Tap em
          qualquer botao (Ir para liga / Criar outra liga / X) fecha sem
          navegar — refetch ja foi disparado em handleProceedToCreate. */}
      <SampleCreatedSuccessModal
        open={createdBlend !== null}
        lotNumber={createdBlend?.lotNumber ?? '—'}
        onNavigateToSample={handleBlendSuccessClose}
        onCreateAnother={handleBlendSuccessClose}
        onClose={handleBlendSuccessClose}
        entity="blend"
      />
    </AppShell>
  );
}
