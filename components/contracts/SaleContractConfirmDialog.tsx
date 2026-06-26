'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, confirmSaleContract } from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { SessionData } from '../../lib/types';

type SaleContractConfirmDialogProps = {
  session: SessionData;
  contractId: string;
  expectedVersion: number;
  contractNumber: string;
  onClose: () => void;
  onConfirmed: () => void;
};

// Fechamento (Fase B.3): confirma o contrato (CONFERIR -> CONFIRMADO). Congela.
export function SaleContractConfirmDialog({
  session,
  contractId,
  expectedVersion,
  contractNumber,
  onClose,
  onConfirmed,
}: SaleContractConfirmDialogProps) {
  const focusTrapRef = useFocusTrap(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await confirmSaleContract(session, contractId, { expectedVersion });
      onConfirmed();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError('Este contrato foi modificado. Recarregue a página e tente de novo.');
      } else {
        setError(cause instanceof ApiError ? cause.message : 'Falha ao confirmar o contrato.');
      }
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action sample-detail-compact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ctr-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="ctr-confirm-title" className="app-modal-title">
              Confirmar contrato
            </h3>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        {error ? <p className="sdv-modal-error">{error}</p> : null}

        <div className="app-modal-content">
          <p className="ctr-confirm-text">
            Confirmar o contrato <strong>{contractNumber}</strong>? Os dados serão congelados e não
            poderão mais ser editados.
          </p>
        </div>

        <div className="app-modal-actions">
          <button type="button" className="app-modal-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="app-modal-submit"
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? 'Confirmando...' : 'Confirmar'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
