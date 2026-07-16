'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '../../lib/use-focus-trap';

// CAM-D5: confirmacao de descarte do review preenchido da classificacao.
// Renderiza SOBRE o camera-preview-sheet aberto — portal pro body +
// .is-stacked (z-modal-stacked), mesmo padrao do "Descartar lote?" do
// NewSampleModal. Acionado pelo Cancelar do footer, pelo ESC do sheet e
// pelo voltar do Android (via onDismissAttempt por estado na page).

type Props = {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
};

export function ClassificationDiscardConfirmModal({ open, onKeep, onDiscard }: Props) {
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onKeep();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onKeep]);

  if (!open) return null;

  return createPortal(
    <div className="app-modal-backdrop is-stacked" onClick={onKeep}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed app-confirm-modal is-stacked"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="classification-discard-title"
        aria-describedby="classification-discard-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="app-modal-content">
          <div className="app-confirm-modal-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17v.01" />
            </svg>
          </div>
          <h3 id="classification-discard-title" className="app-confirm-modal-title">
            Descartar classificação?
          </h3>
          <p id="classification-discard-description" className="app-confirm-modal-message">
            Os dados extraídos e as edições serão perdidos. A foto precisará ser tirada de novo.
          </p>
        </div>

        <div className="app-modal-actions">
          <button type="button" className="app-modal-secondary" onClick={onKeep} autoFocus>
            Continuar
          </button>
          <button type="button" className="app-modal-submit is-danger" onClick={onDiscard}>
            Descartar
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
