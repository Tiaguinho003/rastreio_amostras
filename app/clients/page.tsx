'use client';

import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import {
  ApiError,
  createClient,
  createClientRegistration,
  getClient,
  inactivateClient,
  inactivateClientRegistration,
  listClientAuditEvents,
  listClients,
  reactivateClient,
  reactivateClientRegistration,
  updateClient,
  updateClientRegistration
} from '../../lib/api-client';
import {
  formatClientDocument,
  maskCpfInput,
  maskCnpjInput,
  maskPhoneInput
} from '../../lib/client-field-formatters';
import { useRequireAuth } from '../../lib/use-auth';
import type {
  ClientAuditEventResponse,
  ClientPersonType,
  ClientRegistrationSummary,
  ClientStatus,
  ClientSummary
} from '../../lib/types';

const PERSON_TYPE_OPTIONS: ClientPersonType[] = ['PJ', 'PF'];
const STATUS_OPTIONS: Array<ClientStatus | ''> = ['', 'ACTIVE', 'INACTIVE'];

function blankClientForm(personType: ClientPersonType = 'PJ') {
  return {
    personType,
    fullName: '',
    legalName: '',
    tradeName: '',
    cpf: '',
    cnpj: '',
    phone: '',
    isBuyer: false,
    isSeller: true,
    reasonText: ''
  };
}

function clientSummaryToForm(client: ClientSummary) {
  return {
    personType: client.personType,
    fullName: client.fullName ?? '',
    legalName: client.legalName ?? '',
    tradeName: client.tradeName ?? '',
    cpf: maskCpfInput(client.cpf ?? ''),
    cnpj: maskCnpjInput(client.cnpj ?? ''),
    phone: maskPhoneInput(client.phone ?? ''),
    isBuyer: client.isBuyer,
    isSeller: client.isSeller,
    reasonText: ''
  };
}

function blankRegistrationForm() {
  return {
    registrationNumber: '',
    registrationType: '',
    addressLine: '',
    district: '',
    city: '',
    state: 'MG',
    postalCode: '',
    complement: '',
    reasonText: ''
  };
}

function clientDocument(client: ClientSummary | null) {
  if (!client) {
    return null;
  }

  return formatClientDocument(client.document ?? client.cpf ?? client.cnpj ?? null, client.personType);
}

function clientDisplayName(client: ClientSummary | null) {
  return client?.displayName ?? client?.fullName ?? client?.legalName ?? 'Cliente';
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Nao informado';
  }

  return new Date(value).toLocaleDateString('pt-BR');
}

function formatAuditEventType(eventType: string): string {
  const labels: Record<string, string> = {
    'CLIENT_CREATED': 'Cliente criado',
    'CLIENT_UPDATED': 'Cliente atualizado',
    'CLIENT_INACTIVATED': 'Cliente inativado',
    'CLIENT_REACTIVATED': 'Cliente reativado',
    'REGISTRATION_CREATED': 'Inscricao criada',
    'REGISTRATION_UPDATED': 'Inscricao atualizada',
    'REGISTRATION_INACTIVATED': 'Inscricao inativada',
    'REGISTRATION_REACTIVATED': 'Inscricao reativada'
  };
  return labels[eventType] ?? eventType;
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
  const searchParams = useSearchParams();
  const initialClientIdRef = useRef(searchParams.get('clientId'));
  const [items, setItems] = useState<ClientSummary[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClientIdRef.current);
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null);
  const [registrations, setRegistrations] = useState<ClientRegistrationSummary[]>([]);
  const [auditItems, setAuditItems] = useState<ClientAuditEventResponse[]>([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStatus | ''>('');
  const [personTypeFilter, setPersonTypeFilter] = useState<ClientPersonType | ''>('');
  const [isBuyerFilter, setIsBuyerFilter] = useState<'all' | 'true' | 'false'>('all');
  const [isSellerFilter, setIsSellerFilter] = useState<'all' | 'true' | 'false'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [mode, setMode] = useState<'create' | 'edit'>('edit');
  const [clientForm, setClientForm] = useState(blankClientForm());
  const [registrationForm, setRegistrationForm] = useState(blankRegistrationForm());
  const [registrationMode, setRegistrationMode] = useState<'create' | 'edit'>('create');
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [savingRegistration, setSavingRegistration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canSaveClient = useMemo(() => {
    if (!clientForm.isBuyer && !clientForm.isSeller) {
      return false;
    }

    if (clientForm.personType === 'PF') {
      return clientForm.fullName.trim().length > 0 && clientForm.cpf.trim().length > 0;
    }

    return clientForm.legalName.trim().length > 0 && clientForm.cnpj.trim().length > 0;
  }, [clientForm]);

  const canSaveRegistration = useMemo(
    () =>
      registrationForm.registrationNumber.trim().length > 0 &&
      registrationForm.registrationType.trim().length > 0 &&
      registrationForm.addressLine.trim().length > 0 &&
      registrationForm.district.trim().length > 0 &&
      registrationForm.city.trim().length > 0 &&
      registrationForm.state.trim().length > 0 &&
      registrationForm.postalCode.trim().length > 0,
    [registrationForm]
  );

  useEffect(() => {
    if (!session) {
      return;
    }

    const abortController = new AbortController();
    let active = true;
    setLoadingList(true);
    setError(null);

    listClients(session, {
      search: appliedSearch || undefined,
      status: statusFilter || undefined,
      personType: personTypeFilter || undefined,
      isBuyer: isBuyerFilter === 'all' ? undefined : isBuyerFilter === 'true',
      isSeller: isSellerFilter === 'all' ? undefined : isSellerFilter === 'true',
      page,
      limit: 10
    }, { signal: abortController.signal })
      .then((response) => {
        if (!active) {
          return;
        }

        setItems(response.items);
        setTotalPages(response.page.totalPages);

        if (mode === 'edit' && !selectedClientId && response.items[0]) {
          setSelectedClientId(response.items[0].id);
        }

        if (mode === 'edit' && selectedClientId && !response.items.some((item) => item.id === selectedClientId)) {
          setSelectedClientId(response.items[0]?.id ?? null);
        }
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }

        setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar clientes');
      })
      .finally(() => {
        if (active) {
          setLoadingList(false);
        }
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [appliedSearch, isBuyerFilter, isSellerFilter, mode, page, personTypeFilter, selectedClientId, session, statusFilter]);

  useEffect(() => {
    if (!session || mode !== 'edit' || !selectedClientId) {
      return;
    }

    const abortController = new AbortController();
    let active = true;
    setLoadingDetail(true);
    setError(null);

    Promise.all([
      getClient(session, selectedClientId, { signal: abortController.signal }),
      listClientAuditEvents(session, selectedClientId, {
        page: auditPage,
        limit: 10
      }, { signal: abortController.signal })
    ])
      .then(([detailResponse, auditResponse]) => {
        if (!active) {
          return;
        }

        setSelectedClient(detailResponse.client);
        setRegistrations(detailResponse.registrations);
        setClientForm(clientSummaryToForm(detailResponse.client));
        setAuditItems(auditResponse.items);
        setAuditTotalPages(auditResponse.page.totalPages);
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }

        setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar detalhes do cliente');
      })
      .finally(() => {
        if (active) {
          setLoadingDetail(false);
        }
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [auditPage, mode, selectedClientId, session]);

  if (loading || !session) {
    return null;
  }

  const authSession = session;

  function openCreateMode() {
    setMode('create');
    setAuditPage(1);
    setSelectedClientId(null);
    setSelectedClient(null);
    setRegistrations([]);
    setAuditItems([]);
    setClientForm(blankClientForm());
    setRegistrationForm(blankRegistrationForm());
    setRegistrationMode('create');
    setSelectedRegistrationId(null);
    setError(null);
    setMessage(null);
  }

  function openEditMode(clientId: string) {
    setMode('edit');
    setAuditPage(1);
    setSelectedClientId(clientId);
    setRegistrationMode('create');
    setSelectedRegistrationId(null);
    setRegistrationForm(blankRegistrationForm());
    setError(null);
    setMessage(null);
  }

  async function refreshList() {
    const response = await listClients(authSession, {
      search: appliedSearch || undefined,
      status: statusFilter || undefined,
      personType: personTypeFilter || undefined,
      isBuyer: isBuyerFilter === 'all' ? undefined : isBuyerFilter === 'true',
      isSeller: isSellerFilter === 'all' ? undefined : isSellerFilter === 'true',
      page,
      limit: 10
    });

    setItems(response.items);
    setTotalPages(response.page.totalPages);
  }

  async function refreshDetail(clientId: string) {
    const [detailResponse, auditResponse] = await Promise.all([
      getClient(authSession, clientId),
      listClientAuditEvents(authSession, clientId, {
        page: auditPage,
        limit: 10
      })
    ]);

    setSelectedClient(detailResponse.client);
    setRegistrations(detailResponse.registrations);
    setAuditItems(auditResponse.items);
    setAuditTotalPages(auditResponse.page.totalPages);
    setClientForm(clientSummaryToForm(detailResponse.client));
  }

  async function handleClientSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSaveClient) {
      setError('Preencha os campos obrigatorios do cliente.');
      return;
    }

    if (mode === 'edit' && !selectedClientId) {
      setError('Selecione um cliente para editar.');
      return;
    }

    if (mode === 'edit' && clientForm.reasonText.trim().length === 0) {
      setError('Informe o motivo da edicao do cliente.');
      return;
    }

    setSavingClient(true);
    setError(null);
    setMessage(null);

    try {
      let nextClientId = selectedClientId;

      if (mode === 'create') {
        const created = await createClient(authSession, {
          personType: clientForm.personType,
          fullName: clientForm.personType === 'PF' ? clientForm.fullName : undefined,
          legalName: clientForm.personType === 'PJ' ? clientForm.legalName : undefined,
          tradeName: clientForm.personType === 'PJ' ? clientForm.tradeName || null : undefined,
          cpf: clientForm.personType === 'PF' ? clientForm.cpf : undefined,
          cnpj: clientForm.personType === 'PJ' ? clientForm.cnpj : undefined,
          phone: clientForm.phone || null,
          isBuyer: clientForm.isBuyer,
          isSeller: clientForm.isSeller
        });

        setMessage('Cliente cadastrado com sucesso.');
        setMode('edit');
        setAuditPage(1);
        setSelectedClientId(created.client.id);
        nextClientId = created.client.id;
      } else if (selectedClientId) {
        await updateClient(authSession, selectedClientId, {
          personType: clientForm.personType,
          fullName: clientForm.personType === 'PF' ? clientForm.fullName : undefined,
          legalName: clientForm.personType === 'PJ' ? clientForm.legalName : undefined,
          tradeName: clientForm.personType === 'PJ' ? clientForm.tradeName || null : undefined,
          cpf: clientForm.personType === 'PF' ? clientForm.cpf : undefined,
          cnpj: clientForm.personType === 'PJ' ? clientForm.cnpj : undefined,
          phone: clientForm.phone || null,
          isBuyer: clientForm.isBuyer,
          isSeller: clientForm.isSeller,
          reasonText: clientForm.reasonText
        });

        setMessage('Cliente atualizado com sucesso.');
        nextClientId = selectedClientId;
      }

      await refreshList();
      if (nextClientId) {
        await refreshDetail(nextClientId);
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao salvar cliente');
    } finally {
      setSavingClient(false);
    }
  }

  async function handleToggleClientStatus(nextAction: 'inactivate' | 'reactivate') {
    if (!selectedClientId || !selectedClient) {
      return;
    }

    const reasonText = window.prompt(
      nextAction === 'inactivate' ? 'Informe o motivo da inativacao:' : 'Informe o motivo da reativacao:'
    );

    if (!reasonText) {
      return;
    }

    setSavingClient(true);
    setError(null);
    setMessage(null);

    try {
      if (nextAction === 'inactivate') {
        await inactivateClient(authSession, selectedClientId, reasonText);
        setMessage('Cliente inativado.');
      } else {
        await reactivateClient(authSession, selectedClientId, reasonText);
        setMessage('Cliente reativado.');
      }

      await Promise.all([refreshList(), refreshDetail(selectedClientId)]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar status do cliente');
    } finally {
      setSavingClient(false);
    }
  }

  function startRegistrationCreate() {
    setRegistrationMode('create');
    setSelectedRegistrationId(null);
    setRegistrationForm(blankRegistrationForm());
    setError(null);
    setMessage(null);
  }

  function startRegistrationEdit(registration: ClientRegistrationSummary) {
    setRegistrationMode('edit');
    setSelectedRegistrationId(registration.id);
    setRegistrationForm({
      registrationNumber: registration.registrationNumber,
      registrationType: registration.registrationType,
      addressLine: registration.addressLine,
      district: registration.district,
      city: registration.city,
      state: registration.state,
      postalCode: registration.postalCode,
      complement: registration.complement ?? '',
      reasonText: ''
    });
    setError(null);
    setMessage(null);
  }

  async function handleRegistrationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClientId) {
      setError('Selecione um cliente antes de salvar inscricoes.');
      return;
    }

    if (!canSaveRegistration) {
      setError('Preencha todos os campos obrigatorios da inscricao.');
      return;
    }

    if (registrationMode === 'edit' && registrationForm.reasonText.trim().length === 0) {
      setError('Informe o motivo da edicao da inscricao.');
      return;
    }

    setSavingRegistration(true);
    setError(null);
    setMessage(null);

    try {
      if (registrationMode === 'create') {
        await createClientRegistration(authSession, selectedClientId, {
          registrationNumber: registrationForm.registrationNumber,
          registrationType: registrationForm.registrationType,
          addressLine: registrationForm.addressLine,
          district: registrationForm.district,
          city: registrationForm.city,
          state: registrationForm.state,
          postalCode: registrationForm.postalCode,
          complement: registrationForm.complement || null
        });
        setMessage('Inscricao criada com sucesso.');
      } else if (selectedRegistrationId) {
        await updateClientRegistration(authSession, selectedClientId, selectedRegistrationId, {
          registrationNumber: registrationForm.registrationNumber,
          registrationType: registrationForm.registrationType,
          addressLine: registrationForm.addressLine,
          district: registrationForm.district,
          city: registrationForm.city,
          state: registrationForm.state,
          postalCode: registrationForm.postalCode,
          complement: registrationForm.complement || null,
          reasonText: registrationForm.reasonText
        });
        setMessage('Inscricao atualizada com sucesso.');
      }

      setRegistrationMode('create');
      setSelectedRegistrationId(null);
      setRegistrationForm(blankRegistrationForm());
      await refreshDetail(selectedClientId);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao salvar inscricao');
    } finally {
      setSavingRegistration(false);
    }
  }

  async function handleToggleRegistrationStatus(registration: ClientRegistrationSummary, nextAction: 'inactivate' | 'reactivate') {
    if (!selectedClientId) {
      return;
    }

    const reasonText = window.prompt(
      nextAction === 'inactivate' ? 'Informe o motivo da inativacao da inscricao:' : 'Informe o motivo da reativacao da inscricao:'
    );

    if (!reasonText) {
      return;
    }

    setSavingRegistration(true);
    setError(null);
    setMessage(null);

    try {
      if (nextAction === 'inactivate') {
        await inactivateClientRegistration(authSession, selectedClientId, registration.id, reasonText);
        setMessage('Inscricao inativada.');
      } else {
        await reactivateClientRegistration(authSession, selectedClientId, registration.id, reasonText);
        setMessage('Inscricao reativada.');
      }

      await refreshDetail(selectedClientId);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar status da inscricao');
    } finally {
      setSavingRegistration(false);
    }
  }

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="clients-page-shell">
        <header className="clients-page-header">
          <h2 className="clients-page-title">Clientes</h2>
          <button type="button" className="clients-page-create-btn" onClick={openCreateMode}>
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Novo cliente
          </button>
        </header>

        <div className="notice-slot">
          {error ? <p className="notice-slot-text is-error">{error}</p> : null}
          {message ? <p className="notice-slot-text is-success">{message}</p> : null}
        </div>

        <section className="clients-page-layout">
          <aside className="panel stack clients-list-panel">
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                setAppliedSearch(search.trim());
                setPage(1);
              }}
            >
              <label>
                Buscar
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, documento ou codigo" />
              </label>

              <div className="clients-filters-grid">
                <label>
                  Status
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ClientStatus | '')}>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status || 'all'} value={status}>
                        {status ? status : 'Todos'}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Tipo
                  <select
                    value={personTypeFilter}
                    onChange={(event) => setPersonTypeFilter(event.target.value as ClientPersonType | '')}
                  >
                    <option value="">Todos</option>
                    {PERSON_TYPE_OPTIONS.map((personType) => (
                      <option key={personType} value={personType}>
                        {personType}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Comprador
                  <select value={isBuyerFilter} onChange={(event) => setIsBuyerFilter(event.target.value as 'all' | 'true' | 'false')}>
                    <option value="all">Todos</option>
                    <option value="true">Sim</option>
                    <option value="false">Nao</option>
                  </select>
                </label>

                <label>
                  Vendedor
                  <select
                    value={isSellerFilter}
                    onChange={(event) => setIsSellerFilter(event.target.value as 'all' | 'true' | 'false')}
                  >
                    <option value="all">Todos</option>
                    <option value="true">Sim</option>
                    <option value="false">Nao</option>
                  </select>
                </label>
              </div>

              <div className="row">
                <button type="submit">Aplicar</button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setSearch('');
                    setAppliedSearch('');
                    setStatusFilter('');
                    setPersonTypeFilter('');
                    setIsBuyerFilter('all');
                    setIsSellerFilter('all');
                    setPage(1);
                  }}
                >
                  Limpar
                </button>
              </div>
            </form>

            {loadingList ? (
              <p style={{ margin: 0, color: 'var(--muted)' }}>Carregando clientes...</p>
            ) : items.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted)' }}>Nenhum cliente encontrado.</p>
            ) : (
              <div className="clients-list">
                {items.map((client) => {
                  const active = mode === 'edit' && selectedClientId === client.id;
                  return (
                    <button
                      key={client.id}
                      type="button"
                      className={`clients-list-item${active ? ' is-active' : ''}`}
                      onClick={() => openEditMode(client.id)}
                    >
                      <strong>{clientDisplayName(client)}</strong>
                      <span>Codigo {client.code} · {client.personType}</span>
                      <span>{clientDocument(client) ?? 'Documento nao informado'}</span>
                      <span>
                        {client.isSeller ? 'Vendedor' : ''}
                        {client.isSeller && client.isBuyer ? ' · ' : ''}
                        {client.isBuyer ? 'Comprador' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Anterior
              </button>
              <span style={{ color: 'var(--muted)' }}>
                Pagina {page} de {totalPages}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Proxima
              </button>
            </div>
          </aside>

          <section className="stack clients-detail-column">
            <article className="panel stack">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{mode === 'create' ? 'Novo cliente' : clientDisplayName(selectedClient)}</h3>
                  {mode === 'edit' && selectedClient ? (
                    <p className="clients-page-subtitle" style={{ marginBottom: 0 }}>
                      Codigo {selectedClient.code} · {selectedClient.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                    </p>
                  ) : null}
                </div>

                {mode === 'edit' && selectedClient ? (
                  <div className="row">
                    {selectedClient.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        className="secondary"
                        disabled={savingClient}
                        onClick={() => void handleToggleClientStatus('inactivate')}
                      >
                        Inativar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        disabled={savingClient}
                        onClick={() => void handleToggleClientStatus('reactivate')}
                      >
                        Reativar
                      </button>
                    )}
                  </div>
                ) : null}
              </div>

              <form className="stack" onSubmit={handleClientSubmit}>
                <div className="grid grid-2">
                  <label>
                    Tipo de pessoa
                    <select
                      value={clientForm.personType}
                      onChange={(event) => {
                        const nextType = event.target.value as ClientPersonType;
                        setClientForm((current) => ({
                          ...current,
                          personType: nextType,
                          fullName: nextType === 'PF' ? current.fullName : '',
                          legalName: nextType === 'PJ' ? current.legalName : '',
                          tradeName: nextType === 'PJ' ? current.tradeName : '',
                          cpf: nextType === 'PF' ? current.cpf : '',
                          cnpj: nextType === 'PJ' ? current.cnpj : ''
                        }));
                      }}
                      disabled={savingClient}
                    >
                      <option value="PJ">Pessoa juridica</option>
                      <option value="PF">Pessoa fisica</option>
                    </select>
                  </label>

                  <label>
                    Telefone
                    <input
                      value={clientForm.phone}
                      onChange={(event) => setClientForm((current) => ({ ...current, phone: maskPhoneInput(event.target.value) }))}
                      disabled={savingClient}
                      placeholder="(xx)xxxx-xxxx ou (xx)xxxxx-xxxx"
                    />
                  </label>

                  {clientForm.personType === 'PF' ? (
                    <>
                      <label>
                        Nome completo
                        <input
                          value={clientForm.fullName}
                          onChange={(event) => setClientForm((current) => ({ ...current, fullName: event.target.value }))}
                          disabled={savingClient}
                        />
                      </label>
                      <label>
                        CPF
                        <input
                          value={clientForm.cpf}
                          onChange={(event) => setClientForm((current) => ({ ...current, cpf: maskCpfInput(event.target.value) }))}
                          disabled={savingClient}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Razao social
                        <input
                          value={clientForm.legalName}
                          onChange={(event) => setClientForm((current) => ({ ...current, legalName: event.target.value }))}
                          disabled={savingClient}
                        />
                      </label>
                      <label>
                        Nome fantasia
                        <input
                          value={clientForm.tradeName}
                          onChange={(event) => setClientForm((current) => ({ ...current, tradeName: event.target.value }))}
                          disabled={savingClient}
                        />
                      </label>
                      <label>
                        CNPJ
                        <input
                          value={clientForm.cnpj}
                          onChange={(event) => setClientForm((current) => ({ ...current, cnpj: maskCnpjInput(event.target.value) }))}
                          disabled={savingClient}
                        />
                      </label>
                    </>
                  )}
                </div>

                <div className="row">
                  <label className="clients-checkbox">
                    <input
                      type="checkbox"
                      checked={clientForm.isSeller}
                      disabled={savingClient}
                      onChange={(event) => setClientForm((current) => ({ ...current, isSeller: event.target.checked }))}
                    />
                    Proprietario / vendedor
                  </label>
                  <label className="clients-checkbox">
                    <input
                      type="checkbox"
                      checked={clientForm.isBuyer}
                      disabled={savingClient}
                      onChange={(event) => setClientForm((current) => ({ ...current, isBuyer: event.target.checked }))}
                    />
                    Comprador
                  </label>
                </div>

                {mode === 'edit' ? (
                  <label>
                    Motivo da edicao
                    <input
                      value={clientForm.reasonText}
                      onChange={(event) => setClientForm((current) => ({ ...current, reasonText: event.target.value }))}
                      placeholder="Obrigatorio para salvar alteracoes"
                      disabled={savingClient}
                    />
                  </label>
                ) : null}

                <div className="row">
                  <button type="submit" disabled={savingClient || !canSaveClient}>
                    {savingClient ? 'Salvando...' : mode === 'create' ? 'Cadastrar cliente' : 'Salvar alteracoes'}
                  </button>
                  {mode === 'create' ? (
                    <button type="button" className="secondary" onClick={() => items[0] && openEditMode(items[0].id)}>
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </form>
            </article>

            <article className="panel stack">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Inscricoes</h3>
                {mode === 'edit' ? (
                  <button type="button" className="secondary" onClick={startRegistrationCreate}>
                    Nova inscricao
                  </button>
                ) : null}
              </div>

              {mode !== 'edit' || !selectedClient ? (
                <p style={{ margin: 0, color: 'var(--muted)' }}>Cadastre ou selecione um cliente para gerenciar inscricoes.</p>
              ) : (
                <>
                  <div className="clients-registration-list">
                    {registrations.length === 0 ? (
                      <p style={{ margin: 0, color: 'var(--muted)' }}>Nenhuma inscricao cadastrada.</p>
                    ) : (
                      registrations.map((registration) => (
                        <div className="clients-registration-item" key={registration.id}>
                          <div>
                            <strong>{registration.registrationNumber}</strong>
                            <p style={{ margin: '0.2rem 0 0', color: 'var(--muted)' }}>
                              {registration.registrationType} · {registration.city}/{registration.state}
                            </p>
                          </div>
                          <div className="row">
                            <button type="button" className="secondary" onClick={() => startRegistrationEdit(registration)}>
                              Editar
                            </button>
                            {registration.status === 'ACTIVE' ? (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => void handleToggleRegistrationStatus(registration, 'inactivate')}
                              >
                                Inativar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => void handleToggleRegistrationStatus(registration, 'reactivate')}
                              >
                                Reativar
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <form className="stack" onSubmit={handleRegistrationSubmit}>
                    <h4 style={{ margin: 0 }}>{registrationMode === 'create' ? 'Cadastrar inscricao' : 'Editar inscricao'}</h4>

                    <div className="grid grid-2">
                      <label>
                        Numero da inscricao
                        <input
                          value={registrationForm.registrationNumber}
                          onChange={(event) =>
                            setRegistrationForm((current) => ({ ...current, registrationNumber: event.target.value }))
                          }
                          disabled={savingRegistration}
                        />
                      </label>

                      <label>
                        Tipo
                        <input
                          value={registrationForm.registrationType}
                          onChange={(event) =>
                            setRegistrationForm((current) => ({ ...current, registrationType: event.target.value }))
                          }
                          disabled={savingRegistration}
                        />
                      </label>

                      <label>
                        Endereco
                        <input
                          value={registrationForm.addressLine}
                          onChange={(event) =>
                            setRegistrationForm((current) => ({ ...current, addressLine: event.target.value }))
                          }
                          disabled={savingRegistration}
                        />
                      </label>

                      <label>
                        Bairro
                        <input
                          value={registrationForm.district}
                          onChange={(event) =>
                            setRegistrationForm((current) => ({ ...current, district: event.target.value }))
                          }
                          disabled={savingRegistration}
                        />
                      </label>

                      <label>
                        Cidade
                        <input
                          value={registrationForm.city}
                          onChange={(event) => setRegistrationForm((current) => ({ ...current, city: event.target.value }))}
                          disabled={savingRegistration}
                        />
                      </label>

                      <label>
                        UF
                        <input
                          value={registrationForm.state}
                          maxLength={2}
                          onChange={(event) =>
                            setRegistrationForm((current) => ({ ...current, state: event.target.value.toUpperCase() }))
                          }
                          disabled={savingRegistration}
                        />
                      </label>

                      <label>
                        CEP
                        <input
                          value={registrationForm.postalCode}
                          onChange={(event) =>
                            setRegistrationForm((current) => ({ ...current, postalCode: event.target.value }))
                          }
                          disabled={savingRegistration}
                        />
                      </label>

                      <label>
                        Complemento
                        <input
                          value={registrationForm.complement}
                          onChange={(event) =>
                            setRegistrationForm((current) => ({ ...current, complement: event.target.value }))
                          }
                          disabled={savingRegistration}
                        />
                      </label>
                    </div>

                    {registrationMode === 'edit' ? (
                      <label>
                        Motivo da edicao
                        <input
                          value={registrationForm.reasonText}
                          onChange={(event) =>
                            setRegistrationForm((current) => ({ ...current, reasonText: event.target.value }))
                          }
                          disabled={savingRegistration}
                        />
                      </label>
                    ) : null}

                    <div className="row">
                      <button type="submit" disabled={savingRegistration || !canSaveRegistration}>
                        {savingRegistration ? 'Salvando...' : registrationMode === 'create' ? 'Cadastrar inscricao' : 'Salvar inscricao'}
                      </button>
                      {registrationMode === 'edit' ? (
                        <button type="button" className="secondary" disabled={savingRegistration} onClick={startRegistrationCreate}>
                          Cancelar edicao
                        </button>
                      ) : null}
                    </div>
                  </form>
                </>
              )}
            </article>

            <article className="panel stack">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Auditoria</h3>
                {mode === 'edit' && selectedClient ? (
                  <span style={{ color: 'var(--muted)' }}>{clientDisplayName(selectedClient)}</span>
                ) : null}
              </div>

              {mode !== 'edit' || !selectedClient ? (
                <p style={{ margin: 0, color: 'var(--muted)' }}>A auditoria aparece quando um cliente esta selecionado.</p>
              ) : loadingDetail ? (
                <p style={{ margin: 0, color: 'var(--muted)' }}>Carregando auditoria...</p>
              ) : auditItems.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--muted)' }}>Nenhum evento de auditoria registrado.</p>
              ) : (
                <>
                  <div className="clients-audit-list">
                    {auditItems.map((item) => (
                      <article className="clients-audit-item" key={item.eventId}>
                        <div className="clients-audit-item-head">
                          <strong>{formatAuditEventType(item.eventType)}</strong>
                          <span>{formatDateTime(item.createdAt)}</span>
                        </div>
                        <p style={{ margin: 0, color: 'var(--muted)' }}>
                          {item.actorUser ? `${item.actorUser.fullName} · ${item.actorUser.username}` : 'Sistema'}
                        </p>
                        {item.targetRegistration ? (
                          <p style={{ margin: 0, color: 'var(--muted)' }}>
                            Inscricao: {item.targetRegistration.registrationNumber} · {item.targetRegistration.status}
                          </p>
                        ) : null}
                        {item.reasonText ? <p style={{ margin: 0 }}>Motivo: {item.reasonText}</p> : null}
                      </article>
                    ))}
                  </div>

                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <button
                      type="button"
                      className="secondary"
                      disabled={auditPage <= 1}
                      onClick={() => setAuditPage((current) => current - 1)}
                    >
                      Anterior
                    </button>
                    <span style={{ color: 'var(--muted)' }}>
                      Pagina {auditPage} de {auditTotalPages}
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      disabled={auditPage >= auditTotalPages}
                      onClick={() => setAuditPage((current) => current + 1)}
                    >
                      Proxima
                    </button>
                  </div>
                </>
              )}
            </article>
          </section>
        </section>
      </section>
    </AppShell>
  );
}
