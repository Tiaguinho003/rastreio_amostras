import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('dashboard-operational-metrics integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  // Instante de referencia: 20/04/2026 18:00 BRT (apos 17:30 -> ref = hoje).
  // Janela esperada (BRT): 2026-04-16 .. 2026-04-20.
  const FIXED_NOW = new Date(Date.UTC(2026, 3, 20, 21, 0));

  function brt(year, month, day, hour, minute = 0) {
    return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_branch, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  let eventSequence = 0;

  async function insertEvent({ sampleId, sequenceNumber, eventType, occurredAt, payload, module }) {
    eventSequence += 1;
    await prisma.sampleEvent.create({
      data: {
        eventId: randomUUID(),
        sampleId,
        sequenceNumber,
        eventType,
        schemaVersion: 1,
        occurredAt,
        actorType: 'USER',
        actorUserId: randomUUID(),
        source: 'WEB',
        payload,
        requestId: `req-${eventSequence}`,
        metadataModule: module,
      },
    });
  }

  async function insertClassificationPhoto(sampleId) {
    const attachmentId = randomUUID();
    await prisma.sampleAttachment.create({
      data: {
        id: attachmentId,
        sampleId,
        kind: 'CLASSIFICATION_PHOTO',
        storagePath: `test/${attachmentId}.jpg`,
        mimeType: 'image/jpeg',
      },
    });
    return attachmentId;
  }

  async function seedClassifiedSample(registeredAt, classifiedAt, finalStatus = 'CLASSIFIED') {
    const sampleId = randomUUID();
    // Cria com CLASSIFIED para permitir append de eventos (trigger bloqueia INVALIDATED).
    await prisma.sample.create({ data: { id: sampleId, status: 'CLASSIFIED' } });
    // Trigger requer primeiro evento = SAMPLE_RECEIVED com sequence_number=1.
    await insertEvent({
      sampleId,
      sequenceNumber: 1,
      eventType: 'SAMPLE_RECEIVED',
      occurredAt: new Date(registeredAt.getTime() - 60_000),
      payload: { receivedChannel: 'in_person', notes: null },
      module: 'REGISTRATION',
    });
    await insertEvent({
      sampleId,
      sequenceNumber: 2,
      eventType: 'REGISTRATION_CONFIRMED',
      occurredAt: registeredAt,
      payload: {},
      module: 'REGISTRATION',
    });
    // Trigger requer CLASSIFICATION_PHOTO attachment existente referenciado no payload.
    const photoId = await insertClassificationPhoto(sampleId);
    await insertEvent({
      sampleId,
      sequenceNumber: 3,
      eventType: 'CLASSIFICATION_COMPLETED',
      occurredAt: classifiedAt,
      payload: { classificationPhotoId: photoId },
      module: 'CLASSIFICATION',
    });
    if (finalStatus !== 'CLASSIFIED') {
      await prisma.sample.update({ where: { id: sampleId }, data: { status: finalStatus } });
    }
    return sampleId;
  }

  async function seedPendingSample(registeredAt) {
    const sampleId = randomUUID();
    await prisma.sample.create({
      data: { id: sampleId, status: 'REGISTRATION_CONFIRMED' },
    });
    await insertEvent({
      sampleId,
      sequenceNumber: 1,
      eventType: 'SAMPLE_RECEIVED',
      occurredAt: new Date(registeredAt.getTime() - 60_000),
      payload: { receivedChannel: 'in_person', notes: null },
      module: 'REGISTRATION',
    });
    await insertEvent({
      sampleId,
      sequenceNumber: 2,
      eventType: 'REGISTRATION_CONFIRMED',
      occurredAt: registeredAt,
      payload: {},
      module: 'REGISTRATION',
    });
    return sampleId;
  }

  test.before(async () => {
    await prisma.$connect();
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    eventSequence = 0;
    await resetDatabase();
  });

  test('retorna 5 buckets BRT ordenados e zerados quando nao ha classificacoes', async () => {
    const result = await queryService.getDashboardOperationalMetrics({ now: FIXED_NOW });

    assert.strictEqual(result.overall, null);
    assert.strictEqual(result.sampleCount, 0);
    assert.strictEqual(result.meta, 24);
    assert.deepStrictEqual(
      result.buckets.map((d) => d.date),
      ['2026-04-16', '2026-04-17', '2026-04-18', '2026-04-19', '2026-04-20']
    );
    for (const bucket of result.buckets) {
      assert.strictEqual(bucket.value, 0);
      assert.strictEqual(bucket.count, 0);
    }
  });

  test('classificacao tardia de sexta para segunda aparece no bucket de segunda com duracao real', async () => {
    // Sexta 18:00 BRT -> segunda 14:00 BRT = 68h.
    await seedClassifiedSample(brt(2026, 4, 17, 18, 0), brt(2026, 4, 20, 14, 0));

    const result = await queryService.getDashboardOperationalMetrics({ now: FIXED_NOW });

    const monday = result.buckets.find((d) => d.date === '2026-04-20');
    assert.ok(monday, 'bucket de segunda nao encontrado');
    assert.strictEqual(monday.count, 1);
    assert.ok(Math.abs(monday.value - 68) < 0.01, `esperado ~68h, recebeu ${monday.value}`);

    // Amostra classificada segunda aparece apenas no bucket de segunda.
    for (const bucket of result.buckets) {
      if (bucket.date !== '2026-04-20') {
        assert.strictEqual(bucket.count, 0);
      }
    }

    assert.strictEqual(result.sampleCount, 1);
    assert.ok(Math.abs(result.overall - 68) < 0.01);
  });

  test('calcula media aritmetica por dia e media geral agregada por classificacao', async () => {
    // Sabado (2026-04-18): duas amostras com duracoes 2h e 4h -> media 3h.
    await seedClassifiedSample(brt(2026, 4, 18, 9, 0), brt(2026, 4, 18, 11, 0));
    await seedClassifiedSample(brt(2026, 4, 18, 10, 0), brt(2026, 4, 18, 14, 0));
    // Domingo (2026-04-19): uma amostra com duracao 1h.
    await seedClassifiedSample(brt(2026, 4, 19, 8, 0), brt(2026, 4, 19, 9, 0));

    const result = await queryService.getDashboardOperationalMetrics({ now: FIXED_NOW });

    const saturday = result.buckets.find((d) => d.date === '2026-04-18');
    const sunday = result.buckets.find((d) => d.date === '2026-04-19');

    assert.strictEqual(saturday.count, 2);
    assert.ok(Math.abs(saturday.value - 3) < 0.01);

    assert.strictEqual(sunday.count, 1);
    assert.ok(Math.abs(sunday.value - 1) < 0.01);

    // Media geral = (2 + 4 + 1) / 3 = 2.333..., NAO media-de-medias.
    assert.strictEqual(result.sampleCount, 3);
    assert.ok(
      Math.abs(result.overall - 7 / 3) < 0.01,
      `esperado ${7 / 3}, recebeu ${result.overall}`
    );
  });

  test('amostras pendentes nao entram na metrica', async () => {
    await seedClassifiedSample(brt(2026, 4, 18, 9, 0), brt(2026, 4, 18, 11, 0));
    await seedPendingSample(brt(2026, 4, 17, 10, 0));

    const result = await queryService.getDashboardOperationalMetrics({ now: FIXED_NOW });

    assert.strictEqual(result.sampleCount, 1);
    assert.ok(Math.abs(result.overall - 2) < 0.01);
  });

  test('amostras INVALIDATED sao excluidas', async () => {
    await seedClassifiedSample(brt(2026, 4, 18, 9, 0), brt(2026, 4, 18, 11, 0));
    await seedClassifiedSample(brt(2026, 4, 18, 10, 0), brt(2026, 4, 18, 13, 0), 'INVALIDATED');

    const result = await queryService.getDashboardOperationalMetrics({ now: FIXED_NOW });

    assert.strictEqual(result.sampleCount, 1);
    assert.ok(Math.abs(result.overall - 2) < 0.01);
  });

  test('classificacoes fora da janela sao ignoradas', async () => {
    // Classificada em 2026-04-15 (antes do bucket mais antigo 2026-04-16).
    await seedClassifiedSample(brt(2026, 4, 14, 10, 0), brt(2026, 4, 15, 12, 0));
    // Classificada em 2026-04-21 (apos o fim da janela).
    await seedClassifiedSample(brt(2026, 4, 20, 8, 0), brt(2026, 4, 21, 10, 0));
    // Valida: classificada em 2026-04-18.
    await seedClassifiedSample(brt(2026, 4, 18, 9, 0), brt(2026, 4, 18, 11, 0));

    const result = await queryService.getDashboardOperationalMetrics({ now: FIXED_NOW });

    assert.strictEqual(result.sampleCount, 1);
    assert.ok(Math.abs(result.overall - 2) < 0.01);
  });

  test('janela volta um dia quando now esta antes de 17:30 BRT', async () => {
    // now = 2026-04-20 09:00 BRT -> ref = 2026-04-19, janela = 2026-04-15 .. 2026-04-19.
    const beforeCutoff = new Date(Date.UTC(2026, 3, 20, 12, 0));

    // Amostra classificada em 2026-04-20: FORA da janela (hoje nao conta antes de 17:30).
    await seedClassifiedSample(brt(2026, 4, 20, 6, 0), brt(2026, 4, 20, 8, 0));
    // Amostra classificada em 2026-04-15: DENTRO (novo bucket mais antigo).
    await seedClassifiedSample(brt(2026, 4, 15, 9, 0), brt(2026, 4, 15, 10, 0));

    const result = await queryService.getDashboardOperationalMetrics({ now: beforeCutoff });

    assert.deepStrictEqual(
      result.buckets.map((d) => d.date),
      ['2026-04-15', '2026-04-16', '2026-04-17', '2026-04-18', '2026-04-19']
    );
    assert.strictEqual(result.sampleCount, 1);
    const firstBucket = result.buckets.find((d) => d.date === '2026-04-15');
    assert.strictEqual(firstBucket.count, 1);
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
