'use client';

import { BottomSheet } from '../BottomSheet';
import type { OperationModalData } from './useOperationModal';

function renderMainSampleValue(value: string | number | null) {
  if (value === null || value === '') {
    return 'Nao informado';
  }
  return String(value);
}

interface OperationModalProps {
  open: boolean;
  data: OperationModalData | null;
  onClose: () => void;
  /**
   * Bloco F1 (Frente A): quando passado, renderiza botao "Classificar" em cada
   * card, ao lado direito. Tap no botao chama o handler com o sampleId; tap na
   * area comum continua indo pro detalhe via <a>.
   */
  onItemAction?: (sampleId: string) => void;
}

// Pendencias operacionais num BottomSheet (sai de baixo no mobile; no desktop
// o BottomSheet vira modal central via CSS responsivo >901px). Antes era um
// .app-modal.is-themed central — migrado pro BottomSheet pra padronizar com os
// fluxos de "nova amostra"/formularios. Variante .is-operations = altura por
// conteudo (lista curta nao estica o sheet). Os cards reusam .app-modal-card*.
export function OperationModal({ open, data, onClose, onItemAction }: OperationModalProps) {
  const title = data?.title ?? 'Amostras pendentes';

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      ariaLabel={title}
      dragToDismiss
      className="is-operations"
    >
      {!data || data.items.length === 0 ? (
        <p className="app-modal-empty">
          {data?.emptyMessage ?? 'Nenhuma amostra aguardando classificacao.'}
        </p>
      ) : (
        <div className={`app-modal-list ${data.themeClass}`}>
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
    </BottomSheet>
  );
}
