'use client';

import { useEffect } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';

// Amostra com status que nao permite classificacao (ex: INVALIDATED, ou
// qualquer status fora de REGISTRATION_CONFIRMED/CLASSIFIED). Modal central no
// mesmo padrao dos avisos do fluxo (.app-modal.is-themed, role=alertdialog).
// Validado no "Avancar" do review (entre o review e o modal de tipo), entao
// aparece cedo — nao depois de tipo+classificador. Acoes: Cancelar (sai do
// fluxo) e Ver detalhes (abre a amostra). Sem X; Escape = Cancelar.

type Props = {
  open: boolean;
  onCancel: () => void;
  onViewDetails: () => void;
};

export function ClassificationStatusInvalidModal({ open, onCancel, onViewDetails }: Props) {
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action status-invalid-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="status-invalid-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="status-invalid-title" className="app-modal-title">
              Amostra não pode ser classificada
            </h3>
          </div>
        </header>

        <div className="app-modal-content status-invalid-content">
          <div className="status-invalid-body">
            <svg
              className="status-invalid-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              style={{ color: '#C0392B' }}
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
            <p className="status-invalid-text">
              O status atual desta amostra não permite classificação. Veja os detalhes para entender
              a situação.
            </p>
          </div>

          <div className="app-modal-actions status-invalid-actions">
            <button type="button" className="app-modal-secondary" onClick={onCancel}>
              Cancelar
            </button>
            <button type="button" className="app-modal-submit" onClick={onViewDetails}>
              Ver detalhes
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
