'use client';

// Liga: modal de confirmacao da propagacao reativa de safra. Aparece quando o
// operador edita a safra de um lote que e origem de uma ou mais ligas ativas —
// salvar recalcula a safra dessas ligas (avisar-e-confirmar). Diferente do
// SampleInvalidateBlockedModal (que so informa), este tem ACAO: "Aplicar e
// propagar" re-submete a edicao com confirmHarvestPropagation=true.
//
// Destaca ligas ja comercializadas (commercialStatus != 'OPEN') e ja
// classificadas, pra o operador ter ciencia do impacto, e mostra a transicao
// safra atual -> nova por liga.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import type { AffectedBlendDetail, CommercialStatus } from '../../lib/types';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { BlendBadge } from './BlendBadge';

interface BlendHarvestPropagationModalProps {
  open: boolean;
  /** Ligas ancestrais cuja safra muda com esta edicao. */
  blends: AffectedBlendDetail[];
  /** true enquanto o re-submit com confirmHarvestPropagation roda. */
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function commercialLabel(status: CommercialStatus): string | null {
  switch (status) {
    case 'SOLD':
      return 'Vendida';
    case 'PARTIALLY_SOLD':
      return 'Parc. vendida';
    case 'LOST':
      return 'Perdida';
    default:
      return null;
  }
}

export function BlendHarvestPropagationModal({
  open,
  blends,
  submitting,
  onConfirm,
  onClose,
}: BlendHarvestPropagationModalProps) {
  const focusTrapRef = useFocusTrap(open);

  // ESC fecha (exceto durante o submit).
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleEsc(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, submitting, onClose]);

  if (!open) {
    return null;
  }

  const count = blends.length;
  const commercializedCount = blends.filter((blend) => blend.commercialStatus !== 'OPEN').length;
  const description =
    count === 1
      ? 'Salvar esta safra recalcula a safra de 1 liga que usa esta amostra.'
      : `Salvar esta safra recalcula a safra de ${count} ligas que usam esta amostra.`;

  function handleBackdrop() {
    if (!submitting) {
      onClose();
    }
  }

  return createPortal(
    <div className="app-modal-backdrop" onClick={handleBackdrop}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed blend-harvest-propagation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bhp-title"
        aria-describedby="bhp-desc"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="bhp-title" className="app-modal-title">
              Atualizar safra das ligas
            </h3>
            <p id="bhp-desc" className="app-modal-description">
              {description}
            </p>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Fechar"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="app-modal-content">
          {commercializedCount > 0 ? (
            <div className="sdv-warn-box" role="note">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                <path d="M12 9v4" />
                <path d="M12 17v.01" />
              </svg>
              <span className="sdv-warn-text">
                {commercializedCount === 1
                  ? '1 liga ja comercializada sera atualizada.'
                  : `${commercializedCount} ligas ja comercializadas serao atualizadas.`}
              </span>
            </div>
          ) : null}

          <ul className="bhp-list">
            {blends.map((blend) => {
              const lot = blend.lotNumber ?? blend.sampleId.slice(0, 8);
              const comLabel = commercialLabel(blend.commercialStatus);
              const showClassified = !comLabel && blend.status === 'CLASSIFIED';
              return (
                <li key={blend.sampleId} className="bhp-row">
                  <div className="bhp-row-head">
                    <span className="bhp-row-lot">{lot}</span>
                    <BlendBadge size="sm" />
                    {comLabel ? <span className="bhp-chip is-warning">{comLabel}</span> : null}
                    {showClassified ? (
                      <span className="bhp-chip is-muted">Classificada</span>
                    ) : null}
                  </div>
                  <div className="bhp-row-harvest">
                    <span className="bhp-harvest-from">{blend.currentHarvest?.trim() || '—'}</span>
                    <svg className="bhp-harvest-arrow" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                    <span className="bhp-harvest-to">{blend.newHarvest?.trim() || '—'}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="app-modal-actions blend-harvest-propagation-actions">
          <button
            type="button"
            className="app-modal-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="app-modal-submit is-warning"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? 'Aplicando...' : 'Aplicar e propagar'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
