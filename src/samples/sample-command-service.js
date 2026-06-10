import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { assertRoleAllowed, USER_ROLES } from '../auth/roles.js';
import { HttpError } from '../contracts/errors.js';
import { deriveBlendHarvest, deriveBlendOwner } from './blend-harvest.js';
import { buildEventEnvelope, normalizeActorContext } from './sample-event-factory.js';

const USER_ACTION_ROLES = [
  USER_ROLES.ADMIN,
  USER_ROLES.CLASSIFIER,
  USER_ROLES.REGISTRATION,
  USER_ROLES.COMMERCIAL,
  // PROSPECTOR espelha integralmente o COMMERCIAL por enquanto.
  USER_ROLES.PROSPECTOR,
  // CADASTRO espelha o REGISTRATION (operacao geral).
  USER_ROLES.CADASTRO,
];
const AUTO_LOT_NUMBER_MAX_RETRIES = 5;
const RECEIVED_CHANNELS = new Set(['in_person', 'courier', 'driver', 'other', 'internal']);
const PHOTO_KINDS = {
  CLASSIFICATION: 'CLASSIFICATION_PHOTO',
};
const PHOTO_KIND_ALLOWED_STATUSES = {
  [PHOTO_KINDS.CLASSIFICATION]: ['REGISTRATION_CONFIRMED', 'CLASSIFIED'],
};

// Q.print: timeout pra PrintJob travado (lazy, sem worker/cron). Aplicado
// em requestQrPrint (antes de criar novo) e em getSampleDetail (path de
// leitura). PrintJobs PENDING > 1min sao marcados como FAILED.
const PRINT_JOB_PENDING_TIMEOUT_MS = 60 * 1000;
const UPDATE_REASON_CODES = new Set(['DATA_FIX', 'TYPO', 'MISSING_INFO', 'OTHER']);
const REPORT_EXPORT_TYPES = new Set(['COMPLETO', 'COMPRADOR_PARCIAL']);
const COMMERCIAL_STATUS_VALUES = new Set(['OPEN', 'PARTIALLY_SOLD', 'SOLD', 'LOST']);
// Venda e perda podem ser registradas a partir do momento em que a amostra tem sacas
// declaradas (REGISTRATION_CONFIRMED). Classificacao nao e pre-requisito comercial:
// o operador pode vender/registrar perda antes mesmo de classificar. INVALIDATED
// continua bloqueado via check separado.
const COMMERCIAL_MUTABLE_OPERATIONAL_STATUSES = new Set(['REGISTRATION_CONFIRMED', 'CLASSIFIED']);
// Envio fisico de amostra pode ser registrado assim que a amostra foi registrada
// (REGISTRATION_CONFIRMED). Edicao e cancelamento do envio tambem usam esse range.
const PHYSICAL_SEND_ALLOWED_STATUSES = ['REGISTRATION_CONFIRMED', 'CLASSIFIED'];
const MOVEMENT_TYPES = {
  SALE: 'SALE',
  LOSS: 'LOSS',
};
const MOVEMENT_STATUSES = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
};
const MAX_UPDATE_REASON_WORDS = 10;
const DEFAULT_REGISTRATION_UPDATE_REASON_CODE = 'OTHER';
const DEFAULT_REGISTRATION_UPDATE_REASON_TEXT = 'Edicao manual no detalhe da amostra';
// Liga: reasonText sintetico dos eventos REGISTRATION_UPDATED emitidos pela
// propagacao reativa (recalculo de safra e/ou proprietario da liga por edicao de
// origem). <=10 palavras pra casar com o regex do schema registration-updated.
const BLEND_PROPAGATION_REASON_TEXT = 'Liga recalculada por edicao de origem';
const BUSINESS_TIMEZONE = 'America/Sao_Paulo';
const REGISTRATION_UPDATE_ALLOWED_STATUSES = ['REGISTRATION_CONFIRMED', 'CLASSIFIED'];
const CLASSIFICATION_UPDATE_ALLOWED_STATUSES = ['REGISTRATION_CONFIRMED', 'CLASSIFIED'];
const REGISTRATION_EDITABLE_FIELDS = ['owner', 'sacks', 'harvest', 'originLot', 'location'];
// Q.cls.2.7: ficha unificada — campos do classificationData no payload
// do evento CLASSIFICATION_COMPLETED. Mais detalhes no schema
// classification-completed.payload.schema.json. Sem safra (vive no
// sample.declaredHarvest, atualizado via applySampleUpdates).
const CLASSIFICATION_DATA_EDITABLE_FIELDS = [
  'padrao',
  'aspecto',
  'certif',
  'catacao',
  'observacoes',
  'bebida',
];
// Peneiras (sub-obj `peneiras`): 10 chaves fixas, sem p19 (nao existe na
// ficha unificada).
const CLASSIFICATION_PENEIRA_KEYS = [
  'p18',
  'p17',
  'p16',
  'p15',
  'p14',
  'p13',
  'p12',
  'p11',
  'p10',
  'mk',
];
// Defeitos (sub-obj `defeitos`): 6 chaves fixas, todos string|null.
const CLASSIFICATION_DEFEITO_KEYS = ['imp', 'pva', 'broca', 'gpi', 'ap', 'defeito'];
const CLASSIFICATION_TECHNICAL_EDITABLE_FIELDS = [
  'type',
  'screen',
  'defectsCount',
  'density',
  'notes',
];
const MOVEMENT_UPDATE_EDITABLE_FIELDS = new Set([
  'movementType',
  'buyerClientId',
  'buyerUnitId',
  'quantitySacks',
  'movementDate',
  'notes',
  'lossReasonText',
]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildBusinessDateStamp(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeRequiredText(value, fieldName) {
  if (typeof value !== 'string') {
    throw new HttpError(422, `${fieldName} must be a string`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new HttpError(422, `${fieldName} is required`);
  }

  return normalized;
}

function normalizeOptionalText(value, fieldName, maxLength = null) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new HttpError(422, `${fieldName} must be a string`);
  }

  const normalized = value.trim();
  if (maxLength !== null && normalized.length > maxLength) {
    throw new HttpError(422, `${fieldName} must have at most ${maxLength} characters`);
  }

  return normalized || null;
}

function normalizeRequiredInteger(value, fieldName, minValue = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < minValue) {
    throw new HttpError(422, `${fieldName} must be an integer >= ${minValue}`);
  }
  return parsed;
}

function normalizeNullableUuid(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new HttpError(422, `${fieldName} must be a UUID string`);
  }

  const normalized = value.trim();
  if (!UUID_REGEX.test(normalized)) {
    throw new HttpError(422, `${fieldName} must be a valid UUID`);
  }

  return normalized.toLowerCase();
}

function normalizeMovementType(value, fieldName = 'movementType') {
  const normalized = normalizeRequiredText(value, fieldName).toUpperCase();
  if (!Object.values(MOVEMENT_TYPES).includes(normalized)) {
    throw new HttpError(422, `${fieldName} is invalid`);
  }

  return normalized;
}

function normalizeMovementDate(value, fieldName = 'movementDate') {
  const normalized = normalizeRequiredText(value, fieldName);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new HttpError(422, `${fieldName} must follow YYYY-MM-DD format`);
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new HttpError(422, `${fieldName} must be a valid calendar date`);
  }

  return normalized;
}

function normalizeMovementNotes(value, fieldName = 'notes', { required = false } = {}) {
  if (required) {
    return normalizeRequiredText(value, fieldName, 500);
  }

  return normalizeOptionalText(value, fieldName, 500);
}

function normalizeLossReasonText(value, fieldName = 'lossReasonText') {
  return normalizeOptionalText(value, fieldName, 500);
}

function normalizeMovementQuantity(value, fieldName = 'quantitySacks') {
  return normalizeRequiredInteger(value, fieldName, 1);
}

function readCurrentCommercialSummary(sample) {
  return {
    declaredSacks: typeof sample?.declared?.sacks === 'number' ? sample.declared.sacks : null,
    soldSacks: typeof sample?.soldSacks === 'number' ? sample.soldSacks : 0,
    lostSacks: typeof sample?.lostSacks === 'number' ? sample.lostSacks : 0,
  };
}

function resolveCommercialStatusFromTotals({ declaredSacks, soldSacks, lostSacks }) {
  if (declaredSacks === null || declaredSacks <= 0) {
    return 'OPEN';
  }

  const available = declaredSacks - soldSacks - lostSacks;

  if (available <= 0) {
    return soldSacks > 0 ? 'SOLD' : 'LOST';
  }

  if (soldSacks > 0) {
    return 'PARTIALLY_SOLD';
  }

  return 'OPEN';
}

function buildCommercialProjection({ declaredSacks, soldSacks, lostSacks }) {
  if (declaredSacks === null) {
    return {
      soldSacks,
      lostSacks,
      availableSacks: 0,
      commercialStatus: 'OPEN',
    };
  }

  const availableSacks = declaredSacks - soldSacks - lostSacks;
  if (availableSacks < 0) {
    throw new HttpError(409, 'Commercial movements exceed declared sacks for this sample');
  }

  return {
    soldSacks,
    lostSacks,
    availableSacks,
    commercialStatus: resolveCommercialStatusFromTotals({
      declaredSacks,
      soldSacks,
      lostSacks,
    }),
  };
}

function buildBuyerSnapshot(binding) {
  if (!binding) {
    return {
      buyerClientId: null,
      buyerUnitId: null,
      buyerClientSnapshot: null,
      buyerUnitSnapshot: null,
    };
  }

  return {
    buyerClientId: binding.buyerClientId,
    buyerUnitId: binding.buyerUnitId,
    buyerClientSnapshot: binding.buyerClient,
    buyerUnitSnapshot: binding.buyerUnit,
  };
}

function formatMovementSnapshot(movement) {
  return {
    movementType: movement.movementType,
    buyerClientId: movement.buyerClientId ?? null,
    buyerUnitId: movement.buyerUnitId ?? null,
    quantitySacks: movement.quantitySacks,
    movementDate: movement.movementDate,
    notes: movement.notes ?? null,
    lossReasonText: movement.lossReasonText ?? null,
    buyerClientSnapshot: movement.buyerClientSnapshot ?? null,
    buyerUnitSnapshot: movement.buyerUnitSnapshot ?? null,
    status: movement.status,
  };
}

function normalizeCommercialStatus(value, fieldName = 'toCommercialStatus') {
  const normalized = normalizeRequiredText(value, fieldName).toUpperCase();
  if (!COMMERCIAL_STATUS_VALUES.has(normalized)) {
    throw new HttpError(422, `${fieldName} is invalid`);
  }

  return normalized;
}

function normalizeRequiredStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new HttpError(422, `${fieldName} must be an array`);
  }

  const deduped = [];
  const seen = new Set();

  for (const item of value) {
    if (typeof item !== 'string') {
      throw new HttpError(422, `${fieldName} items must be strings`);
    }

    const normalized = item.trim();
    if (!normalized) {
      throw new HttpError(422, `${fieldName} items cannot be empty`);
    }

    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduped.push(normalized);
    }
  }

  return deduped;
}

function normalizeReportExportType(value) {
  const normalized = normalizeRequiredText(value ?? 'COMPLETO', 'exportType').toUpperCase();
  if (!REPORT_EXPORT_TYPES.has(normalized)) {
    throw new HttpError(422, 'exportType is invalid');
  }

  return normalized;
}

function countWords(value) {
  if (typeof value !== 'string') {
    return 0;
  }

  return value
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0).length;
}

function normalizeUpdateReasonCode(value) {
  const normalized = normalizeRequiredText(value, 'reasonCode').toUpperCase();
  if (!UPDATE_REASON_CODES.has(normalized)) {
    throw new HttpError(422, 'reasonCode is invalid');
  }

  return normalized;
}

function normalizeUpdateReasonText(value) {
  const normalized = normalizeRequiredText(value, 'reasonText');
  const words = countWords(normalized);
  if (words === 0) {
    throw new HttpError(422, 'reasonText is required');
  }
  if (words > MAX_UPDATE_REASON_WORDS) {
    throw new HttpError(422, `reasonText must have at most ${MAX_UPDATE_REASON_WORDS} words`);
  }

  return normalized;
}

function normalizeNullableText(value, fieldName, maxLength = 500) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new HttpError(422, `${fieldName} must be a string`);
  }

  const normalized = value.trim();
  if (maxLength !== null && normalized.length > maxLength) {
    throw new HttpError(422, `${fieldName} must have at most ${maxLength} characters`);
  }

  return normalized || null;
}

function normalizeNullableNumber(value, fieldName, options = {}) {
  const { integer = false, min = null, max = null } = options;

  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  const parsed =
    typeof value === 'number'
      ? value
      : Number(typeof value === 'string' ? value.replace(',', '.') : value);

  if (!Number.isFinite(parsed)) {
    throw new HttpError(422, `${fieldName} must be a valid number`);
  }

  if (integer && !Number.isInteger(parsed)) {
    throw new HttpError(422, `${fieldName} must be an integer`);
  }

  if (min !== null && parsed < min) {
    throw new HttpError(422, `${fieldName} must be >= ${min}`);
  }

  if (max !== null && parsed > max) {
    throw new HttpError(422, `${fieldName} must be <= ${max}`);
  }

  return parsed;
}

function assertNoUnknownKeys(objectValue, allowedKeys, fieldName) {
  if (!isPlainObject(objectValue)) {
    throw new HttpError(422, `${fieldName} must be an object`);
  }

  for (const key of Object.keys(objectValue)) {
    if (!allowedKeys.has(key)) {
      throw new HttpError(422, `${fieldName}.${key} is not editable`);
    }
  }
}

function valuesEqual(left, right) {
  if (left === right) {
    return true;
  }

  const isObjectLike = (value) => value !== null && typeof value === 'object';
  if (isObjectLike(left) || isObjectLike(right)) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  return false;
}

function normalizeRegistrationFieldValue(fieldName, value) {
  if (fieldName === 'owner' || fieldName === 'harvest') {
    return normalizeRequiredText(value, fieldName);
  }

  if (fieldName === 'originLot') {
    return normalizeOptionalText(value, fieldName, 100);
  }

  if (fieldName === 'sacks') {
    return normalizeSacks(value);
  }

  if (fieldName === 'location') {
    return normalizeOptionalText(value, 'location', 30);
  }

  throw new HttpError(422, `registration field ${fieldName} is not editable`);
}

function parseRegistrationUpdatePatch(after) {
  const allowedTopLevel = new Set([
    ...REGISTRATION_EDITABLE_FIELDS,
    'declared',
    'ownerClientId',
    'ownerUnitId',
  ]);
  assertNoUnknownKeys(after, allowedTopLevel, 'after');

  const declared = hasOwn(after, 'declared') ? after.declared : undefined;
  if (declared !== undefined) {
    assertNoUnknownKeys(declared, new Set(REGISTRATION_EDITABLE_FIELDS), 'after.declared');
  }

  const patch = {
    declared: {},
  };
  for (const field of REGISTRATION_EDITABLE_FIELDS) {
    const hasTopLevel = hasOwn(after, field);
    const hasDeclared = isPlainObject(declared) && hasOwn(declared, field);

    if (!hasTopLevel && !hasDeclared) {
      continue;
    }

    const selected = hasDeclared ? declared[field] : after[field];
    patch.declared[field] = normalizeRegistrationFieldValue(field, selected);
  }

  if (hasOwn(after, 'ownerClientId')) {
    patch.hasOwnerClientId = true;
    patch.ownerClientId = normalizeNullableUuid(after.ownerClientId, 'after.ownerClientId');
  }

  if (hasOwn(after, 'ownerUnitId')) {
    patch.hasOwnerUnitId = true;
    patch.ownerUnitId = normalizeNullableUuid(after.ownerUnitId, 'after.ownerUnitId');
  }

  if (
    Object.keys(patch.declared).length === 0 &&
    patch.hasOwnerClientId !== true &&
    patch.hasOwnerUnitId !== true
  ) {
    throw new HttpError(422, 'after must include at least one editable registration field');
  }

  return patch;
}

/**
 * Normaliza o payload opcional `applySampleUpdates` usado por
 * confirmClassificationFromCamera. Retorna um objeto com as atualizacoes
 * pendentes (apenas campos nao-nulos) ou null quando nada precisa ser
 * aplicado. Valores `null` sao aceitos e interpretados como "nao aplicar
 * este campo" — o frontend usa null para explicitamente sinalizar que o
 * operador escolheu manter o valor cadastrado.
 */
function parseApplySampleUpdatesPatch(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isPlainObject(value)) {
    throw new HttpError(422, 'applySampleUpdates must be an object');
  }

  const allowedKeys = new Set(['declaredSacks', 'declaredHarvest']);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new HttpError(422, `applySampleUpdates.${key} is not a supported field`);
    }
  }

  const patch = {};

  if (hasOwn(value, 'declaredSacks') && value.declaredSacks !== null) {
    const parsed =
      typeof value.declaredSacks === 'number' ? value.declaredSacks : Number(value.declaredSacks);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new HttpError(422, 'applySampleUpdates.declaredSacks must be an integer >= 1');
    }
    patch.declaredSacks = parsed;
  }

  if (hasOwn(value, 'declaredHarvest') && value.declaredHarvest !== null) {
    if (typeof value.declaredHarvest !== 'string') {
      throw new HttpError(422, 'applySampleUpdates.declaredHarvest must be a string');
    }
    const normalized = value.declaredHarvest.trim();
    if (!normalized) {
      throw new HttpError(422, 'applySampleUpdates.declaredHarvest must be a non-empty string');
    }
    patch.declaredHarvest = normalized;
  }

  if (Object.keys(patch).length === 0) {
    return null;
  }

  return patch;
}

// Q.cls.2.7: parseia o sub-obj `peneiras` da ficha unificada. 10 chaves
// fixas (p18..p10 + mk), todas number|null entre 0-100. Retorna undefined
// se valor ausente; null pra zerar; ou patch parcial.
function parseClassificationPeneirasPatch(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  assertNoUnknownKeys(
    value,
    new Set(CLASSIFICATION_PENEIRA_KEYS),
    'after.classificationData.peneiras'
  );
  const patch = {};
  for (const key of CLASSIFICATION_PENEIRA_KEYS) {
    if (!hasOwn(value, key)) continue;
    patch[key] = normalizeNullableNumber(value[key], `after.classificationData.peneiras.${key}`);
  }
  return Object.keys(patch).length === 0 ? undefined : patch;
}

// Q.cls.2.7: parseia o array `fundos` (top-level dentro de
// classificationData). Sempre 2 elementos com {peneira:string|null,
// percentual:number|null}. Retorna undefined se ausente, null pra zerar,
// ou array de 2 normalizado.
function parseClassificationFundosPatch(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value)) {
    throw new HttpError(422, 'after.classificationData.fundos must be an array');
  }
  if (value.length !== 2) {
    throw new HttpError(422, 'after.classificationData.fundos must have exactly 2 items');
  }
  return value.map((item, index) => {
    if (!isPlainObject(item)) {
      throw new HttpError(422, `after.classificationData.fundos[${index}] must be an object`);
    }
    assertNoUnknownKeys(
      item,
      new Set(['peneira', 'percentual']),
      `after.classificationData.fundos[${index}]`
    );
    const peneira =
      item.peneira === null || item.peneira === undefined
        ? null
        : normalizeNullableText(item.peneira, `after.classificationData.fundos[${index}].peneira`);
    const percentual =
      item.percentual === null || item.percentual === undefined
        ? null
        : normalizeNullableNumber(
            item.percentual,
            `after.classificationData.fundos[${index}].percentual`
          );
    return { peneira, percentual };
  });
}

// Q.cls.2.7: parseia o sub-obj `defeitos`. 6 chaves fixas string|null
// (texto livre — operador escreve numero ou texto, ex: "12", "ALTO", "0,5").
function parseClassificationDefeitosPatch(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  assertNoUnknownKeys(
    value,
    new Set(CLASSIFICATION_DEFEITO_KEYS),
    'after.classificationData.defeitos'
  );
  const patch = {};
  for (const key of CLASSIFICATION_DEFEITO_KEYS) {
    if (!hasOwn(value, key)) continue;
    const raw = value[key];
    if (raw === null || raw === undefined) {
      patch[key] = null;
    } else if (typeof raw === 'string') {
      patch[key] = raw.trim() || null;
    } else {
      patch[key] = String(raw);
    }
  }
  return Object.keys(patch).length === 0 ? undefined : patch;
}

function normalizeClassificationDataFieldValue(fieldName, value) {
  // Todos os 6 flat fields do classificationData (padrao, aspecto, certif,
  // catacao, observacoes, bebida) sao texto livre (string|null).
  return normalizeNullableText(value, `after.classificationData.${fieldName}`);
}

function normalizeClassificationTechnicalFieldValue(fieldName, value) {
  if (fieldName === 'defectsCount') {
    return normalizeNullableNumber(value, 'after.technical.defectsCount', {
      integer: true,
      min: 0,
    });
  }

  if (fieldName === 'density') {
    return normalizeNullableNumber(value, `after.technical.${fieldName}`);
  }

  return normalizeNullableText(value, `after.technical.${fieldName}`);
}

function parseClassificationUpdatePatch(after) {
  const forbiddenTopLevel = new Set([
    'sampleId',
    'id',
    'internalLotNumber',
    'classificationVersion',
    'classifierUserId',
    'classificadorUserId',
    'versaoClassificacao',
  ]);

  // Q.cls.2.7: top-level aceita os 6 flat fields + grupos novos (peneiras,
  // fundos, defeitos) + technical/consumptionGrams/classifiers + envoltorio
  // classificationData. Sem peneirasPercentuais (substituido por peneiras
  // + fundos).
  const allowedTopLevel = new Set([
    ...CLASSIFICATION_DATA_EDITABLE_FIELDS,
    ...CLASSIFICATION_TECHNICAL_EDITABLE_FIELDS,
    'classificationData',
    'technical',
    'consumptionGrams',
    'peneiras',
    'fundos',
    'defeitos',
    'classifiers',
  ]);
  assertNoUnknownKeys(after, allowedTopLevel, 'after');

  for (const key of forbiddenTopLevel) {
    if (hasOwn(after, key)) {
      throw new HttpError(422, `after.${key} is not editable`);
    }
  }

  const classificationData = hasOwn(after, 'classificationData')
    ? after.classificationData
    : undefined;
  if (classificationData !== undefined) {
    assertNoUnknownKeys(
      classificationData,
      new Set([...CLASSIFICATION_DATA_EDITABLE_FIELDS, 'peneiras', 'fundos', 'defeitos']),
      'after.classificationData'
    );

    if (
      hasOwn(classificationData, 'classificadorUserId') ||
      hasOwn(classificationData, 'versaoClassificacao')
    ) {
      throw new HttpError(422, 'classificationData id/version fields are not editable');
    }
  }

  const technical = hasOwn(after, 'technical') ? after.technical : undefined;
  if (technical !== undefined) {
    assertNoUnknownKeys(
      technical,
      new Set(CLASSIFICATION_TECHNICAL_EDITABLE_FIELDS),
      'after.technical'
    );
  }

  const classificationDataPatch = {};
  for (const field of CLASSIFICATION_DATA_EDITABLE_FIELDS) {
    const hasTopLevel = hasOwn(after, field);
    const hasNested = isPlainObject(classificationData) && hasOwn(classificationData, field);

    if (!hasTopLevel && !hasNested) {
      continue;
    }

    const selected = hasNested ? classificationData[field] : after[field];
    classificationDataPatch[field] = normalizeClassificationDataFieldValue(field, selected);
  }

  // Aceita peneiras top-level (legacy/conveniencia) OU dentro de
  // classificationData. Idem fundos e defeitos.
  const peneirasPatch = hasOwn(after, 'peneiras')
    ? parseClassificationPeneirasPatch(after.peneiras)
    : isPlainObject(classificationData) && hasOwn(classificationData, 'peneiras')
      ? parseClassificationPeneirasPatch(classificationData.peneiras)
      : undefined;
  if (peneirasPatch !== undefined) {
    classificationDataPatch.peneiras = peneirasPatch;
  }

  const fundosPatch = hasOwn(after, 'fundos')
    ? parseClassificationFundosPatch(after.fundos)
    : isPlainObject(classificationData) && hasOwn(classificationData, 'fundos')
      ? parseClassificationFundosPatch(classificationData.fundos)
      : undefined;
  if (fundosPatch !== undefined) {
    classificationDataPatch.fundos = fundosPatch;
  }

  const defeitosPatch = hasOwn(after, 'defeitos')
    ? parseClassificationDefeitosPatch(after.defeitos)
    : isPlainObject(classificationData) && hasOwn(classificationData, 'defeitos')
      ? parseClassificationDefeitosPatch(classificationData.defeitos)
      : undefined;
  if (defeitosPatch !== undefined) {
    classificationDataPatch.defeitos = defeitosPatch;
  }

  const technicalPatch = {};
  for (const field of CLASSIFICATION_TECHNICAL_EDITABLE_FIELDS) {
    const hasTopLevel = hasOwn(after, field);
    const hasNested = isPlainObject(technical) && hasOwn(technical, field);

    if (!hasTopLevel && !hasNested) {
      continue;
    }

    const selected = hasNested ? technical[field] : after[field];
    technicalPatch[field] = normalizeClassificationTechnicalFieldValue(field, selected);
  }

  const consumptionGrams = hasOwn(after, 'consumptionGrams')
    ? normalizeNullableNumber(after.consumptionGrams, 'after.consumptionGrams')
    : undefined;

  // classifiers e extraido como sibling do classificationData porque vive
  // top-level no payload do evento, nao dentro de classificationData. O shape
  // ja foi validado antes por normalizeClassifiers (async) no caller.
  const classifiers = hasOwn(after, 'classifiers') ? after.classifiers : undefined;

  if (
    Object.keys(classificationDataPatch).length === 0 &&
    Object.keys(technicalPatch).length === 0 &&
    consumptionGrams === undefined &&
    classifiers === undefined
  ) {
    throw new HttpError(422, 'after must include at least one editable classification field');
  }

  return {
    classificationData: classificationDataPatch,
    technical: technicalPatch,
    consumptionGrams,
    classifiers,
  };
}

function parseMovementUpdatePatch(after) {
  assertNoUnknownKeys(after, MOVEMENT_UPDATE_EDITABLE_FIELDS, 'after');

  const patch = {};

  if (hasOwn(after, 'movementType')) {
    patch.movementType = normalizeMovementType(after.movementType);
  }
  if (hasOwn(after, 'buyerClientId')) {
    patch.buyerClientId = normalizeNullableUuid(after.buyerClientId, 'after.buyerClientId');
  }
  if (hasOwn(after, 'buyerUnitId')) {
    patch.buyerUnitId = normalizeNullableUuid(after.buyerUnitId, 'after.buyerUnitId');
  }
  if (hasOwn(after, 'quantitySacks')) {
    patch.quantitySacks = normalizeMovementQuantity(after.quantitySacks, 'after.quantitySacks');
  }
  if (hasOwn(after, 'movementDate')) {
    patch.movementDate = normalizeMovementDate(after.movementDate, 'after.movementDate');
  }
  if (hasOwn(after, 'notes')) {
    patch.notes = normalizeMovementNotes(after.notes, 'after.notes');
  }
  if (hasOwn(after, 'lossReasonText')) {
    patch.lossReasonText = normalizeMovementNotes(after.lossReasonText, 'after.lossReasonText');
  }

  if (Object.keys(patch).length === 0) {
    throw new HttpError(422, 'after must include at least one editable movement field');
  }

  return patch;
}

function buildRegistrationUpdatePayload(sample, parsedPatch) {
  const currentDeclared = isPlainObject(sample.declared) ? sample.declared : {};
  const beforeDeclared = {};
  const afterDeclared = {};
  const hasStructuredPatch =
    parsedPatch.hasOwnerClientId === true || parsedPatch.hasOwnerUnitId === true;
  const currentOwnerClientId = sample.ownerClientId ?? null;
  const nextOwnerClientId = parsedPatch.resolvedOwnerBinding?.ownerClientId ?? null;
  const nextOwnerDisplayName = parsedPatch.resolvedOwnerBinding?.displayName ?? null;
  const before = {};
  const after = {};

  for (const field of REGISTRATION_EDITABLE_FIELDS) {
    if (!hasOwn(parsedPatch.declared, field)) {
      continue;
    }

    if (field === 'owner' && currentOwnerClientId) {
      continue;
    }

    const currentValue = hasOwn(currentDeclared, field) ? currentDeclared[field] : null;
    const nextValue = parsedPatch.declared[field];
    if (valuesEqual(currentValue, nextValue)) {
      continue;
    }

    beforeDeclared[field] = currentValue;
    afterDeclared[field] = nextValue;
  }

  if (hasStructuredPatch) {
    if (!valuesEqual(currentOwnerClientId, nextOwnerClientId)) {
      before.ownerClientId = currentOwnerClientId;
      after.ownerClientId = nextOwnerClientId;
    }

    // ownerUnitId nao e mais emitido: o lote nao vincula fazenda.

    const currentOwnerValue = hasOwn(currentDeclared, 'owner') ? currentDeclared.owner : null;
    if (!valuesEqual(currentOwnerValue, nextOwnerDisplayName)) {
      beforeDeclared.owner = currentOwnerValue;
      afterDeclared.owner = nextOwnerDisplayName;
    }
  }

  if (Object.keys(afterDeclared).length > 0) {
    before.declared = beforeDeclared;
    after.declared = afterDeclared;
  }

  if (Object.keys(after).length === 0) {
    return null;
  }

  return {
    before,
    after,
  };
}

async function resolveStructuredOwnerForWrite({
  sample,
  inputOwnerClientId,
  inputOwnerUnitId,
  hasOwnerClientId = false,
  hasOwnerUnitId = false,
  clientService,
  mode,
}) {
  const currentOwnerClientId = sample?.ownerClientId ?? null;
  const currentOwnerUnitId = sample?.ownerUnitId ?? null;

  if (!clientService) {
    if (mode === 'create' || mode === 'confirm') {
      throw new Error('clientService is required for create/confirm owner binding support');
    }

    if (
      (inputOwnerClientId !== undefined && inputOwnerClientId !== null) ||
      (inputOwnerUnitId !== undefined && inputOwnerUnitId !== null)
    ) {
      throw new Error('clientService is required for ownerClientId/ownerUnitId support');
    }

    return null;
  }

  if (mode === 'create' || mode === 'confirm') {
    if (inputOwnerClientId === undefined || inputOwnerClientId === null) {
      if (inputOwnerUnitId !== undefined && inputOwnerUnitId !== null) {
        throw new HttpError(422, 'ownerUnitId requires ownerClientId');
      }

      throw new HttpError(422, 'ownerClientId is required');
    }

    return clientService.resolveOwnerBinding({
      ownerClientId: inputOwnerClientId,
      ownerUnitId: inputOwnerUnitId ?? null,
    });
  }

  let nextOwnerClientId = currentOwnerClientId;
  let nextOwnerUnitId = currentOwnerUnitId;
  let touched = false;

  if (hasOwnerClientId) {
    touched = true;
    if (inputOwnerClientId === null) {
      if (currentOwnerClientId !== null) {
        throw new HttpError(422, 'ownerClientId cannot be cleared once a sample is linked');
      }

      nextOwnerClientId = null;
      nextOwnerUnitId = null;
    } else {
      const ownerChanged = inputOwnerClientId !== currentOwnerClientId;
      nextOwnerClientId = inputOwnerClientId;

      if (ownerChanged) {
        nextOwnerUnitId = hasOwnerUnitId ? (inputOwnerUnitId ?? null) : null;
      } else if (hasOwnerUnitId) {
        nextOwnerUnitId = inputOwnerUnitId ?? null;
      }
    }
  } else if (hasOwnerUnitId) {
    touched = true;
    if (!currentOwnerClientId) {
      throw new HttpError(422, 'ownerUnitId requires ownerClientId');
    }

    nextOwnerClientId = currentOwnerClientId;
    nextOwnerUnitId = inputOwnerUnitId ?? null;
  }

  if (!touched) {
    return null;
  }

  if (!nextOwnerClientId) {
    return null;
  }

  return clientService.resolveOwnerBinding({
    ownerClientId: nextOwnerClientId,
    ownerUnitId: nextOwnerUnitId,
  });
}

async function resolveBuyerBindingForMovement({ clientService, buyerClientId }) {
  if (!clientService) {
    throw new Error('clientService is required for sale movements');
  }

  // Unidade do comprador descontinuada: resolve apenas o cliente.
  return clientService.resolveBuyerBinding({ buyerClientId });
}

function buildClassificationUpdatePayload(sample, parsedPatch) {
  const currentData = isPlainObject(sample.latestClassification?.data)
    ? sample.latestClassification.data
    : {};
  const currentTechnical = isPlainObject(sample.latestClassification?.technical)
    ? sample.latestClassification.technical
    : {};
  const before = {};
  const after = {};

  if (Object.keys(parsedPatch.classificationData).length > 0) {
    const beforeClassificationData = {};
    const afterClassificationData = {};

    for (const field of CLASSIFICATION_DATA_EDITABLE_FIELDS) {
      if (!hasOwn(parsedPatch.classificationData, field)) {
        continue;
      }

      const currentValue = hasOwn(currentData, field) ? currentData[field] : null;
      const nextValue = parsedPatch.classificationData[field];
      if (valuesEqual(currentValue, nextValue)) {
        continue;
      }

      beforeClassificationData[field] = currentValue;
      afterClassificationData[field] = nextValue;
    }

    // Q.cls.2.7: peneiras (sub-obj), fundos (array de 2), defeitos (sub-obj)
    // — diff campo a campo dentro do grupo, ou null pra zerar grupo inteiro.
    if (hasOwn(parsedPatch.classificationData, 'peneiras')) {
      const next = parsedPatch.classificationData.peneiras;
      const current = isPlainObject(currentData.peneiras) ? currentData.peneiras : null;
      if (next === null) {
        if (current !== null) {
          beforeClassificationData.peneiras = current;
          afterClassificationData.peneiras = null;
        }
      } else if (isPlainObject(next)) {
        const beforeGroup = {};
        const afterGroup = {};
        for (const key of CLASSIFICATION_PENEIRA_KEYS) {
          if (!hasOwn(next, key)) continue;
          const cur = current && hasOwn(current, key) ? current[key] : null;
          const nxt = next[key];
          if (valuesEqual(cur, nxt)) continue;
          beforeGroup[key] = cur;
          afterGroup[key] = nxt;
        }
        if (Object.keys(afterGroup).length > 0) {
          beforeClassificationData.peneiras = beforeGroup;
          afterClassificationData.peneiras = afterGroup;
        }
      }
    }

    if (hasOwn(parsedPatch.classificationData, 'fundos')) {
      const next = parsedPatch.classificationData.fundos;
      const current = Array.isArray(currentData.fundos) ? currentData.fundos : null;
      if (!valuesEqual(current, next)) {
        beforeClassificationData.fundos = current;
        afterClassificationData.fundos = next;
      }
    }

    if (hasOwn(parsedPatch.classificationData, 'defeitos')) {
      const next = parsedPatch.classificationData.defeitos;
      const current = isPlainObject(currentData.defeitos) ? currentData.defeitos : null;
      if (next === null) {
        if (current !== null) {
          beforeClassificationData.defeitos = current;
          afterClassificationData.defeitos = null;
        }
      } else if (isPlainObject(next)) {
        const beforeGroup = {};
        const afterGroup = {};
        for (const key of CLASSIFICATION_DEFEITO_KEYS) {
          if (!hasOwn(next, key)) continue;
          const cur = current && hasOwn(current, key) ? current[key] : null;
          const nxt = next[key];
          if (valuesEqual(cur, nxt)) continue;
          beforeGroup[key] = cur;
          afterGroup[key] = nxt;
        }
        if (Object.keys(afterGroup).length > 0) {
          beforeClassificationData.defeitos = beforeGroup;
          afterClassificationData.defeitos = afterGroup;
        }
      }
    }

    if (Object.keys(afterClassificationData).length > 0) {
      before.classificationData = beforeClassificationData;
      after.classificationData = afterClassificationData;
    }
  }

  if (Object.keys(parsedPatch.technical).length > 0) {
    const beforeTechnical = {};
    const afterTechnical = {};

    for (const field of CLASSIFICATION_TECHNICAL_EDITABLE_FIELDS) {
      if (!hasOwn(parsedPatch.technical, field)) {
        continue;
      }

      const currentValue = hasOwn(currentTechnical, field) ? currentTechnical[field] : null;
      const nextValue = parsedPatch.technical[field];
      if (valuesEqual(currentValue, nextValue)) {
        continue;
      }

      beforeTechnical[field] = currentValue;
      afterTechnical[field] = nextValue;
    }

    if (Object.keys(afterTechnical).length > 0) {
      before.technical = beforeTechnical;
      after.technical = afterTechnical;
    }
  }

  if (parsedPatch.consumptionGrams !== undefined) {
    const currentConsumption = hasOwn(currentData, 'consumoGramas')
      ? currentData.consumoGramas
      : null;
    if (!valuesEqual(currentConsumption, parsedPatch.consumptionGrams)) {
      before.consumptionGrams = currentConsumption;
      after.consumptionGrams = parsedPatch.consumptionGrams;
    }
  }

  if (parsedPatch.classifiers !== undefined) {
    const currentClassifiers = hasOwn(currentData, 'classificadores')
      ? currentData.classificadores
      : null;
    if (!valuesEqual(currentClassifiers, parsedPatch.classifiers)) {
      before.classifiers = currentClassifiers;
      after.classifiers = parsedPatch.classifiers;
    }
  }

  if (Object.keys(after).length === 0) {
    return null;
  }

  return {
    before,
    after,
  };
}

function normalizeSacks(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new HttpError(422, 'sacks must be an integer >= 1');
  }

  return parsed;
}

function normalizeReceivedChannel(value) {
  const normalized = normalizeRequiredText(value ?? 'in_person', 'receivedChannel').toLowerCase();
  if (!RECEIVED_CHANNELS.has(normalized)) {
    throw new HttpError(422, 'receivedChannel is invalid');
  }

  return normalized;
}

function normalizePhotoKind(value) {
  if (value === PHOTO_KINDS.CLASSIFICATION) {
    return value;
  }

  throw new HttpError(422, 'photo kind is invalid');
}

function buildDeterministicUuid(seed) {
  const digest = createHash('sha256').update(seed).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function requireExpectedVersion(expectedVersion) {
  if (
    typeof expectedVersion !== 'number' ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    throw new HttpError(422, 'expectedVersion must be a non-negative integer');
  }
}

function projectPhysicalSendState(events, sendEventId) {
  const original = events.find(
    (evt) => evt.eventId === sendEventId && evt.eventType === 'PHYSICAL_SAMPLE_SENT'
  );
  if (!original) {
    return null;
  }

  const state = {
    status: 'ACTIVE',
    recipientClientId: original.payload?.recipientClientId ?? null,
    recipientClientSnapshot: original.payload?.recipientClientSnapshot ?? null,
    sentDate: original.payload?.sentDate ?? null,
  };

  for (const evt of events) {
    if (evt.payload?.sendEventId !== sendEventId) continue;
    if (evt.eventType === 'PHYSICAL_SAMPLE_SEND_UPDATED') {
      state.recipientClientId = evt.payload.recipientClientId ?? null;
      state.recipientClientSnapshot = evt.payload.recipientClientSnapshot ?? null;
      state.sentDate = evt.payload.sentDate ?? state.sentDate;
    } else if (evt.eventType === 'PHYSICAL_SAMPLE_SEND_CANCELLED') {
      state.status = 'CANCELLED';
    }
  }

  return state;
}

function assertSampleStatus(sample, allowedStatuses, actionLabel) {
  if (!allowedStatuses.includes(sample.status)) {
    throw new HttpError(
      409,
      `Sample ${sample.id} status ${sample.status} is invalid for ${actionLabel}. Allowed: ${allowedStatuses.join(', ')}`
    );
  }
}

function requireUserActor(actorContext, allowedRoles, actionLabel) {
  const actor = normalizeActorContext(actorContext);

  if (actor.actorType !== 'USER') {
    throw new HttpError(401, `${actionLabel} requires authenticated user`);
  }

  if (typeof actor.role !== 'string') {
    throw new HttpError(401, 'Authenticated actor role is missing');
  }

  assertRoleAllowed(actor.role, allowedRoles, actionLabel);
  return actor;
}

function normalizeCompareText(a, b) {
  const na = String(a)
    .trim()
    .toLowerCase()
    .replace(/[\s\-\/]/g, '');
  const nb = String(b)
    .trim()
    .toLowerCase()
    .replace(/[\s\-\/]/g, '');
  return na === nb || na.includes(nb) || nb.includes(na);
}

function parseNumericString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function crossValidateExtraction(identificacao, sample) {
  const details = [];

  if (identificacao.lote !== null) {
    const registered = sample.internalLotNumber ?? null;
    details.push({
      field: 'lote',
      extracted: identificacao.lote,
      registered,
      match: registered !== null && normalizeCompareText(identificacao.lote, registered),
    });
  }

  if (identificacao.sacas !== null) {
    const extractedNum = parseNumericString(identificacao.sacas);
    const registered = sample.declared?.sacks ?? null;
    details.push({
      field: 'sacas',
      extracted: identificacao.sacas,
      registered: registered !== null ? String(registered) : null,
      match: registered !== null && extractedNum !== null && extractedNum === registered,
    });
  }

  if (identificacao.safra !== null) {
    const registered = sample.declared?.harvest ?? null;
    details.push({
      field: 'safra',
      extracted: identificacao.safra,
      registered,
      match: registered !== null && normalizeCompareText(identificacao.safra, registered),
    });
  }

  if (identificacao.data !== null) {
    details.push({
      field: 'data',
      extracted: identificacao.data,
      registered: null,
      match: true,
    });
  }

  return {
    hasMismatches: details.some((d) => !d.match),
    details,
  };
}

function isInternalLotNumberUniqueConflict(error) {
  if (error?.code === 'P2002') {
    const target = Array.isArray(error?.meta?.target) ? error.meta.target.join(',') : '';
    return target.includes('internal_lot_number') || target.includes('uq_sample_internal_lot');
  }

  const message = typeof error?.message === 'string' ? error.message : '';
  return message.includes('internal_lot_number') || message.includes('uq_sample_internal_lot');
}

export class SampleCommandService {
  constructor({
    eventService,
    queryService,
    uploadService = null,
    clientService = null,
    extractionService = null,
    formDetectionService = null,
    userService = null,
    pushService = null,
  }) {
    this.eventService = eventService;
    this.queryService = queryService;
    this.uploadService = uploadService;
    this.clientService = clientService;
    this.extractionService = extractionService;
    this.formDetectionService = formDetectionService;
    this.userService = userService;
    this.pushService = pushService;
  }

  // Valida e monta snapshots dos classificadores server-side. Recebe lista
  // crua do cliente (so com userIds) e retorna array de snapshots prontos
  // para persistencia no payload do evento.
  //
  // - Rejeita usuarios inexistentes ou inativos.
  // - Dedup silencioso por userId.
  // - Min 1, Max 50 classificadores.
  // - Empty/null/undefined -> HttpError 422 (classifiers e obrigatorio).
  // - Actor PODE estar na lista (auto-inclusao vem do frontend).
  async normalizeClassifiers(raw) {
    if (raw === null || raw === undefined) {
      throw new HttpError(422, 'classifiers e obrigatorio (min 1)', {
        code: 'CLASSIFIERS_REQUIRED',
      });
    }
    if (!Array.isArray(raw)) {
      throw new HttpError(422, 'classifiers must be an array', {
        code: 'CLASSIFIERS_INVALID_SHAPE',
      });
    }
    if (raw.length === 0) {
      throw new HttpError(422, 'classifiers e obrigatorio (min 1)', {
        code: 'CLASSIFIERS_REQUIRED',
      });
    }
    if (raw.length > 50) {
      throw new HttpError(422, 'classifiers: maximo de 50 classificadores', {
        code: 'CLASSIFIERS_TOO_MANY',
      });
    }

    const seen = new Set();
    const uniqueIds = [];
    for (const item of raw) {
      if (!isPlainObject(item)) {
        throw new HttpError(422, 'classifiers items must be objects', {
          code: 'CLASSIFIERS_INVALID_SHAPE',
        });
      }
      const userId = item.userId;
      if (typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
        throw new HttpError(422, 'classifiers[].userId must be a uuid', {
          code: 'CLASSIFIERS_INVALID_SHAPE',
        });
      }
      if (seen.has(userId)) continue;
      seen.add(userId);
      uniqueIds.push(userId);
    }

    if (uniqueIds.length === 0) {
      throw new HttpError(422, 'classifiers e obrigatorio (min 1)', {
        code: 'CLASSIFIERS_REQUIRED',
      });
    }

    if (!this.userService) {
      throw new HttpError(501, 'User service is not configured for classifiers validation');
    }
    const userMap = await this.userService.findUsersForSnapshotByIds(uniqueIds);

    const snapshots = [];
    for (const userId of uniqueIds) {
      const user = userMap.get(userId);
      if (!user) {
        throw new HttpError(422, `Classificador nao encontrado: ${userId}`, {
          code: 'CLASSIFIER_NOT_FOUND',
          userId,
        });
      }
      if (user.status !== 'ACTIVE') {
        throw new HttpError(422, `Classificador inativo: ${userId}`, {
          code: 'INACTIVE_CLASSIFIER',
          userId,
        });
      }
      const fullName =
        typeof user.fullName === 'string' && user.fullName.trim().length > 0
          ? user.fullName.trim()
          : user.username;
      snapshots.push({
        id: user.id,
        fullName,
        username: user.username,
      });
    }

    return snapshots;
  }

  // Fase Q (2026-05-07): registro emite 1 evento único `REGISTRATION_CONFIRMED`
  // (`fromStatus: null` → `toStatus: REGISTRATION_CONFIRMED`). A orquestração
  // anterior de 3 passos (SAMPLE_RECEIVED + REGISTRATION_STARTED + REGISTRATION_CONFIRMED)
  // foi colapsada — os statuses intermediários PHYSICAL_RECEIVED e
  // REGISTRATION_IN_PROGRESS eram fantasmas (usuário nunca via). Idempotência
  // por `sampleId` determinístico (hash de actorUserId + clientDraftId) +
  // `idempotencyScope: REGISTRATION_CONFIRM`. Retry preserva apenas a geração
  // de `internalLotNumber` (conflito de unicidade).
  async createSample(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'create sample');

    const clientDraftId = normalizeRequiredText(input.clientDraftId, 'clientDraftId');
    const ownerBinding = await resolveStructuredOwnerForWrite({
      sample: null,
      inputOwnerClientId: normalizeNullableUuid(input.ownerClientId, 'ownerClientId'),
      inputOwnerUnitId: normalizeNullableUuid(input.ownerUnitId, 'ownerUnitId'),
      clientService: this.clientService,
      mode: 'create',
    });
    const declared = {
      owner: ownerBinding?.displayName ?? normalizeRequiredText(input.owner, 'owner'),
      sacks: normalizeSacks(input.sacks),
      harvest: normalizeRequiredText(input.harvest, 'harvest'),
      originLot: normalizeOptionalText(input.originLot, 'originLot', 100),
      location: normalizeOptionalText(input.location, 'location', 30),
    };
    const receivedChannel = normalizeReceivedChannel(input.receivedChannel ?? 'in_person');
    const notes = normalizeOptionalText(input.notes, 'notes', 500);
    // Em produção, `sampleId` é determinístico (hash de actor + clientDraftId) pra
    // garantir idempotência por draft. Tests podem passar `input.sampleId` explícito
    // pra fixar o UUID e simplificar asserts.
    const sampleId =
      normalizeNullableUuid(input.sampleId, 'sampleId') ??
      buildDeterministicUuid(`${actor.actorUserId}:${clientDraftId}`);

    // Idempotência: se o sample já existe (retry da mesma criação ou request
    // duplicada por outra aba), retornamos sem emitir evento novo.
    const existing = await this.queryService.findSampleOrNull(sampleId);
    if (existing) {
      if (existing.status === 'INVALIDATED') {
        throw new HttpError(409, `Sample ${existing.id} is INVALIDATED and cannot be recreated`);
      }
      return {
        statusCode: 200,
        idempotent: true,
        event: null,
        sample: existing,
        draft: { clientDraftId, sampleId: existing.id },
      };
    }

    // Geração do internalLotNumber: aceita override via input.sampleLotNumber
    // (caso de testes/imports). Sem override, gera sequencial e retenta se
    // bater no UNIQUE constraint (corrida com outra request).
    const fixedLotNumber = input.sampleLotNumber ?? null;
    const maxRetries = fixedLotNumber ? 1 : AUTO_LOT_NUMBER_MAX_RETRIES;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      const sampleLotNumber =
        fixedLotNumber ?? (await this.queryService.getNextInternalLotNumber());

      const event = buildEventEnvelope({
        eventType: 'REGISTRATION_CONFIRMED',
        sampleId,
        payload: {
          sampleLotNumber,
          declared,
          ownerClientId: ownerBinding?.ownerClientId ?? null,
          // ownerUnitId nao e mais emitido: o lote nao vincula fazenda.
          receivedChannel,
          notes,
        },
        fromStatus: null,
        toStatus: 'REGISTRATION_CONFIRMED',
        module: 'registration',
        actorContext: actor,
        idempotencyScope: 'REGISTRATION_CONFIRM',
        idempotencyKey: input.idempotencyKey ?? `draft:${clientDraftId}:registration-confirm`,
      });

      try {
        const result = await this.eventService.appendEvent(event);
        // Re-busca o sample via queryService pra ter o shape do read model
        // (declared.{owner,sacks,...}, latestClassification, etc.) em vez do
        // record cru do Prisma (declaredOwner, declaredSacks, ...).
        const mappedSample = await this.queryService.requireSample(sampleId);
        return {
          statusCode: result.idempotent ? 200 : 201,
          idempotent: Boolean(result.idempotent),
          event: result.event,
          sample: mappedSample,
          draft: { clientDraftId, sampleId },
        };
      } catch (error) {
        if (!fixedLotNumber && isInternalLotNumberUniqueConflict(error) && attempt < maxRetries) {
          continue;
        }
        throw error;
      }
    }

    throw new HttpError(409, 'Could not generate a unique sample lot number');
  }

  // Liga A2.2 (Liga F2.3 + Q0.1 + F3.* + Wave A1/A2):
  // Cria uma liga (Sample com isBlend=true) a partir de N (>=2) origens.
  // - Valida componentes: array >=2, sem duplicatas, todos CLASSIFIED,
  //   contributedSacks dentro de availableSacks (Q0.2), F7.7 (liga em
  //   liga = 100% obrigatorio).
  // - Idempotencia: sampleId determinístico (`buildDeterministicUuid`)
  //   permite retry sem duplicar.
  // - Emite 2 eventos atomicamente via appendEventBatch:
  //   REGISTRATION_CONFIRMED (mutating) + BLEND_CREATED (audit-only).
  // - beforeCommit insere linhas em sample_blend_component + marca
  //   sample.isBlend=true na mesma tx.
  async createBlend(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'create blend');

    const clientDraftId = normalizeRequiredText(input.clientDraftId, 'clientDraftId');

    // 1. Componentes — minimo 2, sem duplicatas.
    if (!Array.isArray(input.components) || input.components.length < 2) {
      throw new HttpError(422, 'A blend requires at least 2 components');
    }
    const normalizedComponents = [];
    const seenOrigins = new Set();
    for (const candidate of input.components) {
      const originSampleId = normalizeNullableUuid(candidate?.originSampleId, 'originSampleId');
      if (!originSampleId) {
        throw new HttpError(422, 'originSampleId is required for each component');
      }
      if (seenOrigins.has(originSampleId)) {
        throw new HttpError(422, `Duplicate origin ${originSampleId} in components`);
      }
      seenOrigins.add(originSampleId);
      const contributedSacks = normalizeSacks(candidate?.contributedSacks);
      normalizedComponents.push({ originSampleId, contributedSacks });
    }

    // 2. Validacao por origem: status, saldo, F7.7 (liga em liga = 100%).
    // F1.4 relaxada em 2026-05-19: aceita REGISTRATION_CONFIRMED ou
    // CLASSIFIED (antes era CLASSIFIED only). INVALIDATED continua bloqueado.
    // 2026-05-19 (B2.2 refinada): coleta declaredHarvest das origens em
    // paralelo pra derivar a safra da liga automaticamente (modal F3
    // removido — operador nao informa mais manualmente).
    const originHarvests = [];
    const originOwners = [];
    for (const component of normalizedComponents) {
      const origin = await this.queryService.loadSampleSummary(component.originSampleId);
      if (!origin) {
        throw new HttpError(404, `Origin sample ${component.originSampleId} does not exist`);
      }
      if (origin.status === 'INVALIDATED') {
        throw new HttpError(
          422,
          `Origin ${component.originSampleId} is INVALIDATED and cannot be used in a blend`
        );
      }
      if (origin.availableSacks <= 0) {
        throw new HttpError(
          422,
          `Origin ${component.originSampleId} has no available sacks (available: ${origin.availableSacks})`
        );
      }
      if (component.contributedSacks > origin.availableSacks) {
        throw new HttpError(
          422,
          `contributedSacks ${component.contributedSacks} exceeds availableSacks ${origin.availableSacks} for origin ${component.originSampleId}`
        );
      }
      // F7.7: quando origem e liga, contribuicao tem que ser 100%.
      if (origin.isBlend && component.contributedSacks !== origin.declaredSacks) {
        throw new HttpError(
          422,
          `When origin ${component.originSampleId} is a blend (F7.7), contributedSacks must equal declaredSacks. Got ${component.contributedSacks}, expected ${origin.declaredSacks}`
        );
      }
      originHarvests.push(origin.declaredHarvest);
      originOwners.push({
        ownerClientId: origin.ownerClientId,
        declaredOwner: origin.declaredOwner,
      });
    }

    const declaredSacks = normalizedComponents.reduce(
      (sum, component) => sum + component.contributedSacks,
      0
    );

    // F3.2 revogada em 2026-05-19: safra deriva automaticamente das origens
    // via deriveBlendHarvest (distinct ordenado, join com ', '; split por
    // virgula dedupa origens-liga ja concatenadas). Mesma a mesma logica usada
    // pela propagacao reativa. Override manual (`input.harvest`) ainda aceito
    // pra testes/integration de seed legado.
    const derivedHarvest = deriveBlendHarvest(originHarvests);
    const harvest = input.harvest
      ? normalizeRequiredText(input.harvest, 'harvest')
      : derivedHarvest;

    // 3. Owner: override manual (`input.ownerClientId`) tem precedencia; senao
    // deriva das origens por UNANIMIDADE — todas com o mesmo ownerClientId
    // (nao-nulo) -> liga herda; divergente/alguma sem dono -> liga sem dono
    // (null). Mesma logica usada pela propagacao reativa do proprietario. Nome
    // (declaredOwner) vem do snapshot da 1a origem (deriveBlendOwner).
    const inputOwnerClientId = normalizeNullableUuid(input.ownerClientId, 'ownerClientId');
    const inputOwnerUnitId = normalizeNullableUuid(input.ownerUnitId, 'ownerUnitId');
    let ownerBinding = null;
    if (inputOwnerClientId) {
      ownerBinding = await this.clientService.resolveOwnerBinding({
        ownerClientId: inputOwnerClientId,
        ownerUnitId: inputOwnerUnitId ?? null,
      });
    } else if (inputOwnerUnitId) {
      throw new HttpError(422, 'ownerUnitId requires ownerClientId');
    } else {
      const derivedOwner = deriveBlendOwner(originOwners);
      if (derivedOwner.ownerClientId) {
        ownerBinding = {
          ownerClientId: derivedOwner.ownerClientId,
          displayName: derivedOwner.declaredOwner,
        };
      }
    }

    // 4. declared.* — owner pode ser null (F3.3 / T0.C docstring Prisma).
    //    harvest pode ser null tambem quando nenhuma origem tem safra
    //    declarada (raro — origens normalmente declaram safra no registro).
    const declared = {
      owner: ownerBinding?.displayName ?? null,
      sacks: declaredSacks,
      harvest,
      // Liga F3.5: declaredOriginLot intencionalmente null em liga.
      originLot: null,
      location: normalizeOptionalText(input.location, 'location', 30),
    };

    const notes = normalizeOptionalText(input.notes, 'notes', 500);

    const sampleId =
      normalizeNullableUuid(input.sampleId, 'sampleId') ??
      buildDeterministicUuid(`blend:${actor.actorUserId}:${clientDraftId}`);

    // 5. Idempotencia — se ja existe, retornar idempotent (mesmo padrao
    // de createSample). Se INVALIDATED, rejeita (nao da pra recriar).
    const existing = await this.queryService.findSampleOrNull(sampleId);
    if (existing) {
      if (existing.status === 'INVALIDATED') {
        throw new HttpError(409, `Blend ${existing.id} is INVALIDATED and cannot be recreated`);
      }
      return {
        statusCode: 200,
        idempotent: true,
        events: [],
        sample: existing,
        draft: { clientDraftId, sampleId: existing.id },
      };
    }

    // 6. Retry lot number (mesmo padrao do createSample).
    const fixedLotNumber = input.sampleLotNumber ?? null;
    const maxRetries = fixedLotNumber ? 1 : AUTO_LOT_NUMBER_MAX_RETRIES;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      const sampleLotNumber =
        fixedLotNumber ?? (await this.queryService.getNextInternalLotNumber());

      const regConfirmedEvent = buildEventEnvelope({
        eventType: 'REGISTRATION_CONFIRMED',
        sampleId,
        payload: {
          sampleLotNumber,
          declared,
          ownerClientId: ownerBinding?.ownerClientId ?? null,
          // ownerUnitId nao e mais emitido: a liga/lote nao vincula fazenda.
          // Liga T0.C: 'internal' substitui 'in_person' silencioso.
          receivedChannel: 'internal',
          notes,
        },
        fromStatus: null,
        toStatus: 'REGISTRATION_CONFIRMED',
        module: 'registration',
        actorContext: actor,
        idempotencyScope: 'REGISTRATION_CONFIRM',
        idempotencyKey: input.idempotencyKey ?? `blend:${clientDraftId}:registration-confirm`,
      });

      const blendCreatedEvent = buildEventEnvelope({
        eventType: 'BLEND_CREATED',
        sampleId,
        payload: {
          components: normalizedComponents,
          declaredSacks,
        },
        // Audit-only — fromStatus/toStatus null (Liga A1 + plano).
        fromStatus: null,
        toStatus: null,
        module: 'registration',
        actorContext: actor,
        idempotencyScope: 'BLEND_CREATE',
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}:blend-created`
          : `blend:${clientDraftId}:create`,
      });

      const componentRows = normalizedComponents.map((component) => ({
        id: randomUUID(),
        sampleId,
        originSampleId: component.originSampleId,
        contributedSacks: component.contributedSacks,
      }));

      try {
        const results = await this.eventService.appendEventBatch(
          [regConfirmedEvent, blendCreatedEvent],
          [{}, {}],
          async (tx) => {
            await tx.createBlendComponents(componentRows);
            await tx.markAsBlend(sampleId);
          }
        );

        const mappedSample = await this.queryService.requireSample(sampleId);
        return {
          statusCode: 201,
          idempotent: false,
          events: results.map((r) => r.event),
          sample: mappedSample,
          draft: { clientDraftId, sampleId },
        };
      } catch (error) {
        if (!fixedLotNumber && isInternalLotNumberUniqueConflict(error) && attempt < maxRetries) {
          continue;
        }
        throw error;
      }
    }

    throw new HttpError(409, 'Could not generate a unique blend lot number');
  }

  // Liga A2.3 (Liga F8.1-4 + Q0.3/T0.A + F8.3):
  // Reverte uma liga existente, transicionando-a para INVALIDATED.
  // - Restricoes: sample.isBlend=true, status ∈ {REGISTRATION_CONFIRMED,
  //   CLASSIFIED}, soldSacks=0, lostSacks=0 (Liga F8.4 — reversao bloqueada
  //   apos venda/perda).
  // - Origens permanecem intactas (Q0.3/T0.A — origens nunca foram afetadas
  //   pela criacao). SampleBlendComponent NAO e apagado (Liga F8.3 — composicao
  //   preservada como historico no detalhe da liga invalidada).
  // - Emite 2 eventos atomicamente via appendEventBatch:
  //   BLEND_REVERTED (audit-only, carrega reasonText) + SAMPLE_INVALIDATED
  //   (mutating, status → INVALIDATED).
  async revertBlend(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'revert blend');
    requireExpectedVersion(input.expectedVersion);

    const blendId = normalizeRequiredText(input.blendId, 'blendId');

    const blend = await this.queryService.loadSampleSummary(blendId);
    if (!blend) {
      throw new HttpError(404, `Blend ${blendId} does not exist`);
    }
    if (!blend.isBlend) {
      throw new HttpError(422, `Sample ${blendId} is not a blend`);
    }
    if (blend.status !== 'REGISTRATION_CONFIRMED' && blend.status !== 'CLASSIFIED') {
      throw new HttpError(
        409,
        `Blend ${blendId} must be REGISTRATION_CONFIRMED or CLASSIFIED to revert (current: ${blend.status})`
      );
    }
    // F8.4: bloqueia reversao pos-venda/perda.
    if (blend.soldSacks > 0 || blend.lostSacks > 0) {
      throw new HttpError(
        409,
        `Cannot revert blend ${blendId}: has sold or lost sacks. Reversion only allowed pre-commercialization (Liga F8.4)`
      );
    }

    const reasonText = normalizeOptionalText(input.reasonText, 'reasonText', 500);

    const idempotencyBase = input.idempotencyKey ?? `blend:${blendId}:revert`;

    const blendRevertedEvent = buildEventEnvelope({
      eventType: 'BLEND_REVERTED',
      sampleId: blendId,
      payload: {
        reasonText: reasonText ?? null,
      },
      // Audit-only — fromStatus/toStatus null (carrega motivo da reversao
      // mas nao move status; quem move e o SAMPLE_INVALIDATED logo apos).
      fromStatus: null,
      toStatus: null,
      module: 'registration',
      actorContext: actor,
      idempotencyScope: 'BLEND_REVERT',
      idempotencyKey: idempotencyBase,
    });

    const sampleInvalidatedEvent = buildEventEnvelope({
      eventType: 'SAMPLE_INVALIDATED',
      sampleId: blendId,
      payload: {
        reasonCode: 'OTHER',
        // SAMPLE_INVALIDATED.reasonText e obrigatorio (minLength 1) no
        // schema do payload; quando o operador nao informa motivo
        // (F8.2 — motivo opcional), usamos um texto padrao referenciando
        // a reversao da liga (BLEND_REVERTED carrega o reasonText real,
        // possivelmente null). Mantem o contrato sem quebrar.
        reasonText: reasonText ?? 'Liga revertida (sem motivo informado)',
      },
      fromStatus: blend.status,
      toStatus: 'INVALIDATED',
      module: 'registration',
      actorContext: actor,
      idempotencyScope: 'INVALIDATE',
      idempotencyKey: `${idempotencyBase}:invalidate`,
    });

    const results = await this.eventService.appendEventBatch(
      [blendRevertedEvent, sampleInvalidatedEvent],
      [{}, { expectedVersion: input.expectedVersion }]
    );

    const mappedSample = await this.queryService.requireSample(blendId);
    return {
      statusCode: 200,
      idempotent: false,
      events: results.map((r) => r.event),
      sample: mappedSample,
    };
  }

  async addSamplePhoto(input, actorContext) {
    const kind = normalizePhotoKind(input.kind);
    const actionLabel = 'add classification photo';
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, actionLabel);

    if (!this.uploadService) {
      throw new Error('uploadService is required for addSamplePhoto');
    }

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, PHOTO_KIND_ALLOWED_STATUSES[kind], actionLabel);

    const replaceExisting = input.replaceExisting !== false;
    const existingAttachment = await this.queryService.findAttachmentByKind(sample.id, kind);
    if (existingAttachment && !replaceExisting) {
      throw new HttpError(409, `Sample ${sample.id} already has a ${kind} attachment`);
    }

    const saved = await this.uploadService.saveSamplePhoto({
      sampleId: sample.id,
      kind,
      buffer: input.fileBuffer,
      mimeType: input.mimeType ?? null,
      originalFileName: input.originalFileName ?? null,
    });

    const event = buildEventEnvelope({
      eventType: 'PHOTO_ADDED',
      sampleId: sample.id,
      payload: {
        attachmentId: saved.attachmentId,
        kind,
        storagePath: saved.storagePath,
        fileName: saved.fileName,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        checksumSha256: saved.checksumSha256,
      },
      fromStatus: null,
      toStatus: null,
      module: 'classification',
      actorContext: actor,
    });

    try {
      const result = await this.eventService.appendEvent(event);

      if (existingAttachment?.storagePath && existingAttachment.storagePath !== saved.storagePath) {
        await this.uploadService
          .deleteByStoragePath(existingAttachment.storagePath)
          .catch(() => {});
      }

      let extraction = null;
      if (this.extractionService && this.uploadService && !input.skipExtraction) {
        try {
          const absolutePath = path.join(this.uploadService.baseDir, saved.storagePath);
          // Fase Q.cls.2: extracao e type-agnostic (1 prompt unico para a
          // ficha unificada). O classificationType e selecionado depois
          // pelo operador via modal e nao influencia a IA.
          const raw = await this.extractionService.extractClassificationFromPhoto(absolutePath, {
            sampleId: sample.id,
          });
          const crossValidation = crossValidateExtraction(raw.identificacao, sample);
          extraction = {
            extractedFields: raw.classificacao,
            crossValidation,
            // Modelo servido pela OpenAI (pinado em classification-extraction-service).
            model: raw.model ?? 'gpt-4o-2024-11-20',
            photoAttachmentId: saved.attachmentId,
            processingTimeMs: raw.processingTimeMs,
          };

          const extractionEvent = buildEventEnvelope({
            eventType: 'CLASSIFICATION_EXTRACTION_COMPLETED',
            sampleId: sample.id,
            payload: extraction,
            fromStatus: null,
            toStatus: null,
            module: 'classification',
            actorContext: actor,
          });
          await this.eventService.appendEvent(extractionEvent);
        } catch (extractionError) {
          console.error(
            '[extraction] Classification extraction failed:',
            extractionError.code ?? 'UNKNOWN',
            extractionError.message
          );
          try {
            const failureEvent = buildEventEnvelope({
              eventType: 'CLASSIFICATION_EXTRACTION_FAILED',
              sampleId: sample.id,
              payload: {
                errorCode: extractionError.code ?? 'UNKNOWN',
                errorMessage: String(extractionError.message ?? 'Extraction failed'),
                photoAttachmentId: saved.attachmentId,
              },
              fromStatus: null,
              toStatus: null,
              module: 'classification',
              actorContext: actor,
            });
            await this.eventService.appendEvent(failureEvent);
          } catch (eventError) {
            console.error(
              '[extraction] Failed to persist extraction failure event:',
              eventError.message
            );
          }
        }
      }

      return {
        ...result,
        photo: {
          ...saved,
          kind,
        },
        extraction,
      };
    } catch (error) {
      await this.uploadService.deleteByStoragePath(saved.storagePath);
      throw error;
    }
  }

  async addClassificationPhoto(input, actorContext) {
    return this.addSamplePhoto(
      {
        ...input,
        kind: PHOTO_KINDS.CLASSIFICATION,
      },
      actorContext
    );
  }

  // Q.print + Q.final: requestQrPrint e ACAO PURA (audit-only, fromStatus/
  // toStatus null). Aceita qualquer status ≠ INVALIDATED. Antes de criar
  // novo PrintJob, aplica lazy timeout (PENDING > 1min vira EXPIRED).
  // Bloqueia 409 se houver PENDING valido pra essa amostra. Sem
  // expectedVersion (nao muda sample). PrintAction enum + coluna foram
  // dropados em Q.final — todas as tentativas usam attemptNumber sequencial.
  async requestQrPrint(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'request QR print');

    const sample = await this.queryService.requireSample(input.sampleId);
    if (sample.status === 'INVALIDATED') {
      throw new HttpError(409, 'cannot print on INVALIDATED sample');
    }

    // Idempotency pre-check: se ja existe um QR_PRINT_REQUESTED com essa
    // key, retorna idempotent antes do bloqueio de PENDING. Q.auto depende
    // disso pra que retry da mesma classificacao (key derivada do
    // event.idempotencyKey) reuse o PrintJob original em vez de cair em 409.
    if (input.idempotencyKey) {
      const existing = await this.queryService.prisma.sampleEvent.findFirst({
        where: {
          sampleId: sample.id,
          idempotencyScope: 'QR_PRINT',
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) {
        return { statusCode: 200, idempotent: true, event: existing };
      }
    }

    // Lazy timeout: marca PrintJobs PENDING > 1min como FAILED antes de
    // criar/avaliar nova request. Evita bloqueio permanente quando o
    // print agent fica offline.
    await this.queryService.expireStalePrintJobs(sample.id, PRINT_JOB_PENDING_TIMEOUT_MS);

    // Bloqueia se ainda houver PENDING valido (apos lazy timeout).
    const pending = await this.queryService.prisma.printJob.findFirst({
      where: { sampleId: sample.id, status: 'PENDING' },
      select: { id: true },
    });
    if (pending) {
      throw new HttpError(409, 'A print job is already pending for this sample');
    }

    const attemptNumber = await this.queryService.getNextPrintAttemptNumber(sample.id);

    const event = buildEventEnvelope({
      eventType: 'QR_PRINT_REQUESTED',
      sampleId: sample.id,
      payload: {
        attemptNumber,
        printerId: input.printerId ?? null,
      },
      fromStatus: null,
      toStatus: null,
      module: 'print',
      actorContext: actor,
      idempotencyScope: 'QR_PRINT',
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
    });

    return this.eventService.appendEvent(event);
  }

  // Q.print + Q.final: recordQrPrintFailed e audit-only. Sem expectedVersion
  // (nao muda sample). PrintJob.status='FAILED' atualizado em paralelo
  // via projection (chave: sample_id + attempt_number).
  async recordQrPrintFailed(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'record QR print failure');

    const sample = await this.queryService.requireSample(input.sampleId);
    // Aceita qualquer status — agent pode reportar failure mesmo apos o
    // sample ter avancado (ex: timeout race). Idempotencia protege
    // re-tentativas.

    const event = buildEventEnvelope({
      eventType: 'QR_PRINT_FAILED',
      sampleId: sample.id,
      payload: {
        attemptNumber: input.attemptNumber,
        printerId: input.printerId ?? null,
        error: input.error,
      },
      fromStatus: null,
      toStatus: null,
      module: 'print',
      actorContext: actor,
    });

    return this.eventService.appendEvent(event);
  }

  // Q.print + Q.final: recordQrPrinted e audit-only. Sem hack de "se ja
  // passou de QR_PENDING_PRINT" (status nao muda mais). Sem expectedVersion.
  // PrintJob.status='SUCCESS' atualizado em paralelo via projection.
  async recordQrPrinted(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'record QR printed');

    const sample = await this.queryService.requireSample(input.sampleId);

    const event = buildEventEnvelope({
      eventType: 'QR_PRINTED',
      sampleId: sample.id,
      payload: {
        attemptNumber: input.attemptNumber,
        printerId: input.printerId ?? null,
      },
      fromStatus: null,
      toStatus: null,
      module: 'print',
      actorContext: actor,
    });

    return this.eventService.appendEvent(event);
  }

  async completeClassification(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'complete classification');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    // Q.cls.1 + Q.print: classificacao parte direto de REGISTRATION_CONFIRMED
    // (lifecycle simplificado, sem statuses intermediarios de print/classification).
    assertSampleStatus(sample, ['REGISTRATION_CONFIRMED'], 'complete classification');
    const classificationPhoto = await this.queryService.findAttachmentByKind(
      sample.id,
      PHOTO_KINDS.CLASSIFICATION
    );
    if (!classificationPhoto) {
      throw new HttpError(409, 'Foto de classificacao e obrigatoria para completar');
    }
    const classificationDate = buildBusinessDateStamp();

    const payload = {
      classificationPhotoId: classificationPhoto.id,
      classificationData: {
        dataClassificacao: classificationDate,
      },
    };

    if (isPlainObject(input.technical)) {
      payload.technical = input.technical;
    }

    if (isPlainObject(input.classificationData)) {
      payload.classificationData = {
        ...input.classificationData,
        dataClassificacao: classificationDate,
      };
    }

    if (input.consumptionGrams !== undefined) {
      payload.consumptionGrams = input.consumptionGrams;
    }

    if (typeof input.classificationVersion === 'number') {
      payload.classificationVersion = input.classificationVersion;
    }

    // classifiers e obrigatorio (min 1). O frontend envia os classificadores
    // selecionados (o usuario atual e pre-selecionado, mas pode ser removido).
    // Backend apenas normaliza/valida existencia/ativo dos usuarios.
    payload.classifiers = await this.normalizeClassifiers(input.classifiers);

    if (input.classificationType) {
      payload.classificationType = input.classificationType;
    }

    const event = buildEventEnvelope({
      eventType: 'CLASSIFICATION_COMPLETED',
      sampleId: sample.id,
      payload,
      fromStatus: sample.status,
      toStatus: 'CLASSIFIED',
      module: 'classification',
      actorContext: actor,
      idempotencyScope: 'CLASSIFICATION_COMPLETE',
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
    });

    const result = await this.eventService.appendEvent(event, {
      expectedVersion: input.expectedVersion,
    });

    // Q.auto: dispara impressao automatica pos-classificacao. Best-effort —
    // se requestQrPrint falhar (Print Agent offline, PrintJob PENDING duplicado,
    // 503 do banco), a classificacao ja foi commitada e nao deve falhar pelo
    // print. A secao Etiqueta na detail page tem botao "Imprimir novamente"
    // pra retry manual. Idempotency derivada do `event.idempotencyKey` da
    // classificacao garante 1 print por classificacao mesmo em retry — se
    // appendEvent retornou idempotent (duplo-clique), result.event mantem o
    // mesmo idempotencyKey, e o print key derivado tambem dedupa.
    try {
      await this.requestQrPrint(
        {
          sampleId: sample.id,
          idempotencyKey: `${result.event.idempotencyKey}:auto-print`,
        },
        actor
      );
    } catch (cause) {
      console.error('[Q.auto] auto-print pos-classificacao falhou', {
        sampleId: sample.id,
        eventId: result.event.eventId,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }

    return result;
  }

  async updateRegistration(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'update registration');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, REGISTRATION_UPDATE_ALLOWED_STATUSES, 'update registration');
    const reasonCode =
      typeof input.reasonCode === 'string' && input.reasonCode.trim().length > 0
        ? normalizeUpdateReasonCode(input.reasonCode)
        : DEFAULT_REGISTRATION_UPDATE_REASON_CODE;
    const hasReasonText =
      typeof input.reasonText === 'string' && input.reasonText.trim().length > 0;
    if (reasonCode === 'OTHER' && !hasReasonText) {
      throw new HttpError(422, 'reasonText is required when reasonCode is OTHER');
    }
    const reasonText = hasReasonText
      ? normalizeUpdateReasonText(input.reasonText)
      : DEFAULT_REGISTRATION_UPDATE_REASON_TEXT;
    const parsedPatch = parseRegistrationUpdatePatch(input.after ?? input.changes ?? {});
    const ownerBinding = await resolveStructuredOwnerForWrite({
      sample,
      inputOwnerClientId: parsedPatch.ownerClientId,
      inputOwnerUnitId: parsedPatch.ownerUnitId,
      hasOwnerClientId: parsedPatch.hasOwnerClientId === true,
      hasOwnerUnitId: parsedPatch.hasOwnerUnitId === true,
      clientService: this.clientService,
      mode: 'update',
    });
    const effectivePatch = {
      ...parsedPatch,
      resolvedOwnerBinding: ownerBinding,
    };
    const updatePayload = buildRegistrationUpdatePayload(sample, effectivePatch);
    if (!updatePayload) {
      throw new HttpError(409, 'No registration changes detected');
    }

    const nextDeclaredSacks =
      updatePayload.after?.declared &&
      Object.prototype.hasOwnProperty.call(updatePayload.after.declared, 'sacks')
        ? updatePayload.after.declared.sacks
        : null;
    if (typeof nextDeclaredSacks === 'number') {
      const currentCommercial = readCurrentCommercialSummary(sample);
      const usedSacks = currentCommercial.soldSacks + currentCommercial.lostSacks;
      if (nextDeclaredSacks < usedSacks) {
        const parts = [];
        if (currentCommercial.soldSacks > 0)
          parts.push(
            `${currentCommercial.soldSacks} vendida${currentCommercial.soldSacks === 1 ? '' : 's'}`
          );
        if (currentCommercial.lostSacks > 0)
          parts.push(
            `${currentCommercial.lostSacks} perdida${currentCommercial.lostSacks === 1 ? '' : 's'}`
          );
        throw new HttpError(
          409,
          `Nao e possivel reduzir para ${nextDeclaredSacks} sacas. Ja existem ${parts.join(' e ')} registradas. O minimo permitido e ${usedSacks}.`
        );
      }
      const projection = buildCommercialProjection({
        declaredSacks: nextDeclaredSacks,
        soldSacks: currentCommercial.soldSacks,
        lostSacks: currentCommercial.lostSacks,
      });
      updatePayload.after.soldSacks = projection.soldSacks;
      updatePayload.after.lostSacks = projection.lostSacks;
      updatePayload.after.commercialStatus = projection.commercialStatus;

      if (sample.soldSacks === projection.soldSacks) {
        delete updatePayload.after.soldSacks;
      }
      if (sample.lostSacks === projection.lostSacks) {
        delete updatePayload.after.lostSacks;
      }
      if (sample.commercialStatus === projection.commercialStatus) {
        delete updatePayload.after.commercialStatus;
      }
    }

    // Liga: safra reativa. Monta o evento de edicao do lote com eventId
    // explicito (raiz da cadeia de causation). Quando a edicao muda a safra e o
    // lote e origem de ligas ativas, recalcula a safra das ligas ancestrais
    // (recursivo) e emite tudo num appendEventBatch atomico.
    const editedEventId = randomUUID();
    const editedEvent = buildEventEnvelope({
      eventType: 'REGISTRATION_UPDATED',
      sampleId: sample.id,
      payload: {
        before: updatePayload.before,
        after: updatePayload.after,
        reasonCode,
        reasonText,
      },
      fromStatus: null,
      toStatus: null,
      module: 'registration',
      actorContext: actor,
      eventId: editedEventId,
    });

    const harvestChanged =
      updatePayload.after?.declared &&
      Object.prototype.hasOwnProperty.call(updatePayload.after.declared, 'harvest');
    const ownerChanged = Object.prototype.hasOwnProperty.call(
      updatePayload.after ?? {},
      'ownerClientId'
    );

    if (harvestChanged || ownerChanged) {
      // Liga: propagacao reativa unificada (safra E/OU proprietario). Semeia o
      // estado com o valor NOVO do campo que mudou e o valor ATUAL do que NAO
      // mudou — senao a liga recalcularia o outro campo errado.
      const propagation = await this._buildBlendPropagation({
        editedSampleId: sample.id,
        newHarvest: harvestChanged
          ? updatePayload.after.declared.harvest
          : (sample.declared?.harvest ?? null),
        newOwnerClientId: ownerChanged ? updatePayload.after.ownerClientId : sample.ownerClientId,
        newDeclaredOwner: ownerChanged
          ? (updatePayload.after.declared?.owner ?? null)
          : (sample.declared?.owner ?? null),
        actor,
        causationEventId: editedEventId,
      });

      if (propagation.affectedBlends.length > 0) {
        // Avisar-e-confirmar (Liga): sem confirmacao explicita, devolve 409 com
        // a lista de ligas afetadas pra UI confirmar antes de aplicar.
        if (input.confirmHarvestPropagation !== true) {
          throw new HttpError(
            409,
            `Esta edicao altera ${propagation.affectedBlends.length} liga(s).`,
            {
              code: 'BLEND_HARVEST_PROPAGATION_REQUIRED',
              affectedBlends: propagation.affectedBlends,
            }
          );
        }

        // Confirmado: evento do lote (raiz) + recalculos das ligas num unico
        // batch atomico. Conflito de versao em qualquer liga reverte tudo.
        const results = await this.eventService.appendEventBatch(
          [editedEvent, ...propagation.drafts],
          [{ expectedVersion: input.expectedVersion }, ...propagation.optionsByIndex]
        );
        return results[0];
      }
    }

    return this.eventService.appendEvent(editedEvent, {
      expectedVersion: input.expectedVersion,
    });
  }

  // Liga: monta os eventos de recalculo das ligas ancestrais de um lote cuja
  // SAFRA e/ou PROPRIETARIO foi editado. Sobe a arvore (loadAncestorBlendTree),
  // deduplica diamantes por sampleId (mantendo o maior depth) e recalcula safra
  // (deriveBlendHarvest) e owner (deriveBlendOwner — unanimidade) de cada liga em
  // ordem topologica (depth ASC), com um Map de estado {harvest, ownerClientId,
  // declaredOwner} — liga-de-liga le o valor JA recalculado da filha. Emite UM
  // REGISTRATION_UPDATED por liga cujo valor muda (no-op = safra E owner
  // inalterados; o Map recebe o estado recalculado SEMPRE, mesmo no no-op, pra
  // ligas acima lerem certo). Owner comparado por id. before/after montados
  // condicionalmente (so os campos que mudam). Retorna drafts + optionsByIndex +
  // affectedBlends.
  //
  // A arvore e carregada fora da tx do batch — confia no expectedVersion por
  // liga (igual _createBlendCascadeMovement): escrita concorrente vira conflito
  // de versao no batch (409) e o cliente re-tenta.
  async _buildBlendPropagation({
    editedSampleId,
    newHarvest,
    newOwnerClientId,
    newDeclaredOwner,
    actor,
    causationEventId,
  }) {
    const tree = await this.queryService.loadAncestorBlendTree(editedSampleId);
    if (tree.length === 0) {
      return { affectedBlends: [], drafts: [], optionsByIndex: [] };
    }

    // Dedup por sampleId mantendo o maior depth (topologia em diamante gera
    // varias linhas pra mesma liga). Processar no maior depth garante que todas
    // as ligas-filhas ja entraram no Map antes desta liga ser recalculada.
    const byId = new Map();
    for (const node of tree) {
      const existing = byId.get(node.sampleId);
      if (!existing || node.depth > existing.depth) {
        byId.set(node.sampleId, node);
      }
    }
    const blends = Array.from(byId.values()).sort((a, b) => a.depth - b.depth);

    const originsByBlend = await this.queryService.loadDirectOriginsForBlends(
      blends.map((blend) => blend.sampleId)
    );

    // Estado por sampleId: {harvest, ownerClientId, declaredOwner}. Seed com o
    // lote editado (valor novo do campo mudado + atual do nao-mudado).
    const stateBySampleId = new Map([
      [
        editedSampleId,
        { harvest: newHarvest, ownerClientId: newOwnerClientId, declaredOwner: newDeclaredOwner },
      ],
    ]);
    const affectedBlends = [];
    const drafts = [];
    const optionsByIndex = [];

    for (const blend of blends) {
      const origins = originsByBlend.get(blend.sampleId) ?? [];

      const recalcHarvest = deriveBlendHarvest(
        origins.map(
          (origin) => stateBySampleId.get(origin.originId)?.harvest ?? origin.declaredHarvest
        )
      );
      const recalcOwner = deriveBlendOwner(
        origins.map((origin) => {
          const state = stateBySampleId.get(origin.originId);
          return state
            ? { ownerClientId: state.ownerClientId, declaredOwner: state.declaredOwner }
            : { ownerClientId: origin.ownerClientId, declaredOwner: origin.declaredOwner };
        })
      );

      // Registra SEMPRE (mesmo no no-op) pra ligas ancestrais lerem o valor certo.
      stateBySampleId.set(blend.sampleId, {
        harvest: recalcHarvest,
        ownerClientId: recalcOwner.ownerClientId,
        declaredOwner: recalcOwner.declaredOwner,
      });

      const harvestChanged = recalcHarvest !== blend.declaredHarvest;
      const ownerChanged = recalcOwner.ownerClientId !== blend.ownerClientId;
      // No-op: nem safra nem owner mudam -> nao emite evento.
      if (!harvestChanged && !ownerChanged) {
        continue;
      }

      // before/after so com os campos que mudam (schema exige minProperties:1;
      // owner em after.ownerClientId top-level + after.declared.owner — formato
      // que o projetor ja entende).
      const before = { declared: {} };
      const after = { declared: {} };
      if (harvestChanged) {
        before.declared.harvest = blend.declaredHarvest;
        after.declared.harvest = recalcHarvest;
      }
      if (ownerChanged) {
        before.ownerClientId = blend.ownerClientId;
        after.ownerClientId = recalcOwner.ownerClientId;
        before.declared.owner = blend.declaredOwner;
        after.declared.owner = recalcOwner.declaredOwner;
      }

      affectedBlends.push({
        sampleId: blend.sampleId,
        lotNumber: blend.internalLotNumber,
        status: blend.status,
        commercialStatus: blend.commercialStatus,
        soldSacks: blend.soldSacks,
        lostSacks: blend.lostSacks,
        currentHarvest: blend.declaredHarvest,
        newHarvest: recalcHarvest,
        currentOwner: blend.declaredOwner,
        newOwner: recalcOwner.declaredOwner,
      });

      drafts.push(
        buildEventEnvelope({
          eventType: 'REGISTRATION_UPDATED',
          sampleId: blend.sampleId,
          payload: {
            before,
            after,
            reasonCode: 'DATA_FIX',
            reasonText: BLEND_PROPAGATION_REASON_TEXT,
          },
          fromStatus: null,
          toStatus: null,
          module: 'registration',
          actorContext: actor,
          causationId: causationEventId,
        })
      );
      optionsByIndex.push({ expectedVersion: blend.version });
    }

    return { affectedBlends, drafts, optionsByIndex };
  }

  async updateClassification(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'update classification');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, CLASSIFICATION_UPDATE_ALLOWED_STATUSES, 'update classification');
    const reasonCode =
      typeof input.reasonCode === 'string' && input.reasonCode.trim().length > 0
        ? normalizeUpdateReasonCode(input.reasonCode)
        : 'DATA_FIX';
    const hasReasonText =
      typeof input.reasonText === 'string' && input.reasonText.trim().length > 0;
    const reasonText = hasReasonText
      ? normalizeUpdateReasonText(input.reasonText)
      : 'Atualizacao de classificacao';
    const rawAfter = input.after ?? input.changes ?? {};

    // Q.cls.2.7: tipo-only update — operador pode editar SO o tipo na
    // detail page sem mexer em campos da classificacao. Detecta antes
    // de parsear o patch.
    const newType = input.classificationType ?? null;
    const oldType = sample.classificationType ?? null;
    const typeChanged = newType !== oldType;

    const afterEmpty = !isPlainObject(rawAfter) || Object.keys(rawAfter).length === 0;

    let updatePayload;
    if (afterEmpty) {
      // Sem campos no after: so aceita se o tipo mudou.
      if (!typeChanged) {
        throw new HttpError(409, 'No classification changes detected');
      }
      updatePayload = { before: {}, after: {} };
    } else {
      // Normaliza classifiers antes de parsear o patch, pois e async
      // (precisa buscar usuarios). O parser sync so valida o shape top-level.
      let normalizedAfter = rawAfter;
      if (isPlainObject(rawAfter) && hasOwn(rawAfter, 'classifiers')) {
        const normalized = await this.normalizeClassifiers(rawAfter.classifiers);
        normalizedAfter = { ...rawAfter, classifiers: normalized };
      }
      const parsedPatch = parseClassificationUpdatePatch(normalizedAfter);
      const fieldsPayload = buildClassificationUpdatePayload(sample, parsedPatch);
      if (!fieldsPayload) {
        if (!typeChanged) {
          throw new HttpError(409, 'No classification changes detected');
        }
        updatePayload = { before: {}, after: {} };
      } else {
        updatePayload = fieldsPayload;
      }
    }

    // Inclui classificationType em before/after pra audit completo + pra
    // satisfazer o schema do evento (before/after exigem minProperties:1).
    if (typeChanged) {
      updatePayload.before.classificationType = oldType;
      updatePayload.after.classificationType = newType;
    }

    const updateEventPayload = {
      before: updatePayload.before,
      after: updatePayload.after,
      reasonCode,
      reasonText,
    };
    if (input.classificationType) {
      updateEventPayload.classificationType = input.classificationType;
    }

    const event = buildEventEnvelope({
      eventType: 'CLASSIFICATION_UPDATED',
      sampleId: sample.id,
      payload: updateEventPayload,
      fromStatus: null,
      toStatus: null,
      module: 'classification',
      actorContext: actor,
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }

  async createSampleMovement(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'create sample movement');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    if (sample.status === 'INVALIDATED') {
      throw new HttpError(
        409,
        `Sample ${sample.id} is INVALIDATED and cannot receive commercial movements`
      );
    }
    if (!COMMERCIAL_MUTABLE_OPERATIONAL_STATUSES.has(sample.status)) {
      throw new HttpError(
        409,
        `Sample ${sample.id} must have confirmed registration to create commercial movements`
      );
    }

    const { declaredSacks, soldSacks, lostSacks } = readCurrentCommercialSummary(sample);
    if (declaredSacks === null) {
      throw new HttpError(
        409,
        `Sample ${sample.id} does not have declared sacks to support commercial movements`
      );
    }

    const movementType = normalizeMovementType(input.movementType);
    const movementDate = normalizeMovementDate(input.movementDate);
    const notes = normalizeMovementNotes(input.notes, 'notes');

    let buyerBinding = null;
    let lossReasonText = null;
    if (movementType === MOVEMENT_TYPES.SALE) {
      const buyerClientId = normalizeNullableUuid(input.buyerClientId, 'buyerClientId');
      const buyerUnitId = normalizeNullableUuid(input.buyerUnitId, 'buyerUnitId');
      if (!buyerClientId) {
        throw new HttpError(422, 'buyerClientId is required for SALE');
      }
      buyerBinding = await resolveBuyerBindingForMovement({
        clientService: this.clientService,
        buyerClientId,
        buyerUnitId: buyerUnitId ?? null,
      });
      if (input.lossReasonText !== undefined && input.lossReasonText !== null) {
        throw new HttpError(422, 'lossReasonText is not allowed for SALE');
      }
    } else {
      if (input.buyerClientId !== undefined && input.buyerClientId !== null) {
        throw new HttpError(422, 'buyerClientId is not allowed for LOSS');
      }
      if (input.buyerUnitId !== undefined && input.buyerUnitId !== null) {
        throw new HttpError(422, 'buyerUnitId is not allowed for LOSS');
      }
      lossReasonText = normalizeLossReasonText(input.lossReasonText);
    }

    // Liga A2.4 (Liga F7.1 + F7.4 + F7.5 + F7.6 + T0.D): venda/perda de liga
    // dispara cascata recursiva. Caminho de Sample normal (isBlend=false)
    // permanece intocado abaixo.
    if (sample.isBlend) {
      const cascadeResult = await this._createBlendCascadeMovement({
        rootSample: sample,
        movementType,
        movementDate,
        notes,
        buyerBinding,
        lossReasonText,
        actor,
        rootExpectedVersion: input.expectedVersion,
        rootIdempotencyKey: input.idempotencyKey ?? randomUUID(),
      });
      // Notifica so a RAIZ da cascata (result.event e o evento da liga).
      await this._notifyMovementCreated(cascadeResult, sample, actor);
      return cascadeResult;
    }

    const quantitySacks = normalizeMovementQuantity(input.quantitySacks);

    const projection = buildCommercialProjection({
      declaredSacks,
      soldSacks: soldSacks + (movementType === MOVEMENT_TYPES.SALE ? quantitySacks : 0),
      lostSacks: lostSacks + (movementType === MOVEMENT_TYPES.LOSS ? quantitySacks : 0),
    });

    const movementId = randomUUID();
    const payload = {
      movementId,
      movementType,
      status: MOVEMENT_STATUSES.ACTIVE,
      quantitySacks,
      movementDate,
      notes,
      ...(movementType === MOVEMENT_TYPES.SALE ? buildBuyerSnapshot(buyerBinding) : {}),
      ...(movementType === MOVEMENT_TYPES.LOSS ? { lossReasonText } : {}),
      soldSacks: projection.soldSacks,
      lostSacks: projection.lostSacks,
      availableSacks: projection.availableSacks,
      commercialStatus: projection.commercialStatus,
    };

    const event = buildEventEnvelope({
      eventType: movementType === MOVEMENT_TYPES.SALE ? 'SALE_CREATED' : 'LOSS_RECORDED',
      sampleId: sample.id,
      payload,
      fromStatus: null,
      toStatus: null,
      module: 'commercial',
      actorContext: actor,
    });

    const result = await this.eventService.appendEvent(event, {
      expectedVersion: input.expectedVersion,
    });
    await this._notifyMovementCreated(result, sample, actor);
    return result;
  }

  // Side-effect fire-and-forget (padrao Q.auto): notifica os ADMINs sobre a
  // venda/perda registrada. Guard de replay: appendEvent devolve
  // idempotent=true quando a idempotencyKey ja existia — replay nao
  // re-notifica. Le os dados do result.event.payload (uniforme entre o
  // caminho normal e a raiz da cascata de liga). Nunca quebra o request.
  async _notifyMovementCreated(result, sample, actor) {
    if (!this.pushService || !result?.event || result.idempotent) {
      return;
    }

    try {
      const payload = result.event.payload ?? {};
      const isSale = payload.movementType === MOVEMENT_TYPES.SALE;
      const lot = sample.internalLotNumber ?? 'sem lote';
      const sacks = payload.quantitySacks;
      const buyerName = payload.buyerClientSnapshot?.displayName ?? null;

      await this.pushService.sendToRoles(
        ['ADMIN'],
        {
          title: isSale ? 'Venda registrada' : 'Perda registrada',
          body:
            isSale && buyerName
              ? `${sacks} sacas do lote ${lot} — ${buyerName}.`
              : `${sacks} sacas do lote ${lot}.`,
          url: `/samples/${sample.id}`,
          tag: `movement-${payload.movementId ?? result.event.eventId ?? 'new'}`,
        },
        { excludeUserId: actor?.actorUserId ?? null }
      );
    } catch (cause) {
      console.error('[push] falha ao notificar movimentacao', {
        sampleId: sample.id,
        message: cause?.message ?? 'unknown',
      });
    }
  }

  // Liga A2.4 (Liga F7.1 + F7.4 + F7.5 recursivo + F7.6 + F7.7 + T0.D):
  // Cascata de venda/perda quando o sample raiz é uma liga.
  //
  // - F7.1: venda da liga = 100% das sacas (quantitySacks input ignorado;
  //   forçado a availableSacks da raiz).
  // - F7.6 hard block recursivo QUANTITATIVO: um descendente bloqueia
  //   a cascata quando o saldo disponível dele (declared - sold - lost)
  //   é menor que a contribuição exigida pela liga. Venda/perda parcial
  //   anterior que ainda deixe saldo suficiente NÃO bloqueia.
  // - F7.5 cascata recursiva (T0.D): emite SALE_CREATED/LOSS_RECORDED
  //   em CADA descendente da árvore via loadBlendTree. quantitySacks
  //   no descendente = contributedSacks do pai imediato (F7.7 garante
  //   1:1 quando origem é liga).
  // - F7.4: buyerClientSnapshot/lossReasonText replicado em todos os
  //   eventos (filtros financeiros funcionam por sample.ownerClientId
  //   via JOIN — F3.A).
  // - causationId encadeado: cada filho aponta pro evento do pai
  //   imediato.
  // - appendEventBatch (A2.0): tudo numa única transação atômica.
  async _createBlendCascadeMovement({
    rootSample,
    movementType,
    movementDate,
    notes,
    buyerBinding,
    lossReasonText,
    actor,
    rootExpectedVersion,
    rootIdempotencyKey,
  }) {
    const tree = await this.queryService.loadBlendTree(rootSample.id);

    // F7.6 hard block QUANTITATIVO: um descendente bloqueia a cascata
    // quando seu saldo disponível (declared - sold - lost) é menor que
    // a contribuição exigida. Venda/perda parcial anterior que ainda
    // deixe saldo suficiente não bloqueia.
    const blockedDescendants = tree
      .filter((node) => node.sampleId !== rootSample.id)
      .filter((node) => {
        const available = (node.declaredSacks ?? 0) - node.soldSacks - node.lostSacks;
        return available < node.contributedSacks;
      });
    if (blockedDescendants.length > 0) {
      throw new HttpError(
        409,
        `Cannot complete cascade: ${blockedDescendants.length} descendant(s) lack sufficient balance.`,
        {
          code: 'BLEND_HAS_BLOCKED_DESCENDANTS',
          blockedDescendants: blockedDescendants.map((node) => ({
            sampleId: node.sampleId,
            lotNumber: node.internalLotNumber,
            contributedSacks: node.contributedSacks,
            availableSacks: (node.declaredSacks ?? 0) - node.soldSacks - node.lostSacks,
          })),
        }
      );
    }

    // Sanity check: nenhum nó pode estar INVALIDATED (deveria ser
    // bloqueado pela cascata anterior, mas guarda defensiva).
    for (const node of tree) {
      if (node.status === 'INVALIDATED') {
        throw new HttpError(
          409,
          `Tree node ${node.sampleId} (lot ${node.internalLotNumber}) is INVALIDATED`
        );
      }
    }

    // Pré-order traversal: tree vem ORDER BY depth ASC, sampleId ASC
    // — parent sempre antes do filho (atende causation chain).
    const eventIdBySampleId = new Map();
    const drafts = [];
    const optionsByIndex = [];

    const eventType = movementType === MOVEMENT_TYPES.SALE ? 'SALE_CREATED' : 'LOSS_RECORDED';
    const idempotencyScope = 'COMMERCIAL_STATUS_UPDATE';

    for (const node of tree) {
      const isRoot = node.sampleId === rootSample.id;
      const eventId = randomUUID();
      eventIdBySampleId.set(node.sampleId, eventId);

      // Pra raiz (a liga sendo vendida): 100% do disponivel (F7.1).
      // Pra descendente: contribuicao direta do pai imediato (que e
      // 100% do declaredSacks quando origem e liga — F7.7).
      const declaredSacks = node.declaredSacks ?? 0;
      const availableSacks = declaredSacks - node.soldSacks - node.lostSacks;
      const quantitySacks = isRoot ? availableSacks : node.contributedSacks;

      if (quantitySacks <= 0) {
        throw new HttpError(
          422,
          `Cascade computed quantitySacks=${quantitySacks} for sample ${node.sampleId} — cannot proceed`
        );
      }

      const projection = buildCommercialProjection({
        declaredSacks,
        soldSacks: node.soldSacks + (movementType === MOVEMENT_TYPES.SALE ? quantitySacks : 0),
        lostSacks: node.lostSacks + (movementType === MOVEMENT_TYPES.LOSS ? quantitySacks : 0),
      });

      const payload = {
        movementId: randomUUID(),
        movementType,
        status: MOVEMENT_STATUSES.ACTIVE,
        quantitySacks,
        movementDate,
        notes,
        ...(movementType === MOVEMENT_TYPES.SALE ? buildBuyerSnapshot(buyerBinding) : {}),
        ...(movementType === MOVEMENT_TYPES.LOSS ? { lossReasonText } : {}),
        soldSacks: projection.soldSacks,
        lostSacks: projection.lostSacks,
        availableSacks: projection.availableSacks,
        commercialStatus: projection.commercialStatus,
      };

      // causationId: raiz tem null (e o evento "pai" do trace);
      // filhos apontam pro evento do parentBlendId imediato.
      const causationId = isRoot ? null : eventIdBySampleId.get(node.parentBlendId);

      // Idempotency: raiz usa key fornecida pelo input; cascata deriva
      // chave deterministica a partir da raiz + sampleId do descendente,
      // pra retry da operacao raiz dedup tambem nos descendentes.
      const idempotencyKey = isRoot
        ? rootIdempotencyKey
        : buildDeterministicUuid(`${rootIdempotencyKey}::cascade::${node.sampleId}`);

      const draft = buildEventEnvelope({
        eventType,
        sampleId: node.sampleId,
        payload,
        fromStatus: null,
        toStatus: null,
        module: 'commercial',
        actorContext: actor,
        eventId,
        causationId,
        idempotencyScope,
        idempotencyKey,
      });

      drafts.push(draft);
      optionsByIndex.push({
        expectedVersion: isRoot ? rootExpectedVersion : node.version,
      });
    }

    const results = await this.eventService.appendEventBatch(drafts, optionsByIndex);

    // Retorno coerente com appendEvent (raiz primeiro) + events da
    // arvore inteira pra audit/observability.
    return {
      statusCode: 201,
      idempotent: false,
      event: results[0].event,
      events: results.map((r) => r.event),
      sample: results[0].sample,
    };
  }

  // Liga B4 Fase 3: cascata reversa de cancelamento. Cancelar a venda/perda de
  // uma liga tem que emitir SALE_CANCELLED/LOSS_CANCELLED na raiz E em cada
  // descendente — senão as origens ficariam vendidas com a liga reaberta.
  //
  // - Resolve a cascata via loadBlendCascadeMovements (percorre causationId).
  // - Hard guard: se algum movimento da cascata já não está ACTIVE, recusa a
  //   operação inteira (409) — não cancela pela metade.
  // - Projeção por nó: subtrai SÓ a quantidade deste movimento do soldSacks/
  //   lostSacks atual — nunca zera, preservando vendas/perdas independentes
  //   posteriores nas origens.
  // - causationId espelha a criação (raiz null; descendente aponta pro evento
  //   de cancelamento do pai imediato).
  // - appendEventBatch: tudo numa transação atômica única.
  async _cancelBlendCascadeMovement({
    rootSample,
    rootMovement,
    reasonText,
    rootExpectedVersion,
    actor,
  }) {
    const normalizedReason = normalizeRequiredText(reasonText, 'reasonText', 500);
    const cascade = await this.queryService.loadBlendCascadeMovements(
      rootSample.id,
      rootMovement.id
    );

    if (cascade.length === 0) {
      throw new HttpError(409, `Cascade for movement ${rootMovement.id} could not be resolved`);
    }

    // Guard: todo movimento da cascata precisa estar ACTIVE — se algum já foi
    // cancelado/editado isolado, não dá pra reverter a cascata coerentemente.
    const notActive = cascade.filter((node) => node.movementStatus !== MOVEMENT_STATUSES.ACTIVE);
    if (notActive.length > 0) {
      throw new HttpError(
        409,
        `Cannot cancel cascade: ${notActive.length} movement(s) in the cascade are no longer active.`,
        {
          code: 'BLEND_CASCADE_NOT_CANCELLABLE',
          movements: notActive.map((node) => ({
            sampleId: node.sampleId,
            lotNumber: node.internalLotNumber,
            movementId: node.movementId,
            movementStatus: node.movementStatus,
          })),
        }
      );
    }

    // Mapa creationEventId -> sampleId, pra derivar o pai imediato de cada
    // nó e espelhar a causationId nos eventos de cancelamento.
    const sampleIdByCreationEventId = new Map(
      cascade.map((node) => [node.creationEventId, node.sampleId])
    );

    const cancelEventIdBySampleId = new Map();
    const drafts = [];
    const optionsByIndex = [];

    for (const node of cascade) {
      const isRoot = node.sampleId === rootSample.id;
      const cancelEventId = randomUUID();
      cancelEventIdBySampleId.set(node.sampleId, cancelEventId);

      const isSale = node.movementType === MOVEMENT_TYPES.SALE;
      const projection = buildCommercialProjection({
        declaredSacks: node.declaredSacks ?? 0,
        soldSacks: node.soldSacks - (isSale ? node.quantitySacks : 0),
        lostSacks: node.lostSacks - (isSale ? 0 : node.quantitySacks),
      });

      const payload = {
        movementId: node.movementId,
        movementType: node.movementType,
        reasonText: normalizedReason,
        soldSacks: projection.soldSacks,
        lostSacks: projection.lostSacks,
        availableSacks: projection.availableSacks,
        commercialStatus: projection.commercialStatus,
      };

      // causationId: raiz null; descendente aponta pro evento de cancelamento
      // do pai imediato (parentBlendId derivado via creationEventId).
      const parentSampleId = isRoot ? null : sampleIdByCreationEventId.get(node.causationId);
      const causationId = isRoot ? null : cancelEventIdBySampleId.get(parentSampleId);

      const draft = buildEventEnvelope({
        eventType: isSale ? 'SALE_CANCELLED' : 'LOSS_CANCELLED',
        sampleId: node.sampleId,
        payload,
        fromStatus: null,
        toStatus: null,
        module: 'commercial',
        actorContext: actor,
        eventId: cancelEventId,
        causationId,
      });

      drafts.push(draft);
      optionsByIndex.push({
        expectedVersion: isRoot ? rootExpectedVersion : node.version,
      });
    }

    const results = await this.eventService.appendEventBatch(drafts, optionsByIndex);

    return {
      statusCode: 201,
      idempotent: false,
      event: results[0].event,
      events: results.map((r) => r.event),
      sample: results[0].sample,
    };
  }

  // Liga B4 Fase 4: guard — um movimento criado pela cascata de uma liga
  // (evento criador com causationId não-nulo) não pode ser cancelado nem
  // editado isoladamente; só via o movimento da liga raiz. Senão a árvore
  // ficaria incoerente (origem mexida, liga intacta).
  async _assertMovementNotCascaded(sampleId, movementId) {
    const creationEvent = await this.queryService.loadMovementCreationEvent(sampleId, movementId);
    if (creationEvent && creationEvent.causationId) {
      throw new HttpError(
        409,
        `Movement ${movementId} was created by a liga cascade — cancel or edit it through the liga, not directly.`,
        { code: 'BLEND_CASCADED_MOVEMENT' }
      );
    }
  }

  // Liga B4 Fase 4: cascata de update. Editar a venda/perda de uma liga
  // (comprador, data, observações, motivo da perda) re-cascateia a mudança
  // pra raiz E todos os descendentes — esses campos são uniformes na cascata.
  // Quantidade e tipo NÃO são editáveis numa liga (a quantidade é estrutural
  // — 100%/contribuição; o tipo definiria a cascata inteira).
  async _updateBlendCascadeMovement({
    rootSample,
    rootMovement,
    patch,
    reasonText,
    rootExpectedVersion,
    actor,
  }) {
    if (patch.quantitySacks !== undefined) {
      throw new HttpError(422, 'quantitySacks não pode ser editado num movimento de liga (F7.1).');
    }
    if (patch.movementType !== undefined && patch.movementType !== rootMovement.movementType) {
      throw new HttpError(422, 'movementType não pode ser trocado num movimento de liga.');
    }

    const isSale = rootMovement.movementType === MOVEMENT_TYPES.SALE;
    if (isSale && patch.lossReasonText !== undefined) {
      throw new HttpError(422, 'lossReasonText is not allowed for SALE');
    }
    if (!isSale && (patch.buyerClientId !== undefined || patch.buyerUnitId !== undefined)) {
      throw new HttpError(422, 'buyerClientId/buyerUnitId is not allowed for LOSS');
    }

    const normalizedReason = normalizeRequiredText(reasonText, 'reasonText', 500);

    const cascade = await this.queryService.loadBlendCascadeMovements(
      rootSample.id,
      rootMovement.id
    );
    if (cascade.length === 0) {
      throw new HttpError(409, `Cascade for movement ${rootMovement.id} could not be resolved`);
    }
    const notActive = cascade.filter((node) => node.movementStatus !== MOVEMENT_STATUSES.ACTIVE);
    if (notActive.length > 0) {
      throw new HttpError(
        409,
        `Cannot edit cascade: ${notActive.length} movement(s) in the cascade are no longer active.`,
        {
          code: 'BLEND_CASCADE_NOT_EDITABLE',
          movements: notActive.map((node) => ({
            sampleId: node.sampleId,
            lotNumber: node.internalLotNumber,
            movementId: node.movementId,
            movementStatus: node.movementStatus,
          })),
        }
      );
    }

    // Campos uniformes da cascata que estão mudando — resolvidos UMA vez,
    // valem igual pra raiz e todos os descendentes.
    const changes = {};
    if (patch.movementDate !== undefined) {
      changes.movementDate = patch.movementDate;
    }
    if (patch.notes !== undefined) {
      changes.notes = patch.notes;
    }
    if (!isSale && patch.lossReasonText !== undefined) {
      changes.lossReasonText = patch.lossReasonText;
    }
    if (isSale && (patch.buyerClientId !== undefined || patch.buyerUnitId !== undefined)) {
      const nextClientId =
        patch.buyerClientId !== undefined ? patch.buyerClientId : rootMovement.buyerClientId;
      if (!nextClientId) {
        throw new HttpError(422, 'buyerClientId is required for SALE');
      }
      // Unidade do comprador descontinuada: resolve so o cliente. Cliente
      // inalterado preserva a unidade/snapshot historicos; cliente novo zera.
      const buyerClientChanged = nextClientId !== rootMovement.buyerClientId;
      const buyerBinding = await resolveBuyerBindingForMovement({
        clientService: this.clientService,
        buyerClientId: nextClientId,
      });
      changes.buyerClientId = buyerBinding.buyerClientId;
      changes.buyerClientSnapshot = buyerBinding.buyerClient ?? null;
      changes.buyerUnitId = buyerClientChanged ? null : (rootMovement.buyerUnitId ?? null);
      changes.buyerUnitSnapshot = buyerClientChanged
        ? null
        : (rootMovement.buyerUnitSnapshot ?? null);
    }

    if (Object.keys(changes).length === 0) {
      throw new HttpError(422, 'after must include at least one editable movement field');
    }

    // Carrega o movimento completo de cada nó (pra montar before/after).
    const movementBySampleId = new Map();
    for (const node of cascade) {
      movementBySampleId.set(
        node.sampleId,
        await this.queryService.requireSampleMovement(node.sampleId, node.movementId)
      );
    }

    // No-op? A cascata é uniforme — basta checar a raiz: se a raiz não muda,
    // nenhum descendente muda.
    const rootBefore = formatMovementSnapshot(movementBySampleId.get(rootSample.id));
    if (valuesEqual(rootBefore, { ...rootBefore, ...changes })) {
      throw new HttpError(409, 'No movement changes detected');
    }

    const sampleIdByCreationEventId = new Map(
      cascade.map((node) => [node.creationEventId, node.sampleId])
    );
    const updateEventIdBySampleId = new Map();
    const drafts = [];
    const optionsByIndex = [];

    for (const node of cascade) {
      const isRoot = node.sampleId === rootSample.id;
      const updateEventId = randomUUID();
      updateEventIdBySampleId.set(node.sampleId, updateEventId);

      const beforeSnapshot = formatMovementSnapshot(movementBySampleId.get(node.sampleId));
      const afterSnapshot = { ...beforeSnapshot, ...changes };

      // Quantidade não muda numa edição de liga -> saldos inalterados.
      const projection = buildCommercialProjection({
        declaredSacks: node.declaredSacks ?? 0,
        soldSacks: node.soldSacks,
        lostSacks: node.lostSacks,
      });

      const payload = {
        movementId: node.movementId,
        before: beforeSnapshot,
        after: afterSnapshot,
        reasonText: normalizedReason,
        soldSacks: projection.soldSacks,
        lostSacks: projection.lostSacks,
        availableSacks: projection.availableSacks,
        commercialStatus: projection.commercialStatus,
      };

      const parentSampleId = isRoot ? null : sampleIdByCreationEventId.get(node.causationId);
      const causationId = isRoot ? null : updateEventIdBySampleId.get(parentSampleId);

      const draft = buildEventEnvelope({
        eventType: isSale ? 'SALE_UPDATED' : 'LOSS_UPDATED',
        sampleId: node.sampleId,
        payload,
        fromStatus: null,
        toStatus: null,
        module: 'commercial',
        actorContext: actor,
        eventId: updateEventId,
        causationId,
      });

      drafts.push(draft);
      optionsByIndex.push({
        expectedVersion: isRoot ? rootExpectedVersion : node.version,
      });
    }

    const results = await this.eventService.appendEventBatch(drafts, optionsByIndex);

    return {
      statusCode: 201,
      idempotent: false,
      event: results[0].event,
      events: results.map((r) => r.event),
      sample: results[0].sample,
    };
  }

  async updateSampleMovement(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'update sample movement');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    if (sample.status === 'INVALIDATED') {
      throw new HttpError(
        409,
        `Sample ${sample.id} is INVALIDATED and cannot update commercial movements`
      );
    }
    if (!COMMERCIAL_MUTABLE_OPERATIONAL_STATUSES.has(sample.status)) {
      throw new HttpError(
        409,
        `Sample ${sample.id} must have confirmed registration to update commercial movements`
      );
    }

    const movementId = normalizeRequiredText(input.movementId, 'movementId');
    const movement = await this.queryService.requireSampleMovement(sample.id, movementId);
    if (movement.status !== MOVEMENT_STATUSES.ACTIVE) {
      throw new HttpError(
        409,
        `Movement ${movement.id} is ${movement.status} and cannot be updated`
      );
    }

    // Liga B4 Fase 4: guard — movimento cascateado só via a liga raiz.
    await this._assertMovementNotCascaded(sample.id, movement.id);

    const patch = parseMovementUpdatePatch(input.after ?? input.changes ?? {});

    // Liga B4 Fase 4: editar a venda/perda de uma liga re-cascateia a mudança
    // (comprador/data/obs) pra toda a árvore. Caminho de Sample normal abaixo.
    if (sample.isBlend) {
      return this._updateBlendCascadeMovement({
        rootSample: sample,
        rootMovement: movement,
        patch,
        reasonText: input.reasonText,
        rootExpectedVersion: input.expectedVersion,
        actor,
      });
    }

    const nextMovementType = patch.movementType ?? movement.movementType;
    const nextQuantitySacks = patch.quantitySacks ?? movement.quantitySacks;
    const nextMovementDate = patch.movementDate ?? movement.movementDate;
    const nextNotes = patch.notes !== undefined ? patch.notes : movement.notes;

    let buyerBinding = null;
    let nextBuyerClientId = null;
    let nextBuyerUnitId = null;
    let nextBuyerUnitSnapshot = null;
    let nextLossReasonText = null;

    if (nextMovementType === MOVEMENT_TYPES.SALE) {
      const nextClientId =
        patch.buyerClientId !== undefined ? patch.buyerClientId : movement.buyerClientId;

      if (!nextClientId) {
        throw new HttpError(422, 'buyerClientId is required for SALE');
      }

      // Unidade do comprador descontinuada: o cliente pode ser editado, a
      // unidade nao. Quando o cliente nao muda, preserva a unidade/snapshot
      // historicos do movimento; quando muda (ou virou venda), zera (cliente
      // novo nao tem unidade vinculada).
      const buyerClientChanged =
        movement.movementType !== MOVEMENT_TYPES.SALE || nextClientId !== movement.buyerClientId;

      if (buyerClientChanged) {
        buyerBinding = await resolveBuyerBindingForMovement({
          clientService: this.clientService,
          buyerClientId: nextClientId,
        });
        nextBuyerClientId = buyerBinding.buyerClientId;
        nextBuyerUnitId = null;
        nextBuyerUnitSnapshot = null;
      } else {
        nextBuyerClientId = movement.buyerClientId;
        nextBuyerUnitId = movement.buyerUnitId ?? null;
        nextBuyerUnitSnapshot = movement.buyerUnitSnapshot ?? null;
      }
      nextLossReasonText = null;
    } else {
      if (patch.buyerClientId !== undefined && patch.buyerClientId !== null) {
        throw new HttpError(422, 'buyerClientId is not allowed for LOSS');
      }
      if (patch.buyerUnitId !== undefined && patch.buyerUnitId !== null) {
        throw new HttpError(422, 'buyerUnitId is not allowed for LOSS');
      }
      nextBuyerClientId = null;
      nextBuyerUnitId = null;
      nextLossReasonText =
        patch.lossReasonText !== undefined ? patch.lossReasonText : movement.lossReasonText;
    }

    const beforeSnapshot = formatMovementSnapshot(movement);
    const afterSnapshot = {
      movementType: nextMovementType,
      buyerClientId: nextBuyerClientId,
      buyerUnitId: nextBuyerUnitId,
      quantitySacks: nextQuantitySacks,
      movementDate: nextMovementDate,
      notes: nextNotes ?? null,
      lossReasonText: nextLossReasonText,
      buyerClientSnapshot:
        nextMovementType === MOVEMENT_TYPES.SALE
          ? (buyerBinding?.buyerClient ?? movement.buyerClientSnapshot ?? null)
          : null,
      buyerUnitSnapshot: nextMovementType === MOVEMENT_TYPES.SALE ? nextBuyerUnitSnapshot : null,
      status: movement.status,
    };

    if (valuesEqual(beforeSnapshot, afterSnapshot)) {
      throw new HttpError(409, 'No movement changes detected');
    }

    const { declaredSacks, soldSacks, lostSacks } = readCurrentCommercialSummary(sample);
    if (declaredSacks === null) {
      throw new HttpError(
        409,
        `Sample ${sample.id} does not have declared sacks to support commercial movements`
      );
    }

    const projection = buildCommercialProjection({
      declaredSacks,
      soldSacks:
        soldSacks -
        (movement.movementType === MOVEMENT_TYPES.SALE ? movement.quantitySacks : 0) +
        (nextMovementType === MOVEMENT_TYPES.SALE ? nextQuantitySacks : 0),
      lostSacks:
        lostSacks -
        (movement.movementType === MOVEMENT_TYPES.LOSS ? movement.quantitySacks : 0) +
        (nextMovementType === MOVEMENT_TYPES.LOSS ? nextQuantitySacks : 0),
    });

    const event = buildEventEnvelope({
      eventType: nextMovementType === MOVEMENT_TYPES.SALE ? 'SALE_UPDATED' : 'LOSS_UPDATED',
      sampleId: sample.id,
      payload: {
        movementId: movement.id,
        before: beforeSnapshot,
        after: afterSnapshot,
        reasonText: normalizeRequiredText(input.reasonText, 'reasonText', 500),
        soldSacks: projection.soldSacks,
        lostSacks: projection.lostSacks,
        availableSacks: projection.availableSacks,
        commercialStatus: projection.commercialStatus,
      },
      fromStatus: null,
      toStatus: null,
      module: 'commercial',
      actorContext: actor,
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }

  async cancelSampleMovement(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'cancel sample movement');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    if (sample.status === 'INVALIDATED') {
      throw new HttpError(
        409,
        `Sample ${sample.id} is INVALIDATED and cannot cancel commercial movements`
      );
    }
    if (!COMMERCIAL_MUTABLE_OPERATIONAL_STATUSES.has(sample.status)) {
      throw new HttpError(
        409,
        `Sample ${sample.id} must have confirmed registration to cancel commercial movements`
      );
    }

    const movementId = normalizeRequiredText(input.movementId, 'movementId');
    const movement = await this.queryService.requireSampleMovement(sample.id, movementId);
    if (movement.status !== MOVEMENT_STATUSES.ACTIVE) {
      throw new HttpError(409, `Movement ${movement.id} is already ${movement.status}`);
    }

    // Liga B4 Fase 4: guard — movimento cascateado só via a liga raiz.
    await this._assertMovementNotCascaded(sample.id, movement.id);

    // Liga B4 Fase 3: cancelar a venda/perda de uma liga dispara a cascata
    // reversa em toda a árvore de descendentes. Caminho de Sample normal
    // (isBlend=false) permanece intocado abaixo.
    if (sample.isBlend) {
      return this._cancelBlendCascadeMovement({
        rootSample: sample,
        rootMovement: movement,
        reasonText: input.reasonText,
        rootExpectedVersion: input.expectedVersion,
        actor,
      });
    }

    const { declaredSacks, soldSacks, lostSacks } = readCurrentCommercialSummary(sample);
    if (declaredSacks === null) {
      throw new HttpError(
        409,
        `Sample ${sample.id} does not have declared sacks to support commercial movements`
      );
    }

    const projection = buildCommercialProjection({
      declaredSacks,
      soldSacks:
        soldSacks - (movement.movementType === MOVEMENT_TYPES.SALE ? movement.quantitySacks : 0),
      lostSacks:
        lostSacks - (movement.movementType === MOVEMENT_TYPES.LOSS ? movement.quantitySacks : 0),
    });

    const event = buildEventEnvelope({
      eventType:
        movement.movementType === MOVEMENT_TYPES.SALE ? 'SALE_CANCELLED' : 'LOSS_CANCELLED',
      sampleId: sample.id,
      payload: {
        movementId: movement.id,
        movementType: movement.movementType,
        reasonText: normalizeRequiredText(input.reasonText, 'reasonText', 500),
        soldSacks: projection.soldSacks,
        lostSacks: projection.lostSacks,
        availableSacks: projection.availableSacks,
        commercialStatus: projection.commercialStatus,
      },
      fromStatus: null,
      toStatus: null,
      module: 'commercial',
      actorContext: actor,
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }

  async revertSampleUpdate(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'revert sample update');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    const targetEventId = normalizeRequiredText(input.targetEventId, 'targetEventId');
    const reasonCode = normalizeUpdateReasonCode(input.reasonCode);
    const hasReasonText =
      typeof input.reasonText === 'string' && input.reasonText.trim().length > 0;
    if (reasonCode === 'OTHER' && !hasReasonText) {
      throw new HttpError(422, 'reasonText is required when reasonCode is OTHER');
    }
    const reasonText = hasReasonText
      ? normalizeUpdateReasonText(input.reasonText)
      : DEFAULT_REGISTRATION_UPDATE_REASON_TEXT;

    const targetEvent = await this.queryService.requireSampleEvent(sample.id, targetEventId);
    if (
      targetEvent.eventType !== 'REGISTRATION_UPDATED' &&
      targetEvent.eventType !== 'CLASSIFICATION_UPDATED'
    ) {
      throw new HttpError(409, `Event ${targetEventId} is not reversible`);
    }

    const payload = isPlainObject(targetEvent.payload) ? targetEvent.payload : null;
    const revertAfter = payload && isPlainObject(payload.before) ? payload.before : null;
    if (!revertAfter) {
      throw new HttpError(409, `Event ${targetEventId} does not contain reversible payload`);
    }

    if (targetEvent.eventType === 'REGISTRATION_UPDATED') {
      return this.updateRegistration(
        {
          sampleId: sample.id,
          expectedVersion: input.expectedVersion,
          after: revertAfter,
          reasonCode,
          reasonText,
        },
        actor
      );
    }

    return this.updateClassification(
      {
        sampleId: sample.id,
        expectedVersion: input.expectedVersion,
        after: revertAfter,
        reasonCode,
        reasonText,
      },
      actor
    );
  }

  async recordReportExported(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'export sample report');

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, ['CLASSIFIED'], 'export sample report');

    const format = normalizeRequiredText(input.format ?? 'PDF', 'format').toUpperCase();
    const exportType = normalizeReportExportType(input.exportType);
    const fileName = normalizeRequiredText(input.fileName, 'fileName');
    const classificationPhotoId = normalizeRequiredText(
      input.classificationPhotoId,
      'classificationPhotoId'
    );
    const templateVersion = normalizeRequiredText(input.templateVersion ?? 'v1', 'templateVersion');
    const selectedFields = normalizeRequiredStringArray(
      input.selectedFields ?? [],
      'selectedFields'
    );
    const sizeBytes = normalizeRequiredInteger(input.sizeBytes, 'sizeBytes', 1);
    const checksumSha256 = normalizeRequiredText(
      input.checksumSha256,
      'checksumSha256'
    ).toLowerCase();

    if (!/^[a-f0-9]{64}$/.test(checksumSha256)) {
      throw new HttpError(422, 'checksumSha256 must be a 64-char lowercase hex string');
    }

    // Liga: safra escolhida pro laudo (override) quando a amostra tem mais de
    // uma safra. Ja validada no pdf-service; aqui so registra no evento.
    const reportedHarvest = normalizeOptionalText(input.reportedHarvest, 'reportedHarvest', 32);

    let recipientClientId = null;
    let recipientClientSnapshot = null;
    let destination = normalizeOptionalText(input.destination, 'destination', 255);

    if (input.recipientClientId) {
      const clientId = normalizeRequiredText(input.recipientClientId, 'recipientClientId');
      if (!UUID_REGEX.test(clientId)) {
        throw new HttpError(422, 'recipientClientId must be a valid UUID');
      }
      recipientClientSnapshot = await this.clientService.resolveRecipientClient(clientId);
      recipientClientId = clientId;
      destination = recipientClientSnapshot.displayName ?? destination;
    }

    const event = buildEventEnvelope({
      eventType: 'REPORT_EXPORTED',
      sampleId: sample.id,
      payload: {
        format,
        exportType,
        fileName,
        destination,
        recipientClientId,
        recipientClientSnapshot,
        selectedFields,
        classificationPhotoId,
        templateVersion,
        sizeBytes,
        checksumSha256,
        ...(reportedHarvest ? { reportedHarvest } : {}),
      },
      fromStatus: null,
      toStatus: null,
      module: 'classification',
      actorContext: actor,
    });

    return this.eventService.appendEvent(event);
  }

  async recordPhysicalSampleSent(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'record physical sample sent');

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, PHYSICAL_SEND_ALLOWED_STATUSES, 'record physical sample sent');

    let recipientClientId = null;
    let recipientClientSnapshot = null;

    if (input.recipientClientId) {
      const clientId = normalizeRequiredText(input.recipientClientId, 'recipientClientId');
      if (!UUID_REGEX.test(clientId)) {
        throw new HttpError(422, 'recipientClientId must be a valid UUID');
      }
      recipientClientSnapshot = await this.clientService.resolveRecipientClient(clientId);
      recipientClientId = clientId;
    }

    const sentDate = input.sentDate
      ? normalizeRequiredText(input.sentDate, 'sentDate')
      : buildBusinessDateStamp();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(sentDate)) {
      throw new HttpError(422, 'sentDate must be in YYYY-MM-DD format');
    }

    const event = buildEventEnvelope({
      eventType: 'PHYSICAL_SAMPLE_SENT',
      sampleId: sample.id,
      payload: {
        recipientClientId,
        recipientClientSnapshot,
        sentDate,
      },
      fromStatus: null,
      toStatus: null,
      module: 'classification',
      actorContext: actor,
    });

    return this.eventService.appendEvent(event);
  }

  async updatePhysicalSampleSend(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'update physical sample send');

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, PHYSICAL_SEND_ALLOWED_STATUSES, 'update physical sample send');

    const sendEventId = normalizeRequiredText(input.sendEventId, 'sendEventId');
    if (!UUID_REGEX.test(sendEventId)) {
      throw new HttpError(422, 'sendEventId must be a valid UUID');
    }

    const events = await this.queryService.listSampleEvents(sample.id, { limit: 500 });
    const previous = projectPhysicalSendState(events, sendEventId);
    if (!previous) {
      throw new HttpError(404, `Physical send ${sendEventId} not found`);
    }
    if (previous.status !== 'ACTIVE') {
      throw new HttpError(409, `Physical send ${sendEventId} is already cancelled`);
    }

    let recipientClientId = null;
    let recipientClientSnapshot = null;
    if (input.recipientClientId) {
      const clientId = normalizeRequiredText(input.recipientClientId, 'recipientClientId');
      if (!UUID_REGEX.test(clientId)) {
        throw new HttpError(422, 'recipientClientId must be a valid UUID');
      }
      recipientClientSnapshot = await this.clientService.resolveRecipientClient(clientId);
      recipientClientId = clientId;
    }

    const sentDate = normalizeRequiredText(input.sentDate, 'sentDate');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sentDate)) {
      throw new HttpError(422, 'sentDate must be in YYYY-MM-DD format');
    }

    const event = buildEventEnvelope({
      eventType: 'PHYSICAL_SAMPLE_SEND_UPDATED',
      sampleId: sample.id,
      payload: {
        sendEventId,
        recipientClientId,
        recipientClientSnapshot,
        sentDate,
        previous: {
          recipientClientId: previous.recipientClientId,
          recipientClientSnapshot: previous.recipientClientSnapshot,
          sentDate: previous.sentDate,
        },
      },
      fromStatus: null,
      toStatus: null,
      module: 'classification',
      actorContext: actor,
    });

    return this.eventService.appendEvent(event);
  }

  async cancelPhysicalSampleSend(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'cancel physical sample send');

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, PHYSICAL_SEND_ALLOWED_STATUSES, 'cancel physical sample send');

    const sendEventId = normalizeRequiredText(input.sendEventId, 'sendEventId');
    if (!UUID_REGEX.test(sendEventId)) {
      throw new HttpError(422, 'sendEventId must be a valid UUID');
    }

    const events = await this.queryService.listSampleEvents(sample.id, { limit: 500 });
    const previous = projectPhysicalSendState(events, sendEventId);
    if (!previous) {
      throw new HttpError(404, `Physical send ${sendEventId} not found`);
    }
    if (previous.status !== 'ACTIVE') {
      throw new HttpError(409, `Physical send ${sendEventId} is already cancelled`);
    }

    const event = buildEventEnvelope({
      eventType: 'PHYSICAL_SAMPLE_SEND_CANCELLED',
      sampleId: sample.id,
      payload: { sendEventId },
      fromStatus: null,
      toStatus: null,
      module: 'classification',
      actorContext: actor,
    });

    return this.eventService.appendEvent(event);
  }

  async updateCommercialStatus(input, actorContext) {
    const toCommercialStatus = normalizeCommercialStatus(input.toCommercialStatus);
    if (toCommercialStatus !== 'LOST') {
      throw new HttpError(
        422,
        'Commercial status is now automatic. Only LOST can be triggered manually.'
      );
    }

    const sample = await this.queryService.requireSample(input.sampleId);
    const currentCommercial = readCurrentCommercialSummary(sample);
    const projection = buildCommercialProjection(currentCommercial);
    if (projection.availableSacks <= 0) {
      throw new HttpError(409, `Sample ${sample.id} has no remaining sacks to mark as lost`);
    }

    return this.createSampleMovement(
      {
        sampleId: sample.id,
        expectedVersion: input.expectedVersion,
        movementType: MOVEMENT_TYPES.LOSS,
        quantitySacks: projection.availableSacks,
        movementDate: buildBusinessDateStamp(),
        notes: null,
        lossReasonText: input.reasonText,
      },
      actorContext
    );
  }

  async invalidateSample(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'invalidate sample');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    if (sample.status === 'INVALIDATED') {
      throw new HttpError(409, `Sample ${sample.id} is already INVALIDATED`);
    }

    const { soldSacks, lostSacks } = readCurrentCommercialSummary(sample);
    if (soldSacks > 0 || lostSacks > 0) {
      throw new HttpError(
        409,
        'Nao e possivel invalidar uma amostra com movimentacoes comerciais ativas. Cancele as movimentacoes antes de invalidar.'
      );
    }

    // Liga A2.5 (Liga F7.2 revisado + F7.D): bloqueia invalidacao se a
    // amostra contribui em alguma liga ATIVA (status != INVALIDATED).
    // Evita "ligas zumbis" (componente invalido + liga ainda viva).
    // Retorna erro estruturado com lista de ligas pra UI renderizar
    // modal informativo (Liga F7.D).
    const activeBlends = await this.queryService.findActiveBlendsContainingOrigin(sample.id);
    if (activeBlends.length > 0) {
      throw new HttpError(
        409,
        `Esta amostra contribui pra ${activeBlends.length} liga(s) ativa(s). Reverta-as antes de invalidar.`,
        {
          code: 'SAMPLE_HAS_ACTIVE_BLENDS',
          activeBlends,
        }
      );
    }

    const event = buildEventEnvelope({
      eventType: 'SAMPLE_INVALIDATED',
      sampleId: sample.id,
      payload: {
        reasonCode: input.reasonCode,
        reasonText: input.reasonText,
      },
      fromStatus: sample.status,
      toStatus: 'INVALIDATED',
      module: 'registration',
      actorContext: actor,
      idempotencyScope: 'INVALIDATE',
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }

  async detectClassificationForm(input, actorContext) {
    requireUserActor(actorContext, USER_ACTION_ROLES, 'detect classification form');

    if (!this.uploadService) {
      throw new HttpError(503, 'Servico de upload nao configurado');
    }

    const { fileBuffer } = input;
    if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      throw new HttpError(422, 'fileBuffer is required');
    }

    const photoToken = randomUUID();
    const tempDir = path.join(this.uploadService.baseDir, '_temp');
    const tempPath = path.join(tempDir, `temp-${photoToken}.jpg`);

    await fs.promises.mkdir(tempDir, { recursive: true });

    // F3.2: limpa orfaos > 24h em _temp/ antes de salvar a nova foto.
    // Best-effort — erro nao bloqueia o fluxo principal.
    await this._cleanupOrphanTempFiles(tempDir).catch(() => {});

    await fs.promises.writeFile(tempPath, fileBuffer);

    let detected = false;

    if (this.formDetectionService) {
      try {
        const result = await this.formDetectionService.detectAndCrop(fileBuffer);
        if (result.detected && result.croppedBuffer) {
          const croppedPath = path.join(tempDir, `temp-${photoToken}-cropped.jpg`);
          await fs.promises.writeFile(croppedPath, result.croppedBuffer);
          detected = true;
        }
      } catch {
        // Detection failed — continue without crop
      }
    }

    return {
      statusCode: 200,
      photoToken,
      detected,
    };
  }

  // F3.2: varre _temp/ e apaga arquivos temp-* com mtime > 24h.
  // Chamado oportunisticamente no inicio de detectClassificationForm.
  // Falha silenciosamente em qualquer etapa — best-effort, nao crashar
  // o fluxo principal por causa de cleanup.
  async _cleanupOrphanTempFiles(tempDir) {
    const TTL_MS = 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - TTL_MS;
    let entries;
    try {
      entries = await fs.promises.readdir(tempDir);
    } catch {
      return;
    }
    await Promise.all(
      entries
        .filter((name) => name.startsWith('temp-'))
        .map(async (name) => {
          const filePath = path.join(tempDir, name);
          try {
            const stat = await fs.promises.stat(filePath);
            if (stat.mtimeMs < cutoff) {
              await fs.promises.rm(filePath, { force: true }).catch(() => {});
            }
          } catch {
            // arquivo deletado em paralelo ou stat falhou — ignora
          }
        })
    );
  }

  async extractAndPrepareClassification(input, actorContext) {
    requireUserActor(actorContext, USER_ACTION_ROLES, 'extract and prepare classification');

    if (!this.uploadService) {
      throw new HttpError(503, 'Servico de upload nao configurado');
    }

    const tempDir = path.join(this.uploadService.baseDir, '_temp');
    let photoToken;
    let tempPath;
    let extractionPath;
    let formDetected = false;
    let createdTempFile = false;

    if (typeof input.photoToken === 'string' && input.photoToken.length > 0) {
      // Mode 2: photoToken from detect-form (file already saved)
      photoToken = input.photoToken;
      tempPath = path.join(tempDir, `temp-${photoToken}.jpg`);
      const croppedPath = path.join(tempDir, `temp-${photoToken}-cropped.jpg`);

      try {
        await fs.promises.access(croppedPath);
        extractionPath = croppedPath;
        formDetected = true;
      } catch {
        extractionPath = tempPath;
      }

      try {
        await fs.promises.access(extractionPath);
      } catch {
        throw new HttpError(404, 'Foto temporaria nao encontrada. Tente novamente.');
      }
    } else if (Buffer.isBuffer(input.fileBuffer) && input.fileBuffer.length > 0) {
      // Mode 1: direct file upload (legacy)
      photoToken = randomUUID();
      tempPath = path.join(tempDir, `temp-${photoToken}.jpg`);
      await fs.promises.mkdir(tempDir, { recursive: true });
      await fs.promises.writeFile(tempPath, input.fileBuffer);
      createdTempFile = true;

      // Try auto-crop inline
      if (this.formDetectionService) {
        try {
          const detection = await this.formDetectionService.detectAndCrop(input.fileBuffer);
          if (detection.detected && detection.croppedBuffer) {
            const croppedPath = path.join(tempDir, `temp-${photoToken}-cropped.jpg`);
            await fs.promises.writeFile(croppedPath, detection.croppedBuffer);
            extractionPath = croppedPath;
            formDetected = true;
          }
        } catch {
          // Detection failed — use original
        }
      }

      if (!extractionPath) {
        extractionPath = tempPath;
      }
    } else {
      throw new HttpError(422, 'Foto ou photoToken e obrigatorio');
    }

    if (!this.extractionService) {
      return {
        statusCode: 200,
        extractedFields: {},
        identification: { lote: null, sacas: null, safra: null, data: null },
        photoToken,
        formDetected,
        processingTimeMs: 0,
      };
    }

    try {
      const raw = await this.extractionService.extractClassificationFromPhoto(extractionPath, {
        sampleId: input.sampleId ?? null,
      });

      return {
        statusCode: 200,
        extractedFields: raw.classificacao,
        identification: raw.identificacao,
        photoToken,
        formDetected,
        processingTimeMs: raw.processingTimeMs,
      };
    } catch (err) {
      if (createdTempFile) {
        await fs.promises.rm(tempPath, { force: true }).catch(() => {});
      }
      throw err;
    }
  }

  async confirmClassificationFromCamera(input, actorContext) {
    const actor = requireUserActor(
      actorContext,
      USER_ACTION_ROLES,
      'confirm classification from camera'
    );
    const sampleId = normalizeNullableUuid(input.sampleId, 'sampleId');
    if (!sampleId) {
      throw new HttpError(422, 'sampleId e obrigatorio');
    }
    if (!input.photoToken || typeof input.photoToken !== 'string') {
      throw new HttpError(422, 'photoToken e obrigatorio');
    }

    // Valida cedo o payload opcional `applySampleUpdates` para falhar antes
    // de consumir a foto temporaria caso o operador envie valores invalidos.
    const sampleUpdatesPatch = parseApplySampleUpdatesPatch(input.applySampleUpdates);

    const sample = await this.queryService.requireSample(sampleId);
    // Q.cls.1 + Q.print: camera aceita partir de RC (1a classificacao) ou
    // CLASSIFIED (reclassificacao). Sem QR_PRINTED — print virou acao
    // pura (audit-only, nao muda status).
    const classifiableStatuses = ['REGISTRATION_CONFIRMED', 'CLASSIFIED'];
    assertSampleStatus(sample, classifiableStatuses, 'confirm classification from camera');

    // Read photo from temp
    if (!this.uploadService) {
      throw new HttpError(503, 'Servico de upload nao configurado');
    }
    const tempDir = path.join(this.uploadService.baseDir, '_temp');
    const tempPath = path.join(tempDir, `temp-${input.photoToken}.jpg`);
    let fileBuffer;
    try {
      fileBuffer = await fs.promises.readFile(tempPath);
    } catch {
      throw new HttpError(404, 'Foto temporaria nao encontrada. Tire a foto novamente.');
    }

    // Upload photo to sample
    await this.addSamplePhoto(
      {
        sampleId,
        kind: PHOTO_KINDS.CLASSIFICATION,
        fileBuffer,
        mimeType: 'image/jpeg',
        originalFileName: `classification-${sampleId}.jpg`,
        replaceExisting: true,
        skipExtraction: true,
      },
      actor
    );

    // Build classification data. Campo `classificador` string foi abolido:
    // agora o classificador (ou classificadores) e representado pelo array
    // `classifiers` persistido top-level no payload do evento (via
    // normalizeClassifiers abaixo).
    const classificationDate = buildBusinessDateStamp();
    const classificationData = isPlainObject(input.classificationData)
      ? {
          ...input.classificationData,
          dataClassificacao: classificationDate,
        }
      : { dataClassificacao: classificationDate };

    const technical = {};
    if (classificationData.defeito) {
      const parsed = parseInt(classificationData.defeito, 10);
      if (Number.isFinite(parsed)) {
        technical.defectsCount = Math.round(parsed);
      }
    }
    // Re-read sample after photo upload (version changed)
    let current = await this.queryService.requireSample(sampleId);

    // Reconciliacao opcional: quando o operador confere a ficha e escolhe
    // "usar valor da ficha" para sacas/safra, o frontend envia
    // `applySampleUpdates`. Aplicamos a atualizacao ANTES da classificacao.
    //
    // Nota de transacionalidade: `updateRegistration` e a chamada de
    // classificacao subsequente rodam em transacoes Prisma separadas. Se
    // falhar entre as duas, a amostra fica com os novos sacks/harvest mas
    // sem classificacao — o operador pode reclassificar (idempotencyKey
    // protege duplicacao). Tolerado por ora para nao reestruturar o fluxo.
    if (sampleUpdatesPatch) {
      const registrationAfter = { declared: {} };
      if (hasOwn(sampleUpdatesPatch, 'declaredSacks')) {
        registrationAfter.declared.sacks = sampleUpdatesPatch.declaredSacks;
      }
      if (hasOwn(sampleUpdatesPatch, 'declaredHarvest')) {
        registrationAfter.declared.harvest = sampleUpdatesPatch.declaredHarvest;
      }

      // `updateRegistration` lanca 409 se nao detectar mudanca (no-op) ou
      // se a reducao de sacks violar soldSacks+lostSacks. Propagamos o erro
      // para o cliente em ambos os casos.
      try {
        await this.updateRegistration(
          {
            sampleId,
            expectedVersion: current.version,
            after: registrationAfter,
            reasonCode: 'DATA_FIX',
            reasonText: 'Conferencia de ficha na camera',
            // Liga: a reconciliacao de safra na ficha ja e confirmada pelo
            // operador na camera — propaga pras ligas sem novo prompt (evita o
            // 409 BLEND_HARVEST_PROPAGATION_REQUIRED quebrar o fluxo).
            confirmHarvestPropagation: true,
          },
          actorContext
        );
      } catch (error) {
        // No-op: quando os valores enviados ja batem com o cadastrado,
        // `updateRegistration` lanca 409 "No registration changes detected".
        // Isso nao deve bloquear a classificacao — apenas seguimos.
        const isNoOpChange =
          error instanceof HttpError &&
          error.status === 409 &&
          typeof error.message === 'string' &&
          error.message.includes('No registration changes detected');
        if (!isNoOpChange) {
          throw error;
        }
      }

      // Re-read sample after potential registration update (version changed)
      current = await this.queryService.requireSample(sampleId);
    }

    let result;

    if (sample.status === 'CLASSIFIED') {
      // Q.cls.2.7: reclassificacao via camera. classificationData ja vem
      // na ficha unificada (flat fields + peneiras + fundos + defeitos)
      // do frontend. Repassamos via spread direto, dropando dataClassificacao
      // (auto-set pelo completeClassification, nao editavel via update).
      const allowedUpdateKeys = new Set([
        ...CLASSIFICATION_DATA_EDITABLE_FIELDS,
        'peneiras',
        'fundos',
        'defeitos',
      ]);
      const parsedPatch = {};
      for (const [key, value] of Object.entries(classificationData)) {
        if (allowedUpdateKeys.has(key)) {
          parsedPatch[key] = value;
        }
      }
      // classifiers e passado top-level no after, fora do whitelist acima.
      // Passamos o input original (formato {userId}) e o updateClassification
      // re-normaliza.
      if (input.classifiers !== undefined) {
        parsedPatch.classifiers = input.classifiers;
      }
      // Q.cls.2.7: reasonCode/reasonText vem do frontend (ClassificationReclassifyModal).
      // Frontend valida obrigatoriedade do code e do text quando code=OTHER —
      // o backend faz o mesmo via normalizeUpdateReasonText/Code. Default
      // 'DATA_FIX' preserva compat com chamadas pre-Q.cls.2.7.
      result = await this.updateClassification(
        {
          sampleId,
          expectedVersion: current.version,
          after: parsedPatch,
          reasonCode: input.reasonCode ?? 'DATA_FIX',
          reasonText: input.reasonText ?? 'Reclassificacao via foto',
          classificationType: input.classificationType ?? null,
        },
        actorContext
      );
    } else {
      // New classification. Frontend envia `classifiers` ja com actor +
      // co-classificadores. completeClassification normaliza e valida.
      result = await this.completeClassification(
        {
          sampleId,
          expectedVersion: current.version,
          classificationData,
          technical: Object.keys(technical).length > 0 ? technical : undefined,
          classifiers: input.classifiers,
          idempotencyKey: input.idempotencyKey,
          classificationType: input.classificationType ?? null,
        },
        actorContext
      );
    }

    // Cleanup temp files (best-effort)
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    const croppedTempPath = tempPath.replace('.jpg', '-cropped.jpg');
    await fs.promises.rm(croppedTempPath, { force: true }).catch(() => {});

    return result;
  }
}
