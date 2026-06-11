'use client';

import { useCallback, useRef, useState } from 'react';

import { BottomSheet } from '../BottomSheet';
import { VisitReportForm } from './VisitReportForm';
import type { SessionData } from '../../lib/types';

// BottomSheet do formulario de visita — superficie do dashboard do
// prospector (FAB central e deep link ?informe=novo do lembrete push).
// Espelha o NewSampleModal: gesto de fechar com dados preenchidos abre a
// confirmacao de descarte empilhada (.is-stacked) em vez de fechar direto.
// O consumidor controla open/mounted (delayed unmount pro slide-down).

interface VisitReportFormSheetProps {
  open: boolean;
  session: SessionData;
  onClose: () => void;
  /** Repassado do formulario: envio online (queued=false) ou enfileirado
      offline (queued=true). O sheet ja fechou quando isto dispara. */
  onSubmitted?: (info: { queued: boolean }) => void;
}

export function VisitReportFormSheet({
  open,
  session,
  onClose,
  onSubmitted,
}: VisitReportFormSheetProps) {
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // Ref (e nao state): o dismiss so LE o valor no momento do gesto; nao ha
  // re-render a cada tecla digitada no formulario.
  const isDirtyRef = useRef(false);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    isDirtyRef.current = dirty;
  }, []);

  // Backdrop, X, ESC, drag-to-dismiss e back Android passam por aqui.
  const handleDismissAttempt = useCallback(() => {
    if (!isDirtyRef.current) {
      return true;
    }
    setConfirmDiscardOpen(true);
    return false;
  }, []);

  const handleSubmitted = useCallback(
    (info: { queued: boolean }) => {
      onClose();
      onSubmitted?.(info);
    },
    [onClose, onSubmitted]
  );

  function handleDiscard() {
    setConfirmDiscardOpen(false);
    onClose();
  }

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        onDismissAttempt={handleDismissAttempt}
        title="Novo informe"
        ariaLabel="Novo informe de visita"
        dragToDismiss
        dragDisabled={confirmDiscardOpen}
        className="is-informe"
      >
        <VisitReportForm
          session={session}
          dirtyStateKey="prospector-informe-sheet"
          onDirtyChange={handleDirtyChange}
          onSubmitted={handleSubmitted}
        />
      </BottomSheet>

      {confirmDiscardOpen ? (
        <div className="app-modal-backdrop is-stacked" onClick={() => setConfirmDiscardOpen(false)}>
          <section
            className="app-modal is-themed app-confirm-modal is-stacked"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-informe-title"
            aria-describedby="discard-informe-description"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="discard-informe-title" className="app-modal-title">
                  Descartar informe?
                </h3>
              </div>
            </header>

            <div className="app-modal-content">
              <div className="app-confirm-modal-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17v.01" />
                </svg>
              </div>
              <p id="discard-informe-description" className="app-confirm-modal-message">
                Os dados preenchidos serão perdidos. Esta ação não pode ser desfeita.
              </p>
            </div>

            <div className="app-modal-actions">
              <button
                type="button"
                className="app-modal-secondary"
                onClick={() => setConfirmDiscardOpen(false)}
                autoFocus
              >
                Continuar
              </button>
              <button type="button" className="app-modal-submit is-danger" onClick={handleDiscard}>
                Descartar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
