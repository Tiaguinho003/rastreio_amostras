'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

import {
  ApiError,
  invoiceSaleContract,
  paySaleContract,
  revertSaleContractStatus,
} from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { SaleContractStatus, SessionData } from '../../lib/types';

// Fechamento (Fase B): ciclo pos-CONFIRMADO. "Faturar"/"Pagar" gravam a data
// real do marco; "Desfazer" volta um passo. Molde do SaleContractConfirmDialog.

export type LifecycleAction = 'invoice' | 'pay' | 'revert';

type SaleContractLifecycleDialogProps = {
  session: SessionData;
  contractId: string;
  expectedVersion: number;
  contractNumber: string;
  action: LifecycleAction;
  // Status atual — distingue "Desfazer faturamento" de "Desfazer pagamento".
  currentStatus: SaleContractStatus;
  onClose: () => void;
  onDone: () => void;
};

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type Copy = {
  title: string;
  text: string;
  dateLabel: string | null;
  submit: string;
  submitting: string;
};

function dialogCopy(
  action: LifecycleAction,
  currentStatus: SaleContractStatus,
  contractNumber: string
): Copy {
  if (action === 'invoice') {
    return {
      title: 'Faturar contrato',
      text: `Registrar o faturamento do contrato ${contractNumber}.`,
      dateLabel: 'Data do faturamento',
      submit: 'Faturar',
      submitting: 'Faturando...',
    };
  }
  if (action === 'pay') {
    return {
      title: 'Registrar pagamento',
      text: `Registrar o pagamento do contrato ${contractNumber}.`,
      dateLabel: 'Data do pagamento',
      submit: 'Pagar',
      submitting: 'Registrando...',
    };
  }
  // revert
  const isPaid = currentStatus === 'PAGO';
  return {
    title: isPaid ? 'Desfazer pagamento' : 'Desfazer faturamento',
    text: isPaid
      ? `Desfazer o pagamento do contrato ${contractNumber}? A data registrada será removida.`
      : `Desfazer o faturamento do contrato ${contractNumber}? A data registrada será removida.`,
    dateLabel: null,
    submit: 'Desfazer',
    submitting: 'Desfazendo...',
  };
}

export function SaleContractLifecycleDialog({
  session,
  contractId,
  expectedVersion,
  contractNumber,
  action,
  currentStatus,
  onClose,
  onDone,
}: SaleContractLifecycleDialogProps) {
  const focusTrapRef = useFocusTrap(true);
  const [date, setDate] = useState(action === 'revert' ? '' : todayInputValue());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = dialogCopy(action, currentStatus, contractNumber);
  const needsDate = copy.dateLabel !== null;
  const canSubmit = !saving && (!needsDate || date !== '');

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      if (action === 'invoice') {
        await invoiceSaleContract(session, contractId, { expectedVersion, date });
      } else if (action === 'pay') {
        await paySaleContract(session, contractId, { expectedVersion, date });
      } else {
        await revertSaleContractStatus(session, contractId, { expectedVersion });
      }
      onDone();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError('Este contrato foi modificado. Recarregue a página e tente de novo.');
      } else {
        setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar o contrato.');
      }
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action sample-detail-compact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ctr-lifecycle-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="ctr-lifecycle-title" className="app-modal-title">
              {copy.title}
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

        <div className="app-modal-content">
          <p className="ctr-confirm-text">{copy.text}</p>
          {needsDate ? (
            <label className="app-modal-field">
              <span className="app-modal-label">{copy.dateLabel}</span>
              <input
                className="app-modal-input"
                type="date"
                value={date}
                disabled={saving}
                onChange={(event) => {
                  setDate(event.target.value);
                  setError(null);
                }}
              />
            </label>
          ) : null}
        </div>

        <div className="app-modal-actions">
          <button type="button" className="app-modal-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="app-modal-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {saving ? copy.submitting : copy.submit}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
