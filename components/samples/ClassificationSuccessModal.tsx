'use client';

import { useEffect } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';

interface ClassificationSuccessModalProps {
  open: boolean;
  lotNumber: string;
  isReclassification?: boolean;
  onViewDetails: () => void;
  onClose: () => void;
}

const COPY = {
  classification: {
    title: 'Classificacao salva',
    label: 'Lote da amostra',
  },
  reclassification: {
    title: 'Reclassificacao salva',
    label: 'Lote da amostra',
  },
} as const;

export function ClassificationSuccessModal({
  open,
  lotNumber,
  isReclassification = false,
  onViewDetails,
  onClose,
}: ClassificationSuccessModalProps) {
  const copy = isReclassification ? COPY.reclassification : COPY.classification;
  const focusTrapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="app-modal-backdrop" onClick={onClose}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed classification-success-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="classification-success-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="classification-success-title" className="app-modal-title">
              {copy.title}
            </h3>
          </div>
          <button type="button" className="app-modal-close" onClick={onClose} aria-label="Fechar">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="app-modal-content sample-created-body">
          <svg className="sample-created-check" viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="24" />
            <path d="M14 27l8 8 16-16" />
          </svg>

          <p className="sample-created-label">{copy.label}</p>
          <p className="sample-created-lot">{lotNumber}</p>
        </div>

        <div className="app-modal-actions">
          <button type="button" className="app-modal-submit" onClick={onViewDetails}>
            Ver detalhes
          </button>
        </div>
      </section>
    </div>
  );
}
