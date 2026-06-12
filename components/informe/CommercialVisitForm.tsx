'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { ClientLookupField } from '../clients/ClientLookupField';
import { ApiError, createCommercialVisit } from '../../lib/api-client';
import {
  COMMERCIAL_VISIT_OUTCOME_OPTIONS,
  COMMERCIAL_VISIT_REASON_OPTIONS,
} from '../../lib/commercial-visit';
import { useRegisterDirtyState } from '../../lib/dirty-state/DirtyStateProvider';
import { useOnlineStatus } from '../../lib/offline/use-online-status';
import { useToast } from '../../lib/toast/ToastProvider';
import type {
  ClientSummary,
  CommercialVisitOutcome,
  CommercialVisitReason,
  SessionData,
  VisitClientKind,
} from '../../lib/types';

// Formulario de VISITA do comercial — renderizado no BottomSheet da pagina
// /informe do papel COMMERCIAL (CommercialVisitFormSheet). SEM fila
// offline: o envio exige internet (erro claro quando nao ha conexao).
// DIVERGENCIA DELIBERADA do VisitReportForm do prospector: o comercial
// MANTEM o lookup de cliente cadastrado (EXISTING via ClientLookupField) —
// ele visita majoritariamente clientes da carteira, online. O formulario
// do prospector virou declaracao sem lookup (vinculo curado no /resumo).

type FieldName = 'clientKind' | 'client' | 'newClientName' | 'reason' | 'outcome';
type FieldErrors = Partial<Record<FieldName, string>>;

interface CommercialVisitFormProps {
  session: SessionData;
  onDirtyChange?: (dirty: boolean) => void;
  /** Chamado apos envio bem-sucedido (o sheet fecha e a pagina refaz o feed). */
  onSubmitted?: () => void;
}

export function CommercialVisitForm({
  session,
  onDirtyChange,
  onSubmitted,
}: CommercialVisitFormProps) {
  const toast = useToast();
  const isOnline = useOnlineStatus();

  const [clientKind, setClientKind] = useState<VisitClientKind | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [newClientCity, setNewClientCity] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [reason, setReason] = useState<CommercialVisitReason | null>(null);
  const [outcome, setOutcome] = useState<CommercialVisitOutcome | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const formRef = useRef<HTMLFormElement | null>(null);

  const isDirty =
    clientKind !== null ||
    selectedClient !== null ||
    newClientName !== '' ||
    newClientCity !== '' ||
    newClientPhone !== '' ||
    reason !== null ||
    outcome !== null ||
    outcomeNotes !== '' ||
    generalNotes !== '';

  useRegisterDirtyState('informe-commercial-visit-form', isDirty, 'Visita não enviada');

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

    const errors: FieldErrors = {};
    if (!clientKind) {
      errors.clientKind = 'Selecione uma opção';
    } else if (clientKind === 'EXISTING' && !selectedClient) {
      errors.client = 'Obrigatório';
    } else if (clientKind === 'NEW' && !newClientName.trim()) {
      errors.newClientName = 'Obrigatório';
    }
    if (!reason) {
      errors.reason = 'Selecione uma opção';
    }
    if (!outcome) {
      errors.outcome = 'Selecione uma opção';
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

    // Sem fila offline: sem internet, nao envia.
    if (!navigator.onLine) {
      toast.error({
        title: 'Sem conexão',
        description: 'Conecte-se à internet para enviar a visita.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const clientName =
        clientKind === 'EXISTING' ? selectedClient?.displayName : newClientName.trim();
      await createCommercialVisit(session, {
        clientKind: clientKind as VisitClientKind,
        clientId: clientKind === 'EXISTING' ? (selectedClient?.id ?? null) : null,
        newClientName: clientKind === 'NEW' ? newClientName.trim() : null,
        newClientCity: clientKind === 'NEW' ? newClientCity.trim() || null : null,
        newClientPhone: clientKind === 'NEW' ? newClientPhone.trim() || null : null,
        reason: reason as CommercialVisitReason,
        outcome: outcome as CommercialVisitOutcome,
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
    <form className="inf-form" onSubmit={handleSubmit} noValidate ref={formRef}>
      {!isOnline ? (
        <div className="inf-offline-banner" role="status">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M2 9c5.5-5.3 14.5-5.3 20 0" />
            <path d="M5.5 12.5c3.6-3.4 9.4-3.4 13 0" />
            <path d="M9 16c1.7-1.6 4.3-1.6 6 0" />
            <path d="M12 19.4h.01" />
            <path d="M4 4l16 16" />
          </svg>
          <div className="inf-offline-banner-text">
            <p className="inf-offline-banner-title">Sem conexão</p>
            <p className="inf-offline-banner-sub">
              Não é possível enviar formulários agora. Conecte-se à internet e tente novamente.
            </p>
          </div>
        </div>
      ) : null}

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
        {fieldErrors.clientKind ? <p className="inf-card-error">{fieldErrors.clientKind}</p> : null}

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
                onChange={(event) => setNewClientPhone(event.target.value)}
              />
            </label>
          </div>
        ) : null}
      </section>

      {/* P2 — Motivo da visita */}
      <section className="inf-card" data-invalid={fieldErrors.reason ? 'true' : undefined}>
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            2
          </span>
          <div className="inf-card-head-text">
            <h3 className="inf-card-title">
              Motivo da visita<span className="nsv2-required-star"> *</span>
            </h3>
            <p className="inf-card-sub">O que levou você até o cliente?</p>
          </div>
        </header>

        <div className="inf-choices" role="group" aria-label="Motivo da visita">
          {COMMERCIAL_VISIT_REASON_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`inf-choice${reason === option.value ? ' is-selected' : ''}`}
              aria-pressed={reason === option.value}
              onClick={() => {
                setReason(option.value);
                clearFieldError('reason');
              }}
            >
              <span className="inf-choice-radio" aria-hidden="true" />
              <span className="inf-choice-text">
                <span className="inf-choice-label">{option.label}</span>
              </span>
            </button>
          ))}
        </div>
        {fieldErrors.reason ? <p className="inf-card-error">{fieldErrors.reason}</p> : null}
      </section>

      {/* P3 — Resultado da negociação */}
      <section className="inf-card" data-invalid={fieldErrors.outcome ? 'true' : undefined}>
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            3
          </span>
          <div className="inf-card-head-text">
            <h3 className="inf-card-title">
              Resultado da negociação<span className="nsv2-required-star"> *</span>
            </h3>
            <p className="inf-card-sub">Como a visita terminou?</p>
          </div>
        </header>

        <div className="inf-choices" role="group" aria-label="Resultado da negociação">
          {COMMERCIAL_VISIT_OUTCOME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`inf-choice${outcome === option.value ? ' is-selected' : ''}`}
              aria-pressed={outcome === option.value}
              onClick={() => {
                setOutcome(option.value);
                clearFieldError('outcome');
              }}
            >
              <span className="inf-choice-radio" aria-hidden="true" />
              <span className="inf-choice-text">
                <span className="inf-choice-label">{option.label}</span>
              </span>
            </button>
          ))}
        </div>
        {fieldErrors.outcome ? <p className="inf-card-error">{fieldErrors.outcome}</p> : null}

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

      {/* P4 — Observações gerais */}
      <section className="inf-card">
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            4
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
  );
}
