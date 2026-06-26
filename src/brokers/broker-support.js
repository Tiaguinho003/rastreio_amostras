import { HttpError } from '../contracts/errors.js';
import {
  normalizeOptionalText,
  normalizeRequiredText,
  toIsoString,
} from '../users/user-support.js';

// Cadastro de corretores (Fechamento, Fase 0 -- D34/D40). Pode estar vinculado
// a um usuario do app (userId, base da metrica por corretor-usuario) ou ser um
// corretor "externo" identificado por CPF. Status ACTIVE/INACTIVE (LookupStatus).

export const BROKER_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);
export const BROKER_NAME_MAX = 120;
export const BROKER_CONTACT_MAX = 120;

export function normalizeBrokerStatus(value, fieldName = 'status') {
  const normalized = normalizeRequiredText(value, fieldName, 20).toUpperCase();
  if (!BROKER_STATUSES.includes(normalized)) {
    throw new HttpError(422, `${fieldName} must be one of ${BROKER_STATUSES.join(', ')}`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return normalized;
}

// CPF do corretor (identifica corretor nao-usuario). Opcional; quando vem,
// exige 11 digitos -- sem checagem de digito verificador, alinhado ao resto do
// sistema (ver memoria cpf_cnpj_no_checksum). Null quando ausente.
export function normalizeBrokerCpf(value, fieldName = 'cpf') {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 11) {
    throw new HttpError(422, `${fieldName} must have 11 digits`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return digits;
}

export function normalizeOptionalUserId(value, fieldName = 'userId') {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new HttpError(422, `${fieldName} must be a string`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return value.trim() || null;
}

function normalizeEmail(value) {
  const text = normalizeOptionalText(value, 'email', BROKER_CONTACT_MAX);
  return text ? text.toLowerCase() : null;
}

export function normalizeCreateBrokerInput(input) {
  return {
    name: normalizeRequiredText(input?.name, 'name', BROKER_NAME_MAX),
    userId: normalizeOptionalUserId(input?.userId),
    cpf: normalizeBrokerCpf(input?.cpf),
    phone: normalizeOptionalText(input?.phone, 'phone', BROKER_CONTACT_MAX),
    email: normalizeEmail(input?.email),
  };
}

// Update parcial: cada campo so entra se foi enviado (undefined = nao mexe).
export function normalizeUpdateBrokerInput(input) {
  const data = {};
  if (input?.name !== undefined) {
    data.name = normalizeRequiredText(input.name, 'name', BROKER_NAME_MAX);
  }
  if (input?.userId !== undefined) {
    data.userId = normalizeOptionalUserId(input.userId);
  }
  if (input?.cpf !== undefined) {
    data.cpf = normalizeBrokerCpf(input.cpf);
  }
  if (input?.phone !== undefined) {
    data.phone = normalizeOptionalText(input.phone, 'phone', BROKER_CONTACT_MAX);
  }
  if (input?.email !== undefined) {
    data.email = normalizeEmail(input.email);
  }
  if (input?.status !== undefined) {
    data.status = normalizeBrokerStatus(input.status);
  }
  if (Object.keys(data).length === 0) {
    throw new HttpError(422, 'no fields to update', { code: 'VALIDATION_ERROR' });
  }
  return data;
}

export const BROKER_VIEW_SELECT = Object.freeze({
  id: true,
  name: true,
  userId: true,
  cpf: true,
  phone: true,
  email: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, fullName: true, username: true } },
});

export function toBrokerView(broker) {
  return {
    id: broker.id,
    name: broker.name,
    userId: broker.userId ?? null,
    cpf: broker.cpf ?? null,
    phone: broker.phone ?? null,
    email: broker.email ?? null,
    status: broker.status,
    user: broker.user
      ? { id: broker.user.id, fullName: broker.user.fullName, username: broker.user.username }
      : null,
    createdAt: toIsoString(broker.createdAt),
    updatedAt: toIsoString(broker.updatedAt),
  };
}
