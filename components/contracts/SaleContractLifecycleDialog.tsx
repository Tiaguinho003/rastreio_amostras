'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, washoutSaleContract } from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { SessionData } from '../../lib/types';

// Washout (P17): a ÚNICA ação de contrato que ainda pede um diálogo. Marca
// WASH_OUT com motivo obrigatório — à vista cancela a venda e devolve as sacas ao
// lote; Futuro não tem lote. O contrato NUNCA é apagado (o "Excluir" saiu na S72,
// D104). Molde do ConfirmDialog.
//
// RC-D62/D63: "Faturar" e "Pagar" moravam aqui e morreram. Finalizar/Reabrir NÃO
// entraram no lugar deles: são reversíveis e sem data, então viraram toque direto
// (confirmar um toque reversível é ruído). O que sobrou aqui é o que continua
// definitivo — e definitivo é exatamente o que merece um diálogo.
//
// RC-D89: o diálogo passou a PERGUNTAR se haverá cobrança de corretagem. Antes a
// resposta era derivada do tipo (D145: à vista nunca cobrava, Futuro sempre) — uma
// regra que acertava a maioria e não tinha saída para o resto. Nada vem pré-marcado
// e o botão fica travado até responder: um padrão aqui seria o sistema decidindo
// dinheiro no lugar de quem cancela. E a resposta é definitiva, como o motivo
// (RC-D90) — por isso ela mora nesta superfície, junto do resto do que não se
// desfaz. Ela decide se o contrato continua no Financeiro e se o Espelho sai.

export type LifecycleAction = 'washout';

// A pergunta da RC-D89. A dica diz a CONSEQUÊNCIA (onde o contrato vai parar), não
// repete o rótulo — é o que a pessoa precisa para escolher.
const WASHOUT_BILLABLE_OPTIONS: { value: boolean; label: string; hint: string }[] = [
  { value: true, label: 'Sim, cobrar', hint: 'Continua no Financeiro e emite espelho.' },
  { value: false, label: 'Não cobrar', hint: 'Sai do Financeiro, sem espelho.' },
];

type SaleContractLifecycleDialogProps = {
  session: SessionData;
  contractId: string;
  expectedVersion: number;
  contractNumber: string;
  // À vista (tem lote): o washout devolve as sacas ao lote. Futuro: não.
  hasLot: boolean;
  onClose: () => void;
  onDone: () => void;
};

export function SaleContractLifecycleDialog({
  session,
  contractId,
  expectedVersion,
  contractNumber,
  hasLot,
  onClose,
  onDone,
}: SaleContractLifecycleDialogProps) {
  const focusTrapRef = useFocusTrap(true);
  const [reason, setReason] = useState('');
  // `null` = ainda não respondida. Não é `false` por padrão: o que trava o botão é
  // a ausência de resposta, e "não cobrar" é uma resposta.
  const [billable, setBillable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !saving && reason.trim() !== '' && billable !== null;

  async function handleSubmit() {
    if (billable === null) return;
    setSaving(true);
    setError(null);
    try {
      await washoutSaleContract(session, contractId, {
        expectedVersion,
        reason: reason.trim(),
        washoutBillable: billable,
      });
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
              Washout
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
          <p className="ctr-confirm-text ctr-confirm-danger">
            {hasLot
              ? `Dar washout no contrato ${contractNumber}? Isso cancela a venda e devolve as sacas ao lote. Ação definitiva.`
              : `Dar washout no contrato ${contractNumber}? Ação definitiva.`}
          </p>
          <label className="app-modal-field">
            <span className="app-modal-label">Motivo do washout</span>
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

          {/* RC-D89: `div`, não `label` — um radiogroup não mora dentro de um
              <label>, que rotula UM controle. O rótulo vira o aria-label do grupo. */}
          <div className="app-modal-field">
            <span className="app-modal-label">Haverá cobrança de corretagem?</span>
            <div
              className="fv-choice-group"
              role="radiogroup"
              aria-label="Haverá cobrança de corretagem?"
            >
              {WASHOUT_BILLABLE_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={billable === option.value}
                  className={`fv-choice${billable === option.value ? ' is-selected' : ''}`}
                  disabled={saving}
                  onClick={() => {
                    setBillable(option.value);
                    setError(null);
                  }}
                >
                  <span className="fv-choice-label">{option.label}</span>
                  <span className="fv-choice-hint">{option.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="app-modal-actions">
          <button type="button" className="app-modal-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="app-modal-submit ctr-modal-danger"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {saving ? 'Processando...' : 'Confirmar washout'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
