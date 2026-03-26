import { createHash, randomUUID } from 'node:crypto';

import { assertRoleAllowed, USER_ROLES } from '../auth/roles.js';
import { HttpError } from '../contracts/errors.js';
import { buildEventEnvelope, normalizeActorContext } from './sample-event-factory.js';

const USER_ACTION_ROLES = [USER_ROLES.ADMIN, USER_ROLES.CLASSIFIER, USER_ROLES.REGISTRATION, USER_ROLES.COMMERCIAL];
const AUTO_LOT_NUMBER_MAX_RETRIES = 5;
const CREATE_SAMPLE_MAX_RETRIES = 12;
const RECEIVED_CHANNELS = new Set(['in_person', 'courier', 'driver', 'other']);
const PHOTO_KINDS = {
  ARRIVAL: 'ARRIVAL_PHOTO',
  CLASSIFICATION: 'CLASSIFICATION_PHOTO'
};
const PHOTO_KIND_ALLOWED_STATUSES = {
  [PHOTO_KINDS.ARRIVAL]: ['REGISTRATION_IN_PROGRESS'],
  [PHOTO_KINDS.CLASSIFICATION]: ['CLASSIFICATION_IN_PROGRESS']
};
const REPRINT_ALLOWED_STATUSES = ['QR_PENDING_PRINT', 'QR_PRINTED', 'CLASSIFICATION_IN_PROGRESS', 'CLASSIFIED'];
const UPDATE_REASON_CODES = new Set(['DATA_FIX', 'TYPO', 'MISSING_INFO', 'OTHER']);
const REPORT_EXPORT_TYPES = new Set(['COMPLETO', 'COMPRADOR_PARCIAL']);
const COMMERCIAL_STATUS_VALUES = new Set(['OPEN', 'PARTIALLY_SOLD', 'SOLD', 'LOST']);
const COMMERCIAL_MUTABLE_OPERATIONAL_STATUSES = new Set(['CLASSIFIED']);
const MOVEMENT_TYPES = {
  SALE: 'SALE',
  LOSS: 'LOSS'
};
const MOVEMENT_STATUSES = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED'
};
const MAX_UPDATE_REASON_WORDS = 10;
const DEFAULT_REGISTRATION_UPDATE_REASON_CODE = 'OTHER';
const DEFAULT_REGISTRATION_UPDATE_REASON_TEXT = 'Edicao manual no detalhe da amostra';
const BUSINESS_TIMEZONE = 'America/Sao_Paulo';
const REGISTRATION_UPDATE_ALLOWED_STATUSES = [
  'REGISTRATION_CONFIRMED',
  'QR_PENDING_PRINT',
  'QR_PRINTED',
  'CLASSIFICATION_IN_PROGRESS',
  'CLASSIFIED'
];
const CLASSIFICATION_UPDATE_ALLOWED_STATUSES = [
  'PHYSICAL_RECEIVED',
  'REGISTRATION_IN_PROGRESS',
  'REGISTRATION_CONFIRMED',
  'QR_PENDING_PRINT',
  'QR_PRINTED',
  'CLASSIFICATION_IN_PROGRESS',
  'CLASSIFIED'
];
const REGISTRATION_EDITABLE_FIELDS = ['owner', 'sacks', 'harvest', 'originLot'];
const CLASSIFICATION_DATA_EDITABLE_FIELDS = [
  'padrao',
  'catacao',
  'aspecto',
  'bebida',
  'broca',
  'pva',
  'imp',
  'classificador',
  'defeito',
  'umidade',
  'aspectoCor',
  'observacoes',
  'loteOrigem'
];
const CLASSIFICATION_SIEVE_FIELDS = ['p18', 'p17', 'p16', 'mk', 'p15', 'p14', 'p13', 'p10', 'fundo'];
const CLASSIFICATION_TECHNICAL_EDITABLE_FIELDS = [
  'type',
  'screen',
  'defectsCount',
  'moisture',
  'density',
  'colorAspect',
  'notes'
];
const MOVEMENT_UPDATE_EDITABLE_FIELDS = new Set([
  'movementType',
  'buyerClientId',
  'buyerRegistrationId',
  'quantitySacks',
  'movementDate',
  'notes',
  'lossReasonText'
]);
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildBusinessDateStamp(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
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
    lostSacks: typeof sample?.lostSacks === 'number' ? sample.lostSacks : 0
  };
}

function resolveCommercialStatusFromTotals({ declaredSacks, soldSacks, lostSacks }) {
  if (declaredSacks === null || declaredSacks <= 0) {
    return 'OPEN';
  }

  if (soldSacks === 0 && lostSacks === declaredSacks) {
    return 'LOST';
  }

  if (soldSacks === declaredSacks && lostSacks === 0) {
    return 'SOLD';
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
      commercialStatus: 'OPEN'
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
      lostSacks
    })
  };
}

function buildBuyerSnapshot(binding) {
  if (!binding) {
    return {
      buyerClientId: null,
      buyerRegistrationId: null,
      buyerClientSnapshot: null,
      buyerRegistrationSnapshot: null
    };
  }

  return {
    buyerClientId: binding.buyerClientId,
    buyerRegistrationId: binding.buyerRegistrationId,
    buyerClientSnapshot: binding.buyerClient,
    buyerRegistrationSnapshot: binding.buyerRegistration
  };
}

function formatMovementSnapshot(movement) {
  return {
    movementType: movement.movementType,
    buyerClientId: movement.buyerClientId ?? null,
    buyerRegistrationId: movement.buyerRegistrationId ?? null,
    quantitySacks: movement.quantitySacks,
    movementDate: movement.movementDate,
    notes: movement.notes ?? null,
    lossReasonText: movement.lossReasonText ?? null,
    buyerClientSnapshot: movement.buyerClientSnapshot ?? null,
    buyerRegistrationSnapshot: movement.buyerRegistrationSnapshot ?? null,
    status: movement.status
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
    typeof value === 'number' ? value : Number(typeof value === 'string' ? value.replace(',', '.') : value);

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
  if (fieldName === 'owner' || fieldName === 'harvest' || fieldName === 'originLot') {
    return normalizeRequiredText(value, fieldName);
  }

  if (fieldName === 'sacks') {
    return normalizeSacks(value);
  }

  throw new HttpError(422, `registration field ${fieldName} is not editable`);
}

function parseRegistrationUpdatePatch(after) {
  const allowedTopLevel = new Set([...REGISTRATION_EDITABLE_FIELDS, 'declared', 'ownerClientId', 'ownerRegistrationId']);
  assertNoUnknownKeys(after, allowedTopLevel, 'after');

  const declared = hasOwn(after, 'declared') ? after.declared : undefined;
  if (declared !== undefined) {
    assertNoUnknownKeys(declared, new Set(REGISTRATION_EDITABLE_FIELDS), 'after.declared');
  }

  const patch = {
    declared: {}
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

  if (hasOwn(after, 'ownerRegistrationId')) {
    patch.hasOwnerRegistrationId = true;
    patch.ownerRegistrationId = normalizeNullableUuid(after.ownerRegistrationId, 'after.ownerRegistrationId');
  }

  if (
    Object.keys(patch.declared).length === 0 &&
    patch.hasOwnerClientId !== true &&
    patch.hasOwnerRegistrationId !== true
  ) {
    throw new HttpError(422, 'after must include at least one editable registration field');
  }

  return patch;
}

function parseClassificationSievePatch(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  assertNoUnknownKeys(value, new Set(CLASSIFICATION_SIEVE_FIELDS), 'after.classificationData.peneirasPercentuais');

  const patch = {};
  for (const key of CLASSIFICATION_SIEVE_FIELDS) {
    if (!hasOwn(value, key)) {
      continue;
    }
    patch[key] = normalizeNullableNumber(value[key], `after.classificationData.peneirasPercentuais.${key}`);
  }

  if (Object.keys(patch).length === 0) {
    return undefined;
  }

  return patch;
}

function normalizeClassificationDataFieldValue(fieldName, value) {
  if (fieldName === 'broca' || fieldName === 'pva' || fieldName === 'imp' || fieldName === 'defeito') {
    return normalizeNullableNumber(value, `after.classificationData.${fieldName}`);
  }

  if (fieldName === 'umidade') {
    return normalizeNullableNumber(value, 'after.classificationData.umidade');
  }

  return normalizeNullableText(value, `after.classificationData.${fieldName}`);
}

function normalizeClassificationTechnicalFieldValue(fieldName, value) {
  if (fieldName === 'defectsCount') {
    return normalizeNullableNumber(value, 'after.technical.defectsCount', { integer: true, min: 0 });
  }

  if (fieldName === 'moisture' || fieldName === 'density') {
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
    'versaoClassificacao'
  ]);

  const allowedTopLevel = new Set([
    ...CLASSIFICATION_DATA_EDITABLE_FIELDS,
    ...CLASSIFICATION_TECHNICAL_EDITABLE_FIELDS,
    'classificationData',
    'technical',
    'consumptionGrams',
    'peneirasPercentuais'
  ]);
  assertNoUnknownKeys(after, allowedTopLevel, 'after');

  for (const key of forbiddenTopLevel) {
    if (hasOwn(after, key)) {
      throw new HttpError(422, `after.${key} is not editable`);
    }
  }

  const classificationData = hasOwn(after, 'classificationData') ? after.classificationData : undefined;
  if (classificationData !== undefined) {
    assertNoUnknownKeys(
      classificationData,
      new Set([...CLASSIFICATION_DATA_EDITABLE_FIELDS, 'peneirasPercentuais', 'consumoGramas']),
      'after.classificationData'
    );

    if (hasOwn(classificationData, 'classificadorUserId') || hasOwn(classificationData, 'versaoClassificacao')) {
      throw new HttpError(422, 'classificationData id/version fields are not editable');
    }
  }

  const technical = hasOwn(after, 'technical') ? after.technical : undefined;
  if (technical !== undefined) {
    assertNoUnknownKeys(technical, new Set(CLASSIFICATION_TECHNICAL_EDITABLE_FIELDS), 'after.technical');
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

  const topSievePatch = hasOwn(after, 'peneirasPercentuais') ? parseClassificationSievePatch(after.peneirasPercentuais) : undefined;
  const nestedSievePatch =
    isPlainObject(classificationData) && hasOwn(classificationData, 'peneirasPercentuais')
      ? parseClassificationSievePatch(classificationData.peneirasPercentuais)
      : undefined;

  if (topSievePatch !== undefined || nestedSievePatch !== undefined) {
    classificationDataPatch.peneirasPercentuais = nestedSievePatch !== undefined ? nestedSievePatch : topSievePatch;
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

  const hasConsumptionTop = hasOwn(after, 'consumptionGrams');
  const hasConsumptionNested = isPlainObject(classificationData) && hasOwn(classificationData, 'consumoGramas');
  const consumptionGrams = hasConsumptionTop
    ? normalizeNullableNumber(after.consumptionGrams, 'after.consumptionGrams')
    : hasConsumptionNested
      ? normalizeNullableNumber(classificationData.consumoGramas, 'after.classificationData.consumoGramas')
      : undefined;

  if (
    Object.keys(classificationDataPatch).length === 0 &&
    Object.keys(technicalPatch).length === 0 &&
    consumptionGrams === undefined
  ) {
    throw new HttpError(422, 'after must include at least one editable classification field');
  }

  return {
    classificationData: classificationDataPatch,
    technical: technicalPatch,
    consumptionGrams
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
  if (hasOwn(after, 'buyerRegistrationId')) {
    patch.buyerRegistrationId = normalizeNullableUuid(after.buyerRegistrationId, 'after.buyerRegistrationId');
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
    parsedPatch.hasOwnerClientId === true || parsedPatch.hasOwnerRegistrationId === true;
  const currentOwnerClientId = sample.ownerClientId ?? null;
  const currentOwnerRegistrationId = sample.ownerRegistrationId ?? null;
  const nextOwnerClientId = parsedPatch.resolvedOwnerBinding?.ownerClientId ?? null;
  const nextOwnerRegistrationId = parsedPatch.resolvedOwnerBinding?.ownerRegistrationId ?? null;
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

    if (!valuesEqual(currentOwnerRegistrationId, nextOwnerRegistrationId)) {
      before.ownerRegistrationId = currentOwnerRegistrationId;
      after.ownerRegistrationId = nextOwnerRegistrationId;
    }

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
    after
  };
}

async function resolveStructuredOwnerForWrite({
  sample,
  inputOwnerClientId,
  inputOwnerRegistrationId,
  hasOwnerClientId = false,
  hasOwnerRegistrationId = false,
  clientService,
  mode
}) {
  const currentOwnerClientId = sample?.ownerClientId ?? null;
  const currentOwnerRegistrationId = sample?.ownerRegistrationId ?? null;

  if (!clientService) {
    if (mode === 'create' || mode === 'confirm') {
      throw new Error('clientService is required for create/confirm owner binding support');
    }

    if (
      (inputOwnerClientId !== undefined && inputOwnerClientId !== null) ||
      (inputOwnerRegistrationId !== undefined && inputOwnerRegistrationId !== null)
    ) {
      throw new Error('clientService is required for ownerClientId/ownerRegistrationId support');
    }

    return null;
  }

  if (mode === 'create' || mode === 'confirm') {
    if (inputOwnerClientId === undefined || inputOwnerClientId === null) {
      if (inputOwnerRegistrationId !== undefined && inputOwnerRegistrationId !== null) {
        throw new HttpError(422, 'ownerRegistrationId requires ownerClientId');
      }

      throw new HttpError(422, 'ownerClientId is required');
    }

    return clientService.resolveOwnerBinding({
      ownerClientId: inputOwnerClientId,
      ownerRegistrationId: inputOwnerRegistrationId ?? null
    });
  }

  let nextOwnerClientId = currentOwnerClientId;
  let nextOwnerRegistrationId = currentOwnerRegistrationId;
  let touched = false;

  if (hasOwnerClientId) {
    touched = true;
    if (inputOwnerClientId === null) {
      if (currentOwnerClientId !== null) {
        throw new HttpError(422, 'ownerClientId cannot be cleared once a sample is linked');
      }

      nextOwnerClientId = null;
      nextOwnerRegistrationId = null;
    } else {
      const ownerChanged = inputOwnerClientId !== currentOwnerClientId;
      nextOwnerClientId = inputOwnerClientId;

      if (ownerChanged) {
        nextOwnerRegistrationId = hasOwnerRegistrationId ? inputOwnerRegistrationId ?? null : null;
      } else if (hasOwnerRegistrationId) {
        nextOwnerRegistrationId = inputOwnerRegistrationId ?? null;
      }
    }
  } else if (hasOwnerRegistrationId) {
    touched = true;
    if (!currentOwnerClientId) {
      throw new HttpError(422, 'ownerRegistrationId requires ownerClientId');
    }

    nextOwnerClientId = currentOwnerClientId;
    nextOwnerRegistrationId = inputOwnerRegistrationId ?? null;
  }

  if (!touched) {
    return null;
  }

  if (!nextOwnerClientId) {
    return null;
  }

  return clientService.resolveOwnerBinding({
    ownerClientId: nextOwnerClientId,
    ownerRegistrationId: nextOwnerRegistrationId
  });
}

async function resolveBuyerBindingForMovement({
  clientService,
  buyerClientId,
  buyerRegistrationId
}) {
  if (!clientService) {
    throw new Error('clientService is required for sale movements');
  }

  return clientService.resolveBuyerBinding({
    buyerClientId,
    buyerRegistrationId
  });
}

function buildClassificationUpdatePayload(sample, parsedPatch) {
  const currentData = isPlainObject(sample.latestClassification?.data) ? sample.latestClassification.data : {};
  const currentTechnical = isPlainObject(sample.latestClassification?.technical) ? sample.latestClassification.technical : {};
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

    if (hasOwn(parsedPatch.classificationData, 'peneirasPercentuais')) {
      const nextSievePatch = parsedPatch.classificationData.peneirasPercentuais;
      const currentSieve = isPlainObject(currentData.peneirasPercentuais) ? currentData.peneirasPercentuais : null;

      if (nextSievePatch === null) {
        if (currentSieve !== null) {
          beforeClassificationData.peneirasPercentuais = currentSieve;
          afterClassificationData.peneirasPercentuais = null;
        }
      } else if (isPlainObject(nextSievePatch)) {
        const beforeSieve = {};
        const afterSieve = {};

        for (const key of CLASSIFICATION_SIEVE_FIELDS) {
          if (!hasOwn(nextSievePatch, key)) {
            continue;
          }

          const currentValue = currentSieve && hasOwn(currentSieve, key) ? currentSieve[key] : null;
          const nextValue = nextSievePatch[key];
          if (valuesEqual(currentValue, nextValue)) {
            continue;
          }

          beforeSieve[key] = currentValue;
          afterSieve[key] = nextValue;
        }

        if (Object.keys(afterSieve).length > 0) {
          beforeClassificationData.peneirasPercentuais = beforeSieve;
          afterClassificationData.peneirasPercentuais = afterSieve;
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
    const currentConsumption = hasOwn(currentData, 'consumoGramas') ? currentData.consumoGramas : null;
    if (!valuesEqual(currentConsumption, parsedPatch.consumptionGrams)) {
      before.consumptionGrams = currentConsumption;
      after.consumptionGrams = parsedPatch.consumptionGrams;
    }
  }

  if (Object.keys(after).length === 0) {
    return null;
  }

  return {
    before,
    after
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
  if (!value) {
    return PHOTO_KINDS.ARRIVAL;
  }

  if (value === PHOTO_KINDS.ARRIVAL || value === PHOTO_KINDS.CLASSIFICATION) {
    return value;
  }

  throw new HttpError(422, 'photo kind is invalid');
}

function normalizePrintAction(value, fieldName = 'printAction') {
  const action = normalizeRequiredText(value ?? 'PRINT', fieldName).toUpperCase();
  if (action !== 'PRINT' && action !== 'REPRINT') {
    throw new HttpError(422, `${fieldName} is invalid`);
  }
  return action;
}

function buildDeterministicUuid(seed) {
  const digest = createHash('sha256').update(seed).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function isStatusConflict(error) {
  return error instanceof HttpError && error.status === 409;
}

function requireExpectedVersion(expectedVersion) {
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new HttpError(422, 'expectedVersion must be a non-negative integer');
  }
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

function normalizeDeclaredFields(declared, options = {}) {
  if (!declared || typeof declared !== 'object') {
    throw new HttpError(422, 'declared fields are required');
  }

  const resolvedOwnerName = typeof options.resolvedOwnerName === 'string' ? options.resolvedOwnerName.trim() : null;
  const owner =
    resolvedOwnerName && resolvedOwnerName.length > 0
      ? resolvedOwnerName
      : normalizeRequiredText(declared.owner, 'owner');

  return {
    owner,
    sacks: declared.sacks,
    harvest: declared.harvest,
    originLot: declared.originLot
  };
}

function normalizeOcrPayload(ocr) {
  if (ocr && typeof ocr === 'object') {
    return ocr;
  }

  return {
    provider: 'LOCAL',
    overallConfidence: 0,
    fieldConfidence: {
      owner: 0,
      sacks: 0,
      harvest: 0,
      originLot: 0
    },
    rawTextRef: null
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
  constructor({ eventService, queryService, uploadService = null, clientService = null }) {
    this.eventService = eventService;
    this.queryService = queryService;
    this.uploadService = uploadService;
    this.clientService = clientService;
  }

  async receiveSample(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'receive sample');

    const sampleId = input.sampleId ?? randomUUID();
    const event = buildEventEnvelope({
      eventType: 'SAMPLE_RECEIVED',
      sampleId,
      payload: {
        receivedChannel: input.receivedChannel ?? 'in_person',
        notes: input.notes ?? null
      },
      fromStatus: null,
      toStatus: 'PHYSICAL_RECEIVED',
      module: 'registration',
      actorContext: actor
    });

    return this.eventService.appendEvent(event);
  }

  async createSampleAndPreparePrint(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'create sample');

    const clientDraftId = normalizeRequiredText(input.clientDraftId, 'clientDraftId');
    const ownerBinding = await resolveStructuredOwnerForWrite({
      sample: null,
      inputOwnerClientId: normalizeNullableUuid(input.ownerClientId, 'ownerClientId'),
      inputOwnerRegistrationId: normalizeNullableUuid(input.ownerRegistrationId, 'ownerRegistrationId'),
      clientService: this.clientService,
      mode: 'create'
    });
    const declared = {
      owner:
        ownerBinding?.displayName ??
        normalizeRequiredText(input.owner, 'owner'),
      sacks: normalizeSacks(input.sacks),
      harvest: normalizeRequiredText(input.harvest, 'harvest'),
      originLot: normalizeRequiredText(input.originLot, 'originLot')
    };
    const receivedChannel = normalizeReceivedChannel(input.receivedChannel ?? 'in_person');
    const notes = normalizeOptionalText(input.notes, 'notes', 500);
    const printerId = normalizeOptionalText(input.printerId, 'printerId', 120);
    const sampleId = buildDeterministicUuid(`${actor.actorUserId}:${clientDraftId}`);
    const hasArrivalPhotoBuffer = Buffer.isBuffer(input.arrivalPhoto?.fileBuffer) && input.arrivalPhoto.fileBuffer.length > 0;
    const arrivalPhoto = hasArrivalPhotoBuffer
      ? {
          fileBuffer: input.arrivalPhoto.fileBuffer,
          mimeType: input.arrivalPhoto.mimeType ?? null,
          originalFileName: input.arrivalPhoto.originalFileName ?? null
        }
      : null;

    let createdThisRequest = false;
    let lastEvent = null;
    let activePrintAttempt = null;

    for (let attempt = 0; attempt < CREATE_SAMPLE_MAX_RETRIES; attempt += 1) {
      const sample = await this.queryService.findSampleOrNull(sampleId);

      if (!sample) {
        try {
          const received = await this.receiveSample(
            {
              sampleId,
              receivedChannel,
              notes
            },
            actor
          );
          createdThisRequest = true;
          lastEvent = received.event;
          continue;
        } catch (error) {
          if (isStatusConflict(error)) {
            continue;
          }
          throw error;
        }
      }

      if (sample.status === 'INVALIDATED') {
        throw new HttpError(409, `Sample ${sample.id} is INVALIDATED and cannot be recreated`);
      }

      if (sample.status === 'PHYSICAL_RECEIVED') {
        try {
          const started = await this.startRegistration(
            {
              sampleId,
              expectedVersion: sample.version,
              notes
            },
            actor
          );
          lastEvent = started.event;
          continue;
        } catch (error) {
          if (isStatusConflict(error)) {
            continue;
          }
          throw error;
        }
      }

      if (sample.status === 'REGISTRATION_IN_PROGRESS') {
        if (arrivalPhoto) {
          const existingArrivalPhoto = await this.queryService.findAttachmentByKind(sample.id, PHOTO_KINDS.ARRIVAL);
          if (!existingArrivalPhoto) {
            try {
              const photoResult = await this.addSamplePhoto(
                {
                  sampleId,
                  kind: PHOTO_KINDS.ARRIVAL,
                  fileBuffer: arrivalPhoto.fileBuffer,
                  mimeType: arrivalPhoto.mimeType,
                  originalFileName: arrivalPhoto.originalFileName,
                  replaceExisting: false
                },
                actor
              );
              lastEvent = photoResult.event;
              continue;
            } catch (error) {
              if (isStatusConflict(error)) {
                continue;
              }
              throw error;
            }
          }
        }

        try {
          const arrivalPhotoIds = await this.queryService.listAttachmentIds(sample.id, {
            kind: PHOTO_KINDS.ARRIVAL
          });

          const confirmed = await this.confirmRegistration(
            {
              sampleId,
              expectedVersion: sample.version,
              declared,
              ownerClientId: ownerBinding?.ownerClientId ?? null,
              ownerRegistrationId: ownerBinding?.ownerRegistrationId ?? null,
              labelPhotoIds: arrivalPhotoIds,
              ocr: normalizeOcrPayload(null),
              idempotencyKey: `draft:${clientDraftId}:registration-confirm`
            },
            actor
          );
          lastEvent = confirmed.event;
          continue;
        } catch (error) {
          if (isStatusConflict(error)) {
            continue;
          }
          throw error;
        }
      }

      if (sample.status === 'REGISTRATION_CONFIRMED') {
        const nextAttempt = await this.queryService.getNextPrintAttemptNumber(sampleId, 'PRINT');
        try {
          const requested = await this.requestQrPrint(
            {
              sampleId,
              expectedVersion: sample.version,
              attemptNumber: nextAttempt,
              printerId,
              idempotencyKey: `draft:${clientDraftId}:qr-print:${nextAttempt}`
            },
            actor
          );
          lastEvent = requested.event;
          activePrintAttempt = {
            printAction: 'PRINT',
            attemptNumber: nextAttempt,
            printerId,
            status: 'PENDING'
          };
          continue;
        } catch (error) {
          if (isStatusConflict(error)) {
            continue;
          }
          throw error;
        }
      }

      if (
        sample.status === 'QR_PENDING_PRINT' ||
        sample.status === 'QR_PRINTED' ||
        sample.status === 'CLASSIFICATION_IN_PROGRESS' ||
        sample.status === 'CLASSIFIED'
      ) {
        const pendingPrintAttempt =
          sample.status === 'QR_PENDING_PRINT'
            ? activePrintAttempt ?? (await this.queryService.findPendingPrintJobOrNull(sample.id))
            : null;

        return {
          statusCode: createdThisRequest ? 201 : 200,
          idempotent: !createdThisRequest,
          event: lastEvent,
          sample,
          draft: {
            clientDraftId,
            sampleId: sample.id
          },
          qr: {
            value: sample.internalLotNumber ?? sample.id,
            internalLotNumber: sample.internalLotNumber,
            status: sample.status
          },
          print: pendingPrintAttempt
        };
      }

      throw new HttpError(409, `Sample ${sample.id} is in unsupported status ${sample.status} for create flow`);
    }

    throw new HttpError(409, 'Could not finalize sample creation flow due to concurrent updates. Retry request.');
  }

  async startRegistration(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'start registration');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, ['PHYSICAL_RECEIVED'], 'start registration');

    const event = buildEventEnvelope({
      eventType: 'REGISTRATION_STARTED',
      sampleId: sample.id,
      payload: {
        notes: input.notes ?? null
      },
      fromStatus: 'PHYSICAL_RECEIVED',
      toStatus: 'REGISTRATION_IN_PROGRESS',
      module: 'registration',
      actorContext: actor
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }

  async addSamplePhoto(input, actorContext) {
    const kind = normalizePhotoKind(input.kind);
    const actionLabel = kind === PHOTO_KINDS.ARRIVAL ? 'add arrival photo' : 'add classification photo';
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
      originalFileName: input.originalFileName ?? null
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
        checksumSha256: saved.checksumSha256
      },
      fromStatus: null,
      toStatus: null,
      module: kind === PHOTO_KINDS.ARRIVAL ? 'registration' : 'classification',
      actorContext: actor
    });

    try {
      const result = await this.eventService.appendEvent(event);

      if (existingAttachment?.storagePath && existingAttachment.storagePath !== saved.storagePath) {
        await this.uploadService.deleteByStoragePath(existingAttachment.storagePath).catch(() => {});
      }

      return {
        ...result,
        photo: {
          ...saved,
          kind
        }
      };
    } catch (error) {
      await this.uploadService.deleteByStoragePath(saved.storagePath);
      throw error;
    }
  }

  async addLabelPhoto(input, actorContext) {
    return this.addSamplePhoto(
      {
        ...input,
        kind: PHOTO_KINDS.ARRIVAL
      },
      actorContext
    );
  }

  async addClassificationPhoto(input, actorContext) {
    return this.addSamplePhoto(
      {
        ...input,
        kind: PHOTO_KINDS.CLASSIFICATION
      },
      actorContext
    );
  }

  async confirmRegistration(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'confirm registration');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, ['REGISTRATION_IN_PROGRESS'], 'confirm registration');

    const attachmentIds = Array.isArray(input.labelPhotoIds)
      ? input.labelPhotoIds
      : await this.queryService.listAttachmentIds(sample.id, { kind: PHOTO_KINDS.ARRIVAL });

    const ownerBinding = await resolveStructuredOwnerForWrite({
      sample,
      inputOwnerClientId: normalizeNullableUuid(input.ownerClientId, 'ownerClientId'),
      inputOwnerRegistrationId: normalizeNullableUuid(input.ownerRegistrationId, 'ownerRegistrationId'),
      clientService: this.clientService,
      mode: 'confirm'
    });
    const declared = normalizeDeclaredFields(input.declared, {
      resolvedOwnerName: ownerBinding?.displayName ?? null
    });
    const ocr = normalizeOcrPayload(input.ocr);
    const maxRetries = input.sampleLotNumber ? 1 : AUTO_LOT_NUMBER_MAX_RETRIES;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      const sampleLotNumber =
        input.sampleLotNumber ?? (await this.queryService.getNextInternalLotNumber(new Date().getUTCFullYear()));

      const event = buildEventEnvelope({
        eventType: 'REGISTRATION_CONFIRMED',
        sampleId: sample.id,
        payload: {
          sampleLotNumber,
          declared,
          ownerClientId: ownerBinding?.ownerClientId ?? null,
          ownerRegistrationId: ownerBinding?.ownerRegistrationId ?? null,
          labelPhotos: attachmentIds,
          ocr
        },
        fromStatus: 'REGISTRATION_IN_PROGRESS',
        toStatus: 'REGISTRATION_CONFIRMED',
        module: 'registration',
        actorContext: actor,
        idempotencyScope: 'REGISTRATION_CONFIRM',
        idempotencyKey: input.idempotencyKey ?? randomUUID()
      });

      try {
        return await this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
      } catch (error) {
        if (!input.sampleLotNumber && isInternalLotNumberUniqueConflict(error) && attempt < maxRetries) {
          continue;
        }

        throw error;
      }
    }

    throw new HttpError(409, 'Could not generate a unique sample lot number');
  }

  async requestQrPrint(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'request QR print');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, ['REGISTRATION_CONFIRMED'], 'request QR print');
    const attemptNumber =
      input.attemptNumber !== undefined
        ? normalizeRequiredInteger(input.attemptNumber, 'attemptNumber', 1)
        : await this.queryService.getNextPrintAttemptNumber(sample.id, 'PRINT');

    const event = buildEventEnvelope({
      eventType: 'QR_PRINT_REQUESTED',
      sampleId: sample.id,
      payload: {
        printAction: 'PRINT',
        attemptNumber,
        printerId: input.printerId ?? null
      },
      fromStatus: 'REGISTRATION_CONFIRMED',
      toStatus: 'QR_PENDING_PRINT',
      module: 'print',
      actorContext: actor,
      idempotencyScope: 'QR_PRINT',
      idempotencyKey: input.idempotencyKey ?? randomUUID()
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }

  async requestQrReprint(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'request QR reprint');

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, REPRINT_ALLOWED_STATUSES, 'request QR reprint');

    const attemptNumber =
      (input.attemptNumber !== undefined
        ? normalizeRequiredInteger(input.attemptNumber, 'attemptNumber', 1)
        : null) ??
      (await this.queryService.getNextPrintAttemptNumber(sample.id, 'REPRINT'));

    const event = buildEventEnvelope({
      eventType: 'QR_REPRINT_REQUESTED',
      sampleId: sample.id,
      payload: {
        printAction: 'REPRINT',
        attemptNumber,
        printerId: input.printerId ?? null,
        reasonText: input.reasonText ?? null
      },
      fromStatus: null,
      toStatus: null,
      module: 'print',
      actorContext: actor,
      idempotencyScope: 'QR_REPRINT',
      idempotencyKey: input.idempotencyKey ?? randomUUID()
    });

    return this.eventService.appendEvent(event);
  }

  async recordQrPrintFailed(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'record QR print failure');
    const printAction = normalizePrintAction(input.printAction ?? 'PRINT');

    const sample = await this.queryService.requireSample(input.sampleId);
    if (printAction === 'PRINT') {
      assertSampleStatus(sample, ['QR_PENDING_PRINT'], 'record QR print failure');
    } else {
      assertSampleStatus(sample, REPRINT_ALLOWED_STATUSES, 'record QR reprint failure');
    }

    const event = buildEventEnvelope({
      eventType: 'QR_PRINT_FAILED',
      sampleId: sample.id,
      payload: {
        printAction,
        attemptNumber: input.attemptNumber,
        printerId: input.printerId ?? null,
        error: input.error
      },
      fromStatus: null,
      toStatus: null,
      module: 'print',
      actorContext: actor
    });

    return this.eventService.appendEvent(event);
  }

  async recordQrPrinted(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'record QR printed');
    const printAction = normalizePrintAction(input.printAction ?? 'PRINT');
    const sample = await this.queryService.requireSample(input.sampleId);
    const mutatesSample = printAction === 'PRINT' || (printAction === 'REPRINT' && sample.status === 'QR_PENDING_PRINT');

    if (mutatesSample) {
      requireExpectedVersion(input.expectedVersion);
    }

    if (printAction === 'PRINT') {
      assertSampleStatus(sample, ['QR_PENDING_PRINT'], 'record QR printed');
    } else {
      assertSampleStatus(sample, REPRINT_ALLOWED_STATUSES, 'record QR reprint success');
    }

    const event = buildEventEnvelope({
      eventType: 'QR_PRINTED',
      sampleId: sample.id,
      payload: {
        printAction,
        attemptNumber: input.attemptNumber,
        printerId: input.printerId ?? null
      },
      fromStatus: mutatesSample ? 'QR_PENDING_PRINT' : null,
      toStatus: mutatesSample ? 'QR_PRINTED' : null,
      module: 'print',
      actorContext: actor
    });

    if (mutatesSample) {
      return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
    }

    return this.eventService.appendEvent(event);
  }

  async startClassification(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'start classification');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, ['QR_PRINTED'], 'start classification');

    const event = buildEventEnvelope({
      eventType: 'CLASSIFICATION_STARTED',
      sampleId: sample.id,
      payload: {
        classificationId: input.classificationId ?? null,
        notes: input.notes ?? null
      },
      fromStatus: 'QR_PRINTED',
      toStatus: 'CLASSIFICATION_IN_PROGRESS',
      module: 'classification',
      actorContext: actor
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }

  async saveClassificationPartial(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'save classification partial');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, ['CLASSIFICATION_IN_PROGRESS'], 'save classification partial');

    const event = buildEventEnvelope({
      eventType: 'CLASSIFICATION_SAVED_PARTIAL',
      sampleId: sample.id,
      payload: {
        snapshotPartial: input.snapshotPartial,
        ...(typeof input.completionPercent === 'number' ? { completionPercent: input.completionPercent } : {})
      },
      fromStatus: null,
      toStatus: null,
      module: 'classification',
      actorContext: actor
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }

  async completeClassification(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'complete classification');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, ['CLASSIFICATION_IN_PROGRESS'], 'complete classification');
    const classificationPhoto = await this.queryService.findAttachmentByKind(sample.id, PHOTO_KINDS.CLASSIFICATION);
    if (!classificationPhoto) {
      throw new HttpError(409, 'CLASSIFICATION_IN_PROGRESS requires classification photo before completion');
    }
    const classificationDate = buildBusinessDateStamp();

    const payload = {
      classificationPhotoId: classificationPhoto.id,
      classificationData: {
        dataClassificacao: classificationDate
      }
    };

    if (isPlainObject(input.technical)) {
      payload.technical = input.technical;
    }

    if (isPlainObject(input.classificationData)) {
      payload.classificationData = {
        ...input.classificationData,
        dataClassificacao: classificationDate
      };
    }

    if (input.consumptionGrams !== undefined) {
      payload.consumptionGrams = input.consumptionGrams;
    }

    if (typeof input.classificationVersion === 'number') {
      payload.classificationVersion = input.classificationVersion;
    }

    if (typeof input.classifierUserId === 'string' || input.classifierUserId === null) {
      payload.classifierUserId = input.classifierUserId;
    }

    if (typeof input.classifierName === 'string' || input.classifierName === null) {
      payload.classifierName = input.classifierName;
    }

    const event = buildEventEnvelope({
      eventType: 'CLASSIFICATION_COMPLETED',
      sampleId: sample.id,
      payload,
      fromStatus: 'CLASSIFICATION_IN_PROGRESS',
      toStatus: 'CLASSIFIED',
      module: 'classification',
      actorContext: actor,
      idempotencyScope: 'CLASSIFICATION_COMPLETE',
      idempotencyKey: input.idempotencyKey ?? randomUUID()
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
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
    const hasReasonText = typeof input.reasonText === 'string' && input.reasonText.trim().length > 0;
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
      inputOwnerRegistrationId: parsedPatch.ownerRegistrationId,
      hasOwnerClientId: parsedPatch.hasOwnerClientId === true,
      hasOwnerRegistrationId: parsedPatch.hasOwnerRegistrationId === true,
      clientService: this.clientService,
      mode: 'update'
    });
    const effectivePatch = {
      ...parsedPatch,
      resolvedOwnerBinding: ownerBinding
    };
    const updatePayload = buildRegistrationUpdatePayload(sample, effectivePatch);
    if (!updatePayload) {
      throw new HttpError(409, 'No registration changes detected');
    }

    const nextDeclaredSacks =
      updatePayload.after?.declared && Object.prototype.hasOwnProperty.call(updatePayload.after.declared, 'sacks')
        ? updatePayload.after.declared.sacks
        : null;
    if (typeof nextDeclaredSacks === 'number') {
      const currentCommercial = readCurrentCommercialSummary(sample);
      const projection = buildCommercialProjection({
        declaredSacks: nextDeclaredSacks,
        soldSacks: currentCommercial.soldSacks,
        lostSacks: currentCommercial.lostSacks
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

    const event = buildEventEnvelope({
      eventType: 'REGISTRATION_UPDATED',
      sampleId: sample.id,
      payload: {
        before: updatePayload.before,
        after: updatePayload.after,
        reasonCode,
        reasonText
      },
      fromStatus: null,
      toStatus: null,
      module: 'registration',
      actorContext: actor
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }

  async updateClassification(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'update classification');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    assertSampleStatus(sample, CLASSIFICATION_UPDATE_ALLOWED_STATUSES, 'update classification');
    const reasonCode = normalizeUpdateReasonCode(input.reasonCode);
    const hasReasonText = typeof input.reasonText === 'string' && input.reasonText.trim().length > 0;
    if (reasonCode === 'OTHER' && !hasReasonText) {
      throw new HttpError(422, 'reasonText is required when reasonCode is OTHER');
    }
    const reasonText = hasReasonText
      ? normalizeUpdateReasonText(input.reasonText)
      : DEFAULT_REGISTRATION_UPDATE_REASON_TEXT;
    const parsedPatch = parseClassificationUpdatePatch(input.after ?? input.changes ?? {});
    const updatePayload = buildClassificationUpdatePayload(sample, parsedPatch);
    if (!updatePayload) {
      throw new HttpError(409, 'No classification changes detected');
    }

    const event = buildEventEnvelope({
      eventType: 'CLASSIFICATION_UPDATED',
      sampleId: sample.id,
      payload: {
        before: updatePayload.before,
        after: updatePayload.after,
        reasonCode,
        reasonText
      },
      fromStatus: null,
      toStatus: null,
      module: 'classification',
      actorContext: actor
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }

  async createSampleMovement(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'create sample movement');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    if (sample.status === 'INVALIDATED') {
      throw new HttpError(409, `Sample ${sample.id} is INVALIDATED and cannot receive commercial movements`);
    }
    if (!COMMERCIAL_MUTABLE_OPERATIONAL_STATUSES.has(sample.status)) {
      throw new HttpError(409, `Sample ${sample.id} must be CLASSIFIED to create commercial movements`);
    }

    const { declaredSacks, soldSacks, lostSacks } = readCurrentCommercialSummary(sample);
    if (declaredSacks === null) {
      throw new HttpError(409, `Sample ${sample.id} does not have declared sacks to support commercial movements`);
    }

    const movementType = normalizeMovementType(input.movementType);
    const quantitySacks = normalizeMovementQuantity(input.quantitySacks);
    const movementDate = normalizeMovementDate(input.movementDate);
    const notes = normalizeMovementNotes(input.notes, 'notes');

    let buyerBinding = null;
    let lossReasonText = null;
    if (movementType === MOVEMENT_TYPES.SALE) {
      const buyerClientId = normalizeNullableUuid(input.buyerClientId, 'buyerClientId');
      const buyerRegistrationId = normalizeNullableUuid(input.buyerRegistrationId, 'buyerRegistrationId');
      if (!buyerClientId) {
        throw new HttpError(422, 'buyerClientId is required for SALE');
      }
      buyerBinding = await resolveBuyerBindingForMovement({
        clientService: this.clientService,
        buyerClientId,
        buyerRegistrationId: buyerRegistrationId ?? null
      });
      if (input.lossReasonText !== undefined && input.lossReasonText !== null) {
        throw new HttpError(422, 'lossReasonText is not allowed for SALE');
      }
    } else {
      if (input.buyerClientId !== undefined && input.buyerClientId !== null) {
        throw new HttpError(422, 'buyerClientId is not allowed for LOSS');
      }
      if (input.buyerRegistrationId !== undefined && input.buyerRegistrationId !== null) {
        throw new HttpError(422, 'buyerRegistrationId is not allowed for LOSS');
      }
      lossReasonText = normalizeLossReasonText(input.lossReasonText);
    }

    const projection = buildCommercialProjection({
      declaredSacks,
      soldSacks: soldSacks + (movementType === MOVEMENT_TYPES.SALE ? quantitySacks : 0),
      lostSacks: lostSacks + (movementType === MOVEMENT_TYPES.LOSS ? quantitySacks : 0)
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
      commercialStatus: projection.commercialStatus
    };

    const event = buildEventEnvelope({
      eventType: movementType === MOVEMENT_TYPES.SALE ? 'SALE_CREATED' : 'LOSS_RECORDED',
      sampleId: sample.id,
      payload,
      fromStatus: null,
      toStatus: null,
      module: 'commercial',
      actorContext: actor
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }

  async updateSampleMovement(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'update sample movement');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    if (sample.status === 'INVALIDATED') {
      throw new HttpError(409, `Sample ${sample.id} is INVALIDATED and cannot update commercial movements`);
    }
    if (!COMMERCIAL_MUTABLE_OPERATIONAL_STATUSES.has(sample.status)) {
      throw new HttpError(409, `Sample ${sample.id} must be CLASSIFIED to update commercial movements`);
    }

    const movementId = normalizeRequiredText(input.movementId, 'movementId');
    const movement = await this.queryService.requireSampleMovement(sample.id, movementId);
    if (movement.status !== MOVEMENT_STATUSES.ACTIVE) {
      throw new HttpError(409, `Movement ${movement.id} is ${movement.status} and cannot be updated`);
    }

    const patch = parseMovementUpdatePatch(input.after ?? input.changes ?? {});
    const nextMovementType = patch.movementType ?? movement.movementType;
    const nextQuantitySacks = patch.quantitySacks ?? movement.quantitySacks;
    const nextMovementDate = patch.movementDate ?? movement.movementDate;
    const nextNotes =
      patch.notes !== undefined
        ? patch.notes
        : movement.notes;

    let buyerBinding = null;
    let nextBuyerClientId = null;
    let nextBuyerRegistrationId = null;
    let nextLossReasonText = null;

    if (nextMovementType === MOVEMENT_TYPES.SALE) {
      const shouldRebindBuyer =
        movement.movementType !== MOVEMENT_TYPES.SALE ||
        patch.buyerClientId !== undefined ||
        patch.buyerRegistrationId !== undefined ||
        patch.movementType !== undefined;
      const nextClientId =
        patch.buyerClientId !== undefined ? patch.buyerClientId : movement.buyerClientId;
      const nextRegistrationId =
        patch.buyerRegistrationId !== undefined
          ? patch.buyerRegistrationId
          : patch.buyerClientId !== undefined && patch.buyerClientId !== movement.buyerClientId
            ? null
            : movement.buyerRegistrationId;

      if (!nextClientId) {
        throw new HttpError(422, 'buyerClientId is required for SALE');
      }

      if (shouldRebindBuyer) {
        buyerBinding = await resolveBuyerBindingForMovement({
          clientService: this.clientService,
          buyerClientId: nextClientId,
          buyerRegistrationId: nextRegistrationId
        });
        nextBuyerClientId = buyerBinding.buyerClientId;
        nextBuyerRegistrationId = buyerBinding.buyerRegistrationId;
      } else {
        nextBuyerClientId = movement.buyerClientId;
        nextBuyerRegistrationId = movement.buyerRegistrationId;
      }
      nextLossReasonText = null;
    } else {
      if (patch.buyerClientId !== undefined && patch.buyerClientId !== null) {
        throw new HttpError(422, 'buyerClientId is not allowed for LOSS');
      }
      if (patch.buyerRegistrationId !== undefined && patch.buyerRegistrationId !== null) {
        throw new HttpError(422, 'buyerRegistrationId is not allowed for LOSS');
      }
      nextBuyerClientId = null;
      nextBuyerRegistrationId = null;
      nextLossReasonText =
        patch.lossReasonText !== undefined ? patch.lossReasonText : movement.lossReasonText;
    }

    const beforeSnapshot = formatMovementSnapshot(movement);
    const afterSnapshot = {
      movementType: nextMovementType,
      buyerClientId: nextBuyerClientId,
      buyerRegistrationId: nextBuyerRegistrationId,
      quantitySacks: nextQuantitySacks,
      movementDate: nextMovementDate,
      notes: nextNotes ?? null,
      lossReasonText: nextLossReasonText,
      buyerClientSnapshot:
        nextMovementType === MOVEMENT_TYPES.SALE
          ? buyerBinding?.buyerClient ?? movement.buyerClientSnapshot ?? null
          : null,
      buyerRegistrationSnapshot:
        nextMovementType === MOVEMENT_TYPES.SALE
          ? buyerBinding?.buyerRegistration ?? movement.buyerRegistrationSnapshot ?? null
          : null,
      status: movement.status
    };

    if (valuesEqual(beforeSnapshot, afterSnapshot)) {
      throw new HttpError(409, 'No movement changes detected');
    }

    const { declaredSacks, soldSacks, lostSacks } = readCurrentCommercialSummary(sample);
    if (declaredSacks === null) {
      throw new HttpError(409, `Sample ${sample.id} does not have declared sacks to support commercial movements`);
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
        (nextMovementType === MOVEMENT_TYPES.LOSS ? nextQuantitySacks : 0)
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
        commercialStatus: projection.commercialStatus
      },
      fromStatus: null,
      toStatus: null,
      module: 'commercial',
      actorContext: actor
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }

  async cancelSampleMovement(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'cancel sample movement');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    if (sample.status === 'INVALIDATED') {
      throw new HttpError(409, `Sample ${sample.id} is INVALIDATED and cannot cancel commercial movements`);
    }
    if (!COMMERCIAL_MUTABLE_OPERATIONAL_STATUSES.has(sample.status)) {
      throw new HttpError(409, `Sample ${sample.id} must be CLASSIFIED to cancel commercial movements`);
    }

    const movementId = normalizeRequiredText(input.movementId, 'movementId');
    const movement = await this.queryService.requireSampleMovement(sample.id, movementId);
    if (movement.status !== MOVEMENT_STATUSES.ACTIVE) {
      throw new HttpError(409, `Movement ${movement.id} is already ${movement.status}`);
    }

    const { declaredSacks, soldSacks, lostSacks } = readCurrentCommercialSummary(sample);
    if (declaredSacks === null) {
      throw new HttpError(409, `Sample ${sample.id} does not have declared sacks to support commercial movements`);
    }

    const projection = buildCommercialProjection({
      declaredSacks,
      soldSacks: soldSacks - (movement.movementType === MOVEMENT_TYPES.SALE ? movement.quantitySacks : 0),
      lostSacks: lostSacks - (movement.movementType === MOVEMENT_TYPES.LOSS ? movement.quantitySacks : 0)
    });

    const event = buildEventEnvelope({
      eventType: movement.movementType === MOVEMENT_TYPES.SALE ? 'SALE_CANCELLED' : 'LOSS_CANCELLED',
      sampleId: sample.id,
      payload: {
        movementId: movement.id,
        movementType: movement.movementType,
        reasonText: normalizeRequiredText(input.reasonText, 'reasonText', 500),
        soldSacks: projection.soldSacks,
        lostSacks: projection.lostSacks,
        availableSacks: projection.availableSacks,
        commercialStatus: projection.commercialStatus
      },
      fromStatus: null,
      toStatus: null,
      module: 'commercial',
      actorContext: actor
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }

  async revertSampleUpdate(input, actorContext) {
    const actor = requireUserActor(actorContext, USER_ACTION_ROLES, 'revert sample update');
    requireExpectedVersion(input.expectedVersion);

    const sample = await this.queryService.requireSample(input.sampleId);
    const targetEventId = normalizeRequiredText(input.targetEventId, 'targetEventId');
    const reasonCode = normalizeUpdateReasonCode(input.reasonCode);
    const hasReasonText = typeof input.reasonText === 'string' && input.reasonText.trim().length > 0;
    if (reasonCode === 'OTHER' && !hasReasonText) {
      throw new HttpError(422, 'reasonText is required when reasonCode is OTHER');
    }
    const reasonText = hasReasonText
      ? normalizeUpdateReasonText(input.reasonText)
      : DEFAULT_REGISTRATION_UPDATE_REASON_TEXT;

    const targetEvent = await this.queryService.requireSampleEvent(sample.id, targetEventId);
    if (targetEvent.eventType !== 'REGISTRATION_UPDATED' && targetEvent.eventType !== 'CLASSIFICATION_UPDATED') {
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
          reasonText
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
        reasonText
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
    const destination = normalizeOptionalText(input.destination, 'destination', 255);
    const classificationPhotoId = normalizeRequiredText(input.classificationPhotoId, 'classificationPhotoId');
    const templateVersion = normalizeRequiredText(input.templateVersion ?? 'v1', 'templateVersion');
    const selectedFields = normalizeRequiredStringArray(input.selectedFields ?? [], 'selectedFields');
    const sizeBytes = normalizeRequiredInteger(input.sizeBytes, 'sizeBytes', 1);
    const checksumSha256 = normalizeRequiredText(input.checksumSha256, 'checksumSha256').toLowerCase();

    if (!/^[a-f0-9]{64}$/.test(checksumSha256)) {
      throw new HttpError(422, 'checksumSha256 must be a 64-char lowercase hex string');
    }

    const event = buildEventEnvelope({
      eventType: 'REPORT_EXPORTED',
      sampleId: sample.id,
      payload: {
        format,
        exportType,
        fileName,
        destination,
        selectedFields,
        classificationPhotoId,
        templateVersion,
        sizeBytes,
        checksumSha256
      },
      fromStatus: null,
      toStatus: null,
      module: 'classification',
      actorContext: actor
    });

    return this.eventService.appendEvent(event);
  }

  async updateCommercialStatus(input, actorContext) {
    const toCommercialStatus = normalizeCommercialStatus(input.toCommercialStatus);
    if (toCommercialStatus !== 'LOST') {
      throw new HttpError(422, 'Commercial status is now automatic. Only LOST can be triggered manually.');
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
        lossReasonText: input.reasonText
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

    const event = buildEventEnvelope({
      eventType: 'SAMPLE_INVALIDATED',
      sampleId: sample.id,
      payload: {
        reasonCode: input.reasonCode,
        reasonText: input.reasonText
      },
      fromStatus: sample.status,
      toStatus: 'INVALIDATED',
      module: 'registration',
      actorContext: actor,
      idempotencyScope: 'INVALIDATE',
      idempotencyKey: input.idempotencyKey ?? randomUUID()
    });

    return this.eventService.appendEvent(event, { expectedVersion: input.expectedVersion });
  }
}
