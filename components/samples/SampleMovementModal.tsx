'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, getClient } from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type {
  ClientBranchSummary,
  ClientSummary,
  SampleMovement,
  SampleMovementType,
  SessionData,
} from '../../lib/types';
import { ClientLookupField } from '../clients/ClientLookupField';
import { ClientBranchSelect } from '../clients/ClientBranchSelect';

type SampleMovementModalSubmitInput = {
  movementType: SampleMovementType;
  buyerClientId: string | null;
  buyerBranchId: string | null;
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
    isBuyer: client.isBuyer,
    isSeller: client.isSeller,
    status: client.status,
    commercialUser: null,
    commercialUsers: [],
    branches: [],
    branchCount: 0,
    activeBranchCount: 0,
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
  const [buyerBranches, setBuyerBranches] = useState<ClientBranchSummary[]>([]);
  const [buyerBranchId, setBuyerBranchId] = useState<string | null>(
    movement?.buyerBranchId ?? null
  );
  const [quantitySacks, setQuantitySacks] = useState(String(movement?.quantitySacks ?? ''));
  const [movementDate, setMovementDate] = useState(movement?.movementDate ?? todayAsInputDate());
  const [notes, setNotes] = useState(movement?.notes ?? '');
  const [lossReasonText, setLossReasonText] = useState(movement?.lossReasonText ?? '');
  const [reasonText, setReasonText] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showBuyerFields = movementType === 'SALE';
  const effectiveLimit =
    mode === 'edit' && movement ? availableSacks + movement.quantitySacks : availableSacks;

  useEffect(() => {
    if (!open) {
      return;
    }

    setMovementType(movement?.movementType ?? initialMovementType);
    setBuyerClient(toClientSummary(movement?.buyerClient ?? null));
    setBuyerBranchId(movement?.buyerBranchId ?? null);
    setQuantitySacks(movement?.quantitySacks ? String(movement.quantitySacks) : '');
    setMovementDate(movement?.movementDate ?? todayAsInputDate());
    setNotes(movement?.notes ?? '');
    setLossReasonText(movement?.lossReasonText ?? '');
    setReasonText('');
    setError(null);
  }, [initialMovementType, movement, open]);

  useEffect(() => {
    if (!open || !buyerClient) {
      setBuyerBranches([]);
      setLoadingBranches(false);
      if (movementType === 'SALE') {
        setBuyerBranchId(null);
      }
      return;
    }

    const controller = new AbortController();
    setLoadingBranches(true);

    getClient(session, buyerClient.id, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        const activeBranches = response.branches.filter((branch) => branch.status === 'ACTIVE');
        setBuyerBranches(activeBranches);
      })
      .catch((cause) => {
        if (controller.signal.aborted) {
          return;
        }

        setBuyerBranches([]);
        setBuyerBranchId(null);
        setError(
          cause instanceof ApiError ? cause.message : 'Falha ao carregar filiais do comprador'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingBranches(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [buyerClient, movementType, open, session]);

  const parsedQuantity = Number(quantitySacks);
  const isQuantityValid =
    Number.isInteger(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= effectiveLimit;
  const isQuantityOverLimit = Number.isInteger(parsedQuantity) && parsedQuantity > effectiveLimit;

  const submitDisabled = useMemo(() => {
    if (!quantitySacks.trim() || !movementDate || !isQuantityValid) {
      return true;
    }

    if (showBuyerFields && !buyerClient) {
      return true;
    }

    if (mode === 'edit' && !reasonText.trim()) {
      return true;
    }

    return false;
  }, [
    buyerClient,
    isQuantityValid,
    mode,
    movementDate,
    quantitySacks,
    reasonText,
    showBuyerFields,
  ]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isQuantityValid) {
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
      buyerBranchId: showBuyerFields ? buyerBranchId : null,
      quantitySacks: parsedQuantity,
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
        className="app-modal cdm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sample-movement-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cdm-header">
          <h3 id="sample-movement-modal-title" className="cdm-header-name">
            {title}
          </h3>
          <button
            type="button"
            className="app-modal-close cdm-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {error ? <p className="sdv-modal-error">{error}</p> : null}

        <form className="sdv-edit-fields" onSubmit={handleSubmit}>
          {showBuyerFields ? (
            <>
              <div className="sdv-edit-field">
                <ClientLookupField
                  session={session}
                  label="Comprador"
                  kind="buyer"
                  selectedClient={buyerClient}
                  disabled={saving}
                  compact
                  onSelectClient={(client) => {
                    setBuyerClient(client);
                    setBuyerBranchId(null);
                    setError(null);
                  }}
                  emptyMessage="Nenhum comprador encontrado."
                />
              </div>
              {buyerClient ? (
                <div className="sdv-edit-field">
                  <ClientBranchSelect
                    label="Filial"
                    branches={buyerBranches}
                    value={buyerBranchId}
                    disabled={saving || loadingBranches}
                    onChange={setBuyerBranchId}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Motivo da perda</span>
              <input
                className="sdv-edit-input"
                value={lossReasonText}
                disabled={saving}
                onChange={(event) => setLossReasonText(event.target.value.toUpperCase())}
                placeholder="Descreva a origem da perda"
              />
            </label>
          )}

          <div className="sdv-edit-row">
            <div className="sdv-edit-field">
              <span className="sdv-edit-label">
                Sacas{' '}
                <span className="sdv-edit-label-hint">
                  ({effectiveLimit} {effectiveLimit === 1 ? 'disponivel' : 'disponiveis'})
                </span>
              </span>
              <div className="sdv-edit-row-inline">
                <input
                  className={`sdv-edit-input${isQuantityOverLimit ? ' has-error' : ''}`}
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
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Data</span>
              <input
                className="sdv-edit-input"
                type="date"
                value={movementDate}
                disabled={saving}
                onChange={(event) => setMovementDate(event.target.value)}
              />
            </label>
          </div>

          <label className="sdv-edit-field">
            <span className="sdv-edit-label">Observacoes (opcional)</span>
            <input
              className="sdv-edit-input"
              value={notes}
              disabled={saving}
              onChange={(event) => setNotes(event.target.value.toUpperCase())}
              placeholder="Observacoes adicionais"
            />
          </label>

          {mode === 'edit' ? (
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Motivo da edicao</span>
              <input
                className="sdv-edit-input"
                value={reasonText}
                disabled={saving}
                onChange={(event) => setReasonText(event.target.value.toUpperCase())}
                placeholder="Obrigatorio"
              />
            </label>
          ) : null}

          <div className="sdv-edit-actions">
            <button type="submit" className="cdm-manage-link" disabled={saving || submitDisabled}>
              {saving ? 'Salvando...' : mode === 'create' ? 'Registrar' : 'Salvar'}
            </button>
          </div>
        </form>

        {stampType ? (
          <div className={`sdv-stamp-overlay is-${stampType === 'SALE' ? 'sale' : 'loss'}`}>
            <div className="sdv-stamp-content">
              <div className="sdv-stamp-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m5 12.5 4.3 4.2L19 7" />
                </svg>
              </div>
              <p className="sdv-stamp-label">
                {stampType === 'SALE' ? 'Venda registrada' : 'Perda registrada'}
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </div>,
    document.body
  );
}
