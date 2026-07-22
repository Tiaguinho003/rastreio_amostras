'use client';

// Painel "Registrar perda" — sucessor do `SampleMovementModal` (central) para o
// unico fluxo que sobrou vivo nele. A venda migrou pra /contratos ha tempos e
// levou junto o modo `edit` (editar movimentacao virou dropdown inline no card
// da timeline): o modal carregava ~900 linhas de comprador, preco, corretagens
// e corretores que nenhuma tela abria mais.
//
// Painel lateral porque perda e um FORMULARIO que o operador preenche (RD11) —
// e porque as outras duas acoes do mesmo menu ⋯ (enviar, imprimir) ja sao
// paineis; deixar uma delas central era a unica quebra da fileira.
//
// O que veio junto do modal, sem mudanca de regra: o nudge de liga sem dono
// (com o sub-form de atribuir), o aviso de amostra que e origem de ligas
// ativas, e a pre-validacao de viabilidade da cascata (getBlendFeasibility) —
// numa liga a perda e sempre 100%, entao nao ha campo de quantidade.

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, getBlendFeasibility } from '../../lib/api-client';
import type {
  ActiveBlendDetail,
  BlendFeasibilityResponse,
  ClientSummary,
  SessionData,
} from '../../lib/types';
import { BottomSheet } from '../BottomSheet';
import { ClientLookupField } from '../clients/ClientLookupField';

export type SampleLossSubmitInput = {
  quantitySacks: number;
  movementDate: string;
  lossReasonText: string | null;
};

type SampleLossSheetProps = {
  session: SessionData;
  open: boolean;
  saving?: boolean;
  /** Aberto SOBRE o drawer do lote (⋯ do hero) — sobe pro tier stacked. */
  stacked?: boolean;
  availableSacks?: number;
  // Presente quando o lote e uma liga: ativa o modo liga (perda de 100%, com
  // pre-validacao da cascata) e o nudge de dono.
  blend?: {
    sampleId: string;
    ownerClientId: string | null;
    blendOwnerPinned?: boolean;
  } | null;
  /** Atribui um dono a liga sem dono antes da perda. O host implementa. */
  onAssignOwner?: (ownerClientId: string) => Promise<void>;
  /** Ligas ativas que usam este lote como origem — aviso nao-bloqueante. */
  activeBlends?: ActiveBlendDetail[];
  onClose: () => void;
  onSubmit: (data: SampleLossSubmitInput) => Promise<void> | void;
};

function todayAsInputDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function SampleLossSheet({
  session,
  open,
  saving = false,
  stacked = false,
  availableSacks = 0,
  blend = null,
  activeBlends = [],
  onAssignOwner,
  onClose,
  onSubmit,
}: SampleLossSheetProps) {
  const [quantitySacks, setQuantitySacks] = useState('');
  const [movementDate, setMovementDate] = useState(todayAsInputDate());
  const [lossReasonText, setLossReasonText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Viabilidade da cascata (liga).
  const [feasibility, setFeasibility] = useState<BlendFeasibilityResponse | null>(null);
  const [feasibilityLoading, setFeasibilityLoading] = useState(false);
  const [feasibilityError, setFeasibilityError] = useState<string | null>(null);

  // Liga sem dono: `ownerDismissed` = escolheu "Continuar mesmo assim"; o
  // sub-form coleta o dono a atribuir.
  const [ownerDismissed, setOwnerDismissed] = useState(false);
  const [ownerModalOpen, setOwnerModalOpen] = useState(false);
  const [ownerPickClient, setOwnerPickClient] = useState<ClientSummary | null>(null);
  const [assigningOwner, setAssigningOwner] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  // Aviso de origem em liga(s): `dismissed` = "Continuar mesmo assim".
  const [blendWarningDismissed, setBlendWarningDismissed] = useState(false);
  const [blendWarningExpanded, setBlendWarningExpanded] = useState(false);

  const isBlend = blend !== null;
  // Dependencia estavel pro effect de viabilidade — o objeto `blend` e recriado
  // a cada render do host; so o sampleId importa.
  const blendSampleId = blend?.sampleId ?? null;
  const blendInfeasible = isBlend && feasibility !== null && !feasibility.feasible;
  // Liga (dono fixado): NAO alerta quando o dono foi FIXADO como "carteira da
  // corretora" (blendOwnerPinned + owner null) — foi escolha consciente.
  const needsOwnerNudge =
    blend !== null && blend.ownerClientId === null && !blend.blendOwnerPinned && !ownerDismissed;
  const showBlendOriginWarning = activeBlends.length > 0 && !blendWarningDismissed;
  const ownerAssignDisabled = ownerPickClient === null;

  useEffect(() => {
    if (!open) return;
    setQuantitySacks('');
    setMovementDate(todayAsInputDate());
    setLossReasonText('');
    setError(null);
    setOwnerDismissed(false);
    setOwnerModalOpen(false);
    setOwnerPickClient(null);
    setAssigningOwner(false);
    setOwnerError(null);
    setBlendWarningDismissed(false);
    setBlendWarningExpanded(false);
  }, [open]);

  useEffect(() => {
    if (!open || !blendSampleId) {
      setFeasibility(null);
      setFeasibilityError(null);
      setFeasibilityLoading(false);
      return;
    }

    const controller = new AbortController();
    setFeasibilityLoading(true);
    setFeasibility(null);
    setFeasibilityError(null);

    getBlendFeasibility(session, blendSampleId, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setFeasibility(result);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setFeasibilityError(
          cause instanceof ApiError ? cause.message : 'Falha ao verificar a viabilidade da liga'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setFeasibilityLoading(false);
      });

    return () => controller.abort();
  }, [open, blendSampleId, session]);

  const parsedQuantity = Number(quantitySacks);
  const isQuantityValid =
    Number.isInteger(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= availableSacks;
  const isQuantityOverLimit = Number.isInteger(parsedQuantity) && parsedQuantity > availableSacks;

  const submitDisabled = useMemo(() => {
    if (!movementDate) return true;
    if (isBlend) {
      if (feasibilityLoading || feasibilityError !== null || blendInfeasible) return true;
    } else if (!quantitySacks.trim() || !isQuantityValid) {
      return true;
    }
    // A liga sem dono trava o submit ate o operador decidir — atribuir um dono
    // ou "Continuar mesmo assim". Nudge consciente: as duas opcoes destravam.
    if (needsOwnerNudge) return true;
    return false;
  }, [
    blendInfeasible,
    feasibilityError,
    feasibilityLoading,
    isBlend,
    isQuantityValid,
    movementDate,
    needsOwnerNudge,
    quantitySacks,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    // Liga: a quantidade e 100% (o backend calcula); so a pre-validacao barra.
    if (isBlend) {
      if (feasibilityLoading || feasibilityError !== null || blendInfeasible) return;
    } else if (!isQuantityValid) {
      setError(
        isQuantityOverLimit
          ? `Maximo de ${availableSacks} ${availableSacks === 1 ? 'saca disponivel' : 'sacas disponiveis'}.`
          : 'Quantidade de sacas deve ser um numero inteiro maior que zero.'
      );
      return;
    }

    setError(null);
    await onSubmit({
      quantitySacks: isBlend ? availableSacks : parsedQuantity,
      movementDate,
      lossReasonText: lossReasonText.trim() || null,
    });
  }

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        onDismissAttempt={() => !saving && !ownerModalOpen}
        ariaLabel="Registrar perda"
        stacked={stacked}
        closeVariant="edge-back"
        dragDisabled={saving}
        className="fv-panel-sheet side-sheet sample-loss-sheet"
        footer={
          <button
            type="submit"
            form="sample-loss-form"
            className="app-modal-submit"
            disabled={saving || submitDisabled}
          >
            {saving ? 'Registrando...' : 'Registrar perda'}
          </button>
        }
      >
        <>
          <p className="fv-panel-lead">
            As sacas saem do saldo do lote e a perda entra na linha do tempo.
          </p>

          {needsOwnerNudge ? (
            <div className="sdv-blend-no-owner">
              <p className="sdv-blend-no-owner-text">
                Esta liga não tem dono atribuído — a perda será registrada sem produtor
                identificado.
              </p>
              <div className="sdv-blend-no-owner-actions">
                <button
                  type="button"
                  className="sdv-blend-no-owner-assign"
                  disabled={saving}
                  onClick={() => {
                    setOwnerPickClient(null);
                    setOwnerError(null);
                    setOwnerModalOpen(true);
                  }}
                >
                  Atribuir dono primeiro
                </button>
                <button
                  type="button"
                  className="sdv-blend-no-owner-skip"
                  disabled={saving}
                  onClick={() => setOwnerDismissed(true)}
                >
                  Continuar mesmo assim
                </button>
              </div>
            </div>
          ) : null}

          {showBlendOriginWarning ? (
            <div className="sdv-blend-origin-warn">
              <div className="sdv-blend-origin-warn-head">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                <p className="sdv-blend-origin-warn-text">
                  Esta amostra é origem de {activeBlends.length}{' '}
                  {activeBlends.length === 1 ? 'liga ativa' : 'ligas ativas'}. Registrar a perda
                  aqui pode tornar{' '}
                  {activeBlends.length === 1 ? 'essa liga inviável' : 'essas ligas inviáveis'}.
                </p>
              </div>
              {blendWarningExpanded ? (
                <ul className="sdv-blend-origin-warn-list">
                  {activeBlends.map((item) => (
                    <li key={item.sampleId}>
                      Liga {item.lotNumber ?? item.sampleId.slice(0, 8)} — usa{' '}
                      {item.contributedSacks} sc
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="sdv-blend-origin-warn-actions">
                <button
                  type="button"
                  className="sdv-blend-origin-warn-toggle"
                  disabled={saving}
                  onClick={() => setBlendWarningExpanded((value) => !value)}
                >
                  {blendWarningExpanded ? 'Ocultar ligas' : 'Ver ligas'}
                </button>
                <button
                  type="button"
                  className="sdv-blend-origin-warn-dismiss"
                  disabled={saving}
                  onClick={() => setBlendWarningDismissed(true)}
                >
                  Continuar mesmo assim
                </button>
              </div>
            </div>
          ) : null}

          <form id="sample-loss-form" className="fv-form-body" onSubmit={handleSubmit}>
            <label className="fv-form-field">
              <span className="fv-form-label">Motivo da perda</span>
              <input
                value={lossReasonText}
                disabled={saving}
                onChange={(event) => setLossReasonText(event.target.value.toUpperCase())}
                placeholder="Descreva a origem da perda"
              />
            </label>

            {/* Liga: a perda e 100% — bloco de total no lugar do campo de sacas. */}
            {isBlend ? (
              <>
                <div className="fv-form-row">
                  <label className="fv-form-field">
                    <span className="fv-form-label">Data</span>
                    <input
                      type="date"
                      value={movementDate}
                      disabled={saving}
                      onChange={(event) => setMovementDate(event.target.value)}
                    />
                  </label>
                </div>

                <div className="sdv-blend-mov-total">
                  <span className="sdv-blend-mov-total-label">
                    Vai registrar a perda da liga inteira
                  </span>
                  <span className="sdv-blend-mov-total-value">{availableSacks} sc</span>
                </div>

                {feasibilityLoading ? (
                  <p className="sdv-modal-hint">Verificando as origens da liga...</p>
                ) : null}
                {feasibilityError ? <p className="sdv-modal-error">{feasibilityError}</p> : null}
                {blendInfeasible && feasibility ? (
                  <div className="sdv-warn-box">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                    <div className="sdv-warn-text">
                      <strong>Esta liga nao pode ser fechada agora</strong>
                      Origem(ns) sem saldo suficiente pra cascata:
                      <ul className="sdv-blend-mov-blockers">
                        {feasibility.blockingOrigins.map((origin) => (
                          <li key={origin.sampleId}>
                            Lote {origin.lotNumber ?? origin.sampleId.slice(0, 8)} — precisa{' '}
                            {origin.contributedSacks} sc, tem {origin.availableSacks} sc
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="fv-form-row fv-form-row-2col">
                <label className="fv-form-field">
                  <span className="fv-form-label">Data</span>
                  <input
                    type="date"
                    value={movementDate}
                    disabled={saving}
                    onChange={(event) => setMovementDate(event.target.value)}
                  />
                </label>
                <label className={`fv-form-field${isQuantityOverLimit ? ' is-field-error' : ''}`}>
                  <span className="fv-form-label">
                    Sacas <span className="sdv-edit-label-hint">({availableSacks} disp.)</span>
                  </span>
                  <input
                    value={quantitySacks}
                    inputMode="numeric"
                    disabled={saving}
                    onChange={(event) => {
                      setQuantitySacks(event.target.value.replace(/[^0-9]/g, ''));
                      setError(null);
                    }}
                  />
                </label>
              </div>
            )}

            {error ? <p className="sdv-modal-error">{error}</p> : null}
          </form>
        </>
      </BottomSheet>

      {/* Atribuir dono: sub-decisao DENTRO do painel — central sobre a faixa,
        com `.fv-panel-scrim` (mesmo tratamento dos confirms sobre painel). */}
      {open && ownerModalOpen
        ? createPortal(
            <div className="app-modal-backdrop fv-panel-scrim">
              <section
                className="app-modal is-themed is-action sample-loss-owner-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="assign-owner-modal-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="assign-owner-modal-title" className="app-modal-title">
                      Atribuir dono à liga
                    </h3>
                    <p className="app-modal-description">
                      A perda passa a ser registrada em nome dele.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="app-modal-close"
                    onClick={() => {
                      if (!assigningOwner) setOwnerModalOpen(false);
                    }}
                    disabled={assigningOwner}
                    aria-label="Fechar"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </header>

                <div className="app-modal-content">
                  {ownerError ? <p className="sdv-modal-error">{ownerError}</p> : null}

                  <div className="app-modal-field">
                    <span className="app-modal-label">Dono</span>
                    <ClientLookupField
                      session={session}
                      label="Dono"
                      kind="owner"
                      selectedClient={ownerPickClient}
                      disabled={assigningOwner}
                      compact
                      onSelectClient={(client) => {
                        setOwnerPickClient(client);
                        setOwnerError(null);
                      }}
                      emptyMessage="Nenhum cliente encontrado."
                    />
                  </div>

                  <div className="app-modal-actions">
                    <button
                      type="button"
                      className="app-modal-submit"
                      disabled={assigningOwner || ownerAssignDisabled}
                      onClick={async () => {
                        if (!onAssignOwner || !ownerPickClient) return;
                        setAssigningOwner(true);
                        setOwnerError(null);
                        try {
                          await onAssignOwner(ownerPickClient.id);
                          setOwnerModalOpen(false);
                        } catch (cause) {
                          setOwnerError(
                            cause instanceof ApiError ? cause.message : 'Falha ao atribuir o dono'
                          );
                        } finally {
                          setAssigningOwner(false);
                        }
                      }}
                    >
                      {assigningOwner ? 'Atribuindo...' : 'Atribuir dono'}
                    </button>
                    <button
                      type="button"
                      className="app-modal-secondary"
                      onClick={() => {
                        if (!assigningOwner) setOwnerModalOpen(false);
                      }}
                      disabled={assigningOwner}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
