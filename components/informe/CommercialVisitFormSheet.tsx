'use client';

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { BottomSheet } from '../BottomSheet';
import { CommercialVisitForm } from './CommercialVisitForm';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { SessionData } from '../../lib/types';

// BottomSheet do formulario de VISITA do comercial (opcao "Visitas" do FAB
// da pagina /informe). Mesmo padrao do VisitReportFormSheet do prospector:
// gesto de fechar com dados preenchidos abre a confirmacao de descarte
// empilhada (.is-stacked, portal pro body). Reusa o achatamento
// .bottom-sheet.is-informe. O consumidor controla open/mounted.

interface CommercialVisitFormSheetProps {
  open: boolean;
  session: SessionData;
  onClose: () => void;
  /** Envio bem-sucedido — o sheet ja fechou quando isto dispara. */
  onSubmitted?: () => void;
}

export function CommercialVisitFormSheet({
  open,
  session,
  onClose,
  onSubmitted,
}: CommercialVisitFormSheetProps) {
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const confirmTrapRef = useFocusTrap(confirmDiscardOpen);

  const isDirtyRef = useRef(false);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    isDirtyRef.current = dirty;
  }, []);

  const handleDismissAttempt = useCallback(() => {
    if (!isDirtyRef.current) {
      return true;
    }
    setConfirmDiscardOpen(true);
    return false;
  }, []);

  const handleSubmitted = useCallback(() => {
    onClose();
    onSubmitted?.();
  }, [onClose, onSubmitted]);

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
        title="Nova visita"
        ariaLabel="Nova visita do comercial"
        dragToDismiss
        dragDisabled={confirmDiscardOpen}
        className="is-informe"
      >
        <CommercialVisitForm
          session={session}
          onDirtyChange={handleDirtyChange}
          onSubmitted={handleSubmitted}
        />
      </BottomSheet>

      {confirmDiscardOpen
        ? createPortal(
            <div
              className="app-modal-backdrop is-stacked"
              onClick={() => setConfirmDiscardOpen(false)}
            >
              <section
                ref={confirmTrapRef}
                className="app-modal is-themed app-confirm-modal is-stacked"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="discard-commercial-visit-title"
                aria-describedby="discard-commercial-visit-description"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="discard-commercial-visit-title" className="app-modal-title">
                      Descartar visita?
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
                  <p
                    id="discard-commercial-visit-description"
                    className="app-confirm-modal-message"
                  >
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
                  <button
                    type="button"
                    className="app-modal-submit is-danger"
                    onClick={handleDiscard}
                  >
                    Descartar
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
