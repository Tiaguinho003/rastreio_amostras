'use client';

// Liga B3.5: modal de bloqueio de invalidação. Aparece quando o operador
// tenta invalidar uma amostra normal que é origem de uma ou mais ligas
// ativas — invalidar a origem deixaria a liga órfã (regra F7.2 / F7.D).
//
// Gatilho duplo (decidido com o usuário):
// - Proativo: o detalhe já carrega `activeBlends` (B3.3); ao tocar
//   "Invalidar" com ligas ativas, este modal abre direto, sem o formulário.
// - Reativo: rede de segurança pro 409 SAMPLE_HAS_ACTIVE_BLENDS, caso uma
//   liga surja entre o carregamento da página e o clique.
//
// É puramente informativo (F7.D — sem "Reverter aqui"): cada liga é um
// link pro próprio detalhe, onde a reversão acontece (B3.4). A composição
// da liga é imutável, então a única saída é reverter a liga inteira.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import type { ActiveBlendDetail } from '../../lib/types';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { RelatedSampleRow } from './RelatedSampleRow';

interface SampleInvalidateBlockedModalProps {
  open: boolean;
  /** Ligas ativas que usam esta amostra como origem (bloqueiam a invalidação). */
  activeBlends: ActiveBlendDetail[];
  onClose: () => void;
}

export function SampleInvalidateBlockedModal({
  open,
  activeBlends,
  onClose,
}: SampleInvalidateBlockedModalProps) {
  const focusTrapRef = useFocusTrap(open);

  // ESC fecha o modal.
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const count = activeBlends.length;
  const description =
    count === 1
      ? 'Esta amostra é origem de uma liga ativa. Reverta a liga na própria página dela antes de invalidar a amostra.'
      : `Esta amostra é origem de ${count} ligas ativas. Reverta cada liga na própria página dela antes de invalidar a amostra.`;

  return createPortal(
    <div className="app-modal-backdrop" onClick={onClose}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed sample-invalidate-blocked-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sample-invalidate-blocked-title"
        aria-describedby="sample-invalidate-blocked-desc"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="sample-invalidate-blocked-title" className="app-modal-title">
              Não foi possível invalidar
            </h3>
            <p id="sample-invalidate-blocked-desc" className="app-modal-description">
              {description}
            </p>
          </div>
          <button type="button" className="app-modal-close" onClick={onClose} aria-label="Fechar">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="app-modal-content">
          <ul className="sdv-related-list">
            {activeBlends.map((blend, idx) => (
              <li key={blend.sampleId}>
                <RelatedSampleRow
                  href={`/samples/${blend.sampleId}`}
                  lot={blend.lotNumber ?? blend.sampleId.slice(0, 8)}
                  isBlend
                  owner={blend.declaredOwner}
                  harvest={blend.declaredHarvest}
                  contribution={blend.contributedSacks}
                  status={blend.status}
                  animationDelay={`${Math.min(idx, 10) * 0.025}s`}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="app-modal-actions">
          <button type="button" className="app-modal-submit" onClick={onClose} autoFocus>
            Entendi
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
