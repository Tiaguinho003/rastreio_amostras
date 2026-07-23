'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import { BottomSheet } from '../BottomSheet';
import { ClientLookupField } from '../clients/ClientLookupField';
import { ClientQuickCreateModal } from '../clients/ClientQuickCreateModal';
import { SuccessCheckOverlay, SUCCESS_CHECK_MS } from '../SuccessCheckOverlay';
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

// Painel lateral (side-sheet) do formulario de VISITA unificado — funde o
// informe do prospector + a visita do comercial (unificacao 2026-07-15).
// RD16 §2.10 R3: migrou do modal central `.is-informe` + kit `.inf-*` para o
// molde institucional `.fv-panel-sheet .side-sheet` + kit `.fv-form-*` (submit
// no footer via `form={id}`, check terminal `SuccessCheckOverlay`, descarte
// `.is-scrim-none`). O corpo (antigo `CommercialVisitForm`) foi absorvido aqui
// para o sheet ser dono do `submitting`/`success`/footer (molde SampleLossSheet
// / NewSampleModal). SEM fila offline: o envio exige internet.
//
// A visita NASCE VINCULADA a um cliente do cadastro, nos dois caminhos:
//   EXISTING — acha no ClientLookupField.
//   NEW      — cadastra na hora (ClientQuickCreateModal); o cliente criado vira
//              o vinculo, e nome/cidade/telefone digitados ficam como anotacao.
// So o CLIENTE e obrigatorio; os demais campos sao TODOS opcionais.
//
// Consumidores: o FAB "leque" de /relatorios (InformeCreateFab) e o dashboard
// do prospector (ProspectorDashboard). A API deste componente (open/session/
// onClose/onSubmitted) ficou inalterada na migracao.

const FORM_ID = 'commercial-visit-form';

type FieldName = 'clientKind' | 'client' | 'newClientName';
type FieldErrors = Partial<Record<FieldName, string>>;

interface CommercialVisitFormSheetProps {
  open: boolean;
  session: SessionData;
  onClose: () => void;
  /** Envio bem-sucedido — o sheet ja fechou quando isto dispara. */
  onSubmitted?: () => void;
}

export function CommercialVisitFormSheet({
  open,
  session,
  onClose,
  onSubmitted,
}: CommercialVisitFormSheetProps) {
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
  const [success, setSuccess] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

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

  useRegisterDirtyState('relatorios-visit-form', isDirty && !success, 'Visita não enviada');

  // Fecha modais aninhados quando o pai sinaliza fechamento (sem animacao de
  // saida propria — evita "flash" pendurado durante o unmount atrasado do sheet).
  useEffect(() => {
    if (!open) {
      setConfirmDiscardOpen(false);
      setQuickCreateOpen(false);
    }
  }, [open]);

  const clearFieldError = useCallback((field: FieldName) => {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const handleDismissAttempt = useCallback(() => {
    if (submitting || success) {
      return false;
    }
    if (isDirty) {
      setConfirmDiscardOpen(true);
      return false;
    }
    return true;
  }, [submitting, success, isDirty]);

  function handleDiscard() {
    setConfirmDiscardOpen(false);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || success) {
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

      // Check terminal no lugar do toast "... registrada" (skill forms §7): o
      // painel ja esta a caminho do fechamento; o feed refaz ao voltar.
      setSubmitting(false);
      setSuccess(true);
      window.setTimeout(() => {
        onClose();
        onSubmitted?.();
      }, SUCCESS_CHECK_MS);
    } catch (cause) {
      setSubmitting(false);
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
    }
  }

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        onDismissAttempt={handleDismissAttempt}
        title={null}
        ariaLabel="Nova visita"
        closeVariant="edge-back"
        dragToDismiss
        dragDisabled={confirmDiscardOpen || quickCreateOpen || success}
        className="fv-panel-sheet side-sheet commercial-visit-sheet"
        footer={
          success ? null : (
            <button type="submit" form={FORM_ID} className="app-modal-submit" disabled={submitting}>
              {submitting ? 'Registrando...' : 'Registrar visita'}
            </button>
          )
        }
      >
        <>
          <p className="fv-panel-lead">Registre uma visita a um cliente do cadastro.</p>

          <form
            id={FORM_ID}
            className="fv-form-body"
            onSubmit={handleSubmit}
            noValidate
            ref={formRef}
          >
            {/* Cliente (obrigatorio) */}
            <span className="fv-form-heading">
              Cliente<span className="fv-form-required"> *</span>
            </span>

            <div
              className="fv-choice-group"
              role="radiogroup"
              aria-label="Tipo de cliente"
              data-invalid={
                fieldErrors.clientKind || fieldErrors.client || fieldErrors.newClientName
                  ? 'true'
                  : undefined
              }
            >
              <button
                type="button"
                role="radio"
                aria-checked={clientKind === 'EXISTING'}
                className={`fv-choice${clientKind === 'EXISTING' ? ' is-selected' : ''}`}
                onClick={() => {
                  setClientKind('EXISTING');
                  setSelectedClient(null);
                  clearFieldError('clientKind');
                  clearFieldError('client');
                  clearFieldError('newClientName');
                }}
              >
                <span className="fv-choice-label">Já cadastrado</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={clientKind === 'NEW'}
                className={`fv-choice${clientKind === 'NEW' ? ' is-selected' : ''}`}
                onClick={() => {
                  setClientKind('NEW');
                  setSelectedClient(null);
                  clearFieldError('clientKind');
                  clearFieldError('client');
                }}
              >
                <span className="fv-choice-label">Cliente novo</span>
              </button>
            </div>
            {fieldErrors.clientKind ? (
              <p className="fv-form-field-error">{fieldErrors.clientKind}</p>
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
                <label
                  className={`fv-form-field${fieldErrors.newClientName ? ' is-field-error' : ''}`}
                >
                  <span className="fv-form-label">
                    Nome do cliente<span className="fv-form-required"> *</span>
                  </span>
                  <input
                    className={fieldErrors.newClientName ? 'fv-form-input-error' : undefined}
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
                <label className="fv-form-field">
                  <span className="fv-form-label">Cidade ou região</span>
                  <input
                    value={newClientCity}
                    placeholder="Ex.: Três Pontas/MG"
                    autoComplete="off"
                    maxLength={120}
                    onChange={(event) => setNewClientCity(event.target.value)}
                  />
                </label>
                <label className="fv-form-field">
                  <span className="fv-form-label">Telefone</span>
                  <input
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
                  <p className="fv-form-field-error">{fieldErrors.client}</p>
                ) : null}
              </div>
            ) : null}

            {/* Motivo da visita (opcional) */}
            <span className="fv-form-heading">Motivo da visita</span>
            <div className="fv-choice-group" role="radiogroup" aria-label="Motivo da visita">
              {COMMERCIAL_VISIT_REASON_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={reason === option.value}
                  className={`fv-choice${reason === option.value ? ' is-selected' : ''}`}
                  onClick={() => setReason(reason === option.value ? null : option.value)}
                >
                  <span className="fv-choice-label">{option.label}</span>
                </button>
              ))}
            </div>
            <label className="fv-form-field">
              <span className="fv-form-label">Observações</span>
              <textarea
                rows={2}
                value={reasonNotes}
                placeholder="Ex.: cliente pediu para retornar após a colheita"
                maxLength={1000}
                onChange={(event) => setReasonNotes(event.target.value)}
              />
            </label>

            {/* Resultado (opcional) */}
            <span className="fv-form-heading">Resultado</span>
            <div className="fv-choice-group" role="radiogroup" aria-label="Resultado da visita">
              {COMMERCIAL_VISIT_OUTCOME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={outcome === option.value}
                  className={`fv-choice${outcome === option.value ? ' is-selected' : ''}`}
                  onClick={() => setOutcome(outcome === option.value ? null : option.value)}
                >
                  <span className="fv-choice-label">{option.label}</span>
                </button>
              ))}
            </div>
            <label className="fv-form-field">
              <span className="fv-form-label">Observações</span>
              <textarea
                rows={2}
                value={outcomeNotes}
                placeholder="Ex.: proposta de 200 sacas, aguardando resposta"
                maxLength={1000}
                onChange={(event) => setOutcomeNotes(event.target.value)}
              />
            </label>

            {/* Tamanho da fazenda (opcional) */}
            <span className="fv-form-heading">Tamanho da fazenda</span>
            <div className="fv-choice-group" role="radiogroup" aria-label="Tamanho da fazenda">
              {VISIT_FARM_SIZE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={farmSize === option.value}
                  className={`fv-choice${farmSize === option.value ? ' is-selected' : ''}`}
                  onClick={() => setFarmSize(farmSize === option.value ? null : option.value)}
                >
                  <span className="fv-choice-label">{option.label}</span>
                  {option.description ? (
                    <span className="fv-choice-hint">{option.description}</span>
                  ) : null}
                </button>
              ))}
            </div>
            <label className="fv-form-field">
              <span className="fv-form-label">Observações</span>
              <textarea
                rows={2}
                value={farmSizeNotes}
                placeholder="Ex.: 30 ha no total, 12 de café"
                maxLength={1000}
                onChange={(event) => setFarmSizeNotes(event.target.value)}
              />
            </label>

            {/* Nível de interesse (opcional) */}
            <span className="fv-form-heading">Interesse em comercializar</span>
            <div className="fv-choice-group" role="radiogroup" aria-label="Nível de interesse">
              {VISIT_INTEREST_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={interestLevel === option.value}
                  className={`fv-choice${interestLevel === option.value ? ' is-selected' : ''}`}
                  onClick={() =>
                    setInterestLevel(interestLevel === option.value ? null : option.value)
                  }
                >
                  <span className="fv-choice-label">{option.label}</span>
                </button>
              ))}
            </div>
            <label className="fv-form-field">
              <span className="fv-form-label">Observações</span>
              <textarea
                rows={2}
                value={interestNotes}
                placeholder="Ex.: interessado, mas quer preço melhor"
                maxLength={1000}
                onChange={(event) => setInterestNotes(event.target.value)}
              />
            </label>

            {/* Já comercializa? (opcional) */}
            <span className="fv-form-heading">Já comercializa hoje?</span>
            <div className="fv-choice-group" role="radiogroup" aria-label="Já comercializa">
              <button
                type="button"
                role="radio"
                aria-checked={sellsCurrently === true}
                className={`fv-choice${sellsCurrently === true ? ' is-selected' : ''}`}
                onClick={() => setSellsCurrently(sellsCurrently === true ? null : true)}
              >
                <span className="fv-choice-label">Sim</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={sellsCurrently === false}
                className={`fv-choice${sellsCurrently === false ? ' is-selected' : ''}`}
                onClick={() => {
                  setSellsCurrently(sellsCurrently === false ? null : false);
                  setSellsToWhom('');
                }}
              >
                <span className="fv-choice-label">Não</span>
              </button>
            </div>
            {sellsCurrently ? (
              <label className="fv-form-field">
                <span className="fv-form-label">Com quem</span>
                <input
                  value={sellsToWhom}
                  placeholder="Ex.: Cooxupé, corretor local"
                  autoComplete="off"
                  maxLength={1000}
                  onChange={(event) => setSellsToWhom(event.target.value)}
                />
              </label>
            ) : null}

            {/* Observações gerais (opcional) */}
            <span className="fv-form-heading">Observações gerais</span>
            <label className="fv-form-field">
              <span className="fv-form-label">Algo mais sobre a visita?</span>
              <textarea
                rows={3}
                value={generalNotes}
                placeholder="Escreva aqui qualquer observação extra"
                maxLength={1000}
                onChange={(event) => setGeneralNotes(event.target.value)}
              />
            </label>
          </form>

          {/* Check terminal — filho DIRETO do conteudo do sheet (cobre header +
              footer). Substitui o toast de sucesso. */}
          <SuccessCheckOverlay show={success} />
        </>
      </BottomSheet>

      {/* Quick-create de cliente: painel lateral empilhado (side-sheet stacked).
          FORA do <form> — eventos de portal sobem pela arvore React e o submit
          do quick-create chegaria ao onSubmit da visita. Mesmo arranjo do
          NewSampleModal. Intocavel (skill forms §3). */}
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

      {/* Descartar rascunho: confirm central portalado, `.is-scrim-none`
          (fundo nao escurece nem borra) + `.is-compact`, tier acima do painel.
          Mesmo par do "Descartar lote?" do NewSampleModal (skill forms §8). */}
      {confirmDiscardOpen
        ? createPortal(
            <div
              className="app-modal-backdrop is-scrim-none"
              onClick={() => setConfirmDiscardOpen(false)}
            >
              <section
                className="app-modal is-themed app-confirm-modal is-compact"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="discard-commercial-visit-title"
                aria-describedby="discard-commercial-visit-description"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="app-modal-content">
                  <div className="app-confirm-modal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17v.01" />
                    </svg>
                  </div>
                  <h3 id="discard-commercial-visit-title" className="app-confirm-modal-title">
                    Descartar visita?
                  </h3>
                  <p
                    id="discard-commercial-visit-description"
                    className="app-confirm-modal-message"
                  >
                    Os dados preenchidos serão perdidos. Esta ação não pode ser desfeita.
                  </p>
                </div>

                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={() => setConfirmDiscardOpen(false)}
                    autoFocus
                  >
                    Continuar
                  </button>
                  <button
                    type="button"
                    className="app-modal-submit is-danger"
                    onClick={handleDiscard}
                  >
                    Descartar
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
