'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../../components/AppShell';
import {
  ApiError,
  getClient,
  getClientImpact,
  updateClient,
  inactivateClient,
  reactivateClient,
  createClientRegistration,
  updateClientRegistration,
  inactivateClientRegistration,
  reactivateClientRegistration
} from '../../../lib/api-client';
import {
  formatClientDocument,
  formatPhone,
  maskCpfInput,
  maskCnpjInput,
  maskPhoneInput
} from '../../../lib/client-field-formatters';
import { useFocusTrap } from '../../../lib/use-focus-trap';
import { useRequireAuth } from '../../../lib/use-auth';
import type { ClientPersonType, ClientRegistrationSummary, ClientSummary } from '../../../lib/types';

/* ------------------------------------------------------------------ */
/*  Local types & helpers                                             */
/* ------------------------------------------------------------------ */

type Notice = { kind: 'error' | 'success'; text: string } | null;

function NoticeSlot({ notice }: { notice: Notice }) {
  return (
    <div className="notice-slot" aria-live="polite">
      {notice ? <p className={`notice-slot-text is-${notice.kind}`}>{notice.text}</p> : null}
    </div>
  );
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

function registrationToForm(reg: ClientRegistrationSummary) {
  return {
    registrationNumber: reg.registrationNumber,
    registrationType: reg.registrationType,
    addressLine: reg.addressLine,
    district: reg.district,
    city: reg.city,
    state: reg.state,
    postalCode: reg.postalCode,
    complement: reg.complement ?? '',
    reasonText: ''
  };
}

function getStatusTone(status: string): string {
  return status === 'ACTIVE' ? 'success' : 'danger';
}

function getStatusLabel(status: string): string {
  return status === 'ACTIVE' ? 'Ativo' : 'Inativo';
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export default function ClientDetailPage() {
  /* ---- auth & params ---- */
  const { session, loading, logout } = useRequireAuth();
  const params = useParams<{ clientId: string }>();
  const clientId = typeof params.clientId === 'string' ? params.clientId : '';

  /* ---- data ---- */
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [registrations, setRegistrations] = useState<ClientRegistrationSummary[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);

  /* ---- notices (6 zones) ---- */
  const [pageNotice, setPageNotice] = useState<Notice>(null);
  const [detailNotice, setDetailNotice] = useState<Notice>(null);
  const [registrationNotice, setRegistrationNotice] = useState<Notice>(null);
  const [editClientModalNotice, setEditClientModalNotice] = useState<Notice>(null);
  const [registrationModalNotice, setRegistrationModalNotice] = useState<Notice>(null);
  const [statusModalNotice, setStatusModalNotice] = useState<Notice>(null);
  const [regStatusNotice, setRegStatusNotice] = useState<Notice>(null);

  /* ---- edit client modal ---- */
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editClientForm, setEditClientForm] = useState(() =>
    clientSummaryToForm({
      personType: 'PJ',
      fullName: null,
      legalName: null,
      tradeName: null,
      cpf: null,
      cnpj: null,
      phone: null,
      isBuyer: false,
      isSeller: true,
      status: 'ACTIVE'
    } as unknown as ClientSummary)
  );
  const [savingClient, setSavingClient] = useState(false);
  const editClientTrapRef = useFocusTrap(editClientOpen);

  /* ---- registration modal (create + edit) ---- */
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [regModalMode, setRegModalMode] = useState<'create' | 'edit'>('create');
  const [regForm, setRegForm] = useState(blankRegistrationForm());
  const [selectedRegId, setSelectedRegId] = useState<string | null>(null);
  const [savingReg, setSavingReg] = useState(false);
  const regTrapRef = useFocusTrap(regModalOpen);

  /* ---- status modal (inactivate/reactivate client) ---- */
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<'inactivate' | 'reactivate'>('inactivate');
  const [statusReasonText, setStatusReasonText] = useState('');
  const [statusImpact, setStatusImpact] = useState<{
    ownedSamples: number;
    activeMovements: number;
    activeRegistrations: number;
  } | null>(null);
  const [statusImpactLoading, setStatusImpactLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const statusTrapRef = useFocusTrap(statusModalOpen);

  /* ---- registration status modal (inactivate/reactivate registration) ---- */
  const [regStatusModalOpen, setRegStatusModalOpen] = useState(false);
  const [regStatusAction, setRegStatusAction] = useState<'inactivate' | 'reactivate'>('inactivate');
  const [regStatusRegId, setRegStatusRegId] = useState<string | null>(null);
  const [regStatusReasonText, setRegStatusReasonText] = useState('');
  const [savingRegStatus, setSavingRegStatus] = useState(false);
  const regStatusTrapRef = useFocusTrap(regStatusModalOpen);

  /* ---- refs ---- */
  const fetchAbortRef = useRef<AbortController | null>(null);

  /* ================================================================ */
  /*  Data fetching                                                   */
  /* ================================================================ */

  const fetchData = useCallback(
    async (showLoading = false) => {
      if (!session || !clientId) return;
      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      if (showLoading) setLoadingPage(true);

      try {
        const response = await getClient(session, clientId, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setClient(response.client);
        setRegistrations(response.registrations);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setPageNotice({
          kind: 'error',
          text: cause instanceof ApiError ? cause.message : 'Falha ao carregar cliente.'
        });
      } finally {
        if (!controller.signal.aborted) setLoadingPage(false);
      }
    },
    [session, clientId]
  );

  useEffect(() => {
    void fetchData(true);
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [fetchData]);

  /* ================================================================ */
  /*  Validation                                                      */
  /* ================================================================ */

  const canSaveClient = useMemo(() => {
    if (!editClientForm.isBuyer && !editClientForm.isSeller) return false;
    if (editClientForm.personType === 'PF')
      return editClientForm.fullName.trim().length > 0 && editClientForm.cpf.trim().length > 0;
    return editClientForm.legalName.trim().length > 0 && editClientForm.cnpj.trim().length > 0;
  }, [editClientForm]);

  const canSaveReg = useMemo(
    () =>
      regForm.registrationNumber.trim().length > 0 &&
      regForm.registrationType.trim().length > 0 &&
      regForm.addressLine.trim().length > 0 &&
      regForm.district.trim().length > 0 &&
      regForm.city.trim().length > 0 &&
      regForm.state.trim().length > 0 &&
      regForm.postalCode.trim().length > 0,
    [regForm]
  );

  /* ================================================================ */
  /*  Edit client handlers                                            */
  /* ================================================================ */

  function openEditClient() {
    if (!client) return;
    setEditClientForm(clientSummaryToForm(client));
    setEditClientModalNotice(null);
    setEditClientOpen(true);
  }

  function closeEditClient() {
    if (savingClient) return;
    setEditClientOpen(false);
  }

  async function handleUpdateClient(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !clientId || !canSaveClient) return;
    setSavingClient(true);
    setEditClientModalNotice(null);

    try {
      const data: Parameters<typeof updateClient>[2] = {
        personType: editClientForm.personType,
        isBuyer: editClientForm.isBuyer,
        isSeller: editClientForm.isSeller,
        reasonText: editClientForm.reasonText
      };

      if (editClientForm.personType === 'PF') {
        data.fullName = editClientForm.fullName;
        data.cpf = editClientForm.cpf.replace(/\D/g, '');
      } else {
        data.legalName = editClientForm.legalName;
        data.tradeName = editClientForm.tradeName || null;
        data.cnpj = editClientForm.cnpj.replace(/\D/g, '');
      }

      if (editClientForm.phone.replace(/\D/g, '').length > 0) {
        data.phone = editClientForm.phone.replace(/\D/g, '');
      } else {
        data.phone = null;
      }

      await updateClient(session, clientId, data);
      setEditClientOpen(false);
      setDetailNotice({ kind: 'success', text: 'Cliente atualizado com sucesso.' });
      void fetchData();
    } catch (cause) {
      setEditClientModalNotice({
        kind: 'error',
        text: cause instanceof ApiError ? cause.message : 'Falha ao atualizar cliente.'
      });
    } finally {
      setSavingClient(false);
    }
  }

  /* ================================================================ */
  /*  Registration CRUD handlers                                      */
  /* ================================================================ */

  function openRegCreate() {
    setRegModalMode('create');
    setRegForm(blankRegistrationForm());
    setSelectedRegId(null);
    setRegistrationModalNotice(null);
    setRegModalOpen(true);
  }

  function openRegEdit(reg: ClientRegistrationSummary) {
    setRegModalMode('edit');
    setRegForm(registrationToForm(reg));
    setSelectedRegId(reg.id);
    setRegistrationModalNotice(null);
    setRegModalOpen(true);
  }

  function closeRegModal() {
    if (savingReg) return;
    setRegModalOpen(false);
  }

  async function handleRegSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !clientId || !canSaveReg) return;
    setSavingReg(true);
    setRegistrationModalNotice(null);

    try {
      const payload = {
        registrationNumber: regForm.registrationNumber,
        registrationType: regForm.registrationType,
        addressLine: regForm.addressLine,
        district: regForm.district,
        city: regForm.city,
        state: regForm.state,
        postalCode: regForm.postalCode,
        complement: regForm.complement || null
      };

      if (regModalMode === 'create') {
        await createClientRegistration(session, clientId, payload);
        setRegistrationNotice({ kind: 'success', text: 'Inscricao cadastrada com sucesso.' });
      } else {
        if (!selectedRegId) return;
        await updateClientRegistration(session, clientId, selectedRegId, {
          ...payload,
          reasonText: regForm.reasonText
        });
        setRegistrationNotice({ kind: 'success', text: 'Inscricao atualizada com sucesso.' });
      }

      setRegModalOpen(false);
      void fetchData();
    } catch (cause) {
      setRegistrationModalNotice({
        kind: 'error',
        text: cause instanceof ApiError ? cause.message : 'Falha ao salvar inscricao.'
      });
    } finally {
      setSavingReg(false);
    }
  }

  /* ================================================================ */
  /*  Client status handlers                                          */
  /* ================================================================ */

  function openStatusModal(action: 'inactivate' | 'reactivate') {
    setStatusAction(action);
    setStatusReasonText('');
    setStatusModalNotice(null);
    setStatusImpact(null);
    setStatusModalOpen(true);

    if (action === 'inactivate' && session) {
      setStatusImpactLoading(true);
      getClientImpact(session, clientId)
        .then((result) => {
          setStatusImpact(result.usage);
        })
        .catch((cause) => {
          setStatusModalNotice({
            kind: 'error',
            text: cause instanceof ApiError ? cause.message : 'Falha ao verificar impacto.'
          });
        })
        .finally(() => {
          setStatusImpactLoading(false);
        });
    }
  }

  function closeStatusModal() {
    if (savingStatus) return;
    setStatusModalOpen(false);
  }

  async function handleStatusSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !clientId || statusReasonText.trim().length === 0) return;
    setSavingStatus(true);
    setStatusModalNotice(null);

    try {
      if (statusAction === 'inactivate') {
        await inactivateClient(session, clientId, statusReasonText);
        setDetailNotice({ kind: 'success', text: 'Cliente inativado com sucesso.' });
      } else {
        await reactivateClient(session, clientId, statusReasonText);
        setDetailNotice({ kind: 'success', text: 'Cliente reativado com sucesso.' });
      }

      setStatusModalOpen(false);
      void fetchData();
    } catch (cause) {
      setStatusModalNotice({
        kind: 'error',
        text: cause instanceof ApiError ? cause.message : 'Falha ao alterar status do cliente.'
      });
    } finally {
      setSavingStatus(false);
    }
  }

  /* ================================================================ */
  /*  Registration status handlers                                    */
  /* ================================================================ */

  function openRegStatusModal(reg: ClientRegistrationSummary, action: 'inactivate' | 'reactivate') {
    setRegStatusRegId(reg.id);
    setRegStatusAction(action);
    setRegStatusReasonText('');
    setRegStatusNotice(null);
    setRegStatusModalOpen(true);
  }

  function closeRegStatusModal() {
    if (savingRegStatus) return;
    setRegStatusModalOpen(false);
  }

  async function handleRegStatusSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !clientId || !regStatusRegId || regStatusReasonText.trim().length === 0) return;
    setSavingRegStatus(true);
    setRegStatusNotice(null);

    try {
      if (regStatusAction === 'inactivate') {
        await inactivateClientRegistration(session, clientId, regStatusRegId, regStatusReasonText);
        setRegistrationNotice({ kind: 'success', text: 'Inscricao inativada com sucesso.' });
      } else {
        await reactivateClientRegistration(session, clientId, regStatusRegId, regStatusReasonText);
        setRegistrationNotice({ kind: 'success', text: 'Inscricao reativada com sucesso.' });
      }

      setRegStatusModalOpen(false);
      void fetchData();
    } catch (cause) {
      setRegStatusNotice({
        kind: 'error',
        text: cause instanceof ApiError ? cause.message : 'Falha ao alterar status da inscricao.'
      });
    } finally {
      setSavingRegStatus(false);
    }
  }

  /* ================================================================ */
  /*  Guard: loading / unauthenticated                                */
  /* ================================================================ */

  if (loading || !session) return null;

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="client-detail-page">
        {loadingPage ? (
          <p style={{ margin: 0, color: 'var(--muted)' }}>Carregando cliente...</p>
        ) : null}

        {!loadingPage && client ? (
          <div className="stack client-detail-page-shell">
            {/* ========== TOP BAR ========== */}
            <div className="client-detail-top-bar">
              <Link
                href="/samples"
                className="sample-detail-back-button"
                aria-label="Voltar"
                title="Voltar"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </Link>

              <section className="client-detail-hero-panel">
                <div className="client-detail-hero-main">
                  <span
                    className={`client-detail-hero-status-line is-${getStatusTone(client.status)}`}
                    aria-hidden="true"
                  />
                  <div className="client-detail-hero-text">
                    <h2 style={{ margin: 0 }}>{client.displayName ?? 'Cliente'}</h2>
                    <p style={{ margin: 0 }}>
                      Codigo {client.code} · {getStatusLabel(client.status)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className={`client-detail-hero-action ${client.status === 'ACTIVE' ? 'is-danger' : 'is-reactivate'}`}
                  onClick={() =>
                    openStatusModal(client.status === 'ACTIVE' ? 'inactivate' : 'reactivate')
                  }
                  aria-label={
                    client.status === 'ACTIVE' ? 'Inativar cliente' : 'Reativar cliente'
                  }
                  title={client.status === 'ACTIVE' ? 'Inativar cliente' : 'Reativar cliente'}
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    {client.status === 'ACTIVE' ? (
                      <>
                        <circle cx="12" cy="12" r="8" />
                        <path d="m8.6 15.4 6.8-6.8" />
                      </>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="8" />
                        <path d="m9 12 2 2 4-4" />
                      </>
                    )}
                  </svg>
                </button>
              </section>
            </div>

            <NoticeSlot notice={pageNotice} />

            {/* ========== CLIENT INFO SECTION ========== */}
            <section className="panel stack client-detail-info-section">
              <div className="client-detail-section-header">
                <h3 style={{ margin: 0 }}>Informacoes do cliente</h3>
                <button
                  type="button"
                  className="secondary client-detail-inline-action"
                  onClick={openEditClient}
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                  </svg>
                  Editar
                </button>
              </div>

              <div className="client-detail-info-grid">
                <div className="client-detail-info-item">
                  <span className="client-detail-info-label">Tipo</span>
                  <span className="client-detail-info-value">
                    {client.personType === 'PF' ? 'Pessoa fisica' : 'Pessoa juridica'}
                  </span>
                </div>

                {client.personType === 'PF' ? (
                  <>
                    <div className="client-detail-info-item">
                      <span className="client-detail-info-label">Nome completo</span>
                      <span className="client-detail-info-value">
                        {client.fullName || '\u2014'}
                      </span>
                    </div>
                    <div className="client-detail-info-item">
                      <span className="client-detail-info-label">CPF</span>
                      <span className="client-detail-info-value">
                        {formatClientDocument(client.cpf, 'PF') || '\u2014'}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="client-detail-info-item">
                      <span className="client-detail-info-label">Razao social</span>
                      <span className="client-detail-info-value">
                        {client.legalName || '\u2014'}
                      </span>
                    </div>
                    <div className="client-detail-info-item">
                      <span className="client-detail-info-label">Nome fantasia</span>
                      <span className="client-detail-info-value">
                        {client.tradeName || '\u2014'}
                      </span>
                    </div>
                    <div className="client-detail-info-item">
                      <span className="client-detail-info-label">CNPJ</span>
                      <span className="client-detail-info-value">
                        {formatClientDocument(client.cnpj, 'PJ') || '\u2014'}
                      </span>
                    </div>
                  </>
                )}

                <div className="client-detail-info-item">
                  <span className="client-detail-info-label">Telefone</span>
                  <span className="client-detail-info-value">
                    {formatPhone(client.phone) || '\u2014'}
                  </span>
                </div>

                <div className="client-detail-info-item">
                  <span className="client-detail-info-label">Papeis</span>
                  <div className="client-detail-roles">
                    {client.isSeller ? (
                      <span className="client-detail-role-chip">Proprietario/Vendedor</span>
                    ) : null}
                    {client.isBuyer ? (
                      <span className="client-detail-role-chip">Comprador</span>
                    ) : null}
                    {!client.isSeller && !client.isBuyer ? (
                      <span className="client-detail-role-chip is-empty">Nenhum papel</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <NoticeSlot notice={detailNotice} />
            </section>

            {/* ========== REGISTRATIONS SECTION ========== */}
            <section className="panel stack client-detail-registrations-section">
              <div className="client-detail-section-header">
                <h3 style={{ margin: 0 }}>Inscricoes ({registrations.length})</h3>
                <button
                  type="button"
                  className="secondary client-detail-inline-action"
                  onClick={openRegCreate}
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  Nova
                </button>
              </div>

              {registrations.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--muted)', textAlign: 'center' }}>
                  Nenhuma inscricao cadastrada.
                </p>
              ) : (
                <div className="client-detail-registration-list">
                  {registrations.map((reg) => (
                    <article
                      key={reg.id}
                      className={`client-detail-registration-card${reg.status === 'INACTIVE' ? ' is-inactive' : ''}`}
                    >
                      <div className="client-detail-registration-card-head">
                        <div className="client-detail-registration-card-info">
                          <strong>{reg.registrationNumber}</strong>
                          <p
                            style={{ margin: 0, color: 'var(--muted)', fontSize: '0.78rem' }}
                          >
                            {reg.registrationType} · {reg.city}/{reg.state}
                          </p>
                        </div>
                        <span
                          className={`client-detail-reg-status-badge is-${reg.status === 'ACTIVE' ? 'active' : 'inactive'}`}
                        >
                          {reg.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>
                      <div className="client-detail-registration-card-actions">
                        <button
                          type="button"
                          className="secondary client-detail-card-btn"
                          onClick={() => openRegEdit(reg)}
                          disabled={savingReg}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={`secondary client-detail-card-btn${reg.status === 'ACTIVE' ? ' is-danger' : ''}`}
                          onClick={() =>
                            openRegStatusModal(
                              reg,
                              reg.status === 'ACTIVE' ? 'inactivate' : 'reactivate'
                            )
                          }
                          disabled={savingRegStatus}
                        >
                          {reg.status === 'ACTIVE' ? 'Inativar' : 'Reativar'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <NoticeSlot notice={registrationNotice} />
            </section>
          </div>
        ) : null}

        {!loadingPage && !client ? <NoticeSlot notice={pageNotice} /> : null}
      </section>

      {/* ========== MODAL 1: Edit Client ========== */}
      {editClientOpen ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            if (!savingClient) closeEditClient();
          }}
        >
          <section
            ref={editClientTrapRef}
            className="app-modal client-detail-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-client-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="edit-client-title" className="app-modal-title">
                  Editar cliente
                </h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={closeEditClient}
                disabled={savingClient}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <form className="app-modal-content" onSubmit={handleUpdateClient}>
              <label className="app-modal-field">
                <span className="app-modal-label">Tipo de pessoa</span>
                <select
                  className="app-modal-input"
                  value={editClientForm.personType}
                  disabled={savingClient}
                  onChange={(e) =>
                    setEditClientForm((c) => ({
                      ...c,
                      personType: e.target.value as ClientPersonType
                    }))
                  }
                >
                  <option value="PJ">Pessoa juridica</option>
                  <option value="PF">Pessoa fisica</option>
                </select>
              </label>

              {editClientForm.personType === 'PF' ? (
                <>
                  <label className="app-modal-field">
                    <span className="app-modal-label">Nome completo</span>
                    <input
                      className="app-modal-input"
                      value={editClientForm.fullName}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({ ...c, fullName: e.target.value }))
                      }
                    />
                  </label>
                  <label className="app-modal-field">
                    <span className="app-modal-label">CPF</span>
                    <input
                      className="app-modal-input"
                      value={editClientForm.cpf}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({ ...c, cpf: maskCpfInput(e.target.value) }))
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="app-modal-field">
                    <span className="app-modal-label">Razao social</span>
                    <input
                      className="app-modal-input"
                      value={editClientForm.legalName}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({ ...c, legalName: e.target.value }))
                      }
                    />
                  </label>
                  <label className="app-modal-field">
                    <span className="app-modal-label">Nome fantasia</span>
                    <input
                      className="app-modal-input"
                      value={editClientForm.tradeName}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({ ...c, tradeName: e.target.value }))
                      }
                    />
                  </label>
                  <label className="app-modal-field">
                    <span className="app-modal-label">CNPJ</span>
                    <input
                      className="app-modal-input"
                      value={editClientForm.cnpj}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({
                          ...c,
                          cnpj: maskCnpjInput(e.target.value)
                        }))
                      }
                    />
                  </label>
                </>
              )}

              <label className="app-modal-field">
                <span className="app-modal-label">Telefone</span>
                <input
                  className="app-modal-input"
                  value={editClientForm.phone}
                  disabled={savingClient}
                  onChange={(e) =>
                    setEditClientForm((c) => ({
                      ...c,
                      phone: maskPhoneInput(e.target.value)
                    }))
                  }
                  placeholder="(xx)xxxxx-xxxx"
                />
              </label>

              <div className="client-detail-modal-flags">
                <label className="client-detail-modal-flag">
                  <input
                    type="checkbox"
                    checked={editClientForm.isSeller}
                    disabled={savingClient}
                    onChange={(e) =>
                      setEditClientForm((c) => ({ ...c, isSeller: e.target.checked }))
                    }
                  />
                  Proprietario/Vendedor
                </label>
                <label className="client-detail-modal-flag">
                  <input
                    type="checkbox"
                    checked={editClientForm.isBuyer}
                    disabled={savingClient}
                    onChange={(e) =>
                      setEditClientForm((c) => ({ ...c, isBuyer: e.target.checked }))
                    }
                  />
                  Comprador
                </label>
              </div>

              <label className="app-modal-field">
                <span className="app-modal-label">Motivo da edicao (opcional)</span>
                <input
                  className="app-modal-input"
                  value={editClientForm.reasonText}
                  disabled={savingClient}
                  onChange={(e) =>
                    setEditClientForm((c) => ({ ...c, reasonText: e.target.value }))
                  }
                  placeholder="Opcional"
                />
              </label>

              <NoticeSlot notice={editClientModalNotice} />

              <div className="app-modal-actions">
                <button
                  type="submit"
                  className="app-modal-submit"
                  disabled={savingClient || !canSaveClient}
                >
                  {savingClient ? 'Salvando...' : 'Salvar alteracoes'}
                </button>
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={closeEditClient}
                  disabled={savingClient}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {/* ========== MODAL 2: Create/Edit Registration ========== */}
      {regModalOpen ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            if (!savingReg) closeRegModal();
          }}
        >
          <section
            ref={regTrapRef}
            className="app-modal client-detail-reg-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reg-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="reg-modal-title" className="app-modal-title">
                  {regModalMode === 'create' ? 'Nova inscricao' : 'Editar inscricao'}
                </h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={closeRegModal}
                disabled={savingReg}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <form className="app-modal-content" onSubmit={handleRegSubmit}>
              <label className="app-modal-field">
                <span className="app-modal-label">Numero da inscricao</span>
                <input
                  className="app-modal-input"
                  value={regForm.registrationNumber}
                  disabled={savingReg}
                  onChange={(e) =>
                    setRegForm((c) => ({ ...c, registrationNumber: e.target.value }))
                  }
                />
              </label>
              <label className="app-modal-field">
                <span className="app-modal-label">Tipo</span>
                <input
                  className="app-modal-input"
                  value={regForm.registrationType}
                  disabled={savingReg}
                  onChange={(e) =>
                    setRegForm((c) => ({ ...c, registrationType: e.target.value }))
                  }
                  placeholder="Ex: IE, CNAE"
                />
              </label>
              <label className="app-modal-field">
                <span className="app-modal-label">Endereco</span>
                <input
                  className="app-modal-input"
                  value={regForm.addressLine}
                  disabled={savingReg}
                  onChange={(e) =>
                    setRegForm((c) => ({ ...c, addressLine: e.target.value }))
                  }
                />
              </label>
              <div className="client-detail-modal-row">
                <label className="app-modal-field">
                  <span className="app-modal-label">Bairro</span>
                  <input
                    className="app-modal-input"
                    value={regForm.district}
                    disabled={savingReg}
                    onChange={(e) =>
                      setRegForm((c) => ({ ...c, district: e.target.value }))
                    }
                  />
                </label>
                <label className="app-modal-field">
                  <span className="app-modal-label">Cidade</span>
                  <input
                    className="app-modal-input"
                    value={regForm.city}
                    disabled={savingReg}
                    onChange={(e) =>
                      setRegForm((c) => ({ ...c, city: e.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="client-detail-modal-row">
                <label className="app-modal-field">
                  <span className="app-modal-label">UF</span>
                  <input
                    className="app-modal-input"
                    value={regForm.state}
                    maxLength={2}
                    disabled={savingReg}
                    onChange={(e) =>
                      setRegForm((c) => ({ ...c, state: e.target.value.toUpperCase() }))
                    }
                  />
                </label>
                <label className="app-modal-field">
                  <span className="app-modal-label">CEP</span>
                  <input
                    className="app-modal-input"
                    value={regForm.postalCode}
                    disabled={savingReg}
                    onChange={(e) =>
                      setRegForm((c) => ({ ...c, postalCode: e.target.value }))
                    }
                  />
                </label>
              </div>
              <label className="app-modal-field">
                <span className="app-modal-label">Complemento</span>
                <input
                  className="app-modal-input"
                  value={regForm.complement}
                  disabled={savingReg}
                  onChange={(e) =>
                    setRegForm((c) => ({ ...c, complement: e.target.value }))
                  }
                  placeholder="Opcional"
                />
              </label>

              {regModalMode === 'edit' ? (
                <label className="app-modal-field">
                  <span className="app-modal-label">Motivo da edicao (opcional)</span>
                  <input
                    className="app-modal-input"
                    value={regForm.reasonText}
                    disabled={savingReg}
                    onChange={(e) =>
                      setRegForm((c) => ({ ...c, reasonText: e.target.value }))
                    }
                    placeholder="Opcional"
                  />
                </label>
              ) : null}

              <NoticeSlot notice={registrationModalNotice} />

              <div className="app-modal-actions">
                <button
                  type="submit"
                  className="app-modal-submit"
                  disabled={savingReg || !canSaveReg}
                >
                  {savingReg
                    ? 'Salvando...'
                    : regModalMode === 'create'
                      ? 'Cadastrar inscricao'
                      : 'Salvar inscricao'}
                </button>
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={closeRegModal}
                  disabled={savingReg}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {/* ========== MODAL 3: Inactivate/Reactivate Client ========== */}
      {statusModalOpen ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            if (!savingStatus) closeStatusModal();
          }}
        >
          <section
            ref={statusTrapRef}
            className="app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="status-modal-title" className="app-modal-title">
                  {statusAction === 'inactivate' ? 'Inativar cliente' : 'Reativar cliente'}
                </h3>
                <p className="app-modal-description">
                  {statusAction === 'inactivate'
                    ? 'A inativacao impede que este cliente seja selecionado em novas amostras ou movimentacoes.'
                    : 'A reativacao permitira que este cliente seja usado novamente em novas operacoes.'}
                </p>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={closeStatusModal}
                disabled={savingStatus}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <form className="app-modal-content" onSubmit={handleStatusSubmit}>
              {statusAction === 'inactivate' && statusImpactLoading ? (
                <p style={{ margin: 0, color: 'var(--muted)' }}>Verificando impacto...</p>
              ) : null}

              {statusAction === 'inactivate' && statusImpact && !statusImpactLoading ? (
                <div className="client-detail-impact-warning">
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    Este cliente possui vinculos ativos:
                  </p>
                  <ul style={{ margin: '0.32rem 0 0', paddingLeft: '1.2rem' }}>
                    {statusImpact.ownedSamples > 0 ? (
                      <li>{statusImpact.ownedSamples} amostra(s) como proprietario</li>
                    ) : null}
                    {statusImpact.activeMovements > 0 ? (
                      <li>
                        {statusImpact.activeMovements} movimentacao(oes) comercial(is)
                      </li>
                    ) : null}
                    {statusImpact.activeRegistrations > 0 ? (
                      <li>{statusImpact.activeRegistrations} inscricao(oes) ativa(s)</li>
                    ) : null}
                    {statusImpact.ownedSamples === 0 &&
                    statusImpact.activeMovements === 0 &&
                    statusImpact.activeRegistrations === 0 ? (
                      <li>Nenhum vinculo ativo encontrado.</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              <label className="app-modal-field">
                <span className="app-modal-label">Motivo</span>
                <input
                  className="app-modal-input"
                  value={statusReasonText}
                  disabled={savingStatus}
                  onChange={(e) => setStatusReasonText(e.target.value)}
                  placeholder="Informe o motivo"
                />
              </label>

              <NoticeSlot notice={statusModalNotice} />

              <div className="app-modal-actions">
                <button
                  type="submit"
                  className="app-modal-submit"
                  disabled={
                    savingStatus ||
                    statusImpactLoading ||
                    statusReasonText.trim().length === 0
                  }
                >
                  {savingStatus
                    ? 'Processando...'
                    : statusAction === 'inactivate'
                      ? 'Confirmar inativacao'
                      : 'Confirmar reativacao'}
                </button>
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={closeStatusModal}
                  disabled={savingStatus}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {/* ========== MODAL 4: Inactivate/Reactivate Registration ========== */}
      {regStatusModalOpen ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            if (!savingRegStatus) closeRegStatusModal();
          }}
        >
          <section
            ref={regStatusTrapRef}
            className="app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reg-status-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="reg-status-modal-title" className="app-modal-title">
                  {regStatusAction === 'inactivate'
                    ? 'Inativar inscricao'
                    : 'Reativar inscricao'}
                </h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={closeRegStatusModal}
                disabled={savingRegStatus}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <form className="app-modal-content" onSubmit={handleRegStatusSubmit}>
              <label className="app-modal-field">
                <span className="app-modal-label">Motivo</span>
                <input
                  className="app-modal-input"
                  value={regStatusReasonText}
                  disabled={savingRegStatus}
                  onChange={(e) => setRegStatusReasonText(e.target.value)}
                  placeholder="Informe o motivo"
                />
              </label>

              <NoticeSlot notice={regStatusNotice} />

              <div className="app-modal-actions">
                <button
                  type="submit"
                  className="app-modal-submit"
                  disabled={
                    savingRegStatus || regStatusReasonText.trim().length === 0
                  }
                >
                  {savingRegStatus
                    ? 'Processando...'
                    : regStatusAction === 'inactivate'
                      ? 'Confirmar inativacao'
                      : 'Confirmar reativacao'}
                </button>
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={closeRegStatusModal}
                  disabled={savingRegStatus}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
