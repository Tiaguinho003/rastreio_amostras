'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { ClientLookupField } from '../../components/clients/ClientLookupField';
import { ApiError, createVisitReport } from '../../lib/api-client';
import { useRegisterDirtyState } from '../../lib/dirty-state/DirtyStateProvider';
import { useToast } from '../../lib/toast/ToastProvider';
import type {
  ClientSummary,
  VisitClientKind,
  VisitFarmSize,
  VisitInterestLevel,
} from '../../lib/types';
import { useRequireAuth } from '../../lib/use-auth';
import { VISIT_FARM_SIZE_OPTIONS, VISIT_INTEREST_OPTIONS } from '../../lib/visit-report';

// Pagina "Informe" — formulario de visita (item do tabbar mobile).
// 4 perguntas: identificacao do cliente (cadastrado via lookup OU novo via
// campos basicos), tamanho da fazenda, interesse em comercializar e se ja
// comercializa (com quem). Envio via POST /visit-reports: o backend carimba
// usuario + data/hora; o admin le tudo na pagina /resumo.
// Visual: verde em cima (.sdv-header transparente sobre o app-shell verde —
// rota layered no AppShell) + sheet bege embaixo (.sdv-content.informe-content)
// com a navbar visivel (fora de hideMobileTabbar).

type VisitFieldName =
  | 'clientKind'
  | 'client'
  | 'newClientName'
  | 'farmSize'
  | 'interestLevel'
  | 'sellsCurrently';

type VisitFieldErrors = Partial<Record<VisitFieldName, string>>;

export default function InformePage() {
  const { session, loading, logout, setSession } = useRequireAuth();
  const toast = useToast();

  const [clientKind, setClientKind] = useState<VisitClientKind | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [newClientCity, setNewClientCity] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [farmSize, setFarmSize] = useState<VisitFarmSize | null>(null);
  const [farmSizeNotes, setFarmSizeNotes] = useState('');
  const [interestLevel, setInterestLevel] = useState<VisitInterestLevel | null>(null);
  const [interestNotes, setInterestNotes] = useState('');
  const [sellsCurrently, setSellsCurrently] = useState<boolean | null>(null);
  const [sellsToWhom, setSellsToWhom] = useState('');
  const [fieldErrors, setFieldErrors] = useState<VisitFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const contentRef = useRef<HTMLElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const isDirty =
    clientKind !== null ||
    selectedClient !== null ||
    newClientName !== '' ||
    newClientCity !== '' ||
    newClientPhone !== '' ||
    farmSize !== null ||
    farmSizeNotes !== '' ||
    interestLevel !== null ||
    interestNotes !== '' ||
    sellsCurrently !== null ||
    sellsToWhom !== '';

  useRegisterDirtyState('informe-visit-form', isDirty, 'Informe de visita não enviado');

  if (loading || !session) {
    return null;
  }

  const userFullName = session.user.fullName ?? session.user.username;
  const userAvatarInitials = userFullName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function clearFieldError(field: VisitFieldName) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function resetForm() {
    setClientKind(null);
    setSelectedClient(null);
    setNewClientName('');
    setNewClientCity('');
    setNewClientPhone('');
    setFarmSize(null);
    setFarmSizeNotes('');
    setInterestLevel(null);
    setInterestNotes('');
    setSellsCurrently(null);
    setSellsToWhom('');
    setFieldErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !session) {
      return;
    }

    const errors: VisitFieldErrors = {};
    if (!clientKind) {
      errors.clientKind = 'Selecione uma opção';
    } else if (clientKind === 'EXISTING' && !selectedClient) {
      errors.client = 'Obrigatório';
    } else if (clientKind === 'NEW' && !newClientName.trim()) {
      errors.newClientName = 'Obrigatório';
    }
    if (!farmSize) {
      errors.farmSize = 'Selecione uma opção';
    }
    if (!interestLevel) {
      errors.interestLevel = 'Selecione uma opção';
    }
    if (sellsCurrently === null) {
      errors.sellsCurrently = 'Selecione uma opção';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      window.setTimeout(() => {
        formRef.current
          ?.querySelector('[data-invalid="true"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 0);
      return;
    }

    setSubmitting(true);
    try {
      const clientName =
        clientKind === 'EXISTING' ? selectedClient?.displayName : newClientName.trim();
      await createVisitReport(session, {
        clientKind: clientKind as VisitClientKind,
        clientId: clientKind === 'EXISTING' ? (selectedClient?.id ?? null) : null,
        newClientName: clientKind === 'NEW' ? newClientName.trim() : null,
        newClientCity: clientKind === 'NEW' ? newClientCity.trim() || null : null,
        newClientPhone: clientKind === 'NEW' ? newClientPhone.trim() || null : null,
        farmSize: farmSize as VisitFarmSize,
        farmSizeNotes: farmSizeNotes.trim() || null,
        interestLevel: interestLevel as VisitInterestLevel,
        interestNotes: interestNotes.trim() || null,
        sellsCurrently: sellsCurrently as boolean,
        sellsToWhom: sellsCurrently ? sellsToWhom.trim() || null : null,
      });

      resetForm();
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      toast.success({
        title: 'Informe enviado',
        description: clientName ? `Visita a ${clientName} registrada.` : 'Visita registrada.',
      });
    } catch (cause) {
      toast.error({
        title: 'Não foi possível enviar o informe',
        description:
          cause instanceof ApiError ? cause.message : 'Verifique sua conexão e tente novamente.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="sdv-page">
        <header className="sdv-header">
          <div className="sdv-header-top">
            <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <span className="sdv-header-title">Informe</span>
            <HeaderAvatarMenu session={session} onLogout={logout} />
            <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
              <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
            </Link>
          </div>
        </header>

        <section className="sdv-content informe-content" ref={contentRef}>
          <form className="inf-form" onSubmit={handleSubmit} noValidate ref={formRef}>
            <header className="inf-intro">
              <h2 className="inf-intro-title">Formulário de visita</h2>
              <p className="inf-intro-sub">
                Registre a visita ao produtor. O envio vai para a administração com seu nome, data e
                horário.
              </p>
            </header>

            {/* P1 — Identificação do cliente */}
            <section
              className="inf-card"
              data-invalid={
                fieldErrors.clientKind || fieldErrors.client || fieldErrors.newClientName
                  ? 'true'
                  : undefined
              }
            >
              <header className="inf-card-head">
                <span className="inf-card-num" aria-hidden="true">
                  1
                </span>
                <div className="inf-card-head-text">
                  <h3 className="inf-card-title">
                    Identificação do cliente<span className="nsv2-required-star"> *</span>
                  </h3>
                  <p className="inf-card-sub">Quem você visitou?</p>
                </div>
              </header>

              <div className="inf-choice-grid" role="group" aria-label="Tipo de cliente">
                <button
                  type="button"
                  className={`inf-pill${clientKind === 'EXISTING' ? ' is-selected' : ''}`}
                  aria-pressed={clientKind === 'EXISTING'}
                  onClick={() => {
                    setClientKind('EXISTING');
                    clearFieldError('clientKind');
                    clearFieldError('newClientName');
                  }}
                >
                  Já cadastrado
                </button>
                <button
                  type="button"
                  className={`inf-pill${clientKind === 'NEW' ? ' is-selected' : ''}`}
                  aria-pressed={clientKind === 'NEW'}
                  onClick={() => {
                    setClientKind('NEW');
                    clearFieldError('clientKind');
                    clearFieldError('client');
                  }}
                >
                  Cliente novo
                </button>
              </div>
              {fieldErrors.clientKind ? (
                <p className="inf-card-error">{fieldErrors.clientKind}</p>
              ) : null}

              {clientKind === 'EXISTING' ? (
                <ClientLookupField
                  session={session}
                  label="Cliente"
                  kind="any"
                  required
                  selectedClient={selectedClient}
                  onSelectClient={(client) => {
                    setSelectedClient(client);
                    if (client) {
                      clearFieldError('client');
                    }
                  }}
                  invalid={Boolean(fieldErrors.client)}
                  invalidText={fieldErrors.client ?? 'Obrigatório'}
                  placeholder="Busque por nome, documento ou código"
                />
              ) : null}

              {clientKind === 'NEW' ? (
                <div className="inf-newclient">
                  <label className="inf-field">
                    <span className="inf-field-label">
                      Nome do cliente<span className="nsv2-required-star"> *</span>
                    </span>
                    <input
                      className={`inf-input${fieldErrors.newClientName ? ' has-error' : ''}`}
                      value={newClientName}
                      placeholder={fieldErrors.newClientName ?? 'Nome do produtor ou da fazenda'}
                      autoComplete="off"
                      aria-invalid={Boolean(fieldErrors.newClientName)}
                      maxLength={200}
                      onChange={(event) => {
                        setNewClientName(event.target.value);
                        clearFieldError('newClientName');
                      }}
                    />
                  </label>
                  <label className="inf-field">
                    <span className="inf-field-label">
                      Cidade ou região <span className="inf-field-optional">(opcional)</span>
                    </span>
                    <input
                      className="inf-input"
                      value={newClientCity}
                      placeholder="Ex.: Três Pontas/MG"
                      autoComplete="off"
                      maxLength={120}
                      onChange={(event) => setNewClientCity(event.target.value)}
                    />
                  </label>
                  <label className="inf-field">
                    <span className="inf-field-label">
                      Telefone <span className="inf-field-optional">(opcional)</span>
                    </span>
                    <input
                      className="inf-input"
                      type="tel"
                      inputMode="tel"
                      value={newClientPhone}
                      placeholder="Ex.: (35) 99999-9999"
                      autoComplete="off"
                      maxLength={40}
                      onChange={(event) => setNewClientPhone(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}
            </section>

            {/* P2 — Tamanho da fazenda */}
            <section className="inf-card" data-invalid={fieldErrors.farmSize ? 'true' : undefined}>
              <header className="inf-card-head">
                <span className="inf-card-num" aria-hidden="true">
                  2
                </span>
                <div className="inf-card-head-text">
                  <h3 className="inf-card-title">
                    Tamanho da fazenda<span className="nsv2-required-star"> *</span>
                  </h3>
                  <p className="inf-card-sub">Tamanho aproximado da propriedade</p>
                </div>
              </header>

              <div className="inf-choices" role="group" aria-label="Tamanho da fazenda">
                {VISIT_FARM_SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`inf-choice${farmSize === option.value ? ' is-selected' : ''}`}
                    aria-pressed={farmSize === option.value}
                    onClick={() => {
                      setFarmSize(option.value);
                      clearFieldError('farmSize');
                    }}
                  >
                    <span className="inf-choice-radio" aria-hidden="true" />
                    <span className="inf-choice-text">
                      <span className="inf-choice-label">{option.label}</span>
                      <span className="inf-choice-desc">{option.description}</span>
                    </span>
                  </button>
                ))}
              </div>
              {fieldErrors.farmSize ? (
                <p className="inf-card-error">{fieldErrors.farmSize}</p>
              ) : null}

              <label className="inf-field">
                <span className="inf-field-label">
                  Observações <span className="inf-field-optional">(opcional)</span>
                </span>
                <textarea
                  className="inf-textarea"
                  rows={2}
                  value={farmSizeNotes}
                  placeholder="Ex.: 30 ha no total, 12 de café"
                  maxLength={1000}
                  onChange={(event) => setFarmSizeNotes(event.target.value)}
                />
              </label>
            </section>

            {/* P3 — Interesse em comercializar */}
            <section
              className="inf-card"
              data-invalid={fieldErrors.interestLevel ? 'true' : undefined}
            >
              <header className="inf-card-head">
                <span className="inf-card-num" aria-hidden="true">
                  3
                </span>
                <div className="inf-card-head-text">
                  <h3 className="inf-card-title">
                    Interesse em comercializar<span className="nsv2-required-star"> *</span>
                  </h3>
                  <p className="inf-card-sub">Nível de interesse e disposição do cliente</p>
                </div>
              </header>

              <div className="inf-choices" role="group" aria-label="Nível de interesse">
                {VISIT_INTEREST_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`inf-choice${interestLevel === option.value ? ' is-selected' : ''}`}
                    aria-pressed={interestLevel === option.value}
                    onClick={() => {
                      setInterestLevel(option.value);
                      clearFieldError('interestLevel');
                    }}
                  >
                    <span className="inf-choice-radio" aria-hidden="true" />
                    <span className="inf-choice-text">
                      <span className="inf-choice-label">{option.label}</span>
                      <span className="inf-choice-desc">{option.description}</span>
                    </span>
                  </button>
                ))}
              </div>
              {fieldErrors.interestLevel ? (
                <p className="inf-card-error">{fieldErrors.interestLevel}</p>
              ) : null}

              <label className="inf-field">
                <span className="inf-field-label">
                  Observações <span className="inf-field-optional">(opcional)</span>
                </span>
                <textarea
                  className="inf-textarea"
                  rows={2}
                  value={interestNotes}
                  placeholder="Ex.: quer proposta depois da colheita"
                  maxLength={1000}
                  onChange={(event) => setInterestNotes(event.target.value)}
                />
              </label>
            </section>

            {/* P4 — Já comercializa */}
            <section
              className="inf-card"
              data-invalid={fieldErrors.sellsCurrently ? 'true' : undefined}
            >
              <header className="inf-card-head">
                <span className="inf-card-num" aria-hidden="true">
                  4
                </span>
                <div className="inf-card-head-text">
                  <h3 className="inf-card-title">
                    Já comercializa?<span className="nsv2-required-star"> *</span>
                  </h3>
                  <p className="inf-card-sub">Se o cliente já vende café atualmente</p>
                </div>
              </header>

              <div className="inf-choice-grid" role="group" aria-label="Já comercializa">
                <button
                  type="button"
                  className={`inf-pill${sellsCurrently === true ? ' is-selected' : ''}`}
                  aria-pressed={sellsCurrently === true}
                  onClick={() => {
                    setSellsCurrently(true);
                    clearFieldError('sellsCurrently');
                  }}
                >
                  Sim
                </button>
                <button
                  type="button"
                  className={`inf-pill${sellsCurrently === false ? ' is-selected' : ''}`}
                  aria-pressed={sellsCurrently === false}
                  onClick={() => {
                    setSellsCurrently(false);
                    clearFieldError('sellsCurrently');
                  }}
                >
                  Não
                </button>
              </div>
              {fieldErrors.sellsCurrently ? (
                <p className="inf-card-error">{fieldErrors.sellsCurrently}</p>
              ) : null}

              {sellsCurrently === true ? (
                <label className="inf-field">
                  <span className="inf-field-label">
                    Com quem? <span className="inf-field-optional">(opcional)</span>
                  </span>
                  <textarea
                    className="inf-textarea"
                    rows={2}
                    value={sellsToWhom}
                    placeholder="Ex.: Cooxupé, corretor local"
                    maxLength={1000}
                    onChange={(event) => setSellsToWhom(event.target.value)}
                  />
                </label>
              ) : null}
            </section>

            <button type="submit" className="inf-submit" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar informe'}
            </button>
          </form>
        </section>
      </section>
    </AppShell>
  );
}
