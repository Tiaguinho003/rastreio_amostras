'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  type FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { ClientQuickCreateModal } from '../../components/clients/ClientQuickCreateModal';
import {
  EMPTY_CLIENT_FILTERS,
  countActiveClientFilters,
  type ClientFilters,
} from '../../components/clients/ClientsFilterButton';
import { IncompleteIcon } from '../../components/clients/IncompleteIcon';
import { isClientComplete } from '../../lib/clients/client-completeness';
import { ApiError, getClient, listClients, lookupUsersForReference } from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { useToast } from '../../lib/toast/ToastProvider';
import { formatClientDocument, formatPhone } from '../../lib/client-field-formatters';
import type {
  ClientUnitSummary,
  ClientStatus,
  ClientSummary,
  ClientPersonType,
  UserLookupItem,
} from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';
import { isCommercialRole, NON_PROSPECTOR_ROLES } from '../../lib/roles';

const CLIENT_PAGE_LIMIT = 60;
// 14.6.C: shape do nextCursor mudou (createdAt -> displayName). Snapshots
// v1 antigos no browser ficam orfaos; proximo save sobrescreve com v2.
// v3: filtros consolidados num objeto (ClientFilters) — substitui os antigos
// commercialUserFilter + showOnlyIncomplete. Snapshots v2 ficam orfaos.
const CLIENTS_SNAPSHOT_KEY = 'clients-list-snapshot-v3';
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

function readSnapshot(): ClientsSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CLIENTS_SNAPSHOT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ClientsSnapshot;
    if (
      typeof data.timestamp !== 'number' ||
      Date.now() - data.timestamp > CLIENTS_SNAPSHOT_TTL_MS
    ) {
      window.sessionStorage.removeItem(CLIENTS_SNAPSHOT_KEY);
      return null;
    }
    if (!Array.isArray(data.items)) return null;
    return data;
  } catch {
    return null;
  }
}

function saveSnapshot(snapshot: ClientsSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(CLIENTS_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // QuotaExceeded ou private mode: ignora silenciosamente.
  }
}

function clearSnapshot(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(CLIENTS_SNAPSHOT_KEY);
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

function clientDocument(client: ClientSummary | null) {
  if (!client) {
    return null;
  }
  return formatClientDocument(
    client.document ?? client.cpf ?? client.cnpj ?? null,
    client.personType
  );
}

function clientDisplayName(client: ClientSummary | null) {
  return client?.displayName ?? client?.fullName ?? client?.legalName ?? 'Cliente';
}

// Nome no cabecalho do modal de detalhe: corta em 23 caracteres (contando
// espacos) e acrescenta reticencias (tres pontos) quando excede.
const CLIENT_DETAIL_NAME_MAX_CHARS = 23;
function truncateClientDetailName(name: string) {
  if (name.length <= CLIENT_DETAIL_NAME_MAX_CHARS) {
    return name;
  }
  return `${name.slice(0, CLIENT_DETAIL_NAME_MAX_CHARS).trimEnd()}...`;
}

function clientRoleSummary(client: ClientSummary | null) {
  if (!client) {
    return 'Sem papel operacional';
  }
  // Compoe os papeis ativos (qualquer combinacao dos tres). Rotulos alinhados
  // com os badges do detalhe: Vendedor / Comprador / Armazem.
  const roles: string[] = [];
  if (client.isSeller) roles.push('Vendedor');
  if (client.isBuyer) roles.push('Comprador');
  if (client.isWarehouse) roles.push('Armazém');
  return roles.length ? roles.join(' · ') : 'Sem papel operacional';
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

function formatClientCardSummary(client: ClientSummary) {
  const document = clientDocument(client) ?? 'Documento nao informado';
  return `${document} | ${client.personType} | ${clientRoleSummary(client)}`;
}

function formatClientCardMeta(client: ClientSummary) {
  const phone = formatPhone(client.phone) ?? 'Sem telefone';
  return `Cod. ${client.code} | ${phone} | Insc. ${client.activeUnitCount}/${client.unitCount}`;
}

function clientStatusBadgeClass(status: ClientStatus) {
  return status === 'ACTIVE' ? 'status-badge-success' : 'status-badge-muted';
}

function getClientStatusThemeClass(status: ClientStatus): string {
  return status === 'ACTIVE' ? 'is-status-success' : 'is-status-danger';
}

function registrationStatusBadgeClass(status: ClientUnitSummary['status']) {
  return status === 'ACTIVE' ? 'status-badge-success' : 'status-badge-muted';
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
  selectedId: string | null;
  detail: ClientSummary | null;
  units: ClientUnitSummary[];
  // 14.7.D: agregado de lotes em aberto do cliente carregado no detail
  // modal. null enquanto loading; preenchido em detailSuccess.
  detailOpenLots: { count: number; sacks: number } | null;
  detailOpen: boolean;
  detailLoading: boolean;
  detailError: string | null;
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
  | { type: 'selectClient'; id: string | null }
  | { type: 'openDetail' }
  | { type: 'closeDetail' }
  | { type: 'fetchDetail' }
  | {
      type: 'detailSuccess';
      client: ClientSummary;
      units: ClientUnitSummary[];
      openLots: { count: number; sacks: number };
    }
  | { type: 'detailError'; message: string }
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
  selectedId: null,
  detail: null,
  units: [],
  detailOpenLots: null,
  detailOpen: false,
  detailLoading: false,
  detailError: null,
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
    case 'selectClient':
      return { ...state, selectedId: action.id };
    case 'openDetail':
      return { ...state, detailOpen: true, detailError: null };
    case 'closeDetail':
      return {
        ...state,
        detailOpen: false,
        detail: null,
        units: [],
        detailOpenLots: null,
        detailError: null,
      };
    case 'fetchDetail':
      return { ...state, detailLoading: true, detailError: null, detailOpenLots: null };
    case 'detailSuccess':
      return {
        ...state,
        detailLoading: false,
        detail: action.client,
        units: action.units,
        detailOpenLots: action.openLots,
        detailError: null,
      };
    case 'detailError':
      return { ...state, detailLoading: false, detailError: action.message };
    default:
      return state;
  }
}

export default function ClientsPageWrapper() {
  return (
    <Suspense>
      <ClientsPage />
    </Suspense>
  );
}

function ClientsPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: NON_PROSPECTOR_ROLES,
  });
  const searchParams = useSearchParams();
  const toast = useToast();

  // URL ?incomplete=true tem precedencia sobre o snapshot — quando o user
  // clica no card "Cadastros pendentes" do dashboard, a intencao explicita e
  // ver a lista filtrada (completeness=incomplete), independente do estado salvo.
  const incompleteFromUrl = searchParams.get('incomplete') === 'true';

  // 14.7.K: snapshot persistente — restaura filtros + items + scroll
  // ao retornar pra pagina dentro do TTL (10min).
  const initialSnapshotRef = useRef<ClientsSnapshot | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = readSnapshot();
  }
  const initialSnapshot = initialSnapshotRef.current;
  // Deep-link ?incomplete=true forca refetch (completeness e server-side agora):
  // pular o fetch mostraria os items restaurados sem o filtro aplicado.
  const skipInitialFetchRef = useRef<boolean>(initialSnapshot !== null && !incompleteFromUrl);
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
  const clientDetailTrapRef = useFocusTrap(clientsState.detail !== null);
  const [clientSearchInput, setClientSearchInput] = useState(
    () => initialSnapshot?.appliedClientSearch ?? ''
  );
  const [appliedClientSearch, setAppliedClientSearch] = useState(
    () => initialSnapshot?.appliedClientSearch ?? ''
  );
  const [clientQuickCreateOpen, setClientQuickCreateOpen] = useState(false);
  const clientSearchDebounceRef = useRef<number | null>(null);

  // Filtros consolidados (responsavel, status, tipo, papel, completude).
  // Semeado pelo snapshot; o deep-link ?incomplete=true sobrescreve a
  // completude pra 'incomplete'.
  const [appliedFilters, setAppliedFilters] = useState<ClientFilters>(() => {
    const base = initialSnapshot?.filters ?? EMPTY_CLIENT_FILTERS;
    return incompleteFromUrl ? { ...base, completeness: 'incomplete' } : base;
  });
  const [users, setUsers] = useState<UserLookupItem[]>([]);

  // Filtros como MODAL central (espelha /samples): rascunho local + aplicado no
  // estado da pagina. openFilters semeia o draft com o aplicado; Aplicar/Limpar
  // agem no aplicado. Substituiu o dropdown ancorado do antigo ClientsFilterButton.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ClientFilters>(appliedFilters);
  const filtersTrapRef = useFocusTrap(filtersOpen);

  const clientsScrollRef = useRef<HTMLDivElement | null>(null);
  const clientDetailCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastClientTriggerRef = useRef<HTMLButtonElement | null>(null);
  const filterCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFilterTriggerRef = useRef<HTMLButtonElement | null>(null);
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

  // 14.4.C: contagem de incompletos vem do backend (clientsState.incompleteTotal),
  // total real respeitando filtros server-side. Removido o useMemo client-side
  // que somava sobre items carregados (numero subia conforme scroll).

  // 14.6.C: backend agora paginate por cursor alfabetico (displayName ASC,
  // id ASC) — items ja vem ordenados. Sort client-side removido. A completude
  // tambem virou filtro server-side (param completeness no listClients), entao
  // nao ha mais filtro client-side: a lista exibida e a que veio do backend.
  const displayClients = clientsState.items;

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
          // 14.6.F: filtro de responsavel comercial mostra papeis comerciais
          // (COMMERCIAL + PROSPECTOR) — admin/classifier/registration nao
          // costumam ser responsaveis comerciais de cliente.
          const commercials = response.items.filter((u) => isCommercialRole(u.role));
          setUsers(commercials);
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

    // 14.7.K: snapshot restaurou state — pula o primeiro fetch. Ref e
    // consumido aqui (so vale 1 vez); proximas mudancas em filtro/sessao
    // refazem fetch normal.
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }

    const abortController = new AbortController();
    let active = true;
    dispatchClients({ type: 'fetch-initial' });
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
        dispatchClients({
          type: 'error',
          message: cause instanceof ApiError ? cause.message : 'Falha ao carregar clientes',
        });
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [appliedClientSearch, appliedFilters, session]);

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
      saveSnapshot({
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
        const snap = readSnapshot();
        if (!snap) return;
        snap.scrollTop = el?.scrollTop ?? 0;
        snap.timestamp = Date.now();
        saveSnapshot(snap);
      }, 200);
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [clientsState.items.length]);

  // Fetch client detail
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

        dispatchClients({
          type: 'detailSuccess',
          client: response.client,
          units: response.units,
          openLots: response.openLots,
        });
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }

        dispatchClients({
          type: 'detailError',
          message:
            cause instanceof ApiError ? cause.message : 'Falha ao carregar detalhes do cliente',
        });
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [clientsState.detailOpen, clientsState.selectedId, session]);

  // Detail modal keyboard handling
  useEffect(() => {
    if (!clientsState.detailOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    // snapshot da ref no momento do effect: evita acessar .current no cleanup
    const scrollContainerEl = clientsScrollRef.current;

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
          scrollContainerEl?.focus();
        }
      }, 0);
    };
  }, [clientsState.detailOpen]);

  // Filtro modal: ESC fecha, body lock, foco no X ao abrir e devolve o foco ao
  // botao de filtro ao fechar (espelha /samples).
  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeFilters();
      }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    const openFocusTimer = window.setTimeout(() => {
      filterCloseButtonRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(openFocusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        lastFilterTriggerRef.current?.focus();
      }, 0);
    };
    // closeFilters nao memoizada; dispara so quando filtersOpen muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersOpen]);

  function handleClientSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (clientSearchDebounceRef.current !== null) {
      window.clearTimeout(clientSearchDebounceRef.current);
      clientSearchDebounceRef.current = null;
    }
    const trimmed = clientSearchInput.trim();
    setAppliedClientSearch(trimmed.length >= 2 ? trimmed : '');
  }

  // ── Filtros (modal central) — handlers espelhando /samples ──
  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearSnapshot();
    setAppliedFilters(draftFilters);
    setFiltersOpen(false);
  }

  // Reusado pelo botao "Limpar" do modal E pelo botao "X" da linha de busca.
  function handleClearFiltersOnly() {
    clearSnapshot();
    setDraftFilters(EMPTY_CLIENT_FILTERS);
    setAppliedFilters(EMPTY_CLIENT_FILTERS);
  }

  function openFilters(trigger: HTMLButtonElement) {
    lastFilterTriggerRef.current = trigger;
    setDraftFilters(appliedFilters);
    setFiltersOpen(true);
  }

  function closeFilters() {
    setDraftFilters(appliedFilters);
    setFiltersOpen(false);
  }

  function openClientDetail(clientId: string, trigger: HTMLButtonElement) {
    lastClientTriggerRef.current = trigger;
    dispatchClients({ type: 'selectClient', id: clientId });
    dispatchClients({ type: 'openDetail' });
  }

  function closeClientDetail() {
    dispatchClients({ type: 'closeDetail' });
  }

  async function handleCopyField(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success({ title: `${label} copiado` });
    } catch {
      toast.error({ title: 'Não foi possível copiar' });
    }
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

  if (loading || !session) {
    return null;
  }

  const selectedClientDocument = clientDocument(clientsState.detail);

  const userFullName = session.user.fullName ?? session.user.username;
  const userAvatarInitials = userFullName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const activeFiltersCount = countActiveClientFilters(appliedFilters);
  const hasDraftFilters = countActiveClientFilters(draftFilters) > 0;

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="clients-page-v2">
        {/* Header */}
        <header className="clients-v2-header">
          <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div className="clients-v2-header-center">
            <h2 className="nsv2-title">Clientes</h2>
          </div>
          <HeaderAvatarMenu session={session} onLogout={logout} />
          <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
            <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
          </Link>
        </header>

        {/* Busca + botão "X" de limpar + botão de filtro + FAB na mesma linha
            (mobile: FAB sai do fluxo via position:fixed). has-applied-filters
            revela o "X" deslizando de trás do filtro. */}
        <div className={`hero-search-wrap${activeFiltersCount > 0 ? ' has-applied-filters' : ''}`}>
          <form className="hero-search-bar" role="search" onSubmit={handleClientSearchSubmit}>
            <input
              className="hero-search-input"
              value={clientSearchInput}
              onChange={(event) => setClientSearchInput(event.target.value)}
              placeholder="Buscar por nome ou documento..."
              autoComplete="off"
              spellCheck={false}
            />
            {/* Lupa DECORATIVA (a busca filtra ao vivo; Enter ainda submete o
                form via implicit submission). Era botão de submit com cross-fade
                pra seta verde — agora decorativa, igual /samples. */}
            {/* Ao digitar, a lupa decorativa vira um botao "x" pra limpar a
                busca de uma vez (mesmo padrao da lupa, com borda). */}
            {clientSearchInput ? (
              <button
                type="button"
                className="hero-search-clear-input"
                aria-label="Limpar busca"
                onClick={() => setClientSearchInput('')}
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
          <span className="hero-search-clear-slot" aria-hidden={activeFiltersCount === 0}>
            <button
              type="button"
              className="hero-search-clear-btn"
              aria-label="Limpar filtros"
              tabIndex={activeFiltersCount > 0 ? 0 : -1}
              onClick={handleClearFiltersOnly}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </span>
          <button
            type="button"
            className={`hero-search-filter-btn${activeFiltersCount > 0 ? ' has-filters' : ''}`}
            aria-label="Filtros"
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
            {activeFiltersCount > 0 ? (
              <span className="hero-search-filter-badge">{activeFiltersCount}</span>
            ) : null}
          </button>
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
        </div>

        {/* Sheet */}
        <section className="clients-v2-sheet">
          {/* Contador a direita (o botao de filtros migrou pra linha de busca,
             abrindo o modal central — espelha /samples). */}
          <div className="spv2-list-meta">
            <span className="spv2-list-count">{clientsState.total} clientes</span>
          </div>

          {/* Card list */}
          {clientsState.status === 'loading-initial' ? (
            <div className="spv2-list-scroll">
              <div className="spv2-empty">
                <p className="spv2-empty-text">Carregando...</p>
              </div>
            </div>
          ) : displayClients.length === 0 ? (
            <div className="spv2-list-scroll">
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
          ) : (
            <div ref={clientsScrollRef} className="spv2-list-scroll" tabIndex={-1}>
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
                    onClick={(event) => openClientDetail(client.id, event.currentTarget)}
                  >
                    {showIncomplete ? (
                      <IncompleteIcon className="cv2-card-incomplete-badge" />
                    ) : null}
                    {/* Card em 2 blocos. Topo: avatar + nome. Rodape: arrow-btn.
                        O UserAvatarStack de responsaveis comerciais foi removido
                        do card (2026-06-17, batch /clients alinhado ao /samples);
                        responsaveis seguem visiveis no detalhe/gestao do cliente. */}
                    <div className="cv2-card-head">
                      <span className="cv2-card-avatar">
                        <span>{initials}</span>
                      </span>
                      <div className="cv2-card-content">
                        <span className="cv2-card-name">{name}</span>
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
      </section>

      {/* Client detail modal */}
      {clientsState.detailOpen ? (
        <div className="app-modal-backdrop is-scrim-dark" onClick={closeClientDetail}>
          <section
            ref={clientDetailTrapRef}
            className="app-modal cdm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="records-client-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cdm-header">
              {/* 14.7.H: avatar grande do cliente a esquerda do header. Verde
                  por TIPO (PJ escuro / PF claro), igual ao avatar do card. */}
              {clientsState.detail
                ? (() => {
                    const detailName = clientDisplayName(clientsState.detail!);
                    const detailColor = getClientAvatarColor(clientsState.detail!.personType);
                    const detailInitials = getClientInitials(detailName);
                    return (
                      <span
                        className="cdm-header-avatar"
                        style={{ '--avatar-color': detailColor } as React.CSSProperties}
                      >
                        <span>{detailInitials}</span>
                      </span>
                    );
                  })()
                : null}
              <div className="cdm-header-copy">
                <h3 id="records-client-detail-title" className="cdm-header-name">
                  {clientsState.detail
                    ? truncateClientDetailName(clientDisplayName(clientsState.detail))
                    : 'Cliente'}
                </h3>
                {clientsState.detail ? (
                  <div className="cdm-header-meta">
                    <span className="cdm-header-code">Cod. {clientsState.detail.code}</span>
                    {/* 14.7.H: pill com tipo de cliente (PF/PJ) inline na meta
                        line. Nao confundir com o avatar de iniciais a
                        esquerda — esse aqui indica TIPO. */}
                    <span
                      className={`cdm-header-type ${clientsState.detail.personType === 'PF' ? 'is-pf' : 'is-pj'}`}
                      aria-label={`Tipo: ${clientsState.detail.personType === 'PF' ? 'Pessoa Fisica' : 'Pessoa Juridica'}`}
                    >
                      {clientsState.detail.personType}
                    </span>
                  </div>
                ) : null}
              </div>
              <button
                ref={clientDetailCloseButtonRef}
                type="button"
                className="app-modal-close cdm-close"
                onClick={closeClientDetail}
                aria-label="Fechar"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            {clientsState.detailLoading ? (
              <div className="cdm-loading">Carregando...</div>
            ) : clientsState.detailError ? (
              <div className="cdm-error">{clientsState.detailError}</div>
            ) : clientsState.detail ? (
              <>
                <div className="cdm-info-grid">
                  <div className="cdm-info-row">
                    <div className="cdm-info-item">
                      <span className="cdm-info-label">Documento</span>
                      <div className="cdm-info-value-row">
                        <span className="cdm-info-value">
                          {selectedClientDocument ?? 'Nao informado'}
                        </span>
                        {selectedClientDocument ? (
                          <button
                            type="button"
                            className="cdm-info-copy"
                            aria-label="Copiar documento"
                            onClick={() =>
                              void handleCopyField(selectedClientDocument, 'Documento')
                            }
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="cdm-info-item">
                      <span className="cdm-info-label">Telefone</span>
                      <div className="cdm-info-value-row">
                        <span className="cdm-info-value">
                          {formatPhone(clientsState.detail.phone) ?? 'Nao informado'}
                        </span>
                        {formatPhone(clientsState.detail.phone) ? (
                          <button
                            type="button"
                            className="cdm-info-copy"
                            aria-label="Copiar telefone"
                            onClick={() =>
                              void handleCopyField(
                                formatPhone(clientsState.detail!.phone) ?? '',
                                'Telefone'
                              )
                            }
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="cdm-info-row">
                    <div className="cdm-info-item">
                      <span className="cdm-info-label">Lotes em aberto</span>
                      <span className="cdm-info-value">
                        {clientsState.detailOpenLots
                          ? `${clientsState.detailOpenLots.count} ${clientsState.detailOpenLots.count === 1 ? 'lote' : 'lotes'} - ${clientsState.detailOpenLots.sacks} sacas`
                          : '—'}
                      </span>
                    </div>
                    <div className="cdm-info-item">
                      <span className="cdm-info-label">Papel</span>
                      <div className="cdm-roles">
                        {/* Ordem alfabetica: Armazem, Comprador, Vendedor. Com os
                            tres papeis, o grid (.cdm-roles) quebra em 2 + 1. */}
                        {clientsState.detail.isWarehouse ? (
                          <span className="cv2-card-role is-warehouse">Armazém</span>
                        ) : null}
                        {clientsState.detail.isBuyer ? (
                          <span className="cv2-card-role is-buyer">Comprador</span>
                        ) : null}
                        {clientsState.detail.isSeller ? (
                          <span className="cv2-card-role is-seller">Vendedor</span>
                        ) : null}
                        {!clientsState.detail.isBuyer &&
                        !clientsState.detail.isSeller &&
                        !clientsState.detail.isWarehouse ? (
                          <span className="cv2-card-role is-none">Sem papel</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <Link href={`/clients/${clientsState.detail.id}`} className="cdm-manage-link">
                  Gerenciar cliente
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </Link>
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {/* Filtros — MODAL central (reusa o CSS .samples-filter-modal de /samples,
          keyed por classe). Mesmos campos de clientes; rascunho + Aplicar/Limpar. */}
      {filtersOpen ? (
        <div className="app-modal-backdrop samples-filter-modal-backdrop" onClick={closeFilters}>
          <section
            ref={filtersTrapRef}
            id="clients-filter-modal"
            className="app-modal is-themed samples-filter-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clients-filter-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header samples-filter-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="clients-filter-modal-title" className="app-modal-title">
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
                <div className="samples-filter-fields">
                  <div
                    className={`samples-filter-field${draftFilters.commercialUserId ? ' is-active' : ''}`}
                  >
                    <span className="samples-filter-field-label">Responsável comercial</span>
                    <span className="samples-filter-control">
                      <select
                        className={`samples-filter-field-input${draftFilters.commercialUserId ? ' is-active' : ''}`}
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
                      {draftFilters.commercialUserId ? (
                        <span className="samples-filter-field-count" aria-hidden="true">
                          1
                        </span>
                      ) : null}
                    </span>
                  </div>

                  <div className="samples-filter-row">
                    <div
                      className={`samples-filter-field${draftFilters.status ? ' is-active' : ''}`}
                    >
                      <span className="samples-filter-field-label">Status</span>
                      <span className="samples-filter-control">
                        <select
                          className={`samples-filter-field-input${draftFilters.status ? ' is-active' : ''}`}
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
                        {draftFilters.status ? (
                          <span className="samples-filter-field-count" aria-hidden="true">
                            1
                          </span>
                        ) : null}
                      </span>
                    </div>

                    <div
                      className={`samples-filter-field${draftFilters.personType ? ' is-active' : ''}`}
                    >
                      <span className="samples-filter-field-label">Tipo</span>
                      <span className="samples-filter-control">
                        <select
                          className={`samples-filter-field-input${draftFilters.personType ? ' is-active' : ''}`}
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
                        {draftFilters.personType ? (
                          <span className="samples-filter-field-count" aria-hidden="true">
                            1
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>

                  <div className="samples-filter-row">
                    <div className={`samples-filter-field${draftFilters.role ? ' is-active' : ''}`}>
                      <span className="samples-filter-field-label">Papel</span>
                      <span className="samples-filter-control">
                        <select
                          className={`samples-filter-field-input${draftFilters.role ? ' is-active' : ''}`}
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
                        {draftFilters.role ? (
                          <span className="samples-filter-field-count" aria-hidden="true">
                            1
                          </span>
                        ) : null}
                      </span>
                    </div>

                    <div
                      className={`samples-filter-field${draftFilters.completeness ? ' is-active' : ''}`}
                    >
                      <span className="samples-filter-field-label">Completude</span>
                      <span className="samples-filter-control">
                        <select
                          className={`samples-filter-field-input${draftFilters.completeness ? ' is-active' : ''}`}
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
                        {draftFilters.completeness ? (
                          <span className="samples-filter-field-count" aria-hidden="true">
                            1
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="app-modal-actions samples-filter-modal-actions">
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={handleClearFiltersOnly}
                  disabled={!hasDraftFilters && activeFiltersCount === 0}
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
          dispatchClients({ type: 'selectClient', id: client.id });
          dispatchClients({ type: 'openDetail' });
        }}
      />
    </AppShell>
  );
}
