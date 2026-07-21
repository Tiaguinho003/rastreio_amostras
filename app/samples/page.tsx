'use client';

import dynamic from 'next/dynamic';
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
import { BottomSheet } from '../../components/BottomSheet';
import { DetailOverlay } from '../../components/DetailOverlay';
import { NewSampleModal } from '../../components/NewSampleModal';
import { ClientLookupField } from '../../components/clients/ClientLookupField';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { ClassificationFilterField } from '../../components/samples/ClassificationFilterField';
import { SampleCard } from '../../components/samples/SampleCard';
import { BlendBadge } from '../../components/samples/BlendBadge';
import { HarvestDisplay } from '../../components/samples/HarvestDisplay';
import {
  SampleDetailView,
  type SampleDetailInitialAction,
} from '../../components/samples/SampleDetailView';
import { SampleCreateRadialFab } from '../../components/samples/SampleCreateRadialFab';
import { SampleMovementModal } from '../../components/samples/SampleMovementModal';
import { SampleSendFlow } from '../../components/samples/SampleSendFlow';
import {
  BlendConfirmationSheet,
  type BlendContribution,
} from '../../components/samples/BlendConfirmationSheet';
import {
  SelectedSamplesDropdown,
  type SelectedSampleSummary,
} from '../../components/samples/SelectedSamplesDropdown';
import { SelectionModeHeader } from '../../components/samples/SelectionModeHeader';
import { PlaygroundMobileNotice } from '../../components/playground/PlaygroundMobileNotice';
import {
  ApiError,
  createBlend,
  createSampleMovement,
  getSampleDetail,
  getSampleStats,
  listClassificationValues,
  listSamples,
  updateRegistration,
} from '../../lib/api-client';
import { formatPercentDisplay } from '../../lib/classification-format';
import { mapEligibilityReasonToLabel } from '../../lib/samples/eligibility-labels';
import {
  SAMPLES_INITIAL,
  samplesListReducer,
  type SampleCursor,
  type SamplesListState,
} from '../../lib/samples/samples-list-reducer';
import {
  reconcileSelection,
  toggleSelection,
  type BlendSelection,
} from '../../lib/samples/blend-selection';
import { useListRevalidation } from '../../lib/use-list-revalidation';
import { buildHarvestPresets } from '../../lib/sample-identification';
import { useToast } from '../../lib/toast/ToastProvider';
import type {
  ActiveBlendDetail,
  ClientSummary,
  SampleDetailResponse,
  SampleEligibilityReason,
  SampleSnapshot,
  SampleStatsResponse,
} from '../../lib/types';
import { getRouteLeftBehind } from '../../lib/navigation/route-history';
import { useIsDesktop } from '../../lib/use-desktop';
import { useRequireAuth } from '../../lib/use-auth';
import { NON_PROSPECTOR_ROLES } from '../../lib/roles';

// FV (KPI row): mini-metrica sob o valor de cada card — molde de /cadastros.
type KpiDelta = { text: string; dir: 'up' | 'down' | 'flat' };
type KpiTone = 'blue' | 'green' | 'amber';

// FV (tabela desktop): campos de uma linha da tabela de lotes. Espelha o que o
// SampleCard deriva — status comercial, dono ("Carteira da corretora" pra liga
// sem dono fixado), saldo de sacas e o resumo da ultima classificacao (padrao +
// catacao, os mesmos campos root-level que o card expandido mostrava).
function describeSampleRow(sample: SampleSnapshot) {
  const isInvalidated = sample.status === 'INVALIDATED';
  const status = isInvalidated
    ? { label: 'Deletado', chip: 'fv-chip-gray' }
    : sample.commercialStatus === 'SOLD'
      ? { label: 'Vendido', chip: 'fv-chip-gray' }
      : sample.commercialStatus === 'LOST'
        ? { label: 'Perdido', chip: 'fv-chip-red' }
        : { label: 'Em aberto', chip: 'fv-chip-green' };

  const available = sample.availableSacks;
  const declared = sample.declared.sacks;
  const consumed = (sample.soldSacks ?? 0) + (sample.lostSacks ?? 0);

  const classData = sample.latestClassification?.data ?? null;
  const padrao = typeof classData?.padrao === 'string' ? classData.padrao.trim() : '';
  const catacao = formatPercentDisplay(classData?.catacao);
  const catacaoText = catacao === null || catacao === undefined ? '' : String(catacao).trim();

  // Gating das acoes do menu ⋯ — espelha o do card expandido (envio por status,
  // perda por status + saldo) e o do detalhe (deletar so sem venda).
  const commercialAllowed =
    sample.status === 'REGISTRATION_CONFIRMED' || sample.status === 'CLASSIFIED';

  return {
    canSend: commercialAllowed,
    canLoss: commercialAllowed && (available ?? 0) > 0,
    canDelete: !isInvalidated && !sample.isBlend && (sample.soldSacks ?? 0) === 0,
    isInvalidated,
    status,
    lot: sample.internalLotNumber ?? sample.id.slice(0, 8),
    owner:
      sample.isBlend && sample.blendOwnerPinned && !sample.ownerClientId
        ? 'Carteira da corretora'
        : sample.declared.owner || '—',
    sacks: available === null || available === undefined ? '—' : available.toLocaleString('pt-BR'),
    sacksSub:
      consumed > 0 && declared != null ? `de ${declared.toLocaleString('pt-BR')} sacas` : null,
    hasHarvest: Boolean(sample.declared.harvest?.trim()),
    classification:
      padrao || catacaoText ? { main: padrao || '—', sub: catacaoText || null } : null,
  };
}

const formatKpiPct = (value: number) =>
  `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

// Sub-abas de /samples (PG1/PG23): "Lotes" (lista atual, default) + "Simulador"
// (Playground). Molde do ?tab= copiado de app/contratos/page.tsx.
const SAMPLES_TABS = [
  { key: 'lotes', label: 'Lotes' },
  { key: 'simulador', label: 'Simulador' },
] as const;
type SamplesTab = (typeof SAMPLES_TABS)[number]['key'];

function parseSamplesTab(raw: string | null): SamplesTab {
  return SAMPLES_TABS.some((tabDef) => tabDef.key === raw) ? (raw as SamplesTab) : 'lotes';
}

// Canvas do Simulador: primeiro next/dynamic do projeto — o chunk do React
// Flow so baixa ao abrir a aba no desktop (PG5); ssr:false porque a lib mede
// DOM. O mobile renderiza PlaygroundMobileNotice (estatico) e nunca o baixa.
const PlaygroundTab = dynamic(
  () =>
    import('../../components/playground/PlaygroundTab').then((module_) => module_.PlaygroundTab),
  {
    ssr: false,
    loading: () => <div className="pg-canvas-skeleton" aria-hidden />,
  }
);

const SAMPLE_PAGE_LIMIT = 20;
// F3: duracao do check canonico de sucesso antes de fechar o painel/sheet e
// abrir o drawer do lote criado (mesmo tempo dos paineis do cliente).
const SUCCESS_CHECK_MS = 1000;
// Mesma fonte do registro (NewSampleModal) — desliza com o ano e cobre todas
// as safras selecionaveis ao cadastrar. Ver buildHarvestPresets.
const HARVEST_OPTIONS = buildHarvestPresets();
// "Deletar lote": lotes deletados somem da UI — sem opcao de filtro pra eles.
const DISPLAY_STATUS_FILTER_OPTIONS = [
  { value: 'OPEN', label: 'Em aberto' },
  { value: 'SOLD', label: 'Vendido' },
  { value: 'LOST', label: 'Perdido' },
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
  // FV: filtro do KPI "Aguardando classificacao" (statusGroup do backend, que
  // ja existia e nunca fora exposto). NAO tem campo no painel de filtros — so
  // liga/desliga pelo card; entra na contagem e no "Limpar filtros" como os
  // demais.
  onlyPendingClassification: boolean;
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
  onlyPendingClassification: false,
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
    filters.onlyBlend ||
    filters.onlyPendingClassification
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
    onlyPendingClassification: filters.onlyPendingClassification,
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
  if (filters.onlyPendingClassification) count += 1;
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
    return getClientsFilterSummary(filters.ownerClients, 'Qualquer proprietário', 'proprietários');
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
   da janela do TTL (contada desde que saiu da Lotes).
   Desde 2026-07-07 o snapshot e SO a primeira pintura (stale-while-revalidate):
   um refetch silencioso roda por baixo no mount restaurado, no retorno do app
   ao primeiro plano e a cada 60s (useListRevalidation) — a lista nao fica mais
   congelada em dados velhos. ── */

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

/* ── Samples list reducer (scroll infinito com cursor) ──
   Extraído pra lib/samples/samples-list-reducer.ts (LOT-T1, revisão geral)
   pra ganhar cobertura de regressão — import no topo do arquivo. */

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

  // FV: o card "Amostras enviadas" (DSB-D14) saiu da lista — a pagina passou a
  // ser cabecalho + KPI + tabela. `RecentSendsCard` e a rota
  // /samples/recent-sends ficam orfaos (limpeza na consolidacao do ciclo).

  // Deep-link de status via URL (?displayStatus=OPEN; era o "Ver disponiveis" do
  // donut do dashboard, removido no DSB-D14 — o param segue valido).
  const displayStatusParam = searchParams.get('displayStatus');
  const urlDisplayStatus: DisplayStatusFilter =
    displayStatusParam &&
    DISPLAY_STATUS_FILTER_OPTIONS.some((option) => option.value === displayStatusParam)
      ? (displayStatusParam as DisplayStatusFilter)
      : '';

  // Aba ativa via ?tab= (fonte de verdade, molde contratos). O deep-link
  // ?displayStatus= e consumido UMA vez na inicializacao (vira estado), entao
  // solta-lo da URL ao trocar de aba nao afeta os filtros ja aplicados.
  const tab = parseSamplesTab(searchParams.get('tab'));

  // F2 do redesign (RD2/RD8): o detalhe do lote e um OVERLAY dirigido pela
  // URL — `?lote=<id>` aberto, ausente fechado (molde /cadastros?cliente=).
  // Back fecha porque consome a entry criada no push; deep-link/refresh (sem
  // push nosso) fecha limpando o param via replace.
  const loteId = searchParams.get('lote');
  const openedLoteByPushRef = useRef(false);
  // Com modal interno aberto no detalhe, ESC/X do overlay nao fecham.
  const loteDismissGuardRef = useRef(false);

  const openLote = useCallback(
    (id: string, action?: SampleDetailInitialAction) => {
      const params = new URLSearchParams(searchParams.toString());
      const alreadyOpen = params.has('lote');
      // focus/highlight/source sao deep-links DO LOTE (scroll/pulso do
      // detalhe): residuais do lote anterior nao valem pro proximo.
      params.delete('focus');
      params.delete('highlight');
      params.delete('source');
      params.set('lote', id);
      // FV: acao profunda do menu ⋯ (abre o lote JA com o modal).
      if (action) {
        params.set('acao', action);
      } else {
        params.delete('acao');
      }
      const url = `/samples?${params.toString()}`;
      if (alreadyOpen) {
        // Troca de lote com o overlay aberto (peek desktop / links detalhe→
        // detalhe): replace mantem UMA entry — back segue fechando em 1 passo.
        router.replace(url, { scroll: false });
      } else {
        router.push(url, { scroll: false });
        openedLoteByPushRef.current = true;
      }
    },
    [router, searchParams]
  );

  const closeLote = useCallback(() => {
    if (openedLoteByPushRef.current) {
      openedLoteByPushRef.current = false;
      router.back();
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete('lote');
    params.delete('focus');
    params.delete('highlight');
    params.delete('source');
    params.delete('acao');
    const qs = params.toString();
    router.replace(qs ? `/samples?${qs}` : '/samples', { scroll: false });
  }, [router, searchParams]);

  // FV: acao profunda do menu ⋯ (?acao=imprimir|deletar), consumida UMA vez
  // pelo detalhe. Ao consumir, o param sai da URL via replace — assim a mesma
  // acao pode ser repetida no mesmo lote sem remontar o painel.
  const acaoParam = searchParams.get('acao');
  const loteAcao: SampleDetailInitialAction | undefined =
    acaoParam === 'imprimir' || acaoParam === 'deletar' ? acaoParam : undefined;
  const clearLoteAcao = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has('acao')) return;
    params.delete('acao');
    const qs = params.toString();
    router.replace(qs ? `/samples?${qs}` : '/samples', { scroll: false });
  }, [router, searchParams]);

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
    // devolve a rota de origem (ver lib/navigation/route-history).
    const prev = getRouteLeftBehind();
    const cameFromDetail = !!prev && /^\/samples\/[^/]+$/.test(prev);
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
  // Breakpoint desktop (>=901px) pelo hook compartilhado (FV: a pagina usava
  // um matchMedia proprio). Governa o layout do painel de filtros e, a partir
  // da FV, a casca institucional (cabecalho + KPI + tabela).
  const isDesktop = useIsDesktop();
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
  // Incrementa apos criar amostra via FAB/botao pra forcar refetch da lista
  // (decisao 5.31 = a — refetch automatico).
  const [newSampleRefetchKey, setNewSampleRefetchKey] = useState(0);
  // Revalidacao silenciosa (2026-07-07): incrementa pra refazer o fetch SEM
  // skeleton/scroll-reset (retorno ao app + polling — useListRevalidation).
  const [refreshTick, setRefreshTick] = useState(0);

  // FV: menu ⋯ da linha da tabela — id do lote com o menu aberto.
  const [rowMenuFor, setRowMenuFor] = useState<string | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const rowMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!rowMenuFor) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rowMenuRef.current?.contains(target)) {
        setRowMenuFor(null);
      }
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Nao deixa o ESC vazar pro overlay/pagina enquanto o menu esta aberto.
      event.preventDefault();
      event.stopPropagation();
      setRowMenuFor(null);
      rowMenuTriggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown, true);
    };
  }, [rowMenuFor]);

  // KPI row da lista (FV): contagens globais, so no desktop. Recarrega quando
  // um lote e criado (newSampleRefetchKey) e quando o detalhe abre/fecha (de
  // dentro dele sai deletar/vender/classificar) — o Cache-Control de 30s da
  // rota amortece repeticoes.
  const [sampleStats, setSampleStats] = useState<SampleStatsResponse | null>(null);
  useEffect(() => {
    if (!session || !isDesktop) return;
    let active = true;
    getSampleStats(session)
      .then((stats) => {
        if (active) setSampleStats(stats);
      })
      .catch(() => {
        /* KPI fica em "—"; a lista continua funcional */
      });
    return () => {
      active = false;
    };
  }, [session, isDesktop, newSampleRefetchKey, loteId]);
  // Acoes do card expandido (Enviar/Perda), hospedadas aqui. Ao clicar, hidrata o
  // detalhe (getSampleDetail: version fresco + activeBlends) e abre o fluxo.
  const [sendTarget, setSendTarget] = useState<SampleDetailResponse | null>(null);
  const [lossTarget, setLossTarget] = useState<{
    sample: SampleSnapshot;
    activeBlends: ActiveBlendDetail[];
  } | null>(null);
  const [lossSaving, setLossSaving] = useState(false);

  // Liga B1.4 (F1.D): modo selecao pra criar liga. Disparado via FAB → Liga.
  // selectionMode controla render do header (SelectionModeHeader vs normal),
  // navbar (body class is-selection-mode), e shape dos cards (com bolinha).
  // A selecao guarda o SNAPSHOT do lote (Map id→SampleSnapshot, ordem de
  // selecao) e persiste entre buscas/filtros — antes era Set<string> e todo
  // consumo filtrava a lista visivel, entao lote selecionado fora da busca
  // atual sumia silenciosamente da liga criada (bug corrigido 2026-07-07).
  // reconcileSelection (lib/samples/blend-selection.ts) re-sincroniza os
  // snapshots a cada refetch e remove os que viraram inelegiveis.
  const [selectionMode, setSelectionMode] = useState<'idle' | 'blend'>('idle');
  const [selectedSamples, setSelectedSamples] = useState<BlendSelection>(() => new Map());
  // Lista pro BlendConfirmationSheet, memoizada: um array novo a cada render
  // re-disparava o effect de SYNC_SAMPLES do sheet a toa (M6). Vem direto do
  // Map da selecao — inclui selecionados fora da lista atual; os snapshots
  // sao atualizados pela reconciliacao, entao a re-sincronizacao de
  // availableSacks no sheet continua valendo.
  const selectedSamplesForSheet = useMemo(
    () => Array.from(selectedSamples.values()),
    [selectedSamples]
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

  const [activeFilterSection, setActiveFilterSection] = useState<FilterSectionId | null>(() =>
    initialSnapshot ? getInitialFilterSection(initialSnapshot.appliedHiddenFilters) : 'owner'
  );
  // Mount restaurado do snapshot: o fetch de mount roda SILENCIOSO (stale-
  // while-revalidate) em vez de skeleton — ver o effect unificado.
  const skipNextFetchRef = useRef(initialSnapshot !== null);
  const pendingScrollRestoreRef = useRef<number | null>(
    initialSnapshot ? initialSnapshot.scrollTop : null
  );
  const samplesScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
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

  // Troca de sub-aba (PG1/PG23). O scroll da lista e capturado AQUI, antes do
  // re-render esconder a sheet (display:none zera o scrollTop), e restaurado
  // pelo effect abaixo ao voltar pra aba Lotes.
  const lotesScrollBackupRef = useRef(0);
  const selectTab = useCallback(
    (next: SamplesTab) => {
      if (next === tab) return;
      if (next === 'simulador') {
        lotesScrollBackupRef.current = readListScrollTop(samplesScrollRef.current);
      }
      router.replace(next === 'lotes' ? '/samples' : '/samples?tab=simulador');
    },
    [router, tab]
  );
  useEffect(() => {
    if (tab !== 'lotes' || lotesScrollBackupRef.current <= 0) return;
    applyListScrollTop(samplesScrollRef.current, lotesScrollBackupRef.current);
    lotesScrollBackupRef.current = 0;
  }, [tab]);

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
    refreshTick,
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

  // FV: scroll-lock, ESC e focus-trap dos filtros passaram a ser do BottomSheet
  // (o modal central cuidava disso a mao). Sobra so devolver o foco ao botao
  // que abriu, ao fechar.
  useEffect(() => {
    if (filtersOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      lastFilterTriggerRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
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
  // fora do campo aberto OU ao rolar o painel; reseta quando o painel fecha.
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
    // FV: quem rola agora e o corpo do painel (o modal central tinha o proprio
    // .samples-filter-modal-content).
    const sheetBody = document.querySelector('.samples-filter-sheet .bottom-sheet-body');
    document.addEventListener('mousedown', onPointerDown);
    // O scroll do painel fecha o campo. Atrasado pra o scroll que o foco inicial
    // do input pode disparar (scrollIntoView) não fechar logo na abertura.
    const scrollAttachTimer = window.setTimeout(() => {
      sheetBody?.addEventListener('scroll', close, { passive: true });
    }, 250);
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(scrollAttachTimer);
      document.removeEventListener('mousedown', onPointerDown);
      sheetBody?.removeEventListener('scroll', close);
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
      statusGroup: filters.appliedHiddenFilters.onlyPendingClassification
        ? 'CLASSIFICATION_PENDING'
        : undefined,
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
          message:
            cause instanceof ApiError ? cause.message : 'Não foi possível carregar mais lotes.',
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
    // Revalidacao silenciosa: so o tick mudou → refetch em background mantendo
    // a lista atual na tela (sem skeleton, sem scroll pro topo, erro engolido).
    const isTickOnly =
      !filtersChanged && prev.selectionMode === selectionMode && prev.refreshTick !== refreshTick;
    prevFetchInputsRef.current = {
      appliedHiddenFilters,
      appliedSearch,
      newSampleRefetchKey,
      selectionMode,
      refreshTick,
    };

    // Mount restaurado do snapshot: antes o fetch era PULADO de vez e a lista
    // ficava congelada nos dados do snapshot ate mexer em filtro/busca (outro
    // usuario criava lotes e ninguem via). Agora o snapshot e so a primeira
    // pintura: o fetch roda silencioso por baixo (stale-while-revalidate).
    const restoredMount = skipNextFetchRef.current;
    skipNextFetchRef.current = false;
    const isSilentBackground = isTickOnly || restoredMount;

    // Invalida qualquer load-more em andamento (inclusive ao entrar/sair do modo
    // Liga): a proxima resposta obsoleta sera descartada ao comparar com o token.
    loadMoreStateRef.current.token += 1;
    loadMoreStateRef.current.inFlight = false;

    const abortController = new AbortController();
    let active = true;

    // Filtro/busca mudaram = recarrega do zero (loading + topo). Trocar de modo
    // (Liga on/off) ou revalidar em background = otimista: mantem a lista atual
    // visivel ate o refetch chegar.
    if (!isModeToggleOnly && !isSilentBackground) {
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
        statusGroup: appliedHiddenFilters.onlyPendingClassification
          ? 'CLASSIFICATION_PENDING'
          : undefined,
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

        // Modo Liga: reconcilia a selecao — snapshots atualizados pra quem
        // veio na resposta, inelegivel deseleciona + toast, fora dos filtros
        // atuais permanece (blend-selection.ts).
        if (blend) {
          setSelectedSamples((prevSel) => {
            const { selection, removed } = reconcileSelection(prevSel, response.items);
            for (const removal of removed) {
              const reasonLabel = mapEligibilityReasonToLabel(removal.reason);
              toast.info({
                title: `Lote ${removal.lot} removido da seleção`,
                description: reasonLabel ?? undefined,
              });
            }
            return selection;
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

        // Revalidacao em background falhou: mantem o que esta na tela — nao
        // derruba o modo Liga nem pinta erro por causa de um poll com rede
        // instavel (o proximo tick/retorno tenta de novo).
        if (isSilentBackground) {
          return;
        }

        if (blend) {
          // Falha ao carregar a lista enriquecida pra liga: sai do modo + avisa
          // (a saida re-dispara este effect em idle, recarregando a lista normal).
          toast.error({
            title: 'Não foi possível carregar os lotes pra liga',
            description: 'Tente novamente.',
          });
          setSelectionMode('idle');
          setSelectedSamples(new Map());
          return;
        }

        dispatchSamples({
          type: 'error',
          message:
            cause instanceof ApiError ? cause.message : 'Não foi possível carregar os lotes.',
        });
      });

    return () => {
      active = false;
      abortController.abort();
    };
    // Deps curadas de proposito: o fetch deve rodar apenas quando filtros/busca/
    // sessao/refetchKey/modo/tick mudam (toast/setters/dispatch sao estaveis).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appliedHiddenFilters,
    appliedSearch,
    session,
    newSampleRefetchKey,
    selectionMode,
    refreshTick,
  ]);

  // Revalidacao silenciosa (mesmo padrao do dashboard): refetch ao voltar o app
  // pro primeiro plano (throttle 30s) + polling 60s com a pagina visivel.
  // Guards: nao atropela carregamento/paginacao em andamento; o POLLING pausa
  // no modo Liga (trocar a lista no meio da montagem atrapalha), mas o retorno
  // ao app segue revalidando — a selecao guarda snapshots e sobrevive.
  const samplesStatusRef = useRef(samplesState.status);
  samplesStatusRef.current = samplesState.status;
  const requestSilentRefetch = useCallback((source: 'foreground' | 'poll') => {
    if (source === 'poll' && selectionModeRef.current === 'blend') return;
    const status = samplesStatusRef.current;
    if (status === 'loading-initial' || status === 'loading-more') return;
    if (loadMoreStateRef.current.inFlight) return;
    setRefreshTick((tick) => tick + 1);
  }, []);

  useListRevalidation({
    enabled: Boolean(session),
    onRevalidate: requestSilentRefetch,
  });

  // Fechou o overlay do lote (X, ESC ou back — todos passam pela URL): refetch
  // SILENCIOSO da lista, porque acoes no detalhe (envio, perda, invalidacao,
  // edicao) mudam status/saldo dos cards atras do overlay.
  const loteWasOpenRef = useRef(Boolean(loteId));
  useEffect(() => {
    const isOpen = Boolean(loteId);
    if (loteWasOpenRef.current && !isOpen) {
      requestSilentRefetch('foreground');
    }
    loteWasOpenRef.current = isOpen;
  }, [loteId, requestSilentRefetch]);

  // Liga B2.1 — quando todas as amostras forem removidas via X dentro do
  // sheet, a selecao zera e o sheet fecha automaticamente. Modo selecao
  // permanece ativo (decisao UX confirmada).
  useEffect(() => {
    if (confirmationSheetOpen && selectedSamples.size === 0) {
      setConfirmationSheetOpen(false);
    }
  }, [confirmationSheetOpen, selectedSamples]);

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

  // FV: menu ⋯ da linha da tabela (um aberto por vez, keyed por sample.id).
  // Dismiss = clique-fora + ESC devolvendo o foco ao trigger (mesmo padrao do
  // menu da tabela de clientes).
  function closeRowMenu() {
    setRowMenuFor(null);
  }

  // KPI "Aguardando classificacao" (FV): liga/desliga o recorte de pendentes
  // mantendo os demais filtros. Nao tem campo no painel — o card e o controle.
  function togglePendingClassificationFilter() {
    clearSamplesSnapshot();
    setAppliedHiddenFilters((prev) => ({
      ...prev,
      onlyPendingClassification: !prev.onlyPendingClassification,
    }));
    setDraftHiddenFilters((prev) => ({
      ...prev,
      onlyPendingClassification: !prev.onlyPendingClassification,
    }));
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
    setSelectedSamples(new Map());
  }

  function exitBlendMode() {
    setSelectionMode('idle');
    setSelectedSamples(new Map());
    setSelectionDropdownOpen(false);
    setConfirmationSheetOpen(false);
    setCreatingBlend(false);
    blendDraftIdRef.current = '';
  }

  // Handlers passados ao SampleCard memoizado: estaveis via useCallback pra nao
  // quebrar o memo. Usam updater funcional do setState -> deps vazias. Recebe o
  // SampleSnapshot inteiro: a selecao guarda o snapshot, nao so o id.
  const toggleSampleSelection = useCallback((sample: SampleSnapshot) => {
    setSelectedSamples((prev) => toggleSelection(prev, sample));
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

  // Acoes do card: hidratam o detalhe (version fresco + activeBlends) e abrem o
  // fluxo na propria lista. Estaveis (card memoizado).
  // F3: as duas operacoes tambem saem do ⋯ do HERO do drawer, que so tem o id
  // do lote — por isso a hidratacao mora numa versao por id, e os handlers do
  // card (memoizado, recebe o snapshot) so delegam.
  const openSendBySampleId = useCallback(
    async (sampleId: string) => {
      if (!session) return;
      try {
        const detail = await getSampleDetail(session, sampleId);
        setSendTarget(detail);
      } catch (cause) {
        toast.error({
          title: 'Não foi possível abrir o envio',
          description: cause instanceof ApiError ? cause.message : undefined,
        });
      }
    },
    [session, toast]
  );

  const openLossBySampleId = useCallback(
    async (sampleId: string) => {
      if (!session) return;
      try {
        const detail = await getSampleDetail(session, sampleId);
        setLossTarget({ sample: detail.sample, activeBlends: detail.activeBlends ?? [] });
      } catch (cause) {
        toast.error({
          title: 'Não foi possível abrir a perda',
          description: cause instanceof ApiError ? cause.message : undefined,
        });
      }
    },
    [session, toast]
  );

  const handleCardSend = useCallback(
    (sample: SampleSnapshot) => {
      void openSendBySampleId(sample.id);
    },
    [openSendBySampleId]
  );

  const handleCardLoss = useCallback(
    (sample: SampleSnapshot) => {
      void openLossBySampleId(sample.id);
    },
    [openLossBySampleId]
  );

  const showIneligibleReason = useCallback(
    (reason: SampleEligibilityReason) => {
      const label = mapEligibilityReasonToLabel(reason);
      toast.info({
        title: 'Lote indisponível pra liga',
        description: label ?? undefined,
      });
    },
    [toast]
  );

  // Liga B1.5: remover individual via X no popover. Se for a ultima,
  // fecha o popover automaticamente mas mantem o modo selecao ativo
  // (decisao UX confirmada: nao sai do modo).
  function handleRemoveFromSelection(sampleId: string) {
    setSelectedSamples((prev) => {
      if (!prev.has(sampleId)) return prev;
      const next = new Map(prev);
      next.delete(sampleId);
      if (next.size === 0) setSelectionDropdownOpen(false);
      return next;
    });
  }

  // Liga B2.1: abre o bottom-sheet de confirmacao. Disparado pelo FAB-seta
  // -> em /samples quando ha >=2 amostras selecionadas.
  function openConfirmation() {
    if (selectedSamples.size < 2) return; // safety; seta ja vem disabled
    // Fecha o popover de revisao se estiver aberto (mutuamente exclusivos).
    setSelectionDropdownOpen(false);
    setConfirmationSheetOpen(true);
  }

  // "Voltar" no sheet ou fechamento via backdrop / ESC. Mantem modo
  // selecao + selecao preservados.
  function closeConfirmation() {
    setConfirmationSheetOpen(false);
  }

  // Liga B2.2 refinada em 2026-05-19: tap "Criar liga" no sheet chama
  // createBlend direto (sem modal F3 intermediario). Caracteristicas da
  // liga (dono / safra / local / notes) NAO sao coletadas — owner fica
  // null (carteira da corretora — F3.A), safra deriva das origens no
  // backend (distinct ', '), local/notes ficam null. Edicao posterior
  // permite refinar via detalhe.
  async function handleProceedToCreate(
    components: BlendContribution[],
    blendOptions?: {
      lotNumber: string | null;
      lotNumberManual: boolean;
      receivedDate: string | null;
      ownerClientId: string | null;
      ownerFixed: boolean;
    }
  ) {
    if (creatingBlend) return;
    if (!session) return;
    if (components.length < 2) {
      toast.error({
        title: 'Não foi possível criar liga',
        description: 'Selecione pelo menos 2 lotes antes de continuar.',
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
        // Liga (dono fixado): o dono escolhido no modal (ou carteira = null)
        // nasce FIXADO — a propagação reativa não recalcula depois.
        ownerClientId: blendOptions?.ownerClientId ?? null,
        ownerFixed: blendOptions?.ownerFixed ?? false,
        lotNumber: blendOptions?.lotNumber ?? null,
        lotNumberManual: blendOptions?.lotNumberManual ?? false,
        receivedDate: blendOptions?.receivedDate ?? null,
      });
      const sampleId = result.sample.id;
      const lotNumber = result.sample.internalLotNumber ?? sampleId;
      blendDraftIdRef.current = '';
      // F3 (decisao 13): o sheet FICA aberto exibindo o check canonico; quem
      // fecha (e abre o drawer da liga) e o efeito de `createdBlend`.
      setCreatedBlend({ sampleId, lotNumber });
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

  // Liga B2.3 + F3 (decisao 13): criada a liga, o sheet de confirmacao fecha
  // com o check canonico e o DRAWER da liga abre sozinho — o modal central de
  // sucesso morreu junto com o do lote. O refetch da lista ja foi disparado em
  // handleProceedToCreate.
  useEffect(() => {
    if (!createdBlend) return;
    const { sampleId } = createdBlend;
    const timer = window.setTimeout(() => {
      setCreatedBlend(null);
      setConfirmationSheetOpen(false);
      setSelectionMode('idle');
      setSelectedSamples(new Map());
      setSelectionDropdownOpen(false);
      openLote(sampleId);
    }, SUCCESS_CHECK_MS);
    return () => window.clearTimeout(timer);
  }, [createdBlend, openLote]);

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
      'Proprietário',
      'Buscar proprietário',
      'Nenhum proprietário encontrado',
      'Remover proprietário',
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

    // Layout compacto (pares de 2 colunas), agora UNICO: as linhas de 3 e 4
    // colunas existiam pro modal central de 58rem, que no desktop deu lugar ao
    // painel lateral de 400px. A unica diferenca que sobra entre os tamanhos e
    // o campo de cliente — direto no desktop, retratil no mobile (`isDesktop`
    // acima).
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

  // Modo liga: no desktop governa a tabela (coluna de selecao no lugar do ⋯)
  // e a barra contextual; no mobile segue nos cards + header dedicado.
  const isBlendMode = selectionMode === 'blend';

  const fullName = session.user.fullName ?? session.user.username;
  const avatarInitials = fullName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // FV: cards da KPI row (desktop). Mini-metricas derivam do proprio stats,
  // como em /cadastros: o total cresce sobre a base do inicio do mes, "em
  // aberto" mostra participacao, sacas nao tem comparativo e pendentes vira
  // o rotulo do filtro.
  const pendingFilterActive = appliedHiddenFilters.onlyPendingClassification;
  let totalDelta: KpiDelta | null = null;
  let openDelta: KpiDelta | null = null;
  if (sampleStats) {
    const { total, open, newThisMonth } = sampleStats;
    const monthStartBase = total - newThisMonth;
    if (monthStartBase > 0) {
      totalDelta =
        newThisMonth > 0
          ? { dir: 'up', text: `+${formatKpiPct((newThisMonth / monthStartBase) * 100)} este mês` }
          : { dir: 'flat', text: '0% este mês' };
    } else {
      totalDelta = newThisMonth > 0 ? { dir: 'up', text: `+${newThisMonth} este mês` } : null;
    }
    openDelta =
      total > 0 ? { dir: 'flat', text: `${formatKpiPct((open / total) * 100)} do total` } : null;
  }

  const kpiCards: {
    key: string;
    label: string;
    value: number | undefined;
    tone: KpiTone;
    delta: KpiDelta | null;
  }[] = [
    {
      key: 'total',
      label: 'Total de lotes',
      value: sampleStats?.total,
      tone: 'blue',
      delta: totalDelta,
    },
    {
      key: 'open',
      label: 'Em aberto',
      value: sampleStats?.open,
      tone: 'green',
      delta: openDelta,
    },
    {
      key: 'sacks',
      label: 'Sacas disponíveis',
      value: sampleStats?.availableSacks,
      tone: 'green',
      delta: null,
    },
    {
      key: 'pending',
      label: 'Aguardando classificação',
      value: sampleStats?.classificationPending,
      tone: 'amber',
      delta:
        sampleStats && sampleStats.classificationPending > 0
          ? { dir: 'flat', text: pendingFilterActive ? 'Filtro ativo' : 'Filtrar na lista' }
          : null,
    },
  ];

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession} activeSubTab={tab}>
      <section
        className={`samples-page-v2 fv-lotes-page${tab === 'simulador' ? ' is-tab-simulador' : ''}`}
      >
        {/* Liga B1.4: SelectionModeHeader substitui o header normal quando
            o usuario entra em modo selecao pra criar liga. CSS body class
            is-selection-mode tambem esconde o header normal por seguranca. */}
        {selectionMode === 'blend' ? (
          <SelectionModeHeader title="Selecione Lotes" onExit={exitBlendMode} />
        ) : null}
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

        {/* Sub-abas (PG1/PG23): Lotes (default) + Simulador. No modo selecao
            de liga somem via CSS (body.is-selection-mode), molde contratos. */}
        <div className="cad-tabs pg-tabs" role="tablist" aria-label="Seções de lotes">
          {SAMPLES_TABS.map((tabDef) => (
            <button
              key={tabDef.key}
              type="button"
              role="tab"
              aria-selected={tab === tabDef.key}
              className={`cad-tab${tab === tabDef.key ? ' is-active' : ''}`}
              onClick={() => selectTab(tabDef.key)}
            >
              {tabDef.label}
            </button>
          ))}
        </div>

        {/* FV (desktop >=901px): cabecalho institucional + KPI row. No mobile
            estes blocos ficam display:none e o header verde + abas seguem. O
            titulo acompanha a sub-aba da sidenav; "+ Novo lote" e a KPI row so
            fazem sentido na lista. */}
        <div className="fv-page-head">
          <h2 className="fv-page-title">{tab === 'simulador' ? 'Simulador' : 'Lotes'}</h2>
          <button
            type="button"
            className="fv-btn fv-btn-primary"
            hidden={tab === 'simulador'}
            onClick={() => setNewSampleModalOpen(true)}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Novo lote
          </button>
        </div>

        <div className="fv-kpi-row">
          {kpiCards.map((card) => {
            const body = (
              <>
                <div className="fv-kpi-top">
                  <span className="fv-kpi-label">{card.label}</span>
                  <span className={`fv-kpi-icon is-${card.tone}`} aria-hidden="true">
                    {card.key === 'total' ? (
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
                        <path d="m3 7.5 9 4.5 9-4.5" />
                        <path d="M12 12v9" />
                      </svg>
                    ) : card.key === 'open' ? (
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M4 9h16v11H4z" />
                        <path d="M4 9 6 4h12l2 5" />
                        <path d="M10 13h4" />
                      </svg>
                    ) : card.key === 'sacks' ? (
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M8 3h8l-1.5 3.2a3 3 0 0 0 .3 3.1L17 13a5 5 0 0 1-4 8h-2a5 5 0 0 1-4-8l2.2-3.7a3 3 0 0 0 .3-3.1z" />
                        <path d="M9.5 15.5h5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" focusable="false">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    )}
                  </span>
                </div>
                <span className="fv-kpi-value">
                  {card.value == null ? '—' : card.value.toLocaleString('pt-BR')}
                </span>
                <span
                  className={`fv-kpi-delta${
                    card.delta && card.delta.dir !== 'flat' ? ` is-${card.delta.dir}` : ''
                  }`}
                >
                  {card.delta?.dir === 'up' ? (
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M7 17 17 7" />
                      <path d="M8 7h9v9" />
                    </svg>
                  ) : card.delta?.dir === 'down' ? (
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="m7 7 10 10" />
                      <path d="M17 8v9H8" />
                    </svg>
                  ) : null}
                  {card.delta ? card.delta.text : ' '}
                </span>
              </>
            );

            // "Aguardando classificacao" e um FILTRO: liga/desliga o
            // statusGroup=CLASSIFICATION_PENDING na lista. Sem pendencias o
            // card volta a ser so leitura.
            if (card.key === 'pending' && (card.value ?? 0) > 0) {
              return (
                <button
                  key={card.key}
                  type="button"
                  className={`fv-kpi is-clickable${pendingFilterActive ? ' is-active' : ''}`}
                  aria-pressed={pendingFilterActive}
                  onClick={togglePendingClassificationFilter}
                >
                  {body}
                </button>
              );
            }
            return (
              <article key={card.key} className="fv-kpi">
                {body}
              </article>
            );
          })}
        </div>

        {/* Search bar — in green area, dashboard style. Filtro fica
            FORA do form, alinhado a direita (mesmo padrao do "+" em /clients).
            has-applied-filters: mostra o botao "X" de limpar entre a busca e o
            filtro (a busca encolhe; sem filtros o "X" tuca atras do filtro). */}
        <div
          className={`hero-search-wrap fv-hide-desktop${activeHiddenFiltersCount > 0 ? ' has-applied-filters' : ''}`}
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
              placeholder="Buscar por lote ou proprietário"
              aria-label="Buscar por lote ou proprietário"
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
              aria-label="Filtros avançados"
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
              selectedCount={selectedSamples.size}
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
          {/* FV (desktop): toolbar do cartao da tabela — busca (mesma logica e
              debounce da hero), "Criar liga", funil com badge, limpar e o
              contador a direita. Mobile: display:none (a hero-search acima
              segue no comando). */}
          <div className="fv-toolbar">
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
                placeholder="Buscar por lote ou proprietário..."
                aria-label="Buscar por lote ou proprietário"
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
            {selectionMode !== 'blend' ? (
              <>
                <button type="button" className="fv-btn fv-btn-secondary" onClick={enterBlendMode}>
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M8 6h11" />
                    <path d="M8 12h11" />
                    <path d="M8 18h11" />
                    <circle cx="4" cy="6" r="1.4" />
                    <circle cx="4" cy="12" r="1.4" />
                    <circle cx="4" cy="18" r="1.4" />
                  </svg>
                  Criar liga
                </button>
                <button
                  type="button"
                  className="fv-btn fv-btn-secondary fv-toolbar-filter"
                  aria-haspopup="dialog"
                  aria-expanded={filtersOpen}
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
                  Filtros
                  {activeHiddenFiltersCount > 0 ? (
                    <span className="fv-btn-badge">{activeHiddenFiltersCount}</span>
                  ) : null}
                </button>
                {activeHiddenFiltersCount > 0 ? (
                  <button
                    type="button"
                    className="fv-toolbar-clear"
                    onClick={handleClearFiltersOnly}
                  >
                    Limpar
                  </button>
                ) : null}
              </>
            ) : null}
            <span className="fv-toolbar-count">{samplesState.total} lotes</span>
          </div>

          {/* FV (desktop): barra contextual do modo liga. Fica logo abaixo da
              toolbar (a busca continua util pra achar o lote a marcar) e
              concentra o que o header dedicado + o FAB-seta faziam no mobile:
              contador, revisao da selecao, "Criar liga" e a saida. */}
          {selectionMode === 'blend' ? (
            <div className="fv-bulkbar" role="group" aria-label="Seleção para liga">
              <span className="fv-bulkbar-count">
                {selectedSamples.size} {selectedSamples.size === 1 ? 'selecionado' : 'selecionados'}
              </span>
              {/* O popover traz backdrop e ESC proprios — o wrap so ancora. */}
              <div className="fv-bulkbar-review-wrap">
                <button
                  type="button"
                  className="fv-btn fv-btn-secondary"
                  aria-haspopup="menu"
                  aria-expanded={selectionDropdownOpen}
                  disabled={selectedSamples.size === 0}
                  onClick={() => setSelectionDropdownOpen((open) => !open)}
                >
                  Revisar
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {selectionDropdownOpen && selectedSamples.size > 0 ? (
                  <SelectedSamplesDropdown
                    samples={selectedSamplesForSheet.map<SelectedSampleSummary>((s) => ({
                      id: s.id,
                      lot: s.internalLotNumber ?? s.id.slice(0, 8),
                      availableSacks: s.availableSacks ?? null,
                    }))}
                    onRemove={handleRemoveFromSelection}
                    onClose={() => setSelectionDropdownOpen(false)}
                  />
                ) : null}
              </div>
              <button
                type="button"
                className="fv-btn fv-btn-primary"
                disabled={selectedSamples.size < 2}
                onClick={openConfirmation}
              >
                Criar liga
              </button>
              <button
                type="button"
                className="fv-bulkbar-exit"
                aria-label="Sair do modo liga"
                onClick={exitBlendMode}
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ) : null}

          {/* Section 2: Count + filter btn (ou contador de selecionadas em modo blend) */}
          <div className="spv2-list-meta">
            <span className="spv2-list-count">{samplesState.total} lotes</span>
            {selectionMode === 'blend' ? (
              <div className="spv2-selection-counter-wrap">
                <button
                  type="button"
                  className="spv2-selection-counter"
                  aria-label={`${selectedSamples.size} lotes selecionados — abrir revisão`}
                  aria-expanded={selectionDropdownOpen}
                  aria-haspopup="menu"
                  onClick={() => setSelectionDropdownOpen((open) => !open)}
                  disabled={selectedSamples.size === 0}
                >
                  <span className="spv2-selection-counter__num">{selectedSamples.size}</span>
                  <span className="spv2-selection-counter__label">
                    {selectedSamples.size === 1 ? 'selecionado' : 'selecionados'}
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
                {selectionDropdownOpen && selectedSamples.size > 0 ? (
                  <SelectedSamplesDropdown
                    samples={selectedSamplesForSheet.map<SelectedSampleSummary>((s) => ({
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
            {isLoadingMore ? 'Carregando mais lotes' : ''}
          </div>

          {/* Section 3: Card list */}
          {isLoadingInitial ? (
            /* LOT-L4: skeleton em vez de texto "Carregando..." (design-system §3). */
            <div className="spv2-list-scroll">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`skel-initial-${i}`} className="spv2-skeleton-card" aria-hidden />
              ))}
            </div>
          ) : samplesState.status === 'error' && samplesState.items.length === 0 ? (
            /* LOT-B1: falha de carregamento deixa de ser silenciosa — antes o
               erro caia no vazio "Nenhum lote encontrado" (mensagem enganosa). */
            <div className="spv2-list-scroll">
              <p className="spv2-error-banner" role="status">
                {samplesState.error ?? 'Não foi possível carregar os lotes.'}
              </p>
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
                    ? 'Nenhum lote disponível para liga'
                    : 'Nenhum lote encontrado'}
                </p>
                <p className="spv2-empty-sub">
                  {selectionMode === 'blend'
                    ? 'Ajuste os filtros ou saia do modo liga'
                    : 'Tente outro filtro ou termo de busca'}
                </p>
              </div>
            </div>
          ) : isDesktop ? (
            /* FV (desktop): a lista vira TABELA institucional. Dados, ordem,
               scroll infinito e snapshot sao os mesmos dos cards — muda so a
               apresentacao. A linha inteira abre o lote; o numero e <button>
               pra teclado. A expansao do card morreu: o que ela mostrava vive
               na coluna Classificacao e no drawer. No modo liga a 1a coluna
               vira caixa de selecao e a linha marca em vez de abrir — a coluna
               de acoes sai (o ⋯ nao se aplica a uma selecao). */
            <div ref={samplesScrollRef} className="spv2-list-scroll fv-table-scroll" tabIndex={-1}>
              <table className={`fv-table fv-table-lotes${isBlendMode ? ' is-selecting' : ''}`}>
                <colgroup>
                  {isBlendMode ? <col className="fv-col-select" /> : null}
                  <col className="fv-col-lot" />
                  <col className="fv-col-status" />
                  <col className="fv-col-owner" />
                  <col className="fv-col-sacks" />
                  <col className="fv-col-harvest" />
                  <col className="fv-col-class" />
                  {isBlendMode ? null : <col className="fv-col-actions" />}
                </colgroup>
                <thead>
                  <tr>
                    {isBlendMode ? (
                      <th scope="col" className="fv-table-th-select" aria-label="Seleção" />
                    ) : null}
                    <th scope="col">Lote</th>
                    <th scope="col">Status</th>
                    <th scope="col">Proprietário</th>
                    <th scope="col">Sacas</th>
                    <th scope="col">Safra</th>
                    <th scope="col">Classificação</th>
                    {isBlendMode ? null : (
                      <th scope="col" className="fv-table-th-actions" aria-label="Ações" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {samplesState.items.map((sample) => {
                    const row = describeSampleRow(sample);
                    // Elegibilidade so vem do backend em modo liga (o
                    // eligibleForBlend da query); fora dele o campo nem existe.
                    const eligibility = sample.eligibility;
                    const isIneligible =
                      isBlendMode &&
                      eligibility !== undefined &&
                      eligibility !== null &&
                      !eligibility.eligible;
                    const isSelected = selectedSamples.has(sample.id);
                    return (
                      <tr
                        key={sample.id}
                        className={`fv-table-row${row.isInvalidated ? ' is-inactive' : ''}${
                          isIneligible ? ' is-ineligible' : ''
                        }${isBlendMode && isSelected ? ' is-selected' : ''}`}
                        aria-selected={isBlendMode && !isIneligible ? isSelected : undefined}
                        onClick={() => {
                          if (isBlendMode) {
                            if (isIneligible) {
                              showIneligibleReason(eligibility?.reason ?? null);
                              return;
                            }
                            toggleSampleSelection(sample);
                            return;
                          }
                          saveSnapshotBeforeLeave();
                          openLote(sample.id);
                        }}
                      >
                        {isBlendMode ? (
                          <td className="fv-table-td-select">
                            {/* O clique da LINHA e quem alterna — a caixa e o
                                alvo visual e de teclado, sem handler proprio
                                (evita alternar duas vezes). */}
                            <input
                              type="checkbox"
                              className="fv-table-select"
                              checked={isSelected && !isIneligible}
                              disabled={isIneligible}
                              readOnly
                              tabIndex={-1}
                              aria-label={`Selecionar lote ${row.lot} pra liga`}
                            />
                          </td>
                        ) : null}
                        <td>
                          <span className="fv-table-lot">
                            {isBlendMode ? (
                              /* Em modo liga a linha marca — o numero deixa de
                                 ser atalho pro drawer. */
                              <span className="fv-table-name">{row.lot}</span>
                            ) : (
                              <button
                                type="button"
                                className="fv-table-name-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  saveSnapshotBeforeLeave();
                                  openLote(sample.id);
                                }}
                              >
                                <span className="fv-table-name">{row.lot}</span>
                              </button>
                            )}
                            {sample.isBlend ? <BlendBadge size="sm" /> : null}
                          </span>
                        </td>
                        <td>
                          <span className={`fv-chip ${row.status.chip}`}>{row.status.label}</span>
                        </td>
                        <td>
                          <span className="fv-table-cell-main">{row.owner}</span>
                        </td>
                        <td>
                          {/* Disponiveis em destaque; o total so aparece quando
                              houve baixa (venda/perda), pra dar o contexto. */}
                          <span className="fv-table-cell-stack">
                            <span className="fv-table-cell-main">{row.sacks}</span>
                            {row.sacksSub ? (
                              <span className="fv-table-sub">{row.sacksSub}</span>
                            ) : null}
                          </span>
                        </td>
                        <td>
                          {row.hasHarvest ? (
                            <span className="fv-table-cell-main">
                              <HarvestDisplay
                                harvest={sample.declared.harvest}
                                showMixSafras={false}
                              />
                            </span>
                          ) : (
                            <span className="fv-table-cell-main">—</span>
                          )}
                        </td>
                        <td>
                          {row.classification ? (
                            <span className="fv-table-cell-stack">
                              <span className="fv-table-cell-main">{row.classification.main}</span>
                              {row.classification.sub ? (
                                <span className="fv-table-sub">{row.classification.sub}</span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="fv-chip fv-chip-amber">Pendente</span>
                          )}
                        </td>
                        {isBlendMode ? null : (
                          <td
                            className="fv-table-td-actions"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div
                              className="fv-row-menu-wrap"
                              ref={rowMenuFor === sample.id ? rowMenuRef : undefined}
                            >
                              <button
                                type="button"
                                className="fv-table-dots"
                                aria-label={`Ações do lote ${row.lot}`}
                                aria-haspopup="menu"
                                aria-expanded={rowMenuFor === sample.id}
                                onClick={(event) => {
                                  rowMenuTriggerRef.current = event.currentTarget;
                                  setRowMenuFor((current) =>
                                    current === sample.id ? null : sample.id
                                  );
                                }}
                              >
                                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                  <circle cx="5" cy="12" r="1.6" />
                                  <circle cx="12" cy="12" r="1.6" />
                                  <circle cx="19" cy="12" r="1.6" />
                                </svg>
                              </button>
                              {rowMenuFor === sample.id ? (
                                <div
                                  className="fv-row-menu"
                                  role="menu"
                                  aria-label={`Ações do lote ${row.lot}`}
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="fv-row-menu-item"
                                    onClick={() => {
                                      closeRowMenu();
                                      saveSnapshotBeforeLeave();
                                      openLote(sample.id);
                                    }}
                                  >
                                    Ver detalhes
                                  </button>
                                  {/* Perda e envio operam SEM sair da lista (mesmo
                                    fluxo que saia do card expandido); imprimir e
                                    deletar abrem o lote ja com o modal (?acao=). */}
                                  {row.canSend ? (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="fv-row-menu-item"
                                      onClick={() => {
                                        closeRowMenu();
                                        handleCardSend(sample);
                                      }}
                                    >
                                      Enviar amostra
                                    </button>
                                  ) : null}
                                  {row.canLoss ? (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="fv-row-menu-item"
                                      onClick={() => {
                                        closeRowMenu();
                                        handleCardLoss(sample);
                                      }}
                                    >
                                      Registrar perda
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="fv-row-menu-item"
                                    onClick={() => {
                                      closeRowMenu();
                                      saveSnapshotBeforeLeave();
                                      openLote(sample.id, 'imprimir');
                                    }}
                                  >
                                    Imprimir etiqueta
                                  </button>
                                  {row.canDelete ? (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="fv-row-menu-item is-danger"
                                      onClick={() => {
                                        closeRowMenu();
                                        saveSnapshotBeforeLeave();
                                        openLote(sample.id, 'deletar');
                                      }}
                                    >
                                      Deletar lote
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {isLoadingMore
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <tr key={`skel-${i}`} className="fv-table-skel-row" aria-hidden="true">
                          {Array.from({ length: 7 }).map((__, cell) => (
                            <td key={`skel-cell-${cell}`}>
                              <span className="fv-table-skel" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>

              {/* LOT-B1: erro do load-more aparece onde o usuário está (fim
                  da lista), em vez de sumir no estado. */}
              {samplesState.status === 'error' && samplesState.items.length > 0 ? (
                <p className="spv2-error-banner" role="status">
                  {samplesState.error ?? 'Não foi possível carregar mais lotes.'}
                </p>
              ) : null}

              {samplesState.nextCursor ? (
                <div ref={loadMoreRef} className="spv2-load-sentinel" aria-hidden />
              ) : null}

              {hasReachedEnd ? <p className="spv2-list-end">Você chegou ao fim</p> : null}
            </div>
          ) : (
            <div ref={samplesScrollRef} className="spv2-list-scroll">
              {samplesState.items.map((sample) => (
                <SampleCard
                  key={sample.id}
                  sample={sample}
                  onClickCapture={saveSnapshotBeforeLeave}
                  onOpenDetails={openLote}
                  selectionMode={selectionMode === 'blend' ? 'blend' : 'idle'}
                  isSelected={selectedSamples.has(sample.id)}
                  onToggleSelect={toggleSampleSelection}
                  onShowIneligibleReason={showIneligibleReason}
                  isExpanded={expandedSampleIds.has(sample.id)}
                  onToggleExpand={toggleCardExpand}
                  onSend={handleCardSend}
                  onLoss={handleCardLoss}
                />
              ))}

              {isLoadingMore
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={`skel-${i}`} className="spv2-skeleton-card" aria-hidden />
                  ))
                : null}

              {/* LOT-B1: erro do load-more aparece onde o usuário está (fim
                  da lista), em vez de sumir no estado. */}
              {samplesState.status === 'error' && samplesState.items.length > 0 ? (
                <p className="spv2-error-banner" role="status">
                  {samplesState.error ?? 'Não foi possível carregar mais lotes.'}
                </p>
              ) : null}

              {samplesState.nextCursor ? (
                <div ref={loadMoreRef} className="spv2-load-sentinel" aria-hidden />
              ) : null}

              {hasReachedEnd ? <p className="spv2-list-end">Você chegou ao fim</p> : null}
            </div>
          )}
        </section>

        {/* Aba Simulador (Playground, PG7/PG35): a lista de Lotes permanece
            MONTADA (escondida via .is-tab-simulador) pra preservar reducer/
            cursor/selecao. Desktop recebe o canvas; mobile mostra o aviso. */}
        {tab === 'simulador' ? (
          isDesktop ? (
            <div className="pg-host">
              <PlaygroundTab />
            </div>
          ) : (
            <PlaygroundMobileNotice onVerLotes={() => selectTab('lotes')} />
          )
        ) : null}
      </section>

      {/* FV: os filtros deixaram de ser modal central e viraram PAINEL lateral
          (desktop = painel direito bloqueante; mobile = bottom sheet, mesma
          excecao deliberada de /cadastros). Mesmo rascunho + Aplicar/Limpar; o
          Aplicar do rodape submete o form via `form=`. O modal central
          `.samples-filter-modal` morreu — o CSS dele ainda serve /contratos. */}
      <BottomSheet
        open={filtersOpen}
        onClose={closeFilters}
        title="Filtros"
        ariaLabel="Filtros de lotes"
        className="side-sheet fv-filter-sheet samples-filter-sheet"
        footer={
          <div className="fv-filter-actions">
            <button
              type="button"
              className="fv-btn fv-btn-secondary"
              onClick={handleClearFiltersOnly}
              disabled={!hasDraftHiddenFilters && !hasAppliedHiddenFilters}
            >
              Limpar
            </button>
            <button type="submit" form="samples-filter-form" className="fv-btn fv-btn-primary">
              Aplicar
            </button>
          </div>
        }
      >
        <form
          id="samples-filter-form"
          className="samples-filter-sheet-form"
          onSubmit={handleApplyFilters}
        >
          {renderFilterFields()}
        </form>
      </BottomSheet>

      {newSampleModalMounted ? (
        <NewSampleModal
          open={newSampleModalOpen}
          session={session}
          onClose={() => setNewSampleModalOpen(false)}
          onSuccessNavigate={(sampleId) => {
            // F3 (decisao 13): o check fecha o painel e o DRAWER do lote
            // recem-criado abre sozinho. A lista tambem refaz o fetch — o
            // lote aparece no topo quando o drawer fechar. (Supera a decisao
            // 5.29 = b, que so fechava e recarregava.)
            setNewSampleModalOpen(false);
            setNewSampleRefetchKey((current) => current + 1);
            openLote(sampleId);
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
        samples={selectedSamplesForSheet}
        session={session}
        submitting={creatingBlend}
        success={createdBlend !== null}
        onClose={closeConfirmation}
        onRemove={handleRemoveFromSelection}
        onProceed={handleProceedToCreate}
      />

      {/* Acoes do card expandido (lista): envio (fluxo extraido) + perda (modal
          reusado), hidratados no clique. Refetch via newSampleRefetchKey. */}
      {sendTarget ? (
        <SampleSendFlow
          session={session}
          sampleId={sendTarget.sample.id}
          chooserOpen
          status={sendTarget.sample.status}
          internalLotNumber={sendTarget.sample.internalLotNumber}
          canDescricao={
            sendTarget.sample.status === 'CLASSIFIED' &&
            sendTarget.attachments.some((a) => a.kind === 'CLASSIFICATION_PHOTO')
          }
          onChanged={() => setNewSampleRefetchKey((current) => current + 1)}
          onClose={() => setSendTarget(null)}
        />
      ) : null}

      {lossTarget ? (
        <SampleMovementModal
          session={session}
          open
          mode="create"
          saving={lossSaving}
          title="Registrar perda"
          initialMovementType="LOSS"
          availableSacks={lossTarget.sample.availableSacks ?? 0}
          blend={
            lossTarget.sample.isBlend
              ? {
                  sampleId: lossTarget.sample.id,
                  ownerClientId: lossTarget.sample.ownerClientId ?? null,
                  blendOwnerPinned: lossTarget.sample.blendOwnerPinned ?? false,
                }
              : null
          }
          activeBlends={lossTarget.sample.isBlend ? [] : lossTarget.activeBlends}
          onAssignOwner={async (ownerClientId) => {
            await updateRegistration(session, lossTarget.sample.id, {
              expectedVersion: lossTarget.sample.version,
              after: { ownerClientId },
              reasonCode: 'DATA_FIX',
              reasonText: 'Atribuicao de dono a liga antes da movimentacao comercial',
            });
            const detail = await getSampleDetail(session, lossTarget.sample.id);
            setLossTarget({ sample: detail.sample, activeBlends: detail.activeBlends ?? [] });
          }}
          onClose={() => {
            if (!lossSaving) setLossTarget(null);
          }}
          onSubmit={async (data) => {
            setLossSaving(true);
            try {
              await createSampleMovement(session, lossTarget.sample.id, {
                expectedVersion: lossTarget.sample.version,
                movementType: data.movementType,
                buyerClientId: data.buyerClientId,
                buyerUnitId: data.buyerUnitId,
                quantitySacks: data.quantitySacks,
                movementDate: data.movementDate,
                notes: data.notes,
                lossReasonText: data.lossReasonText,
              });
              setLossTarget(null);
              setNewSampleRefetchKey((current) => current + 1);
              toast.success({ title: 'Perda registrada' });
            } catch (cause) {
              toast.error({
                title: 'Não foi possível registrar a perda',
                description: cause instanceof ApiError ? cause.message : undefined,
              });
            } finally {
              setLossSaving(false);
            }
          }}
        />
      ) : null}

      {/* Overlay de detalhe do lote (F2): sheet de tela cheia no mobile,
          painel lateral peek no desktop com a lista viva atras. key={loteId}
          reseta o estado ao trocar de lote com o overlay aberto (peek /
          links detalhe→detalhe). */}
      <DetailOverlay
        open={Boolean(loteId)}
        onClose={closeLote}
        title="Lote"
        ariaLabel="Detalhe do lote"
        className="lote-details-overlay"
        dismissGuardRef={loteDismissGuardRef}
      >
        {loteId ? (
          <SampleDetailView
            key={loteId}
            session={session}
            sampleId={loteId}
            onClose={closeLote}
            onOpenSample={openLote}
            dismissGuardRef={loteDismissGuardRef}
            initialAction={loteAcao}
            onInitialActionConsumed={clearLoteAcao}
            onRequestSend={openSendBySampleId}
            onRequestLoss={openLossBySampleId}
          />
        ) : null}
      </DetailOverlay>
    </AppShell>
  );
}
