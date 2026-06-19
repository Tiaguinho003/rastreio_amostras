import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('dashboard-sales-availability integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  const DAY_MS = 86_400_000;
  // Offsets bem dentro de cada banda (evita as bordas BRT-meia-noite de 15/30
  // dias, que sao sensiveis ao instante exato de "agora"). A funcao usa o
  // relogio real (nao injeta `now`), entao seedamos created_at relativo a agora.
  function daysAgo(n) {
    return new Date(Date.now() - n * DAY_MS);
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  // Cria a Sample direto na tabela (a query do donut le apenas colunas de
  // `sample`: status, commercial_status, created_at). INVALIDATED nao pode ser
  // o status inicial — cria como CLASSIFIED e transiciona (o guard so bloqueia
  // sair de INVALIDATED).
  async function createSample({
    status = 'REGISTRATION_CONFIRMED',
    commercialStatus = 'OPEN',
    createdAt,
    classifiedAt = null,
  }) {
    const id = randomUUID();
    await prisma.sample.create({
      data: {
        id,
        status: status === 'INVALIDATED' ? 'CLASSIFIED' : status,
        commercialStatus,
        createdAt,
        classifiedAt,
      },
    });
    if (status === 'INVALIDATED') {
      await prisma.sample.update({ where: { id }, data: { status: 'INVALIDATED' } });
    }
    return id;
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

  test('sem amostras: total e bandas zerados', async () => {
    const result = await queryService.getDashboardSalesAvailability();

    assert.strictEqual(result.total, 0);
    assert.deepStrictEqual(result.bands, { over30: 0, from15to30: 0, under15: 0 });
  });

  test('inclui amostra REGISTRATION_CONFIRMED (nao classificada) pela data de registro', async () => {
    await createSample({ status: 'REGISTRATION_CONFIRMED', createdAt: daysAgo(40) });

    const result = await queryService.getDashboardSalesAvailability();

    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.bands.over30, 1);
    assert.strictEqual(result.bands.from15to30, 0);
    assert.strictEqual(result.bands.under15, 0);
  });

  test('usa created_at como ancora do aging, ignorando classified_at recente', async () => {
    // Chegou ha 40 dias mas foi classificada hoje -> deve cair em over30 (chegada),
    // nao em under15 (classificacao). Prova que a ancora e created_at.
    await createSample({
      status: 'CLASSIFIED',
      createdAt: daysAgo(40),
      classifiedAt: new Date(),
    });

    const result = await queryService.getDashboardSalesAvailability();

    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.bands.over30, 1);
    assert.strictEqual(result.bands.under15, 0);
  });

  test('exclui INVALIDATED', async () => {
    await createSample({ status: 'INVALIDATED', createdAt: daysAgo(5) });

    const result = await queryService.getDashboardSalesAvailability();

    assert.strictEqual(result.total, 0);
    assert.deepStrictEqual(result.bands, { over30: 0, from15to30: 0, under15: 0 });
  });

  test('exclui SOLD e LOST; inclui OPEN e PARTIALLY_SOLD', async () => {
    await createSample({ commercialStatus: 'OPEN', createdAt: daysAgo(5) });
    await createSample({ commercialStatus: 'PARTIALLY_SOLD', createdAt: daysAgo(5) });
    await createSample({ commercialStatus: 'SOLD', createdAt: daysAgo(5) });
    await createSample({ commercialStatus: 'LOST', createdAt: daysAgo(5) });

    const result = await queryService.getDashboardSalesAvailability();

    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.bands.under15, 2);
  });

  test('distribui multiplas amostras nas 3 bandas e soma o total', async () => {
    await createSample({ createdAt: daysAgo(40) }); // over30
    await createSample({ createdAt: daysAgo(35) }); // over30
    await createSample({ createdAt: daysAgo(22) }); // from15to30
    await createSample({ createdAt: daysAgo(5) }); // under15

    const result = await queryService.getDashboardSalesAvailability();

    assert.strictEqual(result.total, 4);
    assert.strictEqual(result.bands.over30, 2);
    assert.strictEqual(result.bands.from15to30, 1);
    assert.strictEqual(result.bands.under15, 1);
    // Invariante: a soma das bandas iguala o total (todo lote cai em uma banda).
    assert.strictEqual(
      result.bands.over30 + result.bands.from15to30 + result.bands.under15,
      result.total
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
