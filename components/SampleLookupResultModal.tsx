'use client';

import { QRCodeCanvas } from 'qrcode.react';
import { useId } from 'react';

import { CommercialStatusBadge } from './CommercialStatusBadge';
import { StatusBadge } from './StatusBadge';
import type { ResolveSampleByQrResponse } from '../lib/types';

interface SampleLookupResultModalProps {
  sample: ResolveSampleByQrResponse['sample'];
  title: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  onDetails: () => void;
  onClose: () => void;
  detailsLabel?: string;
}

export function SampleLookupResultModal({
  sample,
  title,
  primaryActionLabel,
  onPrimaryAction,
  onDetails,
  onClose,
  detailsLabel = 'Mais informacoes'
}: SampleLookupResultModalProps) {
  const titleId = useId();

  return (
    <div className="new-sample-label-modal-backdrop" onClick={onClose}>
      <section
        className="new-sample-label-modal sample-search-result-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="new-sample-label-modal-header">
          <h3 id={titleId} className="new-sample-label-modal-title">
            {title}
          </h3>

          <button type="button" className="new-sample-label-modal-close" onClick={onClose} aria-label="Fechar modal" autoFocus>
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="new-sample-label-modal-content">
          <article className="label-print-card sample-search-label-card">
            <div className="sample-search-label-status">
              <div className="status-badge-group">
                <StatusBadge status={sample.status} />
                <CommercialStatusBadge status={sample.commercialStatus} />
              </div>
            </div>
            <div className="label-qr">
              <QRCodeCanvas value={sample.internalLotNumber ?? sample.id} size={120} />
            </div>
            <div className="label-meta">
              <p>
                <strong>Lote interno:</strong> {sample.internalLotNumber ?? 'Nao definido'}
              </p>
              <p>
                <strong>Proprietario:</strong> {sample.declared.owner ?? 'Nao informado'}
              </p>
              <p>
                <strong>Sacas:</strong> {sample.declared.sacks ?? 'Nao informado'}
              </p>
              <p>
                <strong>Safra:</strong> {sample.declared.harvest ?? 'Nao informado'}
              </p>
              <p>
                <strong>Lote origem:</strong> {sample.declared.originLot ?? 'Nao informado'}
              </p>
            </div>
          </article>
        </div>

        <div className="row new-sample-print-actions new-sample-label-modal-actions">
          <button type="button" className="new-sample-label-action-new" onClick={onPrimaryAction}>
            {primaryActionLabel}
          </button>
          <button type="button" className="new-sample-link-button new-sample-label-action-details" onClick={onDetails}>
            {detailsLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
