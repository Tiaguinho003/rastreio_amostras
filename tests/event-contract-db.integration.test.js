import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

import { HttpError } from '../src/contracts/errors.js';
import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import {
  buildEvent,
  sampleReceivedEvent,
  registrationStartedEvent,
  registrationConfirmedEvent,
  photoAddedEvent,
  qrPrintRequestedEvent,
  qrReprintRequestedEvent,
  qrPrintFailedEvent,
  qrPrintedEvent,
  saleCreatedEvent,
  saleUpdatedEvent,
  lossRecordedEvent,
  lossCancelledEvent,
  reportExportedEvent,
  commercialStatusUpdatedEvent,
  sampleInvalidatedEvent
} from './helpers/event-builders.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const store = new PrismaEventStore(prisma);
  const service = new EventContractDbService({ store });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_registration, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  test.before(async () => {
    await prisma.$connect();
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    await resetDatabase();
  });

  test('persists events and updates sample snapshot/version in Postgres', async () => {
    const sampleId = randomUUID();

    const received = await service.appendEvent(sampleReceivedEvent(sampleId));
    assert.equal(received.statusCode, 201);
    assert.equal(received.event.sequenceNumber, 1);

    const started = await service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
    assert.equal(started.statusCode, 201);
    assert.equal(started.event.sequenceNumber, 2);

    const confirmed = await service.appendEvent(registrationConfirmedEvent(sampleId), {
      expectedVersion: 2
    });
    assert.equal(confirmed.statusCode, 201);
    assert.equal(confirmed.event.sequenceNumber, 3);

    const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(sample.status, 'REGISTRATION_CONFIRMED');
    assert.equal(sample.version, 3);
    assert.equal(sample.lastEventSequence, 3);
    assert.equal(sample.internalLotNumber, 'A-5444');
    assert.equal(sample.labelPhotoCount, 1);

    const count = await prisma.sampleEvent.count({ where: { sampleId } });
    assert.equal(count, 3);
  });

  test('idempotency returns existing event and avoids duplication in Postgres', async () => {
    const sampleId = randomUUID();

    await service.appendEvent(sampleReceivedEvent(sampleId));
    await service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });

    const idempotencyKey = randomUUID();

    const first = await service.appendEvent(
      registrationConfirmedEvent(sampleId, {
        idempotencyKey
      }),
      { expectedVersion: 2 }
    );

    const second = await service.appendEvent(
      registrationConfirmedEvent(sampleId, {
        idempotencyKey
      }),
      { expectedVersion: 999 }
    );

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 200);
    assert.equal(second.event.eventId, first.event.eventId);

    const count = await prisma.sampleEvent.count({ where: { sampleId } });
    assert.equal(count, 3);
  });

  test('projects structured owner binding into sample snapshot', async () => {
    const sampleId = randomUUID();
    const clientId = randomUUID();
    const registrationId = randomUUID();

    await prisma.client.create({
      data: {
        id: clientId,
        personType: 'PJ',
        legalName: 'Atlantica Exportacao e Importacao S/A',
        tradeName: 'Atlantica Exportacao e Importacao S/A',
        cnpj: '03936815000175',
        documentCanonical: '03936815000175',
        isBuyer: true,
        isSeller: true,
        status: 'ACTIVE'
      }
    });

    await prisma.clientRegistration.create({
      data: {
        id: registrationId,
        clientId,
        status: 'ACTIVE',
        registrationNumber: '3940945840042',
        registrationNumberCanonical: '3940945840042',
        registrationType: 'estadual',
        addressLine: 'Av. Princesa do Sul, 1885',
        district: 'Rezende',
        city: 'Varginha',
        state: 'MG',
        postalCode: '37062-447'
      }
    });

    await service.appendEvent(sampleReceivedEvent(sampleId));
    await service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
    await service.appendEvent(
      registrationConfirmedEvent(sampleId, {
        payload: {
          ownerClientId: clientId,
          ownerRegistrationId: registrationId,
          declared: {
            owner: 'Atlantica Exportacao e Importacao S/A',
            sacks: 10,
            harvest: '24/25',
            originLot: 'LOTE-ORIGEM-001'
          }
        }
      }),
      { expectedVersion: 2 }
    );

    const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(sample.ownerClientId, clientId);
    assert.equal(sample.ownerRegistrationId, registrationId);
    assert.equal(sample.declaredOwner, 'Atlantica Exportacao e Importacao S/A');
  });

  test('print attempt uniqueness returns existing event by sample/action/attempt', async () => {
    const sampleId = randomUUID();

    await service.appendEvent(sampleReceivedEvent(sampleId));
    await service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
    await service.appendEvent(registrationConfirmedEvent(sampleId), { expectedVersion: 2 });

    const first = await service.appendEvent(
      qrPrintRequestedEvent(sampleId, {
        payload: {
          printAction: 'PRINT',
          attemptNumber: 1,
          printerId: 'printer-main'
        }
      }),
      { expectedVersion: 3 }
    );

    const second = await service.appendEvent(
      qrPrintRequestedEvent(sampleId, {
        payload: {
          printAction: 'PRINT',
          attemptNumber: 1,
          printerId: 'printer-main'
        }
      }),
      { expectedVersion: 999 }
    );

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 200);
    assert.equal(second.event.eventId, first.event.eventId);

    const count = await prisma.sampleEvent.count({ where: { sampleId } });
    assert.equal(count, 4);
  });

  test('materializes print_job lifecycle from QR events', async () => {
    const sampleId = randomUUID();

    await service.appendEvent(sampleReceivedEvent(sampleId));
    await service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
    await service.appendEvent(registrationConfirmedEvent(sampleId), { expectedVersion: 2 });

    const requested = await service.appendEvent(
      qrPrintRequestedEvent(sampleId, {
        payload: {
          printAction: 'PRINT',
          attemptNumber: 1,
          printerId: 'printer-main'
        }
      }),
      { expectedVersion: 3 }
    );

    const failed = await service.appendEvent(
      qrPrintFailedEvent(sampleId, {
        payload: {
          printAction: 'PRINT',
          attemptNumber: 1,
          printerId: 'printer-main',
          error: 'paper jam'
        }
      })
    );

    const printJob = await prisma.printJob.findUnique({
      where: {
        sampleId_printAction_attemptNumber: {
          sampleId,
          printAction: 'PRINT',
          attemptNumber: 1
        }
      }
    });

    assert.ok(printJob);
    assert.equal(printJob.status, 'FAILED');
    assert.equal(printJob.requestedEventId, requested.event.eventId);
    assert.equal(printJob.resultEventId, failed.event.eventId);
    assert.equal(printJob.error, 'paper jam');
  });

  test('returns 409 on version conflict and keeps database state consistent', async () => {
    const sampleId = randomUUID();
    await service.appendEvent(sampleReceivedEvent(sampleId));

    await assert.rejects(
      () => service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 0 }),
      (error) => error instanceof HttpError && error.status === 409
    );

    const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(sample.status, 'PHYSICAL_RECEIVED');
    assert.equal(sample.version, 1);

    const count = await prisma.sampleEvent.count({ where: { sampleId } });
    assert.equal(count, 1);
  });

  test('rolls back transaction when failing after sample mutation', async () => {
    const sampleId = randomUUID();
    await service.appendEvent(sampleReceivedEvent(sampleId));

    await assert.rejects(
      () =>
        service.appendEvent(registrationStartedEvent(sampleId), {
          expectedVersion: 1,
          simulateFailureAfterSampleMutation: true
        }),
      (error) => error instanceof HttpError && error.status === 500
    );

    const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(sample.status, 'PHYSICAL_RECEIVED');
    assert.equal(sample.version, 1);
    assert.equal(sample.lastEventSequence, 1);

    const count = await prisma.sampleEvent.count({ where: { sampleId } });
    assert.equal(count, 1);
  });

  test('database enforces append-only on sample_event', async () => {
    const sampleId = randomUUID();
    const created = await service.appendEvent(sampleReceivedEvent(sampleId));

    await assert.rejects(async () => {
      await prisma.$executeRawUnsafe(
        `UPDATE sample_event SET request_id = 'tamper' WHERE event_id = '${created.event.eventId}'`
      );
    });
  });

  test('does not allow new events after INVALIDATED status', async () => {
    const sampleId = randomUUID();
    await service.appendEvent(sampleReceivedEvent(sampleId));
    await service.appendEvent(sampleInvalidatedEvent(sampleId), { expectedVersion: 1 });

    await assert.rejects(
      () => service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 2 }),
      (error) => error instanceof HttpError && error.status === 409
    );

    const events = await prisma.sampleEvent.findMany({
      where: { sampleId },
      orderBy: { sequenceNumber: 'asc' }
    });
    assert.equal(events.length, 2);
    assert.equal(events[1].eventType, 'SAMPLE_INVALIDATED');
  });

  test('persists REPORT_EXPORTED without mutating sample version', async () => {
    const sampleId = randomUUID();

    await service.appendEvent(sampleReceivedEvent(sampleId));
    await service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
    await service.appendEvent(registrationConfirmedEvent(sampleId), { expectedVersion: 2 });
    await service.appendEvent(qrPrintRequestedEvent(sampleId), { expectedVersion: 3 });
    await service.appendEvent(qrPrintedEvent(sampleId), { expectedVersion: 4 });

    const classificationPhotoId = randomUUID();
    await service.appendEvent(
      photoAddedEvent(sampleId, {
        payload: {
          attachmentId: classificationPhotoId,
          kind: 'CLASSIFICATION_PHOTO',
          storagePath: `samples/${sampleId}/classification/foto.jpg`,
          fileName: 'foto.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024
        },
        module: 'classification'
      })
    );

    await service.appendEvent(
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

    await service.appendEvent(
      buildEvent({
        eventType: 'CLASSIFICATION_COMPLETED',
        sampleId,
        fromStatus: 'CLASSIFICATION_IN_PROGRESS',
        toStatus: 'CLASSIFIED',
        idempotencyScope: 'CLASSIFICATION_COMPLETE',
        idempotencyKey: randomUUID(),
        payload: {
          classificationPhotoId
        },
        module: 'classification'
      }),
      { expectedVersion: 6 }
    );

    const beforeExport = await prisma.sample.findUnique({ where: { id: sampleId } });
    const exported = await service.appendEvent(
      reportExportedEvent(sampleId, {
        payload: {
          format: 'PDF',
          fileName: 'amostra(A-5444).pdf',
          selectedFields: ['owner', 'sacks'],
          classificationPhotoId,
          templateVersion: 'v1',
          sizeBytes: 4096,
          checksumSha256: 'b'.repeat(64)
        }
      })
    );

    const afterExport = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(exported.statusCode, 201);
    assert.equal(exported.event.eventType, 'REPORT_EXPORTED');
    assert.equal(exported.event.payload.exportType, 'COMPLETO');
    assert.equal(afterExport.status, 'CLASSIFIED');
    assert.equal(afterExport.version, beforeExport.version);
  });

  test('persists QR_PRINTED REPRINT without mutating sample version/status', async () => {
    const sampleId = randomUUID();

    await service.appendEvent(sampleReceivedEvent(sampleId));
    await service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
    await service.appendEvent(registrationConfirmedEvent(sampleId), { expectedVersion: 2 });
    await service.appendEvent(qrPrintRequestedEvent(sampleId), { expectedVersion: 3 });
    await service.appendEvent(qrPrintedEvent(sampleId), { expectedVersion: 4 });
    await service.appendEvent(
      qrReprintRequestedEvent(sampleId, {
        payload: {
          printAction: 'REPRINT',
          attemptNumber: 1,
          printerId: 'printer-main',
          reasonText: 'etiqueta danificada'
        }
      })
    );

    const beforeReprint = await prisma.sample.findUnique({ where: { id: sampleId } });

    const reprintSuccess = await service.appendEvent(
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

    const afterReprint = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(reprintSuccess.statusCode, 201);
    assert.equal(reprintSuccess.event.eventType, 'QR_PRINTED');
    assert.equal(afterReprint.status, 'QR_PRINTED');
    assert.equal(afterReprint.version, beforeReprint.version);
  });

  test('persists QR_PRINTED REPRINT with transition when sample is QR_PENDING_PRINT', async () => {
    const sampleId = randomUUID();

    await service.appendEvent(sampleReceivedEvent(sampleId));
    await service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
    await service.appendEvent(registrationConfirmedEvent(sampleId), { expectedVersion: 2 });
    await service.appendEvent(qrPrintRequestedEvent(sampleId), { expectedVersion: 3 });
    await service.appendEvent(
      qrReprintRequestedEvent(sampleId, {
        payload: {
          printAction: 'REPRINT',
          attemptNumber: 1,
          printerId: 'printer-main',
          reasonText: 'nova tentativa antes da confirmacao'
        }
      })
    );

    const beforeReprint = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(beforeReprint.status, 'QR_PENDING_PRINT');

    const reprintSuccess = await service.appendEvent(
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

    const afterReprint = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(reprintSuccess.statusCode, 201);
    assert.equal(reprintSuccess.event.eventType, 'QR_PRINTED');
    assert.equal(afterReprint.status, 'QR_PRINTED');
    assert.equal(afterReprint.version, beforeReprint.version + 1);
  });

  test('persists COMMERCIAL_STATUS_UPDATED and mutates commercial status/version', async () => {
    const sampleId = randomUUID();

    await service.appendEvent(sampleReceivedEvent(sampleId));
    const beforeUpdate = await prisma.sample.findUnique({ where: { id: sampleId } });

    const updated = await service.appendEvent(
      commercialStatusUpdatedEvent(sampleId, {
        payload: {
          fromCommercialStatus: 'OPEN',
          toCommercialStatus: 'SOLD',
          reasonText: 'fechamento comercial'
        }
      }),
      { expectedVersion: 1 }
    );

    const afterUpdate = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(updated.statusCode, 201);
    assert.equal(updated.event.eventType, 'COMMERCIAL_STATUS_UPDATED');
    assert.equal(beforeUpdate.commercialStatus, 'OPEN');
    assert.equal(afterUpdate.commercialStatus, 'SOLD');
    assert.equal(afterUpdate.version, beforeUpdate.version + 1);
  });

  test('materializes sale/loss events into sample_movement and commercial projection', async () => {
    const sampleId = randomUUID();
    const buyerClientId = randomUUID();
    const updatedBuyerClientId = randomUUID();
    const classificationPhotoId = randomUUID();

    await prisma.client.create({
      data: {
        id: buyerClientId,
        personType: 'PJ',
        legalName: 'Comprador Inicial LTDA',
        tradeName: 'Comprador Inicial LTDA',
        cnpj: '10101010000110',
        documentCanonical: '10101010000110',
        isBuyer: true,
        isSeller: false,
        status: 'ACTIVE'
      }
    });

    await prisma.client.create({
      data: {
        id: updatedBuyerClientId,
        personType: 'PJ',
        legalName: 'Comprador Atualizado LTDA',
        tradeName: 'Comprador Atualizado LTDA',
        cnpj: '20202020000120',
        documentCanonical: '20202020000120',
        isBuyer: true,
        isSeller: false,
        status: 'ACTIVE'
      }
    });

    await service.appendEvent(sampleReceivedEvent(sampleId));
    await service.appendEvent(registrationStartedEvent(sampleId), { expectedVersion: 1 });
    await service.appendEvent(registrationConfirmedEvent(sampleId), { expectedVersion: 2 });
    await service.appendEvent(qrPrintRequestedEvent(sampleId), { expectedVersion: 3 });
    await service.appendEvent(qrPrintedEvent(sampleId), { expectedVersion: 4 });
    await service.appendEvent(
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
    await service.appendEvent(
      photoAddedEvent(sampleId, {
        payload: {
          attachmentId: classificationPhotoId,
          kind: 'CLASSIFICATION_PHOTO',
          storagePath: `samples/${sampleId}/classification/foto.png`,
          fileName: 'foto.png',
          mimeType: 'image/png',
          sizeBytes: 1024,
          checksumSha256: null
        }
      })
    );
    await service.appendEvent(
      buildEvent({
        eventType: 'CLASSIFICATION_COMPLETED',
        sampleId,
        fromStatus: 'CLASSIFICATION_IN_PROGRESS',
        toStatus: 'CLASSIFIED',
        payload: {
          classificationPhotoId
        },
        module: 'classification',
        idempotencyScope: 'CLASSIFICATION_COMPLETE',
        idempotencyKey: randomUUID()
      }),
      { expectedVersion: 6 }
    );

    const saleCreated = await service.appendEvent(
      saleCreatedEvent(sampleId, {
        payload: {
          buyerClientId,
          buyerClientSnapshot: {
            id: buyerClientId,
            displayName: 'Comprador Inicial LTDA'
          }
        }
      }),
      { expectedVersion: 7 }
    );
    const saleMovement = await prisma.sampleMovement.findUnique({
      where: { id: saleCreated.event.payload.movementId }
    });
    assert.equal(saleMovement.movementType, 'SALE');
    assert.equal(saleMovement.quantitySacks, 5);

    const sampleAfterSale = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(sampleAfterSale.soldSacks, 5);
    assert.equal(sampleAfterSale.commercialStatus, 'PARTIALLY_SOLD');

    await service.appendEvent(
      saleUpdatedEvent(sampleId, {
        payload: {
          movementId: saleCreated.event.payload.movementId,
          before: {
            movementType: 'SALE',
            buyerClientId,
            buyerRegistrationId: null,
            quantitySacks: 5,
            movementDate: '2026-03-19',
            notes: 'venda parcial',
            lossReasonText: null,
            buyerClientSnapshot: {
              id: buyerClientId,
              displayName: 'Comprador Inicial LTDA'
            },
            buyerRegistrationSnapshot: null,
            status: 'ACTIVE'
          },
          after: {
            movementType: 'SALE',
            buyerClientId: updatedBuyerClientId,
            buyerRegistrationId: null,
            quantitySacks: 6,
            movementDate: '2026-03-20',
            notes: 'venda editada',
            lossReasonText: null,
            buyerClientSnapshot: {
              id: updatedBuyerClientId,
              displayName: 'Comprador Atualizado LTDA'
            },
            buyerRegistrationSnapshot: null,
            status: 'ACTIVE'
          }
        }
      }),
      { expectedVersion: 8 }
    );

    const updatedSaleMovement = await prisma.sampleMovement.findUnique({
      where: { id: saleCreated.event.payload.movementId }
    });
    assert.equal(updatedSaleMovement.quantitySacks, 6);

    const lossCreated = await service.appendEvent(
      lossRecordedEvent(sampleId, {
        payload: {
          soldSacks: 6,
          lostSacks: 3,
          availableSacks: 1,
          commercialStatus: 'PARTIALLY_SOLD'
        }
      }),
      { expectedVersion: 9 }
    );
    const sampleAfterLoss = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(sampleAfterLoss.lostSacks, 3);
    assert.equal(sampleAfterLoss.commercialStatus, 'PARTIALLY_SOLD');

    await service.appendEvent(
      lossCancelledEvent(sampleId, {
        payload: {
          movementId: lossCreated.event.payload.movementId
        }
      }),
      { expectedVersion: 10 }
    );

    const cancelledLossMovement = await prisma.sampleMovement.findUnique({
      where: { id: lossCreated.event.payload.movementId }
    });
    assert.equal(cancelledLossMovement.status, 'CANCELLED');

    const sampleAfterLossCancel = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(sampleAfterLossCancel.lostSacks, 0);
  });
}

async function canReachDatabase(databaseUrlValue) {
  if (!databaseUrlValue) {
    return false;
  }

  const probe = new PrismaClient();
  try {
    await probe.$connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.$disconnect().catch(() => {});
  }
}
