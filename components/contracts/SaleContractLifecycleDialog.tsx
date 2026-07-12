'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  ApiError,
  getApprovalLabelPrefill,
  invoiceSaleContract,
  paySaleContract,
  washoutSaleContract,
} from '../../lib/api-client';
import { isWeekendIso, WEEKEND_DATE_MESSAGE } from '../../lib/business-days';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { ApprovalLabelPrefill, SessionData } from '../../lib/types';
import { ApprovalLabelModal } from '../ApprovalLabelModal';
import { ShipmentConfirmationModal } from './ShipmentConfirmationModal';

// Lê o `code` de um erro do backend (mora em ApiError.details.code, não no topo).
function errorCode(cause: unknown): string | null {
  if (cause instanceof ApiError && cause.details && typeof cause.details === 'object') {
    const code = (cause.details as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

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
  // EMB28: portão do embarque — pagar exige embarque; se faltar, abre o modal de
  // confirmação (única ação) e, ao confirmar, segue direto pro pagamento.
  const [needsShipment, setNeedsShipment] = useState(false);
  // AP18: portão do faturamento — faturar exige aprovação enviada; se faltar, abre o
  // modal da etiqueta (pré-preenchido) e, ao enviar, refatura. Molde do portão de embarque.
  const [needsApproval, setNeedsApproval] = useState(false);
  const [approvalPrefill, setApprovalPrefill] = useState<ApprovalLabelPrefill | null>(null);
  // Distingue "enviou a etiqueta" (refatura no onClose) de "cancelou" (não refatura).
  const approvalSentRef = useRef(false);

  const copy = dialogCopy(action, contractNumber, hasLot);
  const needsDate = copy.dateLabel !== null;
  const needsReason = copy.reasonLabel !== null;
  // E30: o pagamento não pode ser no futuro — trava o seletor em hoje (max) e bloqueia
  // o submit se digitarem uma data futura. O backend é a trava autoritativa.
  const maxDate = action === 'pay' ? todayInputValue() : undefined;
  const dateInFuture = maxDate !== undefined && date !== '' && date > maxDate;
  // DSB-D7: faturamento/pagamento (datas de ação) não podem cair em fim de semana.
  const dateIsWeekend = needsDate && date !== '' && isWeekendIso(date);
  const canSubmit =
    !saving &&
    (!needsDate || date !== '') &&
    (!needsReason || reason.trim() !== '') &&
    !dateInFuture &&
    !dateIsWeekend;

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
      // AP18: faturar um contrato marcado que ainda não enviou a aprovação → busca o
      // prefill e abre o modal da etiqueta aqui mesmo; ao enviar, refatura no onClose
      // (a version não muda no envio, então a mesma expectedVersion segue válida).
      if (action === 'invoice' && errorCode(cause) === 'CONTRACT_APPROVAL_REQUIRED') {
        try {
          const prefill = await getApprovalLabelPrefill(session, contractId);
          setApprovalPrefill(prefill);
          setNeedsApproval(true);
        } catch {
          setError('Este contrato precisa da aprovação enviada antes de faturar.');
        }
      } else if (action === 'pay' && errorCode(cause) === 'CONTRACT_SHIPMENT_REQUIRED') {
        // EMB28: pagar um contrato que exige embarque e ainda não embarcou → abre o
        // modal de confirmação; ao confirmar, o handleSubmit é re-chamado e paga.
        setNeedsShipment(true);
      } else if (errorCode(cause) === 'WEEKEND_DATE') {
        // DSB-D7: defesa — o front já bloqueia, mas se algo furar, mostra o aviso.
        setError(WEEKEND_DATE_MESSAGE);
      } else if (cause instanceof ApiError && cause.status === 409) {
        setError('Este contrato foi modificado. Recarregue a página e tente de novo.');
      } else {
        setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar o contrato.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {createPortal(
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
                    max={maxDate}
                    disabled={saving}
                    onChange={(event) => {
                      setDate(event.target.value);
                      setError(null);
                    }}
                  />
                  {dateInFuture ? (
                    <span className="app-modal-field-error">
                      A data do pagamento não pode ser futura.
                    </span>
                  ) : dateIsWeekend ? (
                    <span className="app-modal-field-error">{WEEKEND_DATE_MESSAGE}</span>
                  ) : null}
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
              <button
                type="button"
                className="app-modal-secondary"
                onClick={onClose}
                disabled={saving}
              >
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
      )}
      {needsShipment ? (
        <ShipmentConfirmationModal
          session={session}
          contractId={contractId}
          onClose={() => setNeedsShipment(false)}
          onDone={() => {
            setNeedsShipment(false);
            void handleSubmit();
          }}
        />
      ) : null}
      {needsApproval ? (
        <ApprovalLabelModal
          open
          session={session}
          prefill={approvalPrefill}
          saleContractId={contractId}
          onBack={null}
          onSent={() => {
            // Marca só o sucesso; a refatura acontece no onClose (após o check da
            // etiqueta), pra não cortar a animação de sucesso do envio.
            approvalSentRef.current = true;
          }}
          onClose={() => {
            setNeedsApproval(false);
            if (approvalSentRef.current) {
              approvalSentRef.current = false;
              void handleSubmit();
            }
          }}
        />
      ) : null}
    </>
  );
}
