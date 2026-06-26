import { HttpError } from '../contracts/errors.js';
import { normalizeRequiredText, toIsoString } from '../users/user-support.js';

// Cadastro de bancos (lookup do Fechamento, Fase 0 -- D24/D39). Usado pelas
// contas bancarias de cliente (ClientBankAccount). Status ACTIVE/INACTIVE
// compartilhado com as demais tabelas de cadastro (enum LookupStatus).

export const BANK_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);
export const BANK_NAME_MAX = 120;

// Codigo COMPE: 3 digitos (ex.: 001 BB, 341 Itau, 237 Bradesco). Aceita 1-3
// digitos na entrada e normaliza com zero-padding a esquerda ("1" -> "001").
export function normalizeCompeCode(value, fieldName = 'compeCode') {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new HttpError(422, `${fieldName} is required`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 3) {
    throw new HttpError(422, `${fieldName} must have 1 to 3 digits`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return digits.padStart(3, '0');
}

export function normalizeBankStatus(value, fieldName = 'status') {
  const normalized = normalizeRequiredText(value, fieldName, 20).toUpperCase();
  if (!BANK_STATUSES.includes(normalized)) {
    throw new HttpError(422, `${fieldName} must be one of ${BANK_STATUSES.join(', ')}`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return normalized;
}

export function normalizeCreateBankInput(input) {
  return {
    name: normalizeRequiredText(input?.name, 'name', BANK_NAME_MAX),
    compeCode: normalizeCompeCode(input?.compeCode),
  };
}

// Update parcial: cada campo so entra se foi enviado (undefined = nao mexe).
export function normalizeUpdateBankInput(input) {
  const data = {};
  if (input?.name !== undefined) {
    data.name = normalizeRequiredText(input.name, 'name', BANK_NAME_MAX);
  }
  if (input?.compeCode !== undefined) {
    data.compeCode = normalizeCompeCode(input.compeCode);
  }
  if (input?.status !== undefined) {
    data.status = normalizeBankStatus(input.status);
  }
  if (Object.keys(data).length === 0) {
    throw new HttpError(422, 'no fields to update', { code: 'VALIDATION_ERROR' });
  }
  return data;
}

export const BANK_VIEW_SELECT = Object.freeze({
  id: true,
  name: true,
  compeCode: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export function toBankView(bank) {
  return {
    id: bank.id,
    name: bank.name,
    compeCode: bank.compeCode,
    status: bank.status,
    createdAt: toIsoString(bank.createdAt),
    updatedAt: toIsoString(bank.updatedAt),
  };
}
