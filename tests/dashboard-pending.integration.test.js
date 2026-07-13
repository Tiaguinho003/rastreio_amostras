import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

// getDashboardPending foi enxugado pra COUNT-ONLY (DSB-H4/H5, check-up do dashboard):
// devolve só classificationPending.total (samples em REGISTRATION_CONFIRMED, pendentes
// de classificação). Os antigos items/counts/clientsIncomplete eram payload morto — a
// completude de cliente vive no filtro de /clients (coberta em client-support).

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('dashboard-pending integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  // Sample direto na tabela (o count lê só `status`). REGISTRATION_CONFIRMED = pendente
  // de classificação; qualquer outro status não conta. (Molde do helper de
  // dashboard-sales-availability; INVALIDATED evitado — não pode ser status inicial.)
  async function createSample(status) {
    await prisma.sample.create({
      data: { id: randomUUID(), status, commercialStatus: 'OPEN', createdAt: new Date() },
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

  test('banco vazio: classificationPending.total = 0', async () => {
    const result = await queryService.getDashboardPending();
    assert.strictEqual(result.classificationPending.total, 0);
  });

  test('conta só os REGISTRATION_CONFIRMED (pendentes); ignora classificados', async () => {
    await createSample('REGISTRATION_CONFIRMED');
    await createSample('REGISTRATION_CONFIRMED');
    await createSample('REGISTRATION_CONFIRMED');
    await createSample('CLASSIFIED'); // não pendente
    await createSample('CLASSIFIED'); // não pendente

    const result = await queryService.getDashboardPending();

    assert.strictEqual(result.classificationPending.total, 3);
  });

  test('payload enxuto: só classificationPending.total (sem items/counts/clientsIncomplete)', async () => {
    await createSample('REGISTRATION_CONFIRMED');
    const result = await queryService.getDashboardPending();

    assert.deepStrictEqual(result, { classificationPending: { total: 1 } });
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
