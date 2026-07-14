'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { maskCnpjInput, maskCpfInput } from '../../lib/client-field-formatters';
import { digitsOnly } from '../../lib/document-validation';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { ClientBankAccountInput, ClientBankAccountSummary } from '../../lib/types';

// Detalhe + edição inline + inativar/reativar da conta bancária. Molde do
// ClientUnitDetailModal (mesmo padrão view↔edit). Banco = texto livre (D141).
type Mode = 'view' | 'edit';

type Props = {
  open: boolean;
  account: ClientBankAccountSummary | null;
  saving: boolean;
  savingStatus: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (data: ClientBankAccountInput) => Promise<void>;
  onInactivate: () => void;
  onReactivate: () => void;
};

function maskTaxId(value: string): string {
  return digitsOnly(value).length <= 11 ? maskCpfInput(value) : maskCnpjInput(value);
}

export function ClientBankAccountDetailModal({
  open,
  account,
  saving,
  savingStatus,
  errorMessage,
  onClose,
  onSave,
  onInactivate,
  onReactivate,
}: Props) {
  const focusTrapRef = useFocusTrap(open);
  const [mode, setMode] = useState<Mode>('view');
  const [bankName, setBankName] = useState('');
  const [agency, setAgency] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [holderTaxId, setHolderTaxId] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('view');
    setSubmitted(false);
    setBankName(account?.bankName ?? '');
    setAgency(account?.agency ?? '');
    setAccountNumber(account?.accountNumber ?? '');
    setHolderName(account?.holderName ?? '');
    setHolderTaxId(account?.holderTaxId ? maskTaxId(account.holderTaxId) : '');
    setPixKey(account?.pixKey ?? '');
  }, [open, account]);

  if (!open || !account) return null;

  const taxDigits = digitsOnly(holderTaxId);
  const taxValid = taxDigits.length === 11 || taxDigits.length === 14;
  const missingBank = !bankName.trim();
  const missingAgency = !agency.trim();
  const missingAccount = !accountNumber.trim();
  const missingHolder = !holderName.trim();
  const submitDisabled =
    saving || missingBank || missingAgency || missingAccount || missingHolder || !taxValid;
  const showErr = submitted;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (submitDisabled) return;
    await onSave({
      bankName: bankName.trim(),
      agency: agency.trim(),
      accountNumber: accountNumber.trim(),
      holderName: holderName.trim(),
      holderTaxId: taxDigits,
      pixKey: pixKey.trim() ? pixKey.trim() : null,
    });
  }

  const isInactive = account.status === 'INACTIVE';
  const bankLabel = account.bankName || '—';

  return createPortal(
    <div className="app-modal-backdrop" onClick={onClose}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action cudm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cbadm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header cudm-header">
          <div className="app-modal-title-wrap cudm-header-copy">
            <span className="cudm-header-eyebrow">Conta bancária</span>
            <h3 id="cbadm-title" className="app-modal-title cudm-header-name">
              {account.bankName || 'Banco'}
            </h3>
            {isInactive ? <span className="cudm-header-inactive">Inativa</span> : null}
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={saving || savingStatus}
            aria-label="Fechar"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {errorMessage ? <p className="cudm-error">{errorMessage}</p> : null}

        {mode === 'view' ? (
          <div className="app-modal-content cudm-body">
            <div className="cudm-info-grid">
              <div className="cudm-info-item is-full">
                <span className="cudm-info-label">Banco</span>
                <span className="cudm-info-value">{bankLabel}</span>
              </div>
              <div className="cudm-info-item">
                <span className="cudm-info-label">Agência</span>
                <span className="cudm-info-value">{account.agency || '—'}</span>
              </div>
              <div className="cudm-info-item">
                <span className="cudm-info-label">Conta</span>
                <span className="cudm-info-value">{account.accountNumber || '—'}</span>
              </div>
              <div className="cudm-info-item is-full">
                <span className="cudm-info-label">Titular</span>
                <span className="cudm-info-value">{account.holderName || '—'}</span>
              </div>
              <div className="cudm-info-item">
                <span className="cudm-info-label">CPF/CNPJ</span>
                <span className="cudm-info-value">{maskTaxId(account.holderTaxId) || '—'}</span>
              </div>
              <div className="cudm-info-item">
                <span className="cudm-info-label">Chave PIX</span>
                <span className="cudm-info-value">{account.pixKey || '—'}</span>
              </div>
            </div>

            <div className="cudm-footer">
              <button
                type="button"
                className={`cudm-status-btn${isInactive ? '' : ' is-danger'}`}
                onClick={isInactive ? onReactivate : onInactivate}
                disabled={savingStatus}
              >
                {isInactive ? 'Reativar' : 'Inativar'}
              </button>
              <button
                type="button"
                className="cudm-edit-btn"
                onClick={() => setMode('edit')}
                disabled={savingStatus}
              >
                Editar
              </button>
            </div>
          </div>
        ) : (
          <form className="app-modal-content cudm-body cudm-edit-form" onSubmit={handleSubmit}>
            <div className="cudm-info-grid">
              <label className="app-modal-field is-full">
                <span className="app-modal-label">Banco (obrigatório)</span>
                <input
                  className={`app-modal-input${showErr && missingBank ? ' has-error' : ''}`}
                  value={bankName}
                  disabled={saving}
                  maxLength={120}
                  onChange={(event) => setBankName(event.target.value.toUpperCase())}
                />
              </label>
              <label className="app-modal-field">
                <span className="app-modal-label">Agência (obrigatório)</span>
                <input
                  className={`app-modal-input${showErr && missingAgency ? ' has-error' : ''}`}
                  value={agency}
                  disabled={saving}
                  maxLength={20}
                  onChange={(event) => setAgency(event.target.value)}
                />
              </label>
              <label className="app-modal-field">
                <span className="app-modal-label">Conta c/ dígito (obrigatório)</span>
                <input
                  className={`app-modal-input${showErr && missingAccount ? ' has-error' : ''}`}
                  value={accountNumber}
                  disabled={saving}
                  maxLength={20}
                  onChange={(event) => setAccountNumber(event.target.value)}
                />
              </label>
              <label className="app-modal-field is-full">
                <span className="app-modal-label">Titular (obrigatório)</span>
                <input
                  className={`app-modal-input${showErr && missingHolder ? ' has-error' : ''}`}
                  value={holderName}
                  disabled={saving}
                  maxLength={120}
                  onChange={(event) => setHolderName(event.target.value.toUpperCase())}
                />
              </label>
              <label className="app-modal-field">
                <span className="app-modal-label">CPF/CNPJ do titular (obrigatório)</span>
                <input
                  className={`app-modal-input${showErr && !taxValid ? ' has-error' : ''}`}
                  value={holderTaxId}
                  disabled={saving}
                  inputMode="numeric"
                  onChange={(event) => setHolderTaxId(maskTaxId(event.target.value))}
                />
                {showErr && !taxValid ? (
                  <span className="cudm-edit-error">CPF (11) ou CNPJ (14) dígitos</span>
                ) : null}
              </label>
              <label className="app-modal-field">
                <span className="app-modal-label">Chave PIX (opcional)</span>
                <input
                  className="app-modal-input"
                  value={pixKey}
                  disabled={saving}
                  maxLength={140}
                  onChange={(event) => setPixKey(event.target.value)}
                />
              </label>
            </div>

            <div className="app-modal-actions cudm-edit-actions">
              <button
                type="button"
                className="app-modal-secondary"
                onClick={() => setMode('view')}
                disabled={saving}
              >
                Cancelar
              </button>
              <button type="submit" className="app-modal-submit" disabled={submitDisabled}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>,
    document.body
  );
}
