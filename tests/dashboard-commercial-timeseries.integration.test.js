import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

// Card comercial do dashboard (getDashboardCommercialTimeseries): volume em
// SACAS de vendas/perdas por dia, nos ultimos 7 DIAS UTEIS (seg-sex) em BRT,
// por movementDate, so movimentos ATIVOS. Fim de semana + fora da janela +
// cancelados nao contam.

const SP_OFFSET_HOURS = 3;

function ymd(dateUtc) {
  const y = dateUtc.getUTCFullYear();
  const m = String(dateUtc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dateUtc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Mesma logica do service: 7 dias uteis a partir de hoje BRT, antigo->recente.
function lastBusinessDays(count) {
  const nowSp = new Date(Date.now() - SP_OFFSET_HOURS * 3600_000);
  const cursor = new Date(
    Date.UTC(nowSp.getUTCFullYear(), nowSp.getUTCMonth(), nowSp.getUTCDate())
  );
  const days = [];
  while (days.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      days.unshift(ymd(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

function minusDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return ymd(d);
}

// Primeiro sabado/domingo dentro do intervalo [firstDay, lastDay] (sempre ha
// pelo menos um numa janela de 7 dias uteis).
function firstWeekendInRange(firstDay, lastDay) {
  const end = new Date(`${lastDay}T00:00:00.000Z`);
  const cursor = new Date(`${firstDay}T00:00:00.000Z`);
  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (dow === 0 || dow === 6) {
      return ymd(cursor);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
}

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('dashboard-commercial-timeseries integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  async function seedSample() {
    const sampleId = randomUUID();
    await prisma.sample.create({
      data: {
        id: sampleId,
        internalLotNumber: `CT-${randomUUID().slice(0, 6)}`,
        status: 'REGISTRATION_CONFIRMED',
        commercialStatus: 'OPEN',
        declaredSacks: 1000,
        version: 1,
      },
    });
    return sampleId;
  }

  // SALE exige buyer_client_id NOT NULL (constraint chk_sample_movement_type_fields);
  // LOSS exige buyer_client_id NULL. Client PF + 1 papel (chk_client_role_flags).
  async function seedBuyer() {
    const id = randomUUID();
    await prisma.client.create({
      data: { id, personType: 'PF', fullName: 'Comprador Teste', isBuyer: true },
    });
    return id;
  }

  async function seedMovement(
    sampleId,
    { type, status = 'ACTIVE', sacks, date, buyerClientId = null }
  ) {
    await prisma.sampleMovement.create({
      data: {
        id: randomUUID(),
        sampleId,
        movementType: type,
        status,
        buyerClientId,
        quantitySacks: sacks,
        movementDate: new Date(`${date}T00:00:00.000Z`),
        // chk_sample_movement_cancelled_state: CANCELLED exige cancelled_at.
        cancelledAt: status === 'CANCELLED' ? new Date(`${date}T12:00:00.000Z`) : null,
      },
    });
  }

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('agrega sacas por dia util (antigo->recente), so ACTIVE, por movementDate', async () => {
    await resetDatabase();
    const sampleId = await seedSample();
    const buyerId = await seedBuyer();
    const days = lastBusinessDays(7);
    const first = days[0];
    const last = days[6];

    // Dia mais recente: 2 vendas parciais (somam) + 1 perda + 1 venda CANCELADA (fora).
    await seedMovement(sampleId, { type: 'SALE', sacks: 100, date: last, buyerClientId: buyerId });
    await seedMovement(sampleId, { type: 'SALE', sacks: 50, date: last, buyerClientId: buyerId });
    await seedMovement(sampleId, { type: 'LOSS', sacks: 30, date: last });
    await seedMovement(sampleId, {
      type: 'SALE',
      status: 'CANCELLED',
      sacks: 999,
      date: last,
      buyerClientId: buyerId,
    });
    // Outro dia util.
    await seedMovement(sampleId, {
      type: 'SALE',
      sacks: 200,
      date: days[5],
      buyerClientId: buyerId,
    });
    // Dia mais antigo da janela.
    await seedMovement(sampleId, { type: 'LOSS', sacks: 10, date: first });
    // Fim de semana dentro do range (fora).
    const weekend = firstWeekendInRange(first, last);
    if (weekend) {
      await seedMovement(sampleId, {
        type: 'SALE',
        sacks: 500,
        date: weekend,
        buyerClientId: buyerId,
      });
    }
    // Fora da janela (mais antigo que o primeiro dia) (fora).
    await seedMovement(sampleId, {
      type: 'SALE',
      sacks: 777,
      date: minusDays(first, 10),
      buyerClientId: buyerId,
    });

    const { points } = await queryService.getDashboardCommercialTimeseries();

    assert.equal(points.length, 7);
    assert.deepEqual(
      points.map((p) => p.date),
      days
    );

    assert.equal(points[6].salesSacks, 150); // 100 + 50; cancelada (999) fora
    assert.equal(points[6].lossSacks, 30);
    assert.equal(points[5].salesSacks, 200);
    assert.equal(points[5].lossSacks, 0);
    assert.equal(points[0].salesSacks, 0);
    assert.equal(points[0].lossSacks, 10);

    const totalSales = points.reduce((acc, p) => acc + p.salesSacks, 0);
    const totalLoss = points.reduce((acc, p) => acc + p.lossSacks, 0);
    assert.equal(totalSales, 350); // 150 + 200 (fim de semana 500 e fora-janela 777 ignorados)
    assert.equal(totalLoss, 40); // 30 + 10
  });

  test('sem movimentos -> 7 pontos zerados, antigo->recente', async () => {
    await resetDatabase();

    const { points } = await queryService.getDashboardCommercialTimeseries();

    assert.equal(points.length, 7);
    assert.ok(points.every((p) => p.salesSacks === 0 && p.lossSacks === 0));
    assert.deepEqual(
      points.map((p) => p.date),
      lastBusinessDays(7)
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
