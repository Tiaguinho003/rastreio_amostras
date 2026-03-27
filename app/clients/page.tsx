'use client';

import Link from 'next/link';
import { type FormEvent, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react';

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

  const clientsScrollRef = useRef<HTMLDivElement | null>(null);
  const clientDetailCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastClientTriggerRef = useRef<HTMLButtonElement | null>(null);

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

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="panel stack samples-page-panel">
        <header className="row samples-page-header-row">
          <div className="samples-page-header-main">
            <h2 className="samples-page-title">Clientes</h2>
          </div>
        </header>

        <div className="samples-page-toolbar">
          {/* Search form - always client search */}
          <form className="sample-search samples-page-search-bar" role="search" onSubmit={handleClientSearchSubmit}>
            <div className="sample-search-field samples-page-search-field">
              <input
                value={clientSearchInput}
                onChange={(event) => setClientSearchInput(event.target.value)}
                placeholder="Nome, documento ou codigo"
                autoComplete="off"
                spellCheck={false}
                aria-label="Pesquisar clientes"
              />
              <button type="submit" className="samples-page-search-submit-icon" aria-label="Buscar clientes">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.2 16.2 4.1 4.1" />
                </svg>
              </button>
            </div>
          </form>

          <button
            type="button"
            className="samples-page-create-client-button"
            aria-label="Cadastrar novo cliente"
            onClick={() => setClientQuickCreateOpen(true)}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>

        {clientsState.error ? <p className="error">{clientsState.error}</p> : null}

        {/* Client list - 3 states: loading, empty, list */}
        {clientsState.loading ? (
          <section className="samples-page-list-area">
            <header className="samples-page-list-header">
              <p className="samples-page-list-total">{clientsState.total} clientes</p>
            </header>
            <div className="samples-page-list-state">
              <p className="samples-page-empty">Carregando clientes...</p>
            </div>
          </section>
        ) : clientsState.items.length === 0 ? (
          <section className="samples-page-list-area">
            <header className="samples-page-list-header">
              <p className="samples-page-list-total">{clientsState.total} clientes</p>
            </header>
            <div className="samples-page-list-state">
              <p className="samples-page-empty">
                {appliedClientSearch ? 'Nenhum cliente encontrado para a pesquisa aplicada.' : 'Nenhum cliente cadastrado.'}
              </p>
            </div>
          </section>
        ) : (
          <section className="samples-page-list-area">
            <header className="samples-page-list-header">
              <p className="samples-page-list-total">{clientsState.total} clientes</p>
            </header>
            <div ref={clientsScrollRef} className="samples-page-list-scroll" aria-label="Lista de clientes cadastrados" tabIndex={-1}>
              <div className="samples-page-list">
                {clientsState.items.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    className={`samples-page-item records-client-card ${getClientStatusThemeClass(client.status)}`}
                    onClick={(event) => openClientDetail(client.id, event.currentTarget)}
                  >
                    <div className="samples-page-item-main">
                      <p className="dashboard-latest-registration-title">{clientDisplayName(client)}</p>
                      <p className="dashboard-latest-registration-subtitle">{formatClientCardSummary(client)}</p>
                      <p className="dashboard-latest-registration-meta">{formatClientCardMeta(client)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Pagination - always clients */}
        <footer className="samples-page-footer">
          <div className="samples-page-pagination-controls" role="group" aria-label="Paginacao da lista">
            <button
              type="button"
              className="samples-page-pagination-button"
              aria-label="Pagina anterior"
              disabled={!clientsState.hasPrev || clientsState.loading}
              onClick={() => dispatchClients({ type: 'setPage', page: clientsState.currentPage - 1 })}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="m14.5 6-6 6 6 6" />
              </svg>
              <span className="login-visually-hidden">Anterior</span>
            </button>
            <p className="samples-page-pagination-counter">
              <strong>{clientsState.currentPage}</strong>
              <span>/</span>
              <span>{clientsState.totalPages}</span>
            </p>
            <button
              type="button"
              className="samples-page-pagination-button"
              aria-label="Proxima pagina"
              disabled={!clientsState.hasNext || clientsState.loading}
              onClick={() => dispatchClients({ type: 'setPage', page: clientsState.currentPage + 1 })}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="m9.5 6 6 6-6 6" />
              </svg>
              <span className="login-visually-hidden">Proximo</span>
            </button>
          </div>
        </footer>
      </section>

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
