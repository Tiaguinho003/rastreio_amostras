import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { HttpError } from '../src/contracts/errors.js';
import { EventValidator } from '../src/contracts/event-validator.js';
import { InMemoryEventStore } from '../src/events/in-memory-event-store.js';
import { EventContractService } from '../src/events/event-contract-service.js';
import {
  buildEvent,
  sampleReceivedEvent,
  registrationStartedEvent,
  registrationConfirmedEvent,
  photoAddedEvent,
  qrPrintRequestedEvent,
  qrPrintedEvent,
  saleCreatedEvent,
  saleUpdatedEvent,
  lossRecordedEvent,
  lossCancelledEvent,
  reportExportedEvent,
  commercialStatusUpdatedEvent
} from './helpers/event-builders.js';

function createService() {
  const store = new InMemoryEventStore();
  const validator = new EventValidator();
  const service = new EventContractService({ store, validator });
  return { store, service };
}

test('schema validation rejects invalid payload with 422', () => {
  const { service } = createService();
  const sampleId = randomUUID();

  service.appendEvent(sampleReceivedEvent(sampleId));
  service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });

  const invalidRegistrationConfirmed = registrationConfirmedEvent(sampleId, {
    payload: {
      sampleLotNumber: 'A-5444',
      declared: {
        owner: '',
        sacks: 10,
        harvest: '24/25',
        originLot: 'LOTE-ORIGEM-001'
      },
      labelPhotos: [],
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
    }
  });

  assert.throws(
    () => service.appendEvent(invalidRegistrationConfirmed, { expectedVersion: 2 }),
    (error) => error instanceof HttpError && error.status === 422
  );
});

test('registration confirmed accepts payload without label photos', () => {
  const { store, service } = createService();
  const sampleId = randomUUID();

  service.appendEvent(sampleReceivedEvent(sampleId));
  service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });

  const confirmed = service.appendEvent(
    registrationConfirmedEvent(sampleId, {
      payload: {
        sampleLotNumber: 'A-5444',
        declared: {
          owner: 'Produtor XPTO',
          sacks: 10,
          harvest: '24/25',
          originLot: 'LOTE-ORIGEM-001'
        },
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
      }
    }),
    { expectedVersion: 2 }
  );

  assert.equal(confirmed.statusCode, 201);
  assert.equal(confirmed.event.eventType, 'REGISTRATION_CONFIRMED');
  assert.equal(store.getEvents(sampleId).length, 3);
});

test('registration confirmed accepts optional structured owner binding', () => {
  const { service } = createService();
  const sampleId = randomUUID();

  service.appendEvent(sampleReceivedEvent(sampleId));
  service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });

  const confirmed = service.appendEvent(
    registrationConfirmedEvent(sampleId, {
      payload: {
        ownerClientId: randomUUID(),
        ownerRegistrationId: randomUUID()
      }
    }),
    { expectedVersion: 2 }
  );

  assert.equal(confirmed.statusCode, 201);
  assert.equal(confirmed.event.payload.ownerClientId !== undefined, true);
  assert.equal(confirmed.event.payload.ownerRegistrationId !== undefined, true);
});

test('idempotency returns same event and does not duplicate history', () => {
  const { store, service } = createService();
  const sampleId = randomUUID();

  service.appendEvent(sampleReceivedEvent(sampleId));
  service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });

  const idempotencyKey = randomUUID();
  const first = service.appendEvent(
    registrationConfirmedEvent(sampleId, {
      idempotencyKey
    }),
    { expectedVersion: 2 }
  );

  const second = service.appendEvent(
    registrationConfirmedEvent(sampleId, {
      idempotencyKey
    }),
    { expectedVersion: 999 }
  );

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 200);
  assert.equal(second.idempotent, true);
  assert.equal(second.event.eventId, first.event.eventId);
  assert.equal(store.getEvents(sampleId).length, 3);
});

test('sequenceNumber increments per sample', () => {
  const { store, service } = createService();
  const sampleId = randomUUID();

  const e1 = service.appendEvent(sampleReceivedEvent(sampleId));
  const e2 = service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
  const e3 = service.appendEvent(photoAddedEvent(sampleId));

  assert.equal(e1.event.sequenceNumber, 1);
  assert.equal(e2.event.sequenceNumber, 2);
  assert.equal(e3.event.sequenceNumber, 3);
  assert.deepEqual(
    store.getEvents(sampleId).map((event) => event.sequenceNumber),
    [1, 2, 3]
  );
});

test('qr print attempt uniqueness returns existing event for same sample/action/attempt', () => {
  const { store, service } = createService();
  const sampleId = randomUUID();

  service.appendEvent(sampleReceivedEvent(sampleId));
  service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
  service.appendEvent(registrationConfirmedEvent(sampleId), { expectedVersion: 2 });

  const first = service.appendEvent(
    qrPrintRequestedEvent(sampleId, {
      payload: { printAction: 'PRINT', attemptNumber: 1, printerId: 'printer-1' }
    }),
    { expectedVersion: 3 }
  );

  const second = service.appendEvent(
    qrPrintRequestedEvent(sampleId, {
      payload: { printAction: 'PRINT', attemptNumber: 1, printerId: 'printer-1' }
    }),
    { expectedVersion: 4 }
  );

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 200);
  assert.equal(second.idempotent, true);
  assert.equal(second.event.eventId, first.event.eventId);
  assert.equal(store.getEvents(sampleId).length, 4);
});

test('expectedVersion mismatch returns 409 and does not append event', () => {
  const { store, service } = createService();
  const sampleId = randomUUID();

  service.appendEvent(sampleReceivedEvent(sampleId));

  assert.throws(
    () => service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 0 }),
    (error) => error instanceof HttpError && error.status === 409
  );

  assert.equal(store.getEvents(sampleId).length, 1);
  const sample = store.getSample(sampleId);
  assert.equal(sample.status, 'PHYSICAL_RECEIVED');
  assert.equal(sample.version, 1);
});

test('sale and loss events are accepted by the contract validator', () => {
  const { service, store } = createService();
  const sampleId = randomUUID();

  service.appendEvent(sampleReceivedEvent(sampleId));
  service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
  service.appendEvent(registrationConfirmedEvent(sampleId), { expectedVersion: 2 });
  service.appendEvent(qrPrintRequestedEvent(sampleId), { expectedVersion: 3 });
  service.appendEvent(qrPrintedEvent(sampleId), { expectedVersion: 4 });
  service.appendEvent(
    buildEvent({
      eventType: 'CLASSIFICATION_STARTED',
      sampleId,
      fromStatus: 'QR_PRINTED',
      toStatus: 'CLASSIFICATION_IN_PROGRESS',
      payload: {},
      module: 'classification'
    }),
    { expectedVersion: 5 }
  );
  service.appendEvent(
    buildEvent({
      eventType: 'CLASSIFICATION_COMPLETED',
      sampleId,
      fromStatus: 'CLASSIFICATION_IN_PROGRESS',
      toStatus: 'CLASSIFIED',
      payload: {
        classificationPhotoId: randomUUID()
      },
      module: 'classification',
      idempotencyScope: 'CLASSIFICATION_COMPLETE',
      idempotencyKey: randomUUID()
    }),
    { expectedVersion: 6 }
  );

  const created = service.appendEvent(saleCreatedEvent(sampleId), { expectedVersion: 7 });
  const updated = service.appendEvent(saleUpdatedEvent(sampleId, { payload: { movementId: created.event.payload.movementId } }), {
    expectedVersion: 8
  });
  const loss = service.appendEvent(lossRecordedEvent(sampleId), { expectedVersion: 9 });
  const cancelled = service.appendEvent(
    lossCancelledEvent(sampleId, { payload: { movementId: loss.event.payload.movementId } }),
    { expectedVersion: 10 }
  );

  assert.equal(created.statusCode, 201);
  assert.equal(updated.statusCode, 201);
  assert.equal(cancelled.statusCode, 201);
  assert.equal(store.getEvents(sampleId).length, 11);
});

test('atomicity rolls back sample mutation if event append fails mid-operation', () => {
  const { store, service } = createService();
  const sampleId = randomUUID();

  service.appendEvent(sampleReceivedEvent(sampleId));

  assert.throws(
    () =>
      service.appendEvent(registrationStartedEvent(sampleId), {
        expectedVersion: 1,
        simulateFailureAfterSampleMutation: true
      }),
    (error) => error instanceof HttpError && error.status === 500
  );

  const sampleAfterFailure = store.getSample(sampleId);
  assert.equal(sampleAfterFailure.status, 'PHYSICAL_RECEIVED');
  assert.equal(sampleAfterFailure.version, 1);
  assert.equal(store.getEvents(sampleId).length, 1);
});

test('classification completed requires classification photo reference and accepts optional technical payload', () => {
  const { service } = createService();
  const sampleId = randomUUID();

  service.appendEvent(sampleReceivedEvent(sampleId));
  service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
  service.appendEvent(registrationConfirmedEvent(sampleId), { expectedVersion: 2 });
  service.appendEvent(qrPrintRequestedEvent(sampleId), { expectedVersion: 3 });
  service.appendEvent(qrPrintedEvent(sampleId), { expectedVersion: 4 });

  service.appendEvent(
    photoAddedEvent(sampleId, {
      payload: {
        attachmentId: 'classification-photo-1',
        kind: 'CLASSIFICATION_PHOTO',
        storagePath: `samples/${sampleId}/classification/classification-photo-1-foto.jpg`,
        fileName: 'classificacao.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2048
      },
      module: 'classification'
    })
  );

  service.appendEvent(
    buildEvent({
      eventType: 'CLASSIFICATION_STARTED',
      sampleId,
      fromStatus: 'QR_PRINTED',
      toStatus: 'CLASSIFICATION_IN_PROGRESS',
      payload: {},
      module: 'classification'
    }),
    { expectedVersion: 5 }
  );

  const completed = service.appendEvent(
    buildEvent({
      eventType: 'CLASSIFICATION_COMPLETED',
      sampleId,
      fromStatus: 'CLASSIFICATION_IN_PROGRESS',
      toStatus: 'CLASSIFIED',
      idempotencyScope: 'CLASSIFICATION_COMPLETE',
      idempotencyKey: randomUUID(),
      payload: {
        classificationPhotoId: 'classification-photo-1'
      },
      module: 'classification'
    }),
    { expectedVersion: 6 }
  );

  assert.equal(completed.statusCode, 201);
  assert.equal(completed.event.eventType, 'CLASSIFICATION_COMPLETED');
});

test('report exported is accepted and does not mutate sample version/status', () => {
  const { store, service } = createService();
  const sampleId = randomUUID();

  service.appendEvent(sampleReceivedEvent(sampleId));
  service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
  service.appendEvent(registrationConfirmedEvent(sampleId), { expectedVersion: 2 });
  service.appendEvent(qrPrintRequestedEvent(sampleId), { expectedVersion: 3 });
  service.appendEvent(qrPrintedEvent(sampleId), { expectedVersion: 4 });

  service.appendEvent(
    photoAddedEvent(sampleId, {
      payload: {
        attachmentId: randomUUID(),
        kind: 'CLASSIFICATION_PHOTO',
        storagePath: `samples/${sampleId}/classification/foto.jpg`,
        fileName: 'foto.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2048
      },
      module: 'classification'
    })
  );

  service.appendEvent(
    buildEvent({
      eventType: 'CLASSIFICATION_STARTED',
      sampleId,
      fromStatus: 'QR_PRINTED',
      toStatus: 'CLASSIFICATION_IN_PROGRESS',
      payload: {},
      module: 'classification'
    }),
    { expectedVersion: 5 }
  );

  service.appendEvent(
    buildEvent({
      eventType: 'CLASSIFICATION_COMPLETED',
      sampleId,
      fromStatus: 'CLASSIFICATION_IN_PROGRESS',
      toStatus: 'CLASSIFIED',
      idempotencyScope: 'CLASSIFICATION_COMPLETE',
      idempotencyKey: randomUUID(),
      payload: {
        classificationPhotoId: store.getEvents(sampleId).find((event) => event.eventType === 'PHOTO_ADDED').payload
          .attachmentId
      },
      module: 'classification'
    }),
    { expectedVersion: 6 }
  );

  const beforeExport = store.getSample(sampleId);
  const exported = service.appendEvent(reportExportedEvent(sampleId));
  const afterExport = store.getSample(sampleId);

  assert.equal(exported.statusCode, 201);
  assert.equal(exported.event.eventType, 'REPORT_EXPORTED');
  assert.equal(exported.event.payload.exportType, 'COMPLETO');
  assert.equal(afterExport.status, 'CLASSIFIED');
  assert.equal(afterExport.version, beforeExport.version);
});

test('commercial status updated is accepted and mutates commercial status/version', () => {
  const { store, service } = createService();
  const sampleId = randomUUID();

  service.appendEvent(sampleReceivedEvent(sampleId));
  const beforeUpdate = store.getSample(sampleId);
  const updated = service.appendEvent(
    commercialStatusUpdatedEvent(sampleId, {
      payload: {
        fromCommercialStatus: 'OPEN',
        toCommercialStatus: 'SOLD',
        reasonText: 'fechamento comercial'
      }
    }),
    { expectedVersion: 1 }
  );
  const afterUpdate = store.getSample(sampleId);

  assert.equal(updated.statusCode, 201);
  assert.equal(updated.event.eventType, 'COMMERCIAL_STATUS_UPDATED');
  assert.equal(beforeUpdate.commercialStatus, 'OPEN');
  assert.equal(afterUpdate.commercialStatus, 'SOLD');
  assert.equal(afterUpdate.version, beforeUpdate.version + 1);
});

test('qr reprint success is accepted without mutating sample version/status', () => {
  const { store, service } = createService();
  const sampleId = randomUUID();

  service.appendEvent(sampleReceivedEvent(sampleId));
  service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
  service.appendEvent(registrationConfirmedEvent(sampleId), { expectedVersion: 2 });
  service.appendEvent(qrPrintRequestedEvent(sampleId), { expectedVersion: 3 });
  service.appendEvent(qrPrintedEvent(sampleId), { expectedVersion: 4 });

  const beforeReprint = store.getSample(sampleId);
  const reprinted = service.appendEvent(
    qrPrintedEvent(sampleId, {
      fromStatus: null,
      toStatus: null,
      payload: {
        printAction: 'REPRINT',
        attemptNumber: 1,
        printerId: 'printer-main'
      }
    })
  );
  const afterReprint = store.getSample(sampleId);

  assert.equal(reprinted.statusCode, 201);
  assert.equal(reprinted.event.eventType, 'QR_PRINTED');
  assert.equal(afterReprint.status, 'QR_PRINTED');
  assert.equal(afterReprint.version, beforeReprint.version);
});

test('qr reprint success mutates when sample is still QR_PENDING_PRINT', () => {
  const { store, service } = createService();
  const sampleId = randomUUID();

  service.appendEvent(sampleReceivedEvent(sampleId));
  service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
  service.appendEvent(registrationConfirmedEvent(sampleId), { expectedVersion: 2 });
  service.appendEvent(qrPrintRequestedEvent(sampleId), { expectedVersion: 3 });

  const beforeReprint = store.getSample(sampleId);
  assert.equal(beforeReprint.status, 'QR_PENDING_PRINT');

  const reprinted = service.appendEvent(
    qrPrintedEvent(sampleId, {
      fromStatus: 'QR_PENDING_PRINT',
      toStatus: 'QR_PRINTED',
      payload: {
        printAction: 'REPRINT',
        attemptNumber: 1,
        printerId: 'printer-main'
      }
    }),
    { expectedVersion: beforeReprint.version }
  );
  const afterReprint = store.getSample(sampleId);

  assert.equal(reprinted.statusCode, 201);
  assert.equal(reprinted.event.eventType, 'QR_PRINTED');
  assert.equal(afterReprint.status, 'QR_PRINTED');
  assert.equal(afterReprint.version, beforeReprint.version + 1);
});
