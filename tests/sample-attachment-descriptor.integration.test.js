import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { LocalAuthService } from '../src/auth/local-auth-service.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';

// LDT-B2/D4 (Revisão Geral): a rota binária da foto do detalhe passou a exigir
// sessão. A autorização vive no método getSampleAttachmentDescriptor
// (resolveActorContext + allowlist do PROSPECTOR). Aqui exercitamos a auth de
// verdade: 401 sem sessão, 403 PROSPECTOR, 200 com descritor pra ADMIN, 404
// pra anexo inexistente.

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('sample-attachment-descriptor integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  const authService = new LocalAuthService({
    secret: 'attachment-descriptor-integration-secret',
    allowPlaintextPasswords: true,
    users: [
      { id: randomUUID(), username: 'att-admin', password: 'admin123', role: 'ADMIN' },
      {
        id: randomUUID(),
        username: 'att-prospector',
        password: 'prospector123',
        role: 'PROSPECTOR',
      },
    ],
  });

  const api = createBackendApiV1({ authService, queryService });

  function headersFor(username, password) {
    return {
      authorization: `Bearer ${authService.login({ username, password }).accessToken}`,
      'x-forwarded-for': '127.0.0.1',
      'user-agent': 'node-test',
      'x-source': 'web',
    };
  }

  const adminHeaders = headersFor('att-admin', 'admin123');
  const prospectorHeaders = headersFor('att-prospector', 'prospector123');

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  // Sample + anexo direto no Prisma (o descritor só lê a projeção; não depende
  // do event store nem do arquivo em disco).
  async function seedSampleWithAttachment() {
    const sampleId = randomUUID();
    const attachmentId = randomUUID();
    await prisma.sample.create({
      data: {
        id: sampleId,
        status: 'CLASSIFIED',
        internalLotNumber: String(7000 + Math.floor(Math.random() * 1000)),
      },
    });
    await prisma.sampleAttachment.create({
      data: {
        id: attachmentId,
        sampleId,
        kind: 'CLASSIFICATION_PHOTO',
        storagePath: `${sampleId}/photo.jpg`,
        mimeType: 'image/png',
      },
    });
    return { sampleId, attachmentId };
  }

  function call(headers, sampleId, attachmentId) {
    return api.getSampleAttachmentDescriptor({
      headers,
      params: { sampleId, attachmentId },
      query: {},
      body: {},
    });
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

  test('sem sessão -> 401', async () => {
    const { sampleId, attachmentId } = await seedSampleWithAttachment();
    const result = await call({}, sampleId, attachmentId);
    assert.equal(result.status, 401);
  });

  test('PROSPECTOR -> 403 (allowlist)', async () => {
    const { sampleId, attachmentId } = await seedSampleWithAttachment();
    const result = await call(prospectorHeaders, sampleId, attachmentId);
    assert.equal(result.status, 403);
  });

  test('ADMIN com anexo real -> 200 + descritor (storagePath + mimeType)', async () => {
    const { sampleId, attachmentId } = await seedSampleWithAttachment();
    const result = await call(adminHeaders, sampleId, attachmentId);
    assert.equal(result.status, 200);
    assert.equal(result.body.storagePath, `${sampleId}/photo.jpg`);
    assert.equal(result.body.mimeType, 'image/png');
  });

  test('ADMIN com attachmentId inexistente -> 404', async () => {
    const { sampleId } = await seedSampleWithAttachment();
    const result = await call(adminHeaders, sampleId, randomUUID());
    assert.equal(result.status, 404);
  });

  test('ADMIN com anexo de OUTRO lote -> 404 (não vaza entre lotes)', async () => {
    const a = await seedSampleWithAttachment();
    const b = await seedSampleWithAttachment();
    // attachment do lote B pedido sob o lote A -> não encontra
    const result = await call(adminHeaders, a.sampleId, b.attachmentId);
    assert.equal(result.status, 404);
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
