'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { maskCnpjInput, maskCpfInput } from '../../lib/client-field-formatters';
import { digitsOnly } from '../../lib/document-validation';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { ClientBankAccountInput, SessionData } from '../../lib/types';
import { BankSelectField } from './BankSelectField';

// Criar conta bancária do cliente (Fechamento Fase 0 — D28). Molde do
// ClientUnitModal. Titular pré-preenchido com nome/documento do cliente.
type Props = {
  open: boolean;
  session: SessionData;
  saving: boolean;
  success?: boolean;
  errorMessage: string | null;
  defaultHolderName?: string | null;
  defaultHolderTaxId?: string | null;
  /** Eleva pro tier stacked (600/610) quando aberto SOBRE outro sheet/modal
      (ex.: o sheet de criação de contrato). Default false (uso standalone). */
  stacked?: boolean;
  onClose: () => void;
  onSubmit: (data: ClientBankAccountInput) => Promise<void> | void;
};

// Titular pode ser CPF (11) ou CNPJ (14): máscara por comprimento.
function maskTaxId(value: string): string {
  return digitsOnly(value).length <= 11 ? maskCpfInput(value) : maskCnpjInput(value);
}

export function ClientBankAccountModal({
  open,
  session,
  saving,
  success = false,
  errorMessage,
  defaultHolderName,
  defaultHolderTaxId,
  stacked = false,
  onClose,
  onSubmit,
}: Props) {
  const focusTrapRef = useFocusTrap(open);
  const [bankId, setBankId] = useState<string | null>(null);
  const [agency, setAgency] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [holderTaxId, setHolderTaxId] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBankId(null);
    setAgency('');
    setAccountNumber('');
    setHolderName(defaultHolderName ?? '');
    setHolderTaxId(defaultHolderTaxId ? maskTaxId(defaultHolderTaxId) : '');
    setPixKey('');
    setSubmitted(false);
  }, [open, defaultHolderName, defaultHolderTaxId]);

  if (!open) return null;

  const taxDigits = digitsOnly(holderTaxId);
  const taxValid = taxDigits.length === 11 || taxDigits.length === 14;
  const missingBank = !bankId;
  const missingAgency = !agency.trim();
  const missingAccount = !accountNumber.trim();
  const missingHolder = !holderName.trim();
  const submitDisabled =
    saving || missingBank || missingAgency || missingAccount || missingHolder || !taxValid;
  const showErr = submitted;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (submitDisabled || !bankId) return;
    await onSubmit({
      bankId,
      agency: agency.trim(),
      accountNumber: accountNumber.trim(),
      holderName: holderName.trim(),
      holderTaxId: taxDigits,
      pixKey: pixKey.trim() ? pixKey.trim() : null,
    });
  }

  return createPortal(
    <div className={`app-modal-backdrop${stacked ? ' is-stacked' : ''}`}>
      <section
        ref={focusTrapRef}
        className={`app-modal is-themed is-action client-unit-modal${stacked ? ' is-stacked' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cba-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="cba-modal-title" className="app-modal-title">
              Nova conta bancária
            </h3>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={saving || success}
            aria-label="Fechar"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {success ? (
          <div className="client-detail-success-check">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
        ) : (
          <>
            {errorMessage ? <p className="client-unit-modal-error">{errorMessage}</p> : null}

            <form className="client-unit-modal-form" onSubmit={handleSubmit}>
              <div className="client-unit-modal-body">
                <label className="app-modal-field">
                  <span className="app-modal-label">Banco (obrigatório)</span>
                  <BankSelectField
                    session={session}
                    value={bankId}
                    onChange={setBankId}
                    disabled={saving}
                    errorMessage={showErr && missingBank ? 'Selecione um banco' : null}
                  />
                </label>

                <div className="sdv-edit-row">
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
                </div>

                <label className="app-modal-field">
                  <span className="app-modal-label">Titular (obrigatório)</span>
                  <input
                    className={`app-modal-input${showErr && missingHolder ? ' has-error' : ''}`}
                    value={holderName}
                    disabled={saving}
                    maxLength={120}
                    onChange={(event) => setHolderName(event.target.value.toUpperCase())}
                  />
                </label>

                <div className="sdv-edit-row">
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
                      <span className="sdv-edit-error" role="alert">
                        Informe CPF (11) ou CNPJ (14) dígitos
                      </span>
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
              </div>

              <div className="app-modal-actions client-unit-modal-actions">
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={onClose}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button type="submit" className="app-modal-submit" disabled={submitDisabled}>
                  {saving ? 'Salvando...' : 'Criar conta'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>,
    document.body
  );
}
