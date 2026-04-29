import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('dashboard-commercial-metrics integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  // Instante de referencia: sexta 2026-04-24 20:00 BRT (apos cutoff).
  // Semanas esperadas (segundas BRT): 2026-03-30, 2026-04-06, 2026-04-13, 2026-04-20.
  const FIXED_NOW = new Date(Date.UTC(2026, 3, 24, 23, 0));

  function brt(year, month, day, hour, minute = 0) {
    return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_branch, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  let eventSequence = 0;
  let buyerClientId = null;

  async function ensureBuyerClient() {
    if (buyerClientId) return buyerClientId;
    buyerClientId = randomUUID();
    await prisma.client.create({
      data: {
        id: buyerClientId,
        personType: 'PJ',
        legalName: 'Comprador Teste LTDA',
        tradeName: 'Comprador Teste',
        isBuyer: true,
      },
    });
    return buyerClientId;
  }

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

  async function insertSaleMovement({ sampleId, createdAt, status = 'ACTIVE' }) {
    const buyer = await ensureBuyerClient();
    await prisma.sampleMovement.create({
      data: {
        id: randomUUID(),
        sampleId,
        movementType: 'SALE',
        status,
        buyerClientId: buyer,
        quantitySacks: 10,
        movementDate: createdAt,
        cancelledAt: status === 'CANCELLED' ? createdAt : null,
        createdAt,
        updatedAt: createdAt,
      },
    });
  }

  async function seedSoldSample({
    classifiedAt,
    soldAt,
    finalStatus = 'CLASSIFIED',
    saleMovementStatus = 'ACTIVE',
    omitSaleMovement = false,
  }) {
    const sampleId = randomUUID();
    const registeredAt = new Date(classifiedAt.getTime() - 3600_000);
    await prisma.sample.create({ data: { id: sampleId, status: 'CLASSIFIED' } });
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
    const photoId = await insertClassificationPhoto(sampleId);
    await insertEvent({
      sampleId,
      sequenceNumber: 3,
      eventType: 'CLASSIFICATION_COMPLETED',
      occurredAt: classifiedAt,
      payload: { classificationPhotoId: photoId },
      module: 'CLASSIFICATION',
    });
    if (!omitSaleMovement) {
      // Movement deve existir ate 1s depois do SALE_CREATED para a query encontrar.
      await insertSaleMovement({ sampleId, createdAt: soldAt, status: saleMovementStatus });
    }
    await insertEvent({
      sampleId,
      sequenceNumber: 4,
      eventType: 'SALE_CREATED',
      occurredAt: soldAt,
      payload: { quantitySacks: 10 },
      module: 'COMMERCIAL',
    });
    if (finalStatus !== 'CLASSIFIED') {
      await prisma.sample.update({ where: { id: sampleId }, data: { status: finalStatus } });
    }
    return sampleId;
  }

  async function seedUnsoldSample(classifiedAt, finalStatus = 'CLASSIFIED') {
    const sampleId = randomUUID();
    const registeredAt = new Date(classifiedAt.getTime() - 3600_000);
    await prisma.sample.create({ data: { id: sampleId, status: 'CLASSIFIED' } });
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

  test.before(async () => {
    await prisma.$connect();
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    eventSequence = 0;
    buyerClientId = null;
    await resetDatabase();
  });

  test('retorna 4 buckets semanais zerados quando nao ha vendas', async () => {
    const result = await queryService.getDashboardCommercialMetrics({ now: FIXED_NOW });

    assert.strictEqual(result.overall, null);
    assert.strictEqual(result.sampleCount, 0);
    assert.strictEqual(result.meta, 15);
    assert.deepStrictEqual(
      result.buckets.map((b) => b.date),
      ['2026-03-30', '2026-04-06', '2026-04-13', '2026-04-20']
    );
    for (const bucket of result.buckets) {
      assert.strictEqual(bucket.value, 0);
      assert.strictEqual(bucket.count, 0);
    }
  });

  test('venda 20 dias apos classificacao aparece no bucket da semana correta', async () => {
    // Classificada em 2026-03-15, vendida em 2026-04-04 (sabado, semana 2026-03-30).
    // Duracao = 20 dias.
    await seedSoldSample({
      classifiedAt: brt(2026, 3, 15, 10, 0),
      soldAt: brt(2026, 4, 4, 10, 0),
    });

    const result = await queryService.getDashboardCommercialMetrics({ now: FIXED_NOW });

    const week = result.buckets.find((b) => b.date === '2026-03-30');
    assert.ok(week, 'bucket da semana 2026-03-30 nao encontrado');
    assert.strictEqual(week.count, 1);
    assert.ok(Math.abs(week.value - 20) < 0.01, `esperado 20 dias, recebeu ${week.value}`);

    for (const bucket of result.buckets) {
      if (bucket.date !== '2026-03-30') {
        assert.strictEqual(bucket.count, 0);
      }
    }

    assert.strictEqual(result.sampleCount, 1);
    assert.ok(Math.abs(result.overall - 20) < 0.01);
  });

  test('multiplas vendas na mesma semana sao agregadas por media', async () => {
    // Semana 2026-04-13 (segunda-domingo: 2026-04-13 a 2026-04-19).
    // Venda 1: classif 2026-04-01 -> venda 2026-04-14 = 13 dias.
    await seedSoldSample({
      classifiedAt: brt(2026, 4, 1, 10, 0),
      soldAt: brt(2026, 4, 14, 10, 0),
    });
    // Venda 2: classif 2026-04-05 -> venda 2026-04-19 = 14 dias.
    await seedSoldSample({
      classifiedAt: brt(2026, 4, 5, 10, 0),
      soldAt: brt(2026, 4, 19, 10, 0),
    });
    // Venda 3 em outra semana (2026-04-06): classif 2026-04-01 -> venda 2026-04-07 = 6 dias.
    await seedSoldSample({
      classifiedAt: brt(2026, 4, 1, 10, 0),
      soldAt: brt(2026, 4, 7, 10, 0),
    });

    const result = await queryService.getDashboardCommercialMetrics({ now: FIXED_NOW });

    const weekApr13 = result.buckets.find((b) => b.date === '2026-04-13');
    const weekApr06 = result.buckets.find((b) => b.date === '2026-04-06');

    assert.strictEqual(weekApr13.count, 2);
    assert.ok(Math.abs(weekApr13.value - 13.5) < 0.01);

    assert.strictEqual(weekApr06.count, 1);
    assert.ok(Math.abs(weekApr06.value - 6) < 0.01);

    // Media geral = (13 + 14 + 6) / 3 = 11.
    assert.strictEqual(result.sampleCount, 3);
    assert.ok(Math.abs(result.overall - 11) < 0.01);
  });

  test('amostras sem venda (OPEN puro) sao excluidas', async () => {
    await seedSoldSample({
      classifiedAt: brt(2026, 4, 1, 10, 0),
      soldAt: brt(2026, 4, 14, 10, 0),
    });
    await seedUnsoldSample(brt(2026, 4, 10, 10, 0));

    const result = await queryService.getDashboardCommercialMetrics({ now: FIXED_NOW });

    assert.strictEqual(result.sampleCount, 1);
  });

  test('amostras perdidas sem venda (LOST puro) sao excluidas', async () => {
    await seedSoldSample({
      classifiedAt: brt(2026, 4, 1, 10, 0),
      soldAt: brt(2026, 4, 14, 10, 0),
    });
    await seedUnsoldSample(brt(2026, 4, 10, 10, 0), 'INVALIDATED');

    const result = await queryService.getDashboardCommercialMetrics({ now: FIXED_NOW });

    assert.strictEqual(result.sampleCount, 1);
  });

  test('amostras INVALIDATED com venda sao excluidas', async () => {
    await seedSoldSample({
      classifiedAt: brt(2026, 4, 1, 10, 0),
      soldAt: brt(2026, 4, 14, 10, 0),
    });
    await seedSoldSample({
      classifiedAt: brt(2026, 4, 5, 10, 0),
      soldAt: brt(2026, 4, 15, 10, 0),
      finalStatus: 'INVALIDATED',
    });

    const result = await queryService.getDashboardCommercialMetrics({ now: FIXED_NOW });

    assert.strictEqual(result.sampleCount, 1);
  });

  test('vendas com sample_movement CANCELLED sao excluidas', async () => {
    await seedSoldSample({
      classifiedAt: brt(2026, 4, 1, 10, 0),
      soldAt: brt(2026, 4, 14, 10, 0),
      saleMovementStatus: 'CANCELLED',
    });

    const result = await queryService.getDashboardCommercialMetrics({ now: FIXED_NOW });

    assert.strictEqual(result.sampleCount, 0);
  });

  test('vendas sem sample_movement (evento orfao) sao excluidas', async () => {
    await seedSoldSample({
      classifiedAt: brt(2026, 4, 1, 10, 0),
      soldAt: brt(2026, 4, 14, 10, 0),
      omitSaleMovement: true,
    });

    const result = await queryService.getDashboardCommercialMetrics({ now: FIXED_NOW });

    assert.strictEqual(result.sampleCount, 0);
  });

  test('vendas fora da janela (antes ou depois) sao ignoradas', async () => {
    // Venda muito antes da janela (2026-03-20 < 2026-03-30).
    await seedSoldSample({
      classifiedAt: brt(2026, 3, 1, 10, 0),
      soldAt: brt(2026, 3, 20, 10, 0),
    });
    // Venda apos fim da janela (2026-04-28 >= 2026-04-27 windowEnd).
    await seedSoldSample({
      classifiedAt: brt(2026, 4, 10, 10, 0),
      soldAt: brt(2026, 4, 28, 10, 0),
    });
    // Venda dentro da janela.
    await seedSoldSample({
      classifiedAt: brt(2026, 4, 1, 10, 0),
      soldAt: brt(2026, 4, 14, 10, 0),
    });

    const result = await queryService.getDashboardCommercialMetrics({ now: FIXED_NOW });

    assert.strictEqual(result.sampleCount, 1);
  });

  test('janela volta uma semana quando now esta antes de sexta 17:30 BRT', async () => {
    // Quarta 2026-04-22 10:00 BRT -> ref = semana anterior (2026-04-13).
    // Janela = 2026-03-23 .. 2026-04-13.
    const beforeCutoff = new Date(Date.UTC(2026, 3, 22, 13, 0));

    // Venda na semana 2026-04-20 -> FORA.
    await seedSoldSample({
      classifiedAt: brt(2026, 4, 5, 10, 0),
      soldAt: brt(2026, 4, 21, 10, 0),
    });
    // Venda na semana 2026-03-23 -> DENTRO (bucket mais antigo).
    await seedSoldSample({
      classifiedAt: brt(2026, 3, 10, 10, 0),
      soldAt: brt(2026, 3, 24, 10, 0),
    });

    const result = await queryService.getDashboardCommercialMetrics({ now: beforeCutoff });

    assert.deepStrictEqual(
      result.buckets.map((b) => b.date),
      ['2026-03-23', '2026-03-30', '2026-04-06', '2026-04-13']
    );
    assert.strictEqual(result.sampleCount, 1);
    const firstBucket = result.buckets.find((b) => b.date === '2026-03-23');
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
