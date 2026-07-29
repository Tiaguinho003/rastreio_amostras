'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { ANIMATION_MS, BottomSheet } from '../BottomSheet';
import { ChipMultiSelectField } from '../ChipMultiSelectField';
import { ClientLookupField } from '../clients/ClientLookupField';
import {
  ApiError,
  finalizeSaleContract,
  getSaleContract,
  listSaleContracts,
  reopenSaleContract,
} from '../../lib/api-client';
import { espelhoEligibility } from '../../lib/espelho';
import { useDelayedValue } from '../../lib/use-delayed-value';
import { useContractHighlight } from '../../lib/use-contract-highlight';
import { useIsDesktop } from '../../lib/use-desktop';
import { useToast } from '../../lib/toast/ToastProvider';
import type {
  AgioDesagioType,
  ClientSummary,
  SaleContract,
  SaleContractStatus,
  SessionData,
} from '../../lib/types';
import { ContractCreateRadialFab } from './ContractCreateRadialFab';
import {
  type ContractFilters,
  EMPTY_CONTRACT_FILTERS,
  PERIOD_BASE_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  countActiveContractFilters,
} from './ContractsFilterButton';
import { EspelhoConferenciaModal, type EspelhoSide } from './EspelhoConferenciaModal';
import { ContractPhaseLine } from './ContractPhaseLine';
import { EspelhoCorretagemModal } from './EspelhoCorretagemModal';
import { SaleContractAgioDialog } from './SaleContractAgioDialog';
import {
  formatContractDate,
  SaleContractCard,
  snapshotName,
  AGENDA_CHIP,
  contractAgenda,
  contractAgendaLabel,
  TYPE_LABEL,
} from './SaleContractCard';
import { SaleContractDetailsModal } from './SaleContractDetailsModal';
import { SaleContractEtapa2Modal } from './SaleContractEtapa2Modal';
import { SaleContractLifecycleDialog } from './SaleContractLifecycleDialog';

const SITUACAO_CHIP_OPTIONS = STATUS_LABELS.map((s) => ({ id: s.value, label: s.label }));
const TYPE_CHIP_OPTIONS = TYPE_LABELS.map((t) => ({ id: t.value, label: t.label }));

// RC-F6: a lista pagina no servidor (keyset por contractSeq). O limite bate com
// o default do listSaleContracts; o rootMargin dispara o load-more antes do fim.
const CONTRACT_PAGE_LIMIT = 30;
const LOAD_MORE_ROOT_MARGIN = '320px';
const TABLE_COLUMN_COUNT = 6;

// --- Estado da lista (molde do usersListReducer de /users) ------------------

type ContractsListStatus = 'loading-initial' | 'loading-more' | 'idle' | 'error';

interface ContractsListState {
  items: SaleContract[];
  total: number;
  nextCursor: string | null;
  status: ContractsListStatus;
  error: string | null;
}

type ContractsListAction =
  | { type: 'fetch-initial' }
  | { type: 'fetch-more' }
  | { type: 'success-initial'; items: SaleContract[]; total: number; nextCursor: string | null }
  | { type: 'success-more'; items: SaleContract[]; nextCursor: string | null }
  | { type: 'error'; message: string };

const CONTRACTS_INITIAL: ContractsListState = {
  items: [],
  total: 0,
  nextCursor: null,
  status: 'loading-initial',
  error: null,
};

function contractsListReducer(
  state: ContractsListState,
  action: ContractsListAction
): ContractsListState {
  switch (action.type) {
    case 'fetch-initial':
      return { ...CONTRACTS_INITIAL, status: 'loading-initial' };
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
      // Mantem os itens: erro ao paginar nao pode esvaziar o que ja esta na tela.
      return { ...state, status: 'error', error: action.message };
    default:
      return state;
  }
}

// Filtros aplicados -> querystring do listSaleContracts. Uma funcao so, usada
// pelo fetch inicial, pelo load-more e pelo refresh — assim as tres chamadas nao
// podem divergir no recorte.
function filtersToQuery(filters: ContractFilters, search: string) {
  return {
    search: search || undefined,
    status: filters.statuses.length ? filters.statuses : undefined,
    type: filters.types.length ? filters.types : undefined,
    buyerClientId: filters.buyerClient?.id,
    sellerClientId: filters.sellerClient?.id,
    periodBase: filters.periodBase,
    periodFrom: filters.periodFrom || undefined,
    periodTo: filters.periodTo || undefined,
    limit: CONTRACT_PAGE_LIMIT,
  };
}

export function ContratosPanel({ session }: { session: SessionData }) {
  // Painel da aba "Contratos" do hub (Central de Contratos). A casca — guard,
  // AppShell e o cabeçalho institucional — vive em app/contratos/page.tsx; aqui
  // fica só o conteúdo. Escopo aberto (own-only revogado): ADMIN e COMMERCIAL
  // veem e gerenciam TODOS os contratos; quem chega aqui pode gerenciar.
  const canManage = true;
  const toast = useToast();
  const isDesktop = useIsDesktop();

  const [listState, dispatchList] = useReducer(contractsListReducer, CONTRACTS_INITIAL);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [rowMenuFor, setRowMenuFor] = useState<string | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const rowMenuTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Filtros avancados — rascunho/aplicado (sem query params), molde de /samples e
  // /cadastros. `applied` vira querystring do servidor; `draft` e o que o painel
  // lateral edita; "Aplicar" copia draft->applied e refaz a 1a pagina.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ContractFilters>(EMPTY_CONTRACT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ContractFilters>(EMPTY_CONTRACT_FILTERS);

  const activeFiltersCount = useMemo(
    () => countActiveContractFilters(appliedFilters),
    [appliedFilters]
  );
  const hasAnyFilter = activeFiltersCount > 0 || countActiveContractFilters(draftFilters) > 0;

  const openFilters = () => {
    setDraftFilters(appliedFilters);
    setFiltersOpen(true);
  };
  const closeFilters = () => {
    setDraftFilters(appliedFilters);
    setFiltersOpen(false);
  };
  const handleApplyFilters = (event: FormEvent) => {
    event.preventDefault();
    setAppliedFilters(draftFilters);
    setFiltersOpen(false);
  };
  const handleClearFilters = () => {
    setDraftFilters(EMPTY_CONTRACT_FILTERS);
    setAppliedFilters(EMPTY_CONTRACT_FILTERS);
  };
  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [etapa2, setEtapa2] = useState<{ contractId: string } | null>(null);
  // RC-D63: o diálogo sobrou só para o washout — Finalizar/Reabrir são toque
  // direto (`runTerminal`), sem confirmação, porque voltam atrás.
  const [lifecycle, setLifecycle] = useState<{
    contractId: string;
    expectedVersion: number;
    contractNumber: string;
    hasLot: boolean;
  } | null>(null);
  // Trava o duplo-toque no Finalizar/Reabrir enquanto o POST não volta.
  const [terminalBusy, setTerminalBusy] = useState<string | null>(null);
  // Aplicar ágio/deságio (D87): alvo = contrato + sinal escolhido no Detalhes.
  const [agioTarget, setAgioTarget] = useState<{
    contract: SaleContract;
    agioType: AgioDesagioType;
  } | null>(null);
  // Criação de contrato FUTURO (sem lote): 1 modal só (futureCreate).
  const [futureOpen, setFutureOpen] = useState(false);

  // Criação à vista pela página: UM painel que começa na seleção de lote e
  // segue para o formulário e o documento (RC-D57). O lote escolhido é estado
  // DELE, não daqui — a página só abre e fecha o fluxo.
  const [spotCreateOpen, setSpotCreateOpen] = useState(false);

  // Espelho de Corretagem (Fase E): alvo abre a fase de CONFERÊNCIA (D134);
  // "Gerar espelho" avança pra prévia. RC-F6: o gatilho é SÓ o Detalhes — o modo
  // de seleção pela página (D76) foi revogado.
  const [espelhoTarget, setEspelhoTarget] = useState<SaleContract | null>(null);
  const [espelhoPreview, setEspelhoPreview] = useState<{
    contract: SaleContract;
    side: EspelhoSide;
  } | null>(null);
  // Vai-e-volta com o Detalhes (D134): "Ver detalhes" na conferência guarda o
  // alvo aqui; ao FECHAR o Detalhes a conferência reabre (dados re-buscados).
  // Os swaps do Detalhes (Editar/Ágio/Washout) LIMPAM o retorno (fluxo encerra).
  const espelhoReturnRef = useRef<SaleContract | null>(null);

  // Os painéis de criação são bottom sheets: mantê-los montados durante o
  // slide-down de saída (ANIMATION_MS) antes de desmontar. `open` = intenção ao vivo.
  const spotCreateRendered = useDelayedValue(spotCreateOpen || null, ANIMATION_MS);
  const futureRendered = useDelayedValue(futureOpen || null, ANIMATION_MS);
  const etapa2Rendered = useDelayedValue(etapa2, ANIMATION_MS);

  // Detalhes (Fase J, D120-D126; F3 do redesign): DetailOverlay dirigido pela
  // URL — `?details=<id>` aberto, ausente fechado (molde do ?cliente= de
  // /cadastros). Serve também de deep-link ("Ver contrato" do card de Eventos,
  // E27/D138). O snapshot vem da lista; o overlay re-busca fresco por id.
  const router = useRouter();
  const searchParams = useSearchParams();
  const detailsParam = searchParams.get('details');

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadMoreStateRef = useRef<{
    inFlight: boolean;
    token: number;
    abort: AbortController | null;
  }>({ inFlight: false, token: 0, abort: null });

  // Debounce da busca: aplica com >=2 chars; <2 desfiltra. Espelha /users.
  useEffect(() => {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
    }
    const trimmed = searchInput.trim();
    const next = trimmed.length >= 2 ? trimmed : '';
    if (next === appliedSearch) return;
    searchDebounceRef.current = window.setTimeout(() => {
      searchDebounceRef.current = null;
      setAppliedSearch(next);
    }, 400);
    return () => {
      if (searchDebounceRef.current !== null) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [searchInput, appliedSearch]);

  // Fetch inicial: dispara ao mudar busca, filtros ou sessão. Reseta o cursor.
  useEffect(() => {
    if (!session) return;

    const abortController = new AbortController();
    let active = true;
    dispatchList({ type: 'fetch-initial' });
    loadMoreStateRef.current.token += 1;
    loadMoreStateRef.current.inFlight = false;
    loadMoreStateRef.current.abort?.abort();
    loadMoreStateRef.current.abort = null;

    listSaleContracts(session, filtersToQuery(appliedFilters, appliedSearch), {
      signal: abortController.signal,
    })
      .then((response) => {
        if (!active) return;
        dispatchList({
          type: 'success-initial',
          items: response.items,
          total: response.total,
          nextCursor: response.nextCursor,
        });
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        dispatchList({
          type: 'error',
          message:
            cause instanceof ApiError ? cause.message : 'Não foi possível carregar os contratos',
        });
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [session, appliedSearch, appliedFilters]);

  // Load-more pelo cursor. inFlight + token protegem contra race em scrolls
  // rápidos (mesmo padrão de /users e /cadastros).
  const runLoadMore = useCallback(
    (cursor: string) => {
      const state = loadMoreStateRef.current;
      if (state.inFlight) return;
      if (!session) return;
      state.inFlight = true;
      state.token += 1;
      const myToken = state.token;
      state.abort?.abort();
      const controller = new AbortController();
      state.abort = controller;
      dispatchList({ type: 'fetch-more' });

      listSaleContracts(
        session,
        { ...filtersToQuery(appliedFilters, appliedSearch), cursor },
        { signal: controller.signal }
      )
        .then((response) => {
          if (loadMoreStateRef.current.token !== myToken) return;
          dispatchList({
            type: 'success-more',
            items: response.items,
            nextCursor: response.nextCursor,
          });
        })
        .catch((cause) => {
          if (loadMoreStateRef.current.token !== myToken) return;
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          dispatchList({
            type: 'error',
            message:
              cause instanceof ApiError
                ? cause.message
                : 'Não foi possível carregar mais contratos',
          });
        })
        .finally(() => {
          if (loadMoreStateRef.current.token === myToken) {
            loadMoreStateRef.current.inFlight = false;
            loadMoreStateRef.current.abort = null;
          }
        });
    },
    [session, appliedSearch, appliedFilters]
  );

  // IntersectionObserver no sentinel: dispara load-more quando entra na viewport.
  useEffect(() => {
    if (!session) return;
    if (listState.status !== 'idle') return;
    if (!listState.nextCursor) return;
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;
    const cursor = listState.nextCursor;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) runLoadMore(cursor);
      },
      { root: scrollRef.current, rootMargin: LOAD_MORE_ROOT_MARGIN }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [runLoadMore, listState.nextCursor, listState.status, session]);

  // Recarga pós-mutação (finalizar/reabrir/washout/ágio/criar): re-busca a 1ª página
  // SEM passar por 'fetch-initial' — o skeleton é para o primeiro carregamento e
  // para troca de filtro, não para cada marca terminal (antes a lista inteira
  // piscava "Carregando..." depois de toda mutação).
  const refresh = useCallback(async () => {
    if (!session) return;
    loadMoreStateRef.current.token += 1;
    loadMoreStateRef.current.inFlight = false;
    try {
      const response = await listSaleContracts(
        session,
        filtersToQuery(appliedFilters, appliedSearch)
      );
      dispatchList({
        type: 'success-initial',
        items: response.items,
        total: response.total,
        nextCursor: response.nextCursor,
      });
    } catch (cause) {
      dispatchList({
        type: 'error',
        message:
          cause instanceof ApiError ? cause.message : 'Não foi possível carregar os contratos',
      });
    }
  }, [session, appliedSearch, appliedFilters]);

  const contracts = listState.items;

  // Deep-link `?details=<id>` de um contrato FORA da página carregada: busca por
  // id no servidor. Antes era só `contracts.find(...)` sobre o array baixado —
  // com paginação (e mesmo antes, acima do teto) um link válido morria calado,
  // porque o efeito de limpeza tratava como órfão e apagava o param da URL.
  const [detailsFallback, setDetailsFallback] = useState<SaleContract | null>(null);
  const detailsInList = useMemo(
    () => (detailsParam ? (contracts.find((c) => c.id === detailsParam) ?? null) : null),
    [detailsParam, contracts]
  );
  const detailsContract =
    detailsInList ?? (detailsFallback?.id === detailsParam ? detailsFallback : null);

  useEffect(() => {
    if (!session) return;
    if (!detailsParam || detailsInList) return;
    if (detailsFallback?.id === detailsParam) return;
    let active = true;
    getSaleContract(session, detailsParam)
      .then((response) => {
        if (active) setDetailsFallback(response.contract);
      })
      .catch(() => {
        // Id inexistente: o efeito de limpeza abaixo tira o param da URL.
        if (active) setDetailsFallback(null);
      });
    return () => {
      active = false;
    };
  }, [session, detailsParam, detailsInList, detailsFallback]);

  const detailsRendered = useDelayedValue(detailsContract, ANIMATION_MS);
  const openedDetailsByPushRef = useRef(false);
  // Swap pendente (Editar/Ágio/Washout/Espelho): roda DEPOIS que o ?details=
  // sai da URL — abrir o próximo sheet no mesmo tick do router.back() faria o
  // popstate atrasado engolir a entry de history do sheet novo (fecharia na hora).
  const afterDetailsCloseRef = useRef<(() => void) | null>(null);

  const openDetailsById = useCallback(
    (contractId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const alreadyOpen = params.has('details');
      params.set('details', contractId);
      const url = `/contratos?${params.toString()}`;
      if (alreadyOpen) {
        // Troca de contrato com o overlay aberto (peek desktop): replace mantém
        // UMA entry — back continua fechando em 1 passo.
        router.replace(url, { scroll: false });
      } else {
        router.push(url, { scroll: false });
        openedDetailsByPushRef.current = true;
      }
    },
    [router, searchParams]
  );

  const openDetails = useCallback(
    (contract: SaleContract) => openDetailsById(contract.id),
    [openDetailsById]
  );

  const closeDetails = useCallback(() => {
    if (openedDetailsByPushRef.current) {
      openedDetailsByPushRef.current = false;
      router.back();
      return;
    }
    // Deep-link/refresh (sem push nosso): fecha limpando o param via replace.
    const params = new URLSearchParams(searchParams.toString());
    params.delete('details');
    const qs = params.toString();
    router.replace(qs ? `/contratos?${qs}` : '/contratos', { scroll: false });
  }, [router, searchParams]);

  // Pós-fechamento (cobre X/ESC E o back do navegador): executa o swap pendente
  // ou o vai-e-volta do espelho (D134 — Detalhes aberto pela conferência reabre-a).
  const detailsWasOpenRef = useRef(false);
  useEffect(() => {
    const isOpen = detailsContract != null;
    if (detailsWasOpenRef.current && !isOpen) {
      const pending = afterDetailsCloseRef.current;
      afterDetailsCloseRef.current = null;
      if (pending) {
        pending();
      } else if (espelhoReturnRef.current) {
        const back = espelhoReturnRef.current;
        espelhoReturnRef.current = null;
        setEspelhoTarget(back);
      }
    }
    detailsWasOpenRef.current = isOpen;
  }, [detailsContract]);

  // ?details= órfão (id que não existe MESMO — nem na lista, nem no servidor):
  // limpa a URL, senão o param zumbi fica sujando shares/back.
  useEffect(() => {
    if (!detailsParam) return;
    if (listState.status === 'loading-initial') return;
    if (detailsContract) return;
    // Espera a busca por id responder antes de julgar órfão.
    if (detailsFallback === null && detailsInList === null) {
      const timer = window.setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('details');
        const qs = params.toString();
        router.replace(qs ? `/contratos?${qs}` : '/contratos', { scroll: false });
      }, 1200);
      return () => window.clearTimeout(timer);
    }
  }, [
    detailsParam,
    detailsContract,
    detailsFallback,
    detailsInList,
    listState.status,
    router,
    searchParams,
  ]);

  // Menu ⋯ da linha: fecha no clique fora e no ESC (devolvendo o foco).
  useEffect(() => {
    if (!rowMenuFor) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rowMenuRef.current?.contains(target)) setRowMenuFor(null);
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setRowMenuFor(null);
      rowMenuTriggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [rowMenuFor]);

  // DSB-D11: pisca/rola até o contrato tocado no chip de faturamento do dashboard
  // (?highlight=<id>). Best-effort — se não estiver na página carregada, só ancora.
  const highlightId = useContractHighlight(contracts, scrollRef);

  const openWashoutFor = (contract: SaleContract) =>
    setLifecycle({
      contractId: contract.id,
      expectedVersion: contract.version,
      contractNumber: contract.contractNumber,
      hasLot: contract.type === 'MERCADO_A_VISTA',
    });

  // RC-D62/D63: Finalizar e Reabrir. Sem diálogo e sem data — um toque, e o
  // toast é o feedback (o contrário do washout, que é definitivo e pede motivo).
  const runTerminal = async (contract: SaleContract, direction: 'finalize' | 'reopen') => {
    if (!session || terminalBusy) return;
    setTerminalBusy(contract.id);
    try {
      const call = direction === 'finalize' ? finalizeSaleContract : reopenSaleContract;
      await call(session, contract.id, { expectedVersion: contract.version });
      await refresh();
      toast.success({
        title: direction === 'finalize' ? 'Contrato finalizado' : 'Contrato reaberto',
      });
    } catch (cause) {
      toast.error({
        title:
          cause instanceof ApiError && cause.status === 409
            ? 'Este contrato foi modificado. Recarregue a página e tente de novo.'
            : cause instanceof ApiError
              ? cause.message
              : 'Falha ao atualizar o contrato.',
      });
    } finally {
      setTerminalBusy(null);
    }
  };

  // --- Chrome (toolbar) ------------------------------------------------------

  // A MESMA toolbar nos dois breakpoints — uma fonte de estado. No desktop fica
  // presa no topo do cartão; no mobile rola DENTRO do `.spv2-list-scroll`, porque
  // ali cada faixa presa acima da lista custa altura PERMANENTE (data-tables §1).
  // Substitui a `.hero-search-wrap` legada + o `.spv2-list-meta`.
  const toolbar = (
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
          placeholder="Buscar nº, vendedor ou comprador..."
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
        onClick={() => (filtersOpen ? closeFilters() : openFilters())}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M4 6h16" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
        {/* No mobile o rótulo some (a linha da busca não cabe os dois) e o
            botão fica do tamanho do ícone — regra do kit. */}
        <span className="fv-toolbar-filter-label">Filtros</span>
        {activeFiltersCount > 0 ? <span className="fv-btn-badge">{activeFiltersCount}</span> : null}
      </button>
      {activeFiltersCount > 0 ? (
        <button type="button" className="fv-toolbar-clear" onClick={handleClearFilters}>
          Limpar
        </button>
      ) : null}
      <span className="fv-toolbar-count">{listState.total} contrato(s)</span>
    </div>
  );

  const mobileListChrome = isDesktop ? null : toolbar;

  const emptyState = (
    <div className="spv2-empty">
      <svg className="cv2-empty-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6M9 17h4" />
      </svg>
      <p className="spv2-empty-text">Nenhum contrato para mostrar</p>
      <p className="spv2-empty-sub">
        {activeFiltersCount > 0 || appliedSearch
          ? 'Tente outro termo ou revise os filtros'
          : 'Crie um contrato à vista ou futuro para começar'}
      </p>
    </div>
  );

  const tableSkeletonRows = (count: number, keyPrefix: string) =>
    Array.from({ length: count }).map((_, i) => (
      <tr key={`${keyPrefix}-${i}`} className="fv-table-skel-row" aria-hidden="true">
        {Array.from({ length: TABLE_COLUMN_COUNT }).map((__, j) => (
          <td key={j}>
            <span className="fv-table-skel" />
          </td>
        ))}
      </tr>
    ));

  return (
    <>
      {/* RC-F6 (desktop >=901px): cabeçalho institucional. No mobile fica
          display:none — o título mora na faixa do shell e criar é o FAB.
          Criar contrato tem DUAS portas, então são dois botões: "À vista" em
          destaque e "Futuro" ao lado, sem clique extra escondendo um menu. */}
      <div className="fv-page-head">
        <h2 className="fv-page-title">Contratos</h2>
        <div className="fv-page-head-actions">
          <button type="button" className="fv-btn" onClick={() => setFutureOpen(true)}>
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Futuro
          </button>
          <button
            type="button"
            className="fv-btn fv-btn-primary"
            onClick={() => setSpotCreateOpen(true)}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            À vista
          </button>
        </div>
      </div>

      {/* O FAB é a porta de criação do MOBILE (no desktop some por
          `.fv-ctr-page .cv2-fab`). Perdeu o pai `.hero-search-wrap` e virou
          filho direto; é `fixed`, então a posição não muda. */}
      <ContractCreateRadialFab
        onCreateSpot={() => setSpotCreateOpen(true)}
        onCreateFuture={() => setFutureOpen(true)}
      />

      <section className="clients-v2-sheet">
        {isDesktop ? toolbar : null}

        {listState.status === 'error' && listState.error ? (
          <p className="spv2-error-banner" role="status">
            {listState.error}
          </p>
        ) : null}

        {listState.status === 'loading-initial' ? (
          isDesktop ? (
            <div className="spv2-list-scroll fv-table-scroll">
              <table className="fv-table">
                <tbody>{tableSkeletonRows(6, 'boot')}</tbody>
              </table>
            </div>
          ) : (
            <div className="spv2-list-scroll">
              {mobileListChrome}
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={`boot-${i}`} className="spv2-skeleton-card" aria-hidden />
              ))}
            </div>
          )
        ) : contracts.length === 0 ? (
          // `fv-table-scroll` no desktop tambem no vazio: sem ele o
          // `.spv2-list-scroll` e um grid de 3 colunas (herdado dos cards) e o
          // `.spv2-empty` cairia na primeira celula, encostado a esquerda.
          <div className={`spv2-list-scroll${isDesktop ? ' fv-table-scroll' : ''}`}>
            {mobileListChrome}
            {emptyState}
          </div>
        ) : isDesktop ? (
          /* RC-F6 (desktop): tabela institucional de 5 colunas + ⋯. Os mesmos
             dados, ordem e scroll infinito dos cards — muda a apresentação. A
             linha inteira clica; o nº é <button> pra dar alvo de teclado. */
          <div ref={scrollRef} className="spv2-list-scroll fv-table-scroll" tabIndex={-1}>
            <table className="fv-table">
              <colgroup>
                <col className="fv-col-contract" />
                <col className="fv-col-parties" />
                <col className="fv-col-sacks" />
                <col className="fv-col-dates" />
                {/* RC-D80: coluna propria (nao a `.fv-col-status` compartilhada com
                    /users e /cadastros) — so a de Contratos carrega a linha de
                    fases por cima do chip, e precisa de mais largura por isso. */}
                <col className="fv-col-situacao" />
                <col className="fv-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Contrato</th>
                  <th scope="col">Partes</th>
                  <th scope="col">Sacas</th>
                  <th scope="col">Datas</th>
                  <th scope="col">Situação</th>
                  <th scope="col" className="fv-table-th-actions" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr
                    key={contract.id}
                    className={`fv-table-row${highlightId === contract.id ? ' is-highlighted' : ''}`}
                    data-contract-id={contract.id}
                    onClick={() => openDetails(contract)}
                  >
                    <td>
                      <button
                        type="button"
                        className="fv-table-name-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDetails(contract);
                        }}
                      >
                        <span className="fv-table-name">{contract.contractNumber}</span>
                        <span className="fv-table-code">
                          {TYPE_LABEL[contract.type] ?? contract.type}
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className="fv-table-cell-stack">
                        <span className="fv-table-cell-main">
                          {snapshotName(contract.sellerSnapshot)}
                        </span>
                        <span className="fv-cell-ic">
                          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                          <span className="fv-table-sub">
                            {snapshotName(contract.buyerSnapshot)}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="fv-table-cell-main">{contract.quantitySacks} sc</span>
                    </td>
                    <td>
                      {/* "À definir" (D144): data nula é um estado legítimo do
                          contrato, não um vazio — mesma leitura do card. */}
                      <span className="fv-table-cell-stack">
                        <span className="fv-table-sub">
                          Fat.{' '}
                          {contract.invoiceDate
                            ? formatContractDate(contract.invoiceDate)
                            : 'À definir'}
                        </span>
                        <span className="fv-table-sub">
                          Pag.{' '}
                          {contract.paymentDate
                            ? formatContractDate(contract.paymentDate)
                            : 'À definir'}
                        </span>
                      </span>
                    </td>
                    <td>
                      {/* RC-D83: as duas peças convivem porque respondem coisas
                          diferentes. A LINHA diz onde o contrato está (5 fases);
                          o CHIP diz qual é o próximo compromisso — com a data e o
                          vermelho do atraso, que a linha não tem (RC-D68). */}
                      <span className="fv-table-cell-stack ctr-situacao-cell">
                        <ContractPhaseLine phases={contract.phases} />
                        <span className={AGENDA_CHIP[contractAgenda(contract).kind]}>
                          {contractAgendaLabel(contractAgenda(contract))}
                        </span>
                      </span>
                    </td>
                    <td
                      className="fv-table-td-actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div
                        className="fv-row-menu-wrap"
                        ref={rowMenuFor === contract.id ? rowMenuRef : undefined}
                      >
                        <button
                          type="button"
                          className="fv-table-dots"
                          aria-label={`Ações do contrato ${contract.contractNumber}`}
                          aria-haspopup="menu"
                          aria-expanded={rowMenuFor === contract.id}
                          onClick={(event) => {
                            rowMenuTriggerRef.current = event.currentTarget;
                            setRowMenuFor((current) =>
                              current === contract.id ? null : contract.id
                            );
                          }}
                        >
                          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                            <circle cx="5" cy="12" r="1.6" />
                            <circle cx="12" cy="12" r="1.6" />
                            <circle cx="19" cy="12" r="1.6" />
                          </svg>
                        </button>
                        {rowMenuFor === contract.id ? (
                          <div
                            className="fv-row-menu"
                            role="menu"
                            aria-label={`Ações do contrato ${contract.contractNumber}`}
                          >
                            {/* RC-D62/D63: o marco terminal — o mesmo que o card
                                mostra no mobile. Editar, Ágio e Washout ficam no
                                PAINEL de Detalhes: precisam do contexto do
                                contrato na tela. */}
                            {contract.status === 'EMITIDO' && canManage ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="fv-row-menu-item"
                                disabled={terminalBusy === contract.id}
                                onClick={() => {
                                  setRowMenuFor(null);
                                  void runTerminal(contract, 'finalize');
                                }}
                              >
                                Finalizar
                              </button>
                            ) : null}
                            {contract.status === 'FINALIZADO' && canManage ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="fv-row-menu-item"
                                disabled={terminalBusy === contract.id}
                                onClick={() => {
                                  setRowMenuFor(null);
                                  void runTerminal(contract, 'reopen');
                                }}
                              >
                                Reabrir
                              </button>
                            ) : null}
                            <button
                              type="button"
                              role="menuitem"
                              className="fv-row-menu-item"
                              onClick={() => {
                                setRowMenuFor(null);
                                openDetails(contract);
                              }}
                            >
                              Ver detalhes
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {listState.status === 'loading-more' ? tableSkeletonRows(3, 'more') : null}
              </tbody>
            </table>
            {listState.nextCursor ? (
              <div ref={loadMoreRef} className="cv2-load-more-sentinel" aria-hidden />
            ) : null}
            {!listState.nextCursor && listState.status === 'idle' ? (
              <p className="spv2-list-end">Você chegou ao fim</p>
            ) : null}
          </div>
        ) : (
          <div className="spv2-list-scroll" ref={scrollRef}>
            {mobileListChrome}
            <div className="ctr-list">
              {contracts.map((contract) => (
                <SaleContractCard
                  key={contract.id}
                  contract={contract}
                  isExpanded={expandedIds.has(contract.id)}
                  onToggle={() => toggleExpand(contract.id)}
                  onDetalhes={() => openDetails(contract)}
                  canManage={canManage}
                  isHighlighted={highlightId === contract.id}
                  onFinalizar={() => void runTerminal(contract, 'finalize')}
                  onReabrir={() => void runTerminal(contract, 'reopen')}
                />
              ))}
              {listState.status === 'loading-more'
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={`more-${i}`} className="spv2-skeleton-card" aria-hidden />
                  ))
                : null}
            </div>
            {listState.nextCursor ? (
              <div ref={loadMoreRef} className="cv2-load-more-sentinel" aria-hidden />
            ) : null}
            {!listState.nextCursor && listState.status === 'idle' ? (
              <p className="spv2-list-end">Você chegou ao fim</p>
            ) : null}
          </div>
        )}
      </section>

      {/* Filtros — PAINEL LATERAL (RC-F6): BottomSheet `side-sheet` (desktop =
          painel direito bloqueante; mobile = bottom sheet, exceção deliberada,
          padrão da casa). Era o modal central `.samples-filter-modal`, do qual
          esta página era o último consumidor vivo. Mesmo rascunho +
          Aplicar/Limpar; o Aplicar do rodapé submete o form via `form=`. */}
      <BottomSheet
        open={filtersOpen}
        onClose={closeFilters}
        title="Filtros"
        ariaLabel="Filtros de contratos"
        className="side-sheet fv-filter-sheet"
        footer={
          <div className="fv-filter-actions">
            <button
              type="button"
              className="fv-btn fv-btn-secondary"
              onClick={handleClearFilters}
              disabled={!hasAnyFilter}
            >
              Limpar
            </button>
            <button type="submit" form="contracts-filter-form" className="fv-btn fv-btn-primary">
              Aplicar
            </button>
          </div>
        }
      >
        <form id="contracts-filter-form" className="fv-filter-form" onSubmit={handleApplyFilters}>
          <div className="fv-filter-field">
            <ClientLookupField
              session={session}
              label="Comprador"
              kind="buyer"
              selectedClient={draftFilters.buyerClient}
              onSelectClient={(client: ClientSummary | null) =>
                setDraftFilters((f) => ({ ...f, buyerClient: client }))
              }
              compact
              placeholder="Qualquer comprador"
            />
          </div>

          <div className="fv-filter-field">
            <ClientLookupField
              session={session}
              label="Vendedor"
              kind="owner"
              selectedClient={draftFilters.sellerClient}
              onSelectClient={(client: ClientSummary | null) =>
                setDraftFilters((f) => ({ ...f, sellerClient: client }))
              }
              compact
              placeholder="Qualquer vendedor"
            />
          </div>

          <div className="fv-filter-field">
            <ChipMultiSelectField
              label="Situação"
              placeholder="Qualquer situação"
              options={SITUACAO_CHIP_OPTIONS}
              selected={draftFilters.statuses}
              onChange={(next) =>
                setDraftFilters((f) => ({ ...f, statuses: next as SaleContractStatus[] }))
              }
              forceDropDown
            />
          </div>

          <div className="fv-filter-field">
            <ChipMultiSelectField
              label="Tipo"
              placeholder="Qualquer tipo"
              options={TYPE_CHIP_OPTIONS}
              selected={draftFilters.types}
              onChange={(next) =>
                setDraftFilters((f) => ({ ...f, types: next as ContractFilters['types'] }))
              }
              forceDropDown
            />
          </div>

          <label className="fv-filter-field">
            <span className="fv-filter-label">Período</span>
            <select
              className="fv-select"
              value={draftFilters.periodBase}
              onChange={(event) =>
                setDraftFilters((f) => ({
                  ...f,
                  periodBase: event.target.value as ContractFilters['periodBase'],
                }))
              }
              aria-label="Base da data do período"
            >
              {PERIOD_BASE_LABELS.map((base) => (
                <option key={base.value} value={base.value}>
                  {base.label}
                </option>
              ))}
            </select>
          </label>

          <div className="fv-filter-row">
            <label className="fv-filter-field">
              <span className="fv-filter-label">De</span>
              <input
                className="fv-input"
                type="date"
                value={draftFilters.periodFrom}
                onChange={(event) =>
                  setDraftFilters((f) => ({ ...f, periodFrom: event.target.value }))
                }
              />
            </label>
            <label className="fv-filter-field">
              <span className="fv-filter-label">Até</span>
              <input
                className="fv-input"
                type="date"
                value={draftFilters.periodTo}
                onChange={(event) =>
                  setDraftFilters((f) => ({ ...f, periodTo: event.target.value }))
                }
              />
            </label>
          </div>
        </form>
      </BottomSheet>

      {etapa2Rendered ? (
        <SaleContractEtapa2Modal
          session={session}
          open={etapa2 != null}
          contractId={etapa2Rendered.contractId}
          onClose={() => setEtapa2(null)}
          onSaved={(contractId) => {
            setEtapa2(null);
            void refresh();
            toast.success({ title: 'Documento emitido' });
            // RC-D20: quem emitiu quer VER o contrato, não voltar pra lista.
            if (contractId) openDetailsById(contractId);
          }}
        />
      ) : null}

      {/* Detalhes (Fase J; F3 do redesign = DetailOverlay por URL): documento
          embutido + infos + historico. As acoes do rodape (Editar/Agio/Desagio/
          Washout/Espelho) FECHAM o Detalhes e abrem o fluxo correspondente (um
          modal por vez, sem sobreposicao) — o swap fica PENDENTE ate o ?details=
          sair da URL (afterDetailsCloseRef), o fechamento em si e o closeDetails. */}
      {detailsRendered ? (
        <SaleContractDetailsModal
          session={session}
          open={detailsContract != null}
          contract={detailsRendered}
          canManage={canManage}
          espelhoEligible={espelhoEligibility(detailsRendered).eligible}
          onGerarEspelho={() => {
            const target = detailsRendered;
            espelhoReturnRef.current = null;
            afterDetailsCloseRef.current = () => setEspelhoTarget(target);
            closeDetails();
          }}
          onClose={closeDetails}
          onEditar={() => {
            const target = detailsRendered;
            espelhoReturnRef.current = null;
            afterDetailsCloseRef.current = () => setEtapa2({ contractId: target.id });
            closeDetails();
          }}
          onApplyAgio={(type) => {
            const target = detailsRendered;
            espelhoReturnRef.current = null;
            afterDetailsCloseRef.current = () =>
              setAgioTarget({ contract: target, agioType: type });
            closeDetails();
          }}
          onWashout={() => {
            const target = detailsRendered;
            espelhoReturnRef.current = null;
            afterDetailsCloseRef.current = () =>
              setLifecycle({
                contractId: target.id,
                expectedVersion: target.version,
                contractNumber: target.contractNumber,
                hasLot: target.type === 'MERCADO_A_VISTA',
              });
            closeDetails();
          }}
        />
      ) : null}

      {futureRendered ? (
        <SaleContractEtapa2Modal
          session={session}
          open={futureOpen}
          futureCreate
          onClose={() => setFutureOpen(false)}
          onSaved={(contractId) => {
            setFutureOpen(false);
            void refresh();
            toast.success({ title: 'Contrato Futuro gerado' });
            if (contractId) openDetailsById(contractId);
          }}
        />
      ) : null}

      {lifecycle ? (
        <SaleContractLifecycleDialog
          session={session}
          contractId={lifecycle.contractId}
          expectedVersion={lifecycle.expectedVersion}
          contractNumber={lifecycle.contractNumber}
          hasLot={lifecycle.hasLot}
          onClose={() => setLifecycle(null)}
          onDone={() => {
            setLifecycle(null);
            void refresh();
            toast.success({ title: 'Washout realizado' });
          }}
        />
      ) : null}

      {agioTarget ? (
        <SaleContractAgioDialog
          session={session}
          contract={agioTarget.contract}
          agioType={agioTarget.agioType}
          onClose={() => setAgioTarget(null)}
          onDone={() => {
            const applied = agioTarget.agioType === 'AGIO' ? 'Ágio aplicado' : 'Deságio aplicado';
            setAgioTarget(null);
            void refresh();
            toast.success({ title: applied });
          }}
        />
      ) : null}

      {/* Criação à vista — RC-D57: UM painel de três passos (lote → formulário →
          documento). O picker era um sheet irmão, com um descendo enquanto o
          outro subia e o "Voltar" destruindo o formulário; hoje quem gere os
          passos é o próprio painel, e a página só liga e desliga o fluxo. */}
      {spotCreateRendered ? (
        <SaleContractEtapa2Modal
          session={session}
          open={spotCreateOpen}
          spotFlow
          onClose={() => setSpotCreateOpen(false)}
          onSaved={(contractId) => {
            setSpotCreateOpen(false);
            void refresh();
            toast.success({ title: 'Contrato à vista gerado' });
            if (contractId) openDetailsById(contractId);
          }}
        />
      ) : null}

      {/* Espelho de Corretagem (Fase E + D134): 1ª etapa = CONFERÊNCIA dos campos
          (toggle de lado + Ver detalhes vai-e-volta) → 2ª etapa = prévia do PDF
          com Exportar/Baixar. RC-F6: só nasce pelo Detalhes. */}
      {espelhoTarget ? (
        <EspelhoConferenciaModal
          session={session}
          contract={espelhoTarget}
          onClose={() => setEspelhoTarget(null)}
          onConfirm={(side) => {
            const target = espelhoTarget;
            setEspelhoTarget(null);
            setEspelhoPreview({ contract: target, side });
          }}
          onOpenDetails={() => {
            const target = espelhoTarget;
            setEspelhoTarget(null);
            espelhoReturnRef.current = target;
            openDetails(target);
          }}
        />
      ) : null}
      {espelhoPreview ? (
        <EspelhoCorretagemModal
          session={session}
          contract={espelhoPreview.contract}
          side={espelhoPreview.side}
          onClose={() => setEspelhoPreview(null)}
        />
      ) : null}
    </>
  );
}
