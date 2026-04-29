import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { ClientService } from '../src/clients/client-service.js';
import { generateValidCnpj } from './helpers/cnpj-generator.js';
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
  const clientService = new ClientService({ prisma });

  const actorClassifier = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'CLASSIFIER',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };

  const actorAdmin = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'ADMIN',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };

  // Mock de UserService pro fluxo de classifiers no command service.
  // Aceita qualquer UUID como ACTIVE e retorna snapshot sintetico — os testes
  // de integracao validam o fluxo, nao a validacao de existencia de usuario
  // (ja coberto em normalize-classifiers.test.js unit).
  const userServiceMock = {
    async findUsersForSnapshotByIds(userIds) {
      const uniqueIds = Array.from(
        new Set(
          (Array.isArray(userIds) ? userIds : []).filter(
            (id) => typeof id === 'string' && id.length > 0
          )
        )
      );
      return new Map(
        uniqueIds.map((id) => [
          id,
          {
            id,
            fullName: `Test User ${id.slice(0, 8)}`,
            username: `u_${id.slice(0, 8)}`,
            status: 'ACTIVE',
          },
        ])
      );
    },
  };

  // Helper: monta payload minimo de classifiers pros testes. Frontend
  // compoe `[actor, ...co-classificadores]`; aqui usamos so o actor.
  function classifiersOf(actor) {
    return [{ userId: actor.actorUserId }];
  }

  const tinyPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8f5i8AAAAASUVORK5CYII=',
    'base64'
  );

  let uploadDir;
  let uploadService;
  let commandService;
  let sellerClientSequence = 0;

  async function createSellerClient(overrides = {}) {
    sellerClientSequence += 1;
    const suffix = generateValidCnpj(sellerClientSequence);
    const defaultName = `Cliente Sprint ${sellerClientSequence} LTDA`;

    return clientService.createClient(
      {
        personType: 'PJ',
        legalName: overrides.legalName ?? defaultName,
        tradeName: overrides.tradeName ?? overrides.legalName ?? defaultName,
        phone: overrides.phone ?? '35 99999-0000',
        isBuyer: overrides.isBuyer ?? true,
        isSeller: overrides.isSeller ?? true,
        branches: [
          {
            isPrimary: true,
            cnpj: overrides.cnpj ?? suffix,
          },
        ],
      },
      actorClassifier
    );
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_branch, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  async function moveSampleToRegistrationConfirmed(sampleId) {
    const ownerClient = await createSellerClient({
      legalName: `Proprietario Sprint ${sampleId.slice(0, 8)} LTDA`,
      tradeName: `Proprietario Sprint ${sampleId.slice(0, 8)} LTDA`,
    });

    await commandService.receiveSample({ sampleId, receivedChannel: 'in_person' }, actorClassifier);

    await commandService.startRegistration(
      {
        sampleId,
        expectedVersion: 1,
        notes: null,
      },
      actorClassifier
    );

    await commandService.confirmRegistration(
      {
        sampleId,
        expectedVersion: 2,
        ownerClientId: ownerClient.client.id,
        declared: {
          owner: ownerClient.client.displayName,
          sacks: 11,
          harvest: '25/26',
          originLot: `ORIG-${sampleId.slice(0, 8)}`,
        },
        idempotencyKey: randomUUID(),
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
        idempotencyKey: randomUUID(),
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
        printerId: 'printer-main',
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
      uploadService,
      clientService,
      userService: userServiceMock,
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
    const ownerClient = await createSellerClient({
      legalName: 'Fazenda Sem Foto',
      tradeName: 'Fazenda Sem Foto',
    });

    await commandService.receiveSample(
      {
        sampleId,
        receivedChannel: 'in_person',
        notes: null,
      },
      actorClassifier
    );

    await commandService.startRegistration(
      {
        sampleId,
        expectedVersion: 1,
        notes: null,
      },
      actorClassifier
    );

    const confirmed = await commandService.confirmRegistration(
      {
        sampleId,
        expectedVersion: 2,
        ownerClientId: ownerClient.client.id,
        declared: {
          owner: ownerClient.client.displayName,
          sacks: 7,
          harvest: '25/26',
          originLot: 'ORIG-NO-PHOTO',
        },
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );

    assert.equal(confirmed.statusCode, 201);
    assert.equal(confirmed.sample.status, 'REGISTRATION_CONFIRMED');
  });

  test('executes phase1 + phase2 flow and exposes read model for frontend', async () => {
    const sampleId = randomUUID();
    const ownerClient = await createSellerClient({
      legalName: 'Fazenda Teste',
      tradeName: 'Fazenda Teste',
    });

    const received = await commandService.receiveSample(
      {
        sampleId,
        receivedChannel: 'in_person',
        notes: 'chegou no balcao',
      },
      actorClassifier
    );
    assert.equal(received.statusCode, 201);

    const started = await commandService.startRegistration(
      {
        sampleId,
        expectedVersion: 1,
        notes: null,
      },
      actorClassifier
    );
    assert.equal(started.statusCode, 201);

    const confirmed = await commandService.confirmRegistration(
      {
        sampleId,
        expectedVersion: 2,
        ownerClientId: ownerClient.client.id,
        declared: {
          owner: ownerClient.client.displayName,
          sacks: 11,
          harvest: '25/26',
          originLot: 'ORIG-999',
        },
        idempotencyKey: randomUUID(),
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
        idempotencyKey: randomUUID(),
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
        printerId: 'printer-main',
      },
      actorClassifier
    );
    assert.equal(printed.statusCode, 201);

    const classificationStarted = await commandService.startClassification(
      {
        sampleId,
        expectedVersion: 5,
        classificationId: null,
        notes: null,
      },
      actorClassifier
    );
    assert.equal(classificationStarted.statusCode, 201);

    const classificationPhoto = await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao.jpg',
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
          bebida: 'DURA',
        },
        completionPercent: 45,
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
          defeito: '9',
          bebida: 'DURA',
          aspecto: 'verde',
          observacoes: 'ok',
        },
        technical: {
          type: 'BICA CORRIDA',
          screen: '16',
          defectsCount: 9,
          density: 702,
          notes: 'ok',
        },
        consumptionGrams: null,
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );
    assert.equal(completed.statusCode, 201);

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    assert.equal(detail.sample.status, 'CLASSIFIED');
    assert.equal(detail.sample.version, 8);
    assert.match(detail.sample.internalLotNumber ?? '', /^A-\d+$/);
    assert.equal(detail.attachments.length, 1);
    assert.equal(detail.events.length, 9);
    assert.equal(detail.sample.classificationDraft.snapshot, null);
    assert.equal(detail.sample.classificationDraft.completionPercent, null);
    assert.equal(detail.sample.latestClassification.data?.padrao, 'PADRAO-1');
    assert.equal(detail.sample.latestClassification.data?.bebida, 'DURA');
    assert.equal(detail.sample.latestClassification.data?.aspecto, 'verde');

    const printJobs = await prisma.printJob.findMany({
      where: { sampleId },
      orderBy: [{ printAction: 'asc' }, { attemptNumber: 'asc' }],
    });
    assert.equal(printJobs.length, 1);
    assert.equal(printJobs[0].status, 'SUCCESS');

    const dashboard = await queryService.getDashboardPending();
    assert.equal(dashboard.totalPending, 0);
    assert.equal(dashboard.printPending.total, 0);
    assert.equal(dashboard.printPending.items.length, 0);
    assert.equal(dashboard.classificationPending.total, 0);
    assert.equal(dashboard.classificationInProgress.total, 0);
  });

  test('tracks samples in registration in progress via pending counts', async () => {
    const inProgressSampleId = randomUUID();

    await commandService.receiveSample(
      {
        sampleId: inProgressSampleId,
        receivedChannel: 'in_person',
        notes: null,
      },
      actorClassifier
    );

    await commandService.startRegistration(
      {
        sampleId: inProgressSampleId,
        expectedVersion: 1,
        notes: null,
      },
      actorClassifier
    );

    const dashboard = await queryService.getDashboardPending();
    assert.equal(dashboard.pendingCounts.REGISTRATION_IN_PROGRESS, 1);
    const oldestStatusBySampleId = new Map(
      dashboard.oldestPending.map((sample) => [sample.id, sample.status])
    );
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
        notes: null,
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
              padrao: 'SEM-FOTO',
            },
            classifiers: classifiersOf(actorClassifier),
            idempotencyKey: randomUUID(),
          },
          actorClassifier
        ),
      (error) =>
        error instanceof HttpError &&
        error.status === 409 &&
        error.message.includes('Foto de classificacao e obrigatoria')
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
        notes: null,
      },
      actorClassifier
    );

    const first = await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao-v1.jpg',
      },
      actorClassifier
    );

    const second = await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao-v2.jpg',
      },
      actorClassifier
    );

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 201);
    assert.notEqual(first.photo.attachmentId, second.photo.attachmentId);

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    const classificationPhotos = detail.attachments.filter(
      (attachment) => attachment.kind === 'CLASSIFICATION_PHOTO'
    );
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
        notes: null,
      },
      actorClassifier
    );

    await commandService.saveClassificationPartial(
      {
        sampleId,
        expectedVersion: 6,
        snapshotPartial: {
          padrao: 'PADRAO-BASE',
          bebida: 'DURA',
        },
        completionPercent: 35,
      },
      actorClassifier
    );

    await commandService.saveClassificationPartial(
      {
        sampleId,
        expectedVersion: 7,
        snapshotPartial: {
          aspecto: 'BOM',
        },
        completionPercent: 60,
      },
      actorClassifier
    );

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    assert.equal(detail.sample.status, 'CLASSIFICATION_IN_PROGRESS');
    assert.equal(detail.sample.version, 8);
    assert.equal(detail.sample.classificationDraft.completionPercent, 60);
    assert.equal(detail.sample.classificationDraft.snapshot?.padrao, 'PADRAO-BASE');
    assert.equal(detail.sample.classificationDraft.snapshot?.bebida, 'DURA');
    assert.equal(detail.sample.classificationDraft.snapshot?.aspecto, 'BOM');
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
        notes: null,
      },
      actorClassifier
    );
    assert.equal(classificationStarted.statusCode, 201);

    const dashboard = await queryService.getDashboardPending();
    assert.equal(dashboard.printPending.total, 0);
    // classificationPending agora unifica QR_PRINTED + CLASSIFICATION_IN_PROGRESS (refactor 07/04)
    assert.equal(dashboard.classificationPending.counts.QR_PRINTED, 1);
    assert.equal(dashboard.classificationPending.counts.CLASSIFICATION_IN_PROGRESS, 1);
    assert.equal(dashboard.classificationPending.total, 2);
    // classificationInProgress mantido para compat: counts/total ok, items vazio
    assert.equal(dashboard.classificationInProgress.counts.CLASSIFICATION_IN_PROGRESS, 1);
    assert.equal(dashboard.classificationInProgress.total, 1);

    const statusBySampleId = new Map(
      dashboard.classificationPending.items.map((sample) => [sample.id, sample.status])
    );
    assert.equal(statusBySampleId.get(readySampleId), 'QR_PRINTED');
    assert.equal(statusBySampleId.get(inProgressSampleId), 'CLASSIFICATION_IN_PROGRESS');
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

    const statusBySampleId = new Map(
      dashboard.printPending.items.map((sample) => [sample.id, sample.status])
    );
    assert.equal(statusBySampleId.get(registrationConfirmedSampleId), 'REGISTRATION_CONFIRMED');
    assert.equal(statusBySampleId.get(qrPendingSampleId), 'QR_PENDING_PRINT');
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
      () => queryService.resolveSampleByQrToken('A-999999'),
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
        reasonText: 'erro de recepcao',
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
            reasonText: 'segunda tentativa',
          },
          actorAdmin
        ),
      (error) => error instanceof HttpError && error.status === 409
    );

    const sample = await queryService.requireSample(sampleId);
    assert.equal(sample.status, 'INVALIDATED');
  });

  // Helper: cria a foto temporaria que confirmClassificationFromCamera espera
  // (normalmente populada por detectClassificationForm / extractAndPrepareClassification).
  async function writeTempCameraPhoto(photoToken) {
    const tempDir = path.join(uploadDir, '_temp');
    await fs.mkdir(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `temp-${photoToken}.jpg`);
    await fs.writeFile(tempPath, tinyPngBuffer);
    return tempPath;
  }

  test('confirmClassificationFromCamera preserves existing flow when applySampleUpdates is omitted', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    const photoToken = randomUUID();
    await writeTempCameraPhoto(photoToken);

    const result = await commandService.confirmClassificationFromCamera(
      {
        sampleId,
        photoToken,
        classificationData: {
          padrao: 'PADRAO-1',
          bebida: 'DURA',
          defeito: '9',
        },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );

    assert.equal(result.statusCode, 201);

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    assert.equal(detail.sample.status, 'CLASSIFIED');
    // Sacks/harvest nao alterados
    assert.equal(detail.sample.declared.sacks, 11);
    assert.equal(detail.sample.declared.harvest, '25/26');
    // Nenhum REGISTRATION_UPDATED emitido
    const registrationUpdateEvents = detail.events.filter(
      (event) => event.eventType === 'REGISTRATION_UPDATED'
    );
    assert.equal(registrationUpdateEvents.length, 0);
    // CLASSIFICATION_COMPLETED presente
    const classificationCompletedEvents = detail.events.filter(
      (event) => event.eventType === 'CLASSIFICATION_COMPLETED'
    );
    assert.equal(classificationCompletedEvents.length, 1);
  });

  test('confirmClassificationFromCamera updates declaredSacks when applySampleUpdates.declaredSacks is provided', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    const photoToken = randomUUID();
    await writeTempCameraPhoto(photoToken);

    const result = await commandService.confirmClassificationFromCamera(
      {
        sampleId,
        photoToken,
        classificationData: {
          padrao: 'PADRAO-2',
          bebida: 'MOLE',
        },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
        applySampleUpdates: {
          declaredSacks: 50,
        },
      },
      actorClassifier
    );

    assert.equal(result.statusCode, 201);

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    assert.equal(detail.sample.status, 'CLASSIFIED');
    assert.equal(detail.sample.declared.sacks, 50);
    assert.equal(detail.sample.declared.harvest, '25/26');

    const registrationUpdateEvents = detail.events.filter(
      (event) => event.eventType === 'REGISTRATION_UPDATED'
    );
    assert.equal(registrationUpdateEvents.length, 1);
    const classificationCompletedEvents = detail.events.filter(
      (event) => event.eventType === 'CLASSIFICATION_COMPLETED'
    );
    assert.equal(classificationCompletedEvents.length, 1);
  });

  test('confirmClassificationFromCamera updates declaredHarvest when applySampleUpdates.declaredHarvest is provided', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    const photoToken = randomUUID();
    await writeTempCameraPhoto(photoToken);

    const result = await commandService.confirmClassificationFromCamera(
      {
        sampleId,
        photoToken,
        classificationData: {
          padrao: 'PADRAO-3',
        },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
        applySampleUpdates: {
          declaredHarvest: '24/25',
        },
      },
      actorClassifier
    );

    assert.equal(result.statusCode, 201);

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    assert.equal(detail.sample.status, 'CLASSIFIED');
    assert.equal(detail.sample.declared.harvest, '24/25');
    assert.equal(detail.sample.declared.sacks, 11);

    const registrationUpdateEvents = detail.events.filter(
      (event) => event.eventType === 'REGISTRATION_UPDATED'
    );
    assert.equal(registrationUpdateEvents.length, 1);
  });

  test('confirmClassificationFromCamera updates both declaredSacks and declaredHarvest when both are provided', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    const photoToken = randomUUID();
    await writeTempCameraPhoto(photoToken);

    const result = await commandService.confirmClassificationFromCamera(
      {
        sampleId,
        photoToken,
        classificationData: {
          padrao: 'PADRAO-BOTH',
        },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
        applySampleUpdates: {
          declaredSacks: 25,
          declaredHarvest: '23/24',
        },
      },
      actorClassifier
    );

    assert.equal(result.statusCode, 201);

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    assert.equal(detail.sample.status, 'CLASSIFIED');
    assert.equal(detail.sample.declared.sacks, 25);
    assert.equal(detail.sample.declared.harvest, '23/24');

    const registrationUpdateEvents = detail.events.filter(
      (event) => event.eventType === 'REGISTRATION_UPDATED'
    );
    // Uma unica chamada ao updateRegistration aplica as duas mudancas no mesmo evento
    assert.equal(registrationUpdateEvents.length, 1);
    const updatePayload = registrationUpdateEvents[0].payload;
    assert.equal(updatePayload.after?.declared?.sacks, 25);
    assert.equal(updatePayload.after?.declared?.harvest, '23/24');
  });

  test('confirmClassificationFromCamera tolerates applySampleUpdates that match current values (no-op)', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    const photoToken = randomUUID();
    await writeTempCameraPhoto(photoToken);

    const result = await commandService.confirmClassificationFromCamera(
      {
        sampleId,
        photoToken,
        classificationData: {
          padrao: 'PADRAO-NOOP',
        },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
        // Valores ja batem com o cadastrado (sacks=11, harvest='25/26').
        applySampleUpdates: {
          declaredSacks: 11,
          declaredHarvest: '25/26',
        },
      },
      actorClassifier
    );

    assert.equal(result.statusCode, 201);

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    assert.equal(detail.sample.status, 'CLASSIFIED');
    // Nenhum REGISTRATION_UPDATED deve ter sido emitido (no-op tolerado)
    const registrationUpdateEvents = detail.events.filter(
      (event) => event.eventType === 'REGISTRATION_UPDATED'
    );
    assert.equal(registrationUpdateEvents.length, 0);
    // Mas a classificacao passou normalmente
    const classificationCompletedEvents = detail.events.filter(
      (event) => event.eventType === 'CLASSIFICATION_COMPLETED'
    );
    assert.equal(classificationCompletedEvents.length, 1);
  });

  test('confirmClassificationFromCamera rejects applySampleUpdates.declaredSacks below sold+lost sacks with 409', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    // Avanca a amostra ate CLASSIFIED e registra uma venda de 8 sacas para
    // depois tentar reduzir declaredSacks para 5 via applySampleUpdates.
    await commandService.startClassification(
      {
        sampleId,
        expectedVersion: 5,
        classificationId: null,
        notes: null,
      },
      actorClassifier
    );

    await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao.jpg',
      },
      actorClassifier
    );

    // PHOTO_ADDED nao bumpa a versao — leia dinamicamente para evitar drift.
    const currentBeforeComplete = await queryService.requireSample(sampleId);
    await commandService.completeClassification(
      {
        sampleId,
        expectedVersion: currentBeforeComplete.version,
        classificationData: {
          dataClassificacao: '2026-02-27',
          padrao: 'PADRAO-SOLD',
          defeito: '9',
          bebida: 'DURA',
        },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );

    // Sample agora esta CLASSIFIED com declaredSacks=11. Registra uma venda.
    const buyerClient = await createSellerClient({
      legalName: 'Comprador LTDA',
      tradeName: 'Comprador LTDA',
      isBuyer: true,
    });

    const currentBeforeSale = await queryService.requireSample(sampleId);
    await commandService.createSampleMovement(
      {
        sampleId,
        expectedVersion: currentBeforeSale.version,
        movementType: 'SALE',
        buyerClientId: buyerClient.client.id,
        quantitySacks: 8,
        movementDate: '2026-02-28',
        notes: 'venda de teste',
      },
      actorClassifier
    );

    // Agora tenta reclassificar com applySampleUpdates reduzindo sacks para 5,
    // o que deve falhar (8 ja vendidas, minimo permitido e 8).
    const photoToken = randomUUID();
    await writeTempCameraPhoto(photoToken);

    await assert.rejects(
      () =>
        commandService.confirmClassificationFromCamera(
          {
            sampleId,
            photoToken,
            classificationData: {
              padrao: 'PADRAO-FAIL',
            },
            classifiers: classifiersOf(actorClassifier),
            idempotencyKey: randomUUID(),
            applySampleUpdates: {
              declaredSacks: 5,
            },
          },
          actorClassifier
        ),
      (error) => error instanceof HttpError && error.status === 409
    );
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
