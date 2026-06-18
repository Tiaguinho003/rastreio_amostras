'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { ApiError, createVisitReport } from '../../lib/api-client';
import { maskPhoneInput } from '../../lib/client-field-formatters';
import { useRegisterDirtyState } from '../../lib/dirty-state/DirtyStateProvider';
import { useOnlineStatus } from '../../lib/offline/use-online-status';
import {
  addVisitToOutbox,
  countVisitOutbox,
  VISIT_OUTBOX_CHANGED_EVENT,
  type VisitOutboxPayload,
} from '../../lib/offline/visit-outbox';
import { flushVisitOutbox } from '../../lib/offline/visit-sync';
import { useToast } from '../../lib/toast/ToastProvider';
import type {
  SessionData,
  VisitClientKind,
  VisitFarmSize,
  VisitInterestLevel,
} from '../../lib/types';
import { VISIT_FARM_SIZE_OPTIONS, VISIT_INTEREST_OPTIONS } from '../../lib/visit-report';

// Formulario de visita — EXCLUSIVO do prospector, renderizado no
// BottomSheet do dashboard dele (VisitReportFormSheet). A pagina /informe
// virou placeholder dos futuros formularios por papel. Toda a logica
// (validacao, fila offline com Idempotency-Key, toasts, contador de
// pendentes) vive aqui; o sheet so decide o que fazer apos o envio.
// Identificacao do cliente e DECLARACAO ("Ja e cliente" / "Cliente novo"),
// sem lookup no banco: nome sempre; cidade/telefone (texto livre) so no
// "Cliente novo". Identico online e offline. O vinculo real com o cadastro e curadoria
// posterior do ADM/Cadastro no /resumo (linkVisitReportClient).
// Visual nativo do modal: as secoes .inf-card sao achatadas pelas regras
// .bottom-sheet.is-informe (sem chrome de card — divisorias suaves).

type VisitFieldName =
  | 'clientKind'
  | 'newClientName'
  | 'farmSize'
  | 'interestLevel'
  | 'sellsCurrently';

type VisitFieldErrors = Partial<Record<VisitFieldName, string>>;

// Payload do envio sem o capturedAt — a fila offline carimba a hora local
// do preenchimento na hora de enfileirar; envio online direto vai sem.
type VisitDraftPayload = Omit<VisitOutboxPayload, 'capturedAt'>;

interface VisitReportFormProps {
  session: SessionData;
  /** Chave no DirtyStateProvider (superficies distintas nao colidem). */
  dirtyStateKey?: string;
  /** Notifica a superficie quando o preenchimento comeca/limpa (callback
      deve ser estavel — useCallback no consumidor). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Chamado apos envio bem-sucedido (online ou enfileirado offline). */
  onSubmitted?: (info: { queued: boolean }) => void;
}

export function VisitReportForm({
  session,
  dirtyStateKey = 'informe-visit-form',
  onDirtyChange,
  onSubmitted,
}: VisitReportFormProps) {
  const toast = useToast();

  const [clientKind, setClientKind] = useState<VisitClientKind | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [newClientCity, setNewClientCity] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [farmSize, setFarmSize] = useState<VisitFarmSize | null>(null);
  const [farmSizeNotes, setFarmSizeNotes] = useState('');
  const [interestLevel, setInterestLevel] = useState<VisitInterestLevel | null>(null);
  const [interestNotes, setInterestNotes] = useState('');
  const [sellsCurrently, setSellsCurrently] = useState<boolean | null>(null);
  const [sellsToWhom, setSellsToWhom] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState<VisitFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [manualSyncing, setManualSyncing] = useState(false);

  const isOnline = useOnlineStatus();
  const formRef = useRef<HTMLFormElement | null>(null);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await countVisitOutbox(session.user.id));
  }, [session]);

  // Contador de pendentes: carrega ao montar e segue qualquer mudanca na
  // fila (enfileirou aqui, sync global removeu) via evento do outbox.
  useEffect(() => {
    void refreshPendingCount();
    const handleChanged = () => void refreshPendingCount();
    window.addEventListener(VISIT_OUTBOX_CHANGED_EVENT, handleChanged);
    return () => window.removeEventListener(VISIT_OUTBOX_CHANGED_EVENT, handleChanged);
  }, [refreshPendingCount]);

  const isDirty =
    clientKind !== null ||
    newClientName !== '' ||
    newClientCity !== '' ||
    newClientPhone !== '' ||
    farmSize !== null ||
    farmSizeNotes !== '' ||
    interestLevel !== null ||
    interestNotes !== '' ||
    sellsCurrently !== null ||
    sellsToWhom !== '' ||
    generalNotes !== '';

  useRegisterDirtyState(dirtyStateKey, isDirty, 'Informe de visita não enviado');

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

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
    setNewClientName('');
    setNewClientCity('');
    setNewClientPhone('');
    setFarmSize(null);
    setFarmSizeNotes('');
    setInterestLevel(null);
    setInterestNotes('');
    setSellsCurrently(null);
    setSellsToWhom('');
    setGeneralNotes('');
    setFieldErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const errors: VisitFieldErrors = {};
    if (!clientKind) {
      errors.clientKind = 'Selecione uma opção';
    } else if (!newClientName.trim()) {
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
      const clientName = newClientName.trim();
      const payload: VisitDraftPayload = {
        clientKind: clientKind as VisitClientKind,
        newClientName: clientName,
        newClientCity: newClientCity.trim() || null,
        newClientPhone: newClientPhone.trim() || null,
        farmSize: farmSize as VisitFarmSize,
        farmSizeNotes: farmSizeNotes.trim() || null,
        interestLevel: interestLevel as VisitInterestLevel,
        interestNotes: interestNotes.trim() || null,
        sellsCurrently: sellsCurrently as boolean,
        sellsToWhom: sellsCurrently ? sellsToWhom.trim() || null : null,
        generalNotes: generalNotes.trim() || null,
      };

      // Sem rede declarada: nem tenta — vai direto pra fila local.
      if (!navigator.onLine) {
        await queueOffline(payload);
        return;
      }

      try {
        await createVisitReport(session, payload);
      } catch (cause) {
        // navigator.onLine true nao garante internet real (wifi sem rota):
        // falha DE REDE no POST tambem enfileira em vez de perder o envio.
        if (cause instanceof ApiError && cause.status === 0) {
          await queueOffline(payload);
          return;
        }

        toast.error({
          title: 'Não foi possível enviar o informe',
          description:
            cause instanceof ApiError ? cause.message : 'Verifique sua conexão e tente novamente.',
        });
        return;
      }

      resetForm();
      toast.success({
        title: 'Informe enviado',
        description: clientName ? `Visita a ${clientName} registrada.` : 'Visita registrada.',
      });
      onSubmitted?.({ queued: false });
    } finally {
      setSubmitting(false);
    }
  }

  // Guarda o informe na caixa de saida local (IndexedDB) com a hora do
  // preenchimento. O id gerado aqui vira a Idempotency-Key do reenvio.
  async function queueOffline(payload: VisitDraftPayload) {
    const capturedAt = new Date().toISOString();
    try {
      await addVisitToOutbox({
        id: crypto.randomUUID(),
        userId: session.user.id,
        payload: { ...payload, capturedAt },
        capturedAt,
        attempts: 0,
        lastError: null,
      });

      resetForm();
      toast.success({
        title: 'Informe salvo no aparelho',
        description: 'Será enviado automaticamente quando a internet voltar.',
      });
      onSubmitted?.({ queued: true });
    } catch {
      toast.error({
        title: 'Não foi possível salvar no aparelho',
        description: 'Tente novamente quando houver conexão.',
      });
    }
  }

  // "Enviar agora" dos pendentes. Sucesso/falha definitiva e anunciado pelo
  // listener global (AppShell); aqui so cobrimos o caso silencioso de nada
  // ter saido (falha transitoria de rede com onLine=true).
  async function handleManualSync() {
    if (manualSyncing) {
      return;
    }

    setManualSyncing(true);
    try {
      const result = await flushVisitOutbox(session);
      if (result.sent === 0 && result.failed === 0 && !result.authExpired && result.remaining > 0) {
        toast.error({
          title: 'Não foi possível enviar agora',
          description: 'Verifique sua conexão e tente novamente.',
        });
      }
    } finally {
      setManualSyncing(false);
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
              Informes preenchidos agora ficam salvos no aparelho e são enviados quando a internet
              voltar.
            </p>
          </div>
        </div>
      ) : null}

      {pendingCount > 0 ? (
        <div className="inf-pending" role="status">
          <span className="inf-pending-badge">{pendingCount}</span>
          <span className="inf-pending-text">
            {pendingCount === 1 ? 'informe aguardando envio' : 'informes aguardando envio'}
          </span>
          {isOnline ? (
            <button
              type="button"
              className="inf-pending-send"
              disabled={manualSyncing}
              onClick={() => void handleManualSync()}
            >
              {manualSyncing ? 'Enviando…' : 'Enviar agora'}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* P1 — Identificação do cliente. Os dois pills sao DECLARACAO do
          prospector (sem busca no banco): "Ja e cliente" pede so o nome;
          "Cliente novo" abre tambem cidade/telefone. O vinculo real e
          curadoria do ADM/Cadastro no /resumo. */}
      <section
        className="inf-card"
        data-invalid={fieldErrors.clientKind || fieldErrors.newClientName ? 'true' : undefined}
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
              setNewClientCity('');
              setNewClientPhone('');
              clearFieldError('clientKind');
            }}
          >
            Já é cliente
          </button>
          <button
            type="button"
            className={`inf-pill${clientKind === 'NEW' ? ' is-selected' : ''}`}
            aria-pressed={clientKind === 'NEW'}
            onClick={() => {
              setClientKind('NEW');
              clearFieldError('clientKind');
            }}
          >
            Cliente novo
          </button>
        </div>
        {fieldErrors.clientKind ? <p className="inf-card-error">{fieldErrors.clientKind}</p> : null}

        {clientKind !== null ? (
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
            {clientKind === 'NEW' ? (
              <>
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
              </>
            ) : null}
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
        {fieldErrors.farmSize ? <p className="inf-card-error">{fieldErrors.farmSize}</p> : null}

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
      <section className="inf-card" data-invalid={fieldErrors.interestLevel ? 'true' : undefined}>
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
      <section className="inf-card" data-invalid={fieldErrors.sellsCurrently ? 'true' : undefined}>
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

      {/* P5 — Observações gerais */}
      <section className="inf-card">
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            5
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
