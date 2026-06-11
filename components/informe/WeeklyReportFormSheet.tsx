'use client';

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { BottomSheet } from '../BottomSheet';
import { WeeklyReportForm } from './WeeklyReportForm';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { SessionData } from '../../lib/types';

// BottomSheet do RELATORIO SEMANAL do comercial (opcao "Relatorio" do FAB
// da pagina /informe). Mesmo padrao do VisitReportFormSheet: confirm de
// descarte empilhado quando ha dados preenchidos; achatamento .is-informe.

interface WeeklyReportFormSheetProps {
  open: boolean;
  session: SessionData;
  onClose: () => void;
  /** Envio bem-sucedido — o sheet ja fechou quando isto dispara. */
  onSubmitted?: () => void;
}

export function WeeklyReportFormSheet({
  open,
  session,
  onClose,
  onSubmitted,
}: WeeklyReportFormSheetProps) {
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
        title="Relatório semanal"
        ariaLabel="Relatório semanal do comercial"
        dragToDismiss
        dragDisabled={confirmDiscardOpen}
        className="is-informe"
      >
        <WeeklyReportForm
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
                aria-labelledby="discard-weekly-report-title"
                aria-describedby="discard-weekly-report-description"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="discard-weekly-report-title" className="app-modal-title">
                      Descartar relatório?
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
                  <p id="discard-weekly-report-description" className="app-confirm-modal-message">
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
