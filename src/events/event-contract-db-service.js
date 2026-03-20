import { EventValidator } from '../contracts/event-validator.js';
import { HttpError } from '../contracts/errors.js';
import { isPrismaUniqueViolation } from './prisma-event-store.js';

const MUTATING_EVENT_TYPES = new Set([
  'SAMPLE_RECEIVED',
  'REGISTRATION_STARTED',
  'REGISTRATION_CONFIRMED',
  'QR_PRINT_REQUESTED',
  'CLASSIFICATION_STARTED',
  'CLASSIFICATION_SAVED_PARTIAL',
  'CLASSIFICATION_COMPLETED',
  'SAMPLE_INVALIDATED',
  'REGISTRATION_UPDATED',
  'SALE_CREATED',
  'SALE_UPDATED',
  'SALE_CANCELLED',
  'LOSS_RECORDED',
  'LOSS_UPDATED',
  'LOSS_CANCELLED',
  'COMMERCIAL_STATUS_UPDATED',
  'CLASSIFICATION_UPDATED'
]);

const PRINT_ATTEMPT_EVENTS = new Set(['QR_PRINT_REQUESTED', 'QR_REPRINT_REQUESTED']);
const PRINT_REQUEST_EVENTS = new Set(['QR_PRINT_REQUESTED', 'QR_REPRINT_REQUESTED']);
const PRINT_RESULT_EVENTS = new Set(['QR_PRINTED', 'QR_PRINT_FAILED']);

function isMutatingEvent(event) {
  if (MUTATING_EVENT_TYPES.has(event.eventType)) {
    return true;
  }

  if (event.eventType === 'QR_PRINTED') {
    const printAction = event?.payload?.printAction;
    return printAction === 'PRINT' || event.fromStatus !== null || event.toStatus !== null;
  }

  return false;
}

function tryMapPrismaTriggerError(error) {
  const rawMessage = typeof error?.message === 'string' ? error.message : '';
  if (!rawMessage.includes('code: "P0001"')) {
    return null;
  }

  const extracted = rawMessage.match(/message: "([^"]+)"/)?.[1];
  const message = extracted ?? 'Database trigger rejected operation';
  return new HttpError(409, message);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const CLASSIFICATION_DATA_KEYS = [
  'dataClassificacao',
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
  'loteOrigem',
  'classificadorUserId',
  'consumoGramas',
  'versaoClassificacao'
];

const SIEVE_PERCENT_KEYS = ['p18', 'p17', 'p16', 'mk', 'p15', 'p14', 'p13', 'p10', 'fundo'];

function applyClassificationDataPatch(target, source) {
  if (!isObject(source)) {
    return;
  }

  for (const key of CLASSIFICATION_DATA_KEYS) {
    if (hasOwn(source, key)) {
      target[key] = source[key];
    }
  }

  if (hasOwn(source, 'peneirasPercentuais')) {
    const rawSieve = source.peneirasPercentuais;

    if (rawSieve === null) {
      target.peneirasPercentuais = null;
      return;
    }

    if (!isObject(rawSieve)) {
      return;
    }

    const existingSieve = isObject(target.peneirasPercentuais) ? { ...target.peneirasPercentuais } : {};
    for (const key of SIEVE_PERCENT_KEYS) {
      if (hasOwn(rawSieve, key)) {
        existingSieve[key] = rawSieve[key];
      }
    }

    target.peneirasPercentuais = existingSieve;
  }
}

function applyLegacyTechnicalPatch(target, source) {
  if (!isObject(source) || !isObject(source.technical)) {
    return;
  }

  const technical = source.technical;
  if (hasOwn(technical, 'defectsCount')) {
    target.defeito = technical.defectsCount;
  }
  if (hasOwn(technical, 'moisture')) {
    target.umidade = technical.moisture;
  }
  if (hasOwn(technical, 'colorAspect')) {
    target.aspectoCor = technical.colorAspect;
  }
  if (hasOwn(technical, 'notes')) {
    target.observacoes = technical.notes;
  }
}

function mergeClassificationData(currentData, fromPayload) {
  const merged = isObject(currentData) ? { ...currentData } : {};
  if (!isObject(fromPayload)) {
    return Object.keys(merged).length > 0 ? merged : null;
  }

  applyClassificationDataPatch(merged, fromPayload);

  if (isObject(fromPayload.classificationData)) {
    applyClassificationDataPatch(merged, fromPayload.classificationData);
  }

  applyLegacyTechnicalPatch(merged, fromPayload);

  if (hasOwn(fromPayload, 'consumptionGrams')) {
    merged.consumoGramas = fromPayload.consumptionGrams;
  }
  if (hasOwn(fromPayload, 'classificationVersion')) {
    merged.versaoClassificacao = fromPayload.classificationVersion;
  }
  if (hasOwn(fromPayload, 'classifierUserId')) {
    merged.classificadorUserId = fromPayload.classifierUserId;
  }
  if (hasOwn(fromPayload, 'classifierName')) {
    merged.classificador = fromPayload.classifierName;
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function buildClassificationProjectionPatch({ currentSample, fromPayload, incrementVersionWhenMissing }) {
  if (!isObject(fromPayload)) {
    return {};
  }

  const patch = {};
  const mergedClassificationData = mergeClassificationData(currentSample.latestClassificationData, fromPayload);
  patch.latestClassificationData = mergedClassificationData;

  const technical = isObject(fromPayload.technical) ? fromPayload.technical : null;

  if (hasOwn(fromPayload, 'classificationVersion')) {
    patch.latestClassificationVersion = fromPayload.classificationVersion;
  } else if (incrementVersionWhenMissing) {
    patch.latestClassificationVersion =
      currentSample.latestClassificationVersion === null ? 1 : currentSample.latestClassificationVersion + 1;
  }

  if (technical && hasOwn(technical, 'type')) {
    patch.latestType = technical.type;
  }
  if (technical && hasOwn(technical, 'screen')) {
    patch.latestScreen = technical.screen;
  }
  if (technical && hasOwn(technical, 'density')) {
    patch.latestDensity = technical.density;
  }

  if (mergedClassificationData && hasOwn(mergedClassificationData, 'defeito')) {
    patch.latestDefectsCount = mergedClassificationData.defeito;
  } else if (technical && hasOwn(technical, 'defectsCount')) {
    patch.latestDefectsCount = technical.defectsCount;
  }

  if (mergedClassificationData && hasOwn(mergedClassificationData, 'umidade')) {
    patch.latestMoisture = mergedClassificationData.umidade;
  } else if (technical && hasOwn(technical, 'moisture')) {
    patch.latestMoisture = technical.moisture;
  }

  if (mergedClassificationData && hasOwn(mergedClassificationData, 'aspectoCor')) {
    patch.latestColorAspect = mergedClassificationData.aspectoCor;
  } else if (technical && hasOwn(technical, 'colorAspect')) {
    patch.latestColorAspect = technical.colorAspect;
  }

  if (mergedClassificationData && hasOwn(mergedClassificationData, 'observacoes')) {
    patch.latestNotes = mergedClassificationData.observacoes;
  } else if (technical && hasOwn(technical, 'notes')) {
    patch.latestNotes = technical.notes;
  }

  return patch;
}

function buildSampleCreateData(event) {
  return {
    id: event.sampleId,
    status: event.toStatus,
    commercialStatus: 'OPEN',
    version: 1,
    lastEventSequence: event.sequenceNumber
  };
}

function buildSampleUpdateData(currentSample, event, mutatesSample) {
  const updateData = {
    lastEventSequence: event.sequenceNumber
  };

  if (event.toStatus !== null) {
    updateData.status = event.toStatus;
  }

  if (mutatesSample) {
    updateData.version = { increment: 1 };
  }

  if (event.eventType === 'REGISTRATION_CONFIRMED') {
    const labelPhotos = Array.isArray(event.payload.labelPhotos) ? event.payload.labelPhotos : [];

    updateData.internalLotNumber = event.payload.sampleLotNumber;
    if (hasOwn(event.payload, 'ownerClientId')) {
      updateData.ownerClientId = event.payload.ownerClientId ?? null;
      updateData.ownerRegistrationId = hasOwn(event.payload, 'ownerRegistrationId')
        ? event.payload.ownerRegistrationId ?? null
        : null;
    }
    updateData.declaredOwner = event.payload.declared.owner;
    updateData.declaredSacks = event.payload.declared.sacks;
    updateData.declaredHarvest = event.payload.declared.harvest;
    updateData.declaredOriginLot = event.payload.declared.originLot;
    updateData.labelPhotoCount = labelPhotos.length;
  }

  if (event.eventType === 'REGISTRATION_UPDATED') {
    const after = event.payload.after ?? {};
    const declaredAfter = after.declared ?? {};

    if (hasOwn(after, 'ownerClientId')) updateData.ownerClientId = after.ownerClientId;
    if (hasOwn(after, 'ownerRegistrationId')) updateData.ownerRegistrationId = after.ownerRegistrationId;

    if (hasOwn(after, 'owner')) updateData.declaredOwner = after.owner;
    if (hasOwn(after, 'sacks')) updateData.declaredSacks = after.sacks;
    if (hasOwn(after, 'harvest')) updateData.declaredHarvest = after.harvest;
    if (hasOwn(after, 'originLot')) updateData.declaredOriginLot = after.originLot;

    if (hasOwn(declaredAfter, 'owner')) updateData.declaredOwner = declaredAfter.owner;
    if (hasOwn(declaredAfter, 'sacks')) updateData.declaredSacks = declaredAfter.sacks;
    if (hasOwn(declaredAfter, 'harvest')) updateData.declaredHarvest = declaredAfter.harvest;
    if (hasOwn(declaredAfter, 'originLot')) updateData.declaredOriginLot = declaredAfter.originLot;

    if (hasOwn(after, 'soldSacks')) updateData.soldSacks = after.soldSacks;
    if (hasOwn(after, 'lostSacks')) updateData.lostSacks = after.lostSacks;
    if (hasOwn(after, 'commercialStatus')) updateData.commercialStatus = after.commercialStatus;
  }

  if (event.eventType === 'CLASSIFICATION_SAVED_PARTIAL') {
    updateData.classificationDraftData = mergeClassificationData(
      currentSample.classificationDraftData,
      event.payload.snapshotPartial
    );
    if (hasOwn(event.payload, 'completionPercent')) {
      updateData.classificationDraftCompletionPercent = event.payload.completionPercent;
    }
  }

  if (event.eventType === 'CLASSIFICATION_COMPLETED') {
    Object.assign(
      updateData,
      buildClassificationProjectionPatch({
        currentSample,
        fromPayload: event.payload,
        incrementVersionWhenMissing: true
      })
    );
    updateData.classificationDraftData = null;
    updateData.classificationDraftCompletionPercent = null;
  }

  if (event.eventType === 'CLASSIFICATION_UPDATED') {
    Object.assign(
      updateData,
      buildClassificationProjectionPatch({
        currentSample,
        fromPayload: event.payload.after,
        incrementVersionWhenMissing: false
      })
    );
  }

  if (event.eventType === 'COMMERCIAL_STATUS_UPDATED') {
    updateData.commercialStatus = event.payload.toCommercialStatus;
  }

  if (
    event.eventType === 'SALE_CREATED' ||
    event.eventType === 'SALE_UPDATED' ||
    event.eventType === 'SALE_CANCELLED' ||
    event.eventType === 'LOSS_RECORDED' ||
    event.eventType === 'LOSS_UPDATED' ||
    event.eventType === 'LOSS_CANCELLED'
  ) {
    if (hasOwn(event.payload, 'soldSacks')) {
      updateData.soldSacks = event.payload.soldSacks;
    }
    if (hasOwn(event.payload, 'lostSacks')) {
      updateData.lostSacks = event.payload.lostSacks;
    }
    if (hasOwn(event.payload, 'commercialStatus')) {
      updateData.commercialStatus = event.payload.commercialStatus;
    }
  }

  return updateData;
}

export class EventContractDbService {
  constructor({ store, validator = new EventValidator() }) {
    this.store = store;
    this.validator = validator;
  }

  async appendEvent(eventDraft, options = {}) {
    const { expectedVersion, simulateFailureAfterSampleMutation = false } = options;
    const hasIdempotency = Boolean(eventDraft.idempotencyScope && eventDraft.idempotencyKey);
    const checksPrintAttempt = PRINT_ATTEMPT_EVENTS.has(eventDraft.eventType);

    try {
      return await this.store.withTransaction(async (tx) => {
        if (hasIdempotency) {
          const existingByIdempotency = await tx.findEventByIdempotency(
            eventDraft.sampleId,
            eventDraft.idempotencyScope,
            eventDraft.idempotencyKey
          );

          if (existingByIdempotency) {
            return {
              statusCode: 200,
              idempotent: true,
              event: tx.mapEvent(existingByIdempotency)
            };
          }
        }

        if (checksPrintAttempt) {
          const existingByAttempt = await tx.findEventByPrintAttempt(
            eventDraft.sampleId,
            eventDraft.payload.printAction,
            eventDraft.payload.attemptNumber
          );

          if (existingByAttempt) {
            return {
              statusCode: 200,
              idempotent: true,
              event: tx.mapEvent(existingByAttempt)
            };
          }
        }

        const sample = await tx.getSampleForUpdate(eventDraft.sampleId);
        if (!sample && eventDraft.eventType !== 'SAMPLE_RECEIVED') {
          throw new HttpError(404, `Sample ${eventDraft.sampleId} does not exist`);
        }

        if (sample?.status === 'INVALIDATED') {
          throw new HttpError(409, `Sample ${eventDraft.sampleId} is INVALIDATED and cannot receive new events`);
        }

        if (sample && eventDraft.eventType === 'SAMPLE_RECEIVED') {
          throw new HttpError(409, `Sample ${eventDraft.sampleId} already exists`);
        }

        const sequenceNumber = (sample?.lastEventSequence ?? 0) + 1;
        const event = {
          ...eventDraft,
          sequenceNumber
        };

        this.validator.validate(event);

        const hasStatusTransition = event.fromStatus !== null || event.toStatus !== null;
        const mutatesSample = isMutatingEvent(event);

        if (sample && hasStatusTransition && event.fromStatus !== null && sample.status !== event.fromStatus) {
          throw new HttpError(
            409,
            `Invalid status transition. current=${sample.status} fromStatus=${event.fromStatus}`
          );
        }

        let persistedSample;
        if (!sample) {
          persistedSample = await tx.createSample(buildSampleCreateData(event));
        } else {
          if (mutatesSample) {
            if (typeof expectedVersion !== 'number') {
              throw new HttpError(409, 'expectedVersion is required for sample mutations');
            }
            if (sample.version !== expectedVersion) {
              throw new HttpError(
                409,
                `Version conflict. expected=${expectedVersion} current=${sample.version}`
              );
            }
          }

          const updateData = buildSampleUpdateData(sample, event, mutatesSample);

          if (mutatesSample) {
            persistedSample = await tx.updateSampleByVersion(sample.id, expectedVersion, updateData);
            if (!persistedSample) {
              throw new HttpError(409, 'Version conflict while updating sample');
            }
          } else {
            persistedSample = await tx.updateSample(sample.id, updateData);
          }
        }

        if (event.eventType === 'PHOTO_ADDED') {
          await tx.createAttachmentFromEvent(event);
        }

        if (event.eventType === 'SALE_CREATED' || event.eventType === 'LOSS_RECORDED') {
          await tx.createSampleMovementFromEvent(event);
        }

        if (event.eventType === 'SALE_UPDATED' || event.eventType === 'LOSS_UPDATED') {
          const updatedMovement = await tx.updateSampleMovementFromEvent(event);
          if (!updatedMovement) {
            throw new HttpError(404, `Sample movement ${event.payload.movementId} does not exist`);
          }
        }

        if (event.eventType === 'SALE_CANCELLED' || event.eventType === 'LOSS_CANCELLED') {
          const cancelledMovement = await tx.cancelSampleMovementFromEvent(event);
          if (!cancelledMovement) {
            throw new HttpError(404, `Sample movement ${event.payload.movementId} does not exist`);
          }
        }

        if (simulateFailureAfterSampleMutation) {
          throw new HttpError(500, 'Simulated failure after sample mutation');
        }

        const eventRecord = await tx.insertEvent(event);

        if (PRINT_REQUEST_EVENTS.has(event.eventType)) {
          await tx.createPrintJobFromRequestedEvent(event, eventRecord.eventId);
        }

        if (PRINT_RESULT_EVENTS.has(event.eventType)) {
          const completedJob = await tx.completePrintJobFromResultEvent(event, eventRecord.eventId);
          if (!completedJob) {
            throw new HttpError(
              409,
              `Print job not found or already finalized for action=${event.payload.printAction} attempt=${event.payload.attemptNumber}`
            );
          }
        }

        return {
          statusCode: 201,
          idempotent: false,
          sample: persistedSample,
          event: tx.mapEvent(eventRecord)
        };
      });
    } catch (error) {
      const mappedTriggerError = tryMapPrismaTriggerError(error);
      if (mappedTriggerError) {
        throw mappedTriggerError;
      }

      if (isPrismaUniqueViolation(error)) {
        if (hasIdempotency) {
          const existingByIdempotency = await this.store.findEventByIdempotency(
            eventDraft.sampleId,
            eventDraft.idempotencyScope,
            eventDraft.idempotencyKey
          );

          if (existingByIdempotency) {
            return {
              statusCode: 200,
              idempotent: true,
              event: existingByIdempotency
            };
          }
        }

        if (checksPrintAttempt) {
          const existingByAttempt = await this.store.findEventByPrintAttempt(
            eventDraft.sampleId,
            eventDraft.payload.printAction,
            eventDraft.payload.attemptNumber
          );

          if (existingByAttempt) {
            return {
              statusCode: 200,
              idempotent: true,
              event: existingByAttempt
            };
          }
        }
      }

      throw error;
    }
  }
}
