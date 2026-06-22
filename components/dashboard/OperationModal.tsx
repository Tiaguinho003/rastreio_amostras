'use client';

import { BottomSheet } from '../BottomSheet';
import { BlendBadge } from '../samples/BlendBadge';
import type { OperationModalData } from './useOperationModal';

interface OperationModalProps {
  open: boolean;
  data: OperationModalData | null;
  onClose: () => void;
  /**
   * Bloco F1 (Frente A): quando passado, renderiza o botao de classificar
   * (seta) em cada card. Tap dispara o handler com o sampleId (fluxo de
   * classificacao). O corpo do card e inerte — a unica acao e a seta.
   */
  onItemAction?: (sampleId: string) => void;
}

// Pendencias operacionais num BottomSheet (sai de baixo no mobile; no desktop
// o BottomSheet vira modal central via CSS responsivo >901px). Variante
// .is-operations = altura por conteudo + header claro (novo padrao em
// prototipagem). Cards reusam o visual do card da pagina de Lotes
// (.spv2-card*), porem colapsado, sem status comercial e sem expandir; a
// acao de classificar e um botao quadrado com seta no lugar do chevron.
export function OperationModal({ open, data, onClose, onItemAction }: OperationModalProps) {
  const title = data?.title ?? 'Lotes pendentes';

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
          {data?.emptyMessage ?? 'Nenhuma amostra aguardando classificação.'}
        </p>
      ) : (
        <div className={`app-modal-list ${data.themeClass}`}>
          {data.items.map((sample) => {
            const lotLabel = sample.internalLotNumber ?? sample.id;
            // Sacas DECLARADAS — a projecao do dashboard (mapDashboardSample)
            // nao traz availableSacks; declared.sacks e o numero util aqui.
            const sacksValue = sample.declared.sacks;
            const sacksLabel = sacksValue === null || sacksValue === undefined ? '—' : sacksValue;
            return (
              <div key={sample.id} className="spv2-card-wrap is-card-pending">
                <div className="spv2-card is-static">
                  <span className="spv2-card-bar" />
                  <div className="spv2-card-content">
                    <div className="spv2-card-top">
                      <span className="spv2-card-code">{lotLabel}</span>
                      {sample.isBlend ? <BlendBadge size="sm" /> : null}
                    </div>
                    <div className="spv2-card-bottom">
                      <span className="spv2-card-owner">{sample.declared.owner || '—'}</span>
                      <span className="spv2-card-sep" />
                      <span className="spv2-card-detail">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="2" y="7" width="20" height="14" rx="2" />
                          <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
                        </svg>
                        {sacksLabel} sacas
                      </span>
                    </div>
                  </div>
                  {onItemAction ? (
                    <button
                      type="button"
                      className="spv2-card-classify-arrow"
                      onClick={() => onItemAction(sample.id)}
                      aria-label={`Classificar lote ${lotLabel}`}
                    >
                      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                        <path d="M5 12h14" />
                        <path d="m13 6 6 6-6 6" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}
