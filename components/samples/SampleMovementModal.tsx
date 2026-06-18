'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, getBlendFeasibility } from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type {
  ActiveBlendDetail,
  BlendFeasibilityResponse,
  ClientSummary,
  SampleMovement,
  SampleMovementType,
  SessionData,
} from '../../lib/types';
import { ClientLookupField } from '../clients/ClientLookupField';

type SampleMovementModalSubmitInput = {
  movementType: SampleMovementType;
  buyerClientId: string | null;
  buyerUnitId: string | null;
  quantitySacks: number;
  movementDate: string;
  notes: string | null;
  lossReasonText: string | null;
  reasonText: string | null;
};

type SampleMovementModalProps = {
  session: SessionData;
  open: boolean;
  mode: 'create' | 'edit';
  saving?: boolean;
  title: string;
  initialMovementType?: SampleMovementType;
  movement?: SampleMovement | null;
  availableSacks?: number;
  stampType?: SampleMovementType | null;
  // Liga B4 Fase 5: presente quando o sample e uma liga. Ativa o modo liga
  // — sem campo de quantidade (venda/perda e 100%); o modal pre-valida a
  // viabilidade da cascata (getBlendFeasibility) antes de habilitar o submit.
  blend?: { sampleId: string; ownerClientId: string | null } | null;
  // Liga B4 Fase 5b (F3.A): atribui um dono à liga sem dono antes da
  // movimentação. O painel implementa (updateRegistration + refetch).
  onAssignOwner?: (ownerClientId: string) => Promise<void>;
  // Liga B4 Fase 8 (B3.8): ligas ativas que usam este sample como origem.
  // So pra amostra normal — dispara um aviso informativo nao-bloqueante ao
  // vender/perder (pode inviabilizar essas ligas). Vazio = sem aviso.
  activeBlends?: ActiveBlendDetail[];
  onClose: () => void;
  onSubmit: (data: SampleMovementModalSubmitInput) => Promise<void> | void;
};

function toClientSummary(client: SampleMovement['buyerClient']): ClientSummary | null {
  if (!client) {
    return null;
  }

  return {
    id: client.id,
    code: client.code,
    personType: client.personType,
    displayName: client.displayName,
    fullName: client.fullName,
    legalName: client.legalName,
    tradeName: client.tradeName,
    cpf: client.cpf,
    cnpj: client.cnpj,
    document: client.personType === 'PF' ? client.cpf : client.cnpj,
    phone: client.phone,
    email: null,
    addressLine: null,
    district: null,
    city: null,
    state: null,
    postalCode: null,
    complement: null,
    registrationNumber: null,
    isBuyer: client.isBuyer,
    isSeller: client.isSeller,
    isWarehouse: client.isWarehouse,
    status: client.status,
    commercialUser: null,
    commercialUsers: [],
    units: [],
    unitCount: 0,
    activeUnitCount: 0,
    primaryCity: null,
    primaryState: null,
    createdAt: null,
    updatedAt: null,
  };
}

function todayAsInputDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function SampleMovementModal({
  session,
  open,
  mode,
  saving = false,
  title,
  initialMovementType = 'SALE',
  movement = null,
  availableSacks = 0,
  stampType = null,
  blend = null,
  activeBlends = [],
  onAssignOwner,
  onClose,
  onSubmit,
}: SampleMovementModalProps) {
  const focusTrapRef = useFocusTrap(open);
  const [movementType, setMovementType] = useState<SampleMovementType>(
    movement?.movementType ?? initialMovementType
  );
  const [buyerClient, setBuyerClient] = useState<ClientSummary | null>(
    toClientSummary(movement?.buyerClient ?? null)
  );
  const [quantitySacks, setQuantitySacks] = useState(String(movement?.quantitySacks ?? ''));
  const [movementDate, setMovementDate] = useState(movement?.movementDate ?? todayAsInputDate());
  const [notes, setNotes] = useState(movement?.notes ?? '');
  const [lossReasonText, setLossReasonText] = useState(movement?.lossReasonText ?? '');
  const [reasonText, setReasonText] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Liga B4 Fase 5: viabilidade da venda da liga (pre-validacao da cascata).
  const [feasibility, setFeasibility] = useState<BlendFeasibilityResponse | null>(null);
  const [feasibilityLoading, setFeasibilityLoading] = useState(false);
  const [feasibilityError, setFeasibilityError] = useState<string | null>(null);
  // Liga B4 Fase 5b (F3.A): bloco "sem dono". `ownerDismissed` = operador
  // escolheu "Continuar mesmo assim"; o sub-modal coleta o dono a atribuir.
  const [ownerDismissed, setOwnerDismissed] = useState(false);
  const [ownerModalOpen, setOwnerModalOpen] = useState(false);
  const [ownerPickClient, setOwnerPickClient] = useState<ClientSummary | null>(null);
  const [assigningOwner, setAssigningOwner] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  // Liga B4 Fase 8 (B3.8): aviso de origem em liga(s). `dismissed` = clicou
  // "Continuar mesmo assim"; `expanded` = lista de ligas aberta.
  const [blendWarningDismissed, setBlendWarningDismissed] = useState(false);
  const [blendWarningExpanded, setBlendWarningExpanded] = useState(false);

  const isBlend = blend !== null;
  // Dependência estável pro effect de viabilidade — o objeto `blend` é
  // recriado a cada render do parent; só o sampleId importa.
  const blendSampleId = blend?.sampleId ?? null;
  const showBuyerFields = movementType === 'SALE';
  const effectiveLimit =
    mode === 'edit' && movement ? availableSacks + movement.quantitySacks : availableSacks;
  // Liga inviavel: alguma origem sem saldo pra cobrir a cascata (F7.6).
  // So no modo create — editar comprador/data nao muda viabilidade.
  const blendInfeasible =
    mode === 'create' && isBlend && feasibility !== null && !feasibility.feasible;
  // F3.A: liga sem dono — nudge ate o operador atribuir um dono ou escolher
  // "Continuar mesmo assim". So no modo create.
  const needsOwnerNudge =
    mode === 'create' && blend !== null && blend.ownerClientId === null && !ownerDismissed;
  // Liga B4 Fase 8 (B3.8): aviso nao-bloqueante quando a amostra (origem)
  // participa de liga(s) ativa(s). So ao criar venda/perda.
  const showBlendOriginWarning =
    mode === 'create' && activeBlends.length > 0 && !blendWarningDismissed;
  // Sub-modal de atribuir dono: confirma com o cliente escolhido (a amostra/
  // lote nao vincula mais fazenda/unit).
  const ownerAssignDisabled = ownerPickClient === null;

  useEffect(() => {
    if (!open) {
      return;
    }

    setMovementType(movement?.movementType ?? initialMovementType);
    setBuyerClient(toClientSummary(movement?.buyerClient ?? null));
    setQuantitySacks(movement?.quantitySacks ? String(movement.quantitySacks) : '');
    setMovementDate(movement?.movementDate ?? todayAsInputDate());
    setNotes(movement?.notes ?? '');
    setLossReasonText(movement?.lossReasonText ?? '');
    setReasonText('');
    setError(null);
    setOwnerDismissed(false);
    setOwnerModalOpen(false);
    setOwnerPickClient(null);
    setAssigningOwner(false);
    setOwnerError(null);
    setBlendWarningDismissed(false);
    setBlendWarningExpanded(false);
  }, [initialMovementType, movement, open]);

  // Liga B4 Fase 5: ao abrir o modal de uma liga, busca a viabilidade da
  // venda — a arvore de descendentes e quais origens nao tem saldo pra
  // cobrir a cascata. Bloqueia o submit enquanto carrega / se inviavel.
  useEffect(() => {
    // Liga B4 Fase 6: a pre-validacao de viabilidade so faz sentido ao
    // CRIAR uma venda — editar comprador/data nao muda a viabilidade.
    if (!open || !blendSampleId || mode !== 'create') {
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
        if (controller.signal.aborted) {
          return;
        }
        setFeasibility(result);
      })
      .catch((cause) => {
        if (controller.signal.aborted) {
          return;
        }
        setFeasibilityError(
          cause instanceof ApiError ? cause.message : 'Falha ao verificar a viabilidade da liga'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setFeasibilityLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [open, blendSampleId, mode, session]);

  const parsedQuantity = Number(quantitySacks);
  const isQuantityValid =
    Number.isInteger(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= effectiveLimit;
  const isQuantityOverLimit = Number.isInteger(parsedQuantity) && parsedQuantity > effectiveLimit;

  const submitDisabled = useMemo(() => {
    if (!movementDate) {
      return true;
    }

    // Liga (Fase 5): sem campo de quantidade — venda/perda e 100%. Bloqueia
    // enquanto a viabilidade carrega, em erro, ou se a liga esta inviavel.
    if (isBlend) {
      if (feasibilityLoading || feasibilityError !== null || blendInfeasible) {
        return true;
      }
    } else if (!quantitySacks.trim() || !isQuantityValid) {
      return true;
    }

    if (showBuyerFields && !buyerClient) {
      return true;
    }

    if (mode === 'edit' && !reasonText.trim()) {
      return true;
    }

    // F3.A: a liga sem dono trava o submit até o operador decidir — atribuir
    // um dono ou "Continuar mesmo assim". Nudge consciente, não um bloqueio
    // (uma das opções sempre destrava).
    if (needsOwnerNudge) {
      return true;
    }

    return false;
  }, [
    blendInfeasible,
    buyerClient,
    feasibilityError,
    feasibilityLoading,
    isBlend,
    isQuantityValid,
    mode,
    movementDate,
    needsOwnerNudge,
    quantitySacks,
    reasonText,
    showBuyerFields,
  ]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Liga (Fase 5): a quantidade e 100% (o backend ignora o input e
    // calcula); a venda so e barrada pela pre-validacao de viabilidade.
    if (isBlend) {
      if (feasibilityLoading || feasibilityError !== null || blendInfeasible) {
        return;
      }
    } else if (!isQuantityValid) {
      if (isQuantityOverLimit) {
        setError(
          `Maximo de ${effectiveLimit} ${effectiveLimit === 1 ? 'saca disponivel' : 'sacas disponiveis'}.`
        );
      } else {
        setError('Quantidade de sacas deve ser um numero inteiro maior que zero.');
      }
      return;
    }

    if (showBuyerFields && !buyerClient) {
      setError('Selecione um comprador para registrar a venda.');
      return;
    }

    if (mode === 'edit' && !reasonText.trim()) {
      setError('Informe o motivo da edicao da movimentacao.');
      return;
    }

    setError(null);
    await onSubmit({
      movementType,
      buyerClientId: showBuyerFields ? (buyerClient?.id ?? null) : null,
      buyerUnitId: null,
      quantitySacks: isBlend ? availableSacks : parsedQuantity,
      movementDate,
      notes: notes.trim() ? notes.trim() : null,
      lossReasonText: showBuyerFields ? null : lossReasonText.trim(),
      reasonText: mode === 'edit' ? reasonText.trim() : null,
    });
  }

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className={`app-modal is-themed is-action sample-detail-movement-modal${
          stampType ? ' is-stamping' : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sample-movement-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="sample-movement-modal-title" className="app-modal-title">
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        {error ? <p className="sdv-modal-error">{error}</p> : null}

        {needsOwnerNudge ? (
          <div className="sdv-blend-no-owner">
            <p className="sdv-blend-no-owner-text">
              Esta liga não tem dono atribuído —{' '}
              {movementType === 'SALE'
                ? 'a venda será registrada em nome da corretora.'
                : 'a perda será registrada sem produtor identificado.'}
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
                {activeBlends.length === 1 ? 'liga ativa' : 'ligas ativas'}.{' '}
                {movementType === 'SALE' ? 'Vender' : 'Registrar a perda'} aqui pode tornar{' '}
                {activeBlends.length === 1 ? 'essa liga inviável' : 'essas ligas inviáveis'}.
              </p>
            </div>
            {blendWarningExpanded ? (
              <ul className="sdv-blend-origin-warn-list">
                {activeBlends.map((item) => (
                  <li key={item.sampleId}>
                    Liga {item.lotNumber ?? item.sampleId.slice(0, 8)} — usa {item.contributedSacks}{' '}
                    sc
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

        <form className="app-modal-content" onSubmit={handleSubmit}>
          {showBuyerFields ? (
            <div className="app-modal-field">
              <span className="app-modal-label">Comprador</span>
              <ClientLookupField
                session={session}
                label="Comprador"
                kind="buyer"
                selectedClient={buyerClient}
                disabled={saving}
                compact
                onSelectClient={(client) => {
                  setBuyerClient(client);
                  setError(null);
                }}
                emptyMessage="Nenhum comprador encontrado."
              />
            </div>
          ) : (
            <label className="app-modal-field">
              <span className="app-modal-label">Motivo da perda</span>
              <input
                className="app-modal-input"
                value={lossReasonText}
                disabled={saving}
                onChange={(event) => setLossReasonText(event.target.value.toUpperCase())}
                placeholder="Descreva a origem da perda"
              />
            </label>
          )}

          {isBlend ? (
            <>
              {/* Liga (Fase 5): a venda/perda de uma liga e 100% — sem campo
                  de quantidade. Mostra o total e a pre-validacao da cascata. */}
              <div className="sdv-blend-mov-total">
                <span className="sdv-blend-mov-total-label">
                  {mode === 'edit'
                    ? movementType === 'SALE'
                      ? 'Venda da liga inteira'
                      : 'Perda da liga inteira'
                    : movementType === 'SALE'
                      ? 'Vai vender a liga inteira'
                      : 'Vai registrar a perda da liga inteira'}
                </span>
                <span className="sdv-blend-mov-total-value">{effectiveLimit} sc</span>
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

              <label className="app-modal-field">
                <span className="app-modal-label">Data</span>
                <input
                  className="app-modal-input"
                  type="date"
                  value={movementDate}
                  disabled={saving}
                  onChange={(event) => setMovementDate(event.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <div className="app-modal-field">
                <span className="app-modal-label">
                  Sacas <span className="sdv-edit-label-hint">({effectiveLimit} disp.)</span>
                </span>
                <div className="sdv-mov-qty-inline">
                  <input
                    className={`app-modal-input${isQuantityOverLimit ? ' has-error' : ''}`}
                    value={quantitySacks}
                    inputMode="numeric"
                    disabled={saving}
                    onChange={(event) => {
                      setQuantitySacks(event.target.value.replace(/[^0-9]/g, ''));
                      setError(null);
                    }}
                  />
                  {effectiveLimit > 0 ? (
                    <button
                      type="button"
                      className="sdv-mov-all-btn"
                      disabled={saving}
                      onClick={() => setQuantitySacks(String(effectiveLimit))}
                    >
                      Todas
                    </button>
                  ) : null}
                </div>
              </div>
              <label className="app-modal-field">
                <span className="app-modal-label">Data</span>
                <input
                  className="app-modal-input"
                  type="date"
                  value={movementDate}
                  disabled={saving}
                  onChange={(event) => setMovementDate(event.target.value)}
                />
              </label>
            </>
          )}

          {showBuyerFields ? (
            <label className="app-modal-field">
              <span className="app-modal-label">Observacoes (opcional)</span>
              <input
                className="app-modal-input"
                value={notes}
                disabled={saving}
                onChange={(event) => setNotes(event.target.value.toUpperCase())}
                placeholder="Observacoes adicionais"
              />
            </label>
          ) : null}

          {mode === 'edit' ? (
            <label className="app-modal-field">
              <span className="app-modal-label">Motivo da edicao</span>
              <input
                className="app-modal-input"
                value={reasonText}
                disabled={saving}
                onChange={(event) => setReasonText(event.target.value.toUpperCase())}
                placeholder="Obrigatorio"
              />
            </label>
          ) : null}

          <div className="app-modal-actions sample-detail-movement-actions">
            <button
              type="button"
              className="app-modal-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button type="submit" className="app-modal-submit" disabled={saving || submitDisabled}>
              {saving ? 'Salvando...' : mode === 'create' ? 'Registrar' : 'Salvar'}
            </button>
          </div>
        </form>

        {ownerModalOpen
          ? createPortal(
              <div
                className="app-modal-backdrop is-stacked"
                onClick={() => {
                  if (!assigningOwner) setOwnerModalOpen(false);
                }}
              >
                <section
                  className="app-modal is-themed is-action is-stacked sample-detail-movement-owner-modal"
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
                        A venda/perda passa a ser registrada em nome dele.
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
                          if (!onAssignOwner || !ownerPickClient) {
                            return;
                          }
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

        {stampType ? (
          <div
            className={`sdv-stamp-overlay is-${stampType === 'SALE' ? 'sale' : 'loss'}`}
            aria-hidden="true"
          >
            <div className="sdv-stamp">
              <span className="sdv-stamp-text">{stampType === 'SALE' ? 'Vendido' : 'Perdido'}</span>
            </div>
          </div>
        ) : null}
      </section>
    </div>,
    document.body
  );
}
