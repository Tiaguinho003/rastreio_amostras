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
