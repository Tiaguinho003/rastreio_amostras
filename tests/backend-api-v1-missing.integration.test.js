import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { SamplePdfReportService } from '../src/reports/sample-pdf-report-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
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

  let uploadDir;
  let uploadService;
  let commandService;
  let reportService;
  let api;

  const tinyPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8f5i8AAAAASUVORK5CYII=',
    'base64'
  );

  const classifierHeaders = {
    'x-user-id': '00000000-0000-0000-0000-000000000101',
    'x-user-role': 'CLASSIFIER'
  };

  const adminHeaders = {
    'x-user-id': '00000000-0000-0000-0000-000000000100',
    'x-user-role': 'ADMIN'
  };

  const actorClassifier = {
    actorType: 'USER',
    actorUserId: classifierHeaders['x-user-id'],
    role: 'CLASSIFIER',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test'
  };

  const actorAdmin = {
    actorType: 'USER',
    actorUserId: adminHeaders['x-user-id'],
    role: 'ADMIN',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test'
  };

  function buildInput({ headers = classifierHeaders, params = {}, query = {}, body = {} } = {}) {
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
        declared: {
          owner: 'Fazenda Teste',
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
      uploadService
    });
    reportService = new SamplePdfReportService({
      queryService,
      commandService,
      uploadsBaseDir: uploadDir
    });

    api = createBackendApiV1({
      authService: null,
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

  test('POST /samples/create creates sample without photo and prepares QR print', async () => {
    const clientDraftId = randomUUID();

    const created = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId,
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

    assert.equal(created.status, 201);
    assert.equal(created.body.sample.status, 'QR_PENDING_PRINT');
    assert.equal(created.body.sample.declared.owner, 'Fazenda Nova Era');
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
    const clientDraftId = randomUUID();

    const created = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId,
          owner: 'Fazenda Com Foto',
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

  test('POST /samples/create is idempotent by clientDraftId and avoids duplicate samples', async () => {
    const clientDraftId = randomUUID();

    const first = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId,
          owner: 'Fazenda Idempotente',
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
          owner: 'Outro nome que nao deve sobrescrever',
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
    assert.equal(second.body.sample.declared.owner, 'Fazenda Idempotente');

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

    for (let index = 0; index < 35; index += 1) {
      const created = await api.createSampleAndPreparePrint(
        buildInput({
          body: {
            clientDraftId: randomUUID(),
            owner: index === 10 ? targetOwner : `Fazenda ${index % 4}`,
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
    const printPending = await api.createSampleAndPreparePrint(
      buildInput({
        body: {
          clientDraftId: randomUUID(),
          owner: 'Fazenda Print Pendente',
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
    await commandService.updateCommercialStatus(
      {
        sampleId: soldSampleId,
        expectedVersion: 7,
        toCommercialStatus: 'SOLD',
        reasonText: 'fechamento'
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

    const pdfBuffer = Buffer.from(exported.body.dataBase64, 'base64');
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
    await moveSampleToRegistrationConfirmed(sampleId);

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

    const updatedToSold = await api.updateCommercialStatus(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 7,
          toCommercialStatus: 'SOLD',
          reasonText: 'negocio fechado'
        }
      })
    );

    assert.equal(updatedToSold.status, 201);
    assert.equal(updatedToSold.body.event.eventType, 'COMMERCIAL_STATUS_UPDATED');
    assert.equal(updatedToSold.body.sample.commercialStatus, 'SOLD');

    const invalidTransition = await api.updateCommercialStatus(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 8,
          toCommercialStatus: 'LOST',
          reasonText: 'tentativa invalida'
        }
      })
    );

    assert.equal(invalidTransition.status, 409);

    const reopened = await api.updateCommercialStatus(
      buildInput({
        params: { sampleId },
        body: {
          expectedVersion: 8,
          toCommercialStatus: 'OPEN',
          reasonText: 'reabertura'
        }
      })
    );

    assert.equal(reopened.status, 201);
    assert.equal(reopened.body.sample.commercialStatus, 'OPEN');

    const nonClassifiedSampleId = randomUUID();
    await moveSampleToQrPrinted(nonClassifiedSampleId);
    const blockedByOperationalStatus = await api.updateCommercialStatus(
      buildInput({
        params: { sampleId: nonClassifiedSampleId },
        body: {
          expectedVersion: 5,
          toCommercialStatus: 'SOLD',
          reasonText: 'deveria falhar'
        }
      })
    );

    assert.equal(blockedByOperationalStatus.status, 409);
  });

  test('POST /invalidate enforces ADMIN role and keeps INVALIDATED terminal', async () => {
    const sampleId = randomUUID();
    await commandService.receiveSample({ sampleId, receivedChannel: 'in_person' }, actorClassifier);

    const forbidden = await api.invalidateSample(
      buildInput({
        headers: classifierHeaders,
        params: { sampleId },
        body: {
          expectedVersion: 1,
          reasonCode: 'OTHER',
          reasonText: 'classificador nao pode'
        }
      })
    );

    assert.equal(forbidden.status, 403);

    const success = await api.invalidateSample(
      buildInput({
        headers: adminHeaders,
        params: { sampleId },
        body: {
          expectedVersion: 1,
          reasonCode: 'CANCELLED',
          reasonText: 'cancelamento administrativo'
        }
      })
    );

    assert.equal(success.status, 201);
    assert.equal(success.body.event.eventType, 'SAMPLE_INVALIDATED');

    const alreadyInvalidated = await api.invalidateSample(
      buildInput({
        headers: adminHeaders,
        params: { sampleId },
        body: {
          expectedVersion: 2,
          reasonCode: 'OTHER',
          reasonText: 'segunda tentativa'
        }
      })
    );

    assert.equal(alreadyInvalidated.status, 409);
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
