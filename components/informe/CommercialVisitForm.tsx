'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { ClientLookupField } from '../clients/ClientLookupField';
import { ClientQuickCreateModal } from '../clients/ClientQuickCreateModal';
import { ApiError, createVisitReport } from '../../lib/api-client';
import { maskPhoneInput } from '../../lib/client-field-formatters';
import {
  COMMERCIAL_VISIT_OUTCOME_OPTIONS,
  COMMERCIAL_VISIT_REASON_OPTIONS,
} from '../../lib/commercial-visit';
import { VISIT_FARM_SIZE_OPTIONS, VISIT_INTEREST_OPTIONS } from '../../lib/visit-report';
import { useRegisterDirtyState } from '../../lib/dirty-state/DirtyStateProvider';
import { useToast } from '../../lib/toast/ToastProvider';
import type {
  ClientSummary,
  CommercialVisitOutcome,
  CommercialVisitReason,
  SessionData,
  VisitClientKind,
  VisitFarmSize,
  VisitInterestLevel,
} from '../../lib/types';

// Formulario de VISITA unificado (funde o informe do prospector + a visita do
// comercial; unificacao 2026-07-15). Renderizado no BottomSheet (FAB de
// Relatorios e sheet do dashboard do prospector). SEM fila offline: o envio
// exige internet.
//
// A visita NASCE VINCULADA a um cliente do cadastro, nos dois caminhos:
//   EXISTING — acha no ClientLookupField.
//   NEW      — cadastra na hora (ClientQuickCreateModal); o cliente criado vira
//              o vinculo, e nome/cidade/telefone digitados ficam como anotacao.
// So o CLIENTE e obrigatorio; os demais campos (motivo/resultado + fazenda/
// interesse/comercializa + observacoes) sao TODOS opcionais — a obrigatoriedade
// fica p/ o remodel futuro das perguntas.

type FieldName = 'clientKind' | 'client' | 'newClientName';
type FieldErrors = Partial<Record<FieldName, string>>;

interface VisitFormProps {
  session: SessionData;
  onDirtyChange?: (dirty: boolean) => void;
  /** Chamado apos envio bem-sucedido (o sheet fecha e a pagina refaz o feed). */
  onSubmitted?: () => void;
}

export function CommercialVisitForm({ session, onDirtyChange, onSubmitted }: VisitFormProps) {
  const toast = useToast();

  const [clientKind, setClientKind] = useState<VisitClientKind | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [newClientCity, setNewClientCity] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [reason, setReason] = useState<CommercialVisitReason | null>(null);
  const [reasonNotes, setReasonNotes] = useState('');
  const [outcome, setOutcome] = useState<CommercialVisitOutcome | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [farmSize, setFarmSize] = useState<VisitFarmSize | null>(null);
  const [farmSizeNotes, setFarmSizeNotes] = useState('');
  const [interestLevel, setInterestLevel] = useState<VisitInterestLevel | null>(null);
  const [interestNotes, setInterestNotes] = useState('');
  const [sellsCurrently, setSellsCurrently] = useState<boolean | null>(null);
  const [sellsToWhom, setSellsToWhom] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const formRef = useRef<HTMLFormElement | null>(null);

  const isDirty =
    clientKind !== null ||
    selectedClient !== null ||
    newClientName !== '' ||
    newClientCity !== '' ||
    newClientPhone !== '' ||
    reason !== null ||
    reasonNotes !== '' ||
    outcome !== null ||
    outcomeNotes !== '' ||
    farmSize !== null ||
    farmSizeNotes !== '' ||
    interestLevel !== null ||
    interestNotes !== '' ||
    sellsCurrently !== null ||
    sellsToWhom !== '' ||
    generalNotes !== '';

  useRegisterDirtyState('relatorios-visit-form', isDirty, 'Visita não enviada');

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  function clearFieldError(field: FieldName) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    // So o cliente e obrigatorio (a visita nasce vinculada).
    const errors: FieldErrors = {};
    if (!clientKind) {
      errors.clientKind = 'Selecione uma opção';
    } else if (clientKind === 'EXISTING' && !selectedClient) {
      errors.client = 'Obrigatório';
    } else if (clientKind === 'NEW') {
      if (!newClientName.trim()) {
        errors.newClientName = 'Obrigatório';
      }
      if (!selectedClient) {
        errors.client = 'Cadastre o cliente para registrar a visita';
      }
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

    if (!navigator.onLine) {
      toast.error({
        title: 'Sem conexão',
        description: 'Conecte-se à internet para enviar a visita.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const clientName = selectedClient?.displayName ?? newClientName.trim();
      await createVisitReport(session, {
        clientKind: clientKind as VisitClientKind,
        clientId: selectedClient?.id ?? null,
        newClientName: clientKind === 'NEW' ? newClientName.trim() : null,
        newClientCity: clientKind === 'NEW' ? newClientCity.trim() || null : null,
        newClientPhone: clientKind === 'NEW' ? newClientPhone.trim() || null : null,
        farmSize,
        farmSizeNotes: farmSizeNotes.trim() || null,
        interestLevel,
        interestNotes: interestNotes.trim() || null,
        sellsCurrently,
        sellsToWhom: sellsCurrently ? sellsToWhom.trim() || null : null,
        reason,
        reasonNotes: reasonNotes.trim() || null,
        outcome,
        outcomeNotes: outcomeNotes.trim() || null,
        generalNotes: generalNotes.trim() || null,
      });

      toast.success({
        title: 'Visita registrada',
        description: clientName ? `Visita a ${clientName} registrada.` : undefined,
      });
      onSubmitted?.();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 0) {
        toast.error({
          title: 'Sem conexão',
          description: 'Conecte-se à internet para enviar a visita.',
        });
        return;
      }

      toast.error({
        title: 'Não foi possível registrar a visita',
        description:
          cause instanceof ApiError ? cause.message : 'Verifique sua conexão e tente novamente.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form className="inf-form" onSubmit={handleSubmit} noValidate ref={formRef}>
        {/* P1 — Cliente (obrigatorio) */}
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
                Cliente<span className="nsv2-required-star"> *</span>
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
                setSelectedClient(null);
                clearFieldError('clientKind');
                clearFieldError('client');
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
                setSelectedClient(null);
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
                  placeholder={fieldErrors.newClientName ?? 'Nome do produtor ou da empresa'}
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
                  onChange={(event) => setNewClientPhone(maskPhoneInput(event.target.value))}
                />
              </label>

              {selectedClient ? (
                <div className="inf-newclient-linked">
                  <span className="inf-newclient-linked-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                  <span className="inf-newclient-linked-text">
                    <span className="inf-newclient-linked-name">
                      {selectedClient.displayName ?? 'Sem nome'}
                    </span>
                    <span className="inf-newclient-linked-meta">
                      Cadastrado · Código {selectedClient.code}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="inf-newclient-linked-clear"
                    aria-label="Remover cliente cadastrado"
                    onClick={() => setSelectedClient(null)}
                  >
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`inf-newclient-cta${fieldErrors.client ? ' has-error' : ''}`}
                  onClick={() => {
                    clearFieldError('client');
                    setQuickCreateOpen(true);
                  }}
                >
                  <span className="inf-newclient-cta-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </span>
                  <span className="inf-newclient-cta-label">Cadastrar cliente</span>
                  <svg
                    className="inf-newclient-cta-chevron"
                    viewBox="0 0 24 24"
                    focusable="false"
                    aria-hidden="true"
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </button>
              )}
              {!selectedClient && fieldErrors.client ? (
                <p className="inf-card-error">{fieldErrors.client}</p>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* P2 — Motivo da visita (opcional) */}
        <section className="inf-card">
          <header className="inf-card-head">
            <span className="inf-card-num" aria-hidden="true">
              2
            </span>
            <div className="inf-card-head-text">
              <h3 className="inf-card-title">Motivo da visita</h3>
              <p className="inf-card-sub">O que levou você até o cliente? (opcional)</p>
            </div>
          </header>

          <div className="inf-choices" role="group" aria-label="Motivo da visita">
            {COMMERCIAL_VISIT_REASON_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`inf-choice${reason === option.value ? ' is-selected' : ''}`}
                aria-pressed={reason === option.value}
                onClick={() => setReason(reason === option.value ? null : option.value)}
              >
                <span className="inf-choice-radio" aria-hidden="true" />
                <span className="inf-choice-text">
                  <span className="inf-choice-label">{option.label}</span>
                </span>
              </button>
            ))}
          </div>

          <label className="inf-field">
            <span className="inf-field-label">
              Observações <span className="inf-field-optional">(opcional)</span>
            </span>
            <textarea
              className="inf-textarea"
              rows={2}
              value={reasonNotes}
              placeholder="Ex.: cliente pediu para retornar após a colheita"
              maxLength={1000}
              onChange={(event) => setReasonNotes(event.target.value)}
            />
          </label>
        </section>

        {/* P3 — Resultado (opcional) */}
        <section className="inf-card">
          <header className="inf-card-head">
            <span className="inf-card-num" aria-hidden="true">
              3
            </span>
            <div className="inf-card-head-text">
              <h3 className="inf-card-title">Resultado</h3>
              <p className="inf-card-sub">Como a visita terminou? (opcional)</p>
            </div>
          </header>

          <div className="inf-choices" role="group" aria-label="Resultado da visita">
            {COMMERCIAL_VISIT_OUTCOME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`inf-choice${outcome === option.value ? ' is-selected' : ''}`}
                aria-pressed={outcome === option.value}
                onClick={() => setOutcome(outcome === option.value ? null : option.value)}
              >
                <span className="inf-choice-radio" aria-hidden="true" />
                <span className="inf-choice-text">
                  <span className="inf-choice-label">{option.label}</span>
                </span>
              </button>
            ))}
          </div>

          <label className="inf-field">
            <span className="inf-field-label">
              Observações <span className="inf-field-optional">(opcional)</span>
            </span>
            <textarea
              className="inf-textarea"
              rows={2}
              value={outcomeNotes}
              placeholder="Ex.: proposta de 200 sacas, aguardando resposta"
              maxLength={1000}
              onChange={(event) => setOutcomeNotes(event.target.value)}
            />
          </label>
        </section>

        {/* P4 — Tamanho da fazenda (opcional) */}
        <section className="inf-card">
          <header className="inf-card-head">
            <span className="inf-card-num" aria-hidden="true">
              4
            </span>
            <div className="inf-card-head-text">
              <h3 className="inf-card-title">Tamanho da fazenda</h3>
              <p className="inf-card-sub">Porte da propriedade (opcional)</p>
            </div>
          </header>

          <div className="inf-choices" role="group" aria-label="Tamanho da fazenda">
            {VISIT_FARM_SIZE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`inf-choice${farmSize === option.value ? ' is-selected' : ''}`}
                aria-pressed={farmSize === option.value}
                onClick={() => setFarmSize(farmSize === option.value ? null : option.value)}
              >
                <span className="inf-choice-radio" aria-hidden="true" />
                <span className="inf-choice-text">
                  <span className="inf-choice-label">{option.label}</span>
                  {option.description ? (
                    <span className="inf-choice-hint">{option.description}</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>

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

        {/* P5 — Nível de interesse (opcional) */}
        <section className="inf-card">
          <header className="inf-card-head">
            <span className="inf-card-num" aria-hidden="true">
              5
            </span>
            <div className="inf-card-head-text">
              <h3 className="inf-card-title">Interesse em comercializar</h3>
              <p className="inf-card-sub">Disposição do cliente (opcional)</p>
            </div>
          </header>

          <div className="inf-choices" role="group" aria-label="Nível de interesse">
            {VISIT_INTEREST_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`inf-choice${interestLevel === option.value ? ' is-selected' : ''}`}
                aria-pressed={interestLevel === option.value}
                onClick={() =>
                  setInterestLevel(interestLevel === option.value ? null : option.value)
                }
              >
                <span className="inf-choice-radio" aria-hidden="true" />
                <span className="inf-choice-text">
                  <span className="inf-choice-label">{option.label}</span>
                </span>
              </button>
            ))}
          </div>

          <label className="inf-field">
            <span className="inf-field-label">
              Observações <span className="inf-field-optional">(opcional)</span>
            </span>
            <textarea
              className="inf-textarea"
              rows={2}
              value={interestNotes}
              placeholder="Ex.: interessado, mas quer preço melhor"
              maxLength={1000}
              onChange={(event) => setInterestNotes(event.target.value)}
            />
          </label>
        </section>

        {/* P6 — Já comercializa? (opcional) */}
        <section className="inf-card">
          <header className="inf-card-head">
            <span className="inf-card-num" aria-hidden="true">
              6
            </span>
            <div className="inf-card-head-text">
              <h3 className="inf-card-title">Já comercializa hoje?</h3>
              <p className="inf-card-sub">Com quem o cliente já vende (opcional)</p>
            </div>
          </header>

          <div className="inf-choice-grid" role="group" aria-label="Já comercializa">
            <button
              type="button"
              className={`inf-pill${sellsCurrently === true ? ' is-selected' : ''}`}
              aria-pressed={sellsCurrently === true}
              onClick={() => setSellsCurrently(sellsCurrently === true ? null : true)}
            >
              Sim
            </button>
            <button
              type="button"
              className={`inf-pill${sellsCurrently === false ? ' is-selected' : ''}`}
              aria-pressed={sellsCurrently === false}
              onClick={() => {
                setSellsCurrently(sellsCurrently === false ? null : false);
                setSellsToWhom('');
              }}
            >
              Não
            </button>
          </div>

          {sellsCurrently ? (
            <label className="inf-field">
              <span className="inf-field-label">
                Com quem <span className="inf-field-optional">(opcional)</span>
              </span>
              <input
                className="inf-input"
                value={sellsToWhom}
                placeholder="Ex.: Cooxupé, corretor local"
                autoComplete="off"
                maxLength={1000}
                onChange={(event) => setSellsToWhom(event.target.value)}
              />
            </label>
          ) : null}
        </section>

        {/* P7 — Observações gerais (opcional) */}
        <section className="inf-card">
          <header className="inf-card-head">
            <span className="inf-card-num" aria-hidden="true">
              7
            </span>
            <div className="inf-card-head-text">
              <h3 className="inf-card-title">Observações gerais</h3>
              <p className="inf-card-sub">Algo mais sobre a visita? (opcional)</p>
            </div>
          </header>

          <textarea
            className="inf-textarea"
            rows={3}
            value={generalNotes}
            placeholder="Escreva aqui qualquer observação extra"
            maxLength={1000}
            onChange={(event) => setGeneralNotes(event.target.value)}
          />
        </section>

        <button type="submit" className="inf-submit" disabled={submitting}>
          {submitting ? 'Enviando…' : 'Enviar'}
        </button>
      </form>

      {/* FORA do <form>: o BottomSheet usa portal, mas eventos de portal sobem
          pela arvore React — o submit do modal chegaria ao onSubmit da visita.
          Mesmo arranjo do NewSampleModal. */}
      {quickCreateOpen ? (
        <ClientQuickCreateModal
          session={session}
          open
          title="Cadastrar cliente"
          initialSearch={newClientName.trim()}
          initialPersonType="PF"
          initialPhone={newClientPhone.trim() || undefined}
          onClose={() => setQuickCreateOpen(false)}
          onCreated={(client) => {
            setSelectedClient(client);
            setQuickCreateOpen(false);
            clearFieldError('client');
            if (!newClientName.trim() && client.displayName) {
              setNewClientName(client.displayName);
            }
          }}
        />
      ) : null}
    </>
  );
}
