'use client';

// Liga B3.4: painel de confirmação de reversão de liga. Aberto pelo item
// "Reverter liga" do menu ⋯ do hero do detalhe do lote quando o sample é uma
// liga sem venda/perda.
//
// Decisões (Liga F8):
// - F8.2: motivo é texto livre OPCIONAL. Botão "Reverter liga" vermelho.
// - F8.3: a composição é preservada e as origens não são afetadas (Q0.2) —
//   a descrição reforça isso pro operador.
// - F8.4: reversão é definitiva — warning âmbar "não pode ser desfeita".
//
// F3 do redesign FV: era um `.app-modal` central portalado; virou PAINEL
// LATERAL no molde da rodada 5 (side-sheet stacked + seta ← no lugar do
// Cancelar textual + submit no footer sticky). O componente segue dono do
// campo de motivo (state interno, reset ao abrir); o parent cuida da chamada
// revertBlend e passa reverting/errorMessage.

import { useEffect, useState, type FormEvent } from 'react';

import { BottomSheet } from '../BottomSheet';

// reasonText do BLEND_REVERTED aceita até 500 chars (payload schema em
// docs/schemas/events/v1/payloads/blend-reverted.payload.schema.json).
const REASON_MAX_LENGTH = 500;

interface BlendRevertModalProps {
  open: boolean;
  /** Lote da liga — exibido no título pra confirmar o alvo da reversão. */
  lotNumber: string;
  /** true durante o request de revertBlend — bloqueia inputs e fechamento. */
  reverting: boolean;
  /** Erro do request, renderizado acima das ações. */
  errorMessage: string | null;
  onClose: () => void;
  /** Confirma a reversão. Recebe o motivo já trimado ('' quando vazio). */
  onConfirm: (reasonText: string) => void;
}

export function BlendRevertModal({
  open,
  lotNumber,
  reverting,
  errorMessage,
  onClose,
  onConfirm,
}: BlendRevertModalProps) {
  const [reasonText, setReasonText] = useState('');

  // Reset do motivo sempre que o painel abre.
  useEffect(() => {
    if (open) {
      setReasonText('');
    }
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reverting) {
      return;
    }
    onConfirm(reasonText.trim());
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDismissAttempt={() => !reverting}
      title={`Reverter liga ${lotNumber}?`}
      ariaLabel={`Reverter liga ${lotNumber}`}
      stacked
      closeVariant="edge-back"
      dragDisabled={reverting}
      className="fv-panel-sheet side-sheet blend-revert-sheet"
      footer={
        <button
          type="submit"
          form="blend-revert-form"
          className="app-modal-submit is-danger"
          disabled={reverting}
        >
          {reverting ? 'Revertendo...' : 'Reverter liga'}
        </button>
      }
    >
      <>
        <p className="fv-panel-lead">
          A liga será removida. As amostras de origem não são afetadas.
        </p>

        <form id="blend-revert-form" onSubmit={handleSubmit}>
          <div className="sdv-warn-box">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            <div className="sdv-warn-text">
              <strong>Esta ação não pode ser desfeita.</strong>
            </div>
          </div>

          <label className="app-modal-field">
            <span className="app-modal-label">Motivo (opcional)</span>
            <textarea
              className="app-modal-input blend-revert-modal__reason"
              value={reasonText}
              rows={3}
              maxLength={REASON_MAX_LENGTH}
              placeholder="Ex: liga criada por engano"
              disabled={reverting}
              onChange={(event) => setReasonText(event.target.value)}
            />
          </label>

          {errorMessage ? <p className="sdv-modal-error">{errorMessage}</p> : null}
        </form>
      </>
    </BottomSheet>
  );
}
