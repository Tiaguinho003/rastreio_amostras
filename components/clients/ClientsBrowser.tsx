'use client';

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { ClientQuickCreateModal } from './ClientQuickCreateModal';
import type { ClientDetailInitialAction } from './ClientDetailView';
import { BottomSheet } from '../BottomSheet';
import {
  EMPTY_CLIENT_FILTERS,
  countActiveClientFilters,
  type ClientFilters,
} from './ClientsFilterButton';
import { isClientComplete } from '../../lib/clients/client-completeness';
import { ApiError, listClients, lookupUsersForReference } from '../../lib/api-client';
import { formatClientDocument, formatPhone } from '../../lib/client-field-formatters';
import { formatRelativeTime } from '../../lib/relative-time';
import { useIsDesktop } from '../../lib/use-desktop';
import { useListRevalidation } from '../../lib/use-list-revalidation';
import { useToast } from '../../lib/toast/ToastProvider';
import type {
  ClientStatus,
  ClientStatsResponse,
  ClientSummary,
  ClientPersonType,
  SessionData,
  UserLookupItem,
} from '../../lib/types';

const CLIENT_PAGE_LIMIT = 60;
// 14.6.C: shape do nextCursor mudou (createdAt -> displayName). Snapshots
// v1 antigos no browser ficam orfaos; proximo save sobrescreve com v2.
// v3: filtros consolidados num objeto (ClientFilters) — substitui os antigos
// commercialUserFilter + showOnlyIncomplete. Snapshots v2 ficam orfaos.
// A chave e parametrizavel (storageKey) pra o mesmo browser rodar em 2 telas
// (/clients e a aba Clientes de /cadastros) sem colidir os snapshots.
const DEFAULT_STORAGE_KEY = 'clients-list-snapshot-v3';
// 14.7.K: TTL 10min — snapshot expira apos esse periodo de inatividade.
const CLIENTS_SNAPSHOT_TTL_MS = 10 * 60 * 1000;

type ClientsSnapshot = {
  appliedClientSearch: string;
  filters: ClientFilters;
  items: ClientSummary[];
  total: number;
  incompleteTotal: number;
  nextCursor: ClientCursor | null;
  scrollTop: number;
  timestamp: number;
};

function readSnapshot(key: string): ClientsSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as ClientsSnapshot;
    if (
      typeof data.timestamp !== 'number' ||
      Date.now() - data.timestamp > CLIENTS_SNAPSHOT_TTL_MS
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    if (!Array.isArray(data.items)) return null;
    return data;
  } catch {
    return null;
  }
}

function saveSnapshot(key: string, snapshot: ClientsSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // QuotaExceeded ou private mode: ignora silenciosamente.
  }
}

function clearSnapshot(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// Converte os filtros consolidados nos params server-side do listClients.
// O papel ('buyer'/'seller') vira os booleans isBuyer/isSeller; os demais sao
// 1:1 (string vazia = sem filtro -> undefined).
function clientFiltersToQuery(filters: ClientFilters) {
  return {
    status: filters.status || undefined,
    personType: filters.personType || undefined,
    isBuyer: filters.role === 'buyer' ? true : undefined,
    isSeller: filters.role === 'seller' ? true : undefined,
    isWarehouse: filters.role === 'warehouse' ? true : undefined,
    commercialUserId: filters.commercialUserId || undefined,
    completeness: filters.completeness || undefined,
  };
}
// 14.6.D: rootMargin '0px' — sentinel so dispara fetch quando ja esta
// realmente visivel (sem prefetch agressivo). Combinado com lock de scroll
// durante loading-more, da feedback claro de pausa pro usuario.
const CLIENT_LOAD_MORE_ROOT_MARGIN = '0px';

function clientDisplayName(client: ClientSummary | null) {
  return client?.displayName ?? client?.fullName ?? client?.legalName ?? 'Cliente';
}

// Avatar de iniciais do cliente: VERDE por TIPO (decisao 2026-06) — PJ verde
// escuro (brand-green), PF verde mais claro (brand-green-soft). O gradiente +
// sombra do `.cv2-card-avatar` derivam de `--avatar-color`.
function getClientAvatarColor(personType: ClientPersonType): string {
  return personType === 'PF' ? '#2f8a5e' : '#1f5d43';
}

function getClientInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.match(/\p{L}/u)?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// 14.6.C: cursor alfabetico (substitui o cronologico de 14.4.A).
type ClientCursor = { displayName: string; id: string };
type ClientsListStatus = 'loading-initial' | 'loading-more' | 'idle' | 'error';

interface ClientsListState {
  items: ClientSummary[];
  total: number;
  incompleteTotal: number;
  nextCursor: ClientCursor | null;
  status: ClientsListStatus;
  error: string | null;
  // 14.6.D: indice (no array merged) do primeiro card recem-chegado.
  // Usado pra calcular --anim-delay row-major SO nos novos cards
  // (cards antigos nao re-animam). null = nenhum batch novo pendente.
  firstNewIndex: number | null;
}

type ClientsListAction =
  | { type: 'fetch-initial' }
  | { type: 'fetch-more' }
  | {
      type: 'success-initial';
      items: ClientSummary[];
      total: number;
      incompleteTotal: number;
      nextCursor: ClientCursor | null;
    }
  | {
      type: 'success-more';
      items: ClientSummary[];
      incompleteTotal: number;
      nextCursor: ClientCursor | null;
    }
  | { type: 'error'; message: string }
  | {
      type: 'restoreSnapshot';
      items: ClientSummary[];
      total: number;
      incompleteTotal: number;
      nextCursor: ClientCursor | null;
    };

const CLIENTS_INITIAL: ClientsListState = {
  items: [],
  total: 0,
  incompleteTotal: 0,
  nextCursor: null,
  status: 'loading-initial',
  error: null,
  firstNewIndex: null,
};

function clientsListReducer(state: ClientsListState, action: ClientsListAction): ClientsListState {
  switch (action.type) {
    case 'fetch-initial':
      return { ...CLIENTS_INITIAL, status: 'loading-initial' };
    case 'fetch-more':
      return { ...state, status: 'loading-more', error: null };
    case 'success-initial':
      return {
        ...state,
        items: action.items,
        total: action.total,
        incompleteTotal: action.incompleteTotal,
        nextCursor: action.nextCursor,
        status: 'idle',
        error: null,
        firstNewIndex: 0,
      };
    case 'success-more':
      return {
        ...state,
        items: [...state.items, ...action.items],
        incompleteTotal: action.incompleteTotal,
        nextCursor: action.nextCursor,
        status: 'idle',
        error: null,
        firstNewIndex: state.items.length,
      };
    case 'restoreSnapshot':
      return {
        ...state,
        items: action.items,
        total: action.total,
        incompleteTotal: action.incompleteTotal,
        nextCursor: action.nextCursor,
        status: 'idle',
        error: null,
        firstNewIndex: null,
      };
    case 'error':
      return { ...state, status: 'error', error: action.message };
    default:
      return state;
  }
}

export interface ClientsBrowserProps {
  // O layout do route group (app) autentica e a pagina faz o guard de papel
  // (useRequireRole); o browser so monta com sessao pronta — por isso session
  // e sempre nao-nulo aqui.
  session: SessionData;
  // Chave do snapshot em sessionStorage. Distinta por contexto: /clients usa a
  // default; a aba Clientes de /cadastros passa uma propria (nao colidem).
  storageKey?: string;
  // Deep-link ?incomplete=true (card "Cadastros pendentes" do dashboard). So a
  // /clients le a URL e repassa; a aba de /cadastros nao usa (default false).
  initialIncomplete?: boolean;
  // Clique num card (e pos-criacao do quick-create): a pagina-host abre o
  // overlay de detalhe (F1 do redesign — /cadastros?cliente=<id>). O antigo
  // modal-resumo cdm foi absorvido pelo overlay.
  onOpenClient: (clientId: string) => void;
  // RD14: acao profunda do menu ⋯ da tabela desktop — a pagina abre o overlay
  // com ?acao= e o ClientDetailView dispara o modal correspondente.
  onOpenClientAction?: (clientId: string, action: ClientDetailInitialAction) => void;
  // RD14: o CTA "+ Novo cliente" do cabecalho desktop vive na pagina, mas o
  // quick-create vive aqui — o browser registra o abridor pra pagina chamar.
  registerCreateOpener?: (openCreate: () => void) => void;
  // RD16 C4: stats globais (Total + Incompletos) pro KPI-2 do mobile, que rola
  // dentro da lista. A pagina ja busca (getClientStats) e passa; no desktop o
  // KPI de 4 cards fica na pagina.
  clientStats?: ClientStatsResponse | null;
}

// Experiencia COMPLETA de lista de clientes (busca + filtro + FAB + scroll
// infinito + detalhe + criar), extraida da pagina /clients para ser reutilizada
// tal-qual na aba "Clientes" de /cadastros. Renderiza um fragment (sem AppShell,
// sem header, sem .clients-page-v2) — a casca fica na pagina que a monta.
export function ClientsBrowser({
  session,
  storageKey = DEFAULT_STORAGE_KEY,
  initialIncomplete = false,
  onOpenClient,
  onOpenClientAction,
  registerCreateOpener,
  clientStats,
}: ClientsBrowserProps) {
  const toast = useToast();

  // RD14: no desktop a lista vira TABELA institucional (.fv-table); mobile
  // segue com os cards. Mesmo breakpoint 901px do CSS.
  const isDesktop = useIsDesktop();

  // storageKey e estavel por contexto (literal em cada tela); guardo num ref
  // pra usar nos effects/handlers sem entrar nas deps.
  const storageKeyRef = useRef(storageKey);

  // URL ?incomplete=true tem precedencia sobre o snapshot — quando o user
  // clica no card "Cadastros pendentes" do dashboard, a intencao explicita e
  // ver a lista filtrada (completeness=incomplete), independente do estado salvo.
  const incompleteFromUrl = initialIncomplete;

  // 14.7.K: snapshot persistente — restaura filtros + items + scroll
  // ao retornar pra pagina dentro do TTL (10min).
  const initialSnapshotRef = useRef<ClientsSnapshot | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = readSnapshot(storageKeyRef.current);
  }
  const initialSnapshot = initialSnapshotRef.current;
  // Deep-link ?incomplete=true forca refetch (completeness e server-side agora):
  // pular o fetch mostraria os items restaurados sem o filtro aplicado.
  // Mount restaurado do snapshot roda o fetch SILENCIOSO (stale-while-
  // revalidate) — ver o effect do fetch inicial.
  const skipInitialFetchRef = useRef<boolean>(initialSnapshot !== null && !incompleteFromUrl);
  // Revalidacao silenciosa (2026-07-07): tick refaz o fetch sem skeleton
  // (retorno ao app + polling — useListRevalidation).
  const [refreshTick, setRefreshTick] = useState(0);
  const pendingScrollRestoreRef = useRef<number | null>(
    initialSnapshot ? initialSnapshot.scrollTop : null
  );

  const [clientsState, dispatchClients] = useReducer(
    clientsListReducer,
    initialSnapshot,
    (snap): ClientsListState => {
      if (snap) {
        return {
          ...CLIENTS_INITIAL,
          items: snap.items,
          total: snap.total,
          incompleteTotal: snap.incompleteTotal,
          nextCursor: snap.nextCursor,
          status: 'idle',
          firstNewIndex: null,
        };
      }
      return CLIENTS_INITIAL;
    }
  );
  const [clientSearchInput, setClientSearchInput] = useState(
    () => initialSnapshot?.appliedClientSearch ?? ''
  );
  const [appliedClientSearch, setAppliedClientSearch] = useState(
    () => initialSnapshot?.appliedClientSearch ?? ''
  );
  const [clientQuickCreateOpen, setClientQuickCreateOpen] = useState(false);
  const clientSearchDebounceRef = useRef<number | null>(null);

  // RD14: entrega o abridor do quick-create pra pagina-host (CTA desktop).
  useEffect(() => {
    registerCreateOpener?.(() => setClientQuickCreateOpen(true));
  }, [registerCreateOpener]);

  // RD14: menu ⋯ da linha da tabela (um aberto por vez, keyed por client.id).
  // Dismiss = clique-fora + ESC devolvendo o foco ao trigger (mesmo padrao do
  // useMenuDismiss do AppShell, que e privado de la).
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

  // Filtros consolidados (responsavel, status, tipo, papel, completude).
  // Semeado pelo snapshot; o deep-link ?incomplete=true sobrescreve a
  // completude pra 'incomplete'.
  const [appliedFilters, setAppliedFilters] = useState<ClientFilters>(() => {
    const base = initialSnapshot?.filters ?? EMPTY_CLIENT_FILTERS;
    return incompleteFromUrl ? { ...base, completeness: 'incomplete' } : base;
  });
  const [users, setUsers] = useState<UserLookupItem[]>([]);

  // Filtros em PAINEL LATERAL (RD14): BottomSheet `side-sheet` — desktop =
  // painel direito bloqueante, mobile = bottom sheet. Rascunho local + aplicado
  // no estado da pagina; ESC/back/foco/scroll-lock sao do proprio BottomSheet.
  // (Substituiu o modal central bespoke, que espelhava /samples.)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ClientFilters>(appliedFilters);

  const clientsScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadMoreStateRef = useRef<{
    inFlight: boolean;
    token: number;
    abort: AbortController | null;
  }>({
    inFlight: false,
    token: 0,
    abort: null,
  });
  // Entradas do ultimo fetch inicial — distingue "so o tick de revalidacao
  // mudou" (refetch SILENCIOSO) de "busca/filtro mudou" (loading normal).
  const prevClientsFetchRef = useRef({ appliedClientSearch, appliedFilters, refreshTick });

  // 14.4.C: contagem de incompletos vem do backend (clientsState.incompleteTotal),
  // total real respeitando filtros server-side. Removido o useMemo client-side
  // que somava sobre items carregados (numero subia conforme scroll).

  // 14.6.C: backend agora paginate por cursor alfabetico (displayName ASC,
  // id ASC) — items ja vem ordenados. Sort client-side removido. A completude
  // tambem virou filtro server-side (param completeness no listClients), entao
  // nao ha mais filtro client-side: a lista exibida e a que veio do backend.
  const displayClients = clientsState.items;

  // RD14: referencia de "agora" pro "Atualizado ha X" da tabela. Recalcula a
  // cada render (a lista re-renderiza com frequencia); sem interval proprio.
  const nowMs = Date.now();

  // 14.4.B: agrupa cards por inicial para divisores alfabeticos (mobile-only;
  // CSS hide em desktop grid).
  const groupedDisplay = useMemo(() => {
    const out: Array<
      { kind: 'divider'; letter: string } | { kind: 'card'; client: ClientSummary; index: number }
    > = [];
    let lastLetter: string | null = null;
    displayClients.forEach((c, i) => {
      const letter = (clientDisplayName(c).trim().charAt(0) || '#').toUpperCase();
      if (letter !== lastLetter) {
        out.push({ kind: 'divider', letter });
        lastLetter = letter;
      }
      out.push({ kind: 'card', client: c, index: i });
    });
    return out;
  }, [displayClients]);

  // Debounce effect for client search
  useEffect(() => {
    if (clientSearchDebounceRef.current !== null) {
      window.clearTimeout(clientSearchDebounceRef.current);
    }

    // Alinhado a /samples: aplica so a partir de 2 caracteres; com <2 desfiltra
    // (mostra todos). Evita disparar a busca ja na 1a letra.
    const trimmed = clientSearchInput.trim();
    const next = trimmed.length >= 2 ? trimmed : '';
    if (next === appliedClientSearch) {
      return;
    }

    clientSearchDebounceRef.current = window.setTimeout(() => {
      clientSearchDebounceRef.current = null;
      setAppliedClientSearch(next);
    }, 400);

    return () => {
      if (clientSearchDebounceRef.current !== null) {
        window.clearTimeout(clientSearchDebounceRef.current);
        clientSearchDebounceRef.current = null;
      }
    };
  }, [clientSearchInput, appliedClientSearch]);

  // Load user lookup once per session
  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;
    lookupUsersForReference(session, { limit: 200 })
      .then((response) => {
        if (!cancelled) {
          // Responsavel opcional e QUALQUER usuario ativo pode ser responsavel —
          // o filtro lista todos (o backend retorna comerciais primeiro).
          setUsers(response.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsers([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  // 14.4.A: scroll infinito por cursor — fetch inicial dispara quando muda
  // search ou qualquer filtro (todos server-side). Cursor é resetado.
  useEffect(() => {
    if (!session) {
      return;
    }

    // Revalidacao silenciosa (2026-07-07, espelha /samples): so o tick mudou →
    // refetch em background mantendo a lista atual na tela.
    const prev = prevClientsFetchRef.current;
    const filtersChanged =
      prev.appliedClientSearch !== appliedClientSearch || prev.appliedFilters !== appliedFilters;
    const isTickOnly = !filtersChanged && prev.refreshTick !== refreshTick;
    prevClientsFetchRef.current = { appliedClientSearch, appliedFilters, refreshTick };

    // 14.7.K: snapshot restaurou state — antes o primeiro fetch era PULADO de
    // vez (lista congelada nos dados do snapshot ate mexer em filtro/busca).
    // Agora o snapshot e so a primeira pintura: o fetch roda silencioso.
    const restoredMount = skipInitialFetchRef.current;
    skipInitialFetchRef.current = false;
    const isSilentBackground = isTickOnly || restoredMount;

    const abortController = new AbortController();
    let active = true;
    if (!isSilentBackground) {
      dispatchClients({ type: 'fetch-initial' });
    }
    loadMoreStateRef.current.token += 1;
    loadMoreStateRef.current.inFlight = false;
    // Cancela load-more pendente do filtro/busca anteriores.
    loadMoreStateRef.current.abort?.abort();
    loadMoreStateRef.current.abort = null;

    listClients(
      session,
      {
        search: appliedClientSearch || undefined,
        ...clientFiltersToQuery(appliedFilters),
        limit: CLIENT_PAGE_LIMIT,
      },
      { signal: abortController.signal }
    )
      .then((response) => {
        if (!active) return;
        dispatchClients({
          type: 'success-initial',
          items: response.items,
          total: response.page.total,
          incompleteTotal: response.page.incompleteTotal,
          nextCursor: response.page.nextCursor,
        });
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        // Revalidacao em background falhou: mantem o que esta na tela (o
        // proximo tick/retorno tenta de novo).
        if (isSilentBackground) return;
        dispatchClients({
          type: 'error',
          message: cause instanceof ApiError ? cause.message : 'Falha ao carregar clientes',
        });
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [appliedClientSearch, appliedFilters, session, refreshTick]);

  // Revalidacao silenciosa (mesmo padrao do dashboard e de /samples): refetch
  // ao voltar o app pro primeiro plano (throttle 30s) + polling 60s com a
  // pagina visivel. Guards: nao atropela carregamento/paginacao em andamento.
  const clientsStatusRef = useRef(clientsState.status);
  clientsStatusRef.current = clientsState.status;
  const requestSilentRefetch = useCallback(() => {
    const status = clientsStatusRef.current;
    if (status === 'loading-initial' || status === 'loading-more') return;
    if (loadMoreStateRef.current.inFlight) return;
    setRefreshTick((tick) => tick + 1);
  }, []);

  useListRevalidation({
    enabled: Boolean(session),
    onRevalidate: requestSilentRefetch,
  });

  // 14.4.A: load-more pelo cursor. inFlight + token protegem contra race
  // condition em scrolls rápidos (mesmo padrão de /samples).
  const runLoadMore = useCallback(
    (cursor: ClientCursor) => {
      const state = loadMoreStateRef.current;
      if (state.inFlight) return;
      if (!session) return;
      state.inFlight = true;
      state.token += 1;
      const myToken = state.token;
      // Cancela load-more pendente anterior (caso o sentinel dispare 2x
      // antes do primeiro completar — defensivo).
      state.abort?.abort();
      const controller = new AbortController();
      state.abort = controller;
      dispatchClients({ type: 'fetch-more' });

      listClients(
        session,
        {
          search: appliedClientSearch || undefined,
          ...clientFiltersToQuery(appliedFilters),
          limit: CLIENT_PAGE_LIMIT,
          cursorDisplayName: cursor.displayName,
          cursorId: cursor.id,
        },
        { signal: controller.signal }
      )
        .then((response) => {
          if (loadMoreStateRef.current.token !== myToken) return;
          dispatchClients({
            type: 'success-more',
            items: response.items,
            incompleteTotal: response.page.incompleteTotal,
            nextCursor: response.page.nextCursor,
          });
        })
        .catch((cause) => {
          if (loadMoreStateRef.current.token !== myToken) return;
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          dispatchClients({
            type: 'error',
            message: cause instanceof ApiError ? cause.message : 'Falha ao carregar mais',
          });
        })
        .finally(() => {
          if (loadMoreStateRef.current.token === myToken) {
            loadMoreStateRef.current.inFlight = false;
            loadMoreStateRef.current.abort = null;
          }
        });
    },
    [session, appliedClientSearch, appliedFilters]
  );

  // 14.4.A: IntersectionObserver no sentinel — quando entra na viewport
  // com 200px de margem, dispara load-more se estiver idle e tiver cursor.
  useEffect(() => {
    if (!session) return;
    if (clientsState.status !== 'idle') return;
    if (!clientsState.nextCursor) return;
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;
    const cursor = clientsState.nextCursor;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          runLoadMore(cursor);
        }
      },
      { root: clientsScrollRef.current, rootMargin: CLIENT_LOAD_MORE_ROOT_MARGIN }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [runLoadMore, clientsState.nextCursor, clientsState.status, session]);

  // 14.7.K: restore scroll position uma vez apos o primeiro paint dos
  // items restaurados. Dois rAF garantem que o grid ja calculou as
  // posicoes finais (especialmente em desktop wide com grid-template
  // que pode reflowar).
  useEffect(() => {
    const target = pendingScrollRestoreRef.current;
    if (target === null || target <= 0) return;
    if (clientsState.items.length === 0) return;
    pendingScrollRestoreRef.current = null;
    const id1 = window.requestAnimationFrame(() => {
      const id2 = window.requestAnimationFrame(() => {
        const el = clientsScrollRef.current;
        if (el) el.scrollTop = target;
      });
      // captura pra cancelar se desmontar entre rAFs
      pendingScrollRestoreRef.current = id2 as unknown as number;
    });
    return () => {
      window.cancelAnimationFrame(id1);
      const pending = pendingScrollRestoreRef.current;
      if (typeof pending === 'number') {
        window.cancelAnimationFrame(pending);
        pendingScrollRestoreRef.current = null;
      }
    };
  }, [clientsState.items.length]);

  // 14.7.K: salva snapshot em sessionStorage sempre que o state relevante
  // muda. Debounce 250ms pra nao serializar a cada keystroke. Pula durante
  // loading-initial pra nao sobrescrever snapshot bom com array vazio.
  useEffect(() => {
    if (clientsState.status === 'loading-initial') return;
    if (clientsState.status === 'error') return;
    const handle = window.setTimeout(() => {
      saveSnapshot(storageKeyRef.current, {
        appliedClientSearch,
        filters: appliedFilters,
        items: clientsState.items,
        total: clientsState.total,
        incompleteTotal: clientsState.incompleteTotal,
        nextCursor: clientsState.nextCursor,
        scrollTop: clientsScrollRef.current?.scrollTop ?? 0,
        timestamp: Date.now(),
      });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [
    appliedClientSearch,
    appliedFilters,
    clientsState.items,
    clientsState.total,
    clientsState.incompleteTotal,
    clientsState.nextCursor,
    clientsState.status,
  ]);

  // 14.7.K: scroll listener — atualiza scrollTop no snapshot existente
  // (debounce 200ms). So mexe se houver snapshot ja salvo (preserva os
  // outros campos sem precisar duplica-los aqui).
  useEffect(() => {
    const el = clientsScrollRef.current;
    if (!el) return;
    let timer: number | null = null;
    function onScroll() {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const snap = readSnapshot(storageKeyRef.current);
        if (!snap) return;
        snap.scrollTop = el?.scrollTop ?? 0;
        snap.timestamp = Date.now();
        saveSnapshot(storageKeyRef.current, snap);
      }, 200);
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [clientsState.items.length]);

  function handleClientSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (clientSearchDebounceRef.current !== null) {
      window.clearTimeout(clientSearchDebounceRef.current);
      clientSearchDebounceRef.current = null;
    }
    const trimmed = clientSearchInput.trim();
    setAppliedClientSearch(trimmed.length >= 2 ? trimmed : '');
  }

  // ── Filtros (painel lateral) ──
  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearSnapshot(storageKeyRef.current);
    setAppliedFilters(draftFilters);
    setFiltersOpen(false);
  }

  // Reusado pelo botao "Limpar" do painel E pelos botoes de limpar da busca/
  // toolbar.
  function handleClearFiltersOnly() {
    clearSnapshot(storageKeyRef.current);
    setDraftFilters(EMPTY_CLIENT_FILTERS);
    setAppliedFilters(EMPTY_CLIENT_FILTERS);
  }

  function openFilters() {
    setDraftFilters(appliedFilters);
    setFiltersOpen(true);
  }

  function closeFilters() {
    setDraftFilters(appliedFilters);
    setFiltersOpen(false);
  }

  async function refreshClientsList(nextSearch = appliedClientSearch) {
    if (!session) {
      return;
    }

    dispatchClients({ type: 'fetch-initial' });
    loadMoreStateRef.current.token += 1;
    loadMoreStateRef.current.inFlight = false;

    try {
      const response = await listClients(session, {
        search: nextSearch || undefined,
        ...clientFiltersToQuery(appliedFilters),
        limit: CLIENT_PAGE_LIMIT,
      });

      dispatchClients({
        type: 'success-initial',
        items: response.items,
        total: response.page.total,
        incompleteTotal: response.page.incompleteTotal,
        nextCursor: response.page.nextCursor,
      });
    } catch (cause) {
      dispatchClients({
        type: 'error',
        message: cause instanceof ApiError ? cause.message : 'Falha ao carregar clientes',
      });
    }
  }

  const activeFiltersCount = countActiveClientFilters(appliedFilters);
  const hasDraftFilters = countActiveClientFilters(draftFilters) > 0;

  // RD16 /cadastros C2: UMA chrome so. A .fv-toolbar (busca + funil + limpar +
  // contagem) serve os dois breakpoints — no desktop fica presa no topo do
  // cartao ({isDesktop ? toolbar}); no mobile rola DENTRO do .spv2-list-scroll
  // (mobileListChrome, injetado nos ramos). Antes a pagina montava DUAS chromes
  // e escondia uma por CSS (a .hero-search-wrap saiu; o "Filtros" ganhou span
  // pro mobile poder esconde-lo).
  const toolbar = (
    <div className="fv-toolbar">
      <form className="fv-toolbar-search" role="search" onSubmit={handleClientSearchSubmit}>
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
          value={clientSearchInput}
          onChange={(event) => setClientSearchInput(event.target.value)}
          placeholder="Buscar por nome ou documento..."
          autoComplete="off"
          spellCheck={false}
        />
        {clientSearchInput ? (
          <button
            type="button"
            className="fv-toolbar-search-clear"
            aria-label="Limpar busca"
            onClick={() => setClientSearchInput('')}
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
        onClick={() => {
          if (filtersOpen) {
            closeFilters();
            return;
          }
          openFilters();
        }}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M4 6h16" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
        {/* O rotulo vive num <span> pra o mobile poder esconde-lo e deixar o
            botao no tamanho do icone — a linha da busca nao cabe os dois. */}
        <span className="fv-toolbar-filter-label">Filtros</span>
        {activeFiltersCount > 0 ? <span className="fv-btn-badge">{activeFiltersCount}</span> : null}
      </button>
      {activeFiltersCount > 0 ? (
        <button type="button" className="fv-toolbar-clear" onClick={handleClearFiltersOnly}>
          Limpar
        </button>
      ) : null}
      <span className="fv-toolbar-count">{clientsState.total} clientes</span>
    </div>
  );

  // RD16 C4: KPI-2 mobile (Total + Incompletos), montado aqui porque o cartao
  // "Incompletos" alterna o filtro completeness — que e state deste browser. Os
  // numeros vem do clientStats (global, o mesmo do KPI de 4 cards do desktop),
  // nao da contagem filtrada da lista. Sem delta: card compacto acima da lista.
  const incompleteFilterActive = appliedFilters.completeness === 'incomplete';
  const toggleIncompleteFilter = () =>
    setAppliedFilters((prev) => ({
      ...prev,
      completeness: prev.completeness === 'incomplete' ? '' : 'incomplete',
    }));
  const mobileKpi = (
    <div className="fv-kpi-row">
      <article className="fv-kpi">
        <div className="fv-kpi-top">
          <span className="fv-kpi-label">Total de clientes</span>
          <span className="fv-kpi-icon is-blue" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
        </div>
        <span className="fv-kpi-value">
          {clientStats?.total == null ? '—' : clientStats.total.toLocaleString('pt-BR')}
        </span>
      </article>
      {/* Cartao clicavel: alterna completeness=incomplete (o mesmo filtro
          server-side do painel e do deep-link ?incomplete=true do dashboard),
          como o "Aguardando classificacao" do /samples. */}
      <button
        type="button"
        className={`fv-kpi is-clickable${incompleteFilterActive ? ' is-active' : ''}`}
        aria-pressed={incompleteFilterActive}
        onClick={toggleIncompleteFilter}
      >
        <div className="fv-kpi-top">
          <span className="fv-kpi-label">Cadastros incompletos</span>
          <span className="fv-kpi-icon is-amber" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
          </span>
        </div>
        <span className="fv-kpi-value">
          {clientStats?.incomplete == null ? '—' : clientStats.incomplete.toLocaleString('pt-BR')}
        </span>
      </button>
    </div>
  );

  // No mobile o KPI-2 e a toolbar rolam junto com os cards (nada de chrome
  // travada). Entram como 1os filhos nos ramos de rolagem (carregando/vazio/
  // cards): o KPI na frente, a toolbar logo abaixo.
  const mobileListChrome = isDesktop ? null : (
    <>
      {mobileKpi}
      {toolbar}
    </>
  );

  return (
    <>
      {/* RD16 C2: a .hero-search-wrap mobile saiu — busca/funil/limpar/contagem
          agora vivem na .fv-toolbar (uma chrome so, mobileListChrome no scroll).
          O FAB de criacao perdeu o pai que o abrigava; virou filho direto,
          escondido no desktop por `.fv-cad-page .cv2-fab` (criar mora no
          "+ Novo cliente" do .fv-page-head). */}
      <button
        type="button"
        className="cv2-fab"
        aria-label="Cadastrar novo cliente"
        onClick={() => setClientQuickCreateOpen(true)}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>

      {/* Sheet */}
      <section className="clients-v2-sheet">
        {/* RD16 C2: no desktop a toolbar fica presa no topo do cartao; no mobile
            ela rola dentro do scroll (mobileListChrome, injetado nos ramos). Uma
            fonte, montada acima — e o contador mobile (.spv2-list-meta) sai: mora
            na .fv-toolbar-count. */}
        {isDesktop ? toolbar : null}

        {/* Card list */}
        {clientsState.status === 'loading-initial' ? (
          <div className="spv2-list-scroll">
            {mobileListChrome}
            <div className="spv2-empty">
              <p className="spv2-empty-text">Carregando...</p>
            </div>
          </div>
        ) : displayClients.length === 0 ? (
          <div className="spv2-list-scroll">
            {mobileListChrome}
            <div className="spv2-empty">
              <svg
                className="spv2-empty-icon cv2-empty-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <p className="spv2-empty-text">Nenhum cliente encontrado</p>
              <p className="spv2-empty-sub">Tente outro termo de busca</p>
            </div>
          </div>
        ) : isDesktop ? (
          /* RD14 (desktop): tabela institucional. Dados/scroll infinito/ordem
             identicos aos cards — muda SO a apresentacao. Sem divisores
             alfabeticos (decisao RD14: tabela corrida). Linha inteira clica;
             o nome e <button> pra teclado. O ⋯ abre o detalhe por ora — vira
             popover de acoes no C7. */
          <div ref={clientsScrollRef} className="spv2-list-scroll fv-table-scroll" tabIndex={-1}>
            <table className="fv-table">
              {/* Ajustes rodada 1: 6 colunas (Cidade/UF e Responsavel sairam);
                  table-layout fixed + colgroup dao larguras estaveis. */}
              <colgroup>
                <col className="fv-col-client" />
                <col className="fv-col-status" />
                <col className="fv-col-doc" />
                <col className="fv-col-contact" />
                <col className="fv-col-updated" />
                <col className="fv-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Status</th>
                  <th scope="col">Documento</th>
                  <th scope="col">Contato</th>
                  <th scope="col">Atualizado</th>
                  <th scope="col" className="fv-table-th-actions" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {displayClients.map((client) => {
                  const name = clientDisplayName(client);
                  const isInactive = client.status === 'INACTIVE';
                  const isComplete = isClientComplete(client).complete;
                  const doc = formatClientDocument(client.document, client.personType);
                  const phone = formatPhone(client.phone);
                  return (
                    <tr
                      key={client.id}
                      className={`fv-table-row${isInactive ? ' is-inactive' : ''}`}
                      onClick={() => onOpenClient(client.id)}
                    >
                      <td>
                        <span className="fv-table-client">
                          {/* Rodada 2: forma do avatar segue o tipo — PJ quadrado
                              arredondado, PF circulo (padrao dos CRMs
                              institucionais: empresa vs pessoa). */}
                          <span
                            className={`fv-table-avatar${client.personType === 'PJ' ? ' is-pj' : ''}`}
                            aria-hidden="true"
                            style={
                              {
                                '--avatar-color': getClientAvatarColor(client.personType),
                              } as React.CSSProperties
                            }
                          >
                            {getClientInitials(name)}
                          </span>
                          <button
                            type="button"
                            className="fv-table-name-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenClient(client.id);
                            }}
                          >
                            <span className="fv-table-name">{name}</span>
                            <span className="fv-table-code">#{client.code}</span>
                          </button>
                        </span>
                      </td>
                      <td>
                        {/* Ajustes rodada 1: UM status so. Ativo/inativo virou
                            estado do CARD (linha .is-inactive apagada +
                            "Cancelado"); ativos mostram a completude. */}
                        {isInactive ? (
                          <span className="fv-chip fv-chip-red">Cancelado</span>
                        ) : isComplete ? (
                          <span className="fv-chip fv-chip-green">Completo</span>
                        ) : (
                          <span className="fv-chip fv-chip-amber">Incompleto</span>
                        )}
                      </td>
                      <td>
                        {/* Rodada 2: valor + rotulo do tipo — mesma cadencia de
                            2 linhas das colunas Cliente e Contato. */}
                        {doc ? (
                          <span className="fv-table-cell-stack">
                            <span className="fv-table-cell-main">{doc}</span>
                            <span className="fv-table-sub">
                              {client.personType === 'PJ' ? 'CNPJ' : 'CPF'}
                            </span>
                          </span>
                        ) : (
                          <span className="fv-table-cell-main">—</span>
                        )}
                      </td>
                      <td>
                        {phone || client.email ? (
                          <span className="fv-table-cell-stack">
                            {phone ? (
                              <span className="fv-cell-ic">
                                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                                </svg>
                                <span className="fv-table-cell-main">{phone}</span>
                              </span>
                            ) : null}
                            {client.email ? (
                              <span className="fv-cell-ic">
                                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                  <rect x="2" y="4" width="20" height="16" rx="2" />
                                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                                </svg>
                                <span className="fv-table-sub">{client.email}</span>
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="fv-table-cell-main">—</span>
                        )}
                      </td>
                      <td>
                        <span
                          className="fv-table-sub"
                          title={
                            client.updatedAt
                              ? new Date(client.updatedAt).toLocaleString('pt-BR')
                              : undefined
                          }
                        >
                          {client.updatedAt ? formatRelativeTime(client.updatedAt, nowMs) : '—'}
                        </span>
                      </td>
                      <td
                        className="fv-table-td-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div
                          className="fv-row-menu-wrap"
                          ref={rowMenuFor === client.id ? rowMenuRef : undefined}
                        >
                          <button
                            type="button"
                            className="fv-table-dots"
                            aria-label={`Ações de ${name}`}
                            aria-haspopup="menu"
                            aria-expanded={rowMenuFor === client.id}
                            onClick={(event) => {
                              rowMenuTriggerRef.current = event.currentTarget;
                              setRowMenuFor((current) =>
                                current === client.id ? null : client.id
                              );
                            }}
                          >
                            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                              <circle cx="5" cy="12" r="1.6" />
                              <circle cx="12" cy="12" r="1.6" />
                              <circle cx="19" cy="12" r="1.6" />
                            </svg>
                          </button>
                          {rowMenuFor === client.id ? (
                            <div
                              className="fv-row-menu"
                              role="menu"
                              aria-label={`Ações de ${name}`}
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="fv-row-menu-item"
                                onClick={() => {
                                  setRowMenuFor(null);
                                  onOpenClient(client.id);
                                }}
                              >
                                Ver detalhes
                              </button>
                              {/* Rodada 2: Editar e Documentos sairam do menu —
                                  moram DENTRO do painel unificado (botao Editar
                                  no header; anexos/contas como cards). Acoes
                                  rapidas = ver detalhes + status. */}
                              <button
                                type="button"
                                role="menuitem"
                                className={`fv-row-menu-item${isInactive ? '' : ' is-danger'}`}
                                onClick={() => {
                                  setRowMenuFor(null);
                                  if (onOpenClientAction) {
                                    onOpenClientAction(client.id, 'status');
                                  } else {
                                    onOpenClient(client.id);
                                  }
                                }}
                              >
                                {isInactive ? 'Reativar' : 'Inativar'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {clientsState.status === 'loading-more'
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={`skel-${i}`} className="fv-table-skel-row" aria-hidden="true">
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j}>
                            <span className="fv-table-skel" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
            {clientsState.nextCursor ? (
              <div ref={loadMoreRef} className="cv2-load-more-sentinel" aria-hidden />
            ) : null}
          </div>
        ) : (
          <div ref={clientsScrollRef} className="spv2-list-scroll" tabIndex={-1}>
            {mobileListChrome}
            {groupedDisplay.map((node) => {
              if (node.kind === 'divider') {
                return (
                  <div
                    key={`div-${node.letter}`}
                    className="cv2-section-divider"
                    aria-hidden="true"
                  >
                    <span className="cv2-section-divider-letter">{node.letter}</span>
                  </div>
                );
              }
              const { client, index: i } = node;
              const name = clientDisplayName(client);
              const avatarColor = getClientAvatarColor(client.personType);
              const initials = getClientInitials(name);
              const incomplete = !isClientComplete(client).complete;
              const isInactive = client.status === 'INACTIVE';
              // Pendencia (badge + barra laranja) so aparece em clientes
              // ATIVOS; inativos saem apagados, sem destacar dados pendentes.
              const showIncomplete = incomplete && !isInactive;
              const cardClasses = ['cv2-card'];
              if (showIncomplete) cardClasses.push('is-incomplete');
              if (isInactive) cardClasses.push('is-inactive');
              return (
                <button
                  key={client.id}
                  type="button"
                  className={cardClasses.join(' ')}
                  style={
                    {
                      // 14.6.D: cascade row-major SO nos cards do batch atual.
                      // firstNewIndex marca onde os novos comecam no array
                      // merged. Cards antes desse indice ja animaram (delay 0),
                      // cards a partir dele animam relativo a posicao no batch
                      // novo. Cap em 25 evita delay > 0.75s. Cards quando
                      // firstNewIndex e null (snapshot restore) nao re-animam.
                      animationDelay:
                        clientsState.firstNewIndex !== null && i >= clientsState.firstNewIndex
                          ? `${Math.min(i - clientsState.firstNewIndex, 25) * 0.03}s`
                          : '0s',
                      '--avatar-color': avatarColor,
                    } as React.CSSProperties
                  }
                  onClick={() => onOpenClient(client.id)}
                >
                  {/* Card em 2 blocos. Topo: avatar + nome + chip de status.
                      Rodape: arrow-btn. O UserAvatarStack de responsaveis
                      comerciais foi removido do card (2026-06-17, batch /clients
                      alinhado ao /samples); responsaveis seguem no detalhe. */}
                  <div className="cv2-card-head">
                    <span className="cv2-card-avatar">
                      <span>{initials}</span>
                    </span>
                    <div className="cv2-card-content">
                      <span className="cv2-card-name">{name}</span>
                      {/* RD16 C3: status institucional por chip, a MESMA leitura
                          da tabela do desktop — Cancelado (inativo) · Completo ·
                          Incompleto. Substitui o badge pulsante: sinal unico e
                          calmo, como o card do /samples. */}
                      <span className="cv2-card-status">
                        {isInactive ? (
                          <span className="fv-chip fv-chip-red is-sm">Cancelado</span>
                        ) : incomplete ? (
                          <span className="fv-chip fv-chip-amber is-sm">Incompleto</span>
                        ) : (
                          <span className="fv-chip fv-chip-green is-sm">Completo</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <span className="cv2-card-divider" aria-hidden="true" />
                  <div className="cv2-card-foot">
                    {/* 14.6.K: pessoa-type texto removido — info redundante
                        com nome + ja eliminada do meta no #14.6.G. So fica
                        a seta no canto direito. */}
                    <span className="cv2-card-arrow-btn" aria-hidden="true">
                      <svg className="spv2-card-chevron" viewBox="0 0 24 24">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </span>
                  </div>
                </button>
              );
            })}
            {/* Carregar mais: 3 skeleton cards acima (sem travar o scroll),
                igual /samples. O sentinel fino abaixo dispara o IntersectionObserver. */}
            {clientsState.status === 'loading-more'
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={`skel-${i}`} className="spv2-skeleton-card" aria-hidden />
                ))
              : null}
            {clientsState.nextCursor ? (
              <div ref={loadMoreRef} className="cv2-load-more-sentinel" aria-hidden />
            ) : null}
          </div>
        )}
      </section>

      {/* Filtros — PAINEL LATERAL (RD14): BottomSheet `side-sheet` (desktop =
          painel direito bloqueante; mobile = bottom sheet, excecao deliberada
          ao "mobile intacto" da E1 — padrao da casa). Mesmo rascunho +
          Aplicar/Limpar; o Aplicar do footer submete o form via `form=`. */}
      <BottomSheet
        open={filtersOpen}
        onClose={closeFilters}
        title="Filtros"
        ariaLabel="Filtros de clientes"
        className="side-sheet fv-filter-sheet"
        footer={
          <div className="fv-filter-actions">
            <button
              type="button"
              className="fv-btn fv-btn-secondary"
              onClick={handleClearFiltersOnly}
              disabled={!hasDraftFilters && activeFiltersCount === 0}
            >
              Limpar
            </button>
            <button type="submit" form="clients-filter-form" className="fv-btn fv-btn-primary">
              Aplicar
            </button>
          </div>
        }
      >
        <form id="clients-filter-form" className="fv-filter-form" onSubmit={handleApplyFilters}>
          <label className="fv-filter-field">
            <span className="fv-filter-label">Responsável</span>
            <select
              className="fv-select"
              value={draftFilters.commercialUserId}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  commercialUserId: event.target.value,
                }))
              }
            >
              <option value="">Qualquer responsável</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="fv-filter-field">
            <span className="fv-filter-label">Status</span>
            <select
              className="fv-select"
              value={draftFilters.status}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  status: event.target.value as ClientFilters['status'],
                }))
              }
            >
              <option value="">Qualquer</option>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </select>
          </label>

          <label className="fv-filter-field">
            <span className="fv-filter-label">Tipo</span>
            <select
              className="fv-select"
              value={draftFilters.personType}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  personType: event.target.value as ClientFilters['personType'],
                }))
              }
            >
              <option value="">Qualquer</option>
              <option value="PF">Pessoa física</option>
              <option value="PJ">Pessoa jurídica</option>
            </select>
          </label>

          <label className="fv-filter-field">
            <span className="fv-filter-label">Papel</span>
            <select
              className="fv-select"
              value={draftFilters.role}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  role: event.target.value as ClientFilters['role'],
                }))
              }
            >
              <option value="">Qualquer</option>
              <option value="buyer">Comprador</option>
              <option value="seller">Vendedor</option>
              <option value="warehouse">Armazém</option>
            </select>
          </label>

          <label className="fv-filter-field">
            <span className="fv-filter-label">Completude</span>
            <select
              className="fv-select"
              value={draftFilters.completeness}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  completeness: event.target.value as ClientFilters['completeness'],
                }))
              }
            >
              <option value="">Qualquer</option>
              <option value="complete">Completo</option>
              <option value="incomplete">
                {clientsState.incompleteTotal && clientsState.incompleteTotal > 0
                  ? `Incompleto (${clientsState.incompleteTotal})`
                  : 'Incompleto'}
              </option>
            </select>
          </label>
        </form>
      </BottomSheet>

      <ClientQuickCreateModal
        session={session}
        open={clientQuickCreateOpen}
        title="Novo cliente"
        initialSearch={clientSearchInput.trim()}
        initialPersonType="PJ"
        initialIsBuyer={false}
        onClose={() => setClientQuickCreateOpen(false)}
        onCreated={async (client) => {
          setClientQuickCreateOpen(false);
          // L5: PJ ja vem completo do quick-create (sem branches). PF pode
          // adicionar filiais depois. Sem rota especial pra "configurar matriz".
          setClientSearchInput('');
          setAppliedClientSearch('');
          await refreshClientsList('');
          onOpenClient(client.id);
        }}
      />
    </>
  );
}
