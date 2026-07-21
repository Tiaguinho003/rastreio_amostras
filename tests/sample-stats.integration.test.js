import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

// KPI row da lista de Lotes (FV /samples): getSampleStats devolve contagens
// GLOBAIS (independentes dos filtros da lista). Deletados (INVALIDATED) ficam
// de fora de tudo; "open" = OPEN + PARTIALLY_SOLD; availableSacks soma
// (declaradas - vendidas - perdidas) so nos lotes em aberto. Molde do
// getClientStats (RD14), incluindo o corte de mes deterministico em BRT.

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('sample-stats integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  let lotSequence = 0;

  // Linhas diretas (sem eventos — as stats leem so colunas do sample).
  async function createSample({
    status = 'CLASSIFIED',
    commercialStatus = 'OPEN',
    declaredSacks = null,
    soldSacks = 0,
    lostSacks = 0,
  } = {}) {
    lotSequence += 1;
    const id = randomUUID();
    await prisma.sample.create({
      data: {
        id,
        internalLotNumber: String(7000 + lotSequence),
        status,
        commercialStatus,
        declaredSacks,
        soldSacks,
        lostSacks,
        version: 1,
      },
    });
    return id;
  }

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('contagens globais: total, em aberto, pendentes de classificacao', async () => {
    await resetDatabase();
    // 2 em aberto (1 deles ainda por classificar), 1 parcialmente vendido,
    // 1 vendido, 1 perdido e 1 deletado.
    await createSample({ status: 'REGISTRATION_CONFIRMED', declaredSacks: 100 });
    await createSample({ declaredSacks: 200 });
    await createSample({ commercialStatus: 'PARTIALLY_SOLD', declaredSacks: 300, soldSacks: 120 });
    await createSample({ commercialStatus: 'SOLD', declaredSacks: 50, soldSacks: 50 });
    await createSample({ commercialStatus: 'LOST', declaredSacks: 40, lostSacks: 40 });
    await createSample({ status: 'INVALIDATED', declaredSacks: 999 });

    const stats = await queryService.getSampleStats();

    // Deletado fica de fora do total.
    assert.equal(stats.total, 5);
    // Em aberto = OPEN + PARTIALLY_SOLD (vendido e perdido ficam de fora).
    assert.equal(stats.open, 3);
    assert.equal(stats.classificationPending, 1);
  });

  test('availableSacks = declaradas - vendidas - perdidas, so nos lotes em aberto', async () => {
    await resetDatabase();
    await createSample({ declaredSacks: 100 });
    await createSample({ commercialStatus: 'PARTIALLY_SOLD', declaredSacks: 300, soldSacks: 120 });
    await createSample({ commercialStatus: 'PARTIALLY_SOLD', declaredSacks: 80, lostSacks: 30 });
    // Estes NAO entram: vendido, perdido e deletado.
    await createSample({ commercialStatus: 'SOLD', declaredSacks: 500, soldSacks: 500 });
    await createSample({ commercialStatus: 'LOST', declaredSacks: 70, lostSacks: 70 });
    await createSample({ status: 'INVALIDATED', declaredSacks: 999 });
    // Lote sem sacas declaradas nao quebra a soma.
    await createSample({ declaredSacks: null });

    const stats = await queryService.getSampleStats();

    // 100 + (300-120) + (80-30) = 330
    assert.equal(stats.availableSacks, 330);
  });

  test('novos no mes e no mes anterior (corte em BRT)', async () => {
    await resetDatabase();
    const recente = await createSample({ declaredSacks: 10 });
    await createSample({ declaredSacks: 20 });

    const stats = await queryService.getSampleStats();
    assert.equal(stats.newThisMonth, 2);
    assert.equal(stats.newLastMonth, 0);

    // Lote movido pro dia 15 do MES ANTERIOR (00:00 BRT = 03:00 UTC, mesmo
    // offset fixo do service): sai de newThisMonth e entra em newLastMonth.
    // Deterministico em qualquer dia de execucao.
    const brtNow = new Date(Date.now() - 3 * 3600_000);
    const previousMonth15Utc = new Date(
      Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth() - 1, 15, 3, 0, 0)
    );
    await prisma.sample.update({
      where: { id: recente },
      data: { createdAt: previousMonth15Utc },
    });

    const stats2 = await queryService.getSampleStats();
    assert.equal(stats2.newThisMonth, 1);
    assert.equal(stats2.newLastMonth, 1);
    assert.equal(stats2.total, 2);
  });

  test('base vazia devolve zeros (sem null de aggregate)', async () => {
    await resetDatabase();

    const stats = await queryService.getSampleStats();

    assert.deepEqual(stats, {
      total: 0,
      open: 0,
      classificationPending: 0,
      availableSacks: 0,
      newThisMonth: 0,
      newLastMonth: 0,
    });
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
