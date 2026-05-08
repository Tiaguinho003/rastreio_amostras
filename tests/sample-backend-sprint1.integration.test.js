import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { ClientService } from '../src/clients/client-service.js';
import { generateValidCnpj, generateValidCpf } from './helpers/cnpj-generator.js';
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
        cnpj: overrides.cnpj ?? suffix,
        phone: overrides.phone ?? '35 99999-0000',
        isBuyer: overrides.isBuyer ?? true,
        isSeller: overrides.isSeller ?? true,
      },
      actorClassifier
    );
  }

  // Fase R: helper para criar PF seller (com Fazenda 1 auto-criada via Fase 0).
  let pfSellerSequence = 0;
  async function createPfSellerClient(overrides = {}) {
    pfSellerSequence += 1;
    const cpf = overrides.cpf ?? generateValidCpf(800 + pfSellerSequence);
    return clientService.createClient(
      {
        personType: 'PF',
        fullName: overrides.fullName ?? `Produtor PF ${pfSellerSequence}`,
        cpf,
        phone: overrides.phone ?? '35 99999-0001',
        isBuyer: overrides.isBuyer ?? false,
        isSeller: overrides.isSeller ?? true,
        units: overrides.units,
      },
      actorClassifier
    );
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  async function moveSampleToRegistrationConfirmed(sampleId) {
    const ownerClient = await createSellerClient({
      legalName: `Proprietario Sprint ${sampleId.slice(0, 8)} LTDA`,
      tradeName: `Proprietario Sprint ${sampleId.slice(0, 8)} LTDA`,
    });

    await commandService.createSample(
      {
        sampleId,
        clientDraftId: `draft-${sampleId.slice(0, 8)}`,
        ownerClientId: ownerClient.client.id,
        owner: ownerClient.client.displayName,
        sacks: 11,
        harvest: '25/26',
        originLot: `ORIG-${sampleId.slice(0, 8)}`,
        receivedChannel: 'in_person',
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );
  }

  // Q.print: helpers moveSampleToQrPendingPrint/moveSampleToQrPrinted
  // removidos. Impressao virou acao pura — sample termina em RC apos
  // o registro e segue direto pra CLASSIFIED via classificacao. Tests
  // que precisavam mover via QR_PENDING_PRINT/QR_PRINTED agora chamam
  // moveSampleToRegistrationConfirmed direto.

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

    const confirmed = await commandService.createSample(
      {
        sampleId,
        clientDraftId: 'draft-no-photo',
        ownerClientId: ownerClient.client.id,
        owner: ownerClient.client.displayName,
        sacks: 7,
        harvest: '25/26',
        originLot: 'ORIG-NO-PHOTO',
        receivedChannel: 'in_person',
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );

    assert.equal(confirmed.statusCode, 201);
    assert.equal(confirmed.sample.status, 'REGISTRATION_CONFIRMED');
  });

  test('Fase R: createSample PF sem ownerUnitId rejeita 422 OWNER_UNIT_REQUIRED_FOR_PF', async () => {
    const sampleId = randomUUID();
    const pfOwner = await createPfSellerClient();

    await assert.rejects(
      () =>
        commandService.createSample(
          {
            sampleId,
            clientDraftId: 'draft-pf-no-unit',
            ownerClientId: pfOwner.client.id,
            // ownerUnitId omitido — backend deve rejeitar
            owner: pfOwner.client.displayName,
            sacks: 5,
            harvest: '25/26',
            originLot: 'ORIG-PF-NO-UNIT',
            receivedChannel: 'in_person',
            idempotencyKey: randomUUID(),
          },
          actorClassifier
        ),
      (error) =>
        error instanceof HttpError &&
        error.status === 422 &&
        error.details?.code === 'OWNER_UNIT_REQUIRED_FOR_PF'
    );
  });

  test('Fase R: createSample PF com ownerUnitId valido -> 201', async () => {
    const sampleId = randomUUID();
    const pfOwner = await createPfSellerClient();
    const fazenda1Id = pfOwner.client.units[0].id;

    const confirmed = await commandService.createSample(
      {
        sampleId,
        clientDraftId: 'draft-pf-ok',
        ownerClientId: pfOwner.client.id,
        ownerUnitId: fazenda1Id,
        owner: pfOwner.client.displayName,
        sacks: 8,
        harvest: '25/26',
        originLot: 'ORIG-PF-OK',
        receivedChannel: 'in_person',
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );

    assert.equal(confirmed.statusCode, 201);
    assert.equal(confirmed.sample.status, 'REGISTRATION_CONFIRMED');
    const persisted = await prisma.sample.findUnique({
      where: { id: sampleId },
      select: { ownerClientId: true, ownerUnitId: true },
    });
    assert.equal(persisted.ownerClientId, pfOwner.client.id);
    assert.equal(persisted.ownerUnitId, fazenda1Id);
  });

  test('Fase R: createSample PJ sem ownerUnitId aceita -> 201 (regressao)', async () => {
    const sampleId = randomUUID();
    const pjOwner = await createSellerClient({
      legalName: 'PJ Sem Unit Esperada',
      tradeName: 'PJ Sem Unit Esperada',
    });

    const confirmed = await commandService.createSample(
      {
        sampleId,
        clientDraftId: 'draft-pj-ok',
        ownerClientId: pjOwner.client.id,
        // ownerUnitId omitido propositalmente — PJ nao tem unit
        owner: pjOwner.client.displayName,
        sacks: 9,
        harvest: '25/26',
        originLot: 'ORIG-PJ-OK',
        receivedChannel: 'in_person',
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );

    assert.equal(confirmed.statusCode, 201);
    const persisted = await prisma.sample.findUnique({
      where: { id: sampleId },
      select: { ownerClientId: true, ownerUnitId: true },
    });
    assert.equal(persisted.ownerClientId, pjOwner.client.id);
    assert.equal(persisted.ownerUnitId, null);
  });

  test('executes phase1 + phase2 flow and exposes read model for frontend', async () => {
    const sampleId = randomUUID();
    const ownerClient = await createSellerClient({
      legalName: 'Fazenda Teste',
      tradeName: 'Fazenda Teste',
    });

    const created = await commandService.createSample(
      {
        sampleId,
        clientDraftId: 'draft-phase1-phase2',
        ownerClientId: ownerClient.client.id,
        owner: ownerClient.client.displayName,
        sacks: 11,
        harvest: '25/26',
        originLot: 'ORIG-999',
        receivedChannel: 'in_person',
        notes: 'chegou no balcao',
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );
    assert.equal(created.statusCode, 201);

    const printRequested = await commandService.requestQrPrint(
      {
        sampleId,
        expectedVersion: 1,
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
        expectedVersion: 2,
        attemptNumber: 1,
        printerId: 'printer-main',
      },
      actorClassifier
    );
    assert.equal(printed.statusCode, 201);

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

    const completed = await commandService.completeClassification(
      {
        sampleId,
        expectedVersion: 1,
        classificationData: {
          dataClassificacao: '2026-02-27',
          padrao: 'PADRAO-1',
          // Q.cls.2.7: defeito agora vive em sub-obj defeitos.
          defeitos: { defeito: '9' },
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
    assert.equal(detail.sample.version, 2);
    assert.match(detail.sample.internalLotNumber ?? '', /^\d+$/);
    assert.equal(detail.attachments.length, 1);
    // Q.auto: completeClassification dispara auto-print, somando QR_PRINT_REQUESTED
    // ao timeline (RC, QR_PRINT_REQUESTED #1 manual, QR_PRINTED #1, PHOTO_ADDED,
    // CLASSIFICATION_COMPLETED, QR_PRINT_REQUESTED #2 auto = 6 eventos).
    assert.equal(detail.events.length, 6);
    assert.equal(detail.sample.classificationDraft.snapshot, null);
    assert.equal(detail.sample.classificationDraft.completionPercent, null);
    assert.equal(detail.sample.latestClassification.data?.padrao, 'PADRAO-1');
    assert.equal(detail.sample.latestClassification.data?.bebida, 'DURA');
    assert.equal(detail.sample.latestClassification.data?.aspecto, 'verde');

    const printJobs = await prisma.printJob.findMany({
      where: { sampleId },
      orderBy: [{ attemptNumber: 'asc' }],
    });
    // Q.auto: 2 PrintJobs — #1 manual (SUCCESS via recordQrPrinted) + #2 auto-print
    // pos-classificacao (PENDING, ainda nao confirmado pelo print agent).
    assert.equal(printJobs.length, 2);
    assert.equal(printJobs[0].attemptNumber, 1);
    assert.equal(printJobs[0].status, 'SUCCESS');
    assert.equal(printJobs[1].attemptNumber, 2);
    assert.equal(printJobs[1].status, 'PENDING');

    const dashboard = await queryService.getDashboardPending();
    assert.equal(dashboard.classificationPending.total, 0);
  });

  test('requires classification photo before completing classification', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);

    await assert.rejects(
      () =>
        commandService.completeClassification(
          {
            sampleId,
            expectedVersion: 1,
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
    await moveSampleToRegistrationConfirmed(sampleId);

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

  test('returns dedicated dashboard list for samples pending classification', async () => {
    // Q.print: amostras em RC formam a unica fila pendente (impressao virou
    // acao pura, nao move o sample por estados intermediarios). O card
    // "Aguardando impressao" foi removido do dashboard.
    const sampleA = randomUUID();
    const sampleB = randomUUID();

    await moveSampleToRegistrationConfirmed(sampleA);
    await moveSampleToRegistrationConfirmed(sampleB);

    const dashboard = await queryService.getDashboardPending();
    assert.equal(dashboard.classificationPending.counts.REGISTRATION_CONFIRMED, 2);
    assert.equal(dashboard.classificationPending.total, 2);
    // Q.print: removi `totalPending` do dashboard (propriedade obsoleta).

    const statusBySampleId = new Map(
      dashboard.classificationPending.items.map((sample) => [sample.id, sample.status])
    );
    assert.equal(statusBySampleId.get(sampleA), 'REGISTRATION_CONFIRMED');
    assert.equal(statusBySampleId.get(sampleB), 'REGISTRATION_CONFIRMED');
  });

  test('resolves sample from QR content for classification access', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);

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
      () => queryService.resolveSampleByQrToken('9999999'),
      (error) => error instanceof HttpError && error.status === 404
    );
  });

  test('allows invalidation for authenticated operational roles and keeps INVALIDATED terminal', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);

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
    await moveSampleToRegistrationConfirmed(sampleId);

    const photoToken = randomUUID();
    await writeTempCameraPhoto(photoToken);

    const result = await commandService.confirmClassificationFromCamera(
      {
        sampleId,
        photoToken,
        classificationData: {
          padrao: 'PADRAO-1',
          bebida: 'DURA',
          // Q.cls.2.7: defeito agora vive em sub-obj defeitos.
          defeitos: { defeito: '9' },
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
    await moveSampleToRegistrationConfirmed(sampleId);

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
    await moveSampleToRegistrationConfirmed(sampleId);

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
    await moveSampleToRegistrationConfirmed(sampleId);

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
    await moveSampleToRegistrationConfirmed(sampleId);

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
    await moveSampleToRegistrationConfirmed(sampleId);

    // Avanca a amostra ate CLASSIFIED e registra uma venda de 8 sacas para
    // depois tentar reduzir declaredSacks para 5 via applySampleUpdates.
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
          // Q.cls.2.7: defeito agora vive em sub-obj defeitos.
          defeitos: { defeito: '9' },
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

  // Q.cls.2.7: ficha unificada (peneiras/fundos/defeitos agrupados)
  // + reason persistido na reclassificacao.

  test('completeClassification aceita ficha unificada com peneiras/fundos/defeitos agrupados', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);
    await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao.jpg',
      },
      actorClassifier
    );

    const completed = await commandService.completeClassification(
      {
        sampleId,
        expectedVersion: 1,
        classificationData: {
          padrao: 'P3B',
          aspecto: 'verde',
          certif: 'UTZ',
          catacao: '0,5',
          observacoes: 'amostra ok',
          bebida: 'DURA',
          peneiras: {
            p18: 12.5,
            p17: 23.8,
            p16: null,
            p15: null,
            p14: null,
            p13: null,
            p12: null,
            p11: null,
            p10: null,
            mk: 5,
          },
          fundos: [
            { peneira: '13', percentual: 8 },
            { peneira: null, percentual: null },
          ],
          defeitos: {
            imp: '2',
            pva: '5',
            broca: '3',
            gpi: null,
            ap: null,
            defeito: '12',
          },
        },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );
    assert.equal(completed.statusCode, 201);

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    assert.equal(detail.sample.latestClassification.data?.padrao, 'P3B');
    assert.equal(detail.sample.latestClassification.data?.peneiras?.p18, 12.5);
    assert.equal(detail.sample.latestClassification.data?.peneiras?.mk, 5);
    assert.equal(detail.sample.latestClassification.data?.fundos?.[0]?.peneira, '13');
    assert.equal(detail.sample.latestClassification.data?.fundos?.[0]?.percentual, 8);
    assert.equal(detail.sample.latestClassification.data?.fundos?.[1]?.peneira, null);
    assert.equal(detail.sample.latestClassification.data?.defeitos?.imp, '2');
    assert.equal(detail.sample.latestClassification.data?.defeitos?.defeito, '12');
  });

  test('confirmClassificationFromCamera persiste reasonCode/reasonText na reclassificacao', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);

    // Primeiro classifica.
    const photoToken1 = randomUUID();
    await writeTempCameraPhoto(photoToken1);
    await commandService.confirmClassificationFromCamera(
      {
        sampleId,
        photoToken: photoToken1,
        classificationData: {
          padrao: 'PADRAO-1',
          bebida: 'DURA',
        },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );

    // Reclassifica com reason customizado.
    const photoToken2 = randomUUID();
    await writeTempCameraPhoto(photoToken2);
    const result = await commandService.confirmClassificationFromCamera(
      {
        sampleId,
        photoToken: photoToken2,
        classificationData: {
          padrao: 'PADRAO-2',
          bebida: 'MOLE',
        },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
        reasonCode: 'TYPO',
        reasonText: 'Padrao digitado errado na primeira classificacao',
      },
      actorClassifier
    );
    assert.equal(result.statusCode, 201);

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    const updateEvents = detail.events.filter(
      (event) => event.eventType === 'CLASSIFICATION_UPDATED'
    );
    assert.equal(updateEvents.length, 1);
    assert.equal(updateEvents[0].payload.reasonCode, 'TYPO');
    assert.equal(
      updateEvents[0].payload.reasonText,
      'Padrao digitado errado na primeira classificacao'
    );
  });

  test('confirmClassificationFromCamera fallback hardcoded quando reasonCode/Text omitidos (compat)', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);

    const photoToken1 = randomUUID();
    await writeTempCameraPhoto(photoToken1);
    await commandService.confirmClassificationFromCamera(
      {
        sampleId,
        photoToken: photoToken1,
        classificationData: { padrao: 'PADRAO-1' },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );

    const photoToken2 = randomUUID();
    await writeTempCameraPhoto(photoToken2);
    await commandService.confirmClassificationFromCamera(
      {
        sampleId,
        photoToken: photoToken2,
        classificationData: { padrao: 'PADRAO-2' },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
        // reasonCode/Text omitidos
      },
      actorClassifier
    );

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    const updateEvent = detail.events.find((event) => event.eventType === 'CLASSIFICATION_UPDATED');
    assert.ok(updateEvent);
    assert.equal(updateEvent.payload.reasonCode, 'DATA_FIX');
    assert.equal(updateEvent.payload.reasonText, 'Reclassificacao via foto');
  });

  test('updateClassification aceita patch com peneiras/fundos/defeitos sub-objs', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);
    await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao.jpg',
      },
      actorClassifier
    );
    await commandService.completeClassification(
      {
        sampleId,
        expectedVersion: 1,
        classificationData: {
          padrao: 'PADRAO-1',
          peneiras: {
            p18: 10,
            p17: 20,
            p16: null,
            p15: null,
            p14: null,
            p13: null,
            p12: null,
            p11: null,
            p10: null,
            mk: 5,
          },
          defeitos: { imp: '1', pva: '2', broca: null, gpi: null, ap: null, defeito: null },
        },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );

    const currentBeforeUpdate = await queryService.requireSample(sampleId);
    await commandService.updateClassification(
      {
        sampleId,
        expectedVersion: currentBeforeUpdate.version,
        after: {
          classificationData: {
            // Edita um campo de peneiras + um de defeitos + atualiza fundos.
            peneiras: { p17: 25 },
            fundos: [
              { peneira: '13', percentual: 8 },
              { peneira: '11', percentual: 4 },
            ],
            defeitos: { imp: '5' },
          },
        },
        reasonCode: 'DATA_FIX',
        reasonText: 'Correcao de peneiras + fundos',
      },
      actorClassifier
    );

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    const updateEvent = detail.events.find((event) => event.eventType === 'CLASSIFICATION_UPDATED');
    assert.ok(updateEvent);
    assert.equal(updateEvent.payload.before.classificationData.peneiras.p17, 20);
    assert.equal(updateEvent.payload.after.classificationData.peneiras.p17, 25);
    assert.equal(updateEvent.payload.before.classificationData.defeitos.imp, '1');
    assert.equal(updateEvent.payload.after.classificationData.defeitos.imp, '5');
    assert.deepEqual(updateEvent.payload.after.classificationData.fundos, [
      { peneira: '13', percentual: 8 },
      { peneira: '11', percentual: 4 },
    ]);
  });

  // Q.cls.2.7: tipo-only update — operador edita SO o tipo na detail
  // page sem mexer em campos do classificationData.

  test('updateClassification aceita tipo-only update (sem campos no after)', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);
    await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao.jpg',
      },
      actorClassifier
    );
    await commandService.completeClassification(
      {
        sampleId,
        expectedVersion: 1,
        classificationData: { padrao: 'PADRAO-1' },
        classifiers: classifiersOf(actorClassifier),
        classificationType: 'BICA',
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );

    const currentBeforeUpdate = await queryService.requireSample(sampleId);
    assert.equal(currentBeforeUpdate.classificationType, 'BICA');

    // Update so com classificationType (sem after) deve ser aceito.
    await commandService.updateClassification(
      {
        sampleId,
        expectedVersion: currentBeforeUpdate.version,
        // after omitido — tipo-only update
        reasonCode: 'TYPO',
        reasonText: 'Tipo alterado de BICA pra PREPARADO',
        classificationType: 'PREPARADO',
      },
      actorClassifier
    );

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    assert.equal(detail.sample.classificationType, 'PREPARADO');
    const updateEvent = detail.events.find((event) => event.eventType === 'CLASSIFICATION_UPDATED');
    assert.ok(updateEvent);
    assert.equal(updateEvent.payload.before.classificationType, 'BICA');
    assert.equal(updateEvent.payload.after.classificationType, 'PREPARADO');
    assert.equal(updateEvent.payload.classificationType, 'PREPARADO');
    assert.equal(updateEvent.payload.reasonCode, 'TYPO');
  });

  test('updateClassification rejeita 409 quando nem after nem tipo mudaram', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);
    await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao.jpg',
      },
      actorClassifier
    );
    await commandService.completeClassification(
      {
        sampleId,
        expectedVersion: 1,
        classificationData: { padrao: 'PADRAO-1' },
        classifiers: classifiersOf(actorClassifier),
        classificationType: 'BICA',
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );

    const currentBeforeUpdate = await queryService.requireSample(sampleId);

    // Sem after, sem tipo diferente — deve rejeitar 409.
    await assert.rejects(
      () =>
        commandService.updateClassification(
          {
            sampleId,
            expectedVersion: currentBeforeUpdate.version,
            classificationType: 'BICA', // mesmo tipo atual
          },
          actorClassifier
        ),
      (error) => error instanceof HttpError && error.status === 409
    );
  });

  test('updateClassification em update combinado (campos + tipo) inclui tipo no before/after', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);
    await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao.jpg',
      },
      actorClassifier
    );
    await commandService.completeClassification(
      {
        sampleId,
        expectedVersion: 1,
        classificationData: { padrao: 'PADRAO-1' },
        classifiers: classifiersOf(actorClassifier),
        classificationType: 'BICA',
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );

    const currentBeforeUpdate = await queryService.requireSample(sampleId);
    await commandService.updateClassification(
      {
        sampleId,
        expectedVersion: currentBeforeUpdate.version,
        after: { classificationData: { padrao: 'PADRAO-2' } },
        reasonCode: 'DATA_FIX',
        reasonText: 'Tipo + padrao corrigidos',
        classificationType: 'LOW_CAFF',
      },
      actorClassifier
    );

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 100 });
    assert.equal(detail.sample.classificationType, 'LOW_CAFF');
    const updateEvent = detail.events.find((event) => event.eventType === 'CLASSIFICATION_UPDATED');
    assert.ok(updateEvent);
    // Campos refletidos
    assert.equal(updateEvent.payload.before.classificationData.padrao, 'PADRAO-1');
    assert.equal(updateEvent.payload.after.classificationData.padrao, 'PADRAO-2');
    // Tipo refletido em before/after também
    assert.equal(updateEvent.payload.before.classificationType, 'BICA');
    assert.equal(updateEvent.payload.after.classificationType, 'LOW_CAFF');
  });

  // ============================================================
  // Q.auto: auto-print pos-classificacao
  // ============================================================

  test('Q.auto: completeClassification dispara auto-print (PrintJob PENDING + QR_PRINT_REQUESTED audit)', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);

    await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao.jpg',
      },
      actorClassifier
    );

    const completed = await commandService.completeClassification(
      {
        sampleId,
        expectedVersion: 1,
        classificationData: { padrao: 'PADRAO-A' },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );
    assert.equal(completed.statusCode, 201);

    const printJobs = await prisma.printJob.findMany({
      where: { sampleId },
      orderBy: [{ attemptNumber: 'asc' }],
    });
    assert.equal(printJobs.length, 1);
    assert.equal(printJobs[0].attemptNumber, 1);
    assert.equal(printJobs[0].status, 'PENDING');

    const events = await prisma.sampleEvent.findMany({
      where: { sampleId },
      orderBy: { sequenceNumber: 'asc' },
    });
    const printRequested = events.filter((e) => e.eventType === 'QR_PRINT_REQUESTED');
    assert.equal(printRequested.length, 1);
    assert.equal(printRequested[0].fromStatus, null);
    assert.equal(printRequested[0].toStatus, null);
  });

  test('Q.auto: idempotency — print key derivada de event.idempotencyKey dedupa retry', async () => {
    // Cenario: o auto-print do completeClassification usa a key
    // `${event.idempotencyKey}:auto-print`. Validamos que chamar
    // requestQrPrint DEPOIS do auto-print com a mesma key derivada
    // retorna idempotent (em vez de 409 PENDING duplicado), provando
    // que retry da operacao composta nao cria PrintJobs duplicados.
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);

    await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao.jpg',
      },
      actorClassifier
    );

    const completed = await commandService.completeClassification(
      {
        sampleId,
        expectedVersion: 1,
        classificationData: { padrao: 'PADRAO-A' },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );
    assert.equal(completed.statusCode, 201);

    const classificationEvent = completed.event;
    const derivedPrintKey = `${classificationEvent.idempotencyKey}:auto-print`;

    // Retry manual com mesma key — deve retornar idempotent, nao criar PrintJob novo.
    const replay = await commandService.requestQrPrint(
      { sampleId, idempotencyKey: derivedPrintKey },
      actorClassifier
    );
    assert.equal(replay.idempotent, true);

    const printJobs = await prisma.printJob.findMany({ where: { sampleId } });
    assert.equal(printJobs.length, 1, 'retry com key derivada nao cria PrintJob duplicado');
  });

  test('Q.auto: updateClassification (reclassificacao) NAO dispara auto-print', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);

    await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao.jpg',
      },
      actorClassifier
    );

    await commandService.completeClassification(
      {
        sampleId,
        expectedVersion: 1,
        classificationData: { padrao: 'PADRAO-A' },
        classifiers: classifiersOf(actorClassifier),
        idempotencyKey: randomUUID(),
      },
      actorClassifier
    );

    const printJobsAfterClassify = await prisma.printJob.findMany({ where: { sampleId } });
    assert.equal(printJobsAfterClassify.length, 1);

    const sampleNow = await queryService.requireSample(sampleId);
    await commandService.updateClassification(
      {
        sampleId,
        expectedVersion: sampleNow.version,
        after: { classificationData: { padrao: 'PADRAO-B' } },
        reasonCode: 'TYPO',
        reasonText: 'erro de digitacao',
      },
      actorClassifier
    );

    const printJobsAfterUpdate = await prisma.printJob.findMany({ where: { sampleId } });
    assert.equal(printJobsAfterUpdate.length, 1, 'reclassificacao nao deve criar PrintJob novo');
  });

  test('Q.auto: best-effort — falha do auto-print nao bloqueia classificacao', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);

    await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/jpeg',
        originalFileName: 'classificacao.jpg',
      },
      actorClassifier
    );

    // Stub requestQrPrint pra forcar falha. completeClassification nao deve
    // propagar — classificacao permanece commitada.
    const originalRequestQrPrint = commandService.requestQrPrint.bind(commandService);
    commandService.requestQrPrint = async () => {
      throw new HttpError(503, 'Print agent indisponivel (stub)');
    };

    try {
      const completed = await commandService.completeClassification(
        {
          sampleId,
          expectedVersion: 1,
          classificationData: { padrao: 'PADRAO-A' },
          classifiers: classifiersOf(actorClassifier),
          idempotencyKey: randomUUID(),
        },
        actorClassifier
      );
      assert.equal(completed.statusCode, 201);

      const sample = await queryService.requireSample(sampleId);
      assert.equal(sample.status, 'CLASSIFIED');

      const printJobs = await prisma.printJob.findMany({ where: { sampleId } });
      assert.equal(printJobs.length, 0, 'PrintJob nao foi criado pois requestQrPrint falhou');
    } finally {
      commandService.requestQrPrint = originalRequestQrPrint;
    }
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
