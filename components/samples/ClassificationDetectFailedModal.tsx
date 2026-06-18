'use client';

import { useEffect } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';

// Ficha nao detectada: a deteccao automatica nao encontrou a ficha na foto.
// Modal central de decisao no mesmo padrao dos avisos de erro de extracao
// (.app-modal.is-themed, role=alertdialog) — substitui o painel antigo que
// ficava na propria area da camera. Duas saidas: tentar de novo (re-captura)
// ou continuar extraindo da foto inteira (sem crop). Sem X: as duas acoes ja
// cobrem as escolhas; Escape = "Tentar novamente".

type Props = {
  open: boolean;
  /** Re-captura: reseta o fluxo e volta pra camera. */
  onRetake: () => void;
  /** Segue extraindo da foto completa (sem crop). */
  onContinue: () => void;
};

export function ClassificationDetectFailedModal({ open, onRetake, onContinue }: Props) {
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onRetake();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onRetake]);

  if (!open) return null;

  return (
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action detect-failed-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="detect-failed-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="detect-failed-title" className="app-modal-title">
              Ficha não detectada
            </h3>
          </div>
        </header>

        <div className="app-modal-content detect-failed-content">
          <div className="detect-failed-body">
            <svg
              className="detect-failed-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              style={{ color: '#D4A017' }}
            >
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
              <line
                x1="12"
                y1="8"
                x2="12"
                y2="13"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <circle cx="12" cy="16.6" r="1.05" fill="currentColor" />
            </svg>
            <p className="detect-failed-text">
              Não foi possível encontrar a ficha automaticamente. Tente fotografar com a ficha mais
              visível, ou continue para extrair da foto completa.
            </p>
          </div>

          <div className="app-modal-actions detect-failed-actions">
            <button type="button" className="app-modal-secondary" onClick={onRetake}>
              Tentar novamente
            </button>
            <button type="button" className="app-modal-submit" onClick={onContinue}>
              Continuar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
