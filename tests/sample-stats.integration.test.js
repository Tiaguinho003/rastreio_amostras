import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

// KPI row da lista de Lotes (FV /samples): getSampleStats devolve contagens
// GLOBAIS (independentes dos filtros da lista). Deletados (INVALIDATED) ficam
// de fora de tudo; "open" = OPEN + PARTIALLY_SOLD; "sold" = SOLD, com o recorte
// semanal (soldThisWeek/soldLastWeek) datado pelo MAX(movementDate) das vendas
// ATIVAS do lote — a venda que FECHOU o lote. Molde do getClientStats (RD14),
// incluindo os cortes deterministicos de mes/semana em BRT.

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

  // chk_sample_movement_type_fields exige buyer_client_id em movimento SALE.
  async function createBuyer() {
    const id = randomUUID();
    await prisma.client.create({
      data: { id, personType: 'PF', fullName: 'Comprador Teste', status: 'ACTIVE', isBuyer: true },
    });
    return id;
  }

  async function createSale({ sampleId, buyerClientId, movementDate, quantitySacks = 10, status }) {
    await prisma.sampleMovement.create({
      data: {
        id: randomUUID(),
        sampleId,
        movementType: 'SALE',
        status: status ?? 'ACTIVE',
        buyerClientId,
        quantitySacks,
        movementDate,
        // chk_sample_movement_cancelled_state: CANCELLED exige cancelledAt.
        cancelledAt: status === 'CANCELLED' ? new Date() : null,
      },
    });
  }

  // Segunda-feira que abre a semana corrente, do jeito que o service calcula:
  // semana ancorada em BRT (offset fixo -03) mas devolvida como meia-noite UTC
  // do dia, porque movementDate e coluna DATE pura. Todas as datas dos testes
  // sao offsets FIXOS dessa ancora (nada de "N dias atras" solto).
  function currentWeekMondayUtc() {
    const brtNow = new Date(Date.now() - 3 * 3600_000);
    const daysSinceMonday = (brtNow.getUTCDay() + 6) % 7;
    return new Date(
      Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate() - daysSinceMonday)
    );
  }

  function addDaysUtc(base, days) {
    return new Date(base.getTime() + days * 24 * 3600_000);
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

  test('sold conta commercialStatus SOLD e ignora deletados', async () => {
    await resetDatabase();
    await createSample({ commercialStatus: 'SOLD', declaredSacks: 50, soldSacks: 50 });
    await createSample({ commercialStatus: 'SOLD', declaredSacks: 80, soldSacks: 80 });
    // Nao entram: vendido porem deletado, parcialmente vendido, em aberto e perdido.
    await createSample({ status: 'INVALIDATED', commercialStatus: 'SOLD', declaredSacks: 999 });
    await createSample({ commercialStatus: 'PARTIALLY_SOLD', declaredSacks: 300, soldSacks: 120 });
    await createSample({ declaredSacks: 100 });
    await createSample({ commercialStatus: 'LOST', declaredSacks: 70, lostSacks: 70 });

    const stats = await queryService.getSampleStats();

    assert.equal(stats.sold, 2);
    // Sem nenhuma venda registrada, os recortes semanais ficam zerados.
    assert.equal(stats.soldThisWeek, 0);
    assert.equal(stats.soldLastWeek, 0);
  });

  test('vendidos na semana: lote conta na semana da ULTIMA venda (a que fechou)', async () => {
    await resetDatabase();
    const buyerClientId = await createBuyer();
    const monday = currentWeekMondayUtc();
    const lastWednesday = addDaysUtc(monday, -5);
    const twoWeeksAgoWednesday = addDaysUtc(monday, -12);

    // A: venda unica na propria segunda — exercita a fronteira exata da janela
    // (DATE 00:00Z contra o inicio da semana).
    const loteA = await createSample({
      commercialStatus: 'SOLD',
      declaredSacks: 30,
      soldSacks: 30,
    });
    await createSale({ sampleId: loteA, buyerClientId, movementDate: monday });

    // B (caso-chave): venda parcial na semana passada + venda final nesta.
    // O MAX manda, entao conta UMA vez e SO nesta semana.
    const loteB = await createSample({
      commercialStatus: 'SOLD',
      declaredSacks: 40,
      soldSacks: 40,
    });
    await createSale({ sampleId: loteB, buyerClientId, movementDate: lastWednesday });
    await createSale({ sampleId: loteB, buyerClientId, movementDate: monday });

    // C: fechou na semana passada.
    const loteC = await createSample({
      commercialStatus: 'SOLD',
      declaredSacks: 20,
      soldSacks: 20,
    });
    await createSale({ sampleId: loteC, buyerClientId, movementDate: lastWednesday });

    // D: fechou na semana retrasada — fora das duas janelas.
    const loteD = await createSample({
      commercialStatus: 'SOLD',
      declaredSacks: 20,
      soldSacks: 20,
    });
    await createSale({ sampleId: loteD, buyerClientId, movementDate: twoWeeksAgoWednesday });

    // E: venda desta semana, mas o lote ainda esta parcialmente vendido — o KPI
    // e de lote FECHADO, entao nao conta.
    const loteE = await createSample({
      commercialStatus: 'PARTIALLY_SOLD',
      declaredSacks: 60,
      soldSacks: 10,
    });
    await createSale({ sampleId: loteE, buyerClientId, movementDate: monday });

    // F: venda CANCELADA nesta semana nao pode reposicionar o lote — vale a
    // ultima venda ATIVA, que foi na semana passada.
    const loteF = await createSample({
      commercialStatus: 'SOLD',
      declaredSacks: 25,
      soldSacks: 25,
    });
    await createSale({ sampleId: loteF, buyerClientId, movementDate: lastWednesday });
    await createSale({
      sampleId: loteF,
      buyerClientId,
      movementDate: monday,
      status: 'CANCELLED',
    });

    // G: vendido porem deletado — fora de tudo.
    const loteG = await createSample({
      status: 'INVALIDATED',
      commercialStatus: 'SOLD',
      declaredSacks: 15,
    });
    await createSale({ sampleId: loteG, buyerClientId, movementDate: monday });

    // H: vendido sem nenhum movimento (legado) — entra no total de vendidos,
    // mas nao tem data pra cair em semana nenhuma.
    await createSample({ commercialStatus: 'SOLD', declaredSacks: 12, soldSacks: 12 });

    const stats = await queryService.getSampleStats();

    // A, B, C, D, F, H (E e PARTIALLY_SOLD; G esta deletado).
    assert.equal(stats.sold, 6);
    assert.equal(stats.soldThisWeek, 2); // A + B
    assert.equal(stats.soldLastWeek, 2); // C + F
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

  test('base vazia devolve zeros', async () => {
    await resetDatabase();

    const stats = await queryService.getSampleStats();

    assert.deepEqual(stats, {
      total: 0,
      open: 0,
      classificationPending: 0,
      sold: 0,
      soldThisWeek: 0,
      soldLastWeek: 0,
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
