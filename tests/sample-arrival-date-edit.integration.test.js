import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { ClientService } from '../src/clients/client-service.js';
import { generateValidCnpj } from './helpers/cnpj-generator.js';
import { seedTestBroker } from './helpers/sale-contract-fixtures.js';
import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { LocalUploadService } from '../src/uploads/local-upload-service.js';
import { HttpError } from '../src/contracts/errors.js';

// Lote editavel: edicao da data de chegada (createdAt do lote) via
// REGISTRATION_UPDATED carregando after.createdAt. Cobre live-apply na projecao,
// que o evento carrega o override (= consistencia de rebuild), data futura (422)
// e no-op de mesmo dia (409).

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

// YYYY-MM-DD com deslocamento em dias a partir de hoje (evita datas cravadas).
function dayOffset(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

if (!databaseUrl || !databaseReachable) {
  test.skip('arrival-date-edit integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const eventStore = new PrismaEventStore(prisma);
  const eventService = new EventContractDbService({ store: eventStore });
  const queryService = new SampleQueryService({ prisma });
  const clientService = new ClientService({ prisma });

  const actor = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'ADMIN',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };

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
            fullName: `Test ${id.slice(0, 8)}`,
            username: `u_${id.slice(0, 8)}`,
            status: 'ACTIVE',
          },
        ])
      );
    },
  };

  let uploadDir;
  let uploadService;
  let commandService;
  let sellerSequence = 0;

  async function createSellerClient() {
    sellerSequence += 1;
    const cnpj = generateValidCnpj(sellerSequence);
    const name = `Proprietario Data ${sellerSequence} LTDA`;
    return clientService.createClient(
      {
        personType: 'PJ',
        legalName: name,
        tradeName: name,
        cnpj,
        phone: '35 99999-0000',
        isBuyer: true,
        isSeller: true,
      },
      actor
    );
  }

  async function createSampleWithReceivedDate(receivedDate) {
    const sampleId = randomUUID();
    const ownerClient = await createSellerClient();
    await commandService.createSample(
      {
        sampleId,
        clientDraftId: `draft-${sampleId.slice(0, 8)}`,
        ownerClientId: ownerClient.client.id,
        owner: ownerClient.client.displayName,
        sacks: 9,
        harvest: '25/26',
        originLot: `ORIG-${sampleId.slice(0, 8)}`,
        receivedChannel: 'in_person',
        receivedDate,
        idempotencyKey: randomUUID(),
      },
      actor
    );
    return sampleId;
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  test.before(async () => {
    await prisma.$connect();
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coffee-date-edit-test-'));
    uploadService = new LocalUploadService({ baseDir: uploadDir });
    commandService = new SampleCommandService({
      eventService,
      queryService,
      uploadService,
      clientService,
      userService: userServiceMock,
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
    await seedTestBroker(prisma);
  });

  test('edita a data de chegada -> createdAt reflete a nova data e o evento carrega after.createdAt', async () => {
    const createdDate = dayOffset(-40);
    const editedDate = dayOffset(-55);
    const sampleId = await createSampleWithReceivedDate(createdDate);

    const before = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(before.createdAt.toISOString().slice(0, 10), createdDate);

    const current = await queryService.requireSample(sampleId);
    const result = await commandService.updateRegistration(
      {
        sampleId,
        expectedVersion: current.version,
        after: { receivedDate: editedDate },
        reasonCode: 'DATA_FIX',
        reasonText: 'Ajuste da data de chegada',
      },
      actor
    );
    assert.ok(result.statusCode === 200 || result.statusCode === 201);

    // Projecao (live-apply): createdAt agora e a data editada (meio-dia SP).
    const after = await prisma.sample.findUnique({ where: { id: sampleId } });
    assert.equal(after.createdAt.toISOString().slice(0, 10), editedDate);

    // Evento carrega after.createdAt -> o replay/rebuild reaplica o override.
    const events = await prisma.sampleEvent.findMany({
      where: { sampleId, eventType: 'REGISTRATION_UPDATED' },
    });
    assert.equal(events.length, 1);
    const payloadAfter = events[0].payload.after;
    assert.ok(payloadAfter && payloadAfter.createdAt, 'after.createdAt presente no evento');
    assert.equal(new Date(payloadAfter.createdAt).toISOString().slice(0, 10), editedDate);
  });

  test('rejeita data de chegada no futuro (422)', async () => {
    const sampleId = await createSampleWithReceivedDate(dayOffset(-40));
    const current = await queryService.requireSample(sampleId);

    await assert.rejects(
      () =>
        commandService.updateRegistration(
          {
            sampleId,
            expectedVersion: current.version,
            after: { receivedDate: dayOffset(400) },
            reasonCode: 'DATA_FIX',
            reasonText: 'Ajuste da data de chegada',
          },
          actor
        ),
      (err) => err instanceof HttpError && err.status === 422
    );
  });

  test('mesma data de chegada e no-op (409)', async () => {
    const sameDate = dayOffset(-40);
    const sampleId = await createSampleWithReceivedDate(sameDate);
    const current = await queryService.requireSample(sampleId);

    await assert.rejects(
      () =>
        commandService.updateRegistration(
          {
            sampleId,
            expectedVersion: current.version,
            after: { receivedDate: sameDate },
            reasonCode: 'DATA_FIX',
            reasonText: 'Ajuste da data de chegada',
          },
          actor
        ),
      (err) => err instanceof HttpError && err.status === 409
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
