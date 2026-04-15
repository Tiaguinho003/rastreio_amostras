import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('dashboard latest activity integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  test.before(async () => {
    await prisma.$connect();
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_registration, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  });

  test('returns empty list when there are no relevant events', async () => {
    const result = await queryService.getDashboardLatestActivity();
    assert.deepEqual(result, { items: [] });
  });

  test('includes samples with REGISTRATION_CONFIRMED and orders by occurredAt desc', async () => {
    const older = await createSampleFixture({
      internalLotNumber: 'A-1001',
      declaredOwner: 'Produtor Alpha',
    });
    const newer = await createSampleFixture({
      internalLotNumber: 'A-1002',
      declaredOwner: 'Produtor Beta',
    });

    await insertEvent({
      sampleId: older.id,
      eventType: 'REGISTRATION_CONFIRMED',
      occurredAt: new Date('2026-04-10T12:00:00Z'),
      payload: {},
    });
    await insertEvent({
      sampleId: newer.id,
      eventType: 'REGISTRATION_CONFIRMED',
      occurredAt: new Date('2026-04-11T12:00:00Z'),
      payload: {},
    });

    const result = await queryService.getDashboardLatestActivity();
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].sampleId, newer.id);
    assert.equal(result.items[1].sampleId, older.id);
    assert.equal(result.items[0].activity.type, 'REGISTRATION_CONFIRMED');
    assert.equal(result.items[0].producer, 'Produtor Beta');
    assert.equal(result.items[0].internalLotNumber, 'A-1002');
  });

  test('latest relevant event per sample wins (SALE_CREATED overrides earlier REGISTRATION_CONFIRMED)', async () => {
    const sample = await createSampleFixture({
      internalLotNumber: 'A-2000',
      declaredOwner: 'Produtor Gamma',
      status: 'CLASSIFIED',
    });

    await insertEvent({
      sampleId: sample.id,
      eventType: 'REGISTRATION_CONFIRMED',
      occurredAt: new Date('2026-04-10T12:00:00Z'),
      payload: {},
    });
    await insertEvent({
      sampleId: sample.id,
      eventType: 'SALE_CREATED',
      occurredAt: new Date('2026-04-12T10:00:00Z'),
      payload: {
        quantitySacks: 50,
        buyerClientSnapshot: {
          id: randomUUID(),
          personType: 'PJ',
          displayName: 'Café Bom LTDA',
          legalName: 'Café Bom LTDA',
        },
      },
    });

    const result = await queryService.getDashboardLatestActivity();
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].activity.type, 'SALE_CREATED');
    assert.equal(result.items[0].activity.context.sacks, 50);
    assert.equal(result.items[0].activity.context.clientName, 'Café Bom LTDA');
  });

  test('SALE_UPDATED is ignored — does not bump position', async () => {
    const oldSale = await createSampleFixture({ internalLotNumber: 'A-3001', declaredOwner: 'X' });
    const recentReg = await createSampleFixture({
      internalLotNumber: 'A-3002',
      declaredOwner: 'Y',
    });

    await insertEvent({
      sampleId: oldSale.id,
      eventType: 'SALE_CREATED',
      occurredAt: new Date('2026-04-10T00:00:00Z'),
      payload: { quantitySacks: 10 },
    });
    await insertEvent({
      sampleId: recentReg.id,
      eventType: 'REGISTRATION_CONFIRMED',
      occurredAt: new Date('2026-04-11T00:00:00Z'),
      payload: {},
    });
    // SALE_UPDATED at a later time — must NOT appear and must NOT bump oldSale
    await insertEvent({
      sampleId: oldSale.id,
      eventType: 'SALE_UPDATED',
      occurredAt: new Date('2026-04-12T00:00:00Z'),
      payload: {},
    });

    const result = await queryService.getDashboardLatestActivity();
    assert.equal(result.items.length, 2);
    // recentReg should still be first since SALE_UPDATED is excluded
    assert.equal(result.items[0].sampleId, recentReg.id);
    assert.equal(result.items[1].sampleId, oldSale.id);
    // oldSale still reports SALE_CREATED as its latest relevant event
    assert.equal(result.items[1].activity.type, 'SALE_CREATED');
  });

  test('parses LOSS_RECORDED payload with sacks + reason', async () => {
    const sample = await createSampleFixture({
      internalLotNumber: 'A-4000',
      declaredOwner: 'Delta',
    });
    await insertEvent({
      sampleId: sample.id,
      eventType: 'LOSS_RECORDED',
      occurredAt: new Date('2026-04-13T00:00:00Z'),
      payload: {
        quantitySacks: 7,
        lossReasonText: 'quebra de lote',
      },
    });

    const result = await queryService.getDashboardLatestActivity();
    assert.equal(result.items[0].activity.type, 'LOSS_RECORDED');
    assert.equal(result.items[0].activity.context.sacks, 7);
    assert.equal(result.items[0].activity.context.reason, 'quebra de lote');
  });

  test('parses SAMPLE_INVALIDATED payload with reason and sets isInvalidated flag', async () => {
    const sample = await createSampleFixture({
      internalLotNumber: 'A-5000',
      declaredOwner: 'Epsilon',
    });
    await insertEvent({
      sampleId: sample.id,
      eventType: 'SAMPLE_INVALIDATED',
      occurredAt: new Date('2026-04-14T00:00:00Z'),
      payload: {
        reasonCode: 'DUPLICATE',
        reasonText: 'amostra duplicada',
      },
    });
    // Project the status change (in prod this happens in the same tx as the event append)
    await prisma.sample.update({
      where: { id: sample.id },
      data: { status: 'INVALIDATED' },
    });

    const result = await queryService.getDashboardLatestActivity();
    assert.equal(result.items[0].activity.type, 'SAMPLE_INVALIDATED');
    assert.equal(result.items[0].activity.context.reason, 'amostra duplicada');
    assert.equal(result.items[0].isInvalidated, true);
  });

  test('SALE_CANCELLED replaces SALE_CREATED when newer', async () => {
    const sample = await createSampleFixture({
      internalLotNumber: 'A-6000',
      declaredOwner: 'Zeta',
      status: 'CLASSIFIED',
    });
    await insertEvent({
      sampleId: sample.id,
      eventType: 'SALE_CREATED',
      occurredAt: new Date('2026-04-10T00:00:00Z'),
      payload: { quantitySacks: 10 },
    });
    await insertEvent({
      sampleId: sample.id,
      eventType: 'SALE_CANCELLED',
      occurredAt: new Date('2026-04-11T00:00:00Z'),
      payload: { movementId: randomUUID(), reasonText: 'arrependimento' },
    });

    const result = await queryService.getDashboardLatestActivity();
    assert.equal(result.items[0].activity.type, 'SALE_CANCELLED');
    // SALE_CANCELLED context is empty (user decision: simple text)
    assert.deepEqual(result.items[0].activity.context, {});
  });

  test('limits results to 20 most recent', async () => {
    for (let i = 0; i < 25; i += 1) {
      const s = await createSampleFixture({
        internalLotNumber: `A-${7000 + i}`,
        declaredOwner: `Sample ${i}`,
      });
      await insertEvent({
        sampleId: s.id,
        eventType: 'REGISTRATION_CONFIRMED',
        occurredAt: new Date(2026, 3, 15, 12, 0, i),
        payload: {},
      });
    }

    const result = await queryService.getDashboardLatestActivity();
    assert.equal(result.items.length, 20);
    // Most recent should be the last one created
    assert.equal(result.items[0].producer, 'Sample 24');
  });

  // Tracks the next sequence number to use per sample (managed by helpers)
  const sequenceBySample = new Map();

  async function createSampleFixture({
    id = randomUUID(),
    internalLotNumber = null,
    status = 'REGISTRATION_CONFIRMED',
    declaredOwner = null,
    declaredSacks = 10,
    baseOccurredAt = new Date('2026-01-01T00:00:00Z'),
  } = {}) {
    // Create as REGISTRATION_CONFIRMED so the append-trigger accepts events.
    // Callers can upgrade the status to CLASSIFIED via the `status` param; INVALIDATED must
    // be applied AFTER the SAMPLE_INVALIDATED event via a direct prisma.sample.update call.
    const sample = await prisma.sample.create({
      data: {
        id,
        internalLotNumber,
        status: status === 'INVALIDATED' ? 'REGISTRATION_CONFIRMED' : status,
        commercialStatus: 'OPEN',
        version: 0,
        lastEventSequence: 0,
        declaredOwner,
        declaredSacks,
        declaredHarvest: '25/26',
      },
    });

    // Insert the mandatory SAMPLE_RECEIVED base event (trigger requirement).
    // It never shows in latest-activity because SAMPLE_RECEIVED is not in the query's filter.
    await prisma.sampleEvent.create({
      data: {
        eventId: randomUUID(),
        sampleId: sample.id,
        sequenceNumber: 1,
        eventType: 'SAMPLE_RECEIVED',
        schemaVersion: 1,
        occurredAt: baseOccurredAt,
        actorType: 'USER',
        actorUserId: randomUUID(),
        source: 'WEB',
        payload: { receivedChannel: 'in_person' },
        requestId: randomUUID(),
        metadataModule: 'REGISTRATION',
      },
    });
    sequenceBySample.set(sample.id, 2);

    return sample;
  }

  async function insertEvent({ sampleId, eventType, occurredAt, payload }) {
    const sequenceNumber = sequenceBySample.get(sampleId) ?? 2;
    sequenceBySample.set(sampleId, sequenceNumber + 1);

    return prisma.sampleEvent.create({
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
        requestId: randomUUID(),
        metadataModule: 'COMMERCIAL',
      },
    });
  }
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
