'use client';

import Link from 'next/link';
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
import { NotificationBell } from '../../components/NotificationBell';
import { ClientQuickCreateModal } from '../../components/clients/ClientQuickCreateModal';
import { ClientUserFilterButton } from '../../components/clients/ClientUserFilterButton';
import { IncompleteIcon } from '../../components/clients/IncompleteIcon';
import { UserAvatarStack } from '../../components/users/UserAvatarStack';
import { isClientComplete } from '../../lib/clients/client-completeness';
import { ApiError, getClient, listClients, lookupUsersForReference } from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { formatClientDocument, formatPhone } from '../../lib/client-field-formatters';
import type {
  ClientUnitSummary,
  ClientStatus,
  ClientSummary,
  UserLookupItem,
} from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';

const CLIENT_PAGE_LIMIT = 60;
// 14.6.C: shape do nextCursor mudou (createdAt -> displayName). Snapshots
// v1 antigos no browser ficam orfaos; proximo save sobrescreve com v2.
const CLIENTS_SNAPSHOT_KEY = 'clients-list-snapshot-v2';
// 14.7.K: TTL 10min — snapshot expira apos esse periodo de inatividade.
const CLIENTS_SNAPSHOT_TTL_MS = 10 * 60 * 1000;

type ClientsSnapshot = {
  appliedClientSearch: string;
  commercialUserFilter: string;
  showOnlyIncomplete: boolean;
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

// brand-green / brand-green-soft / brand-green-deep (paleta Safras)
const AVATAR_COLORS = [
  '#1f5d43',
  '#2f6b4a',
  '#173c30',
  '#0D47A1',
  '#1565C0',
  '#4E342E',
  '#5D4037',
  '#6D4C41',
  '#AD1457',
  '#C62828',
  '#6A1B9A',
  '#4527A0',
  '#00695C',
  '#00838F',
  '#E65100',
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
}

function getClientInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
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

function clientStatusLabel(status: ClientStatus) {
  return status === 'ACTIVE' ? 'Ativo' : 'Inativo';
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
  const { session, loading, logout, setSession } = useRequireAuth();

  // 14.7.K: snapshot persistente — restaura filtros + items + scroll
  // ao retornar pra pagina dentro do TTL (10min).
  const initialSnapshotRef = useRef<ClientsSnapshot | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = readSnapshot();
  }
  const initialSnapshot = initialSnapshotRef.current;
  const skipInitialFetchRef = useRef<boolean>(initialSnapshot !== null);
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

  const [commercialUserFilter, setCommercialUserFilter] = useState<string>(
    () => initialSnapshot?.commercialUserFilter ?? ''
  );
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(
    () => initialSnapshot?.showOnlyIncomplete ?? false
  );
  const [users, setUsers] = useState<UserLookupItem[]>([]);

  const clientsScrollRef = useRef<HTMLDivElement | null>(null);
  const clientDetailCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastClientTriggerRef = useRef<HTMLButtonElement | null>(null);
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
  // id ASC) — items ja vem ordenados. Sort client-side removido. So aplica
  // filtro client-side de incompletos via chip.
  const displayClients = useMemo(() => {
    if (!showOnlyIncomplete) return clientsState.items;
    return clientsState.items.filter((c) => !isClientComplete(c).complete);
  }, [clientsState.items, showOnlyIncomplete]);

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

    const trimmed = clientSearchInput.trim();
    if (trimmed === appliedClientSearch) {
      return;
    }

    clientSearchDebounceRef.current = window.setTimeout(() => {
      clientSearchDebounceRef.current = null;
      setAppliedClientSearch(trimmed);
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
          // 14.6.F: filtro de responsavel comercial mostra SO usuarios com
          // role COMMERCIAL — outros papeis (admin, classifier, registration)
          // nao costumam ser responsaveis comerciais de cliente.
          const commercials = response.items.filter((u) => u.role === 'COMMERCIAL');
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
  // search ou commercialUserFilter (filtro server-side). Cursor é resetado.
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
        commercialUserId: commercialUserFilter || undefined,
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
  }, [appliedClientSearch, commercialUserFilter, session]);

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
          commercialUserId: commercialUserFilter || undefined,
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
    [session, appliedClientSearch, commercialUserFilter]
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
        commercialUserFilter,
        showOnlyIncomplete,
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
    commercialUserFilter,
    showOnlyIncomplete,
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

  function handleClientSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (clientSearchDebounceRef.current !== null) {
      window.clearTimeout(clientSearchDebounceRef.current);
      clientSearchDebounceRef.current = null;
    }
    setAppliedClientSearch(clientSearchInput.trim());
  }

  function openClientDetail(clientId: string, trigger: HTMLButtonElement) {
    lastClientTriggerRef.current = trigger;
    dispatchClients({ type: 'selectClient', id: clientId });
    dispatchClients({ type: 'openDetail' });
  }

  function closeClientDetail() {
    dispatchClients({ type: 'closeDetail' });
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
        commercialUserId: commercialUserFilter || undefined,
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
  const selectedClientRoles = [
    clientsState.detail?.isSeller ? 'Proprietario/Vendedor' : null,
    clientsState.detail?.isBuyer ? 'Comprador' : null,
  ].filter((value): value is string => Boolean(value));

  const userFullName = session.user.fullName ?? session.user.username;
  const userAvatarInitials = userFullName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

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
          <NotificationBell className="header-notification-bell" />
          <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
            <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
          </Link>
        </header>

        {/* Search bar + FAB inline a direita (desktop). No mobile o FAB
            sai do fluxo via position: fixed. */}
        <div className="hero-search-wrap">
          <form className="hero-search-bar" role="search" onSubmit={handleClientSearchSubmit}>
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
              value={clientSearchInput}
              onChange={(event) => setClientSearchInput(event.target.value)}
              placeholder="Buscar por nome ou documento..."
              autoComplete="off"
              spellCheck={false}
            />
          </form>
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
          {/* 14.6.B: filtros em uma unica linha — contador esq + chips dir
             (incompletos + responsavel via botao icone azul ancorado). */}
          <div className="spv2-list-meta">
            <span className="spv2-list-count">{clientsState.total} clientes</span>
            <div className="spv2-list-meta-actions">
              <button
                type="button"
                className={`cv2-filter-incomplete-chip${showOnlyIncomplete ? ' is-active' : ''}`}
                onClick={() => setShowOnlyIncomplete((v) => !v)}
                aria-pressed={showOnlyIncomplete}
                aria-label={`Filtrar somente clientes incompletos (${clientsState.incompleteTotal})`}
                title={
                  showOnlyIncomplete
                    ? `Mostrando ${clientsState.incompleteTotal} incompleto(s). Clique para ver todos.`
                    : `${clientsState.incompleteTotal} cadastro(s) incompleto(s). Clique para filtrar.`
                }
              >
                <IncompleteIcon className="cv2-filter-incomplete-icon" />
                <span className="cv2-filter-incomplete-count">{clientsState.incompleteTotal}</span>
              </button>
              <ClientUserFilterButton
                users={users}
                selectedUserId={commercialUserFilter}
                onChange={setCommercialUserFilter}
              />
            </div>
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
            <div
              ref={clientsScrollRef}
              className={`spv2-list-scroll${clientsState.status === 'loading-more' ? ' is-loading-more' : ''}`}
              tabIndex={-1}
            >
              {groupedDisplay.map((node) => {
                if (node.kind === 'divider') {
                  return (
                    <div
                      key={`div-${node.letter}`}
                      className="cv2-section-divider"
                      aria-hidden="true"
                    >
                      <span className="cv2-section-divider-letter">{node.letter}</span>
                      <span className="cv2-section-divider-line" />
                    </div>
                  );
                }
                const { client, index: i } = node;
                const name = clientDisplayName(client);
                const avatarColor = getAvatarColor(name);
                const initials = getClientInitials(name);
                const incomplete = !isClientComplete(client).complete;
                return (
                  <button
                    key={client.id}
                    type="button"
                    className={`cv2-card${incomplete ? ' is-incomplete' : ''}`}
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
                    {incomplete ? <IncompleteIcon className="cv2-card-incomplete-badge" /> : null}
                    {/* 14.6.E: card em 2 blocos. Topo: avatar + nome + meta
                        (type pill + responsaveis). Rodape: indicador de tipo
                        de pessoa + arrow-btn. */}
                    <div className="cv2-card-head">
                      <span className="cv2-card-avatar">
                        <span>{initials}</span>
                      </span>
                      <div className="cv2-card-content">
                        <span className="cv2-card-name">{name}</span>
                        <div className="cv2-card-meta">
                          {/* 14.6.G: pill PJ/PF removido — info redundante com
                              "Pessoa Juridica/Fisica" no rodape. So fica o
                              UserAvatarStack sozinho. */}
                          {client.commercialUsers && client.commercialUsers.length > 0 ? (
                            <UserAvatarStack users={client.commercialUsers} size="sm" />
                          ) : null}
                        </div>
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
              {/* 14.6.D: sentinel + spinner. Quando loading-more, scroll trava
                  via classe is-loading-more no parent (CSS overflow:hidden) e
                  spinner anima centrado abaixo dos cards. */}
              {clientsState.nextCursor ? (
                <div ref={loadMoreRef} className="cv2-load-more-sentinel">
                  {clientsState.status === 'loading-more' ? (
                    <>
                      <span
                        className="cv2-load-more-spinner"
                        aria-hidden="true"
                        role="presentation"
                      />
                      <span className="cv2-load-more-text">
                        Carregando proximos {CLIENT_PAGE_LIMIT}...
                      </span>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </section>

      {/* Client detail modal */}
      {clientsState.detailOpen ? (
        <div className="app-modal-backdrop" onClick={closeClientDetail}>
          <section
            ref={clientDetailTrapRef}
            className="app-modal cdm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="records-client-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cdm-header">
              {/* 14.7.H: avatar grande do cliente volta a esquerda do header
                  (com iniciais por hash do nome). */}
              {clientsState.detail
                ? (() => {
                    const detailName = clientDisplayName(clientsState.detail!);
                    const detailColor = getAvatarColor(detailName);
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
                  {clientsState.detail ? clientDisplayName(clientsState.detail) : 'Cliente'}
                </h3>
                {clientsState.detail ? (
                  <div className="cdm-header-meta">
                    <span className="cdm-header-code">Cod. {clientsState.detail.code}</span>
                    <span
                      className={`cdm-header-status ${clientsState.detail.status === 'ACTIVE' ? 'is-active' : 'is-inactive'}`}
                    >
                      {clientStatusLabel(clientsState.detail.status)}
                    </span>
                    {/* 14.7.H: pill com tipo de cliente (PF/PJ) inline ao
                        lado de "Ativo". Nao confundir com o avatar de
                        iniciais a esquerda — esse aqui indica TIPO. */}
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
                      <span className="cdm-info-value">
                        {selectedClientDocument ?? 'Nao informado'}
                      </span>
                    </div>
                    <div className="cdm-info-item">
                      <span className="cdm-info-label">Telefone</span>
                      <span className="cdm-info-value">
                        {formatPhone(clientsState.detail.phone) ?? 'Nao informado'}
                      </span>
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
                        {clientsState.detail.isBuyer ? (
                          <span className="cv2-card-role is-buyer">Comprador</span>
                        ) : null}
                        {clientsState.detail.isSeller ? (
                          <span className="cv2-card-role is-seller">Vendedor</span>
                        ) : null}
                        {!clientsState.detail.isBuyer && !clientsState.detail.isSeller ? (
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
