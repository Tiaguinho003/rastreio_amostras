'use client';

import { useId } from 'react';
import { createPortal } from 'react-dom';

import { CommercialStatusBadge } from './CommercialStatusBadge';
import { useFocusTrap } from '../lib/use-focus-trap';
import type { ResolveSampleByQrResponse } from '../lib/types';

export type LookupKind = 'lookup' | 'invalidated' | 'classified';

interface SampleLookupResultModalProps {
  sample: ResolveSampleByQrResponse['sample'];
  /**
   * Variante visual (apenas titulo + densidade da meta). Todas as variantes
   * tem o MESMO conjunto de acoes: o "x" do header (onClose) + um unico
   * botao "Ver detalhes" (onDetails). Decisao do usuario (2026-06-24): o
   * modal de resultado do QR nao acumula botoes — reclassificar/escanear
   * novamente sao feitos a partir do detalhe da amostra.
   * - 'lookup' (default): amostra localizada — mostra meta completa.
   * - 'invalidated': aviso de amostra invalidada.
   * - 'classified': aviso de amostra ja classificada.
   */
  kind?: LookupKind;
  onClose: () => void;

  title?: string;
  onDetails?: () => void;
  detailsLabel?: string;
}

const COPY = {
  invalidated: {
    title: 'Amostra invalidada',
  },
  classified: {
    title: 'Amostra ja classificada',
  },
} as const;

export function SampleLookupResultModal({
  sample,
  kind = 'lookup',
  onClose,
  title,
  onDetails,
  detailsLabel = 'Ver detalhes',
}: SampleLookupResultModalProps) {
  const titleId = useId();
  const focusTrapRef = useFocusTrap(true);

  const headerTitle = (() => {
    switch (kind) {
      case 'lookup':
        return title ?? 'Amostra localizada';
      case 'invalidated':
        return COPY.invalidated.title;
      case 'classified':
        return COPY.classified.title;
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  })();

  // Render via portal pra body: o modal e renderizado dentro de
  // SampleSearchField, que vive em paginas envolvidas por <PageTransition>.
  // Durante a transicao de pagina, .page-transition-content recebe
  // `transform`+`will-change`, criando stacking context que prende o
  // `position: fixed` do backdrop. Portal pra body escapa qualquer
  // stacking context ancestral. Ver skill `modals` §9 "Portal".
  return createPortal(
    <div className="app-modal-backdrop" onClick={onClose}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed app-modal-lookup-result"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id={titleId} className="app-modal-title">
              {headerTitle}
            </h3>
          </div>

          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            aria-label="Fechar modal"
            autoFocus
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="app-modal-content">
          <article className="app-modal-lookup-layout">
            <div className="app-modal-lookup-meta">
              <div className="app-modal-lookup-lot-row">
                <p className="app-modal-card-line">
                  <strong>Lote interno:</strong> {sample.internalLotNumber ?? 'Nao definido'}
                </p>
                <CommercialStatusBadge status={sample.commercialStatus} />
              </div>
              {kind === 'lookup' ? (
                <>
                  <p className="app-modal-card-line">
                    <strong>Proprietario:</strong> {sample.declared.owner ?? 'Nao informado'}
                  </p>
                  <p className="app-modal-card-line">
                    <strong>Sacas:</strong> {sample.declared.sacks ?? 'Nao informado'}
                  </p>
                  <p className="app-modal-card-line">
                    <strong>Safra:</strong> {sample.declared.harvest ?? 'Nao informado'}
                  </p>
                  <p className="app-modal-card-line">
                    <strong>Lote origem:</strong> {sample.declared.originLot ?? 'Nao informado'}
                  </p>
                </>
              ) : (
                <p className="app-modal-card-line">
                  <strong>Proprietario:</strong> {sample.declared.owner ?? 'Nao informado'}
                </p>
              )}
            </div>
          </article>
        </div>

        <div className="app-modal-actions">
          <button type="button" className="app-modal-submit" onClick={onDetails}>
            {detailsLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
