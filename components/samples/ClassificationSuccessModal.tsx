'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '../../lib/use-focus-trap';

interface ClassificationSuccessModalProps {
  open: boolean;
  lotNumber: string;
  isReclassification?: boolean;
  /**
   * FIN3 (rodada 2): a linha "Etiqueta impressa" era incondicional e mentia —
   * a reclassificacao nao imprimia, e mesmo na classificacao nova o print e
   * best-effort (Print Agent offline / PrintJob PENDING recente). Agora o
   * backend informa se disparou, e a linha so aparece quando disparou.
   */
  printRequested?: boolean;
  onViewDetails: () => void;
  onClose: () => void;
}

const COPY = {
  classification: {
    title: 'Classificação salva',
    label: 'Lote da amostra',
  },
  reclassification: {
    title: 'Reclassificação salva',
    label: 'Lote da amostra',
  },
} as const;

export function ClassificationSuccessModal({
  open,
  lotNumber,
  isReclassification = false,
  printRequested = false,
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

  return createPortal(
    <div className="app-modal-backdrop" onClick={onClose}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action sample-created-modal classification-success-modal"
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
          <div className="sample-created-check-wrap" aria-hidden="true">
            <span className="sample-created-check-ring" />
            <svg className="sample-created-check" viewBox="0 0 52 52">
              <circle cx="26" cy="26" r="24" />
              <path d="M14 27l8 8 16-16" />
            </svg>
          </div>

          {/* CAM-UX2: sem lote conhecido o card sai por inteiro (antes o
              fallback vazava o UUID da amostra como se fosse numero de lote). */}
          {lotNumber ? (
            <div className="sample-created-lot-card">
              <p className="sample-created-label">{copy.label}</p>
              <p className="sample-created-lot">{lotNumber}</p>
            </div>
          ) : null}

          {printRequested ? (
            <p className="classification-success-print">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Etiqueta impressa
            </p>
          ) : null}
        </div>

        <div className="app-modal-actions">
          <button type="button" className="app-modal-submit" onClick={onViewDetails}>
            Ver detalhes
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
