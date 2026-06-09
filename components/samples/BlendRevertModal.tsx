'use client';

// Liga B3.4: modal de confirmação de reversão de liga. Aberto pelo botão
// "Reverter liga" no header do detalhe (/samples/[sampleId]) quando o sample
// é uma liga sem venda/perda. Segue o padrão .app-confirm-modal (mesmo do
// "Descartar amostra em andamento" do NewSampleModal), conforme F8.2.
//
// Decisões (Liga F8):
// - F8.2: motivo é texto livre OPCIONAL. Botão "Reverter liga" vermelho,
//   "Cancelar" secundário.
// - F8.3: a composição é preservada e as origens não são afetadas (Q0.2) —
//   a descrição reforça isso pro operador.
// - F8.4: reversão é definitiva — warning âmbar "não pode ser desfeita".
//
// O componente é dono do campo de motivo (state interno, reset ao abrir); o
// parent cuida da chamada revertBlend e passa reverting/errorMessage.

import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '../../lib/use-focus-trap';

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
  const focusTrapRef = useFocusTrap(open);
  const [reasonText, setReasonText] = useState('');

  // Reset do motivo sempre que o modal abre.
  useEffect(() => {
    if (open) {
      setReasonText('');
    }
  }, [open]);

  // ESC fecha (exceto durante o request de reversão).
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleEsc(event: KeyboardEvent) {
      if (event.key === 'Escape' && !reverting) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, reverting, onClose]);

  if (!open) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reverting) {
      return;
    }
    onConfirm(reasonText.trim());
  }

  return createPortal(
    <div
      className="app-modal-backdrop"
      onClick={() => {
        if (!reverting) {
          onClose();
        }
      }}
    >
      <section
        ref={focusTrapRef}
        className="app-modal is-themed blend-revert-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="blend-revert-modal-title"
        aria-describedby="blend-revert-modal-description"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="blend-revert-modal-title" className="app-modal-title">
              Reverter liga {lotNumber}?
            </h3>
            <p id="blend-revert-modal-description" className="app-modal-description">
              A liga será invalidada. As amostras de origem não são afetadas.
            </p>
          </div>
        </header>

        <form className="app-modal-content" onSubmit={handleSubmit}>
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

          <div className="app-modal-actions blend-revert-actions">
            <button
              type="button"
              className="app-modal-secondary"
              onClick={onClose}
              disabled={reverting}
              autoFocus
            >
              Cancelar
            </button>
            <button type="submit" className="app-modal-submit is-danger" disabled={reverting}>
              {reverting ? 'Revertendo...' : 'Reverter liga'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
