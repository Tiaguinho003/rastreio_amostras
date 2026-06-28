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

// Etiqueta de Envio — orquestracao do envio com laudo gerado AO VIVO.
// Exercita o handler recordPhysicalSampleSent via createBackendApiV1 (com
// reportService real). A etiqueta e UNIFICADA: TODO envio (classificado ou nao)
// cria evento PHYSICAL_SAMPLE_SENT + SampleReportShare ATOMICOS (token 32B,
// expiracao 30d) + job ShippingPrintJob PENDING COM qrUrl. O PDF NAO e congelado
// (colunas de arquivo do share ficam nulas) — a rota publica /laudo/<token> o
// gera ao vivo a cada acesso, refletindo o estado ATUAL da amostra (classificar
// depois do envio aparece no mesmo QR). Cobre tambem multi-destinatario (1
// share/job por envio). appendEventBatch+beforeCommit e Postgres-only, entao e
// integracao.

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

  // Anexa foto de classificacao e conclui a classificacao de uma amostra que ja
  // existe => CLASSIFIED. Le a version corrente p/ nao assumir.
  async function classifyExistingSample(sampleId) {
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
  }

  // Cria amostra + classifica => CLASSIFIED (pre-requisito do laudo completo).
  async function classifySample() {
    const sampleId = await createRegistrationConfirmedSample();
    await classifyExistingSample(sampleId);
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

  test('envio de amostra CLASSIFIED gera share + job com QR (atomico, sem PDF congelado)', async () => {
    const sampleId = await classifySample();
    const buyer = await createSellerClient('Comprador Alpha LTDA');

    const res = await sendPhysical(sampleId, {
      recipientClientId: buyer.client.id,
      sentDate: '2026-06-18',
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.share, 'resposta deve trazer o share');
    assert.match(res.body.share.token, /^[A-Za-z0-9_-]{43}$/, 'token = 32 bytes base64url');
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

    // Laudo ao vivo: nada congelado em disco — colunas de arquivo nulas.
    assert.equal(share.storagePath, null);
    assert.equal(share.fileName, null);
    assert.equal(share.checksumSha256, null);
    assert.equal(share.sizeBytes, null);

    // 1 job de etiqueta PENDING, com QR.
    const jobs = await prisma.shippingPrintJob.findMany({ where: { status: 'PENDING' } });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].payload.sampleId, sampleId);
    assert.equal(jobs[0].payload.token, share.token);
    assert.ok(jobs[0].payload.qrUrl.endsWith(`/laudo/${share.token}`));
    assert.equal(jobs[0].payload.recipientName, buyer.client.displayName);
  });

  test('envio de amostra SEM classificacao tambem gera share + job COM QR', async () => {
    const sampleId = await createRegistrationConfirmedSample();

    const res = await sendPhysical(sampleId, { recipientClientId: null, sentDate: '2026-06-18' });

    assert.equal(res.status, 201);
    assert.ok(res.body.share, 'etiqueta unificada cria share mesmo sem classificacao');
    assert.match(res.body.share.token, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(res.body.qrUrl.endsWith(`/laudo/${res.body.share.token}`));

    const shareCount = await prisma.sampleReportShare.count({ where: { sampleId } });
    assert.equal(shareCount, 1);

    const jobs = await prisma.shippingPrintJob.findMany({ where: { status: 'PENDING' } });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].payload.token, res.body.share.token, 'etiqueta COM QR');
    assert.ok(jobs[0].payload.qrUrl.endsWith(`/laudo/${res.body.share.token}`));
    assert.equal(jobs[0].payload.sampleId, sampleId);

    const sent = await prisma.sampleEvent.count({
      where: { sampleId, eventType: 'PHYSICAL_SAMPLE_SENT' },
    });
    assert.equal(sent, 1);
  });

  test('envio CLASSIFIED para 2 destinatarios gera 2 shares/jobs com tokens distintos', async () => {
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
  });

  test('foto sumida do storage nao bloqueia o envio; a rota publica degrada para sem foto (200)', async () => {
    const sampleId = await classifySample();

    // Simula corrupcao de storage: remove o arquivo da foto de classificacao.
    const detail = await queryService.getSampleDetail(sampleId, { eventLimit: 1 });
    const photo = detail.attachments.find((a) => a.kind === 'CLASSIFICATION_PHOTO');
    await fs.rm(path.join(uploadDir, photo.storagePath), { force: true });

    // O envio nao depende mais da foto (laudo ao vivo): registra normalmente.
    const res = await sendPhysical(sampleId, { recipientClientId: null, sentDate: '2026-06-18' });
    assert.equal(res.status, 201);
    assert.ok(res.body.share);

    // A rota publica gera o laudo ao vivo e degrada para "sem foto" em vez de
    // quebrar — a pagina publica nunca vaza erro interno.
    const served = await api.servePublicReportShare({
      headers: {},
      params: { token: res.body.share.token },
      query: {},
      body: {},
    });
    assert.equal(served.status, 200);
    assert.ok(Buffer.isBuffer(served.body.buffer) && served.body.buffer.length > 0);
  });

  // ── Rota pública /laudo/<token> (fase 4) ──
  // Sem x-forwarded-for nos headers => o rate-limiter ignora (não conta), então
  // as chamadas repetidas dos testes não disparam 429.

  test('rota pública serve o PDF do laudo por token válido e registra o acesso', async () => {
    const sampleId = await classifySample();
    const buyer = await createSellerClient('Comprador Público LTDA');
    const sent = await sendPhysical(sampleId, {
      recipientClientId: buyer.client.id,
      sentDate: '2026-06-18',
    });
    const token = sent.body.share.token;

    const res = await api.servePublicReportShare({
      headers: {},
      params: { token },
      query: {},
      body: {},
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.contentType, 'application/pdf');
    assert.ok(Buffer.isBuffer(res.body.buffer) && res.body.buffer.length > 0);

    const share = await prisma.sampleReportShare.findUnique({ where: { token } });
    // Laudo ao vivo: o share nao guarda arquivo; o fileName vem do render.
    assert.equal(share.fileName, null);
    assert.ok(
      typeof res.body.fileName === 'string' && res.body.fileName.endsWith('.pdf'),
      'fileName do laudo gerado ao vivo'
    );

    // accessCount é incrementado best-effort (fire-and-forget) — aguarda propagar.
    let updated = share;
    for (let i = 0; i < 20 && updated.accessCount < 1; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      updated = await prisma.sampleReportShare.findUnique({ where: { token } });
    }
    assert.equal(updated.accessCount, 1);
    assert.ok(updated.lastAccessedAt);
  });

  test('laudo ao vivo: envio sem classificacao serve o aviso e passa a refletir a classificacao feita depois', async () => {
    const sampleId = await createRegistrationConfirmedSample();
    const sent = await sendPhysical(sampleId, { recipientClientId: null, sentDate: '2026-06-18' });
    const token = sent.body.share.token;

    // Antes de classificar: o QR ja abre o laudo (variante "nao classificada").
    const before = await api.servePublicReportShare({
      headers: {},
      params: { token },
      query: {},
      body: {},
    });
    assert.equal(before.status, 200);
    assert.ok(Buffer.isBuffer(before.body.buffer) && before.body.buffer.length > 0);

    // Classifica a MESMA amostra depois do envio.
    await classifyExistingSample(sampleId);

    // O mesmo token agora reflete o estado atual: o PDF mudou (laudo completo).
    const after = await api.servePublicReportShare({
      headers: {},
      params: { token },
      query: {},
      body: {},
    });
    assert.equal(after.status, 200);
    assert.notEqual(
      createHash('sha256').update(after.body.buffer).digest('hex'),
      createHash('sha256').update(before.body.buffer).digest('hex'),
      'o laudo ao vivo muda quando a amostra e classificada'
    );
  });

  test('rota pública: token inexistente ou malformado retorna 404', async () => {
    const r1 = await api.servePublicReportShare({
      headers: {},
      params: { token: 'a'.repeat(43) },
      query: {},
      body: {},
    });
    assert.equal(r1.status, 404);

    const r2 = await api.servePublicReportShare({
      headers: {},
      params: { token: 'nao-e-hex' },
      query: {},
      body: {},
    });
    assert.equal(r2.status, 404);
  });

  test('rota pública: laudo revogado retorna 410', async () => {
    const sampleId = await classifySample();
    const sent = await sendPhysical(sampleId, { recipientClientId: null, sentDate: '2026-06-18' });
    const token = sent.body.share.token;
    await prisma.sampleReportShare.update({ where: { token }, data: { revokedAt: new Date() } });

    const res = await api.servePublicReportShare({
      headers: {},
      params: { token },
      query: {},
      body: {},
    });
    assert.equal(res.status, 410);
  });

  test('rota pública: laudo expirado retorna 410', async () => {
    const sampleId = await classifySample();
    const sent = await sendPhysical(sampleId, { recipientClientId: null, sentDate: '2026-06-18' });
    const token = sent.body.share.token;
    await prisma.sampleReportShare.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await api.servePublicReportShare({
      headers: {},
      params: { token },
      query: {},
      body: {},
    });
    assert.equal(res.status, 410);
  });

  test('cancelar o envio revoga o laudo (D8): a rota pública passa a 410', async () => {
    const sampleId = await classifySample();
    const buyer = await createSellerClient('Comprador Cancelado LTDA');
    const sent = await sendPhysical(sampleId, {
      recipientClientId: buyer.client.id,
      sentDate: '2026-06-18',
    });
    const token = sent.body.share.token;
    const sendEventId = sent.body.event.eventId;

    // Antes do cancelamento: serve o PDF (200).
    const before = await api.servePublicReportShare({
      headers: {},
      params: { token },
      query: {},
      body: {},
    });
    assert.equal(before.status, 200);

    const cancel = await api.cancelPhysicalSampleSend({
      headers: authHeaders,
      params: { sampleId, sendEventId },
      query: {},
      body: {},
    });
    assert.equal(cancel.status, 200);

    // O share foi revogado (atomico com o evento) e a rota publica agora dá 410.
    const share = await prisma.sampleReportShare.findUnique({ where: { token } });
    assert.ok(share.revokedAt, 'revokedAt setado no cancelamento');
    const after = await api.servePublicReportShare({
      headers: {},
      params: { token },
      query: {},
      body: {},
    });
    assert.equal(after.status, 410);
  });

  test('laudo ao vivo: safra gravada fora do cadastro atual nao quebra o QR (200)', async () => {
    const sampleId = await classifySample(); // declared harvest = '25/26'
    const sent = await sendPhysical(sampleId, { recipientClientId: null, sentDate: '2026-06-18' });
    const token = sent.body.share.token;

    // Simula a deriva pos-envio (ex.: liga cuja safra escolhida foi editada/
    // removida depois): a safra gravada no share deixa de ser uma das safras
    // atuais. No caminho estrito isso daria 422; o caminho ao vivo e leniente e
    // preserva a escolha do envio, sem quebrar o QR.
    await prisma.sampleReportShare.update({ where: { token }, data: { reportedHarvest: '99/00' } });

    const res = await api.servePublicReportShare({
      headers: {},
      params: { token },
      query: {},
      body: {},
    });
    assert.equal(res.status, 200);
    assert.ok(Buffer.isBuffer(res.body.buffer) && res.body.buffer.length > 0);
  });

  test('falha de geracao do laudo retorna 500 (nao 404 silencioso)', async () => {
    const sampleId = await classifySample();
    const sent = await sendPhysical(sampleId, { recipientClientId: null, sentDate: '2026-06-18' });
    const token = sent.body.share.token;

    // API com reportService que FALHA ao gerar (reusa o queryService real p/
    // achar o share; a rota publica nao usa authService).
    const failingApi = createBackendApiV1({
      queryService,
      reportService: {
        renderReportPdfLive: async () => {
          throw new Error('boom render');
        },
      },
    });

    const res = await failingApi.servePublicReportShare({
      headers: {},
      params: { token },
      query: {},
      body: {},
    });
    assert.equal(res.status, 500);
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
