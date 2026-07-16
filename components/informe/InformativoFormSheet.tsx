'use client';

// BottomSheet do INFORMATIVO DE MERCADO (opcao "Informativo" do FAB da
// /relatorios). Mesmo padrao do CommercialVisitFormSheet: fechar com dados
// preenchidos abre a confirmacao de descarte empilhada (.is-stacked, portal
// pro body).
//
// Diferenca das outras duas opcoes do leque: o Informativo NAO cria registro —
// gera uma imagem e some (P1). Por isso nao existe onSubmitted que recarregue
// o feed; so onGenerated, que fecha e avisa.

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { BottomSheet } from '../BottomSheet';
import { InformativoForm } from './InformativoForm';
import type { SlowFields } from '../../lib/informativos/slow-fields-store';
import { useFocusTrap } from '../../lib/use-focus-trap';

interface InformativoFormSheetProps {
  open: boolean;
  onClose: () => void;
  /** Peca entregue — o sheet ja fechou quando isto dispara. */
  onGenerated?: () => void;
  initialSlow?: SlowFields | null;
  onPersistSlow?: (slow: SlowFields) => void;
}

export function InformativoFormSheet({
  open,
  onClose,
  onGenerated,
  initialSlow,
  onPersistSlow,
}: InformativoFormSheetProps) {
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

  const handleGenerated = useCallback(() => {
    isDirtyRef.current = false;
    onClose();
    onGenerated?.();
  }, [onClose, onGenerated]);

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
        title="Informativo de mercado"
        ariaLabel="Gerar informativo de mercado"
        dragToDismiss
        dragDisabled={confirmDiscardOpen}
        className="is-informe is-informativo"
      >
        <InformativoForm
          onDirtyChange={handleDirtyChange}
          onGenerated={handleGenerated}
          initialSlow={initialSlow}
          onPersistSlow={onPersistSlow}
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
                aria-labelledby="discard-informativo-title"
                aria-describedby="discard-informativo-description"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="discard-informativo-title" className="app-modal-title">
                      Descartar informativo?
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
                  <p id="discard-informativo-description" className="app-confirm-modal-message">
                    Os valores preenchidos serão perdidos. Esta ação não pode ser desfeita.
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
