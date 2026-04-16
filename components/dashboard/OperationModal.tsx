'use client';

import Link from 'next/link';
import type { RefObject } from 'react';

import type { OperationModalData } from './useOperationModal';

function renderMainSampleValue(value: string | number | null) {
  if (value === null || value === '') {
    return 'Nao informado';
  }
  return String(value);
}

function formatCreationTimestamp(value: string) {
  const timestamp = new Date(value);
  const date = timestamp.toLocaleDateString('pt-BR');
  const time = timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date} - ${time}`;
}

interface OperationModalProps {
  data: OperationModalData;
  focusTrapRef: RefObject<HTMLElement | null>;
  modalCloseButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

export function OperationModal({
  data,
  focusTrapRef,
  modalCloseButtonRef,
  onClose,
}: OperationModalProps) {
  return (
    <div className="dashboard-modal-backdrop" onClick={onClose}>
      <section
        ref={focusTrapRef}
        id={data.modalId}
        className={`app-modal app-modal-dashboard ${data.themeClass}`}
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

        {data.items.length === 0 ? (
          <p className="app-modal-empty">{data.emptyMessage}</p>
        ) : (
          <div className="app-modal-list">
            {data.items.map((sample) => (
              <Link
                key={sample.id}
                href={`/samples/${sample.id}`}
                className="app-modal-card"
                onClick={onClose}
              >
                <div className="app-modal-card-body">
                  <strong className="app-modal-card-title">
                    {sample.internalLotNumber ?? sample.id}
                  </strong>
                  <p className="app-modal-card-line">
                    {renderMainSampleValue(sample.declared.owner)}
                  </p>
                  <p className="app-modal-card-meta">{formatCreationTimestamp(sample.createdAt)}</p>
                </div>
                <span className="app-modal-card-indicator" aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
