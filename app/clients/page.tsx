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
const CLIENTS_SNAPSHOT_KEY = 'clients-list-snapshot-v1';
const CLIENTS_SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const CLIENT_LOAD_MORE_ROOT_MARGIN = '200px';

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

type ClientCursor = { createdAt: string; id: string };
type ClientsListStatus = 'loading-initial' | 'loading-more' | 'idle' | 'error';

interface ClientsListState {
  items: ClientSummary[];
  total: number;
  incompleteTotal: number;
  nextCursor: ClientCursor | null;
  status: ClientsListStatus;
  error: string | null;
  selectedId: string | null;
  detail: ClientSummary | null;
  units: ClientUnitSummary[];
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
  | { type: 'detailSuccess'; client: ClientSummary; units: ClientUnitSummary[] }
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
  selectedId: null,
  detail: null,
  units: [],
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
      };
    case 'success-more':
      return {
        ...state,
        items: [...state.items, ...action.items],
        incompleteTotal: action.incompleteTotal,
        nextCursor: action.nextCursor,
        status: 'idle',
        error: null,
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
      };
    case 'error':
      return { ...state, status: 'error', error: action.message };
    case 'selectClient':
      return { ...state, selectedId: action.id };
    case 'openDetail':
      return { ...state, detailOpen: true, detailError: null };
    case 'closeDetail':
      return { ...state, detailOpen: false, detail: null, units: [], detailError: null };
    case 'fetchDetail':
      return { ...state, detailLoading: true, detailError: null };
    case 'detailSuccess':
      return {
        ...state,
        detailLoading: false,
        detail: action.client,
        units: action.units,
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

  const [clientsState, dispatchClients] = useReducer(clientsListReducer, CLIENTS_INITIAL);
  const clientDetailTrapRef = useFocusTrap(clientsState.detail !== null);
  const [clientSearchInput, setClientSearchInput] = useState('');
  const [appliedClientSearch, setAppliedClientSearch] = useState('');
  const [clientQuickCreateOpen, setClientQuickCreateOpen] = useState(false);
  const clientSearchDebounceRef = useRef<number | null>(null);

  const [commercialUserFilter, setCommercialUserFilter] = useState<string>('');
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(false);
  const [users, setUsers] = useState<UserLookupItem[]>([]);

  const clientsScrollRef = useRef<HTMLDivElement | null>(null);
  const clientDetailCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastClientTriggerRef = useRef<HTMLButtonElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadMoreStateRef = useRef<{ inFlight: boolean; token: number }>({
    inFlight: false,
    token: 0,
  });

  // 14.4.C: contagem de incompletos vem do backend (clientsState.incompleteTotal),
  // total real respeitando filtros server-side. Removido o useMemo client-side
  // que somava sobre items carregados (numero subia conforme scroll).

  // 14.4.B: ordenacao FIXA em alfabetico (toggle "Mais recentes" removido).
  // Filtro client-side: chip '⚠️ N' (incompletos).
  const displayClients = useMemo(() => {
    let filtered = clientsState.items;
    if (showOnlyIncomplete) {
      filtered = filtered.filter((c) => !isClientComplete(c).complete);
    }
    return [...filtered].sort((a, b) => {
      const na = clientDisplayName(a).toLowerCase();
      const nb = clientDisplayName(b).toLowerCase();
      return na.localeCompare(nb);
    });
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
  // search ou commercialUserFilter (filtro server-side). Cursor é resetado.
  useEffect(() => {
    if (!session) {
      return;
    }

    const abortController = new AbortController();
    let active = true;
    dispatchClients({ type: 'fetch-initial' });
    loadMoreStateRef.current.token += 1;
    loadMoreStateRef.current.inFlight = false;

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
      dispatchClients({ type: 'fetch-more' });

      listClients(session, {
        search: appliedClientSearch || undefined,
        commercialUserId: commercialUserFilter || undefined,
        limit: CLIENT_PAGE_LIMIT,
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      })
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
          dispatchClients({
            type: 'error',
            message: cause instanceof ApiError ? cause.message : 'Falha ao carregar mais',
          });
        })
        .finally(() => {
          if (loadMoreStateRef.current.token === myToken) {
            loadMoreStateRef.current.inFlight = false;
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
          <button
            type="button"
            className="nsv2-avatar"
            aria-label="Abrir menu de perfil"
            onClick={() => window.dispatchEvent(new CustomEvent('open-profile-sheet'))}
          >
            <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
          </button>
        </header>

        {/* Search bar — in green area, dashboard style */}
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
                        // 14.4.B fix: clamp delay para nao deixar cards distantes
                        // invisiveis por segundos (com 150 entries, i*0.04 chegava
                        // a 6s e travava cards em opacity: 0).
                        animationDelay: `${Math.min(i, 25) * 0.03}s`,
                        '--avatar-color': avatarColor,
                      } as React.CSSProperties
                    }
                    onClick={(event) => openClientDetail(client.id, event.currentTarget)}
                  >
                    {incomplete ? <IncompleteIcon className="cv2-card-incomplete-badge" /> : null}
                    <span className="cv2-card-avatar">
                      <span>{initials}</span>
                    </span>
                    <div className="cv2-card-content">
                      <div className="cv2-card-top">
                        <span className="cv2-card-name">{name}</span>
                        <span
                          className={`cv2-card-type ${client.personType === 'PF' ? 'is-pf' : 'is-pj'}`}
                        >
                          {client.personType}
                        </span>
                      </div>
                      <div className="cv2-card-bottom">
                        {client.commercialUsers && client.commercialUsers.length > 0 ? (
                          <UserAvatarStack users={client.commercialUsers} size="sm" />
                        ) : null}
                      </div>
                    </div>
                    <svg className="spv2-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                );
              })}
              {/* 14.4.A: sentinel para IntersectionObserver carregar próximos. */}
              {clientsState.nextCursor ? (
                <div ref={loadMoreRef} className="cv2-load-more-sentinel" aria-hidden="true">
                  {clientsState.status === 'loading-more' ? <span>Carregando…</span> : null}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </section>

      {/* FAB - Add client */}
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
                      <span className="cdm-info-label">Tipo</span>
                      <span
                        className={`cdm-type-badge ${clientsState.detail.personType === 'PF' ? 'is-pf' : 'is-pj'}`}
                      >
                        {clientsState.detail.personType === 'PF'
                          ? 'Pessoa Fisica'
                          : 'Pessoa Juridica'}
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
