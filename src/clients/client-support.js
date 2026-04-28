import { HttpError } from '../contracts/errors.js';
import {
  assertAuthenticatedActor,
  buildAuditContext,
  buildDiff,
  normalizeOptionalText,
  normalizeRequiredText,
  readLimitQuery,
  readPageQuery,
  toIsoString,
} from '../users/user-support.js';

export const CLIENT_PERSON_TYPES = {
  PF: 'PF',
  PJ: 'PJ',
};

export const CLIENT_STATUSES = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
};

export const CLIENT_REGISTRATION_STATUSES = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
};

export const CLIENT_AUDIT_EVENT_TYPES = {
  CLIENT_CREATED: 'CLIENT_CREATED',
  CLIENT_UPDATED: 'CLIENT_UPDATED',
  CLIENT_INACTIVATED: 'CLIENT_INACTIVATED',
  CLIENT_REACTIVATED: 'CLIENT_REACTIVATED',
  CLIENT_REGISTRATION_CREATED: 'CLIENT_REGISTRATION_CREATED',
  CLIENT_REGISTRATION_UPDATED: 'CLIENT_REGISTRATION_UPDATED',
  CLIENT_REGISTRATION_INACTIVATED: 'CLIENT_REGISTRATION_INACTIVATED',
  CLIENT_REGISTRATION_REACTIVATED: 'CLIENT_REGISTRATION_REACTIVATED',
};

export const CLIENT_LOOKUP_KINDS = {
  OWNER: 'owner',
  BUYER: 'buyer',
  ANY: 'any',
};

export const CLIENT_LIST_LIMIT_DEFAULT = 10;
export const CLIENT_LIST_LIMIT_MAX = 30;
export const CLIENT_AUDIT_LIMIT_DEFAULT = 10;
export const CLIENT_AUDIT_LIMIT_MAX = 20;
export const CLIENT_LOOKUP_LIMIT = 8;

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeDigits(value) {
  return String(value ?? '').replace(/\D+/g, '');
}

export function normalizeRegistrationCanonical(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeClientPersonType(value, fieldName = 'personType') {
  const normalized = normalizeRequiredText(value, fieldName, 8).toUpperCase();
  if (!Object.values(CLIENT_PERSON_TYPES).includes(normalized)) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return normalized;
}

function normalizeClientStatus(value, fieldName = 'status') {
  const normalized = normalizeRequiredText(value, fieldName, 16).toUpperCase();
  if (!Object.values(CLIENT_STATUSES).includes(normalized)) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return normalized;
}

function normalizeClientRegistrationStatus(value, fieldName = 'status') {
  const normalized = normalizeRequiredText(value, fieldName, 16).toUpperCase();
  if (!Object.values(CLIENT_REGISTRATION_STATUSES).includes(normalized)) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return normalized;
}

function normalizeRequiredBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new HttpError(422, `${fieldName} must be a boolean`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return value;
}

function normalizeBooleanLike(value, fieldName) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  throw new HttpError(422, `${fieldName} must be true or false`, {
    code: 'VALIDATION_ERROR',
    field: fieldName,
  });
}

function normalizeOptionalBooleanQuery(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return normalizeBooleanLike(value, fieldName);
}

function normalizeOptionalSearch(value, fieldName = 'search', maxLength = 200) {
  return normalizeOptionalText(value, fieldName, maxLength);
}

function normalizeCpf(value, fieldName = 'cpf') {
  const text = normalizeOptionalText(value, fieldName, 32);
  if (!text) {
    return null;
  }

  const normalized = normalizeDigits(text);
  if (normalized.length !== 11) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return normalized;
}

function normalizeCnpj(value, fieldName = 'cnpj') {
  const text = normalizeOptionalText(value, fieldName, 32);
  if (!text) {
    return null;
  }

  const normalized = normalizeDigits(text);
  if (normalized.length !== 14) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return normalized;
}

function normalizeClientPhone(value, fieldName = 'phone') {
  const normalized = normalizeOptionalText(value, fieldName, 40);
  if (!normalized) {
    return null;
  }

  const digits = normalizeDigits(normalized);
  if (digits.length !== 10 && digits.length !== 11) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return digits;
}

function normalizeReasonText(value, fieldName = 'reasonText') {
  return normalizeRequiredText(value, fieldName, 300);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeCommercialUserId(value, fieldName = 'commercialUserId') {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new HttpError(422, `${fieldName} must be a valid uuid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return value.trim().toLowerCase();
}

// Normaliza lista de commercialUserIds. Tri-state:
//   undefined -> nao foi fornecido
//   array     -> normaliza cada id, deduplica preservando ordem, valida UUIDs
//   outro     -> 422
export function normalizeCommercialUserIds(value, fieldName = 'commercialUserIds') {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new HttpError(422, `${fieldName} must be an array of uuids`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  const seen = new Set();
  const result = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !UUID_PATTERN.test(entry.trim())) {
      throw new HttpError(422, `${fieldName} must contain only valid uuids`, {
        code: 'VALIDATION_ERROR',
        field: fieldName,
      });
    }
    const normalized = entry.trim().toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

// Resolve singular vs plural com regra: ambos -> 422; senao retorna lista (ou undefined).
function resolveCommercialUserIdsFromInput(input) {
  const hasSingular = hasOwn(input, 'commercialUserId');
  const hasPlural = hasOwn(input, 'commercialUserIds');
  if (hasSingular && hasPlural) {
    throw new HttpError(
      422,
      'provide either commercialUserId (legacy) or commercialUserIds, not both',
      {
        code: 'COMMERCIAL_USER_ID_AMBIGUOUS',
      }
    );
  }
  if (hasPlural) {
    return normalizeCommercialUserIds(input.commercialUserIds);
  }
  if (hasSingular) {
    const single = normalizeCommercialUserId(input.commercialUserId);
    if (single === undefined) return undefined;
    return single === null ? [] : [single];
  }
  return undefined;
}

function normalizeOptionalReasonText(value, fieldName = 'reasonText') {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const trimmed = String(value).trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length > 300) {
    throw new HttpError(422, `${fieldName} must be at most 300 characters`);
  }

  return trimmed;
}

function normalizeLookupKind(value, fieldName = 'kind') {
  if (value === undefined || value === null || value === '') {
    return CLIENT_LOOKUP_KINDS.ANY;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!Object.values(CLIENT_LOOKUP_KINDS).includes(normalized)) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return normalized;
}

function normalizeClientFlags({ isBuyer, isSeller }) {
  return {
    isBuyer: typeof isBuyer === 'boolean' ? isBuyer : false,
    isSeller: typeof isSeller === 'boolean' ? isSeller : false,
  };
}

function assertProtectedClientFieldsAbsent(input) {
  for (const field of ['code', 'status', 'documentCanonical']) {
    if (hasOwn(input, field)) {
      throw new HttpError(422, `${field} cannot be provided`, {
        code: 'VALIDATION_ERROR',
        field,
      });
    }
  }
}

function assertProtectedRegistrationFieldsAbsent(input) {
  if (hasOwn(input, 'status')) {
    throw new HttpError(422, 'status cannot be provided', {
      code: 'VALIDATION_ERROR',
      field: 'status',
    });
  }
}

function buildClientWriteData({
  personType,
  fullName,
  legalName,
  tradeName,
  cpf,
  cnpj,
  phone,
  isBuyer,
  isSeller,
}) {
  const flags = normalizeClientFlags({ isBuyer, isSeller });

  if (personType === CLIENT_PERSON_TYPES.PF) {
    const normalizedFullName = normalizeRequiredText(fullName, 'fullName', 160);
    const normalizedCpf = normalizeCpf(cpf);
    return {
      personType,
      fullName: normalizedFullName,
      legalName: null,
      tradeName: null,
      cpf: normalizedCpf,
      cnpj: null,
      documentCanonical: normalizedCpf,
      phone: normalizeClientPhone(phone),
      ...flags,
    };
  }

  const normalizedLegalName = normalizeRequiredText(legalName, 'legalName', 200);
  const normalizedTradeName = normalizeOptionalText(tradeName, 'tradeName', 200);
  const normalizedCnpj = normalizeCnpj(cnpj);

  return {
    personType,
    fullName: null,
    legalName: normalizedLegalName,
    tradeName: normalizedTradeName,
    cpf: null,
    cnpj: normalizedCnpj,
    documentCanonical: normalizedCnpj,
    phone: normalizeClientPhone(phone),
    ...flags,
  };
}

export function normalizeCreateClientInput(input) {
  assertProtectedClientFieldsAbsent(input);
  const personType = normalizeClientPersonType(input.personType);
  const normalizedPhone = normalizeClientPhone(input.phone);
  if (!normalizedPhone) {
    throw new HttpError(422, 'phone is required', {
      code: 'VALIDATION_ERROR',
      field: 'phone',
    });
  }

  const data = buildClientWriteData({
    personType,
    fullName: input.fullName,
    legalName: input.legalName,
    tradeName: input.tradeName,
    cpf: input.cpf,
    cnpj: input.cnpj,
    phone: input.phone,
    isBuyer: input.isBuyer,
    isSeller: input.isSeller,
  });

  // Aceita tanto commercialUserId (legado, singular) quanto commercialUserIds
  // (lista). Sempre retornamos uma lista (vazia se nada foi fornecido).
  const fromInput = resolveCommercialUserIdsFromInput(input);
  const commercialUserIds = fromInput === undefined ? [] : fromInput;

  return { data, commercialUserIds };
}

export function normalizeUpdateClientInput(input, currentClient) {
  assertProtectedClientFieldsAbsent(input);

  const nextPersonType = hasOwn(input, 'personType')
    ? normalizeClientPersonType(input.personType)
    : currentClient.personType;

  const nextFullName = hasOwn(input, 'fullName') ? input.fullName : currentClient.fullName;
  const nextLegalName = hasOwn(input, 'legalName') ? input.legalName : currentClient.legalName;
  const nextTradeName = hasOwn(input, 'tradeName') ? input.tradeName : currentClient.tradeName;
  const nextCpf = hasOwn(input, 'cpf') ? input.cpf : currentClient.cpf;
  const nextCnpj = hasOwn(input, 'cnpj') ? input.cnpj : currentClient.cnpj;
  const nextPhone = hasOwn(input, 'phone') ? input.phone : currentClient.phone;
  const nextIsBuyer = hasOwn(input, 'isBuyer') ? input.isBuyer : currentClient.isBuyer;
  const nextIsSeller = hasOwn(input, 'isSeller') ? input.isSeller : currentClient.isSeller;

  const data = buildClientWriteData({
    personType: nextPersonType,
    fullName: nextFullName,
    legalName: nextLegalName,
    tradeName: nextTradeName,
    cpf: nextCpf,
    cnpj: nextCnpj,
    phone: nextPhone,
    isBuyer: nextIsBuyer,
    isSeller: nextIsSeller,
  });

  // commercialUserIdsInput tri-state:
  //   undefined     -> nao foi fornecido no PATCH (mantem atual)
  //   string[] (>=0) -> substitui a lista inteira (vazio = remover todos)
  // Aceita compat com commercialUserId (legado): null vira [], string vira [string].
  const commercialUserIdsInput = resolveCommercialUserIdsFromInput(input);

  return {
    reasonText: normalizeOptionalReasonText(input.reasonText),
    data,
    commercialUserIdsInput,
  };
}

function buildRegistrationWriteData({
  registrationNumber,
  registrationType,
  addressLine,
  district,
  city,
  state,
  postalCode,
  complement,
}) {
  const normalizedNumber = normalizeRequiredText(registrationNumber, 'registrationNumber', 80);
  const canonical = normalizeRegistrationCanonical(normalizedNumber);
  if (!canonical) {
    throw new HttpError(422, 'registrationNumber is invalid', {
      code: 'VALIDATION_ERROR',
      field: 'registrationNumber',
    });
  }

  return {
    registrationNumber: normalizedNumber,
    registrationNumberCanonical: canonical,
    registrationType: normalizeRequiredText(registrationType, 'registrationType', 80),
    addressLine: normalizeRequiredText(addressLine, 'addressLine', 200),
    district: normalizeRequiredText(district, 'district', 120),
    city: normalizeRequiredText(city, 'city', 120),
    state: normalizeRequiredText(state, 'state', 2).toUpperCase(),
    postalCode: normalizeRequiredText(postalCode, 'postalCode', 16),
    complement: normalizeOptionalText(complement, 'complement', 120),
  };
}

export function normalizeCreateRegistrationInput(input) {
  assertProtectedRegistrationFieldsAbsent(input);
  return buildRegistrationWriteData(input);
}

export function normalizeUpdateRegistrationInput(input, currentRegistration) {
  assertProtectedRegistrationFieldsAbsent(input);
  const data = {};

  if (hasOwn(input, 'registrationNumber')) {
    const normalizedNumber = normalizeRequiredText(
      input.registrationNumber,
      'registrationNumber',
      80
    );
    const canonical = normalizeRegistrationCanonical(normalizedNumber);
    if (!canonical) {
      throw new HttpError(422, 'registrationNumber is invalid', {
        code: 'VALIDATION_ERROR',
        field: 'registrationNumber',
      });
    }

    data.registrationNumber = normalizedNumber;
    data.registrationNumberCanonical = canonical;
  }

  if (hasOwn(input, 'registrationType')) {
    data.registrationType = normalizeRequiredText(input.registrationType, 'registrationType', 80);
  }

  if (hasOwn(input, 'addressLine')) {
    data.addressLine = normalizeRequiredText(input.addressLine, 'addressLine', 200);
  }

  if (hasOwn(input, 'district')) {
    data.district = normalizeRequiredText(input.district, 'district', 120);
  }

  if (hasOwn(input, 'city')) {
    data.city = normalizeRequiredText(input.city, 'city', 120);
  }

  if (hasOwn(input, 'state')) {
    data.state = normalizeRequiredText(input.state, 'state', 2).toUpperCase();
  }

  if (hasOwn(input, 'postalCode')) {
    data.postalCode = normalizeRequiredText(input.postalCode, 'postalCode', 16);
  }

  if (hasOwn(input, 'complement')) {
    data.complement = normalizeOptionalText(input.complement, 'complement', 120);
  }

  return {
    reasonText: normalizeOptionalReasonText(input.reasonText),
    data,
  };
}

export function normalizeListClientsInput(input) {
  // Aceita commercialUserId (singular legado) e commercialUserIds (lista, ANY).
  // Quando ambos vierem, plural ganha. Em query strings, commercialUserIds pode
  // chegar como string CSV "id1,id2" — tratamos os 2 formatos.
  let commercialUserIdsList = null;
  if (input.commercialUserIds !== undefined && input.commercialUserIds !== null) {
    const raw = Array.isArray(input.commercialUserIds)
      ? input.commercialUserIds
      : String(input.commercialUserIds)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    commercialUserIdsList = normalizeCommercialUserIds(raw, 'commercialUserIds') ?? [];
  } else {
    const single = normalizeCommercialUserId(input.commercialUserId, 'commercialUserId');
    commercialUserIdsList = single ? [single] : [];
  }

  return {
    page: readPageQuery(input.page, 1),
    limit: readLimitQuery(input.limit, {
      fallback: CLIENT_LIST_LIMIT_DEFAULT,
      max: CLIENT_LIST_LIMIT_MAX,
    }),
    search: normalizeOptionalSearch(input.search),
    status: input.status ? normalizeClientStatus(input.status) : null,
    personType: input.personType ? normalizeClientPersonType(input.personType) : null,
    isBuyer: normalizeOptionalBooleanQuery(input.isBuyer, 'isBuyer'),
    isSeller: normalizeOptionalBooleanQuery(input.isSeller, 'isSeller'),
    commercialUserIds: commercialUserIdsList,
  };
}

export function normalizeLookupClientsInput(input) {
  const search = normalizeOptionalSearch(input.search);
  if (!search || search.length < 2) {
    throw new HttpError(422, 'search must have at least 2 characters', {
      code: 'VALIDATION_ERROR',
      field: 'search',
    });
  }

  return {
    search,
    kind: normalizeLookupKind(input.kind),
    limit: CLIENT_LOOKUP_LIMIT,
  };
}

export function normalizeAuditListInput(input) {
  return {
    page: readPageQuery(input.page, 1),
    limit: readLimitQuery(input.limit, {
      fallback: CLIENT_AUDIT_LIMIT_DEFAULT,
      max: CLIENT_AUDIT_LIMIT_MAX,
    }),
  };
}

export function normalizeStatusReasonInput(input) {
  return {
    reasonText: normalizeReasonText(input.reasonText),
  };
}

function buildClientDocument(client) {
  if (client.personType === CLIENT_PERSON_TYPES.PF) {
    return client.cpf ?? null;
  }

  return client.cnpj ?? null;
}

export function buildClientDisplayName(client) {
  if (client.personType === CLIENT_PERSON_TYPES.PF) {
    return client.fullName ?? null;
  }

  return client.legalName ?? null;
}

export function toClientSummary(client, options = {}) {
  const activeRegistrationCount = options.activeRegistrationCount ?? 0;
  const registrationCount = options.registrationCount ?? 0;
  // Fonte unica: tabela join client_commercial_user. Expose duas formas:
  //  - commercialUsers: lista completa (consumida pela UI multi-user da F3)
  //  - commercialUser: primeiro entry derivado (compat singular ate F3 ser
  //    100% adotado em todos os consumidores; nao quebra UIs antigas).
  const commercialUsers = Array.isArray(client.commercialUsers)
    ? client.commercialUsers
        .map((entry) => entry.user)
        .filter(Boolean)
        .map((user) => ({ id: user.id, fullName: user.fullName }))
    : [];
  const commercialUser = commercialUsers[0] ?? null;

  return {
    id: client.id,
    code: client.code,
    personType: client.personType,
    displayName: buildClientDisplayName(client),
    fullName: client.fullName ?? null,
    legalName: client.legalName ?? null,
    tradeName: client.tradeName ?? null,
    cpf: client.cpf ?? null,
    cnpj: client.cnpj ?? null,
    document: buildClientDocument(client),
    phone: client.phone ?? null,
    isBuyer: client.isBuyer,
    isSeller: client.isSeller,
    status: client.status,
    commercialUser,
    commercialUsers,
    registrationCount,
    activeRegistrationCount,
    primaryCity: options.primaryCity ?? null,
    primaryState: options.primaryState ?? null,
    createdAt: toIsoString(client.createdAt),
    updatedAt: toIsoString(client.updatedAt),
  };
}

export function toClientRegistrationSummary(registration) {
  return {
    id: registration.id,
    clientId: registration.clientId,
    status: registration.status,
    registrationNumber: registration.registrationNumber,
    registrationType: registration.registrationType,
    addressLine: registration.addressLine,
    district: registration.district,
    city: registration.city,
    state: registration.state,
    postalCode: registration.postalCode,
    complement: registration.complement ?? null,
    createdAt: toIsoString(registration.createdAt),
    updatedAt: toIsoString(registration.updatedAt),
  };
}

export function toClientAuditEventResponse(event) {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    payload: event.payload,
    reasonText: event.reasonText ?? null,
    createdAt: toIsoString(event.createdAt),
    actorUser: event.actorUser
      ? {
          id: event.actorUser.id,
          fullName: event.actorUser.fullName,
          username: event.actorUser.username,
        }
      : null,
    targetClient: event.targetClient
      ? {
          id: event.targetClient.id,
          code: event.targetClient.code,
          displayName: buildClientDisplayName(event.targetClient),
          status: event.targetClient.status,
          personType: event.targetClient.personType,
        }
      : null,
    targetRegistration: event.targetRegistration
      ? {
          id: event.targetRegistration.id,
          registrationNumber: event.targetRegistration.registrationNumber,
          registrationType: event.targetRegistration.registrationType,
          status: event.targetRegistration.status,
        }
      : null,
    metadata: {
      ip: event.metadataIp ?? null,
      userAgent: event.metadataUserAgent ?? null,
    },
  };
}

export function buildClientAuditPayload(before, after) {
  const diff = buildDiff(before, after);
  return {
    before: diff.before,
    after: diff.after,
    diff,
  };
}

export function buildClientAuditState(client) {
  // Aceita formas variadas do select da tabela join:
  //   - { commercialUsers: [{ userId }] } (select minimo)
  //   - { commercialUsers: [{ user: { id, fullName } }] } (select detalhado)
  const commercialUserIds = Array.isArray(client.commercialUsers)
    ? client.commercialUsers
        .map((entry) => entry?.userId ?? entry?.user?.id ?? null)
        .filter(Boolean)
    : [];
  return {
    code: client.code,
    personType: client.personType,
    displayName: buildClientDisplayName(client),
    fullName: client.fullName ?? null,
    legalName: client.legalName ?? null,
    tradeName: client.tradeName ?? null,
    cpf: client.cpf ?? null,
    cnpj: client.cnpj ?? null,
    document: buildClientDocument(client),
    phone: client.phone ?? null,
    isBuyer: client.isBuyer,
    isSeller: client.isSeller,
    status: client.status,
    commercialUserIds,
  };
}

export function buildRegistrationAuditState(registration) {
  return {
    status: registration.status,
    registrationNumber: registration.registrationNumber,
    registrationType: registration.registrationType,
    addressLine: registration.addressLine,
    district: registration.district,
    city: registration.city,
    state: registration.state,
    postalCode: registration.postalCode,
    complement: registration.complement ?? null,
  };
}

export function buildClientListPage(total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;

  return {
    limit,
    page: safePage,
    offset,
    total,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

export {
  assertAuthenticatedActor,
  buildAuditContext,
  hasOwn,
  normalizeClientPersonType,
  normalizeClientRegistrationStatus,
  normalizeClientStatus,
  normalizeReasonText,
  normalizeBooleanLike,
  readPageQuery,
  readLimitQuery,
};
