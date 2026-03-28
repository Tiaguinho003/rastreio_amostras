'use client';

import Link from 'next/link';
import { type FormEvent, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { ClientQuickCreateModal } from '../../components/clients/ClientQuickCreateModal';
import { ApiError, getClient, listClients } from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { formatClientDocument, formatPhone } from '../../lib/client-field-formatters';
import type { ClientRegistrationSummary, ClientStatus, ClientSummary } from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';

const CLIENT_PAGE_LIMIT = 30;

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

type ClientChipFilter = 'all' | 'buyer' | 'seller';

const CLIENT_CHIP_DEFINITIONS: ReadonlyArray<{ id: ClientChipFilter; label: string; color: string | null }> = [
  { id: 'all', label: 'Todos', color: null },
  { id: 'buyer', label: 'Comprador', color: '#2980B9' },
  { id: 'seller', label: 'Vendedor', color: '#27AE60' },
];

const AVATAR_COLORS = ['#1B5E20', '#2E7D32', '#388E3C', '#0D47A1', '#1565C0', '#4E342E', '#5D4037', '#6D4C41', '#AD1457', '#C62828', '#6A1B9A', '#4527A0', '#00695C', '#00838F', '#E65100'];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
}

function getClientInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
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
  loading: true,
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

export default function ClientsPageWrapper() {
  return (
    <Suspense>
      <ClientsPage />
    </Suspense>
  );
}

function ClientsPage() {
  const { session, loading, logout } = useRequireAuth();

  const [clientsState, dispatchClients] = useReducer(clientsListReducer, CLIENTS_INITIAL);
  const clientDetailTrapRef = useFocusTrap(clientsState.detail !== null);
  const [clientSearchInput, setClientSearchInput] = useState('');
  const [appliedClientSearch, setAppliedClientSearch] = useState('');
  const [clientQuickCreateOpen, setClientQuickCreateOpen] = useState(false);
  const clientSearchDebounceRef = useRef<number | null>(null);

  const [sortAZ, setSortAZ] = useState(true);
  const [activeClientChip, setActiveClientChip] = useState<ClientChipFilter>('all');

  const clientsScrollRef = useRef<HTMLDivElement | null>(null);
  const clientDetailCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastClientTriggerRef = useRef<HTMLButtonElement | null>(null);

  const clientChipCounts = useMemo(() => {
    const items = clientsState.items;
    const counts: Record<ClientChipFilter, number> = { all: items.length, buyer: 0, seller: 0 };
    for (const c of items) {
      if (c.isBuyer) counts.buyer++;
      if (c.isSeller) counts.seller++;
    }
    return counts;
  }, [clientsState.items]);

  const displayClients = useMemo(() => {
    const filtered = activeClientChip === 'all'
      ? clientsState.items
      : clientsState.items.filter((c) => {
          if (activeClientChip === 'buyer') return c.isBuyer;
          if (activeClientChip === 'seller') return c.isSeller;
          return true;
        });
    return [...filtered].sort((a, b) => {
      const na = clientDisplayName(a).toLowerCase();
      const nb = clientDisplayName(b).toLowerCase();
      return sortAZ ? na.localeCompare(nb) : nb.localeCompare(na);
    });
  }, [clientsState.items, activeClientChip, sortAZ]);

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
      dispatchClients({ type: 'setPage', page: 1 });
    }, 400);

    return () => {
      if (clientSearchDebounceRef.current !== null) {
        window.clearTimeout(clientSearchDebounceRef.current);
        clientSearchDebounceRef.current = null;
      }
    };
  }, [clientSearchInput, appliedClientSearch]);

  // Scroll to top on page change
  useEffect(() => {
    clientsScrollRef.current?.scrollTo({ top: 0 });
  }, [clientsState.currentPage]);

  // Fetch clients list
  useEffect(() => {
    if (!session) {
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
  }, [appliedClientSearch, clientsState.currentPage, session]);

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

  // Detail modal keyboard handling
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

  function handleClientSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (clientSearchDebounceRef.current !== null) {
      window.clearTimeout(clientSearchDebounceRef.current);
      clientSearchDebounceRef.current = null;
    }
    setAppliedClientSearch(clientSearchInput.trim());
    dispatchClients({ type: 'setPage', page: 1 });
  }

  function openClientDetail(clientId: string, trigger: HTMLButtonElement) {
    lastClientTriggerRef.current = trigger;
    dispatchClients({ type: 'selectClient', id: clientId });
    dispatchClients({ type: 'openDetail' });
  }

  function closeClientDetail() {
    dispatchClients({ type: 'closeDetail' });
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

  const userFullName = session.user.fullName ?? session.user.username;
  const userAvatarInitials = userFullName.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="clients-page-v2">
        {/* Header */}
        <header className="clients-v2-header">
          <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
          <div className="clients-v2-header-center">
            <h2 className="nsv2-title">Clientes</h2>
          </div>
          <button type="button" className="nsv2-avatar" aria-label="Abrir menu de perfil" onClick={() => window.dispatchEvent(new CustomEvent('open-profile-sheet'))}>
            <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
          </button>
        </header>

        {/* Search bar — in green area, dashboard style */}
        <div className="hero-search-wrap">
          <form className="hero-search-bar" role="search" onSubmit={handleClientSearchSubmit}>
            <svg className="hero-search-icon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m16.2 16.2 4.1 4.1" />
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
          {/* Chips */}
          <div className="spv2-chips">
            {CLIENT_CHIP_DEFINITIONS.map((chip) => {
              const isActive = activeClientChip === chip.id;
              const count = clientChipCounts[chip.id];
              return (
                <button
                  key={chip.id}
                  type="button"
                  className={`spv2-chip${isActive ? ' is-active' : ''}`}
                  style={isActive && chip.color ? { background: `${chip.color}14`, borderColor: chip.color } : undefined}
                  onClick={() => setActiveClientChip(chip.id)}
                >
                  {chip.color ? <span className="spv2-chip-dot" style={{ background: chip.color }} /> : null}
                  <span className="spv2-chip-label" style={isActive && chip.color ? { color: chip.color } : undefined}>{chip.label}</span>
                  <span className="spv2-chip-count" style={isActive && chip.color ? { background: `${chip.color}1A`, color: chip.color } : undefined}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Count + Sort */}
          <div className="spv2-list-meta">
            <span className="spv2-list-count">{displayClients.length} clientes</span>
            <button type="button" className="spv2-sort-btn" onClick={() => setSortAZ((v) => !v)}>
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h6" /></svg>
              <span>{sortAZ ? 'A–Z' : 'Z–A'}</span>
            </button>
          </div>

          {/* Card list */}
          {clientsState.loading ? (
            <div className="spv2-list-scroll">
              <div className="spv2-empty">
                <p className="spv2-empty-text">Carregando...</p>
              </div>
            </div>
          ) : displayClients.length === 0 ? (
            <div className="spv2-list-scroll">
              <div className="spv2-empty">
                <svg className="spv2-empty-icon" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 36 }}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill="none" stroke="#ddd" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="7" r="4" fill="none" stroke="#ddd" strokeWidth="1.6" />
                </svg>
                <p className="spv2-empty-text">Nenhum cliente encontrado</p>
                <p className="spv2-empty-sub">Tente outro termo de busca</p>
              </div>
            </div>
          ) : (
            <div ref={clientsScrollRef} className="spv2-list-scroll" tabIndex={-1}>
              {displayClients.map((client, i) => {
                const name = clientDisplayName(client);
                const avatarColor = getAvatarColor(name);
                const initials = getClientInitials(name);
                return (
                  <button
                    key={client.id}
                    type="button"
                    className="cv2-card"
                    style={{ animationDelay: `${i * 0.04}s` }}
                    onClick={(event) => openClientDetail(client.id, event.currentTarget)}
                  >
                    <span className="cv2-card-avatar" style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}cc)`, boxShadow: `0 2px 8px ${avatarColor}4D` }}>
                      <span>{initials}</span>
                    </span>
                    <div className="cv2-card-content">
                      <div className="cv2-card-top">
                        <span className="cv2-card-name">{name}</span>
                        <span className={`cv2-card-type ${client.personType === 'PF' ? 'is-pf' : 'is-pj'}`}>{client.personType}</span>
                      </div>
                      <div className="cv2-card-bottom">
                        {client.isBuyer ? <span className="cv2-card-role is-buyer">Comprador</span> : null}
                        {client.isSeller ? <span className="cv2-card-role is-seller">Vendedor</span> : null}
                        {!client.isBuyer && !client.isSeller ? <span className="cv2-card-role is-none">Sem papel</span> : null}
                      </div>
                    </div>
                    <svg className="spv2-card-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          <footer className="spv2-footer">
            <button type="button" className="spv2-page-btn" disabled={!clientsState.hasPrev || clientsState.loading} onClick={() => dispatchClients({ type: 'setPage', page: clientsState.currentPage - 1 })}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg>
            </button>
            <span className="spv2-page-info"><strong>{clientsState.currentPage}</strong> / {clientsState.totalPages}</span>
            <button type="button" className="spv2-page-btn" disabled={!clientsState.hasNext || clientsState.loading} onClick={() => dispatchClients({ type: 'setPage', page: clientsState.currentPage + 1 })}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" /></svg>
            </button>
          </footer>
        </section>
      </section>

      {/* FAB - Add client */}
      <button type="button" className="cv2-fab" aria-label="Cadastrar novo cliente" onClick={() => setClientQuickCreateOpen(true)}>
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
      </button>

      {/* Client detail modal */}
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
              <p className="error" style={{ margin: 0 }}>{clientsState.detailError}</p>
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
                        <span key={role} className="app-modal-chip records-client-role-chip">{role}</span>
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

                <Link href={`/clients/${clientsState.detail.id}`} className="records-client-detail-manage-link">
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
