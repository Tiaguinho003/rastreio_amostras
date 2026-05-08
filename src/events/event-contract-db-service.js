import { EventValidator } from '../contracts/event-validator.js';
import { HttpError } from '../contracts/errors.js';
import { isPrismaUniqueViolation } from './prisma-event-store.js';

// Q.print: QR_PRINT_REQUESTED e QR_PRINTED viraram audit-only (nao
// mutam status do sample). Removidos do MUTATING_EVENT_TYPES — agora so
// alimentam projecao via PrintJob (via PRINT_REQUEST_EVENTS / PRINT_RESULT_EVENTS).
const MUTATING_EVENT_TYPES = new Set([
  'REGISTRATION_CONFIRMED',
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
  'CLASSIFICATION_UPDATED',
]);

// Q.print: QR_REPRINT_REQUESTED removido (cortado em P1). Toda impressao
// vira via QR_PRINT_REQUESTED com attemptNumber sequencial.
const PRINT_ATTEMPT_EVENTS = new Set(['QR_PRINT_REQUESTED']);
const PRINT_REQUEST_EVENTS = new Set(['QR_PRINT_REQUESTED']);
const PRINT_RESULT_EVENTS = new Set(['QR_PRINTED', 'QR_PRINT_FAILED']);

function isMutatingEvent(event) {
  return MUTATING_EVENT_TYPES.has(event.eventType);
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

// Q.cls.2.7: ficha unificada — 6 flat fields (padrao/aspecto/certif/
// catacao/observacoes/bebida) + dataClassificacao. Sem broca/pva/imp/
// ap/gpi/defeito/safra (movidos pra sub-obj defeitos ou removidos).
const CLASSIFICATION_DATA_KEYS = [
  'dataClassificacao',
  'padrao',
  'aspecto',
  'certif',
  'catacao',
  'observacoes',
  'bebida',
];

const PENEIRA_KEYS = ['p18', 'p17', 'p16', 'p15', 'p14', 'p13', 'p12', 'p11', 'p10', 'mk'];
const DEFEITO_KEYS = ['imp', 'pva', 'broca', 'gpi', 'ap', 'defeito'];

function applyClassificationDataPatch(target, source) {
  if (!isObject(source)) {
    return;
  }

  // Flat fields (texto livre).
  for (const key of CLASSIFICATION_DATA_KEYS) {
    if (hasOwn(source, key)) {
      target[key] = source[key];
    }
  }

  // peneiras: sub-obj com 10 chaves (p18..p10/mk). Merge campo a campo.
  if (hasOwn(source, 'peneiras')) {
    const rawSieve = source.peneiras;
    if (rawSieve === null) {
      target.peneiras = null;
    } else if (isObject(rawSieve)) {
      const existing = isObject(target.peneiras) ? { ...target.peneiras } : {};
      for (const key of PENEIRA_KEYS) {
        if (hasOwn(rawSieve, key)) {
          existing[key] = rawSieve[key];
        }
      }
      target.peneiras = existing;
    }
  }

  // fundos: array de 2 elementos top-level. Substitui inteiro (nao merge).
  if (hasOwn(source, 'fundos')) {
    const rawFundos = source.fundos;
    if (rawFundos === null) {
      target.fundos = null;
    } else if (Array.isArray(rawFundos)) {
      target.fundos = rawFundos;
    }
  }

  // defeitos: sub-obj com 6 chaves. Merge campo a campo.
  if (hasOwn(source, 'defeitos')) {
    const rawDefeitos = source.defeitos;
    if (rawDefeitos === null) {
      target.defeitos = null;
    } else if (isObject(rawDefeitos)) {
      const existing = isObject(target.defeitos) ? { ...target.defeitos } : {};
      for (const key of DEFEITO_KEYS) {
        if (hasOwn(rawDefeitos, key)) {
          existing[key] = rawDefeitos[key];
        }
      }
      target.defeitos = existing;
    }
  }
}

// Q.cls.2.7: technical.notes ainda copiado para observacoes flat por
// compat. defectsCount NAO mais escrito em target.defeito (campo flat
// nao existe na ficha unificada — defeito vive em sub-obj defeitos).
function applyLegacyTechnicalPatch(target, source) {
  if (!isObject(source) || !isObject(source.technical)) {
    return;
  }

  const technical = source.technical;
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

  // classifiers e o campo canonico (array de snapshots {id, fullName,
  // username}, minItems 1). Q.cls.2.7 removeu os legacy classifierUserId/
  // classifierName/conferredBy do schema do evento, entao nao sao mais
  // alcancaveis via fromPayload.
  if (hasOwn(fromPayload, 'classifiers')) {
    merged.classificadores = fromPayload.classifiers;
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function buildClassificationProjectionPatch({
  currentSample,
  fromPayload,
  incrementVersionWhenMissing,
}) {
  if (!isObject(fromPayload)) {
    return {};
  }

  const patch = {};
  const mergedClassificationData = mergeClassificationData(
    currentSample.latestClassificationData,
    fromPayload
  );
  patch.latestClassificationData = mergedClassificationData;

  const technical = isObject(fromPayload.technical) ? fromPayload.technical : null;

  if (hasOwn(fromPayload, 'classificationVersion')) {
    patch.latestClassificationVersion = fromPayload.classificationVersion;
  } else if (incrementVersionWhenMissing) {
    patch.latestClassificationVersion =
      currentSample.latestClassificationVersion === null
        ? 1
        : currentSample.latestClassificationVersion + 1;
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
    const defeitoRaw = mergedClassificationData.defeito;
    const defeitoParsed =
      typeof defeitoRaw === 'string'
        ? parseInt(defeitoRaw, 10)
        : typeof defeitoRaw === 'number'
          ? defeitoRaw
          : NaN;
    patch.latestDefectsCount = Number.isFinite(defeitoParsed) ? Math.round(defeitoParsed) : null;
  } else if (technical && hasOwn(technical, 'defectsCount')) {
    patch.latestDefectsCount = technical.defectsCount;
  }

  if (mergedClassificationData && hasOwn(mergedClassificationData, 'observacoes')) {
    patch.latestNotes = mergedClassificationData.observacoes;
  } else if (technical && hasOwn(technical, 'notes')) {
    patch.latestNotes = technical.notes;
  }

  return patch;
}

function buildSampleCreateData(event) {
  const data = {
    id: event.sampleId,
    status: event.toStatus,
    commercialStatus: 'OPEN',
    version: 1,
    lastEventSequence: event.sequenceNumber,
  };

  // Fase Q: REGISTRATION_CONFIRMED é o evento criador único do sample. Os
  // campos `declared.*`, `internalLotNumber` e `ownerClientId/UnitId` vêm
  // direto do payload (antes vinham via update do REGISTRATION_CONFIRMED
  // sobre um sample já criado por SAMPLE_RECEIVED).
  if (event.eventType === 'REGISTRATION_CONFIRMED') {
    data.internalLotNumber = event.payload.sampleLotNumber;
    if (hasOwn(event.payload, 'ownerClientId')) {
      data.ownerClientId = event.payload.ownerClientId ?? null;
    }
    if (hasOwn(event.payload, 'ownerUnitId')) {
      data.ownerUnitId = event.payload.ownerUnitId ?? null;
    }
    data.declaredOwner = event.payload.declared.owner;
    data.declaredSacks = event.payload.declared.sacks;
    data.declaredHarvest = event.payload.declared.harvest;
    if (hasOwn(event.payload.declared, 'originLot')) {
      data.declaredOriginLot = event.payload.declared.originLot;
    }
    if (hasOwn(event.payload.declared, 'location')) {
      data.declaredLocation = event.payload.declared.location;
    }
  }

  return data;
}

function buildSampleUpdateData(currentSample, event, mutatesSample) {
  const updateData = {
    lastEventSequence: event.sequenceNumber,
  };

  if (event.toStatus !== null) {
    updateData.status = event.toStatus;
  }

  if (mutatesSample) {
    updateData.version = { increment: 1 };
  }

  if (event.eventType === 'REGISTRATION_CONFIRMED') {
    updateData.internalLotNumber = event.payload.sampleLotNumber;
    if (hasOwn(event.payload, 'ownerClientId')) {
      updateData.ownerClientId = event.payload.ownerClientId ?? null;
      updateData.ownerUnitId = hasOwn(event.payload, 'ownerUnitId')
        ? (event.payload.ownerUnitId ?? null)
        : null;
    }
    updateData.declaredOwner = event.payload.declared.owner;
    updateData.declaredSacks = event.payload.declared.sacks;
    updateData.declaredHarvest = event.payload.declared.harvest;
    updateData.declaredOriginLot = event.payload.declared.originLot;
    if (hasOwn(event.payload.declared, 'location'))
      updateData.declaredLocation = event.payload.declared.location;
  }

  if (event.eventType === 'REGISTRATION_UPDATED') {
    const after = event.payload.after ?? {};
    const declaredAfter = after.declared ?? {};

    if (hasOwn(after, 'ownerClientId')) updateData.ownerClientId = after.ownerClientId;
    if (hasOwn(after, 'ownerUnitId')) updateData.ownerUnitId = after.ownerUnitId;

    if (hasOwn(after, 'owner')) updateData.declaredOwner = after.owner;
    if (hasOwn(after, 'sacks')) updateData.declaredSacks = after.sacks;
    if (hasOwn(after, 'harvest')) updateData.declaredHarvest = after.harvest;
    if (hasOwn(after, 'originLot')) updateData.declaredOriginLot = after.originLot;
    if (hasOwn(after, 'location')) updateData.declaredLocation = after.location;

    if (hasOwn(declaredAfter, 'owner')) updateData.declaredOwner = declaredAfter.owner;
    if (hasOwn(declaredAfter, 'sacks')) updateData.declaredSacks = declaredAfter.sacks;
    if (hasOwn(declaredAfter, 'harvest')) updateData.declaredHarvest = declaredAfter.harvest;
    if (hasOwn(declaredAfter, 'originLot')) updateData.declaredOriginLot = declaredAfter.originLot;
    if (hasOwn(declaredAfter, 'location')) updateData.declaredLocation = declaredAfter.location;

    if (hasOwn(after, 'soldSacks')) updateData.soldSacks = after.soldSacks;
    if (hasOwn(after, 'lostSacks')) updateData.lostSacks = after.lostSacks;
    if (hasOwn(after, 'commercialStatus')) updateData.commercialStatus = after.commercialStatus;
  }

  if (event.eventType === 'CLASSIFICATION_COMPLETED') {
    Object.assign(
      updateData,
      buildClassificationProjectionPatch({
        currentSample,
        fromPayload: event.payload,
        incrementVersionWhenMissing: true,
      })
    );
    updateData.classifiedAt = event.occurredAt;
    if (hasOwn(event.payload, 'classificationType')) {
      updateData.classificationType = event.payload.classificationType;
    }
  }

  if (event.eventType === 'CLASSIFICATION_UPDATED') {
    Object.assign(
      updateData,
      buildClassificationProjectionPatch({
        currentSample,
        fromPayload: event.payload.after,
        incrementVersionWhenMissing: false,
      })
    );
    if (hasOwn(event.payload, 'classificationType')) {
      updateData.classificationType = event.payload.classificationType;
    }
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
              event: tx.mapEvent(existingByIdempotency),
            };
          }
        }

        if (checksPrintAttempt) {
          const existingByAttempt = await tx.findEventByPrintAttempt(
            eventDraft.sampleId,
            eventDraft.payload.attemptNumber
          );

          if (existingByAttempt) {
            return {
              statusCode: 200,
              idempotent: true,
              event: tx.mapEvent(existingByAttempt),
            };
          }
        }

        const sample = await tx.getSampleForUpdate(eventDraft.sampleId);
        if (!sample && eventDraft.eventType !== 'REGISTRATION_CONFIRMED') {
          throw new HttpError(404, `Sample ${eventDraft.sampleId} does not exist`);
        }

        if (sample?.status === 'INVALIDATED') {
          throw new HttpError(
            409,
            `Sample ${eventDraft.sampleId} is INVALIDATED and cannot receive new events`
          );
        }

        if (
          sample &&
          eventDraft.eventType === 'REGISTRATION_CONFIRMED' &&
          eventDraft.fromStatus === null
        ) {
          throw new HttpError(409, `Sample ${eventDraft.sampleId} already exists`);
        }

        const sequenceNumber = (sample?.lastEventSequence ?? 0) + 1;
        const event = {
          ...eventDraft,
          sequenceNumber,
        };

        this.validator.validate(event);

        const hasStatusTransition = event.fromStatus !== null || event.toStatus !== null;
        const mutatesSample = isMutatingEvent(event);

        if (
          sample &&
          hasStatusTransition &&
          event.fromStatus !== null &&
          sample.status !== event.fromStatus
        ) {
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
            persistedSample = await tx.updateSampleByVersion(
              sample.id,
              expectedVersion,
              updateData
            );
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
              `Print job not found or already finalized for attempt=${event.payload.attemptNumber}`
            );
          }
        }

        return {
          statusCode: 201,
          idempotent: false,
          sample: persistedSample,
          event: tx.mapEvent(eventRecord),
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
              event: existingByIdempotency,
            };
          }
        }

        if (checksPrintAttempt) {
          const existingByAttempt = await this.store.findEventByPrintAttempt(
            eventDraft.sampleId,
            eventDraft.payload.attemptNumber
          );

          if (existingByAttempt) {
            return {
              statusCode: 200,
              idempotent: true,
              event: existingByAttempt,
            };
          }
        }
      }

      throw error;
    }
  }
}
