'use client';

import { useEffect } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';

// Liga B2.3: prop `entity` permite reuso pra "Liga criada" trocando
// titulo, label do lote, e textos dos botoes. Hint generico permanece.
// Backwards-compatible: omitir entity = comportamento sample original.
type SuccessEntity = 'sample' | 'blend';

interface SampleCreatedSuccessModalProps {
  open: boolean;
  lotNumber: string;
  onNavigateToSample: () => void;
  onCreateAnother: () => void;
  onClose: () => void;
  entity?: SuccessEntity;
}

const COPY_BY_ENTITY: Record<
  SuccessEntity,
  { title: string; label: string; primary: string; secondary: string }
> = {
  sample: {
    title: 'Amostra criada',
    label: 'Lote da amostra',
    primary: 'Ir para amostra',
    secondary: 'Criar outra',
  },
  blend: {
    title: 'Liga criada',
    label: 'Lote da liga',
    primary: 'Ir para liga',
    secondary: 'Criar outra liga',
  },
};

export function SampleCreatedSuccessModal({
  open,
  lotNumber,
  onNavigateToSample,
  onCreateAnother,
  onClose,
  entity = 'sample',
}: SampleCreatedSuccessModalProps) {
  const copy = COPY_BY_ENTITY[entity];
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
        className="app-modal is-themed sample-created-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sample-created-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="sample-created-title" className="app-modal-title">
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
          <p className="sample-created-hint">Anote este numero na saca antes de seguir.</p>
        </div>

        <div className="app-modal-actions">
          <button type="button" className="app-modal-secondary" onClick={onCreateAnother}>
            {copy.secondary}
          </button>
          <button type="button" className="app-modal-submit" onClick={onNavigateToSample}>
            {copy.primary}
          </button>
        </div>
      </section>
    </div>
  );
}
