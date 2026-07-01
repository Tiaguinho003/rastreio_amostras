'use client';

import { useEffect, useState } from 'react';

import { useFocusTrap } from '../../lib/use-focus-trap';
import type { UserSummary } from '../../lib/types';

type Props = {
  open: boolean;
  user: UserSummary;
  saving: boolean;
  errorMessage: string | null;
  onConfirm: (reasonText: string) => void;
  onBack: () => void;
};

const MIN_REASON_LENGTH = 5;

export function InactivateConfirmDialog({
  open,
  user,
  saving,
  errorMessage,
  onConfirm,
  onBack,
}: Props) {
  const focusTrapRef = useFocusTrap(open);
  const [reasonText, setReasonText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) {
      // reset ao fechar
      setReasonText('');
      setSubmitted(false);
    }
  }, [open]);

  if (!open) return null;

  const trimmedLength = reasonText.trim().length;
  const isValid = trimmedLength >= MIN_REASON_LENGTH;
  const showError = submitted && !isValid;

  function handleSubmit() {
    setSubmitted(true);
    if (!isValid) return;
    onConfirm(reasonText.trim());
  }

  return (
    <div className="app-modal-backdrop inactivate-confirm-dialog-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal inactivate-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inactivate-confirm-title"
      >
        <header className="inactivate-confirm-dialog__header">
          <h3 id="inactivate-confirm-title">Confirmar inativação</h3>
          <p className="inactivate-confirm-dialog__subtitle">
            Confirmar inativação de <strong>{user.fullName}</strong>?
          </p>
        </header>

        <div className="inactivate-confirm-dialog__body">
          <label className="inactivate-confirm-dialog__field">
            <span className="inactivate-confirm-dialog__label">
              Motivo da inativação (mínimo {MIN_REASON_LENGTH} caracteres)
            </span>
            <textarea
              className={`inactivate-confirm-dialog__textarea ${showError ? 'is-field-error' : ''}`}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              disabled={saving}
              rows={4}
              maxLength={500}
              placeholder="Ex.: desligamento, mudança de função, etc."
              autoFocus
            />
            <span className="inactivate-confirm-dialog__char-count">{trimmedLength}/500</span>
            {showError ? (
              <span className="app-modal-error" role="alert">
                Informe um motivo com pelo menos {MIN_REASON_LENGTH} caracteres.
              </span>
            ) : null}
          </label>

          {errorMessage ? (
            <p className="inactivate-confirm-dialog__error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <footer className="inactivate-confirm-dialog__footer">
          <button type="button" className="app-modal-secondary" onClick={onBack} disabled={saving}>
            Voltar
          </button>
          <button
            type="button"
            className="app-modal-submit"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Inativando...' : 'Inativar definitivamente'}
          </button>
        </footer>
      </section>
    </div>
  );
}
