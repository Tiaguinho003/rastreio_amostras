import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { LocalUploadService } from '../src/uploads/local-upload-service.js';
import { HttpError } from '../src/contracts/errors.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('backend sprint1 integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const eventStore = new PrismaEventStore(prisma);
  const eventService = new EventContractDbService({ store: eventStore });
  const queryService = new SampleQueryService({ prisma });

  const actorClassifier = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'CLASSIFIER',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test'
  };

  const actorAdmin = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'ADMIN',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test'
  };

  let uploadDir;
  let uploadService;
  let commandService;

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  async function moveSampleToRegistrationConfirmed(sampleId) {
    await commandService.receiveSample({ sampleId, receivedChannel: 'in_person' }, actorClassifier);

    await commandService.startRegistration(
      {
        sampleId,
        expectedVersion: 1,
        notes: null
      },
      actorClassifier
    );

    await commandService.addLabelPhoto(
      {
        sampleId,
        fileBuffer: Buffer.from(`fake-image-content-${sampleId}`),
        mimeType: 'image/jpeg',
        originalFileName: 'etiqueta.jpg'
      },
      actorClassifier
    );

    await commandService.confirmRegistration(
      {
        sampleId,
        expectedVersion: 2,
        declared: {
          owner: 'Fazenda Teste',
          sacks: 11,
          harvest: '25/26',
          originLot: `ORIG-${sampleId.slice(0, 8)}`
        },
        ocr: {
          provider: 'LOCAL',
          overallConfidence: 0.91,
          fieldConfidence: {
            owner: 0.95,
            sacks: 0.82,
            harvest: 0.85,
            originLot: 0.79
          },
          rawTextRef: null
        },
        idempotencyKey: randomUUID()
      },
      actorClassifier
    );
  }

  async function moveSampleToQrPendingPrint(sampleId) {
    await moveSampleToRegistrationConfirmed(sampleId);

    await commandService.requestQrPrint(
      {
        sampleId,
        expectedVersion: 3,
        attemptNumber: 1,
        printerId: 'printer-main',
        idempotencyKey: randomUUID()
      },
      actorClassifier
    );
  }

  async function moveSampleToQrPrinted(sampleId) {
    await moveSampleToQrPendingPrint(sampleId);

    await commandService.recordQrPrinted(
      {
        sampleId,
        expectedVersion: 4,
        printAction: 'PRINT',
        attemptNumber: 1,
        printerId: 'printer-main'
      },
      actorClassifier
    );
  }

  test.before(async () => {
    await prisma.$connect();
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coffee-upload-test-'));
    uploadService = new LocalUploadService({ baseDir: uploadDir });
    commandService = new SampleCommandService({
      eventService,
      queryService,
      uploadService
    });
  });

  test.after(async () => {
    await prisma.$disconnect();
    if (uploadDir) {
      await fs.rm(uploadDir, { recursive: true, force: true });
    }
  });

  test.beforeEach(async () => {
    await resetDatabase();
  });

  test('confirms registration without label photos when business flow does not require image yet', async () => {
    const sampleId = randomUUID();

    await commandService.receiveSample(
      {
        sampleId,
        receivedChannel: 'in_person',
        notes: null
      },
      actorClassifier
    );

    await commandService.startRegistration(
      {
        sampleId,
        expectedVersion: 1,
        notes: null
      },
      actorClassifier
    );

    const confirmed = await commandService.confirmRegistration(
      {
        sampleId,
        expectedVersion: 2,
        declared: {
          owner: 'Fazenda Sem Foto',
          sacks: 7,
          harvest: '25/26',
          originLot: 'ORIG-NO-PHOTO'
        },
        idempotencyKey: randomUUID()
      },
      actorClassifier
    );

    assert.equal(confirmed.statusCode, 201);
    assert.equal(confirmed.sample.labelPhotoCount, 0);
    assert.equal(confirmed.sample.status, 'REGISTRATION_CONFIRMED');
  });

  test('executes phase1 + phase2 flow and exposes read model for frontend', async () => {
    const sampleId = randomUUID();

    const received = await commandService.receiveSample(
      {
        sampleId,
        receivedChannel: 'in_person',
        notes: 'chegou no balcao'
      },
      actorClassifier
    );
    assert.equal(received.statusCode, 201);

    const started = await commandService.startRegistration(
      {
        sampleId,
        expectedVersion: 1,
        notes: null
      },
      actorClassifier
    );
    assert.equal(started.statusCode, 201);

    const photo = await commandService.addLabelPhoto(
      {
        sampleId,
        fileBuffer: Buffer.from('fake-image-content'),
        mimeType: 'image/jpeg',
        originalFileName: 'etiqueta.jpg'
      },
      actorClassifier
    );
    assert.equal(photo.statusCode, 201);
    assert.ok(photo.photo.storagePath.includes(sampleId));

    const confirmed = await commandService.confirmRegistration(
      {
        sampleId,
        expectedVersion: 2,
        declared: {
          owner: 'Fazenda Teste',
          sacks: 11,
          harvest: '25/26',
          originLot: 'ORIG-999'
        },
        ocr: {
          provider: 'LOCAL',
          overallConfidence: 0.87,
          fieldConfidence: {
            owner: 0.95,
            sacks: 0.8,
            harvest: 0.85,
            originLot: 0.77
          },
          rawTextRef: null
        },
        idempotencyKey: randomUUID()
      },
      actorClassifier
    );
    assert.equal(confirmed.statusCode, 201);

    const printRequested = await commandService.requestQrPrint(
      {
        sampleId,
        expectedVersion: 3,
        attemptNumber: 1,
        printerId: 'printer-main',
        idempotencyKey: randomUUID()
      },
      actorClassifier
    );
    assert.equal(printRequested.statusCode, 201);

    const printed = await commandService.recordQrPrinted(
      {
        sampleId,
        expectedVersion: 4,
        printAction: 'PRINT',
        attemptNumber: 1,
        printerId: 'printer-main'
      },
      actorClassifier
    );
    assert.equal(printed.statusCode, 201);

    const classificationStarted = await commandService.startClassification(
      {
        sampleId,
        expectedVersion: 5,
        classificationId: null,
        notes: null
      },
      actorClassifier
    );
    assert.equal(classificationStarted.statusCode, 201);

    const classificationPhoto = await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: Buffer.from('fake-classification-photo'),
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao.jpg'
      },
      actorClassifier
    );
    assert.equal(classificationPhoto.statusCode, 201);

    const partial = await commandService.saveClassificationPartial(
      {
        sampleId,
        expectedVersion: 6,
        snapshotPartial: {
          padrao: 'PADRAO-1',
          umidade: 11.3
        },
        completionPercent: 45
      },
      actorClassifier
    );
    assert.equal(partial.statusCode, 201);

    const completed = await commandService.completeClassification(
      {
        sampleId,
        expectedVersion: 7,
        classificationData: {
          dataClassificacao: '2026-02-27',
          padrao: 'PADRAO-1',
          classificador: 'Classificador Teste',
          defeito: 9,
          umidade: 11.3,
          aspectoCor: 'verde',
          observacoes: 'ok',
          loteOrigem: 'ORIG-999'
        },
        technical: {
          type: 'BICA CORRIDA',
          screen: '16',
          defectsCount: 9,
          moisture: 11.3,
          density: 702,
          colorAspect: 'verde',
          notes: 'ok'
        },
        consumptionGrams: null,
        idempotencyKey: randomUUID()
      },
      actorClassifier
    );
    assert.equal(completed.statusCode, 201);

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    assert.equal(detail.sample.status, 'CLASSIFIED');
    assert.equal(detail.sample.version, 8);
    assert.match(detail.sample.internalLotNumber ?? '', /^AM-\d{4}-\d{6}$/);
    assert.equal(detail.attachments.length, 2);
    assert.equal(detail.events.length, 10);
    assert.equal(detail.sample.classificationDraft.snapshot, null);
    assert.equal(detail.sample.classificationDraft.completionPercent, null);
    assert.equal(detail.sample.latestClassification.data?.padrao, 'PADRAO-1');
    assert.equal(detail.sample.latestClassification.data?.umidade, 11.3);
    assert.equal(detail.sample.latestClassification.data?.loteOrigem, 'ORIG-999');

    const printJobs = await prisma.printJob.findMany({
      where: { sampleId },
      orderBy: [{ printAction: 'asc' }, { attemptNumber: 'asc' }]
    });
    assert.equal(printJobs.length, 1);
    assert.equal(printJobs[0].status, 'SUCCESS');

    const dashboard = await queryService.getDashboardPending();
    assert.equal(dashboard.totalPending, 0);
    assert.equal(dashboard.printPending.total, 0);
    assert.equal(dashboard.printPending.items.length, 0);
    assert.equal(dashboard.classificationPending.total, 0);
    assert.equal(dashboard.classificationInProgress.total, 0);
    assert.equal(dashboard.latestRegistrations.total, 1);
    assert.equal(dashboard.latestRegistrations.items.length, 1);
    assert.equal(dashboard.latestRegistrations.items[0]?.id, sampleId);
    assert.equal(dashboard.latestRegistrations.items[0]?.status, 'CLASSIFIED');
  });

  test('tracks samples in registration in progress via pending counts', async () => {
    const inProgressSampleId = randomUUID();

    await commandService.receiveSample(
      {
        sampleId: inProgressSampleId,
        receivedChannel: 'in_person',
        notes: null
      },
      actorClassifier
    );

    await commandService.startRegistration(
      {
        sampleId: inProgressSampleId,
        expectedVersion: 1,
        notes: null
      },
      actorClassifier
    );

    const dashboard = await queryService.getDashboardPending();
    assert.equal(dashboard.pendingCounts.REGISTRATION_IN_PROGRESS, 1);
    const oldestStatusBySampleId = new Map(dashboard.oldestPending.map((sample) => [sample.id, sample.status]));
    assert.equal(oldestStatusBySampleId.get(inProgressSampleId), 'REGISTRATION_IN_PROGRESS');
  });

  test('requires classification photo before completing classification', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    await commandService.startClassification(
      {
        sampleId,
        expectedVersion: 5,
        classificationId: null,
        notes: null
      },
      actorClassifier
    );

    await assert.rejects(
      () =>
        commandService.completeClassification(
          {
            sampleId,
            expectedVersion: 6,
            classificationData: {
              padrao: 'SEM-FOTO'
            },
            idempotencyKey: randomUUID()
          },
          actorClassifier
        ),
      (error) =>
        error instanceof HttpError &&
        error.status === 409 &&
        error.message.includes('requires classification photo')
    );
  });

  test('replaces classification photo when user retries capture', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    await commandService.startClassification(
      {
        sampleId,
        expectedVersion: 5,
        classificationId: null,
        notes: null
      },
      actorClassifier
    );

    const first = await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: Buffer.from('classification-photo-v1'),
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao-v1.jpg'
      },
      actorClassifier
    );

    const second = await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: Buffer.from('classification-photo-v2'),
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao-v2.jpg'
      },
      actorClassifier
    );

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 201);
    assert.notEqual(first.photo.attachmentId, second.photo.attachmentId);

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    const classificationPhotos = detail.attachments.filter((attachment) => attachment.kind === 'CLASSIFICATION_PHOTO');
    assert.equal(classificationPhotos.length, 1);
    assert.equal(classificationPhotos[0].id, second.photo.attachmentId);
  });

  test('merges draft data across partial classification saves and increments version', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    await commandService.startClassification(
      {
        sampleId,
        expectedVersion: 5,
        classificationId: null,
        notes: null
      },
      actorClassifier
    );

    await commandService.saveClassificationPartial(
      {
        sampleId,
        expectedVersion: 6,
        snapshotPartial: {
          padrao: 'PADRAO-BASE',
          umidade: 10.9
        },
        completionPercent: 35
      },
      actorClassifier
    );

    await commandService.saveClassificationPartial(
      {
        sampleId,
        expectedVersion: 7,
        snapshotPartial: {
          broca: 2
        },
        completionPercent: 60
      },
      actorClassifier
    );

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    assert.equal(detail.sample.status, 'CLASSIFICATION_IN_PROGRESS');
    assert.equal(detail.sample.version, 8);
    assert.equal(detail.sample.classificationDraft.completionPercent, 60);
    assert.equal(detail.sample.classificationDraft.snapshot?.padrao, 'PADRAO-BASE');
    assert.equal(detail.sample.classificationDraft.snapshot?.umidade, 10.9);
    assert.equal(detail.sample.classificationDraft.snapshot?.broca, 2);
  });

  test('returns dedicated dashboard list for samples pending classification', async () => {
    const readySampleId = randomUUID();
    const inProgressSampleId = randomUUID();

    await moveSampleToQrPrinted(readySampleId);
    await moveSampleToQrPrinted(inProgressSampleId);

    const classificationStarted = await commandService.startClassification(
      {
        sampleId: inProgressSampleId,
        expectedVersion: 5,
        classificationId: null,
        notes: null
      },
      actorClassifier
    );
    assert.equal(classificationStarted.statusCode, 201);

    const dashboard = await queryService.getDashboardPending();
    assert.equal(dashboard.printPending.total, 0);
    assert.equal(dashboard.classificationPending.counts.QR_PRINTED, 1);
    assert.equal(dashboard.classificationPending.total, 1);
    assert.equal(dashboard.classificationInProgress.counts.CLASSIFICATION_IN_PROGRESS, 1);
    assert.equal(dashboard.classificationInProgress.total, 1);

    const statusBySampleId = new Map(dashboard.classificationPending.items.map((sample) => [sample.id, sample.status]));
    assert.equal(statusBySampleId.get(readySampleId), 'QR_PRINTED');

    const inProgressStatusBySampleId = new Map(
      dashboard.classificationInProgress.items.map((sample) => [sample.id, sample.status])
    );
    assert.equal(inProgressStatusBySampleId.get(inProgressSampleId), 'CLASSIFICATION_IN_PROGRESS');
  });

  test('returns dedicated dashboard list for samples with pending print (not printed yet)', async () => {
    const registrationConfirmedSampleId = randomUUID();
    const qrPendingSampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(registrationConfirmedSampleId);
    await moveSampleToQrPendingPrint(qrPendingSampleId);

    const dashboard = await queryService.getDashboardPending();
    assert.equal(dashboard.printPending.counts.REGISTRATION_CONFIRMED, 1);
    assert.equal(dashboard.printPending.counts.QR_PENDING_PRINT, 1);
    assert.equal(dashboard.printPending.total, 2);

    const statusBySampleId = new Map(dashboard.printPending.items.map((sample) => [sample.id, sample.status]));
    assert.equal(statusBySampleId.get(registrationConfirmedSampleId), 'REGISTRATION_CONFIRMED');
    assert.equal(statusBySampleId.get(qrPendingSampleId), 'QR_PENDING_PRINT');
  });

  test('returns latest registrations list without physical/in-progress drafts and keeps newest-first order', async () => {
    const onlyReceivedSampleId = randomUUID();
    const registrationInProgressSampleId = randomUUID();
    const registrationConfirmedSampleId = randomUUID();
    const qrPendingSampleId = randomUUID();
    const qrPrintedSampleId = randomUUID();

    await commandService.receiveSample(
      {
        sampleId: onlyReceivedSampleId,
        receivedChannel: 'in_person',
        notes: null
      },
      actorClassifier
    );

    await commandService.receiveSample(
      {
        sampleId: registrationInProgressSampleId,
        receivedChannel: 'in_person',
        notes: null
      },
      actorClassifier
    );

    await commandService.startRegistration(
      {
        sampleId: registrationInProgressSampleId,
        expectedVersion: 1,
        notes: null
      },
      actorClassifier
    );

    await moveSampleToRegistrationConfirmed(registrationConfirmedSampleId);
    await moveSampleToQrPendingPrint(qrPendingSampleId);
    await moveSampleToQrPrinted(qrPrintedSampleId);

    const dashboard = await queryService.getDashboardPending();
    assert.equal(dashboard.latestRegistrations.total, 3);
    assert.equal(dashboard.latestRegistrations.items.length, 3);

    const latestIds = dashboard.latestRegistrations.items.map((sample) => sample.id);
    assert.deepEqual(
      [...latestIds].sort(),
      [registrationConfirmedSampleId, qrPendingSampleId, qrPrintedSampleId].sort()
    );
    assert.equal(latestIds.includes(onlyReceivedSampleId), false);
    assert.equal(latestIds.includes(registrationInProgressSampleId), false);

    const latestStatusBySampleId = new Map(dashboard.latestRegistrations.items.map((sample) => [sample.id, sample.status]));
    assert.equal(latestStatusBySampleId.get(registrationConfirmedSampleId), 'REGISTRATION_CONFIRMED');
    assert.equal(latestStatusBySampleId.get(qrPendingSampleId), 'QR_PENDING_PRINT');
    assert.equal(latestStatusBySampleId.get(qrPrintedSampleId), 'QR_PRINTED');

    for (let index = 1; index < dashboard.latestRegistrations.items.length; index += 1) {
      const previousCreatedAt = new Date(dashboard.latestRegistrations.items[index - 1].createdAt).getTime();
      const currentCreatedAt = new Date(dashboard.latestRegistrations.items[index].createdAt).getTime();
      assert.ok(previousCreatedAt >= currentCreatedAt);
    }
  });

  test('resolves sample from QR content for classification access', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    const current = await queryService.requireSample(sampleId);
    assert.ok(current.internalLotNumber);

    const byLot = await queryService.resolveSampleByQrToken(current.internalLotNumber);
    assert.equal(byLot.id, sampleId);

    const byUuid = await queryService.resolveSampleByQrToken(sampleId.toUpperCase());
    assert.equal(byUuid.id, sampleId);

    const bySampleUrl = await queryService.resolveSampleByQrToken(
      `https://rastreio.local/samples/${sampleId}?focus=classification`
    );
    assert.equal(bySampleUrl.id, sampleId);

    const byQueryParam = await queryService.resolveSampleByQrToken(
      `https://rastreio.local/classification/scan?qr=${encodeURIComponent(current.internalLotNumber)}`
    );
    assert.equal(byQueryParam.id, sampleId);

    await assert.rejects(
      () => queryService.resolveSampleByQrToken('conteudo-sem-id-valido'),
      (error) => error instanceof HttpError && error.status === 422
    );

    await assert.rejects(
      () => queryService.resolveSampleByQrToken('AM-2099-999999'),
      (error) => error instanceof HttpError && error.status === 404
    );
  });

  test('allows invalidation for authenticated operational roles and keeps INVALIDATED terminal', async () => {
    const sampleId = randomUUID();

    await commandService.receiveSample({ sampleId, receivedChannel: 'in_person' }, actorClassifier);

    const invalidatedByClassifier = await commandService.invalidateSample(
      {
        sampleId,
        expectedVersion: 1,
        reasonCode: 'OTHER',
        reasonText: 'erro de recepcao'
      },
      actorClassifier
    );

    assert.equal(invalidatedByClassifier.statusCode, 201);

    await assert.rejects(
      () =>
        commandService.invalidateSample(
          {
            sampleId,
            expectedVersion: 2,
            reasonCode: 'OTHER',
            reasonText: 'segunda tentativa'
          },
          actorAdmin
        ),
      (error) => error instanceof HttpError && error.status === 409
    );

    const sample = await queryService.requireSample(sampleId);
    assert.equal(sample.status, 'INVALIDATED');
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
