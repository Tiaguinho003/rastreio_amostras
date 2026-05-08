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
  idempotencyKey,
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
      userAgent: null,
    },
  };

  if (idempotencyScope && idempotencyKey) {
    event.idempotencyScope = idempotencyScope;
    event.idempotencyKey = idempotencyKey;
  }

  return event;
}

export function registrationConfirmedEvent(sampleId, overrides = {}) {
  const { payload: payloadOverrides = {}, ...eventOverrides } = overrides;
  return buildEvent({
    eventType: 'REGISTRATION_CONFIRMED',
    sampleId,
    fromStatus: null,
    toStatus: 'REGISTRATION_CONFIRMED',
    idempotencyScope: 'REGISTRATION_CONFIRM',
    idempotencyKey: randomUUID(),
    payload: {
      sampleLotNumber: '5444',
      declared: {
        owner: 'Produtor XPTO',
        sacks: 10,
        harvest: '24/25',
        originLot: 'LOTE-ORIGEM-001',
      },
      receivedChannel: 'in_person',
      ...payloadOverrides,
    },
    module: 'registration',
    ...eventOverrides,
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
      kind: payload.kind ?? 'CLASSIFICATION_PHOTO',
      storagePath:
        payload.storagePath ?? `samples/${sampleId}/classification/attachment-1-foto.jpg`,
      fileName: payload.fileName ?? 'foto.jpg',
      mimeType: payload.mimeType ?? 'image/jpeg',
      sizeBytes: payload.sizeBytes ?? 1024,
      checksumSha256: payload.checksumSha256 ?? null,
    },
    module: 'classification',
    ...overrides,
  });
}

// Q.print: QR_PRINT_REQUESTED virou audit-only (fromStatus/toStatus null).
export function qrPrintRequestedEvent(sampleId, overrides = {}) {
  return buildEvent({
    eventType: 'QR_PRINT_REQUESTED',
    sampleId,
    fromStatus: null,
    toStatus: null,
    idempotencyScope: 'QR_PRINT',
    idempotencyKey: randomUUID(),
    payload: {
      printAction: 'PRINT',
      attemptNumber: 1,
      printerId: null,
    },
    module: 'print',
    ...overrides,
  });
}

export function sampleInvalidatedEvent(
  sampleId,
  fromStatus = 'REGISTRATION_CONFIRMED',
  overrides = {}
) {
  return buildEvent({
    eventType: 'SAMPLE_INVALIDATED',
    sampleId,
    fromStatus,
    toStatus: 'INVALIDATED',
    idempotencyScope: 'INVALIDATE',
    idempotencyKey: randomUUID(),
    payload: {
      reasonCode: 'OTHER',
      reasonText: 'manual invalidation',
    },
    module: 'registration',
    ...overrides,
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
      error: 'printer offline',
    },
    module: 'print',
    ...overrides,
  });
}

// Q.print: QR_PRINTED virou audit-only (fromStatus/toStatus null).
export function qrPrintedEvent(sampleId, overrides = {}) {
  return buildEvent({
    eventType: 'QR_PRINTED',
    sampleId,
    fromStatus: null,
    toStatus: null,
    payload: {
      printAction: 'PRINT',
      attemptNumber: 1,
      printerId: null,
    },
    module: 'print',
    ...overrides,
  });
}

// Q.print: qrReprintRequestedEvent removido — toda impressao agora usa
// QR_PRINT_REQUESTED com attemptNumber sequencial.

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
      fileName: 'amostra(5444).pdf',
      destination: null,
      selectedFields: ['owner', 'sacks', 'harvest'],
      classificationPhotoId: randomUUID(),
      templateVersion: 'v1',
      sizeBytes: 2048,
      checksumSha256: 'a'.repeat(64),
      ...payloadOverrides,
    },
    module: 'classification',
    ...eventOverrides,
  });
}

export function commercialStatusUpdatedEvent(sampleId, overrides = {}) {
  const { payload: payloadOverrides = {}, ...eventOverrides } = overrides;

  return buildEvent({
    eventType: 'COMMERCIAL_STATUS_UPDATED',
    sampleId,
    fromStatus: null,
    toStatus: null,
    idempotencyScope: 'COMMERCIAL_STATUS_UPDATE',
    idempotencyKey: randomUUID(),
    payload: {
      fromCommercialStatus: 'OPEN',
      toCommercialStatus: 'SOLD',
      reasonText: 'fechamento comercial',
      ...payloadOverrides,
    },
    module: 'commercial',
    ...eventOverrides,
  });
}

export function saleCreatedEvent(sampleId, overrides = {}) {
  const movementId = randomUUID();
  const { payload: payloadOverrides = {}, ...eventOverrides } = overrides;

  return buildEvent({
    eventType: 'SALE_CREATED',
    sampleId,
    fromStatus: null,
    toStatus: null,
    payload: {
      movementId,
      movementType: 'SALE',
      status: 'ACTIVE',
      buyerClientId: randomUUID(),
      buyerUnitId: null,
      quantitySacks: 5,
      movementDate: '2026-03-19',
      notes: 'venda parcial',
      buyerClientSnapshot: {
        id: randomUUID(),
        displayName: 'Comprador XPTO',
      },
      buyerUnitSnapshot: null,
      soldSacks: 5,
      lostSacks: 0,
      availableSacks: 5,
      commercialStatus: 'PARTIALLY_SOLD',
      ...payloadOverrides,
    },
    module: 'commercial',
    ...eventOverrides,
  });
}

export function lossRecordedEvent(sampleId, overrides = {}) {
  const movementId = randomUUID();
  const { payload: payloadOverrides = {}, ...eventOverrides } = overrides;

  return buildEvent({
    eventType: 'LOSS_RECORDED',
    sampleId,
    fromStatus: null,
    toStatus: null,
    payload: {
      movementId,
      movementType: 'LOSS',
      status: 'ACTIVE',
      quantitySacks: 3,
      movementDate: '2026-03-19',
      notes: null,
      lossReasonText: 'quebra de lote',
      soldSacks: 0,
      lostSacks: 3,
      availableSacks: 7,
      commercialStatus: 'OPEN',
      ...payloadOverrides,
    },
    module: 'commercial',
    ...eventOverrides,
  });
}

export function saleUpdatedEvent(sampleId, overrides = {}) {
  const movementId = randomUUID();
  const { payload: payloadOverrides = {}, ...eventOverrides } = overrides;

  return buildEvent({
    eventType: 'SALE_UPDATED',
    sampleId,
    fromStatus: null,
    toStatus: null,
    payload: {
      movementId,
      before: {
        movementType: 'SALE',
        buyerClientId: randomUUID(),
        buyerUnitId: null,
        quantitySacks: 5,
        movementDate: '2026-03-19',
        notes: 'venda parcial',
        lossReasonText: null,
        buyerClientSnapshot: { id: randomUUID(), displayName: 'Comprador XPTO' },
        buyerUnitSnapshot: null,
        status: 'ACTIVE',
      },
      after: {
        movementType: 'SALE',
        buyerClientId: randomUUID(),
        buyerUnitId: null,
        quantitySacks: 6,
        movementDate: '2026-03-20',
        notes: 'venda editada',
        lossReasonText: null,
        buyerClientSnapshot: { id: randomUUID(), displayName: 'Comprador Atualizado' },
        buyerUnitSnapshot: null,
        status: 'ACTIVE',
      },
      reasonText: 'ajuste comercial',
      soldSacks: 6,
      lostSacks: 0,
      availableSacks: 4,
      commercialStatus: 'PARTIALLY_SOLD',
      ...payloadOverrides,
    },
    module: 'commercial',
    ...eventOverrides,
  });
}

export function lossCancelledEvent(sampleId, overrides = {}) {
  const movementId = randomUUID();
  const { payload: payloadOverrides = {}, ...eventOverrides } = overrides;

  return buildEvent({
    eventType: 'LOSS_CANCELLED',
    sampleId,
    fromStatus: null,
    toStatus: null,
    payload: {
      movementId,
      movementType: 'LOSS',
      reasonText: 'cancelamento da perda',
      soldSacks: 0,
      lostSacks: 0,
      availableSacks: 10,
      commercialStatus: 'OPEN',
      ...payloadOverrides,
    },
    module: 'commercial',
    ...eventOverrides,
  });
}

export function classificationExtractionCompletedEvent(sampleId, overrides = {}) {
  const { payload: payloadOverrides, ...eventOverrides } = overrides;
  return buildEvent({
    eventType: 'CLASSIFICATION_EXTRACTION_COMPLETED',
    sampleId,
    fromStatus: null,
    toStatus: null,
    payload: {
      extractedFields: {
        padrao: '7/8',
        aspecto: 'verde cana',
        certif: null,
        peneiras: {
          p18: '12',
          p17: '35',
          p16: '20',
          p15: '10',
          p14: '8',
          p13: '5',
          p12: null,
          p11: null,
          p10: '3',
          mk: '5',
        },
        fundos: [
          { peneira: '9', percentual: '2' },
          { peneira: null, percentual: null },
        ],
        catacao: null,
        defeitos: {
          imp: '1',
          pva: '3',
          broca: '2',
          gpi: '0',
          ap: '1',
          defeito: null,
        },
        observacoes: null,
        bebida: 'dura',
      },
      crossValidation: {
        hasMismatches: false,
        details: [
          { field: 'lote', extracted: '5444', registered: '5444', match: true },
          { field: 'sacas', extracted: '50', registered: '50', match: true },
        ],
      },
      model: 'gpt-4o',
      photoAttachmentId: randomUUID(),
      processingTimeMs: 1234,
      ...payloadOverrides,
    },
    module: 'classification',
    ...eventOverrides,
  });
}

export function classificationExtractionFailedEvent(sampleId, overrides = {}) {
  const { payload: payloadOverrides, ...eventOverrides } = overrides;
  return buildEvent({
    eventType: 'CLASSIFICATION_EXTRACTION_FAILED',
    sampleId,
    fromStatus: null,
    toStatus: null,
    payload: {
      errorCode: 'OPENAI_ERROR',
      errorMessage: 'API request failed',
      photoAttachmentId: randomUUID(),
      ...payloadOverrides,
    },
    module: 'classification',
    ...eventOverrides,
  });
}
