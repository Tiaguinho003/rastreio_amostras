import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { LocalAuthService } from '../src/auth/local-auth-service.js';
import { ClientService } from '../src/clients/client-service.js';
import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { LocalUploadService } from '../src/uploads/local-upload-service.js';
import { registrationConfirmedEvent } from './helpers/event-builders.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('blend api integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const eventStore = new PrismaEventStore(prisma);
  const eventService = new EventContractDbService({ store: eventStore });
  const queryService = new SampleQueryService({ prisma });
  const clientService = new ClientService({ prisma });

  let uploadDir;
  let uploadService;
  let commandService;
  let api;
  let adminAuthHeaders;

  const actorAdmin = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'ADMIN',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };

  function buildInput({ headers = adminAuthHeaders, params = {}, query = {}, body = {} } = {}) {
    return { headers, params, query, body };
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, sample_blend_component, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  async function createClassifiedSample({ id, lotNumber, declaredSacks = 10 }) {
    await eventService.appendEvent(
      registrationConfirmedEvent(id, {
        payload: {
          sampleLotNumber: lotNumber,
          declared: {
            owner: 'Produtor',
            sacks: declaredSacks,
            harvest: '24/25',
            originLot: 'LOTE-ORIGEM',
          },
        },
      })
    );
    await prisma.sample.update({ where: { id }, data: { status: 'CLASSIFIED' } });
  }

  test.before(async () => {
    await prisma.$connect();

    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coffee-blend-api-'));
    uploadService = new LocalUploadService({ baseDir: uploadDir });

    const userServiceMock = {
      async findUsersForSnapshotByIds(userIds) {
        const uniqueIds = Array.from(
          new Set((Array.isArray(userIds) ? userIds : []).filter((id) => typeof id === 'string'))
        );
        return new Map(
          uniqueIds.map((id) => [
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

    commandService = new SampleCommandService({
      eventService,
      queryService,
      uploadService,
      clientService,
      userService: userServiceMock,
    });

    const authService = new LocalAuthService({
      secret: 'super-secret-for-blend-api-tests',
      allowPlaintextPasswords: true,
      users: [
        {
          id: actorAdmin.actorUserId,
          username: 'admin-blend',
          password: 'admin123',
          role: actorAdmin.role,
          displayName: 'Admin Liga',
        },
      ],
    });

    adminAuthHeaders = {
      authorization: `Bearer ${authService.login({ username: 'admin-blend', password: 'admin123' }).accessToken}`,
      'x-forwarded-for': actorAdmin.ip,
      'user-agent': actorAdmin.userAgent,
      'x-source': actorAdmin.source,
    };

    api = createBackendApiV1({
      authService,
      clientService,
      commandService,
      queryService,
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

  // Liga A3.1 — POST /samples/blends

  test('POST /samples/blends creates a blend with 2 classified origins', async () => {
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createClassifiedSample({ id: o1, lotNumber: '20001', declaredSacks: 30 });
    await createClassifiedSample({ id: o2, lotNumber: '20002', declaredSacks: 40 });

    const result = await api.createBlend(
      buildInput({
        body: {
          clientDraftId: 'draft-api-blend-001',
          components: [
            { originSampleId: o1, contributedSacks: 10 },
            { originSampleId: o2, contributedSacks: 15 },
          ],
          harvest: 'MISTA',
          sampleLotNumber: '20003',
        },
      })
    );

    assert.equal(result.status, 201);
    assert.equal(result.body.idempotent, false);
    assert.equal(result.body.sample.declared.sacks, 25);
    assert.equal(result.body.sample.isBlend, true);
  });

  test('POST /samples/blends returns 422 when fewer than 2 components', async () => {
    const o1 = randomUUID();
    await createClassifiedSample({ id: o1, lotNumber: '20010' });

    const result = await api.createBlend(
      buildInput({
        body: {
          clientDraftId: 'draft-api-blend-too-few',
          components: [{ originSampleId: o1, contributedSacks: 5 }],
          harvest: 'MISTA',
        },
      })
    );

    assert.equal(result.status, 422);
    assert.ok(/at least 2/.test(result.body.error.message));
  });

  test('POST /samples/blends returns 404 when origin sample does not exist', async () => {
    const o1 = randomUUID();
    const fakeId = randomUUID();
    await createClassifiedSample({ id: o1, lotNumber: '20020' });

    const result = await api.createBlend(
      buildInput({
        body: {
          clientDraftId: 'draft-api-blend-404',
          components: [
            { originSampleId: o1, contributedSacks: 5 },
            { originSampleId: fakeId, contributedSacks: 5 },
          ],
          harvest: 'MISTA',
        },
      })
    );

    assert.equal(result.status, 404);
  });

  // Liga A3.2 — POST /samples/:id/revert-blend

  test('POST /samples/:id/revert-blend transitions blend to INVALIDATED', async () => {
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createClassifiedSample({ id: o1, lotNumber: '20100', declaredSacks: 30 });
    await createClassifiedSample({ id: o2, lotNumber: '20101', declaredSacks: 40 });

    const createResult = await api.createBlend(
      buildInput({
        body: {
          clientDraftId: 'draft-revert-api',
          components: [
            { originSampleId: o1, contributedSacks: 10 },
            { originSampleId: o2, contributedSacks: 15 },
          ],
          harvest: 'MISTA',
          sampleLotNumber: '20102',
        },
      })
    );
    assert.equal(createResult.status, 201);

    const blendId = createResult.body.sample.id;
    const blendVersion = createResult.body.sample.version;

    const revertResult = await api.revertBlend(
      buildInput({
        params: { sampleId: blendId },
        body: {
          expectedVersion: blendVersion,
          reasonText: 'cancelado',
        },
      })
    );

    assert.equal(revertResult.status, 200);

    const dbSample = await prisma.sample.findUnique({ where: { id: blendId } });
    assert.equal(dbSample.status, 'INVALIDATED');
  });

  test('POST /samples/:id/revert-blend returns 422 when sample is not a blend', async () => {
    const normalId = randomUUID();
    await createClassifiedSample({ id: normalId, lotNumber: '20200' });

    const result = await api.revertBlend(
      buildInput({
        params: { sampleId: normalId },
        body: { expectedVersion: 1 },
      })
    );

    assert.equal(result.status, 422);
    assert.ok(/is not a blend/.test(result.body.error.message));
  });

  // Liga A3.3 — GET /samples?eligibleForBlend=true

  test('GET /samples without eligibleForBlend returns plain list', async () => {
    const o1 = randomUUID();
    await createClassifiedSample({ id: o1, lotNumber: '20300' });

    const result = await api.listSamples(buildInput({ query: {} }));

    assert.equal(result.status, 200);
    assert.equal(result.body.items.length, 1);
    // Sem enrichment.
    assert.equal(result.body.items[0].eligibility, undefined);
    assert.equal(result.body.items[0].committedSacks, undefined);
  });

  test('GET /samples?eligibleForBlend=true enriches items with eligibility', async () => {
    const classified = randomUUID();
    const registered = randomUUID();
    await createClassifiedSample({ id: classified, lotNumber: '20310' });
    // Sample sem CLASSIFIED — fica em REGISTRATION_CONFIRMED.
    await eventService.appendEvent(
      registrationConfirmedEvent(registered, {
        payload: {
          sampleLotNumber: '20311',
          declared: { owner: 'Produtor', sacks: 5, harvest: '24/25', originLot: 'X' },
        },
      })
    );

    const result = await api.listSamples(buildInput({ query: { eligibleForBlend: 'true' } }));

    assert.equal(result.status, 200);
    const items = result.body.items;
    assert.equal(items.length, 2);
    items.forEach((item) => {
      assert.ok(item.eligibility);
      assert.equal(typeof item.eligibility.eligible, 'boolean');
      assert.equal(typeof item.committedSacks, 'number');
    });

    const classifiedItem = items.find((i) => i.id === classified);
    const registeredItem = items.find((i) => i.id === registered);
    assert.equal(classifiedItem.eligibility.eligible, true);
    assert.equal(classifiedItem.eligibility.reason, null);
    // Liga F1.4 relaxada (2026-05-19): REGISTRATION_CONFIRMED tambem e elegivel.
    assert.equal(registeredItem.eligibility.eligible, true);
    assert.equal(registeredItem.eligibility.reason, null);
  });

  test('GET /samples?eligibleForBlend=true reports committedSacks for origin in active blend', async () => {
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createClassifiedSample({ id: o1, lotNumber: '20320', declaredSacks: 30 });
    await createClassifiedSample({ id: o2, lotNumber: '20321', declaredSacks: 40 });

    await api.createBlend(
      buildInput({
        body: {
          clientDraftId: 'draft-committed',
          components: [
            { originSampleId: o1, contributedSacks: 12 },
            { originSampleId: o2, contributedSacks: 18 },
          ],
          harvest: 'MISTA',
          sampleLotNumber: '20322',
        },
      })
    );

    const result = await api.listSamples(buildInput({ query: { eligibleForBlend: 'true' } }));
    assert.equal(result.status, 200);
    const byId = Object.fromEntries(result.body.items.map((i) => [i.id, i]));
    assert.equal(byId[o1].committedSacks, 12);
    assert.equal(byId[o2].committedSacks, 18);
  });

  // Liga A3.4 — GET /samples/:id enriquecido

  test('GET /samples/:id returns components when sample is a blend', async () => {
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createClassifiedSample({ id: o1, lotNumber: '20400', declaredSacks: 20 });
    await createClassifiedSample({ id: o2, lotNumber: '20401', declaredSacks: 30 });

    const blend = await api.createBlend(
      buildInput({
        body: {
          clientDraftId: 'draft-detail',
          components: [
            { originSampleId: o1, contributedSacks: 8 },
            { originSampleId: o2, contributedSacks: 12 },
          ],
          harvest: 'MISTA',
          sampleLotNumber: '20402',
        },
      })
    );

    const detail = await api.getSampleDetail(
      buildInput({ params: { sampleId: blend.body.sample.id } })
    );
    assert.equal(detail.status, 200);
    assert.equal(detail.body.components.length, 2);
    detail.body.components.forEach((component) => {
      assert.ok(component.originSample);
      assert.ok(component.originSample.internalLotNumber);
    });
    const componentByLot = Object.fromEntries(
      detail.body.components.map((c) => [c.originSample.internalLotNumber, c])
    );
    assert.equal(componentByLot['20400'].contributedSacks, 8);
    assert.equal(componentByLot['20401'].contributedSacks, 12);

    // activeBlends da liga em si: vazia (a liga nao e origem em outra liga).
    assert.equal(detail.body.activeBlends.length, 0);
  });

  test('GET /samples/:id returns activeBlends for origin in active blend', async () => {
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createClassifiedSample({ id: o1, lotNumber: '20410', declaredSacks: 20 });
    await createClassifiedSample({ id: o2, lotNumber: '20411', declaredSacks: 30 });

    const blend = await api.createBlend(
      buildInput({
        body: {
          clientDraftId: 'draft-active',
          components: [
            { originSampleId: o1, contributedSacks: 10 },
            { originSampleId: o2, contributedSacks: 15 },
          ],
          harvest: 'MISTA',
          sampleLotNumber: '20412',
        },
      })
    );

    const detail = await api.getSampleDetail(buildInput({ params: { sampleId: o1 } }));
    assert.equal(detail.status, 200);
    // o1 NAO e liga -> components vazio.
    assert.equal(detail.body.components.length, 0);
    // o1 e origem na liga acima -> activeBlends contem 1 entry.
    assert.equal(detail.body.activeBlends.length, 1);
    assert.equal(detail.body.activeBlends[0].sampleId, blend.body.sample.id);
    assert.equal(detail.body.activeBlends[0].lotNumber, '20412');
    assert.equal(detail.body.activeBlends[0].contributedSacks, 10);

    // B3.7: activeBlends carrega o snapshot de dono/safra da liga.
    const blendDetail = await api.getSampleDetail(
      buildInput({ params: { sampleId: blend.body.sample.id } })
    );
    assert.equal(detail.body.activeBlends[0].declaredOwner, blendDetail.body.sample.declared.owner);
    assert.equal(
      detail.body.activeBlends[0].declaredHarvest,
      blendDetail.body.sample.declared.harvest
    );
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
