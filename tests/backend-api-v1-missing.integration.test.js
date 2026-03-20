import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { LocalAuthService } from '../src/auth/local-auth-service.js';
import { ClientService } from '../src/clients/client-service.js';
import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { SamplePdfReportService } from '../src/reports/sample-pdf-report-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { buildEventEnvelope } from '../src/samples/sample-event-factory.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { LocalUploadService } from '../src/uploads/local-upload-service.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('backend api integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const eventStore = new PrismaEventStore(prisma);
  const eventService = new EventContractDbService({ store: eventStore });
  const queryService = new SampleQueryService({ prisma });
  const clientService = new ClientService({ prisma });

  let uploadDir;
  let uploadService;
  let commandService;
  let reportService;
  let api;
  let authService;
  let classifierAuthHeaders;
  let adminAuthHeaders;

  const tinyPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8f5i8AAAAASUVORK5CYII=',
    'base64'
  );

  const actorClassifier = {
    actorType: 'USER',
    actorUserId: '00000000-0000-0000-0000-000000000101',
    role: 'CLASSIFIER',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test'
  };

  const actorAdmin = {
    actorType: 'USER',
    actorUserId: '00000000-0000-0000-0000-000000000100',
    role: 'ADMIN',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test'
  };

  function buildInput({ headers = classifierAuthHeaders, params = {}, query = {}, body = {} } = {}) {
    return {
      headers,
      params,
      query,
      body
    };
  }

  function formatDateInSaoPaulo(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    return `${year}-${month}-${day}`;
  }

  let sellerClientSequence = 0;
  let registrationSequence = 0;

  function nextSequenceDigits(sequence, length) {
    return String(sequence).padStart(length, '0').slice(-length);
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_registration, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  async function createSellerClient(overrides = {}) {
    sellerClientSequence += 1;
    const suffix = nextSequenceDigits(sellerClientSequence, 14);
    const defaultName = `Cliente Seller ${sellerClientSequence} LTDA`;

    return clientService.createClient(
      {
        personType: 'PJ',
        legalName: overrides.legalName ?? defaultName,
        tradeName: overrides.tradeName ?? overrides.legalName ?? defaultName,
        cnpj: overrides.cnpj ?? suffix,
        phone: overrides.phone ?? '35 3531-4046',
        isBuyer: overrides.isBuyer ?? true,
        isSeller: overrides.isSeller ?? true
      },
      actorClassifier
    );
  }

  async function createClientRegistration(clientId, overrides = {}) {
    registrationSequence += 1;

    return clientService.createRegistration(
      clientId,
      {
        registrationNumber: overrides.registrationNumber ?? nextSequenceDigits(registrationSequence, 13),
        registrationType: overrides.registrationType ?? 'estadual',
        addressLine: overrides.addressLine ?? 'Av. Oliveira Rezende, 1397',
        district: overrides.district ?? 'JD Bernadete',
        city: overrides.city ?? 'Sao Sebastiao do Paraiso',
        state: overrides.state ?? 'MG',
        postalCode: overrides.postalCode ?? '37950-078',
        complement: overrides.complement ?? null
      },
      actorClassifier
    );
  }

  async function moveSampleToRegistrationConfirmed(sampleId) {
    const ownerClient = await createSellerClient({
      legalName: `Proprietario ${sampleId.slice(0, 8)} LTDA`,
      tradeName: `Proprietario ${sampleId.slice(0, 8)} LTDA`
    });

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
        fileBuffer: Buffer.from(`photo-${sampleId}`),
        mimeType: 'image/jpeg',
        originalFileName: 'etiqueta.jpg'
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
          originLot: 'ORIG-001'
        },
        ocr: {
          provider: 'LOCAL',
          overallConfidence: 0.8,
          fieldConfidence: {
            owner: 0.9,
            sacks: 0.8,
            harvest: 0.8,
            originLot: 0.7
          },
          rawTextRef: null
        },
        idempotencyKey: randomUUID()
      },
      actorClassifier
    );

    return ownerClient;
  }

  async function moveLegacySampleToRegistrationConfirmed(sampleId) {
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
        fileBuffer: Buffer.from(`photo-${sampleId}`),
        mimeType: 'image/jpeg',
        originalFileName: 'etiqueta.jpg'
      },
      actorClassifier
    );

    const attachmentIds = await queryService.listAttachmentIds(sampleId, {
      kind: 'ARRIVAL_PHOTO'
    });
    const sampleLotNumber = await queryService.getNextInternalLotNumber(new Date().getUTCFullYear());

    const event = buildEventEnvelope({
      eventType: 'REGISTRATION_CONFIRMED',
      sampleId,
      payload: {
        sampleLotNumber,
        declared: {
          owner: 'Fazenda Teste',
          sacks: 11,
          harvest: '25/26',
          originLot: 'ORIG-001'
        },
        labelPhotos: attachmentIds,
        ocr: {
          provider: 'LOCAL',
          overallConfidence: 0.8,
          fieldConfidence: {
            owner: 0.9,
            sacks: 0.8,
            harvest: 0.8,
            originLot: 0.7
          },
          rawTextRef: null
        }
      },
      fromStatus: 'REGISTRATION_IN_PROGRESS',
      toStatus: 'REGISTRATION_CONFIRMED',
      module: 'registration',
      actorContext: actorClassifier,
      idempotencyScope: 'REGISTRATION_CONFIRM',
      idempotencyKey: randomUUID()
    });

    await eventService.appendEvent(event, { expectedVersion: 2 });
  }

  async function moveSampleToQrPrinted(sampleId) {
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

  async function moveSampleToClassified(sampleId) {
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

    await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/png',
        originalFileName: 'classificacao.png'
      },
      actorClassifier
    );

    await commandService.completeClassification(
      {
        sampleId,
        expectedVersion: 6,
        classificationData: {
          padrao: 'PADRAO-A',
          umidade: 11.2
        },
        technical: {
          moisture: 11.2
        },
        idempotencyKey: randomUUID()
      },
      actorClassifier
    );
  }

  test.before(async () => {
    await prisma.$connect();

    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coffee-api-missing-'));
    uploadService = new LocalUploadService({ baseDir: uploadDir });

    commandService = new SampleCommandService({
      eventService,
      queryService,
      uploadService,
      clientService
    });
    authService = new LocalAuthService({
      secret: 'super-secret-for-backend-api-missing-tests',
      allowPlaintextPasswords: true,
      users: [
        {
          id: actorAdmin.actorUserId,
          username: 'admin-test',
          password: 'admin123',
          role: actorAdmin.role,
          displayName: 'Admin Teste'
        },
        {
          id: actorClassifier.actorUserId,
          username: 'classifier-test',
          password: 'classifier123',
          role: actorClassifier.role,
          displayName: 'Classificador Teste'
        }
      ]
    });

    adminAuthHeaders = {
      authorization: `Bearer ${authService.login({ username: 'admin-test', password: 'admin123' }).accessToken}`,
      'x-forwarded-for': actorAdmin.ip,
      'user-agent': actorAdmin.userAgent,
      'x-source': actorAdmin.source
    };

    classifierAuthHeaders = {
      authorization: `Bearer ${authService.login({ username: 'classifier-test', password: 'classifier123' }).accessToken}`,
      'x-forwarded-for': actorClassifier.ip,
      'user-agent': actorClassifier.userAgent,
      'x-source': actorClassifier.source
    };

    reportService = new SamplePdfReportService({
      queryService,
      commandService,
      uploadsBaseDir: uploadDir
    });

    api = createBackendApiV1({
      authService,
      clientService,
      commandService,
      queryService,
      reportService
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

  test('POST /qr/reprint/request supports idempotency and blocks INVALIDATED sample', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    const idempotencyKey = randomUUID();

    const first = await api.requestQrReprint(
      buildInput({
        params: { sampleId },
        body: {
          attemptNumber: 2,
          printerId: 'printer-main',
          reasonText: 'etiqueta perdida',
          idempotencyKey
        }
      })
    );

    assert.equal(first.status, 201);
    assert.equal(first.body.event.eventType, 'QR_REPRINT_REQUESTED');

    const second = await api.requestQrReprint(
      buildInput({
        params: { sampleId },
        body: {
          attemptNumber: 2,
          printerId: 'printer-main',
          reasonText: 'etiqueta perdida',
          idempotencyKey
        }
      })
    );

    assert.equal(second.status, 200);
    assert.equal(second.body.idempotent, true);
    assert.equal(second.body.event.eventId, first.body.event.eventId);

    await commandService.invalidateSample(
      {
        sampleId,
        expectedVersion: 5,
        reasonCode: 'OTHER',
        reasonText: 'teste de bloqueio'
      },
      actorAdmin
    );

    const blocked = await api.requestQrReprint(
      buildInput({
        params: { sampleId },
        body: {
          attemptNumber: 3,
          reasonText: 'nova tentativa'
        }
      })
    );

    assert.equal(blocked.status, 409);
  });

  test('POST /qr/reprint/request auto-generates attempt number without reason', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    const first = await api.requestQrReprint(
      buildInput({
        params: { sampleId },
        body: {
          printerId: 'printer-main'
        }
      })
    );

    assert.equal(first.status, 201);
    assert.equal(first.body.event.eventType, 'QR_REPRINT_REQUESTED');
    assert.equal(first.body.event.payload.printAction, 'REPRINT');
    assert.equal(first.body.event.payload.attemptNumber, 1);
    assert.equal(first.body.event.payload.reasonText, null);

    const second = await api.requestQrReprint(
      buildInput({
        params: { sampleId },
        body: {
          printerId: 'printer-main'
        }
      })
    );

    assert.equal(second.status, 201);
    assert.equal(second.body.event.payload.attemptNumber, 2);
  });

  test('POST /qr/printed with REPRINT does not mutate sample version/status', async () => {
    const sampleId = randomUUID();
    await moveSampleToClassified(sampleId);

    const before = await queryService.requireSample(sampleId);
    assert.equal(before.status, 'CLASSIFIED');

    const requested = await api.requestQrReprint(
      buildInput({
        params: { sampleId },
        body: {
          printerId: 'printer-main'
        }
      })
    );
    assert.equal(requested.status, 201);
    assert.equal(requested.body.event.payload.attemptNumber, 1);

    const printed = await api.recordQrPrinted(
      buildInput({
        params: { sampleId },
        body: {
          printAction: 'REPRINT',
          attemptNumber: 1,
          printerId: 'printer-main'
        }
      })
    );

    assert.equal(printed.status, 201);
    assert.equal(printed.body.event.eventType, 'QR_PRINTED');
    assert.equal(printed.body.event.fromStatus, null);
    assert.equal(printed.body.event.toStatus, null);

    const after = await queryService.requireSample(sampleId);
    assert.equal(after.status, 'CLASSIFIED');
    assert.equal(after.version, before.version);
  });

  test('POST /qr/printed with REPRINT mutates when sample is QR_PENDING_PRINT', async () => {
    const sampleId = randomUUID();
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

    const requestedReprint = await api.requestQrReprint(
      buildInput({
        params: { sampleId },
        body: {
          printerId: 'printer-main',
          reasonText: 'nova tentativa antes da confirmacao'
        }
      })
    );

    assert.equal(requestedReprint.status, 201);
    assert.equal(requestedReprint.body.event.payload.printAction, 'REPRINT');
    assert.equal(requestedReprint.body.event.payload.attemptNumber, 1);

    const before = await queryService.requireSample(sampleId);
    assert.equal(before.status, 'QR_PENDING_PRINT');

    const printed = await api.recordQrPrinted(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: before.version,
          printAction: 'REPRINT',
          attemptNumber: 1,
          printerId: 'printer-main'
        }
      })
    );

    assert.equal(printed.status, 201);
    assert.equal(printed.body.event.eventType, 'QR_PRINTED');
    assert.equal(printed.body.event.fromStatus, 'QR_PENDING_PRINT');
    assert.equal(printed.body.event.toStatus, 'QR_PRINTED');

    const after = await queryService.requireSample(sampleId);
    assert.equal(after.status, 'QR_PRINTED');
    assert.equal(after.version, before.version + 1);
  });

  test('POST /qr/print/failed with REPRINT does not mutate sample version/status', async () => {
    const sampleId = randomUUID();
    await moveSampleToClassified(sampleId);

    const before = await queryService.requireSample(sampleId);
    assert.equal(before.status, 'CLASSIFIED');

    const requested = await api.requestQrReprint(
      buildInput({
        params: { sampleId },
        body: {
          printerId: 'printer-main'
        }
      })
    );
    assert.equal(requested.status, 201);

    const failed = await api.recordQrPrintFailed(
      buildInput({
        params: { sampleId },
        body: {
          printAction: 'REPRINT',
          attemptNumber: 1,
          printerId: 'printer-main',
          error: 'sem papel'
        }
      })
    );

    assert.equal(failed.status, 201);
    assert.equal(failed.body.event.eventType, 'QR_PRINT_FAILED');

    const after = await queryService.requireSample(sampleId);
    assert.equal(after.status, 'CLASSIFIED');
    assert.equal(after.version, before.version);
  });

  test('POST /samples/create requires owner client and prepares QR print', async () => {
    const missingOwnerClient = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId: randomUUID(),
          owner: 'Fazenda Nova Era',
          sacks: 14,
          harvest: '25/26',
          originLot: 'ORIG-SEM-FOTO',
          receivedChannel: 'in_person',
          notes: 'criacao sem foto',
          printerId: 'printer-main'
        }
      })
    );

    assert.equal(missingOwnerClient.status, 422);
    assert.equal(missingOwnerClient.body.error.message, 'ownerClientId is required');

    const ownerClient = await createSellerClient({
      legalName: 'Fazenda Nova Era',
      tradeName: 'Fazenda Nova Era'
    });

    const created = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId: randomUUID(),
          ownerClientId: ownerClient.client.id,
          sacks: 14,
          harvest: '25/26',
          originLot: 'ORIG-SEM-FOTO',
          receivedChannel: 'in_person',
          notes: 'criacao sem foto',
          printerId: 'printer-main'
        }
      })
    );

    assert.equal(created.status, 201);
    assert.equal(created.body.sample.status, 'QR_PENDING_PRINT');
    assert.equal(created.body.sample.declared.owner, ownerClient.client.displayName);
    assert.equal(created.body.sample.ownerClientId, ownerClient.client.id);
    assert.equal(created.body.sample.labelPhotoCount, 0);
    assert.equal(created.body.qr.value, created.body.sample.internalLotNumber ?? created.body.sample.id);
    assert.equal(created.body.print?.printAction, 'PRINT');
    assert.equal(created.body.print?.attemptNumber, 1);
    assert.equal(created.body.print?.status, 'PENDING');
    assert.equal(created.body.print?.printerId, 'printer-main');

    const events = await queryService.listSampleEvents(created.body.sample.id, { limit: 20 });
    assert.deepEqual(
      events.map((event) => event.eventType),
      ['SAMPLE_RECEIVED', 'REGISTRATION_STARTED', 'REGISTRATION_CONFIRMED', 'QR_PRINT_REQUESTED']
    );
  });

  test('POST /samples/create accepts optional arrival photo and persists it before registration confirmation', async () => {
    const ownerClient = await createSellerClient({
      legalName: 'Fazenda Com Foto',
      tradeName: 'Fazenda Com Foto'
    });

    const created = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId: randomUUID(),
          ownerClientId: ownerClient.client.id,
          sacks: 9,
          harvest: '25/26',
          originLot: 'ORIG-COM-FOTO',
          receivedChannel: 'courier',
          arrivalPhotoFileBuffer: Buffer.from('arrival-photo-content'),
          arrivalPhotoMimeType: 'image/jpeg',
          arrivalPhotoOriginalFileName: 'chegada.jpg'
        }
      })
    );

    assert.equal(created.status, 201);
    assert.equal(created.body.sample.status, 'QR_PENDING_PRINT');
    assert.equal(created.body.sample.labelPhotoCount, 1);
    assert.equal(created.body.print?.printAction, 'PRINT');
    assert.equal(created.body.print?.attemptNumber, 1);
    assert.equal(created.body.print?.status, 'PENDING');

    const detail = await queryService.getSampleDetail(created.body.sample.id, { eventLimit: 20 });
    const arrivalPhotos = detail.attachments.filter((attachment) => attachment.kind === 'ARRIVAL_PHOTO');
    assert.equal(arrivalPhotos.length, 1);

    assert.deepEqual(
      detail.events.map((event) => event.eventType),
      ['SAMPLE_RECEIVED', 'REGISTRATION_STARTED', 'PHOTO_ADDED', 'REGISTRATION_CONFIRMED', 'QR_PRINT_REQUESTED']
    );
  });

  test('POST /samples/create persists structured owner and syncs declared owner from client displayName', async () => {
    const ownerClient = await createSellerClient({
      legalName: 'Atlantica Exportacao e Importacao S/A',
      tradeName: 'Atlantica Exportacao e Importacao S/A',
      cnpj: '03.936.815/0001-75'
    });
    const ownerRegistration = await createClientRegistration(ownerClient.client.id, {
      registrationNumber: '3940945840042',
      addressLine: 'Av. Princesa do Sul, 1885',
      district: 'Rezende',
      city: 'Varginha',
      postalCode: '37062-447'
    });

    const created = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId: randomUUID(),
          owner: 'Texto legado divergente',
          ownerClientId: ownerClient.client.id,
          ownerRegistrationId: ownerRegistration.registration.id,
          sacks: 12,
          harvest: '25/26',
          originLot: 'ORIG-OWNER-LINKED',
          receivedChannel: 'in_person'
        }
      })
    );

    assert.equal(created.status, 201);
    assert.equal(created.body.sample.ownerClientId, ownerClient.client.id);
    assert.equal(created.body.sample.ownerRegistrationId, ownerRegistration.registration.id);
    assert.equal(created.body.sample.declared.owner, ownerClient.client.displayName);

    const detail = await queryService.getSampleDetail(created.body.sample.id, { eventLimit: 20 });
    assert.equal(detail.sample.ownerClientId, ownerClient.client.id);
    assert.equal(detail.sample.ownerRegistrationId, ownerRegistration.registration.id);
    assert.equal(detail.sample.declared.owner, ownerClient.client.displayName);

    const registrationConfirmed = detail.events.find((event) => event.eventType === 'REGISTRATION_CONFIRMED');
    assert.equal(registrationConfirmed?.payload?.ownerClientId, ownerClient.client.id);
    assert.equal(registrationConfirmed?.payload?.ownerRegistrationId, ownerRegistration.registration.id);
  });

  test('POST /registration/update can attach structured owner to a legacy sample and clear previous registration on owner change', async () => {
    const sampleId = randomUUID();
    await moveLegacySampleToRegistrationConfirmed(sampleId);

    const firstOwner = await createSellerClient();
    const firstRegistration = await createClientRegistration(firstOwner.client.id);

    const attached = await api.updateRegistration(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 3,
          after: {
            ownerClientId: firstOwner.client.id,
            ownerRegistrationId: firstRegistration.registration.id
          },
          reasonCode: 'DATA_FIX',
          reasonText: 'vincular cliente'
        }
      })
    );

    assert.equal(attached.status, 201);
    assert.equal(attached.body.event.eventType, 'REGISTRATION_UPDATED');

    const attachedSample = await queryService.requireSample(sampleId);
    assert.equal(attachedSample.ownerClientId, firstOwner.client.id);
    assert.equal(attachedSample.ownerRegistrationId, firstRegistration.registration.id);
    assert.equal(attachedSample.declared.owner, firstOwner.client.displayName);

    const secondOwner = await createSellerClient({
      legalName: 'Cliente Segundo Proprietario LTDA',
      tradeName: 'Cliente Segundo Proprietario LTDA',
      cnpj: '11.222.333/0001-44'
    });

    const switched = await api.updateRegistration(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: attachedSample.version,
          after: {
            ownerClientId: secondOwner.client.id
          },
          reasonCode: 'TYPO',
          reasonText: 'trocar cliente'
        }
      })
    );

    assert.equal(switched.status, 201);
    assert.equal(switched.body.event.eventType, 'REGISTRATION_UPDATED');

    const switchedSample = await queryService.requireSample(sampleId);
    assert.equal(switchedSample.ownerClientId, secondOwner.client.id);
    assert.equal(switchedSample.ownerRegistrationId, null);
    assert.equal(switchedSample.declared.owner, secondOwner.client.displayName);
  });

  test('structured owner validation blocks inactive non-seller or mismatched registration', async () => {
    const inactiveOwner = await createSellerClient({
      legalName: 'Cliente Inativo LTDA',
      tradeName: 'Cliente Inativo LTDA',
      cnpj: '55.666.777/0001-88'
    });

    await clientService.inactivateClient(
      inactiveOwner.client.id,
      {
        reasonText: 'bloqueado'
      },
      actorAdmin
    );

    const inactiveResult = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId: randomUUID(),
          ownerClientId: inactiveOwner.client.id,
          sacks: 10,
          harvest: '25/26',
          originLot: 'ORIG-INACTIVE'
        }
      })
    );

    assert.equal(inactiveResult.status, 422);

    const buyerOnlyOwner = await createSellerClient({
      legalName: 'Comprador Apenas LTDA',
      tradeName: 'Comprador Apenas LTDA',
      cnpj: '88.777.666/0001-55',
      isBuyer: true,
      isSeller: false
    });

    const buyerOnlyResult = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId: randomUUID(),
          ownerClientId: buyerOnlyOwner.client.id,
          sacks: 10,
          harvest: '25/26',
          originLot: 'ORIG-NOT-SELLER'
        }
      })
    );

    assert.equal(buyerOnlyResult.status, 422);

    const ownerA = await createSellerClient({
      legalName: 'Proprietario A LTDA',
      tradeName: 'Proprietario A LTDA',
      cnpj: '12.123.123/0001-12'
    });
    const ownerB = await createSellerClient({
      legalName: 'Proprietario B LTDA',
      tradeName: 'Proprietario B LTDA',
      cnpj: '13.123.123/0001-13'
    });
    const ownerBRegistration = await createClientRegistration(ownerB.client.id, {
      registrationNumber: '998877665544'
    });

    const mismatchedRegistration = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId: randomUUID(),
          ownerClientId: ownerA.client.id,
          ownerRegistrationId: ownerBRegistration.registration.id,
          sacks: 10,
          harvest: '25/26',
          originLot: 'ORIG-MISMATCH'
        }
      })
    );

    assert.equal(mismatchedRegistration.status, 422);
  });

  test('updating owner client display name synchronizes declared owner on linked samples without bumping sample version', async () => {
    const ownerClient = await createSellerClient({
      legalName: 'Cliente Original LTDA',
      tradeName: 'Cliente Original LTDA',
      cnpj: '99.888.777/0001-66'
    });

    const created = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId: randomUUID(),
          ownerClientId: ownerClient.client.id,
          sacks: 15,
          harvest: '25/26',
          originLot: 'ORIG-SYNC-OWNER'
        }
      })
    );

    assert.equal(created.status, 201);
    const before = await queryService.requireSample(created.body.sample.id);
    assert.equal(before.declared.owner, 'Cliente Original LTDA');

    const updatedClient = await clientService.updateClient(
      ownerClient.client.id,
      {
        legalName: 'Cliente Renomeado LTDA',
        tradeName: 'Cliente Renomeado LTDA',
        isBuyer: true,
        isSeller: true,
        reasonText: 'renomear cliente'
      },
      actorAdmin
    );

    assert.equal(updatedClient.client.displayName, 'Cliente Renomeado LTDA');

    const after = await queryService.requireSample(created.body.sample.id);
    assert.equal(after.declared.owner, 'Cliente Renomeado LTDA');
    assert.equal(after.version, before.version);
    assert.equal(after.updatedAt, before.updatedAt);
  });

  test('POST /samples/create is idempotent by clientDraftId and avoids duplicate samples', async () => {
    const clientDraftId = randomUUID();
    const firstOwner = await createSellerClient({
      legalName: 'Fazenda Idempotente',
      tradeName: 'Fazenda Idempotente'
    });
    const secondOwner = await createSellerClient({
      legalName: 'Outro Proprietario Idempotente',
      tradeName: 'Outro Proprietario Idempotente'
    });

    const first = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId,
          ownerClientId: firstOwner.client.id,
          sacks: 20,
          harvest: '25/26',
          originLot: 'ORIG-001',
          receivedChannel: 'courier'
        }
      })
    );

    const second = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId,
          ownerClientId: secondOwner.client.id,
          sacks: 99,
          harvest: '99/00',
          originLot: 'ORIG-999',
          receivedChannel: 'driver'
        }
      })
    );

    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.sample.id, first.body.sample.id);
    assert.equal(second.body.sample.declared.owner, firstOwner.client.displayName);

    const list = await queryService.listSamples({ limit: 10, offset: 0 });
    assert.equal(list.page.total, 1);
  });

  test('GET /samples supports filters in backend and paginates with page + limit', async () => {
    const targetOwner = 'Fazenda Filtro Unica';
    const targetHarvest = '24/25';
    let targetInternalLotNumber = null;
    const dateInSaoPaulo = formatDateInSaoPaulo();
    const monthInSaoPaulo = dateInSaoPaulo.slice(0, 7);
    const yearInSaoPaulo = dateInSaoPaulo.slice(0, 4);
    const ownerClientIds = new Map();

    for (let index = 0; index < 35; index += 1) {
      const ownerName = index === 10 ? targetOwner : `Fazenda ${index % 4}`;
      let ownerClientId = ownerClientIds.get(ownerName) ?? null;

      if (!ownerClientId) {
        const ownerClient = await createSellerClient({
          legalName: ownerName,
          tradeName: ownerName
        });
        ownerClientId = ownerClient.client.id;
        ownerClientIds.set(ownerName, ownerClientId);
      }

      const created = await api.createSampleAndPreparePrint(
        buildInput({
          body: {
            clientDraftId: randomUUID(),
            ownerClientId,
            sacks: 5 + index,
            harvest: index === 10 ? targetHarvest : '25/26',
            originLot: `ORIG-${String(index + 1).padStart(3, '0')}`,
            receivedChannel: 'courier'
          }
        })
      );

      if (index === 10) {
        targetInternalLotNumber = created.body.sample.internalLotNumber;
      }
    }

    assert.ok(targetInternalLotNumber);

    const firstPage = await api.listSamples(
      buildInput({
        query: {
          limit: '30',
          page: '1'
        }
      })
    );

    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.items.length, 30);
    assert.equal(firstPage.body.page.total, 35);
    assert.equal(firstPage.body.page.page, 1);
    assert.equal(firstPage.body.page.totalPages, 2);
    assert.equal(firstPage.body.page.hasPrev, false);
    assert.equal(firstPage.body.page.hasNext, true);

    const secondPage = await api.listSamples(
      buildInput({
        query: {
          limit: '30',
          page: '2'
        }
      })
    );

    assert.equal(secondPage.status, 200);
    assert.equal(secondPage.body.items.length, 5);
    assert.equal(secondPage.body.page.page, 2);
    assert.equal(secondPage.body.page.totalPages, 2);
    assert.equal(secondPage.body.page.hasPrev, true);
    assert.equal(secondPage.body.page.hasNext, false);

    const filtered = await api.listSamples(
      buildInput({
        query: {
          limit: '30',
          page: '1',
          lot: targetInternalLotNumber,
          owner: targetOwner.toLowerCase(),
          harvest: targetHarvest,
          createdDate: dateInSaoPaulo
        }
      })
    );

    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.page.total, 1);
    assert.equal(filtered.body.items.length, 1);
    assert.equal(filtered.body.items[0].declared.owner, targetOwner);
    assert.equal(filtered.body.items[0].declared.harvest, targetHarvest);
    assert.equal(filtered.body.items[0].internalLotNumber, targetInternalLotNumber);

    const monthFiltered = await api.listSamples(
      buildInput({
        query: {
          owner: targetOwner.toLowerCase(),
          createdMonth: monthInSaoPaulo
        }
      })
    );

    assert.equal(monthFiltered.status, 200);
    assert.equal(monthFiltered.body.page.total, 1);
    assert.equal(monthFiltered.body.items[0].internalLotNumber, targetInternalLotNumber);

    const yearFiltered = await api.listSamples(
      buildInput({
        query: {
          owner: targetOwner,
          createdYear: yearInSaoPaulo
        }
      })
    );

    assert.equal(yearFiltered.status, 200);
    assert.equal(yearFiltered.body.page.total, 1);
    assert.equal(yearFiltered.body.items[0].internalLotNumber, targetInternalLotNumber);

    const searchByLot = await api.listSamples(
      buildInput({
        query: {
          search: targetInternalLotNumber
        }
      })
    );

    assert.equal(searchByLot.status, 200);
    assert.equal(searchByLot.body.page.total, 1);
    assert.equal(searchByLot.body.items[0].internalLotNumber, targetInternalLotNumber);

    const searchByOwner = await api.listSamples(
      buildInput({
        query: {
          search: targetOwner
        }
      })
    );

    assert.equal(searchByOwner.status, 200);
    assert.equal(searchByOwner.body.page.total, 1);
    assert.equal(searchByOwner.body.items[0].declared.owner, targetOwner);

    const ownerPartial = await api.listSamples(
      buildInput({
        query: {
          owner: 'Fazenda Filtro'
        }
      })
    );

    assert.equal(ownerPartial.status, 200);
    assert.equal(ownerPartial.body.page.total, 0);
  });

  test('GET /samples supports statusGroup filter options', async () => {
    const printPendingOwner = await createSellerClient({
      legalName: 'Fazenda Print Pendente',
      tradeName: 'Fazenda Print Pendente'
    });

    const printPending = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId: randomUUID(),
          ownerClientId: printPendingOwner.client.id,
          sacks: 20,
          harvest: '25/26',
          originLot: 'ORIG-PRINT',
          receivedChannel: 'courier'
        }
      })
    );
    assert.equal(printPending.status, 201);

    const classificationPendingSampleId = randomUUID();
    await moveSampleToQrPrinted(classificationPendingSampleId);

    const classificationInProgressSampleId = randomUUID();
    await moveSampleToQrPrinted(classificationInProgressSampleId);
    const started = await api.startClassification(
      buildInput({
        params: { sampleId: classificationInProgressSampleId },
        body: {
          expectedVersion: 5,
          classificationId: null,
          notes: null
        }
      })
    );
    assert.equal(started.status, 201);

    const classifiedSampleId = randomUUID();
    await moveSampleToClassified(classifiedSampleId);

    const printPendingFiltered = await api.listSamples(
      buildInput({
        query: {
          statusGroup: 'PRINT_PENDING'
        }
      })
    );
    assert.equal(printPendingFiltered.status, 200);
    assert.equal(printPendingFiltered.body.page.total, 1);
    assert.equal(printPendingFiltered.body.items[0].status, 'QR_PENDING_PRINT');

    const classificationPendingFiltered = await api.listSamples(
      buildInput({
        query: {
          statusGroup: 'CLASSIFICATION_PENDING'
        }
      })
    );
    assert.equal(classificationPendingFiltered.status, 200);
    assert.equal(classificationPendingFiltered.body.page.total, 1);
    assert.equal(classificationPendingFiltered.body.items[0].status, 'QR_PRINTED');

    const classificationInProgressFiltered = await api.listSamples(
      buildInput({
        query: {
          statusGroup: 'CLASSIFICATION_IN_PROGRESS'
        }
      })
    );
    assert.equal(classificationInProgressFiltered.status, 200);
    assert.equal(classificationInProgressFiltered.body.page.total, 1);
    assert.equal(classificationInProgressFiltered.body.items[0].status, 'CLASSIFICATION_IN_PROGRESS');

    const classifiedFiltered = await api.listSamples(
      buildInput({
        query: {
          statusGroup: 'CLASSIFIED'
        }
      })
    );
    assert.equal(classifiedFiltered.status, 200);
    assert.equal(classifiedFiltered.body.page.total, 1);
    assert.equal(classifiedFiltered.body.items[0].status, 'CLASSIFIED');
  });

  test('GET /samples supports commercialStatus filter options', async () => {
    const soldSampleId = randomUUID();
    await moveSampleToClassified(soldSampleId);
    const buyer = await createSellerClient({
      legalName: 'Comprador Comercial LTDA',
      tradeName: 'Comprador Comercial LTDA',
      cnpj: '77.777.777/0001-77',
      isBuyer: true,
      isSeller: false
    });
    await commandService.createSampleMovement(
      {
        sampleId: soldSampleId,
        expectedVersion: 7,
        movementType: 'SALE',
        buyerClientId: buyer.client.id,
        quantitySacks: 11,
        movementDate: '2026-03-19',
        notes: 'lote completo'
      },
      actorClassifier
    );

    const lostSampleId = randomUUID();
    await moveSampleToClassified(lostSampleId);
    await commandService.updateCommercialStatus(
      {
        sampleId: lostSampleId,
        expectedVersion: 7,
        toCommercialStatus: 'LOST',
        reasonText: 'extravio'
      },
      actorClassifier
    );

    const partialSampleId = randomUUID();
    await moveSampleToClassified(partialSampleId);
    await commandService.createSampleMovement(
      {
        sampleId: partialSampleId,
        expectedVersion: 7,
        movementType: 'SALE',
        buyerClientId: buyer.client.id,
        quantitySacks: 4,
        movementDate: '2026-03-19',
        notes: 'venda parcial'
      },
      actorClassifier
    );

    const openSampleId = randomUUID();
    await moveSampleToClassified(openSampleId);

    const soldFiltered = await api.listSamples(
      buildInput({
        query: {
          commercialStatus: 'SOLD'
        }
      })
    );
    assert.equal(soldFiltered.status, 200);
    assert.equal(soldFiltered.body.page.total, 1);
    assert.equal(soldFiltered.body.items[0].commercialStatus, 'SOLD');

    const partialFiltered = await api.listSamples(
      buildInput({
        query: {
          commercialStatus: 'PARTIALLY_SOLD'
        }
      })
    );
    assert.equal(partialFiltered.status, 200);
    assert.equal(partialFiltered.body.page.total, 1);
    assert.equal(partialFiltered.body.items[0].commercialStatus, 'PARTIALLY_SOLD');

    const lostFiltered = await api.listSamples(
      buildInput({
        query: {
          commercialStatus: 'LOST'
        }
      })
    );
    assert.equal(lostFiltered.status, 200);
    assert.equal(lostFiltered.body.page.total, 1);
    assert.equal(lostFiltered.body.items[0].commercialStatus, 'LOST');

    const openFiltered = await api.listSamples(
      buildInput({
        query: {
          commercialStatus: 'OPEN'
        }
      })
    );
    assert.equal(openFiltered.status, 200);
    assert.equal(openFiltered.body.page.total, 1);
    assert.equal(openFiltered.body.items[0].commercialStatus, 'OPEN');
  });

  test('GET /samples validates period parameters and page', async () => {
    const invalidDate = await api.listSamples(
      buildInput({
        query: {
          createdDate: '2026-99-99'
        }
      })
    );

    assert.equal(invalidDate.status, 422);

    const invalidMonth = await api.listSamples(
      buildInput({
        query: {
          createdMonth: '2026-13'
        }
      })
    );

    assert.equal(invalidMonth.status, 422);

    const invalidYear = await api.listSamples(
      buildInput({
        query: {
          createdYear: '26'
        }
      })
    );

    assert.equal(invalidYear.status, 422);

    const conflictingPeriod = await api.listSamples(
      buildInput({
        query: {
          createdDate: '2026-03-05',
          createdMonth: '2026-03'
        }
      })
    );

    assert.equal(conflictingPeriod.status, 422);

    const invalidStatusGroup = await api.listSamples(
      buildInput({
        query: {
          statusGroup: 'UNKNOWN_STATUS'
        }
      })
    );

    assert.equal(invalidStatusGroup.status, 422);

    const invalidCommercialStatus = await api.listSamples(
      buildInput({
        query: {
          commercialStatus: 'UNKNOWN_COMMERCIAL_STATUS'
        }
      })
    );

    assert.equal(invalidCommercialStatus.status, 422);

    const invalidPage = await api.listSamples(
      buildInput({
        query: {
          page: '0'
        }
      })
    );

    assert.equal(invalidPage.status, 422);
  });

  test('POST /samples/:sampleId/photos saves classification photo when sample is in classification phase', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    const started = await api.startClassification(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 5,
          classificationId: null,
          notes: null
        }
      })
    );
    assert.equal(started.status, 201);

    const uploaded = await api.addLabelPhoto(
      buildInput({
        params: { sampleId },
        body: {
          kind: 'CLASSIFICATION_PHOTO',
          fileBuffer: Buffer.from('classification-photo-through-api'),
          mimeType: 'image/jpeg',
          originalFileName: 'classificacao-api.jpg',
          replaceExisting: true
        }
      })
    );

    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.event.eventType, 'PHOTO_ADDED');
    assert.equal(uploaded.body.event.payload.kind, 'CLASSIFICATION_PHOTO');

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 30 });
    const classificationPhotos = detail.attachments.filter((attachment) => attachment.kind === 'CLASSIFICATION_PHOTO');
    assert.equal(classificationPhotos.length, 1);
  });

  test('POST /samples/:sampleId/export/pdf exports COMPLETE report and records REPORT_EXPORTED event', async () => {
    const sampleId = randomUUID();
    await moveSampleToClassified(sampleId);

    const exported = await api.exportSamplePdf(
      buildInput({
        params: { sampleId },
        body: {
          exportType: 'COMPLETO',
          destination: 'Comprador XPTO'
        }
      })
    );

    assert.equal(exported.status, 200);
    assert.equal(exported.body.contentType, 'application/pdf');
    assert.equal(exported.body.auditEvent.eventType, 'REPORT_EXPORTED');
    assert.equal(exported.body.exportType, 'COMPLETO');
    assert.equal(exported.body.destination, 'Comprador XPTO');
    assert.ok(exported.body.selectedFields.includes('owner'));
    assert.ok(exported.body.selectedFields.includes('sacks'));
    assert.ok(exported.body.selectedFields.includes('harvest'));
    assert.equal(exported.body.selectedFields.includes('technicalDensity'), false);
    assert.equal(exported.body.selectedFields.includes('originLot'), false);
    assert.equal(exported.body.selectedFields.includes('classificationOriginLot'), false);

    const pdfBuffer = Buffer.isBuffer(exported.body.buffer)
      ? exported.body.buffer
      : Buffer.from(exported.body.buffer ?? []);
    assert.ok(pdfBuffer.length > 100);
    assert.equal(pdfBuffer.subarray(0, 4).toString('utf8'), '%PDF');

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 40 });
    assert.equal(exported.body.fileName, `amostra(${detail.sample.internalLotNumber}).pdf`);
    const reportEvents = detail.events.filter((event) => event.eventType === 'REPORT_EXPORTED');
    assert.equal(reportEvents.length, 1);
    assert.equal(reportEvents[0].payload.exportType, 'COMPLETO');
    assert.equal(reportEvents[0].payload.destination, 'Comprador XPTO');
    assert.deepEqual(reportEvents[0].payload.selectedFields, exported.body.selectedFields);
  });

  test('POST /samples/:sampleId/export/pdf exports COMPRADOR_PARCIAL report without owner', async () => {
    const sampleId = randomUUID();
    await moveSampleToClassified(sampleId);

    const exported = await api.exportSamplePdf(
      buildInput({
        params: { sampleId },
        body: {
          exportType: 'COMPRADOR_PARCIAL'
        }
      })
    );

    assert.equal(exported.status, 200);
    assert.equal(exported.body.exportType, 'COMPRADOR_PARCIAL');
    assert.equal(exported.body.destination, null);
    assert.equal(exported.body.selectedFields.includes('owner'), false);
    assert.ok(exported.body.selectedFields.includes('sacks'));
    assert.ok(exported.body.selectedFields.includes('harvest'));
    assert.equal(exported.body.selectedFields.includes('originLot'), false);
    assert.equal(exported.body.selectedFields.includes('classificationOriginLot'), false);

    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 40 });
    const reportEvents = detail.events.filter((event) => event.eventType === 'REPORT_EXPORTED');
    assert.equal(reportEvents.length, 1);
    assert.equal(reportEvents[0].payload.exportType, 'COMPRADOR_PARCIAL');
    assert.equal(reportEvents[0].payload.destination, null);
    assert.deepEqual(reportEvents[0].payload.selectedFields, exported.body.selectedFields);
  });

  test('POST /samples/:sampleId/export/pdf blocks export when sample is not CLASSIFIED', async () => {
    const sampleId = randomUUID();
    await moveSampleToQrPrinted(sampleId);

    const blocked = await api.exportSamplePdf(
      buildInput({
        params: { sampleId },
        body: {
          exportType: 'COMPLETO'
        }
      })
    );

    assert.equal(blocked.status, 409);
    assert.equal(
      blocked.body.error.message,
      `Sample ${sampleId} must be CLASSIFIED to export report`
    );
  });

  test('POST /samples/:sampleId/export/pdf rejects invalid exportType', async () => {
    const sampleId = randomUUID();
    await moveSampleToClassified(sampleId);

    const invalid = await api.exportSamplePdf(
      buildInput({
        params: { sampleId },
        body: {
          exportType: 'PARCIAL_X'
        }
      })
    );

    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.error.message, 'Unsupported export type: PARCIAL_X');
  });

  test('POST /samples/:sampleId/export/pdf rejects destination with invalid type', async () => {
    const sampleId = randomUUID();
    await moveSampleToClassified(sampleId);

    const invalid = await api.exportSamplePdf(
      buildInput({
        params: { sampleId },
        body: {
          exportType: 'COMPLETO',
          destination: 42
        }
      })
    );

    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.error.message, 'destination must be a string');
  });

  test('POST /registration/update updates declared snapshot and enforces version conflict', async () => {
    const sampleId = randomUUID();
    await moveLegacySampleToRegistrationConfirmed(sampleId);

    const updated = await api.updateRegistration(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 3,
          before: {
            declared: {
              owner: 'Fazenda Teste'
            }
          },
          after: {
            declared: {
              owner: 'Fazenda Corrigida'
            }
          },
          reasonCode: 'DATA_FIX',
          reasonText: 'correcao de cadastro'
        }
      })
    );

    assert.equal(updated.status, 201);
    assert.equal(updated.body.event.eventType, 'REGISTRATION_UPDATED');

    const sample = await queryService.requireSample(sampleId);
    assert.equal(sample.declared.owner, 'Fazenda Corrigida');
    assert.equal(sample.version, 4);

    const conflict = await api.updateRegistration(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 3,
          before: {
            declared: {
              owner: 'Fazenda Corrigida'
            }
          },
          after: {
            declared: {
              owner: 'Outro Nome'
            }
          },
          reasonCode: 'TYPO',
          reasonText: 'digitacao'
        }
      })
    );

    assert.equal(conflict.status, 409);
  });

  test('POST /classification/update accepts CLASSIFIED sample and updates classification projection', async () => {
    const sampleId = randomUUID();
    await moveSampleToClassified(sampleId);

    const updated = await api.updateClassification(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 7,
          before: {
            classificationData: {
              padrao: 'PADRAO-A'
            }
          },
          after: {
            classificationData: {
              padrao: 'PADRAO-B',
              umidade: 10.9
            }
          },
          reasonCode: 'TYPO',
          reasonText: 'ajuste pos classificacao'
        }
      })
    );

    assert.equal(updated.status, 201);
    assert.equal(updated.body.event.eventType, 'CLASSIFICATION_UPDATED');

    const sample = await queryService.requireSample(sampleId);
    assert.equal(sample.status, 'CLASSIFIED');
    assert.equal(sample.latestClassification.data?.padrao, 'PADRAO-B');
    assert.equal(sample.latestClassification.data?.umidade, 10.9);
    assert.equal(sample.version, 8);
  });

  test('POST /registration/update keeps diff-only payload and blocks id fields', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);

    const updated = await api.updateRegistration(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 3,
          after: {
            declared: {
              owner: 'Fazenda Teste',
              sacks: 12
            }
          },
          reasonCode: 'DATA_FIX',
          reasonText: 'ajuste de sacas'
        }
      })
    );

    assert.equal(updated.status, 201);
    assert.equal(updated.body.event.eventType, 'REGISTRATION_UPDATED');
    assert.deepEqual(updated.body.event.payload.before, {
      declared: {
        sacks: 11
      }
    });
    assert.deepEqual(updated.body.event.payload.after, {
      declared: {
        sacks: 12
      }
    });

    const blocked = await api.updateRegistration(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 4,
          after: {
            id: 'forbidden-id',
            declared: {
              owner: 'Fazenda X'
            }
          },
          reasonCode: 'TYPO',
          reasonText: 'tentativa invalida'
        }
      })
    );

    assert.equal(blocked.status, 422);
  });

  test('POST /classification/update supports non-classification statuses and enforces reason word limit', async () => {
    const sampleId = randomUUID();
    await commandService.receiveSample({ sampleId, receivedChannel: 'in_person' }, actorClassifier);

    const updated = await api.updateClassification(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 1,
          after: {
            classificationData: {
              padrao: 'PADRAO-INICIAL'
            }
          },
          reasonCode: 'MISSING_INFO',
          reasonText: 'ajuste inicial'
        }
      })
    );

    assert.equal(updated.status, 201);
    assert.equal(updated.body.event.eventType, 'CLASSIFICATION_UPDATED');

    const sample = await queryService.requireSample(sampleId);
    assert.equal(sample.latestClassification.data?.padrao, 'PADRAO-INICIAL');

    const tooLongReason = await api.updateClassification(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 2,
          after: {
            classificationData: {
              padrao: 'PADRAO-2'
            }
          },
          reasonCode: 'OTHER',
          reasonText: 'um dois tres quatro cinco seis sete oito nove dez onze'
        }
      })
    );

    assert.equal(tooLongReason.status, 422);
  });

  test('POST /edits/revert reverts previous update event and appends new audit event', async () => {
    const sampleId = randomUUID();
    await moveSampleToClassified(sampleId);

    const changed = await api.updateClassification(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 7,
          after: {
            classificationData: {
              padrao: 'PADRAO-REVERSIVEL'
            }
          },
          reasonCode: 'DATA_FIX',
          reasonText: 'ajuste temporario'
        }
      })
    );

    assert.equal(changed.status, 201);
    assert.equal(changed.body.event.eventType, 'CLASSIFICATION_UPDATED');

    const reverted = await api.revertSampleUpdate(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 8,
          targetEventId: changed.body.event.eventId,
          reasonCode: 'DATA_FIX',
          reasonText: 'reverter ajuste'
        }
      })
    );

    assert.equal(reverted.status, 201);
    assert.equal(reverted.body.event.eventType, 'CLASSIFICATION_UPDATED');

    const sample = await queryService.requireSample(sampleId);
    assert.equal(sample.latestClassification.data?.padrao, 'PADRAO-A');
    assert.equal(sample.version, 9);
  });

  test('POST /commercial-status updates classified sample and enforces transition rules', async () => {
    const sampleId = randomUUID();
    await moveSampleToClassified(sampleId);

    const rejectedAutomatic = await api.updateCommercialStatus(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 7,
          toCommercialStatus: 'SOLD',
          reasonText: 'negocio fechado'
        }
      })
    );

    assert.equal(rejectedAutomatic.status, 422);

    const markedLost = await api.updateCommercialStatus(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 7,
          toCommercialStatus: 'LOST',
          reasonText: 'extravio total'
        }
      })
    );

    assert.equal(markedLost.status, 201);
    assert.equal(markedLost.body.event.eventType, 'LOSS_RECORDED');
    assert.equal(markedLost.body.sample.commercialStatus, 'LOST');
    assert.equal(markedLost.body.sample.lostSacks, 11);

    const noRemaining = await api.updateCommercialStatus(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 8,
          toCommercialStatus: 'LOST',
          reasonText: 'segunda tentativa'
        }
      })
    );

    assert.equal(noRemaining.status, 409);

    const partialSampleId = randomUUID();
    await moveSampleToClassified(partialSampleId);
    const buyer = await createSellerClient({
      legalName: 'Comprador Parcial LTDA',
      tradeName: 'Comprador Parcial LTDA',
      cnpj: '66.555.444/0001-33',
      isBuyer: true,
      isSeller: false
    });
    const partialSale = await api.createSampleMovement(
      buildInput({
        params: { sampleId: partialSampleId },
        body: {
          expectedVersion: 7,
          movementType: 'SALE',
          buyerClientId: buyer.client.id,
          quantitySacks: 4,
          movementDate: '2026-03-19',
          notes: 'parcial'
        }
      })
    );

    assert.equal(partialSale.status, 201);

    const lostRemaining = await api.updateCommercialStatus(
      buildInput({
        params: { sampleId: partialSampleId },
        body: {
          expectedVersion: partialSale.body.sample.version,
          toCommercialStatus: 'LOST',
          reasonText: 'restante perdido'
        }
      })
    );

    assert.equal(lostRemaining.status, 201);
    assert.equal(lostRemaining.body.event.eventType, 'LOSS_RECORDED');
    assert.equal(lostRemaining.body.sample.commercialStatus, 'PARTIALLY_SOLD');
    assert.equal(lostRemaining.body.sample.soldSacks, 4);
    assert.equal(lostRemaining.body.sample.lostSacks, 7);

    const nonClassifiedSampleId = randomUUID();
    await moveSampleToQrPrinted(nonClassifiedSampleId);
    const blockedByOperationalStatus = await api.updateCommercialStatus(
      buildInput({
        params: { sampleId: nonClassifiedSampleId },
        body: {
          expectedVersion: 5,
          toCommercialStatus: 'LOST',
          reasonText: 'deveria falhar'
        }
      })
    );

    assert.equal(blockedByOperationalStatus.status, 409);
  });

  test('sample movements create update list cancel and recalculate commercial summary', async () => {
    const sampleId = randomUUID();
    await moveSampleToClassified(sampleId);

    const buyerA = await createSellerClient({
      legalName: 'Comprador A LTDA',
      tradeName: 'Comprador A LTDA',
      cnpj: '22.333.444/0001-55',
      isBuyer: true,
      isSeller: false
    });
    const buyerB = await createSellerClient({
      legalName: 'Comprador B LTDA',
      tradeName: 'Comprador B LTDA',
      cnpj: '33.444.555/0001-66',
      isBuyer: true,
      isSeller: false
    });

    const createdSale = await api.createSampleMovement(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 7,
          movementType: 'SALE',
          buyerClientId: buyerA.client.id,
          quantitySacks: 5,
          movementDate: '2026-03-19',
          notes: 'venda inicial'
        }
      })
    );

    assert.equal(createdSale.status, 201);
    assert.equal(createdSale.body.event.eventType, 'SALE_CREATED');
    assert.equal(createdSale.body.sample.commercialStatus, 'PARTIALLY_SOLD');
    assert.equal(createdSale.body.sample.soldSacks, 5);
    const sampleAfterCreatedSale = await queryService.requireSample(sampleId);
    assert.equal(sampleAfterCreatedSale.availableSacks, 6);

    const updatedSale = await api.updateSampleMovement(
      buildInput({
        params: {
          sampleId,
          movementId: createdSale.body.event.payload.movementId
        },
        body: {
          expectedVersion: createdSale.body.sample.version,
          after: {
            buyerClientId: buyerB.client.id,
            quantitySacks: 6,
            notes: 'venda revisada'
          },
          reasonText: 'ajuste comercial'
        }
      })
    );

    assert.equal(updatedSale.status, 201);
    assert.equal(updatedSale.body.event.eventType, 'SALE_UPDATED');
    assert.equal(updatedSale.body.sample.soldSacks, 6);
    const sampleAfterUpdatedSale = await queryService.requireSample(sampleId);
    assert.equal(sampleAfterUpdatedSale.availableSacks, 5);

    const createdLoss = await api.createSampleMovement(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: updatedSale.body.sample.version,
          movementType: 'LOSS',
          quantitySacks: 2,
          movementDate: '2026-03-20',
          lossReasonText: 'quebra de lote'
        }
      })
    );

    assert.equal(createdLoss.status, 201);
    assert.equal(createdLoss.body.event.eventType, 'LOSS_RECORDED');
    assert.equal(createdLoss.body.sample.lostSacks, 2);
    assert.equal(createdLoss.body.sample.commercialStatus, 'PARTIALLY_SOLD');

    const movements = await api.listSampleMovements(
      buildInput({
        params: { sampleId }
      })
    );

    assert.equal(movements.status, 200);
    assert.equal(movements.body.movements.length, 2);
    assert.equal(movements.body.movements[0].createdAt >= movements.body.movements[1].createdAt, true);

    const cancelledLoss = await api.cancelSampleMovement(
      buildInput({
        params: {
          sampleId,
          movementId: createdLoss.body.event.payload.movementId
        },
        body: {
          expectedVersion: createdLoss.body.sample.version,
          reasonText: 'cancelar perda'
        }
      })
    );

    assert.equal(cancelledLoss.status, 201);
    assert.equal(cancelledLoss.body.event.eventType, 'LOSS_CANCELLED');
    assert.equal(cancelledLoss.body.sample.lostSacks, 0);
    assert.equal(cancelledLoss.body.sample.commercialStatus, 'PARTIALLY_SOLD');
  });

  test('sample movement validations block inactive buyer, non-buyer client and non-classified sample', async () => {
    const sampleId = randomUUID();
    await moveSampleToClassified(sampleId);

    const inactiveBuyer = await createSellerClient({
      legalName: 'Comprador Inativo LTDA',
      tradeName: 'Comprador Inativo LTDA',
      cnpj: '44.555.666/0001-77',
      isBuyer: true,
      isSeller: false
    });
    await clientService.inactivateClient(
      inactiveBuyer.client.id,
      {
        reasonText: 'inativado'
      },
      actorAdmin
    );

    const inactiveBuyerResult = await api.createSampleMovement(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 7,
          movementType: 'SALE',
          buyerClientId: inactiveBuyer.client.id,
          quantitySacks: 2,
          movementDate: '2026-03-19',
          notes: 'deve falhar'
        }
      })
    );
    assert.equal(inactiveBuyerResult.status, 422);

    const sellerOnlyClient = await createSellerClient({
      legalName: 'Vendedor Somente LTDA',
      tradeName: 'Vendedor Somente LTDA',
      cnpj: '55.666.777/0001-88',
      isBuyer: false,
      isSeller: true
    });

    const nonBuyerResult = await api.createSampleMovement(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 7,
          movementType: 'SALE',
          buyerClientId: sellerOnlyClient.client.id,
          quantitySacks: 2,
          movementDate: '2026-03-19',
          notes: 'deve falhar'
        }
      })
    );
    assert.equal(nonBuyerResult.status, 422);

    const nonClassifiedSampleId = randomUUID();
    await moveSampleToQrPrinted(nonClassifiedSampleId);
    const validBuyer = await createSellerClient({
      legalName: 'Comprador Valido LTDA',
      tradeName: 'Comprador Valido LTDA',
      cnpj: '66.777.888/0001-99',
      isBuyer: true,
      isSeller: false
    });

    const blockedByStatus = await api.createSampleMovement(
      buildInput({
        params: { sampleId: nonClassifiedSampleId },
        body: {
          expectedVersion: 5,
          movementType: 'SALE',
          buyerClientId: validBuyer.client.id,
          quantitySacks: 2,
          movementDate: '2026-03-19',
          notes: 'deve falhar'
        }
      })
    );
    assert.equal(blockedByStatus.status, 409);
  });

  test('loss without sales keeps commercial status OPEN', async () => {
    const sampleId = randomUUID();
    await moveSampleToClassified(sampleId);

    const createdLoss = await api.createSampleMovement(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 7,
          movementType: 'LOSS',
          quantitySacks: 2,
          movementDate: '2026-03-19',
          lossReasonText: 'quebra parcial'
        }
      })
    );

    assert.equal(createdLoss.status, 201);
    assert.equal(createdLoss.body.event.eventType, 'LOSS_RECORDED');
    assert.equal(createdLoss.body.sample.commercialStatus, 'OPEN');
    assert.equal(createdLoss.body.sample.lostSacks, 2);
    const sampleAfterLoss = await queryService.requireSample(sampleId);
    assert.equal(sampleAfterLoss.availableSacks, 9);
  });

  test('registration update recalculates commercial status and blocks declared sacks below sold plus lost', async () => {
    const sampleId = randomUUID();
    await moveSampleToClassified(sampleId);

    const buyer = await createSellerClient({
      legalName: 'Comprador Registro LTDA',
      tradeName: 'Comprador Registro LTDA',
      cnpj: '77.888.999/0001-00',
      isBuyer: true,
      isSeller: false
    });

    const createdSale = await api.createSampleMovement(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 7,
          movementType: 'SALE',
          buyerClientId: buyer.client.id,
          quantitySacks: 5,
          movementDate: '2026-03-19',
          notes: 'venda parcial'
        }
      })
    );

    const reduced = await api.updateRegistration(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: createdSale.body.sample.version,
          after: {
            declared: {
              sacks: 5
            }
          },
          reasonCode: 'DATA_FIX',
          reasonText: 'ajuste de volume'
        }
      })
    );

    assert.equal(reduced.status, 201);
    const reducedSample = await queryService.requireSample(sampleId);
    assert.equal(reducedSample.declared.sacks, 5);
    assert.equal(reducedSample.commercialStatus, 'SOLD');
    assert.equal(reducedSample.availableSacks, 0);

    const invalidReduction = await api.updateRegistration(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: reducedSample.version,
          after: {
            declared: {
              sacks: 4
            }
          },
          reasonCode: 'DATA_FIX',
          reasonText: 'deve falhar'
        }
      })
    );

    assert.equal(invalidReduction.status, 409);
  });

  test('POST /invalidate accepts authenticated roles and keeps INVALIDATED terminal', async () => {
    const sampleId = randomUUID();
    await commandService.receiveSample({ sampleId, receivedChannel: 'in_person' }, actorClassifier);

    const classifierInvalidation = await api.invalidateSample(
      buildInput({
        headers: classifierAuthHeaders,
        params: { sampleId },
        body: {
          expectedVersion: 1,
          reasonCode: 'OTHER',
          reasonText: 'classificador nao pode'
        }
      })
    );

    assert.equal(classifierInvalidation.status, 201);
    assert.equal(classifierInvalidation.body.event.eventType, 'SAMPLE_INVALIDATED');

    const alreadyInvalidatedByAdmin = await api.invalidateSample(
      buildInput({
        headers: adminAuthHeaders,
        params: { sampleId },
        body: {
          expectedVersion: 2,
          reasonCode: 'CANCELLED',
          reasonText: 'cancelamento administrativo'
        }
      })
    );

    assert.equal(alreadyInvalidatedByAdmin.status, 409);
  });

  test('GET /events supports pagination and validates query params', async () => {
    const sampleId = randomUUID();
    await moveSampleToRegistrationConfirmed(sampleId);

    const firstPage = await api.listSampleEvents(
      buildInput({
        params: { sampleId },
        query: {
          limit: '2'
        }
      })
    );

    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.events.length, 2);
    assert.deepEqual(
      firstPage.body.events.map((event) => event.sequenceNumber),
      [1, 2]
    );

    const nextPage = await api.listSampleEvents(
      buildInput({
        params: { sampleId },
        query: {
          afterSequence: '2',
          limit: '10'
        }
      })
    );

    assert.equal(nextPage.status, 200);
    assert.equal(nextPage.body.events.length, 2);
    assert.deepEqual(
      nextPage.body.events.map((event) => event.sequenceNumber),
      [3, 4]
    );

    const invalidLimit = await api.listSampleEvents(
      buildInput({
        params: { sampleId },
        query: {
          limit: 'abc'
        }
      })
    );

    assert.equal(invalidLimit.status, 422);

    const invalidAfter = await api.listSampleEvents(
      buildInput({
        params: { sampleId },
        query: {
          afterSequence: '-1'
        }
      })
    );

    assert.equal(invalidAfter.status, 422);
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
