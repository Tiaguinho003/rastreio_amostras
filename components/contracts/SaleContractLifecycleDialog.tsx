'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

import {
  ApiError,
  invoiceSaleContract,
  paySaleContract,
  washoutSaleContract,
} from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { SessionData } from '../../lib/types';

// Fechamento (Fase B): ações de status do contrato. "Faturar"/"Pagar" gravam a
// data real do marco; "Washout" (P17) marca WASH_OUT (motivo obrigatório,
// definitiva) — à vista cancela a venda + devolve as sacas, Futuro não tem
// lote. O contrato NUNCA é apagado (o "Excluir" saiu na S72, D104) e o
// "Desfazer" foi REMOVIDO na Fase J (D122 — ciclo só pra frente). Molde do
// ConfirmDialog.

export type LifecycleAction = 'invoice' | 'pay' | 'washout';

type SaleContractLifecycleDialogProps = {
  session: SessionData;
  contractId: string;
  expectedVersion: number;
  contractNumber: string;
  action: LifecycleAction;
  // À vista (tem lote): washout/cancelar devolvem as sacas ao lote. Futuro: não.
  hasLot: boolean;
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
  reasonLabel: string | null;
  danger: boolean;
  submit: string;
  submitting: string;
};

function dialogCopy(action: LifecycleAction, contractNumber: string, hasLot: boolean): Copy {
  if (action === 'invoice') {
    return {
      title: 'Faturar contrato',
      text: `Registrar o faturamento do contrato ${contractNumber}.`,
      dateLabel: 'Data do faturamento',
      reasonLabel: null,
      danger: false,
      submit: 'Faturar',
      submitting: 'Faturando...',
    };
  }
  if (action === 'pay') {
    return {
      title: 'Registrar pagamento',
      text: `Registrar o pagamento do contrato ${contractNumber}.`,
      dateLabel: 'Data do pagamento',
      reasonLabel: null,
      danger: false,
      submit: 'Pagar',
      submitting: 'Registrando...',
    };
  }
  // washout
  return {
    title: 'Washout',
    text: hasLot
      ? `Dar washout no contrato ${contractNumber}? Isso cancela a venda e devolve as sacas ao lote. Ação definitiva.`
      : `Dar washout no contrato ${contractNumber}? Ação definitiva.`,
    dateLabel: null,
    reasonLabel: 'Motivo do washout',
    danger: true,
    submit: 'Confirmar washout',
    submitting: 'Processando...',
  };
}

export function SaleContractLifecycleDialog({
  session,
  contractId,
  expectedVersion,
  contractNumber,
  action,
  hasLot,
  onClose,
  onDone,
}: SaleContractLifecycleDialogProps) {
  const focusTrapRef = useFocusTrap(true);
  const [date, setDate] = useState(
    action === 'invoice' || action === 'pay' ? todayInputValue() : ''
  );
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = dialogCopy(action, contractNumber, hasLot);
  const needsDate = copy.dateLabel !== null;
  const needsReason = copy.reasonLabel !== null;
  const canSubmit =
    !saving && (!needsDate || date !== '') && (!needsReason || reason.trim() !== '');

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      if (action === 'invoice') {
        await invoiceSaleContract(session, contractId, { expectedVersion, date });
      } else if (action === 'pay') {
        await paySaleContract(session, contractId, { expectedVersion, date });
      } else {
        await washoutSaleContract(session, contractId, { expectedVersion, reason: reason.trim() });
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
          <p className={`ctr-confirm-text${copy.danger ? ' ctr-confirm-danger' : ''}`}>
            {copy.text}
          </p>
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
          {needsReason ? (
            <label className="app-modal-field">
              <span className="app-modal-label">{copy.reasonLabel}</span>
              <textarea
                className="app-modal-input"
                rows={3}
                value={reason}
                disabled={saving}
                placeholder="Descreva o motivo do washout"
                onChange={(event) => {
                  setReason(event.target.value);
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
            className={`app-modal-submit${copy.danger ? ' ctr-modal-danger' : ''}`}
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
