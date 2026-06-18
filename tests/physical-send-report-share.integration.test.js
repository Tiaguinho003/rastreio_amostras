import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { LocalAuthService } from '../src/auth/local-auth-service.js';
import { ClientService } from '../src/clients/client-service.js';
import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { SamplePdfReportService } from '../src/reports/sample-pdf-report-service.js';
import { LocalUploadService } from '../src/uploads/local-upload-service.js';
import { generateValidCnpj } from './helpers/cnpj-generator.js';

// Etiqueta de Envio — fase 3 (orquestracao do envio com laudo congelado).
// Exercita o handler recordPhysicalSampleSent via createBackendApiV1 (com
// reportService real), validando a bifurcacao por status:
//   - CLASSIFIED  -> evento PHYSICAL_SAMPLE_SENT + SampleReportShare ATOMICOS
//                    (token 32B, expiracao 30d) + PDF congelado em UPLOADS_DIR
//                    + job ShippingPrintJob PENDING com qrUrl.
//   - REGISTRATION_CONFIRMED -> so o evento + job sem qrUrl (sem share/PDF).
// Tambem cobre multi-destinatario (1 share/PDF/job por envio) e a atomicidade
// quando o laudo nao pode ser gerado (foto sumida do storage => 409, nada
// gravado). appendEventBatch+beforeCommit e Postgres-only, entao e integracao.

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('physical-send report share integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const eventStore = new PrismaEventStore(prisma);
  const eventService = new EventContractDbService({ store: eventStore });
  const queryService = new SampleQueryService({ prisma });
  const clientService = new ClientService({ prisma });

  // UUID v4 valido (versao 4 + variant 8) — normalizeClassifiers exige UUID
  // bem-formado no fluxo de classificacao.
  const ACTOR_USER_ID = 'a0000000-0000-4000-8000-000000000f33';
  const actor = {
    actorType: 'USER',
    actorUserId: ACTOR_USER_ID,
    role: 'CLASSIFIER',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };

  // Mock de UserService pro fluxo de classifiers (aceita qualquer UUID ACTIVE).
  const userServiceMock = {
    async findUsersForSnapshotByIds(userIds) {
      const ids = Array.from(
        new Set(
          (Array.isArray(userIds) ? userIds : []).filter(
            (id) => typeof id === 'string' && id.length > 0
          )
        )
      );
      return new Map(
        ids.map((id) => [
          id,
          {
            id,
            fullName: `User ${id.slice(0, 8)}`,
            username: `u_${id.slice(0, 8)}`,
            status: 'ACTIVE',
          },
        ])
      );
    },
  };

  // PNG 1x1 valido (magic bytes aceitos pelo upload service; embedavel no PDF).
  const tinyPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8f5i8AAAAASUVORK5CYII=',
    'base64'
  );

  let uploadDir;
  let uploadService;
  let commandService;
  let reportService;
  let api;
  let authHeaders;
  let sellerSeq = 0;

  test.before(async () => {
    await prisma.$connect();
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coffee-send-test-'));
    uploadService = new LocalUploadService({ baseDir: uploadDir });
    commandService = new SampleCommandService({
      eventService,
      queryService,
      uploadService,
      clientService,
      userService: userServiceMock,
    });
    reportService = new SamplePdfReportService({
      queryService,
      commandService,
      uploadsBaseDir: uploadService.baseDir,
    });

    const authService = new LocalAuthService({
      secret: 'super-secret-for-physical-send-tests',
      allowPlaintextPasswords: true,
      users: [
        {
          id: ACTOR_USER_ID,
          username: 'send-test',
          password: 'send123',
          role: 'CLASSIFIER',
          displayName: 'Envio Teste',
        },
      ],
    });
    authHeaders = {
      authorization: `Bearer ${authService.login({ username: 'send-test', password: 'send123' }).accessToken}`,
      'x-source': 'web',
    };

    api = createBackendApiV1({
      authService,
      clientService,
      commandService,
      queryService,
      reportService,
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
    await seedActorUser();
  });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE sample_report_share, shipping_print_job, client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample, user_session, app_user RESTART IDENTITY CASCADE'
    );
  }

  async function seedActorUser() {
    await prisma.user.create({
      data: {
        id: ACTOR_USER_ID,
        fullName: 'Envio Teste',
        username: 'send-test',
        usernameCanonical: 'send-test',
        email: 'send-test@example.com',
        emailCanonical: 'send-test@example.com',
        passwordHash: 'x',
        role: 'CLASSIFIER',
      },
    });
  }

  async function createSellerClient(name) {
    sellerSeq += 1;
    return clientService.createClient(
      {
        personType: 'PJ',
        legalName: name,
        tradeName: name,
        cnpj: generateValidCnpj(sellerSeq),
        phone: '35 99999-0000',
        isBuyer: true,
        isSeller: true,
      },
      actor
    );
  }

  async function createRegistrationConfirmedSample() {
    const sampleId = randomUUID();
    const owner = await createSellerClient(`Proprietario ${sampleId.slice(0, 8)} LTDA`);
    await commandService.createSample(
      {
        sampleId,
        clientDraftId: `draft-${sampleId.slice(0, 8)}`,
        ownerClientId: owner.client.id,
        owner: owner.client.displayName,
        sacks: 11,
        harvest: '25/26',
        originLot: `ORIG-${sampleId.slice(0, 8)}`,
        receivedChannel: 'in_person',
        idempotencyKey: randomUUID(),
      },
      actor
    );
    return sampleId;
  }

  // Cria amostra, anexa foto de classificacao e conclui a classificacao =>
  // CLASSIFIED (pre-requisito do laudo). Le a version corrente p/ nao assumir.
  async function classifySample() {
    const sampleId = await createRegistrationConfirmedSample();
    await commandService.addClassificationPhoto(
      {
        sampleId,
        fileBuffer: tinyPngBuffer,
        mimeType: 'image/png',
        originalFileName: 'classificacao.png',
      },
      actor
    );
    const rc = await queryService.getSampleDetail(sampleId, { eventLimit: 1 });
    await commandService.completeClassification(
      {
        sampleId,
        expectedVersion: rc.sample.version,
        classificationData: {
          dataClassificacao: '2026-06-18',
          padrao: 'PADRAO-1',
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
        classifiers: [{ userId: actor.actorUserId }],
        idempotencyKey: randomUUID(),
      },
      actor
    );
    return sampleId;
  }

  function sendPhysical(sampleId, body) {
    return api.recordPhysicalSampleSent({
      headers: authHeaders,
      params: { sampleId },
      query: {},
      body,
    });
  }

  test('envio de amostra CLASSIFIED gera share + PDF congelado + job com QR (atomico)', async () => {
    const sampleId = await classifySample();
    const buyer = await createSellerClient('Comprador Alpha LTDA');

    const res = await sendPhysical(sampleId, {
      recipientClientId: buyer.client.id,
      sentDate: '2026-06-18',
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.share, 'resposta deve trazer o share');
    assert.match(res.body.share.token, /^[0-9a-f]{64}$/, 'token = 32 bytes hex');
    assert.ok(
      res.body.qrUrl.endsWith(`/laudo/${res.body.share.token}`),
      'qrUrl aponta pra /laudo/<token>'
    );

    const share = await prisma.sampleReportShare.findUnique({
      where: { sendEventId: res.body.event.eventId },
    });
    assert.ok(share, 'share existe vinculado ao evento de envio');
    assert.equal(share.token, res.body.share.token);
    assert.equal(share.sampleId, sampleId);
    assert.equal(share.recipientClientId, buyer.client.id);
    assert.equal(share.issuedByUserId, ACTOR_USER_ID);
    assert.equal(share.revokedAt, null);

    // expiracao em ~30 dias (D7).
    const ttlDays = (share.expiresAt.getTime() - share.issuedAt.getTime()) / (24 * 3600 * 1000);
    assert.ok(Math.abs(ttlDays - 30) < 0.01, `expiresAt = +30d (got ${ttlDays}d)`);

    // PDF congelado no storage: tamanho e checksum batem.
    const pdfBytes = await fs.readFile(path.join(uploadDir, share.storagePath));
    assert.equal(pdfBytes.length, share.sizeBytes);
    assert.equal(createHash('sha256').update(pdfBytes).digest('hex'), share.checksumSha256);
    assert.ok(share.storagePath.startsWith(`samples/${sampleId}/report-shares/`));

    // 1 job de etiqueta PENDING, com QR.
    const jobs = await prisma.shippingPrintJob.findMany({ where: { status: 'PENDING' } });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].payload.sampleId, sampleId);
    assert.equal(jobs[0].payload.token, share.token);
    assert.ok(jobs[0].payload.qrUrl.endsWith(`/laudo/${share.token}`));
    assert.equal(jobs[0].payload.recipientName, buyer.client.displayName);
  });

  test('envio de amostra REGISTRATION_CONFIRMED registra so o evento + job sem QR', async () => {
    const sampleId = await createRegistrationConfirmedSample();

    const res = await sendPhysical(sampleId, { recipientClientId: null, sentDate: '2026-06-18' });

    assert.equal(res.status, 201);
    assert.equal(res.body.share, undefined, 'sem share quando nao classificada');

    const shareCount = await prisma.sampleReportShare.count({ where: { sampleId } });
    assert.equal(shareCount, 0);

    const jobs = await prisma.shippingPrintJob.findMany({ where: { status: 'PENDING' } });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].payload.token, null, 'etiqueta sem QR');
    assert.equal(jobs[0].payload.qrUrl, null);
    assert.equal(jobs[0].payload.sampleId, sampleId);

    const sent = await prisma.sampleEvent.count({
      where: { sampleId, eventType: 'PHYSICAL_SAMPLE_SENT' },
    });
    assert.equal(sent, 1);
  });

  test('envio CLASSIFIED para 2 destinatarios gera 2 shares/PDFs/jobs com tokens distintos', async () => {
    const sampleId = await classifySample();
    const b1 = await createSellerClient('Comprador Um LTDA');
    const b2 = await createSellerClient('Comprador Dois LTDA');

    const r1 = await sendPhysical(sampleId, {
      recipientClientId: b1.client.id,
      sentDate: '2026-06-18',
    });
    const r2 = await sendPhysical(sampleId, {
      recipientClientId: b2.client.id,
      sentDate: '2026-06-18',
    });

    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.notEqual(r1.body.share.token, r2.body.share.token);

    const shares = await prisma.sampleReportShare.findMany({ where: { sampleId } });
    assert.equal(shares.length, 2);

    const jobs = await prisma.shippingPrintJob.count({ where: { status: 'PENDING' } });
    assert.equal(jobs, 2);

    // 2 PDFs distintos no storage.
    const paths = new Set(shares.map((s) => s.storagePath));
    assert.equal(paths.size, 2);
    for (const s of shares) {
      await fs.access(path.join(uploadDir, s.storagePath));
    }
  });

  test('envio CLASSIFIED com foto sumida do storage falha 409 sem gravar nada (atomico)', async () => {
    const sampleId = await classifySample();

    // Simula corrupcao de storage: remove o arquivo da foto de classificacao.
    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 1 });
    const photo = detail.attachments.find((a) => a.kind === 'CLASSIFICATION_PHOTO');
    await fs.rm(path.join(uploadDir, photo.storagePath), { force: true });

    const res = await sendPhysical(sampleId, { recipientClientId: null, sentDate: '2026-06-18' });

    assert.equal(res.status, 409, 'gera 409 quando o laudo nao pode ser gerado');

    // Nada gravado: sem share, sem evento de envio, sem job.
    assert.equal(await prisma.sampleReportShare.count({ where: { sampleId } }), 0);
    assert.equal(
      await prisma.sampleEvent.count({ where: { sampleId, eventType: 'PHYSICAL_SAMPLE_SENT' } }),
      0
    );
    assert.equal(await prisma.shippingPrintJob.count({}), 0);
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
