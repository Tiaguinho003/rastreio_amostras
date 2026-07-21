'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { BottomSheet } from '../BottomSheet';
import { maskCnpjInput, maskCpfInput } from '../../lib/client-field-formatters';
import { digitsOnly } from '../../lib/document-validation';
import type { ClientBankAccountInput } from '../../lib/types';

// Criar conta bancária do cliente (Fechamento Fase 0 — D28). Molde do
// ClientUnitModal. Titular pré-preenchido com nome/documento do cliente.
// Banco = texto livre (D141), MAIÚSCULAS como o Titular.
// Rodada 5 FV: painel LATERAL (side-sheet stacked) em vez de modal central —
// seta ← da borda cancela; submit no footer sticky. Vale em todos os
// contextos (detalhe do cliente e o "+adicionar conta" do contrato).
type Props = {
  open: boolean;
  saving: boolean;
  success?: boolean;
  errorMessage: string | null;
  defaultHolderName?: string | null;
  defaultHolderTaxId?: string | null;
  onClose: () => void;
  onSubmit: (data: ClientBankAccountInput) => Promise<void> | void;
};

// Titular pode ser CPF (11) ou CNPJ (14): máscara por comprimento.
function maskTaxId(value: string): string {
  return digitsOnly(value).length <= 11 ? maskCpfInput(value) : maskCnpjInput(value);
}

export function ClientBankAccountModal({
  open,
  saving,
  success = false,
  errorMessage,
  defaultHolderName,
  defaultHolderTaxId,
  onClose,
  onSubmit,
}: Props) {
  const [bankName, setBankName] = useState('');
  const [agency, setAgency] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [holderTaxId, setHolderTaxId] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBankName('');
    setAgency('');
    setAccountNumber('');
    setHolderName(defaultHolderName ?? '');
    setHolderTaxId(defaultHolderTaxId ? maskTaxId(defaultHolderTaxId) : '');
    setPixKey('');
    setSubmitted(false);
  }, [open, defaultHolderName, defaultHolderTaxId]);

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
    await onSubmit({
      bankName: bankName.trim(),
      agency: agency.trim(),
      accountNumber: accountNumber.trim(),
      holderName: holderName.trim(),
      holderTaxId: taxDigits,
      pixKey: pixKey.trim() ? pixKey.trim() : null,
    });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDismissAttempt={() => !saving && !success}
      title="Nova conta bancária"
      ariaLabel="Nova conta bancária"
      stacked
      closeVariant="edge-back"
      dragDisabled={saving || success}
      className="client-panel-sheet side-sheet"
      footer={
        success ? null : (
          <button
            type="submit"
            form="client-bank-create-form"
            className="app-modal-submit"
            disabled={submitDisabled}
          >
            {saving ? 'Salvando...' : 'Criar conta'}
          </button>
        )
      }
    >
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

          <form
            id="client-bank-create-form"
            className="client-unit-modal-form"
            onSubmit={handleSubmit}
          >
            <div className="client-unit-modal-body">
              <label className="app-modal-field">
                <span className="app-modal-label">Banco (obrigatório)</span>
                <input
                  className={`app-modal-input${showErr && missingBank ? ' has-error' : ''}`}
                  value={bankName}
                  disabled={saving}
                  maxLength={120}
                  onChange={(event) => setBankName(event.target.value.toUpperCase())}
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
          </form>
        </>
      )}
    </BottomSheet>
  );
}
