import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { registrationConfirmedEvent } from './helpers/event-builders.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const store = new PrismaEventStore(prisma);
  const service = new EventContractDbService({ store });
  const queryService = new SampleQueryService({ prisma });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, sample_blend_component, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  // Helpers locais pra criar samples + ligas via direct insert
  // (não precisa do command service, ainda não implementado).
  async function createSample({ id, lotNumber, isBlend = false }) {
    await service.appendEvent(
      registrationConfirmedEvent(id, { payload: { sampleLotNumber: lotNumber } })
    );
    if (isBlend) {
      await prisma.sample.update({ where: { id }, data: { isBlend: true } });
    }
  }

  async function createBlendComponentRows(rows) {
    await prisma.sampleBlendComponent.createMany({
      data: rows.map((r) => ({
        id: randomUUID(),
        sampleId: r.sampleId,
        originSampleId: r.originSampleId,
        contributedSacks: r.contributedSacks,
      })),
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

  // Liga A2.1 — loadBlendTree

  test('loadBlendTree returns single root row when sample has no components', async () => {
    const sampleId = randomUUID();
    await createSample({ id: sampleId, lotNumber: '7001' });

    const tree = await queryService.loadBlendTree(sampleId);

    assert.equal(tree.length, 1);
    assert.equal(tree[0].sampleId, sampleId);
    assert.equal(tree[0].parentBlendId, null);
    assert.equal(tree[0].contributedSacks, null);
    assert.equal(tree[0].depth, 0);
    assert.equal(tree[0].isBlend, false);
  });

  test('loadBlendTree returns root + 2 leaves for simple blend (depth 1)', async () => {
    const blendId = randomUUID();
    const origin1Id = randomUUID();
    const origin2Id = randomUUID();

    await createSample({ id: origin1Id, lotNumber: '7010' });
    await createSample({ id: origin2Id, lotNumber: '7011' });
    await createSample({ id: blendId, lotNumber: '7012', isBlend: true });
    await createBlendComponentRows([
      { sampleId: blendId, originSampleId: origin1Id, contributedSacks: 5 },
      { sampleId: blendId, originSampleId: origin2Id, contributedSacks: 7 },
    ]);

    const tree = await queryService.loadBlendTree(blendId);

    assert.equal(tree.length, 3);

    const root = tree.find((r) => r.depth === 0);
    assert.equal(root.sampleId, blendId);
    assert.equal(root.isBlend, true);

    const leaves = tree.filter((r) => r.depth === 1);
    assert.equal(leaves.length, 2);
    leaves.forEach((leaf) => {
      assert.equal(leaf.parentBlendId, blendId);
      assert.equal(leaf.isBlend, false);
      assert.ok([origin1Id, origin2Id].includes(leaf.sampleId));
    });
    const contribsByLeaf = Object.fromEntries(leaves.map((l) => [l.sampleId, l.contributedSacks]));
    assert.equal(contribsByLeaf[origin1Id], 5);
    assert.equal(contribsByLeaf[origin2Id], 7);
  });

  test('loadBlendTree handles 3 levels deep (blend of blend)', async () => {
    // X1, X2, X3 → A (blend); A + Y → B (blend de liga).
    const x1 = randomUUID();
    const x2 = randomUUID();
    const x3 = randomUUID();
    const y = randomUUID();
    const a = randomUUID();
    const b = randomUUID();

    await createSample({ id: x1, lotNumber: '7100' });
    await createSample({ id: x2, lotNumber: '7101' });
    await createSample({ id: x3, lotNumber: '7102' });
    await createSample({ id: y, lotNumber: '7103' });
    await createSample({ id: a, lotNumber: '7104', isBlend: true });
    await createSample({ id: b, lotNumber: '7105', isBlend: true });

    await createBlendComponentRows([
      { sampleId: a, originSampleId: x1, contributedSacks: 3 },
      { sampleId: a, originSampleId: x2, contributedSacks: 4 },
      { sampleId: a, originSampleId: x3, contributedSacks: 5 },
      { sampleId: b, originSampleId: a, contributedSacks: 12 },
      { sampleId: b, originSampleId: y, contributedSacks: 8 },
    ]);

    const tree = await queryService.loadBlendTree(b);

    // 1 raiz (B) + 2 nivel 1 (A, Y) + 3 nivel 2 (X1, X2, X3) = 6 linhas
    assert.equal(tree.length, 6);
    assert.equal(tree.filter((r) => r.depth === 0).length, 1);
    assert.equal(tree.filter((r) => r.depth === 1).length, 2);
    assert.equal(tree.filter((r) => r.depth === 2).length, 3);

    // Verifica que A aparece como pai dos X
    const xRows = tree.filter((r) => r.depth === 2);
    xRows.forEach((row) => assert.equal(row.parentBlendId, a));
  });

  // Liga A2.1 — findActiveBlendsContainingOrigin

  test('findActiveBlendsContainingOrigin returns empty when sample is not in any blend', async () => {
    const sampleId = randomUUID();
    await createSample({ id: sampleId, lotNumber: '7200' });

    const blends = await queryService.findActiveBlendsContainingOrigin(sampleId);

    assert.equal(blends.length, 0);
  });

  test('findActiveBlendsContainingOrigin returns 2 active blends containing same origin', async () => {
    const origin = randomUUID();
    const blend1 = randomUUID();
    const blend2 = randomUUID();
    const otherOrigin = randomUUID();

    await createSample({ id: origin, lotNumber: '7300' });
    await createSample({ id: otherOrigin, lotNumber: '7301' });
    await createSample({ id: blend1, lotNumber: '7302', isBlend: true });
    await createSample({ id: blend2, lotNumber: '7303', isBlend: true });

    await createBlendComponentRows([
      { sampleId: blend1, originSampleId: origin, contributedSacks: 4 },
      { sampleId: blend1, originSampleId: otherOrigin, contributedSacks: 3 },
      { sampleId: blend2, originSampleId: origin, contributedSacks: 6 },
      { sampleId: blend2, originSampleId: otherOrigin, contributedSacks: 2 },
    ]);

    const blends = await queryService.findActiveBlendsContainingOrigin(origin);
    assert.equal(blends.length, 2);

    const byId = Object.fromEntries(blends.map((b) => [b.sampleId, b]));
    assert.equal(byId[blend1].lotNumber, '7302');
    assert.equal(byId[blend1].contributedSacks, 4);
    assert.equal(byId[blend2].contributedSacks, 6);
  });

  test('findActiveBlendsContainingOrigin excludes INVALIDATED blends', async () => {
    const origin = randomUUID();
    const activeBlend = randomUUID();
    const invalidatedBlend = randomUUID();
    const otherOrigin = randomUUID();

    await createSample({ id: origin, lotNumber: '7400' });
    await createSample({ id: otherOrigin, lotNumber: '7401' });
    await createSample({ id: activeBlend, lotNumber: '7402', isBlend: true });
    await createSample({ id: invalidatedBlend, lotNumber: '7403', isBlend: true });

    await createBlendComponentRows([
      { sampleId: activeBlend, originSampleId: origin, contributedSacks: 5 },
      { sampleId: activeBlend, originSampleId: otherOrigin, contributedSacks: 4 },
      { sampleId: invalidatedBlend, originSampleId: origin, contributedSacks: 3 },
      { sampleId: invalidatedBlend, originSampleId: otherOrigin, contributedSacks: 2 },
    ]);

    // Invalida o segundo blend direto via UPDATE (atalho pra teste).
    await prisma.sample.update({
      where: { id: invalidatedBlend },
      data: { status: 'INVALIDATED' },
    });

    const blends = await queryService.findActiveBlendsContainingOrigin(origin);
    assert.equal(blends.length, 1);
    assert.equal(blends[0].sampleId, activeBlend);
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
