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
import { ApprovalLabelModal } from '../../components/ApprovalLabelModal';
import { NewSampleModal } from '../../components/NewSampleModal';
import { ClientLookupField } from '../../components/clients/ClientLookupField';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { ClassificationFilterField } from '../../components/samples/ClassificationFilterField';
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
import { ApiError, createBlend, listClassificationValues, listSamples } from '../../lib/api-client';
import { mapEligibilityReasonToLabel } from '../../lib/samples/eligibility-labels';
import { buildHarvestPresets } from '../../lib/sample-identification';
import { useToast } from '../../lib/toast/ToastProvider';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { ClientSummary, SampleEligibilityReason, SampleSnapshot } from '../../lib/types';
import { getRouteLeftBehind } from '../../lib/navigation/route-history';
import { useRequireAuth } from '../../lib/use-auth';
import { NON_PROSPECTOR_ROLES } from '../../lib/roles';

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
type FilterSectionId =
  | 'owner'
  | 'buyer'
  | 'sentTo'
  | 'displayStatus'
  | 'harvest'
  | 'sacks'
  | 'period'
  | 'onlyBlend';

interface HiddenFilters {
  ownerClients: ClientSummary[];
  buyerClients: ClientSummary[];
  sentToClients: ClientSummary[];
  // Classificacao: multi-selecao de valores canonicos existentes.
  padroes: string[];
  aspectos: string[];
  catacoes: string[];
  certificados: string[];
  displayStatus: DisplayStatusFilter;
  // Safra: multi-selecao de presets. Match por COMPONENTE (liga mista casa por
  // qualquer uma das safras que a compoem).
  harvests: string[];
  sacksMin: string;
  sacksMax: string;
  periodFrom: string;
  periodTo: string;
  onlyBlend: boolean;
}

const EMPTY_HIDDEN_FILTERS: HiddenFilters = {
  ownerClients: [],
  buyerClients: [],
  sentToClients: [],
  padroes: [],
  aspectos: [],
  catacoes: [],
  certificados: [],
  displayStatus: '',
  harvests: [],
  sacksMin: '',
  sacksMax: '',
  periodFrom: '',
  periodTo: '',
  onlyBlend: false,
};

const FILTER_SECTION_ORDER: FilterSectionId[] = [
  'owner',
  'buyer',
  'sentTo',
  'displayStatus',
  'harvest',
  'sacks',
  'period',
  'onlyBlend',
];

function hasAnyHiddenFilter(filters: HiddenFilters) {
  return (
    filters.ownerClients.length > 0 ||
    filters.buyerClients.length > 0 ||
    filters.sentToClients.length > 0 ||
    filters.padroes.length > 0 ||
    filters.aspectos.length > 0 ||
    filters.catacoes.length > 0 ||
    filters.certificados.length > 0 ||
    filters.displayStatus.length > 0 ||
    filters.harvests.length > 0 ||
    filters.sacksMin.trim().length > 0 ||
    filters.sacksMax.trim().length > 0 ||
    filters.periodFrom.trim().length > 0 ||
    filters.periodTo.trim().length > 0 ||
    filters.onlyBlend
  );
}

function normalizeHiddenFilters(filters: HiddenFilters): HiddenFilters {
  return {
    ownerClients: filters.ownerClients,
    buyerClients: filters.buyerClients,
    sentToClients: filters.sentToClients,
    padroes: filters.padroes,
    aspectos: filters.aspectos,
    catacoes: filters.catacoes,
    certificados: filters.certificados,
    displayStatus: filters.displayStatus,
    harvests: filters.harvests,
    sacksMin: filters.sacksMin.trim(),
    sacksMax: filters.sacksMax.trim(),
    periodFrom: filters.periodFrom.trim(),
    periodTo: filters.periodTo.trim(),
    onlyBlend: filters.onlyBlend,
  };
}

function countActiveHiddenFilters(filters: HiddenFilters) {
  let count = 0;
  if (filters.ownerClients.length > 0) count += 1;
  if (filters.buyerClients.length > 0) count += 1;
  if (filters.sentToClients.length > 0) count += 1;
  if (filters.padroes.length > 0) count += 1;
  if (filters.aspectos.length > 0) count += 1;
  if (filters.catacoes.length > 0) count += 1;
  if (filters.certificados.length > 0) count += 1;
  if (filters.displayStatus) count += 1;
  if (filters.harvests.length > 0) count += 1;
  if (filters.sacksMin.trim() || filters.sacksMax.trim()) count += 1;
  if (filters.periodFrom.trim() || filters.periodTo.trim()) count += 1;
  if (filters.onlyBlend) count += 1;
  return count;
}

function buildPeriodQuery(filters: HiddenFilters) {
  const from = filters.periodFrom.trim();
  const to = filters.periodTo.trim();
  const query: { createdFrom?: string; createdTo?: string } = {};
  if (from) query.createdFrom = from;
  if (to) query.createdTo = to;
  return query;
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

function formatPeriodDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatPeriodSummary(filters: HiddenFilters) {
  const from = filters.periodFrom.trim();
  const to = filters.periodTo.trim();
  if (from && to) {
    return `${formatPeriodDate(from)} a ${formatPeriodDate(to)}`;
  }
  const single = from || to;
  if (single) {
    return formatPeriodDate(single);
  }
  return 'Qualquer data';
}

function formatSacksSummary(filters: HiddenFilters) {
  const sacksMin = filters.sacksMin.trim();
  const sacksMax = filters.sacksMax.trim();

  if (sacksMin && sacksMax) {
    return `${sacksMin} a ${sacksMax} sacas`;
  }

  // 1 valor preenchido = busca exata.
  const exact = sacksMin || sacksMax;
  if (exact) {
    return `${exact} sacas`;
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

  if (sectionId === 'sentTo') {
    return filters.sentToClients.length > 0;
  }

  if (sectionId === 'displayStatus') {
    return filters.displayStatus.length > 0;
  }

  if (sectionId === 'harvest') {
    return filters.harvests.length > 0;
  }

  if (sectionId === 'sacks') {
    return filters.sacksMin.trim().length > 0 || filters.sacksMax.trim().length > 0;
  }

  if (sectionId === 'period') {
    return filters.periodFrom.trim().length > 0 || filters.periodTo.trim().length > 0;
  }

  return filters.onlyBlend;
}

function getFilterSectionSummary(sectionId: FilterSectionId, filters: HiddenFilters) {
  if (sectionId === 'owner') {
    return getClientsFilterSummary(filters.ownerClients, 'Qualquer proprietario', 'proprietarios');
  }

  if (sectionId === 'buyer') {
    return getClientsFilterSummary(filters.buyerClients, 'Qualquer comprador', 'compradores');
  }

  if (sectionId === 'sentTo') {
    return getClientsFilterSummary(filters.sentToClients, 'Qualquer envio', 'envios');
  }

  if (sectionId === 'displayStatus') {
    return getDisplayStatusLabel(filters.displayStatus);
  }

  if (sectionId === 'harvest') {
    if (filters.harvests.length === 0) return 'Qualquer safra';
    if (filters.harvests.length === 1) return filters.harvests[0];
    return `${filters.harvests.length} safras`;
  }

  if (sectionId === 'sacks') {
    return formatSacksSummary(filters);
  }

  if (sectionId === 'period') {
    return formatPeriodSummary(filters);
  }

  return filters.onlyBlend ? 'Ligas' : 'Todas';
}

function getInitialFilterSection(filters: HiddenFilters): FilterSectionId {
  return (
    FILTER_SECTION_ORDER.find((sectionId) => hasFilterSectionValue(sectionId, filters)) ?? 'owner'
  );
}

/* ── Snapshot do estado da lista (preserva scroll, itens, busca, filtros e cards
   expandidos ao sair da pagina). Salvo CONTINUAMENTE (debounce) enquanto o user
   esta na Lotes — cobre QUALQUER saida, nao so o card. Na volta: vir do DETALHE
   da amostra restaura sempre (permanente); vir de outra rota restaura so dentro
   da janela do TTL (contada desde que saiu da Lotes). ── */

const SAMPLES_SNAPSHOT_KEY = 'samples-list-snapshot-v3';
// Janela de validade SO pra retorno que NAO veio do detalhe da amostra.
const SAMPLES_SNAPSHOT_TTL_MS = 30 * 60 * 1000;

interface SamplesSnapshot {
  items: SampleSnapshot[];
  total: number;
  nextCursor: { lotInt: number | null; id: string } | null;
  scrollTop: number;
  searchInput: string;
  appliedSearch: string;
  appliedHiddenFilters: HiddenFilters;
  // Ids dos cards expandidos (versao estendida) no momento de sair.
  expandedSampleIds: string[];
  // Hora do ultimo save (≈ hora de sair da Lotes). Usada pelo TTL acima.
  savedAt: number;
}

function readSamplesSnapshot(): SamplesSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SAMPLES_SNAPSHOT_KEY);
    // Leitura pura (NAO consome): o snapshot persiste e e re-salvo continuamente
    // enquanto o user esta na Lotes. A remocao e explicita (clearSamplesSnapshot)
    // no descarte pelo TTL, em deep-link conflitante e ao mudar busca/filtro.
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (typeof parsed.savedAt !== 'number') return null;
    // Snapshots antigos podem nao ter campos novos de HiddenFilters (ex.:
    // padroes). Mescla com os defaults pra garantir arrays/strings validos.
    const mergedHiddenFilters = {
      ...EMPTY_HIDDEN_FILTERS,
      ...(parsed.appliedHiddenFilters ?? {}),
    } as HiddenFilters & { harvest?: string };
    // Migra snapshot antigo: harvest (string unica) -> harvests (array).
    if (
      mergedHiddenFilters.harvests.length === 0 &&
      typeof mergedHiddenFilters.harvest === 'string' &&
      mergedHiddenFilters.harvest.trim()
    ) {
      mergedHiddenFilters.harvests = [mergedHiddenFilters.harvest.trim()];
    }
    delete mergedHiddenFilters.harvest;
    parsed.appliedHiddenFilters = mergedHiddenFilters;
    // Snapshots antigos podem nao ter expandedSampleIds (cards expandidos).
    parsed.expandedSampleIds = Array.isArray(parsed.expandedSampleIds)
      ? parsed.expandedSampleIds
      : [];
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

type SampleCursor = { lotInt: number | null; id: string };
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
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: NON_PROSPECTOR_ROLES,
  });
  const router = useRouter();
  const searchParams = useSearchParams();

  // Deep-link de status via URL (ex.: dashboard "Ver disponiveis" -> ?displayStatus=OPEN).
  const displayStatusParam = searchParams.get('displayStatus');
  const urlDisplayStatus: DisplayStatusFilter =
    displayStatusParam &&
    DISPLAY_STATUS_FILTER_OPTIONS.some((option) => option.value === displayStatusParam)
      ? (displayStatusParam as DisplayStatusFilter)
      : '';

  const [initialSnapshot] = useState<SamplesSnapshot | null>(() => {
    const snap = readSamplesSnapshot();
    if (!snap) return null;
    // O deep-link da URL tem prioridade sobre um snapshot com status diferente.
    if (urlDisplayStatus && snap.appliedHiddenFilters.displayStatus !== urlDisplayStatus) {
      clearSamplesSnapshot();
      return null;
    }
    // Dois regimes: voltar do DETALHE da amostra (/samples/:id) restaura sempre
    // (permanente); voltar de qualquer outra rota restaura so dentro do TTL,
    // contado desde que saiu da Lotes. `getRouteLeftBehind()` lido aqui no render
    // devolve a rota de origem (ver lib/navigation/route-history). `/samples/new`
    // NAO conta como detalhe.
    const prev = getRouteLeftBehind();
    const cameFromDetail = !!prev && /^\/samples\/[^/]+$/.test(prev) && prev !== '/samples/new';
    if (!cameFromDetail && Date.now() - snap.savedAt > SAMPLES_SNAPSHOT_TTL_MS) {
      clearSamplesSnapshot();
      return null;
    }
    return snap;
  });

  const initialFilters: HiddenFilters = initialSnapshot
    ? initialSnapshot.appliedHiddenFilters
    : urlDisplayStatus
      ? { ...EMPTY_HIDDEN_FILTERS, displayStatus: urlDisplayStatus }
      : EMPTY_HIDDEN_FILTERS;

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
  const [draftHiddenFilters, setDraftHiddenFilters] = useState<HiddenFilters>(() => initialFilters);
  const [appliedHiddenFilters, setAppliedHiddenFilters] = useState<HiddenFilters>(
    () => initialFilters
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Campos de cliente RETRÁTEIS (Proprietário/Comprador/Enviado para): só um
  // expande por vez; ao expandir, mostra o typeahead; colapsado mostra só os
  // chips. Fecha ao clicar fora.
  const [openClientFilter, setOpenClientFilter] = useState<'owner' | 'buyer' | 'sentTo' | null>(
    null
  );
  const expandedFilterInputRef = useRef<HTMLInputElement | null>(null);
  // Breakpoint desktop (>=901px). O modal de filtros usa layout PROPRIO no
  // desktop (campos de cliente diretos/nao-retrateis + linhas de 3 e 4
  // colunas, modal mais largo). No mobile segue o layout retratil/compacto.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 901px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  // Opcoes dos filtros de classificacao (valores distintos canonicos), por
  // campo, carregadas sob demanda toda vez que o modal de filtros abre.
  const [classificationOptions, setClassificationOptions] = useState<{
    padrao: string[];
    aspecto: string[];
    catacao: string[];
    certif: string[];
  }>({ padrao: [], aspecto: [], catacao: [], certif: [] });
  const [classificationOptionsLoading, setClassificationOptionsLoading] = useState(false);
  // Cache "carrega uma vez": vira true apos a 1a carga bem-sucedida das opcoes
  // de classificacao; reabrir o modal de filtros nao refaz as 4 chamadas.
  const classificationOptionsLoadedRef = useRef(false);
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
  const [expandedSampleIds, setExpandedSampleIds] = useState<Set<string>>(
    () => new Set(initialSnapshot?.expandedSampleIds ?? [])
  );
  const [newSampleModalOpen, setNewSampleModalOpen] = useState(false);
  const [newSampleModalMounted, setNewSampleModalMounted] = useState(false);
  // Etiqueta de Aprovação (opção "Aprovação" do leque do "+"). Modal próprio,
  // mesmo padrão do NewSampleModal (delayed unmount pro slide-down do sheet).
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalModalMounted, setApprovalModalMounted] = useState(false);
  // Incrementa apos criar amostra via FAB/botao pra forcar refetch da lista
  // (decisao 5.31 = a — refetch automatico).
  const [newSampleRefetchKey, setNewSampleRefetchKey] = useState(0);

  // Liga B1.4 (F1.D): modo selecao pra criar liga. Disparado via FAB → Liga.
  // selectionMode controla render do header (SelectionModeHeader vs normal),
  // navbar (body class is-selection-mode), e shape dos cards (com bolinha).
  // selectedIds persiste entre buscas/filtros — contador SEMPRE de .size.
  const [selectionMode, setSelectionMode] = useState<'idle' | 'blend'>('idle');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // Lista de samples selecionadas pro BlendConfirmationSheet, memoizada: sem isso
  // o `.filter()` inline gerava um array novo a cada render e o effect de
  // SYNC_SAMPLES do sheet re-disparava à toa (M6). Recalcula quando os itens
  // (ex.: refetch que atualiza availableSacks) ou a seleção mudam — então a
  // re-sincronização de availableSacks no sheet continua valendo.
  const selectedSamplesForSheet = useMemo(
    () => samplesState.items.filter((s) => selectedIds.has(s.id)),
    [samplesState.items, selectedIds]
  );
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
  const filtersRef = useRef({ appliedSearch, appliedHiddenFilters });
  // Modo de selecao atual lido dentro do load-more estavel (sem reconstruir o
  // callback) — garante que paginar no modo Liga tambem peca eligibility.
  const selectionModeRef = useRef(selectionMode);
  // Entradas do ultimo fetch — pra distinguir "so trocou de modo" (Liga on/off,
  // fetch OTIMISTA mantendo a lista visivel) de "filtros/busca mudaram" (recarrega
  // com loading + scroll pro topo).
  const prevFetchInputsRef = useRef({
    appliedHiddenFilters,
    appliedSearch,
    newSampleRefetchKey,
    selectionMode,
  });
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
        id: 'sentTo',
        label: 'Enviado para',
        summary: getFilterSectionSummary('sentTo', draftHiddenFilters),
        active: hasFilterSectionValue('sentTo', draftHiddenFilters),
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
    if (pending === null || pending <= 0) {
      pendingScrollRestoreRef.current = null;
      return;
    }
    // Restaura o scroll ao voltar da detail. No mobile quem rola e a janela e o
    // layout/altura so assenta depois de alguns frames (safe-areas, sheet,
    // settle de scroll do iOS) — por isso um unico scrollTo "pegava" perto do
    // topo e o scroll se perdia. Reaplica a cada frame ate o scroll bater no
    // alvo (±2px) ou esgotar as tentativas (~20 frames). Para cedo ao acertar,
    // pra nao brigar com um scroll do usuario.
    let raf = 0;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;
    const tick = () => {
      applyListScrollTop(samplesScrollRef.current, pending);
      attempts += 1;
      const reached = Math.abs(readListScrollTop(samplesScrollRef.current) - pending) <= 2;
      if (reached || attempts >= MAX_ATTEMPTS) {
        pendingScrollRestoreRef.current = null;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
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

  // Carrega as opcoes dos filtros de classificacao (4 campos em paralelo). As
  // opcoes mudam raramente, entao carrega UMA VEZ por montagem da pagina:
  // reabrir o modal nao refaz as 4 chamadas. Em erro/abort, o ref fica false e
  // tenta de novo na proxima abertura (mantem as listas atuais nesse meio-tempo).
  useEffect(() => {
    if (!filtersOpen || !session) {
      return;
    }
    if (classificationOptionsLoadedRef.current) {
      return;
    }
    let active = true;
    const controller = new AbortController();
    setClassificationOptionsLoading(true);
    Promise.all([
      listClassificationValues(session, 'padrao', { signal: controller.signal }),
      listClassificationValues(session, 'aspecto', { signal: controller.signal }),
      listClassificationValues(session, 'catacao', { signal: controller.signal }),
      listClassificationValues(session, 'certif', { signal: controller.signal }),
    ])
      .then(([padrao, aspecto, catacao, certif]) => {
        if (active) {
          setClassificationOptions({
            padrao: padrao.values ?? [],
            aspecto: aspecto.values ?? [],
            catacao: catacao.values ?? [],
            certif: certif.values ?? [],
          });
          classificationOptionsLoadedRef.current = true;
        }
      })
      .catch(() => {
        /* mantem opcoes anteriores; ignora abort/erro transitorio */
      })
      .finally(() => {
        if (active) setClassificationOptionsLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [filtersOpen, session]);

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

  // Campos retráteis de cliente: foca o typeahead ao expandir; fecha ao clicar
  // fora do campo aberto OU ao rolar o modal; reseta quando o modal fecha.
  useEffect(() => {
    if (!openClientFilter) return;
    const focusTimer = window.setTimeout(() => expandedFilterInputRef.current?.focus(), 0);
    const close = () => setOpenClientFilter(null);
    function onPointerDown(event: MouseEvent) {
      const openField = document.querySelector('.samples-filter-field--retractable.is-open');
      if (openField && !openField.contains(event.target as Node)) {
        close();
      }
    }
    const modalContent = document.querySelector('.samples-filter-modal-content');
    document.addEventListener('mousedown', onPointerDown);
    // O scroll do modal fecha o campo. Atrasado pra o scroll que o foco inicial
    // do input pode disparar (scrollIntoView) não fechar logo na abertura.
    const scrollAttachTimer = window.setTimeout(() => {
      modalContent?.addEventListener('scroll', close, { passive: true });
    }, 250);
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(scrollAttachTimer);
      document.removeEventListener('mousedown', onPointerDown);
      modalContent?.removeEventListener('scroll', close);
    };
  }, [openClientFilter]);

  useEffect(() => {
    if (!filtersOpen) setOpenClientFilter(null);
  }, [filtersOpen]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Consome o ?displayStatus= da URL: o filtro ja foi semeado no estado inicial;
  // limpa a URL pra um refresh nao re-forcar o status (mesmo padrao do antigo aging).
  useEffect(() => {
    if (displayStatusParam) {
      router.replace('/samples', { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    filtersRef.current = { appliedSearch, appliedHiddenFilters };
  }, [appliedSearch, appliedHiddenFilters]);

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

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

  // Delayed unmount do ApprovalLabelModal (mesma lógica do NewSampleModal).
  useEffect(() => {
    if (approvalModalOpen) {
      setApprovalModalMounted(true);
      return;
    }
    const t = window.setTimeout(() => setApprovalModalMounted(false), 400);
    return () => window.clearTimeout(t);
  }, [approvalModalOpen]);

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
      cursorLotInt: cursor.lotInt != null ? String(cursor.lotInt) : undefined,
      cursorId: cursor.id,
      search: filters.appliedSearch || undefined,
      ownerClientIds: filters.appliedHiddenFilters.ownerClients.map((client) => client.id),
      buyerClientIds: filters.appliedHiddenFilters.buyerClients.map((client) => client.id),
      sentToClientIds: filters.appliedHiddenFilters.sentToClients.map((client) => client.id),
      padroes: filters.appliedHiddenFilters.padroes,
      aspectos: filters.appliedHiddenFilters.aspectos,
      catacoes: filters.appliedHiddenFilters.catacoes,
      certificados: filters.appliedHiddenFilters.certificados,
      displayStatus: filters.appliedHiddenFilters.displayStatus || undefined,
      harvests: filters.appliedHiddenFilters.harvests,
      isBlend: filters.appliedHiddenFilters.onlyBlend || undefined,
      sacksMin: filters.appliedHiddenFilters.sacksMin || undefined,
      sacksMax: filters.appliedHiddenFilters.sacksMax || undefined,
      ...buildPeriodQuery(filters.appliedHiddenFilters),
      // No modo Liga, paginar tambem precisa trazer eligibility/committedSacks —
      // senao itens da 2a pagina em diante chegariam selecionaveis indevidamente.
      eligibleForBlend: selectionModeRef.current === 'blend' ? true : undefined,
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

  // Fetch UNIFICADO da lista (revisao 2026-06-24): um unico caminho pro fetch
  // inicial. eligibleForBlend acompanha o selectionMode, entao filtrar/buscar/
  // paginar no modo Liga sempre traz eligibility (sem dois effects competindo).
  // Entrar/sair do modo Liga e OTIMISTA: mantem a lista visivel e so troca quando
  // o refetch enriquecido chega (sem flash de loading nem scroll pro topo). Em
  // modo Liga, reconcilia selecoes (deseleciona o que virou inelegivel).
  useEffect(() => {
    if (!session) {
      return;
    }

    const blend = selectionMode === 'blend';
    const prev = prevFetchInputsRef.current;
    const filtersChanged =
      prev.appliedHiddenFilters !== appliedHiddenFilters ||
      prev.appliedSearch !== appliedSearch ||
      prev.newSampleRefetchKey !== newSampleRefetchKey;
    const isModeToggleOnly = !filtersChanged && prev.selectionMode !== selectionMode;
    prevFetchInputsRef.current = {
      appliedHiddenFilters,
      appliedSearch,
      newSampleRefetchKey,
      selectionMode,
    };

    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    // Invalida qualquer load-more em andamento (inclusive ao entrar/sair do modo
    // Liga): a proxima resposta obsoleta sera descartada ao comparar com o token.
    loadMoreStateRef.current.token += 1;
    loadMoreStateRef.current.inFlight = false;

    const abortController = new AbortController();
    let active = true;

    // Filtro/busca mudaram = recarrega do zero (loading + topo). So trocar de modo
    // (Liga on/off) = otimista: mantem a lista atual visivel ate o refetch chegar.
    if (!isModeToggleOnly) {
      dispatchSamples({ type: 'fetch-initial' });
      samplesScrollRef.current?.scrollTo({ top: 0 });
    }

    listSamples(
      session,
      {
        limit: SAMPLE_PAGE_LIMIT,
        search: appliedSearch || undefined,
        ownerClientIds: appliedHiddenFilters.ownerClients.map((client) => client.id),
        buyerClientIds: appliedHiddenFilters.buyerClients.map((client) => client.id),
        sentToClientIds: appliedHiddenFilters.sentToClients.map((client) => client.id),
        padroes: appliedHiddenFilters.padroes,
        aspectos: appliedHiddenFilters.aspectos,
        catacoes: appliedHiddenFilters.catacoes,
        certificados: appliedHiddenFilters.certificados,
        displayStatus: appliedHiddenFilters.displayStatus || undefined,
        harvests: appliedHiddenFilters.harvests,
        isBlend: appliedHiddenFilters.onlyBlend || undefined,
        sacksMin: appliedHiddenFilters.sacksMin || undefined,
        sacksMax: appliedHiddenFilters.sacksMax || undefined,
        ...buildPeriodQuery(appliedHiddenFilters),
        eligibleForBlend: blend ? true : undefined,
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
          // Caminho inicial (sem cursor) sempre traz total numerico; ?? 0 e so
          // pro tipo (page.total agora e number | null por causa do load-more).
          total: response.page.total ?? 0,
          nextCursor: response.page.nextCursor,
        });

        // Modo Liga: reconcilia selecoes — pra cada selectedId visivel que virou
        // inelegivel, deseleciona + toast.
        if (blend) {
          setSelectedIds((prevSel) => {
            if (prevSel.size === 0) return prevSel;
            const itemsById = new Map(response.items.map((s) => [s.id, s]));
            const next = new Set(prevSel);
            let didChange = false;
            for (const id of prevSel) {
              const item = itemsById.get(id);
              if (!item) continue; // fora dos filtros atuais — mantem
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
            return didChange ? next : prevSel;
          });
        }
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }

        if (blend) {
          // Falha ao carregar a lista enriquecida pra liga: sai do modo + avisa
          // (a saida re-dispara este effect em idle, recarregando a lista normal).
          toast.error({
            title: 'Não foi possível carregar amostras pra liga',
            description: 'Tente novamente.',
          });
          setSelectionMode('idle');
          setSelectedIds(new Set());
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
    // Deps curadas de proposito: o fetch deve rodar apenas quando filtros/busca/
    // sessao/refetchKey/modo mudam (toast/setters/dispatch sao estaveis).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedHiddenFilters, appliedSearch, session, newSampleRefetchKey, selectionMode]);

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

  // Busca AO VIVO (debounce 400ms, espelha a Clientes): a partir de 2 caracteres
  // aplica o termo (o backend casa por PREFIXO); com <2 caracteres desfiltra
  // (mostra todos). Sem botao de confirmar. O guard evita re-disparo no mount
  // (estado restaurado do snapshot). clearSamplesSnapshot evita restaurar lista
  // stale durante o fetch da busca (mesmo papel do antigo handleSearchSubmit).
  useEffect(() => {
    const trimmed = searchInput.trim();
    const nextSearch = trimmed.length >= 2 ? trimmed : '';
    if (nextSearch === appliedSearch) return;
    const handle = window.setTimeout(() => {
      clearSamplesSnapshot();
      setAppliedSearch(nextSearch);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [searchInput, appliedSearch]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearSamplesSnapshot();
    const nextFilters = normalizeHiddenFilters(draftHiddenFilters);
    setAppliedHiddenFilters(nextFilters);
    setDraftHiddenFilters(nextFilters);
    setActiveFilterSection(getInitialFilterSection(nextFilters));
    setFiltersOpen(false);
  }

  function handleClearFiltersOnly() {
    clearSamplesSnapshot();
    setDraftHiddenFilters(EMPTY_HIDDEN_FILTERS);
    setAppliedHiddenFilters(EMPTY_HIDDEN_FILTERS);
    setActiveFilterSection('owner');
  }

  // Inputs do snapshot mantidos frescos num ref (padrao "latest ref", atualizado
  // a cada render). Permite que saveSnapshotBeforeLeave seja um callback ESTAVEL
  // (deps []): senao ele mudaria a cada tecla na busca e, sendo o onClickCapture
  // do card, quebraria o memo de TODO card a cada keystroke.
  const snapshotInputsRef = useRef({
    items: samplesState.items,
    total: samplesState.total,
    nextCursor: samplesState.nextCursor,
    searchInput,
    appliedSearch,
    appliedHiddenFilters,
    expandedSampleIds,
  });
  snapshotInputsRef.current = {
    items: samplesState.items,
    total: samplesState.total,
    nextCursor: samplesState.nextCursor,
    searchInput,
    appliedSearch,
    appliedHiddenFilters,
    expandedSampleIds,
  };

  // Flush sincrono do snapshot — cinto de seguranca pro caso "rolei e cliquei
  // num card em <200ms" (antes do save continuo debounced gravar). Cabeado no
  // onClick do card. As demais saidas dependem do save continuo abaixo.
  const saveSnapshotBeforeLeave = useCallback(() => {
    // Nao persiste a lista enriquecida do modo Liga (eligibility/committedSacks):
    // a pagina restaura sempre em idle, entao guardar blend deixaria eligibility
    // velha no snapshot. Le via ref pra nao re-criar o callback ao alternar modo.
    if (selectionModeRef.current === 'blend') return;
    const snap = snapshotInputsRef.current;
    writeSamplesSnapshot({
      items: snap.items,
      total: snap.total,
      nextCursor: snap.nextCursor,
      scrollTop: readListScrollTop(samplesScrollRef.current),
      searchInput: snap.searchInput,
      appliedSearch: snap.appliedSearch,
      appliedHiddenFilters: snap.appliedHiddenFilters,
      expandedSampleIds: Array.from(snap.expandedSampleIds),
      savedAt: Date.now(),
    });
  }, []);

  // Save CONTINUO (debounce 250ms): persiste o snapshot em qualquer mudanca
  // relevante, pra preservar o estado ao sair por QUALQUER rota (tabbar, seta,
  // perfil, voltar do navegador) — nao so pelo card. Pula loading-initial/error
  // pra nao gravar lista vazia por cima de um snapshot bom. Espelha a Clientes.
  useEffect(() => {
    if (samplesState.status === 'loading-initial' || samplesState.status === 'error') return;
    // Mesmo motivo do saveSnapshotBeforeLeave: nao grava snapshot enquanto em
    // modo Liga (ref, nao dep, pra nao re-rodar o save ao alternar de modo).
    if (selectionModeRef.current === 'blend') return;
    const handle = window.setTimeout(() => {
      writeSamplesSnapshot({
        items: samplesState.items,
        total: samplesState.total,
        nextCursor: samplesState.nextCursor,
        scrollTop: readListScrollTop(samplesScrollRef.current),
        searchInput,
        appliedSearch,
        appliedHiddenFilters,
        expandedSampleIds: Array.from(expandedSampleIds),
        savedAt: Date.now(),
      });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [
    samplesState.items,
    samplesState.total,
    samplesState.nextCursor,
    samplesState.status,
    searchInput,
    appliedSearch,
    appliedHiddenFilters,
    expandedSampleIds,
  ]);

  // Scroll nao e estado React — listener dedicado (debounce 200ms) mantem o
  // scrollTop do snapshot fresco. Escuta window E o container (so o scroller
  // real dispara); readListScrollTop pega o valor certo (window no mobile,
  // container no desktop). So atualiza um snapshot ja existente.
  useEffect(() => {
    const container = samplesScrollRef.current;
    let timer: number | null = null;
    function persistScrollTop() {
      const raw = window.sessionStorage.getItem(SAMPLES_SNAPSHOT_KEY);
      if (!raw) return;
      try {
        const snap = JSON.parse(raw) as SamplesSnapshot;
        snap.scrollTop = readListScrollTop(samplesScrollRef.current);
        snap.savedAt = Date.now();
        window.sessionStorage.setItem(SAMPLES_SNAPSHOT_KEY, JSON.stringify(snap));
      } catch {
        /* ignora */
      }
    }
    function onScroll() {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(persistScrollTop, 200);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    container?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      container?.removeEventListener('scroll', onScroll);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [samplesState.items.length]);

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

  // Handlers passados ao SampleCard memoizado: estaveis via useCallback pra nao
  // quebrar o memo. Usam updater funcional do setState -> deps vazias.
  const toggleSampleSelection = useCallback((sampleId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sampleId)) next.delete(sampleId);
      else next.add(sampleId);
      return next;
    });
  }, []);

  // Toggle do card expandido. Multiplos podem ficar abertos.
  const toggleCardExpand = useCallback((sampleId: string) => {
    setExpandedSampleIds((prev) => {
      const next = new Set(prev);
      if (next.has(sampleId)) next.delete(sampleId);
      else next.add(sampleId);
      return next;
    });
  }, []);

  const showIneligibleReason = useCallback(
    (reason: SampleEligibilityReason) => {
      const label = mapEligibilityReasonToLabel(reason);
      toast.info({
        title: 'Amostra indisponível pra liga',
        description: label ?? undefined,
      });
    },
    [toast]
  );

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

  // Filtro multi-select de cliente (Proprietário/Comprador/Enviado para):
  // campo RETRÁTIL (disclosure). Colapsado mostra SÓ o nome do campo + seta +
  // bolinha com a contagem — nenhuma caixa de input à vista. Clicar abre a caixa
  // de busca (chips dos selecionados + typeahead). Fecha ao clicar fora ou
  // rolar o modal (effect acima).
  function renderClientMultiFilter(
    fieldKey: 'owner' | 'buyer' | 'sentTo',
    kind: 'owner' | 'buyer' | 'any',
    label: string,
    placeholder: string,
    emptyMessage: string,
    removeLabel: string,
    selected: ClientSummary[],
    onAdd: (client: ClientSummary) => void,
    onRemove: (clientId: string) => void,
    direct = false
  ) {
    if (!session) return null;
    const isOpen = openClientFilter === fieldKey;
    // Chips numa ÚNICA linha horizontal rolável (nunca quebram linha — altura
    // do campo fixa). Rótulo truncado por CSS (~8 chars); nome completo no title.
    const chipsRow =
      selected.length > 0 ? (
        <div className="samples-filter-chips-row">
          {selected.map((client) => {
            const fullName = getClientFilterLabel(client);
            return (
              <span key={client.id} className="samples-filter-token" title={fullName}>
                <span className="samples-filter-token-label">{fullName}</span>
                <button
                  type="button"
                  className="samples-filter-token-remove"
                  aria-label={`${removeLabel}: ${fullName}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(client.id);
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      ) : null;

    // Desktop: campo DIRETO (nao-retratil) — a caixa de busca (chips +
    // typeahead) fica sempre visivel, sem gatilho/seta de expandir.
    if (direct) {
      return (
        <div
          className={`samples-filter-field samples-filter-field--client-direct${
            selected.length > 0 ? ' is-active' : ''
          }`}
        >
          <span className="samples-filter-field-label">{label}</span>
          <div className="samples-filter-multi samples-filter-multi--lookup samples-filter-multi--direct">
            {chipsRow}
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
              placeholder={selected.length > 0 ? '' : placeholder}
              emptyMessage={emptyMessage}
            />
          </div>
          {selected.length > 0 ? (
            <span className="samples-filter-field-count" aria-hidden="true">
              {selected.length}
            </span>
          ) : null}
        </div>
      );
    }

    return (
      <div
        className={`samples-filter-field samples-filter-field--retractable${isOpen ? ' is-open' : ''}${
          selected.length > 0 ? ' is-active' : ''
        }`}
      >
        {/* COLAPSADO: só o nome do campo (gatilho clicável) + seta. A contagem
            agora vai na bolinha do canto (abaixo), comum a todos os campos. */}
        <button
          type="button"
          className="samples-filter-retract-trigger"
          aria-expanded={isOpen}
          aria-label={`${label}${selected.length > 0 ? `: ${selected.length} selecionado(s)` : ''}`}
          onClick={() => setOpenClientFilter(isOpen ? null : fieldKey)}
        >
          <span className="samples-filter-field-label">{label}</span>
          <svg
            className={`samples-filter-retract-chevron${isOpen ? ' is-open' : ''}`}
            viewBox="0 0 24 24"
            focusable="false"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {/* ABERTO: a caixa de busca aparece (chips dos selecionados + typeahead). */}
        {isOpen ? (
          <div className="samples-filter-multi samples-filter-multi--lookup samples-filter-multi--retractable is-open">
            {chipsRow}
            <ClientLookupField
              session={session}
              kind={kind}
              label={label}
              compact
              clearOnSelect
              selectedClient={null}
              inputRef={expandedFilterInputRef}
              onSelectClient={(client) => {
                if (client) onAdd(client);
              }}
              placeholder={selected.length > 0 ? '' : placeholder}
              emptyMessage={emptyMessage}
            />
          </div>
        ) : null}

        {/* Bolinha de contagem (metade dentro/fora do canto sup. direito). */}
        {selected.length > 0 ? (
          <span className="samples-filter-field-count" aria-hidden="true">
            {selected.length}
          </span>
        ) : null}
      </div>
    );
  }

  function renderFilterFields() {
    // O typeahead de cliente exige sessao nao-nula; o painel so abre logado,
    // entao isto e so o narrowing pro TS (nunca renderiza null na pratica).
    if (!session) return null;
    // Contagem dos campos de range (Sacas/Periodo) = quantos limites preenchidos.
    const sacksActiveCount =
      (draftHiddenFilters.sacksMin.trim() ? 1 : 0) + (draftHiddenFilters.sacksMax.trim() ? 1 : 0);
    const periodActiveCount =
      (draftHiddenFilters.periodFrom ? 1 : 0) + (draftHiddenFilters.periodTo ? 1 : 0);
    // Campos de cliente: no desktop sao DIRETOS (nao-retrateis, via isDesktop ->
    // param `direct`); no mobile seguem retrateis (disclosure).
    const ownerFilter = renderClientMultiFilter(
      'owner',
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
        })),
      isDesktop
    );

    const buyerFilter = renderClientMultiFilter(
      'buyer',
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
        })),
      isDesktop
    );

    const sentToFilter = renderClientMultiFilter(
      'sentTo',
      'any',
      'Enviado para',
      'Buscar destinatario',
      'Nenhum destinatario encontrado',
      'Remover destinatario',
      draftHiddenFilters.sentToClients,
      (client) =>
        setDraftHiddenFilters((c) =>
          c.sentToClients.some((existing) => existing.id === client.id)
            ? c
            : { ...c, sentToClients: [...c.sentToClients, client] }
        ),
      (clientId) =>
        setDraftHiddenFilters((c) => ({
          ...c,
          sentToClients: c.sentToClients.filter((existing) => existing.id !== clientId),
        })),
      isDesktop
    );

    // Controles compartilhados (identicos nos dois layouts; muda so o
    // agrupamento das linhas entre mobile e desktop).
    const padraoField = (
      <ClassificationFilterField
        label="Padrão"
        placeholder="Qualquer padrão"
        options={classificationOptions.padrao}
        selected={draftHiddenFilters.padroes}
        loading={classificationOptionsLoading}
        onChange={(next) => setDraftHiddenFilters((c) => ({ ...c, padroes: next }))}
      />
    );

    const aspectoField = (
      <ClassificationFilterField
        label="Aspecto"
        placeholder="Qualquer aspecto"
        options={classificationOptions.aspecto}
        selected={draftHiddenFilters.aspectos}
        loading={classificationOptionsLoading}
        onChange={(next) => setDraftHiddenFilters((c) => ({ ...c, aspectos: next }))}
      />
    );

    const catacaoField = (
      <ClassificationFilterField
        label="Catação"
        placeholder="Qualquer catação"
        options={classificationOptions.catacao}
        selected={draftHiddenFilters.catacoes}
        loading={classificationOptionsLoading}
        searchable
        onChange={(next) => setDraftHiddenFilters((c) => ({ ...c, catacoes: next }))}
      />
    );

    const certificadoField = (
      <ClassificationFilterField
        label="Certificado"
        placeholder="Qualquer certificado"
        options={classificationOptions.certif}
        selected={draftHiddenFilters.certificados}
        loading={classificationOptionsLoading}
        onChange={(next) => setDraftHiddenFilters((c) => ({ ...c, certificados: next }))}
      />
    );

    const statusField = (
      <div
        className={`samples-filter-field${draftHiddenFilters.displayStatus ? ' is-active' : ''}`}
      >
        <span className="samples-filter-field-label">Status</span>
        <span className="samples-filter-control">
          <select
            className={`samples-filter-field-input${draftHiddenFilters.displayStatus ? ' is-active' : ''}`}
            value={draftHiddenFilters.displayStatus}
            onChange={(event) =>
              setDraftHiddenFilters((c) => ({
                ...c,
                displayStatus: event.target.value as DisplayStatusFilter,
              }))
            }
          >
            <option value="">Selecionar</option>
            {DISPLAY_STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {draftHiddenFilters.displayStatus ? (
            <span className="samples-filter-field-count" aria-hidden="true">
              1
            </span>
          ) : null}
        </span>
      </div>
    );

    const safraField = (
      <ClassificationFilterField
        label="Safra"
        placeholder="Qualquer safra"
        options={[...HARVEST_OPTIONS]}
        selected={draftHiddenFilters.harvests}
        onChange={(next) => setDraftHiddenFilters((c) => ({ ...c, harvests: next }))}
      />
    );

    const tipoField = (
      <div className="samples-filter-field">
        <span className="samples-filter-field-label">Tipo de lote</span>
        <button
          type="button"
          role="switch"
          aria-checked={draftHiddenFilters.onlyBlend}
          className={`samples-filter-toggle${draftHiddenFilters.onlyBlend ? ' is-on' : ''}`}
          onClick={() => setDraftHiddenFilters((c) => ({ ...c, onlyBlend: !c.onlyBlend }))}
        >
          <span className="samples-filter-toggle-track" aria-hidden="true">
            <span className="samples-filter-toggle-thumb" />
          </span>
          <span className="samples-filter-toggle-text">Ligas</span>
        </button>
      </div>
    );

    const sacasField = (
      <div className={`samples-filter-field${sacksActiveCount > 0 ? ' is-active' : ''}`}>
        <span className="samples-filter-field-label">Sacas</span>
        <div className="samples-filter-split-grid">
          <input
            className={`samples-filter-field-input${draftHiddenFilters.sacksMin.trim() ? ' is-active' : ''}`}
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
            placeholder="Ex.: 100"
          />
          <input
            className={`samples-filter-field-input${draftHiddenFilters.sacksMax.trim() ? ' is-active' : ''}`}
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
            placeholder="até"
          />
          {sacksActiveCount > 0 ? (
            <span className="samples-filter-field-count" aria-hidden="true">
              {sacksActiveCount}
            </span>
          ) : null}
        </div>
      </div>
    );

    const periodoField = (
      <div className={`samples-filter-field${periodActiveCount > 0 ? ' is-active' : ''}`}>
        <span className="samples-filter-field-label">Periodo</span>
        <div className="samples-filter-split-grid">
          <input
            className={`samples-filter-field-input${draftHiddenFilters.periodFrom === '' ? ' is-placeholder' : ' is-active'}`}
            type="date"
            value={draftHiddenFilters.periodFrom}
            onChange={(event) =>
              setDraftHiddenFilters((c) => ({ ...c, periodFrom: event.target.value }))
            }
            aria-label="Data inicial"
          />
          <input
            className={`samples-filter-field-input${draftHiddenFilters.periodTo === '' ? ' is-placeholder' : ' is-active'}`}
            type="date"
            value={draftHiddenFilters.periodTo}
            onChange={(event) =>
              setDraftHiddenFilters((c) => ({ ...c, periodTo: event.target.value }))
            }
            aria-label="Data final"
          />
          {periodActiveCount > 0 ? (
            <span className="samples-filter-field-count" aria-hidden="true">
              {periodActiveCount}
            </span>
          ) : null}
        </div>
      </div>
    );

    // DESKTOP: modal mais largo; clientes em linhas proprias (diretos) +
    // Safra/Status/Tipo (3 col) + Padrao/Aspecto/Catacao/Certificado (4 col) +
    // Sacas/Periodo em linhas proprias. (Layout pedido pelo usuario.)
    if (isDesktop) {
      return (
        <div className="samples-filter-fields">
          {ownerFilter}
          {buyerFilter}
          {sentToFilter}
          <div className="samples-filter-row samples-filter-row--3">
            {safraField}
            {statusField}
            {tipoField}
          </div>
          <div className="samples-filter-row samples-filter-row--4">
            {padraoField}
            {aspectoField}
            {catacaoField}
            {certificadoField}
          </div>
          {sacasField}
          {periodoField}
        </div>
      );
    }

    // MOBILE: layout compacto original (cliente retratil + pares 2 colunas).
    return (
      <div className="samples-filter-fields">
        {ownerFilter}
        {buyerFilter}
        {sentToFilter}

        {/* Padrao + Aspecto e Catacao + Certificado vao 2 por linha (mesmo grid
            do par Status/Safra) pra economizar espaco vertical no modal. */}
        <div className="samples-filter-row">
          {padraoField}
          {aspectoField}
        </div>

        <div className="samples-filter-row">
          {catacaoField}
          {certificadoField}
        </div>

        <div className="samples-filter-row">
          {statusField}
          {safraField}
        </div>

        {sacasField}

        {periodoField}

        {/* Meia largura: ocupa só a coluna esquerda do grid de 2 colunas. */}
        <div className="samples-filter-row">{tipoField}</div>
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
            <h2 className="nsv2-title">Lotes</h2>
          </div>
          <HeaderAvatarMenu session={session} onLogout={logout} />
          <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
            <span className="nsv2-avatar-initials">{avatarInitials}</span>
          </Link>
        </header>

        {/* Search bar — in green area, dashboard style. Filtro fica
            FORA do form, alinhado a direita (mesmo padrao do "+" em /clients).
            has-applied-filters: mostra o botao "X" de limpar entre a busca e o
            filtro (a busca encolhe; sem filtros o "X" tuca atras do filtro). */}
        <div
          className={`hero-search-wrap${activeHiddenFiltersCount > 0 ? ' has-applied-filters' : ''}`}
        >
          {/* Busca AO VIVO: o onChange so atualiza o texto; o debounce
              (useEffect acima) aplica/desfiltra. role=search + onSubmit no-op
              pra Enter nao recarregar. Sem `has-input`: o botao fica no estado
              idle (lupa visivel, seta escondida) — vira so um icone decorativo. */}
          <form
            className="hero-search-bar"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <input
              className="hero-search-input"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar por lote ou proprietario"
              autoComplete="off"
              spellCheck={false}
            />
            {/* Ao digitar, a lupa decorativa vira um botao "x" pra limpar a
                busca de uma vez (mesmo padrao da lupa, com borda). */}
            {searchInput ? (
              <button
                type="button"
                className="hero-search-clear-input"
                aria-label="Limpar busca"
                onClick={() => setSearchInput('')}
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            ) : (
              <span className="hero-search-submit" aria-hidden="true">
                <svg
                  className="hero-search-icon-search"
                  viewBox="0 0 24 24"
                  focusable="false"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.2 16.2 4.1 4.1" />
                </svg>
              </span>
            )}
          </form>
          {selectionMode !== 'blend' ? (
            <span className="hero-search-clear-slot" aria-hidden={activeHiddenFiltersCount === 0}>
              <button
                type="button"
                className="hero-search-clear-btn"
                aria-label="Limpar filtros"
                tabIndex={activeHiddenFiltersCount > 0 ? 0 : -1}
                onClick={handleClearFiltersOnly}
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </span>
          ) : null}
          {selectionMode !== 'blend' ? (
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
          ) : null}
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
              onCreateApproval={() => setApprovalModalOpen(true)}
            />
          )}
        </div>

        <section className="samples-page-v2-sheet">
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
            ) : null}
          </div>

          {/* Live region (a11y, lacuna #6): anuncia o load-more pro leitor de
              tela — sem isso, na rolagem infinita o conteudo novo entra em
              silencio. Sempre no DOM (so o texto muda) pra o aria-live disparar. */}
          <div role="status" aria-live="polite" className="login-visually-hidden">
            {isLoadingMore ? 'Carregando mais amostras' : ''}
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
                <p className="spv2-empty-text">
                  {selectionMode === 'blend'
                    ? 'Nenhuma amostra disponível para liga'
                    : 'Nenhuma amostra encontrada'}
                </p>
                <p className="spv2-empty-sub">
                  {selectionMode === 'blend'
                    ? 'Ajuste os filtros ou saia do modo liga'
                    : 'Tente outro filtro ou termo de busca'}
                </p>
              </div>
            </div>
          ) : (
            <div ref={samplesScrollRef} className="spv2-list-scroll">
              {samplesState.items.map((sample) => (
                <SampleCard
                  key={sample.id}
                  sample={sample}
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
            className="app-modal is-themed samples-filter-modal"
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

      {approvalModalMounted ? (
        <ApprovalLabelModal
          open={approvalModalOpen}
          session={session}
          onClose={() => setApprovalModalOpen(false)}
        />
      ) : null}

      {/* Liga B2.1: bottom-sheet de confirmacao com inputs de contribuicao.
          Abre via seta -> do FAB. Modal F3 removido em 2026-05-19 — tap
          em "Criar liga" no sheet chama createBlend direto. Caracteristicas
          da liga (dono / safra / local / notes) sao derivadas das origens
          no backend; nada coletado do operador na criacao. */}
      <BlendConfirmationSheet
        open={confirmationSheetOpen && selectionMode === 'blend'}
        samples={selectedSamplesForSheet}
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
