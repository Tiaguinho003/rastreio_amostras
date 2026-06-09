import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { run as runBackfill } from '../scripts/migrations/backfill-liga-harvest-owner.js';
import { registrationConfirmedEvent } from './helpers/event-builders.js';

const BACKFILL_REASON_TEXT = 'Liga recalculada em backfill de origem';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const store = new PrismaEventStore(prisma);
  const eventService = new EventContractDbService({ store });
  const queryService = new SampleQueryService({ prisma });

  const clientServiceMock = {
    async resolveOwnerBinding({ ownerClientId, ownerUnitId }) {
      return {
        ownerClientId,
        ownerUnitId: ownerUnitId ?? null,
        displayName: `Cliente ${ownerClientId.slice(0, 8)}`,
      };
    },
    async resolveBuyerBinding({ buyerClientId, buyerUnitId }) {
      return {
        buyerClientId,
        buyerUnitId: buyerUnitId ?? null,
        buyerClient: { id: buyerClientId, displayName: `Comprador ${buyerClientId.slice(0, 8)}` },
        buyerUnit: null,
      };
    },
  };
  const userServiceMock = {
    async findUserOrNull(userId) {
      return { id: userId, fullName: 'Usuário', username: 't', status: 'ACTIVE' };
    },
  };

  const commandService = new SampleCommandService({
    eventService,
    queryService,
    clientService: clientServiceMock,
    userService: userServiceMock,
  });

  const actor = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'COMMERCIAL',
    source: 'api',
    requestId: randomUUID(),
  };

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, sample_blend_component, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  async function createSample({ id, lotNumber, harvest }) {
    await eventService.appendEvent(
      registrationConfirmedEvent(id, {
        payload: {
          sampleLotNumber: lotNumber,
          declared: { owner: 'Produtor', sacks: 50, harvest, originLot: 'LOTE-ORIGEM' },
        },
      })
    );
    await prisma.sample.update({ where: { id }, data: { status: 'CLASSIFIED' } });
  }

  async function createBlend({ clientDraftId, components, lotNumber }) {
    return commandService.createBlend(
      { clientDraftId, components, sampleLotNumber: lotNumber },
      actor
    );
  }

  function sampleRow(id) {
    return prisma.sample.findUnique({ where: { id } });
  }

  function registrationUpdates(sampleId) {
    return prisma.sampleEvent.findMany({
      where: { sampleId, eventType: 'REGISTRATION_UPDATED' },
      orderBy: { sequenceNumber: 'asc' },
    });
  }

  function runOnce(extra = {}) {
    return runBackfill({ prisma, eventService, queryService, log: () => {}, ...extra });
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

  // Drift legado em cascata: editar uma origem DIRETO na projecao (sem evento,
  // sem propagacao) simula uma liga pre-reativa stale. O backfill corrige B e o
  // pai C (cascata via Map), emite REGISTRATION_UPDATED SYSTEM/DATA_FIX, e
  // re-rodar nao emite nada.
  test('backfill corrige liga stale + cascata + evento, e re-run e no-op', async () => {
    const a = randomUUID();
    const x = randomUUID();
    const z = randomUUID();
    await createSample({ id: a, lotNumber: '30001', harvest: '24/25' });
    await createSample({ id: x, lotNumber: '30002', harvest: '23/24' });
    await createSample({ id: z, lotNumber: '30003', harvest: '22/23' });

    const b = await createBlend({
      clientDraftId: 'd-b',
      components: [
        { originSampleId: a, contributedSacks: 10 },
        { originSampleId: x, contributedSacks: 10 },
      ],
      lotNumber: '30004',
    });
    const c = await createBlend({
      clientDraftId: 'd-c',
      components: [
        { originSampleId: b.sample.id, contributedSacks: 20 },
        { originSampleId: z, contributedSacks: 10 },
      ],
      lotNumber: '30005',
    });
    assert.equal((await sampleRow(b.sample.id)).declaredHarvest, '23/24, 24/25');
    assert.equal((await sampleRow(c.sample.id)).declaredHarvest, '22/23, 23/24, 24/25');

    // Drift: muda a safra da origem A direto na projecao (sem evento).
    await prisma.sample.update({ where: { id: a }, data: { declaredHarvest: '25/26' } });

    const bVersionBefore = (await sampleRow(b.sample.id)).version;
    const cVersionBefore = (await sampleRow(c.sample.id)).version;

    const summary = await runOnce({ dryRun: false });
    assert.equal(summary.toUpdate, 2);
    assert.equal(summary.applied, 2);

    // Projecao corrigida (B recalcula; C usa o B JA recalculado — cascata).
    assert.equal((await sampleRow(b.sample.id)).declaredHarvest, '23/24, 25/26');
    assert.equal((await sampleRow(c.sample.id)).declaredHarvest, '22/23, 23/24, 25/26');

    // version +1 em cada liga.
    assert.equal((await sampleRow(b.sample.id)).version, bVersionBefore + 1);
    assert.equal((await sampleRow(c.sample.id)).version, cVersionBefore + 1);

    // Evento REGISTRATION_UPDATED SYSTEM/DATA_FIX/reasonText do backfill.
    const bEvents = await registrationUpdates(b.sample.id);
    assert.equal(bEvents.length, 1);
    assert.equal(bEvents[0].eventType, 'REGISTRATION_UPDATED');
    assert.equal(bEvents[0].actorType, 'SYSTEM');
    assert.equal(bEvents[0].actorUserId, null);
    assert.equal(bEvents[0].payload.reasonCode, 'DATA_FIX');
    assert.equal(bEvents[0].payload.reasonText, BACKFILL_REASON_TEXT);
    assert.equal(bEvents[0].payload.after.declared.harvest, '23/24, 25/26');
    assert.equal((await registrationUpdates(c.sample.id)).length, 1);

    // Re-run: projecao ja casa o derivado -> 0 diffs, 0 eventos novos.
    const second = await runOnce({ dryRun: false });
    assert.equal(second.toUpdate, 0);
    assert.equal(second.applied, 0);
    assert.equal((await registrationUpdates(b.sample.id)).length, 1);
    assert.equal((await registrationUpdates(c.sample.id)).length, 1);
  });

  // Liga INVALIDATED e excluida do escopo: nenhum evento, nenhum 409.
  test('liga INVALIDATED e excluida (sem evento, sem 409)', async () => {
    const a = randomUUID();
    const x = randomUUID();
    await createSample({ id: a, lotNumber: '31001', harvest: '24/25' });
    await createSample({ id: x, lotNumber: '31002', harvest: '23/24' });
    const b = await createBlend({
      clientDraftId: 'd-inv',
      components: [
        { originSampleId: a, contributedSacks: 10 },
        { originSampleId: x, contributedSacks: 10 },
      ],
      lotNumber: '31003',
    });

    // Drift + invalida a liga.
    await prisma.sample.update({ where: { id: a }, data: { declaredHarvest: '25/26' } });
    await prisma.sample.update({ where: { id: b.sample.id }, data: { status: 'INVALIDATED' } });

    const summary = await runOnce({ dryRun: false });
    assert.equal(summary.excluded, 1);
    assert.equal(summary.toUpdate, 0);
    assert.equal((await registrationUpdates(b.sample.id)).length, 0);
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
