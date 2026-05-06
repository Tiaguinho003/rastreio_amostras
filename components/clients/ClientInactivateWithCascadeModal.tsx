'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '../../lib/use-focus-trap';

// #6/Q-05+Q-08: modal disparado quando inactivateClient retorna 409
// CLIENT_HAS_ACTIVE_SAMPLES. Lista as amostras vinculadas e pede
// confirmacao explicita pra invalidar tudo em cascata.

export type CascadeSample = {
  id: string;
  internalLotNumber: string | null;
  status: string;
  declaredOwner: string | null;
  soldSacks: number;
  lostSacks: number;
  createdAt: string;
};

type ClientInactivateWithCascadeModalProps = {
  open: boolean;
  clientName: string;
  activeSamples: CascadeSample[];
  saving: boolean;
  errorMessage: string | null;
  // Motivo digitado no status-modal antes do 409 — pre-popula o campo
  // pra nao perder o que o usuario ja escreveu.
  initialReason?: string;
  onCancel: () => void;
  onConfirm: (confirmedSampleIds: string[], reasonText: string | null) => Promise<void> | void;
};

function formatSampleDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

export function ClientInactivateWithCascadeModal({
  open,
  clientName,
  activeSamples,
  saving,
  errorMessage,
  initialReason,
  onCancel,
  onConfirm,
}: ClientInactivateWithCascadeModalProps) {
  const focusTrapRef = useFocusTrap(open);
  const [reasonText, setReasonText] = useState(initialReason ?? '');

  useEffect(() => {
    if (open) setReasonText(initialReason ?? '');
  }, [open, initialReason]);

  if (!open) return null;

  const hasMovements = activeSamples.some((s) => s.soldSacks > 0 || s.lostSacks > 0);
  const sampleCount = activeSamples.length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const ids = activeSamples.map((s) => s.id);
    const trimmed = reasonText.trim();
    await onConfirm(ids, trimmed.length > 0 ? trimmed : null);
  }

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed client-cascade-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-cascade-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="client-cascade-modal-title" className="app-modal-title">
              Inativar cliente em cascata
            </h3>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onCancel}
            disabled={saving}
            aria-label="Fechar"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="app-modal-content">
          <div className="sdv-cascade-warn">
            <p>
              <strong>{clientName}</strong> possui <strong>{sampleCount}</strong> amostra
              {sampleCount === 1 ? '' : 's'} ativa{sampleCount === 1 ? '' : 's'} vinculada
              {sampleCount === 1 ? '' : 's'}. Inativar o cliente também invalidará{' '}
              {sampleCount === 1 ? 'esta amostra' : `as ${sampleCount} amostras`} (status{' '}
              <strong>INVALIDATED</strong>, terminal).
            </p>
            {hasMovements ? (
              <p className="sdv-cascade-warn-movements">
                ⚠ Algumas amostras possuem movimentações comerciais ativas (vendas/perdas). Cancele
                as movimentações antes — ou a operação será rejeitada.
              </p>
            ) : null}
          </div>

          {errorMessage ? <p className="sdv-modal-error">{errorMessage}</p> : null}

          <div className="sdv-cascade-list">
            {activeSamples.map((sample) => (
              <div key={sample.id} className="sdv-cascade-item">
                <div className="sdv-cascade-item-main">
                  <span className="sdv-cascade-item-lot">
                    {sample.internalLotNumber ?? sample.id.slice(0, 8)}
                  </span>
                  <span className="sdv-cascade-item-status">{sample.status}</span>
                </div>
                <div className="sdv-cascade-item-meta">
                  {sample.declaredOwner ? <span>{sample.declaredOwner} · </span> : null}
                  {formatSampleDate(sample.createdAt)}
                  {sample.soldSacks > 0 ? <span> · {sample.soldSacks} sacas vendidas</span> : null}
                  {sample.lostSacks > 0 ? <span> · {sample.lostSacks} sacas perdidas</span> : null}
                </div>
              </div>
            ))}
          </div>

          <form className="client-cascade-form" onSubmit={handleSubmit}>
            <label className="app-modal-field">
              <span className="app-modal-label">Motivo (opcional)</span>
              <textarea
                className="app-modal-input"
                value={reasonText}
                disabled={saving}
                maxLength={300}
                rows={3}
                onChange={(event) => setReasonText(event.target.value)}
                placeholder="Ex.: Encerramento de relacionamento comercial"
              />
            </label>

            <div className="app-modal-actions">
              <button type="submit" className="app-modal-submit is-danger" disabled={saving}>
                {saving
                  ? 'Inativando...'
                  : `Confirmar e invalidar ${sampleCount} amostra${sampleCount === 1 ? '' : 's'}`}
              </button>
              <button
                type="button"
                className="app-modal-secondary"
                onClick={onCancel}
                disabled={saving}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>,
    document.body
  );
}
