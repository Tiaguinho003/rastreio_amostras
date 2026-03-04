import { randomUUID } from 'node:crypto';

function nowUtcIso() {
  return new Date().toISOString();
}

export function buildEvent({
  eventType,
  sampleId,
  payload,
  fromStatus,
  toStatus,
  actorType = 'USER',
  actorUserId = randomUUID(),
  source = 'api',
  schemaVersion = 1,
  module = 'registration',
  idempotencyScope,
  idempotencyKey
}) {
  const event = {
    eventId: randomUUID(),
    eventType,
    sampleId,
    occurredAt: nowUtcIso(),
    actorType,
    actorUserId: actorType === 'SYSTEM' ? null : actorUserId,
    source,
    schemaVersion,
    payload,
    requestId: randomUUID(),
    correlationId: null,
    causationId: null,
    fromStatus,
    toStatus,
    metadata: {
      module,
      ip: null,
      userAgent: null
    }
  };

  if (idempotencyScope && idempotencyKey) {
    event.idempotencyScope = idempotencyScope;
    event.idempotencyKey = idempotencyKey;
  }

  return event;
}

export function sampleReceivedEvent(sampleId) {
  return buildEvent({
    eventType: 'SAMPLE_RECEIVED',
    sampleId,
    fromStatus: null,
    toStatus: 'PHYSICAL_RECEIVED',
    payload: {
      receivedChannel: 'in_person',
      notes: null
    },
    module: 'registration'
  });
}

export function registrationStartedEvent(sampleId) {
  return buildEvent({
    eventType: 'REGISTRATION_STARTED',
    sampleId,
    fromStatus: 'PHYSICAL_RECEIVED',
    toStatus: 'REGISTRATION_IN_PROGRESS',
    payload: {
      notes: null
    },
    module: 'registration'
  });
}

export function registrationConfirmedEvent(sampleId, overrides = {}) {
  return buildEvent({
    eventType: 'REGISTRATION_CONFIRMED',
    sampleId,
    fromStatus: 'REGISTRATION_IN_PROGRESS',
    toStatus: 'REGISTRATION_CONFIRMED',
    idempotencyScope: 'REGISTRATION_CONFIRM',
    idempotencyKey: randomUUID(),
    payload: {
      sampleLotNumber: 'AM-2026-000381',
      declared: {
        owner: 'Produtor XPTO',
        sacks: 10,
        harvest: '24/25',
        originLot: 'LOTE-ORIGEM-001'
      },
      labelPhotos: ['attachment-1'],
      ocr: {
        provider: 'LOCAL',
        overallConfidence: 0.82,
        fieldConfidence: {
          owner: 0.9,
          sacks: 0.7,
          harvest: 0.8,
          originLot: 0.6
        },
        rawTextRef: null
      }
    },
    module: 'registration',
    ...overrides
  });
}

export function photoAddedEvent(sampleId, overrides = {}) {
  const payload = overrides.payload ?? {};
  return buildEvent({
    eventType: 'PHOTO_ADDED',
    sampleId,
    fromStatus: null,
    toStatus: null,
    payload: {
      attachmentId: payload.attachmentId ?? 'attachment-1',
      kind: payload.kind ?? 'ARRIVAL_PHOTO',
      storagePath: payload.storagePath ?? `samples/${sampleId}/arrival/attachment-1-foto.jpg`,
      fileName: payload.fileName ?? 'foto.jpg',
      mimeType: payload.mimeType ?? 'image/jpeg',
      sizeBytes: payload.sizeBytes ?? 1024,
      checksumSha256: payload.checksumSha256 ?? null
    },
    module: payload.kind === 'CLASSIFICATION_PHOTO' ? 'classification' : 'registration',
    ...overrides
  });
}

export function qrPrintRequestedEvent(sampleId, overrides = {}) {
  return buildEvent({
    eventType: 'QR_PRINT_REQUESTED',
    sampleId,
    fromStatus: 'REGISTRATION_CONFIRMED',
    toStatus: 'QR_PENDING_PRINT',
    idempotencyScope: 'QR_PRINT',
    idempotencyKey: randomUUID(),
    payload: {
      printAction: 'PRINT',
      attemptNumber: 1,
      printerId: null
    },
    module: 'print',
    ...overrides
  });
}

export function sampleInvalidatedEvent(sampleId, fromStatus = 'PHYSICAL_RECEIVED', overrides = {}) {
  return buildEvent({
    eventType: 'SAMPLE_INVALIDATED',
    sampleId,
    fromStatus,
    toStatus: 'INVALIDATED',
    idempotencyScope: 'INVALIDATE',
    idempotencyKey: randomUUID(),
    payload: {
      reasonCode: 'OTHER',
      reasonText: 'manual invalidation'
    },
    module: 'registration',
    ...overrides
  });
}

export function qrPrintFailedEvent(sampleId, overrides = {}) {
  return buildEvent({
    eventType: 'QR_PRINT_FAILED',
    sampleId,
    fromStatus: null,
    toStatus: null,
    payload: {
      printAction: 'PRINT',
      attemptNumber: 1,
      printerId: null,
      error: 'printer offline'
    },
    module: 'print',
    ...overrides
  });
}

export function qrPrintedEvent(sampleId, overrides = {}) {
  return buildEvent({
    eventType: 'QR_PRINTED',
    sampleId,
    fromStatus: 'QR_PENDING_PRINT',
    toStatus: 'QR_PRINTED',
    payload: {
      printAction: 'PRINT',
      attemptNumber: 1,
      printerId: null
    },
    module: 'print',
    ...overrides
  });
}

export function qrReprintRequestedEvent(sampleId, overrides = {}) {
  return buildEvent({
    eventType: 'QR_REPRINT_REQUESTED',
    sampleId,
    fromStatus: null,
    toStatus: null,
    idempotencyScope: 'QR_REPRINT',
    idempotencyKey: randomUUID(),
    payload: {
      printAction: 'REPRINT',
      attemptNumber: 1,
      printerId: null,
      reasonText: null
    },
    module: 'print',
    ...overrides
  });
}

export function reportExportedEvent(sampleId, overrides = {}) {
  const { payload: payloadOverrides = {}, ...eventOverrides } = overrides;

  return buildEvent({
    eventType: 'REPORT_EXPORTED',
    sampleId,
    fromStatus: null,
    toStatus: null,
    payload: {
      format: 'PDF',
      exportType: 'COMPLETO',
      fileName: 'amostra(AM-2026-000001).pdf',
      destination: null,
      selectedFields: ['owner', 'sacks', 'harvest'],
      classificationPhotoId: randomUUID(),
      templateVersion: 'v1',
      sizeBytes: 2048,
      checksumSha256: 'a'.repeat(64),
      ...payloadOverrides
    },
    module: 'classification',
    ...eventOverrides
  });
}
