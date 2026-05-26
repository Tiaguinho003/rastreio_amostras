'use client';

import type { RefObject } from 'react';
import { createPortal } from 'react-dom';

import type { OperationModalData } from './useOperationModal';

function renderMainSampleValue(value: string | number | null) {
  if (value === null || value === '') {
    return 'Nao informado';
  }
  return String(value);
}

interface OperationModalProps {
  data: OperationModalData;
  focusTrapRef: RefObject<HTMLElement | null>;
  modalCloseButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  /**
   * Bloco F1 (Frente A): quando passado, renderiza botao "Classificar" em cada
   * card, ao lado direito (substituindo o indicator). Tap no botao chama o
   * handler com o sampleId; tap na area comum continua indo pro detalhe via <a>.
   */
  onItemAction?: (sampleId: string) => void;
}

export function OperationModal({
  data,
  focusTrapRef,
  modalCloseButtonRef,
  onClose,
  onItemAction,
}: OperationModalProps) {
  // Render via portal pra body — escapa stacking context do <PageTransition>.
  // Ver skill `modals` §9 "Portal" (obrigatorio pra modais centrais).
  return createPortal(
    <div className="app-modal-backdrop" onClick={onClose}>
      <section
        ref={focusTrapRef}
        id={data.modalId}
        className={`app-modal is-themed app-modal-dashboard ${data.themeClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-operation-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="dashboard-operation-modal-title" className="app-modal-title">
              {data.title}
            </h3>
          </div>
          <button
            ref={modalCloseButtonRef}
            type="button"
            className="app-modal-close"
            onClick={onClose}
            aria-label="Fechar modal"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <div className="app-modal-content">
          {data.items.length === 0 ? (
            <p className="app-modal-empty">{data.emptyMessage}</p>
          ) : (
            <div className="app-modal-list">
              {data.items.map((sample) => {
                const lotLabel = sample.internalLotNumber ?? sample.id;
                const ownerLabel = renderMainSampleValue(sample.declared.owner);
                const sacksLabel =
                  sample.declared.sacks === null ? 'Nao informado' : String(sample.declared.sacks);
                return (
                  <div key={sample.id} className="app-modal-card">
                    <a
                      href={`/samples/${sample.id}`}
                      className="app-modal-card-link"
                      onClick={onClose}
                      aria-label={`Abrir detalhes da amostra ${lotLabel}`}
                    >
                      <div className="app-modal-card-body">
                        <strong className="app-modal-card-title">{lotLabel}</strong>
                        <p className="app-modal-card-line">{ownerLabel}</p>
                        <p className="app-modal-card-line">
                          <strong>Sacas:</strong> {sacksLabel}
                        </p>
                      </div>
                    </a>
                    {onItemAction ? (
                      <button
                        type="button"
                        className="app-modal-card-classify-cta"
                        onClick={() => onItemAction(sample.id)}
                        aria-label={`Classificar amostra ${lotLabel}`}
                      >
                        Classificar
                      </button>
                    ) : (
                      <span className="app-modal-card-indicator" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
