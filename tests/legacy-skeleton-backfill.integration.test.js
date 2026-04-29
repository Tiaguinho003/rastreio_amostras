import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { ClientService } from '../src/clients/client-service.js';
import { generateValidCnpj } from './helpers/cnpj-generator.js';
import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { HttpError } from '../src/contracts/errors.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('legacy backfill integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const eventStore = new PrismaEventStore(prisma);
  const eventService = new EventContractDbService({ store: eventStore });
  const queryService = new SampleQueryService({ prisma });
  const clientService = new ClientService({ prisma });

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

  const commandService = new SampleCommandService({
    eventService,
    queryService,
    clientService,
    userService: userServiceMock,
  });

  const actorAdmin = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'ADMIN',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };

  const actorClassifier = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'CLASSIFIER',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_branch, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  let cnpjCounter = 1;
  async function createSellerClient(overrides = {}) {
    cnpjCounter += 1;
    // F6.1: CNPJ valido por checksum (Receita Federal)
    const suffix = generateValidCnpj(cnpjCounter);
    return clientService.createClient(
      {
        personType: 'PJ',
        legalName: overrides.legalName ?? `Fazenda Test ${suffix}`,
        tradeName: overrides.tradeName ?? `Fazenda Test ${suffix}`,
        phone: '35 99999-0000',
        isBuyer: true,
        isSeller: true,
        branches: [{ isPrimary: true, cnpj: suffix }],
      },
      actorAdmin
    );
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

  test('bulkCreateLegacySkeletons creates samples with legacy fields and historical createdAt', async () => {
    const result = await commandService.bulkCreateLegacySkeletons(
      {
        items: [
          { number: 4908, registeredAt: '2026-01-05' },
          { number: 4909, registeredAt: '2026-01-06' },
        ],
      },
      actorAdmin
    );

    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].status, 'created');
    assert.equal(result.results[0].internalLotNumber, 'A-4908');
    assert.equal(result.results[1].status, 'created');
    assert.equal(result.results[1].internalLotNumber, 'A-4909');

    const sample0 = await queryService.requireSample(result.results[0].sampleId);
    assert.equal(sample0.source, 'LEGACY_BACKFILL');
    assert.equal(sample0.internalLotNumber, 'A-4908');
    assert.equal(sample0.status, 'REGISTRATION_IN_PROGRESS');
    assert.equal(sample0.createdAt.slice(0, 10), '2026-01-05');

    const events = await prisma.sampleEvent.findMany({
      where: { sampleId: result.results[0].sampleId },
      orderBy: { sequenceNumber: 'asc' },
    });
    assert.equal(events.length, 2);
    assert.equal(events[0].eventType, 'SAMPLE_RECEIVED');
    assert.equal(events[1].eventType, 'REGISTRATION_STARTED');
    assert.equal(events[0].occurredAt.toISOString().slice(0, 10), '2026-01-05');
    assert.equal(events[1].occurredAt.toISOString().slice(0, 10), '2026-01-05');
  });

  test('bulkCreateLegacySkeletons rejects non-ADMIN role with 403', async () => {
    await assert.rejects(
      commandService.bulkCreateLegacySkeletons(
        { items: [{ number: 4910, registeredAt: '2026-01-05' }] },
        actorClassifier
      ),
      (err) => err instanceof HttpError && err.status === 403
    );
  });

  test('bulkCreateLegacySkeletons is idempotent for the same lot number', async () => {
    const item = { number: 4911, registeredAt: '2026-01-07' };

    const r1 = await commandService.bulkCreateLegacySkeletons({ items: [item] }, actorAdmin);
    assert.equal(r1.results[0].status, 'created');
    const sampleId = r1.results[0].sampleId;

    const r2 = await commandService.bulkCreateLegacySkeletons({ items: [item] }, actorAdmin);
    assert.equal(r2.results[0].status, 'idempotent');
    assert.equal(r2.results[0].sampleId, sampleId);

    const events = await prisma.sampleEvent.findMany({ where: { sampleId } });
    assert.equal(events.length, 2, 'idempotent retry should not append new events');
  });

  test('bulkCreateLegacySkeletons rejects future registeredAt with 422 in result', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = await commandService.bulkCreateLegacySkeletons(
      { items: [{ number: 4912, registeredAt: future }] },
      actorAdmin
    );
    assert.equal(result.results[0].status, 'error');
    assert.equal(result.results[0].errorStatus, 422);
  });

  test('confirmRegistration on legacy skeleton reuses lot, preserves createdAt, jumps to QR_PRINTED', async () => {
    const ownerClient = await createSellerClient({
      legalName: 'Fazenda Legacy Test',
      tradeName: 'Fazenda Legacy Test',
    });
    const created = await commandService.bulkCreateLegacySkeletons(
      { items: [{ number: 4913, registeredAt: '2026-02-10' }] },
      actorAdmin
    );
    const { sampleId, internalLotNumber } = created.results[0];

    const before = await queryService.requireSample(sampleId);
    assert.equal(before.status, 'REGISTRATION_IN_PROGRESS');
    assert.equal(before.internalLotNumber, internalLotNumber);

    const confirmed = await commandService.confirmRegistration(
      {
        sampleId,
        expectedVersion: before.version,
        ownerClientId: ownerClient.client.id,
        declared: {
          owner: ownerClient.client.displayName,
          sacks: 100,
          harvest: '25/26',
          originLot: 'LEG-001',
        },
        idempotencyKey: randomUUID(),
      },
      actorAdmin
    );

    assert.equal(
      confirmed.sample.status,
      'QR_PRINTED',
      'legacy confirmRegistration should jump straight to QR_PRINTED'
    );
    assert.equal(confirmed.sample.internalLotNumber, internalLotNumber);
    assert.equal(confirmed.sample.source, 'LEGACY_BACKFILL');
    assert.equal(confirmed.sample.declaredOwner, ownerClient.client.displayName);
    assert.equal(confirmed.sample.declaredSacks, 100);
    assert.equal(confirmed.sample.createdAt.toISOString().slice(0, 10), '2026-02-10');

    const printJobs = await prisma.printJob.findMany({ where: { sampleId } });
    assert.equal(printJobs.length, 0, 'no PrintJob should be created for legacy skip');

    const events = await prisma.sampleEvent.findMany({
      where: { sampleId },
      orderBy: { sequenceNumber: 'asc' },
    });
    assert.deepEqual(
      events.map((e) => e.eventType),
      [
        'SAMPLE_RECEIVED',
        'REGISTRATION_STARTED',
        'REGISTRATION_CONFIRMED',
        'QR_PRINT_REQUESTED',
        'QR_PRINTED',
      ]
    );
    for (const event of events) {
      assert.equal(
        event.occurredAt.toISOString().slice(0, 10),
        '2026-02-10',
        `${event.eventType} should have historical occurredAt`
      );
    }
    const qrRequested = events.find((e) => e.eventType === 'QR_PRINT_REQUESTED');
    assert.equal(qrRequested.payload.legacy?.skipped, true);
    const qrPrinted = events.find((e) => e.eventType === 'QR_PRINTED');
    assert.equal(qrPrinted.payload.legacy?.skipped, true);
  });

  test('non-legacy confirmRegistration still follows normal flow (no skip)', async () => {
    const ownerClient = await createSellerClient({
      legalName: 'Fazenda Live',
      tradeName: 'Fazenda Live',
    });
    const sampleId = randomUUID();
    await commandService.receiveSample(
      { sampleId, receivedChannel: 'in_person', notes: null },
      actorAdmin
    );
    await commandService.startRegistration(
      { sampleId, expectedVersion: 1, notes: null },
      actorAdmin
    );

    const confirmed = await commandService.confirmRegistration(
      {
        sampleId,
        expectedVersion: 2,
        ownerClientId: ownerClient.client.id,
        declared: {
          owner: ownerClient.client.displayName,
          sacks: 50,
          harvest: '25/26',
          originLot: 'LIVE-001',
        },
        idempotencyKey: randomUUID(),
      },
      actorAdmin
    );

    assert.equal(confirmed.sample.status, 'REGISTRATION_CONFIRMED');
    assert.equal(confirmed.sample.source, 'LIVE');
    assert.match(confirmed.sample.internalLotNumber, /^A-\d+$/);
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
