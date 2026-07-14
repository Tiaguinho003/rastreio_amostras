import { HttpError } from '../contracts/errors.js';
import {
  normalizeOptionalText,
  normalizeRequiredText,
  toIsoString,
} from '../users/user-support.js';

// Conta bancaria por cliente (Fechamento Fase 0 -- D28). Sub-entidade do
// Cliente, no padrao ClientUnit. Status ACTIVE/INACTIVE (LookupStatus); sem
// hard delete -- inativacao via status (coerente com ClientUnit).
// Banco = texto livre (bankName, D141); a entidade Bank/COMPE foi removida.

export const CLIENT_BANK_ACCOUNT_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);
const ACCOUNT_TEXT_MAX = 60;
const BANK_NAME_MAX = 120;
const HOLDER_NAME_MAX = 120;
const PIX_MAX = 140;

export function normalizeClientBankAccountStatus(value, fieldName = 'status') {
  const normalized = normalizeRequiredText(value, fieldName, 20).toUpperCase();
  if (!CLIENT_BANK_ACCOUNT_STATUSES.includes(normalized)) {
    throw new HttpError(
      422,
      `${fieldName} must be one of ${CLIENT_BANK_ACCOUNT_STATUSES.join(', ')}`,
      { code: 'VALIDATION_ERROR', field: fieldName }
    );
  }
  return normalized;
}

// Titular: CPF (11) ou CNPJ (14) digitos -- sem checagem de digito verificador,
// alinhado ao resto do sistema (ver memoria cpf_cnpj_no_checksum). Obrigatorio.
export function normalizeHolderTaxId(value, fieldName = 'holderTaxId') {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new HttpError(422, `${fieldName} is required`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 11 && digits.length !== 14) {
    throw new HttpError(422, `${fieldName} must have 11 (CPF) or 14 (CNPJ) digits`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return digits;
}

export function normalizeCreateClientBankAccountInput(input) {
  return {
    bankName: normalizeRequiredText(input?.bankName, 'bankName', BANK_NAME_MAX),
    agency: normalizeRequiredText(input?.agency, 'agency', ACCOUNT_TEXT_MAX),
    accountNumber: normalizeRequiredText(input?.accountNumber, 'accountNumber', ACCOUNT_TEXT_MAX),
    holderName: normalizeRequiredText(input?.holderName, 'holderName', HOLDER_NAME_MAX),
    holderTaxId: normalizeHolderTaxId(input?.holderTaxId),
    pixKey: normalizeOptionalText(input?.pixKey, 'pixKey', PIX_MAX),
  };
}

// Update parcial: cada campo so entra se foi enviado (undefined = nao mexe).
export function normalizeUpdateClientBankAccountInput(input) {
  const data = {};
  if (input?.bankName !== undefined) {
    data.bankName = normalizeRequiredText(input.bankName, 'bankName', BANK_NAME_MAX);
  }
  if (input?.agency !== undefined) {
    data.agency = normalizeRequiredText(input.agency, 'agency', ACCOUNT_TEXT_MAX);
  }
  if (input?.accountNumber !== undefined) {
    data.accountNumber = normalizeRequiredText(
      input.accountNumber,
      'accountNumber',
      ACCOUNT_TEXT_MAX
    );
  }
  if (input?.holderName !== undefined) {
    data.holderName = normalizeRequiredText(input.holderName, 'holderName', HOLDER_NAME_MAX);
  }
  if (input?.holderTaxId !== undefined) {
    data.holderTaxId = normalizeHolderTaxId(input.holderTaxId);
  }
  if (input?.pixKey !== undefined) {
    data.pixKey = normalizeOptionalText(input.pixKey, 'pixKey', PIX_MAX);
  }
  if (input?.status !== undefined) {
    data.status = normalizeClientBankAccountStatus(input.status);
  }
  if (Object.keys(data).length === 0) {
    throw new HttpError(422, 'no fields to update', { code: 'VALIDATION_ERROR' });
  }
  return data;
}

export const CLIENT_BANK_ACCOUNT_VIEW_SELECT = Object.freeze({
  id: true,
  clientId: true,
  bankName: true,
  agency: true,
  accountNumber: true,
  holderName: true,
  holderTaxId: true,
  pixKey: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export function toClientBankAccountView(account) {
  return {
    id: account.id,
    clientId: account.clientId,
    bankName: account.bankName,
    agency: account.agency,
    accountNumber: account.accountNumber,
    holderName: account.holderName,
    holderTaxId: account.holderTaxId,
    pixKey: account.pixKey ?? null,
    status: account.status,
    createdAt: toIsoString(account.createdAt),
    updatedAt: toIsoString(account.updatedAt),
  };
}
