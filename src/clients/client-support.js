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

export const CLIENT_UNIT_STATUSES = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
};

// Fase 0: invariante "PF sempre tem >=1 fazenda". Quando o caller cria um
// cliente PF sem fornecer units, o backend injeta uma fazenda placeholder
// com este nome. Os demais campos ficam NULL (e o cliente fica marcado
// como incompleto via lib/clients/client-completeness.ts).
export const DEFAULT_PF_UNIT_NAME = 'Fazenda 1';

// L5/Q-16: cutover removeu CLIENT_REGISTRATION_*, CLIENT_BRANCH_*,
// CLIENT_SPLIT e CLIENT_BRANCH_CONSOLIDATED do enum. Codigo emite apenas
// os 8 valores ativos (4 sobre Client, 4 sobre ClientUnit).
export const CLIENT_AUDIT_EVENT_TYPES = {
  CLIENT_CREATED: 'CLIENT_CREATED',
  CLIENT_UPDATED: 'CLIENT_UPDATED',
  CLIENT_INACTIVATED: 'CLIENT_INACTIVATED',
  CLIENT_REACTIVATED: 'CLIENT_REACTIVATED',
  CLIENT_UNIT_CREATED: 'CLIENT_UNIT_CREATED',
  CLIENT_UNIT_UPDATED: 'CLIENT_UNIT_UPDATED',
  CLIENT_UNIT_INACTIVATED: 'CLIENT_UNIT_INACTIVATED',
  CLIENT_UNIT_REACTIVATED: 'CLIENT_UNIT_REACTIVATED',
};

export const CLIENT_LOOKUP_KINDS = {
  OWNER: 'owner',
  BUYER: 'buyer',
  WAREHOUSE: 'warehouse',
  ANY: 'any',
};

export const CLIENT_LIST_LIMIT_DEFAULT = 10;
// 14.4.C: limit max subiu para 60 (alinha com CLIENT_PAGE_LIMIT do
// frontend; reduz overhead no scroll infinito com 250+ clientes).
export const CLIENT_LIST_LIMIT_MAX = 60;
export const CLIENT_AUDIT_LIMIT_DEFAULT = 10;
export const CLIENT_AUDIT_LIMIT_MAX = 20;
export const CLIENT_LOOKUP_LIMIT = 8;

const BRAZIL_UF = new Set([
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
]);

// Q-D: regex simples — aceita qualquer formato local@dominio.tld.
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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

// 14.7: normaliza input de busca pra casar com a coluna gerada
// search_normalized do Client (acento removido + minusculas, espacos
// preservados). NFD decompoe caracteres acentuados em base + combining
// mark; o regex remove os marks (U+0300..U+036F). Compartilhada com a
// busca de informes de visita (visit-report-service).
export function normalizeSearchInput(input) {
  if (typeof input !== 'string' || input.length === 0) return '';
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
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

// F6.1: validacao com algoritmo da Receita Federal (digitos verificadores).
// Rejeita sequencias homogeneas (00000000000, 11111111111, etc.) que passam
// no checksum mas nao sao documentos reais.
export function isValidCpfChecksum(digits) {
  if (typeof digits !== 'string' || digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
  const d1 = ((sum * 10) % 11) % 10;
  if (d1 !== Number(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i);
  const d2 = ((sum * 10) % 11) % 10;
  return d2 === Number(digits[10]);
}

const CNPJ_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function isValidCnpjChecksum(digits) {
  if (typeof digits !== 'string' || digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(digits[i]) * CNPJ_WEIGHTS_1[i];
  let mod = sum % 11;
  const d1 = mod < 2 ? 0 : 11 - mod;
  if (d1 !== Number(digits[12])) return false;
  sum = 0;
  for (let i = 0; i < 13; i += 1) sum += Number(digits[i]) * CNPJ_WEIGHTS_2[i];
  mod = sum % 11;
  const d2 = mod < 2 ? 0 : 11 - mod;
  return d2 === Number(digits[13]);
}

function normalizeCpf(value, fieldName = 'cpf') {
  const text = normalizeOptionalText(value, fieldName, 32);
  if (!text) {
    return null;
  }

  const normalized = normalizeDigits(text);
  if (normalized.length !== 11 || !isValidCpfChecksum(normalized)) {
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
  if (normalized.length !== 14 || !isValidCnpjChecksum(normalized)) {
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

function normalizeOptionalEmail(value, fieldName = 'email') {
  const text = normalizeOptionalText(value, fieldName, 200);
  if (!text) {
    return null;
  }

  const normalized = text.toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return normalized;
}

function normalizeOptionalState(value, fieldName = 'state') {
  const text = normalizeOptionalText(value, fieldName, 2);
  if (!text) {
    return null;
  }
  const upper = text.toUpperCase();
  if (!BRAZIL_UF.has(upper)) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return upper;
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

function normalizeClientFlags({ isBuyer, isSeller, isWarehouse }) {
  return {
    isBuyer: typeof isBuyer === 'boolean' ? isBuyer : false,
    isSeller: typeof isSeller === 'boolean' ? isSeller : false,
    isWarehouse: typeof isWarehouse === 'boolean' ? isWarehouse : false,
  };
}

// L5: cnpjRoot, cnpjOrder e registrationNumberCanonical sao derivados;
// nunca aceitos no input. cnpj e aceito direto em PJ create (campo do
// Client pos-L5).
function assertProtectedClientFieldsAbsent(input) {
  for (const field of [
    'code',
    'status',
    'cnpjRoot',
    'cnpjOrder',
    'registrationNumberCanonical',
    // Compat: legados removidos pelo L3 — recusa se chegar.
    'documentCanonical',
  ]) {
    if (hasOwn(input, field)) {
      throw new HttpError(422, `${field} cannot be provided`, {
        code: 'VALIDATION_ERROR',
        field,
      });
    }
  }
}

function assertProtectedUnitFieldsAbsent(input) {
  for (const field of [
    'status',
    'code',
    'registrationNumberCanonical',
    // Removido em L5 (Q-13/D-C).
    'registrationType',
    'cnpjOrder',
    // Q-15: isPrimary nao existe mais.
    'isPrimary',
  ]) {
    if (hasOwn(input, field)) {
      throw new HttpError(422, `${field} cannot be provided`, {
        code: 'VALIDATION_ERROR',
        field,
      });
    }
  }
}

// L5: PJ guarda cnpj/endereco/IE/email direto no Client. PF mantem
// fullName/cpf/email; endereco e IE moram em ClientUnit (fazenda).
function buildClientWriteData(personType, input) {
  const flags = normalizeClientFlags({
    isBuyer: input.isBuyer,
    isSeller: input.isSeller,
    isWarehouse: input.isWarehouse,
  });

  if (personType === CLIENT_PERSON_TYPES.PF) {
    const normalizedFullName = normalizeRequiredText(input.fullName, 'fullName', 160);
    const normalizedCpf = normalizeCpf(input.cpf);
    const normalizedEmail = normalizeOptionalEmail(input.email);
    return {
      personType,
      fullName: normalizedFullName,
      legalName: null,
      tradeName: null,
      cpf: normalizedCpf,
      cnpj: null,
      cnpjOrder: null,
      cnpjRoot: null,
      registrationNumber: null,
      registrationNumberCanonical: null,
      addressLine: null,
      district: null,
      city: null,
      state: null,
      postalCode: null,
      complement: null,
      phone: normalizeClientPhone(input.phone),
      email: normalizedEmail,
      ...flags,
    };
  }

  // PJ
  const normalizedLegalName = normalizeRequiredText(input.legalName, 'legalName', 200);
  const normalizedTradeName = normalizeOptionalText(input.tradeName, 'tradeName', 200);
  const normalizedCnpj = normalizeCnpj(input.cnpj);
  if (!normalizedCnpj) {
    throw new HttpError(422, 'cnpj is required for PJ', {
      code: 'PJ_REQUIRES_CNPJ',
      field: 'cnpj',
    });
  }
  const cnpjRoot = normalizedCnpj.slice(0, 8);
  const cnpjOrder = normalizedCnpj.slice(8, 12);

  let registrationNumber = null;
  let registrationNumberCanonical = null;
  if (
    hasOwn(input, 'registrationNumber') &&
    input.registrationNumber !== null &&
    input.registrationNumber !== ''
  ) {
    const numberText = normalizeOptionalText(input.registrationNumber, 'registrationNumber', 80);
    if (numberText) {
      const canonical = normalizeRegistrationCanonical(numberText);
      if (!canonical) {
        throw new HttpError(422, 'registrationNumber is invalid', {
          code: 'VALIDATION_ERROR',
          field: 'registrationNumber',
        });
      }
      registrationNumber = numberText;
      registrationNumberCanonical = canonical;
    }
  }

  return {
    personType,
    fullName: null,
    legalName: normalizedLegalName,
    tradeName: normalizedTradeName,
    cpf: null,
    cnpj: normalizedCnpj,
    cnpjOrder,
    cnpjRoot,
    registrationNumber,
    registrationNumberCanonical,
    addressLine: normalizeOptionalText(input.addressLine, 'addressLine', 200),
    district: normalizeOptionalText(input.district, 'district', 120),
    city: normalizeOptionalText(input.city, 'city', 120),
    state: normalizeOptionalState(input.state),
    postalCode: normalizeOptionalText(input.postalCode, 'postalCode', 16),
    complement: normalizeOptionalText(input.complement, 'complement', 120),
    phone: normalizeClientPhone(input.phone),
    email: normalizeOptionalEmail(input.email),
    ...flags,
  };
}

export function normalizeCreateClientInput(input) {
  assertProtectedClientFieldsAbsent(input);
  const personType = normalizeClientPersonType(input.personType);
  // Telefone e OPCIONAL na criacao (alinhado ao quick-create 14.7.N, ao
  // update — que aceita limpar — e ao schema, onde phone e nullable).
  // Preenchido, valida 10-11 digitos em normalizeClientPhone dentro de
  // buildClientWriteData. A exigencia historica daqui (2026-04-09) ficou
  // orfa quando o modal tornou o campo opcional e fazia o POST falhar 422
  // com o formulario visivelmente valido.
  const data = buildClientWriteData(personType, input);

  const fromInput = resolveCommercialUserIdsFromInput(input);
  const commercialUserIds = fromInput === undefined ? [] : fromInput;

  // L5: PJ NAO aceita units[] — todos os dados ja estao no Client direto.
  // PF aceita units[] opcional para fazendas.
  if (personType === CLIENT_PERSON_TYPES.PJ && hasOwn(input, 'units')) {
    throw new HttpError(422, 'PJ clients do not have units (post-L5)', {
      code: 'PJ_HAS_NO_UNITS',
      field: 'units',
    });
  }

  const units = personType === CLIENT_PERSON_TYPES.PF ? normalizeUnitListInput(input.units) : [];

  return { data, commercialUserIds, units };
}

function normalizeUnitListInput(value) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new HttpError(422, 'units must be an array', {
      code: 'VALIDATION_ERROR',
      field: 'units',
    });
  }

  if (value.length === 0) {
    return [];
  }

  return value.map((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      throw new HttpError(422, `units[${idx}] must be an object`, {
        code: 'VALIDATION_ERROR',
        field: `units[${idx}]`,
      });
    }
    assertProtectedUnitFieldsAbsent(entry);
    return buildUnitWriteData(entry, { requireName: true });
  });
}

// Fase 0: garante a invariante "PF sempre nasce com >=1 fazenda". Se o
// caller for PF e nao fornecer nenhuma unit (undefined ou []), injeta a
// fazenda placeholder com nome `DEFAULT_PF_UNIT_NAME`. Para PJ ou listas
// nao-vazias, devolve o input intocado. Idempotente.
export function ensureDefaultPfUnit(personType, units) {
  if (personType !== CLIENT_PERSON_TYPES.PF) {
    return units;
  }
  if (Array.isArray(units) && units.length > 0) {
    return units;
  }
  return [{ name: DEFAULT_PF_UNIT_NAME }];
}

export function normalizeUpdateClientInput(input, currentClient) {
  assertProtectedClientFieldsAbsent(input);

  // L5/L3: personType e imutavel pos-criacao.
  if (hasOwn(input, 'personType')) {
    const requested = normalizeClientPersonType(input.personType);
    if (requested !== currentClient.personType) {
      throw new HttpError(422, 'personType cannot be changed after creation', {
        code: 'CLIENT_PERSON_TYPE_LOCKED',
        field: 'personType',
      });
    }
  }

  const personType = currentClient.personType;
  const merged = {
    fullName: hasOwn(input, 'fullName') ? input.fullName : currentClient.fullName,
    legalName: hasOwn(input, 'legalName') ? input.legalName : currentClient.legalName,
    tradeName: hasOwn(input, 'tradeName') ? input.tradeName : currentClient.tradeName,
    cpf: hasOwn(input, 'cpf') ? input.cpf : currentClient.cpf,
    cnpj: hasOwn(input, 'cnpj') ? input.cnpj : currentClient.cnpj,
    registrationNumber: hasOwn(input, 'registrationNumber')
      ? input.registrationNumber
      : currentClient.registrationNumber,
    addressLine: hasOwn(input, 'addressLine') ? input.addressLine : currentClient.addressLine,
    district: hasOwn(input, 'district') ? input.district : currentClient.district,
    city: hasOwn(input, 'city') ? input.city : currentClient.city,
    state: hasOwn(input, 'state') ? input.state : currentClient.state,
    postalCode: hasOwn(input, 'postalCode') ? input.postalCode : currentClient.postalCode,
    complement: hasOwn(input, 'complement') ? input.complement : currentClient.complement,
    phone: hasOwn(input, 'phone') ? input.phone : currentClient.phone,
    email: hasOwn(input, 'email') ? input.email : currentClient.email,
    isBuyer: hasOwn(input, 'isBuyer') ? input.isBuyer : currentClient.isBuyer,
    isSeller: hasOwn(input, 'isSeller') ? input.isSeller : currentClient.isSeller,
    isWarehouse: hasOwn(input, 'isWarehouse') ? input.isWarehouse : currentClient.isWarehouse,
  };

  const data = buildClientWriteData(personType, merged);

  const commercialUserIdsInput = resolveCommercialUserIdsFromInput(input);

  return {
    reasonText: normalizeOptionalReasonText(input.reasonText),
    data,
    commercialUserIdsInput,
  };
}

// L5: write data para ClientUnit (fazenda PF). registrationType, cnpjOrder
// e isPrimary nao existem mais. car (CAR) e novo. name e obrigatorio em
// create (Q-13).
function buildUnitWriteData(input, { requireName = false } = {}) {
  const data = {};

  if (requireName || hasOwn(input, 'name')) {
    const normalizedName = normalizeOptionalText(input.name, 'name', 160);
    if (requireName && !normalizedName) {
      throw new HttpError(422, 'name is required', {
        code: 'VALIDATION_ERROR',
        field: 'name',
      });
    }
    data.name = normalizedName;
  }

  if (hasOwn(input, 'cnpj')) {
    data.cnpj = normalizeCnpj(input.cnpj);
  }

  if (hasOwn(input, 'legalName')) {
    data.legalName = normalizeOptionalText(input.legalName, 'legalName', 200);
  }

  if (hasOwn(input, 'tradeName')) {
    data.tradeName = normalizeOptionalText(input.tradeName, 'tradeName', 200);
  }

  if (hasOwn(input, 'phone')) {
    data.phone = normalizeClientPhone(input.phone);
  }

  if (hasOwn(input, 'addressLine')) {
    data.addressLine = normalizeOptionalText(input.addressLine, 'addressLine', 200);
  }

  if (hasOwn(input, 'district')) {
    data.district = normalizeOptionalText(input.district, 'district', 120);
  }

  if (hasOwn(input, 'city')) {
    data.city = normalizeOptionalText(input.city, 'city', 120);
  }

  if (hasOwn(input, 'state')) {
    data.state = normalizeOptionalState(input.state);
  }

  if (hasOwn(input, 'postalCode')) {
    data.postalCode = normalizeOptionalText(input.postalCode, 'postalCode', 16);
  }

  if (hasOwn(input, 'complement')) {
    data.complement = normalizeOptionalText(input.complement, 'complement', 120);
  }

  if (hasOwn(input, 'registrationNumber')) {
    const numberText = normalizeOptionalText(input.registrationNumber, 'registrationNumber', 80);
    if (numberText) {
      const canonical = normalizeRegistrationCanonical(numberText);
      if (!canonical) {
        throw new HttpError(422, 'registrationNumber is invalid', {
          code: 'VALIDATION_ERROR',
          field: 'registrationNumber',
        });
      }
      data.registrationNumber = numberText;
      data.registrationNumberCanonical = canonical;
    } else {
      data.registrationNumber = null;
      data.registrationNumberCanonical = null;
    }
  }

  if (hasOwn(input, 'car')) {
    data.car = normalizeOptionalText(input.car, 'car', 80);
  }

  return data;
}

export function normalizeCreateUnitInput(input) {
  assertProtectedUnitFieldsAbsent(input);
  const data = buildUnitWriteData(input, { requireName: true });
  return { data };
}

export function normalizeUpdateUnitInput(input) {
  assertProtectedUnitFieldsAbsent(input);
  const data = buildUnitWriteData(input);

  // name nao pode ser limpo (continua obrigatorio).
  if (hasOwn(input, 'name') && !data.name) {
    throw new HttpError(422, 'name cannot be empty', {
      code: 'VALIDATION_ERROR',
      field: 'name',
    });
  }

  return {
    reasonText: normalizeOptionalReasonText(input.reasonText),
    data,
  };
}

export function normalizeListClientsInput(input) {
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

  // Q-11: filtro de completude — 'incomplete' restringe a clientes com
  // pelo menos um recomendado faltando (regras Q-10c/Q-10d/Q-12/Q-13).
  let completeness = null;
  if (
    input.completeness !== undefined &&
    input.completeness !== null &&
    input.completeness !== ''
  ) {
    const v = String(input.completeness).trim().toLowerCase();
    if (v !== 'incomplete' && v !== 'complete') {
      throw new HttpError(422, 'completeness must be "incomplete" or "complete"', {
        code: 'VALIDATION_ERROR',
        field: 'completeness',
      });
    }
    completeness = v;
  }

  // 14.6.C: cursor alfabetico opcional (displayName ASC, id ASC). Se
  // ausente, retorna a primeira pagina. Se presente, busca itens
  // posteriores ao cursor em ordem alfabetica. Substitui o cursor
  // cronologico de 14.4.A.
  const cursorDisplayNameRaw =
    typeof input.cursorDisplayName === 'string' ? input.cursorDisplayName.trim() : null;
  const cursorIdRaw = typeof input.cursorId === 'string' ? input.cursorId.trim() : null;
  const cursor =
    cursorDisplayNameRaw !== null && cursorIdRaw
      ? { displayName: cursorDisplayNameRaw, id: cursorIdRaw }
      : null;

  return {
    page: readPageQuery(input.page, 1),
    limit: readLimitQuery(input.limit, {
      fallback: CLIENT_LIST_LIMIT_DEFAULT,
      max: CLIENT_LIST_LIMIT_MAX,
    }),
    cursor,
    search: normalizeOptionalSearch(input.search),
    status: input.status ? normalizeClientStatus(input.status) : null,
    personType: input.personType ? normalizeClientPersonType(input.personType) : null,
    isBuyer: normalizeOptionalBooleanQuery(input.isBuyer, 'isBuyer'),
    isSeller: normalizeOptionalBooleanQuery(input.isSeller, 'isSeller'),
    isWarehouse: normalizeOptionalBooleanQuery(input.isWarehouse, 'isWarehouse'),
    commercialUserIds: commercialUserIdsList,
    completeness,
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

// L5: PF -> client.cpf. PJ -> client.cnpj direto.
function buildClientDocument(client) {
  if (client.personType === CLIENT_PERSON_TYPES.PF) {
    return client.cpf ?? null;
  }
  return client.cnpj ?? null;
}

// Q-26: nome curto pra UX (listagem, lookup, dropdown). Em PJ usa
// tradeName quando existe, senao cai pra legalName. PF mantem fullName.
export function buildClientDisplayName(client) {
  if (client.personType === CLIENT_PERSON_TYPES.PF) {
    return client.fullName ?? null;
  }

  return client.tradeName ?? client.legalName ?? null;
}

// Q-26: nome legal completo. Usar em audit, contratos, fechamentos,
// relatorios oficiais. PF nao tem distincao (retorna fullName).
export function buildClientLegalName(client) {
  if (client.personType === CLIENT_PERSON_TYPES.PF) {
    return client.fullName ?? null;
  }

  return client.legalName ?? null;
}

export function toClientSummary(client, options = {}) {
  const activeUnitCount = options.activeUnitCount ?? 0;
  const unitCount = options.unitCount ?? 0;
  const commercialUsers = Array.isArray(client.commercialUsers)
    ? client.commercialUsers
        .map((entry) => entry.user)
        .filter(Boolean)
        .map((user) => ({ id: user.id, fullName: user.fullName }))
    : [];
  const commercialUser = commercialUsers[0] ?? null;
  const units = Array.isArray(client.units)
    ? client.units.map((unit) =>
        toClientUnitSummary({ ...unit, clientId: unit.clientId ?? client.id })
      )
    : [];

  // L5: cnpj e endereco vivem direto no Client (PJ). Para PF: cnpj=null,
  // endereco=null no Client (vai estar em ClientUnit).
  const isPj = client.personType === CLIENT_PERSON_TYPES.PJ;
  const primaryUnit = units[0] ?? null;

  return {
    id: client.id,
    code: client.code,
    personType: client.personType,
    displayName: buildClientDisplayName(client),
    fullName: client.fullName ?? null,
    legalName: client.legalName ?? null,
    tradeName: client.tradeName ?? null,
    cpf: client.cpf ?? null,
    cnpj: isPj ? (client.cnpj ?? null) : null,
    document: buildClientDocument(client),
    phone: client.phone ?? null,
    email: client.email ?? null,
    addressLine: isPj ? (client.addressLine ?? null) : null,
    district: isPj ? (client.district ?? null) : null,
    city: isPj ? (client.city ?? null) : null,
    state: isPj ? (client.state ?? null) : null,
    postalCode: isPj ? (client.postalCode ?? null) : null,
    complement: isPj ? (client.complement ?? null) : null,
    registrationNumber: isPj ? (client.registrationNumber ?? null) : null,
    isBuyer: client.isBuyer,
    isSeller: client.isSeller,
    isWarehouse: client.isWarehouse,
    status: client.status,
    commercialUser,
    commercialUsers,
    units,
    unitCount,
    activeUnitCount,
    primaryCity: options.primaryCity ?? (isPj ? client.city : primaryUnit?.city) ?? null,
    primaryState: options.primaryState ?? (isPj ? client.state : primaryUnit?.state) ?? null,
    createdAt: toIsoString(client.createdAt),
    updatedAt: toIsoString(client.updatedAt),
  };
}

export function toClientUnitSummary(unit) {
  return {
    id: unit.id,
    clientId: unit.clientId,
    name: unit.name,
    code: unit.code,
    cnpj: unit.cnpj ?? null,
    legalName: unit.legalName ?? null,
    tradeName: unit.tradeName ?? null,
    phone: unit.phone ?? null,
    addressLine: unit.addressLine ?? null,
    district: unit.district ?? null,
    city: unit.city ?? null,
    state: unit.state ?? null,
    postalCode: unit.postalCode ?? null,
    complement: unit.complement ?? null,
    registrationNumber: unit.registrationNumber ?? null,
    car: unit.car ?? null,
    status: unit.status,
    createdAt: toIsoString(unit.createdAt),
    updatedAt: toIsoString(unit.updatedAt),
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
    targetUnit: event.targetUnit
      ? {
          id: event.targetUnit.id,
          name: event.targetUnit.name,
          code: event.targetUnit.code,
          cnpj: event.targetUnit.cnpj ?? null,
          legalName: event.targetUnit.legalName ?? null,
          status: event.targetUnit.status,
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
    cnpjOrder: client.cnpjOrder ?? null,
    cnpjRoot: client.cnpjRoot ?? null,
    registrationNumber: client.registrationNumber ?? null,
    addressLine: client.addressLine ?? null,
    district: client.district ?? null,
    city: client.city ?? null,
    state: client.state ?? null,
    postalCode: client.postalCode ?? null,
    complement: client.complement ?? null,
    document: buildClientDocument(client),
    phone: client.phone ?? null,
    email: client.email ?? null,
    isBuyer: client.isBuyer,
    isSeller: client.isSeller,
    isWarehouse: client.isWarehouse,
    status: client.status,
    commercialUserIds,
  };
}

export function buildUnitAuditState(unit) {
  return {
    name: unit.name,
    code: unit.code,
    cnpj: unit.cnpj ?? null,
    legalName: unit.legalName ?? null,
    tradeName: unit.tradeName ?? null,
    phone: unit.phone ?? null,
    addressLine: unit.addressLine ?? null,
    district: unit.district ?? null,
    city: unit.city ?? null,
    state: unit.state ?? null,
    postalCode: unit.postalCode ?? null,
    complement: unit.complement ?? null,
    registrationNumber: unit.registrationNumber ?? null,
    car: unit.car ?? null,
    status: unit.status,
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

// 14.4.A: pagina cursor-based para listClients (scroll infinito na UI).
// nextCursor null = ultima pagina.
// 14.4.C: incompleteTotal — count separado de clientes incompletos
// (respeita filtros server-side) para a UI exibir contagem total real
// sem depender dos items carregados pelo scroll.
export function buildClientListCursorPage(total, limit, nextCursor, incompleteTotal = 0) {
  return {
    limit,
    total,
    incompleteTotal,
    nextCursor,
  };
}

export {
  assertAuthenticatedActor,
  buildAuditContext,
  hasOwn,
  normalizeClientPersonType,
  normalizeClientStatus,
  normalizeReasonText,
  normalizeBooleanLike,
  normalizeOptionalEmail,
  readPageQuery,
  readLimitQuery,
};
