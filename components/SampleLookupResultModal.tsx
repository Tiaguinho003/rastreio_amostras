'use client';

import { QRCodeCanvas } from 'qrcode.react';
import { useId } from 'react';

import { CommercialStatusBadge } from './CommercialStatusBadge';
import { StatusBadge } from './StatusBadge';
import { useFocusTrap } from '../lib/use-focus-trap';
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
  const focusTrapRef = useFocusTrap(true);

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
              {title}
            </h3>
            <p className="app-modal-description">Confira os dados principais antes de abrir os detalhes.</p>
          </div>

          <button type="button" className="app-modal-close" onClick={onClose} aria-label="Fechar modal" autoFocus>
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

            <div className="app-modal-lookup-qr">
              <QRCodeCanvas value={sample.internalLotNumber ?? sample.id} size={120} />
            </div>

            <div className="app-modal-lookup-meta">
              <p className="app-modal-card-line">
                <strong>Lote interno:</strong> {sample.internalLotNumber ?? 'Nao definido'}
              </p>
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
            </div>
          </article>
        </div>

        <div className="app-modal-actions">
          <button type="button" className="app-modal-secondary" onClick={onPrimaryAction}>
            {primaryActionLabel}
          </button>
          <button type="button" className="app-modal-submit" onClick={onDetails}>
            {detailsLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
