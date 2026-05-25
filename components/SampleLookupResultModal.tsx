'use client';

import { QRCodeCanvas } from 'qrcode.react';
import { useId } from 'react';

import { CommercialStatusBadge } from './CommercialStatusBadge';
import { StatusBadge } from './StatusBadge';
import { useFocusTrap } from '../lib/use-focus-trap';
import type { ResolveSampleByQrResponse } from '../lib/types';

export type LookupKind = 'lookup' | 'invalidated' | 'classified';

interface SampleLookupResultModalProps {
  sample: ResolveSampleByQrResponse['sample'];
  /**
   * Bloco F1 (Frente C): variante visual e conjunto de acoes.
   * - 'lookup' (default): comportamento original — confirmar amostra encontrada.
   * - 'invalidated': aviso de amostra invalidada, unica acao "Fechar".
   * - 'classified': aviso de amostra ja classificada com 3 acoes
   *   (Reclassificar / Ver detalhes / Fechar).
   */
  kind?: LookupKind;
  onClose: () => void;

  // Usado apenas em kind='lookup'.
  title?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onDetails?: () => void;
  detailsLabel?: string;

  // Usado apenas em kind='classified'.
  onReclassify?: () => void;
  onShowDetails?: () => void;
}

const COPY = {
  invalidated: {
    title: 'Amostra invalidada',
    description: 'Esta amostra esta invalidada e nao pode ser classificada.',
  },
  classified: {
    title: 'Amostra ja classificada',
    description: 'Esta amostra ja foi classificada. Quer reclassificar?',
  },
} as const;

export function SampleLookupResultModal({
  sample,
  kind = 'lookup',
  onClose,
  title,
  primaryActionLabel,
  onPrimaryAction,
  onDetails,
  detailsLabel = 'Mais informacoes',
  onReclassify,
  onShowDetails,
}: SampleLookupResultModalProps) {
  const titleId = useId();
  const focusTrapRef = useFocusTrap(true);

  const headerCopy = (() => {
    switch (kind) {
      case 'lookup':
        return {
          title: title ?? 'Amostra localizada',
          description: 'Confira os dados principais antes de abrir os detalhes.',
        };
      case 'invalidated':
        return COPY.invalidated;
      case 'classified':
        return COPY.classified;
      default: {
        // Exhaustive check: erro de compilacao se SampleStatus ganhar variante nova.
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  })();

  return (
    <div className="app-modal-backdrop" onClick={onClose}>
      <section
        ref={focusTrapRef}
        className="app-modal app-modal-lookup-result"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id={titleId} className="app-modal-title">
              {headerCopy.title}
            </h3>
            <p className="app-modal-description">{headerCopy.description}</p>
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
            <div className="app-modal-status-row">
              <div className="status-badge-group">
                <StatusBadge status={sample.status} />
                <CommercialStatusBadge status={sample.commercialStatus} />
              </div>
            </div>

            {kind === 'lookup' ? (
              <div className="app-modal-lookup-qr">
                <QRCodeCanvas value={sample.internalLotNumber ?? sample.id} size={120} />
              </div>
            ) : null}

            <div className="app-modal-lookup-meta">
              <p className="app-modal-card-line">
                <strong>Lote interno:</strong> {sample.internalLotNumber ?? 'Nao definido'}
              </p>
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
          {kind === 'lookup' ? (
            <>
              <button type="button" className="app-modal-secondary" onClick={onPrimaryAction}>
                {primaryActionLabel}
              </button>
              <button type="button" className="app-modal-submit" onClick={onDetails}>
                {detailsLabel}
              </button>
            </>
          ) : null}

          {kind === 'invalidated' ? (
            <button type="button" className="app-modal-submit" onClick={onClose}>
              Fechar
            </button>
          ) : null}

          {kind === 'classified' ? (
            <>
              <button type="button" className="app-modal-secondary" onClick={onClose}>
                Fechar
              </button>
              <button type="button" className="app-modal-secondary" onClick={onShowDetails}>
                Ver detalhes
              </button>
              <button type="button" className="app-modal-submit" onClick={onReclassify}>
                Reclassificar
              </button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
