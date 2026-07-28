import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

// RC-D30 — filtro `sellableOnly`, do picker de lote do contrato à vista.
//
// O picker usava `displayStatus: 'OPEN'`, que filtra pelo ROTULO
// `commercialStatus` e nao pelo saldo. Dois lotes passavam por ali sem poder
// ser vendidos, e so revelavam o problema no submit:
//   1. lote sem quantidade declarada — resolveCommercialStatusFromTotals
//      devolve 'OPEN' de proposito quando declaredSacks e null;
//   2. liga cuja cascata nao fecha (origem sem saldo pra cobrir a contribuicao).
// Estes testes fixam que os dois somem com `sellableOnly`, e que continuam
// visiveis sem ele (pra a mudanca nao vazar pra /samples).

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('sample-sellable-filter integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_blend_component, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  // Linha direta de sample (sem eventos — o filtro le colunas do sample).
  async function createSample({
    lotNumber,
    declaredSacks = 100,
    soldSacks = 0,
    lostSacks = 0,
    commercialStatus = 'OPEN',
    isBlend = false,
  }) {
    const id = randomUUID();
    await prisma.sample.create({
      data: {
        id,
        internalLotNumber: lotNumber,
        status: 'REGISTRATION_CONFIRMED',
        commercialStatus,
        declaredSacks,
        soldSacks,
        lostSacks,
        isBlend,
        version: 1,
      },
    });
    return id;
  }

  async function linkOrigin(blendId, originId, contributedSacks) {
    await prisma.sampleBlendComponent.create({
      data: { id: randomUUID(), sampleId: blendId, originSampleId: originId, contributedSacks },
    });
  }

  function lotNumbers(result) {
    return result.items.map((item) => item.internalLotNumber).sort();
  }

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('lote sem quantidade declarada some — e era o que displayStatus=OPEN deixava passar', async () => {
    await resetDatabase();
    await createSample({ lotNumber: 'SEL-0001', declaredSacks: 100 });
    await createSample({ lotNumber: 'SEL-0002', declaredSacks: null });

    // O buraco que este filtro fecha: pelo rotulo, os dois sao "em aberto".
    const byLabel = await queryService.listSamples({ displayStatus: 'OPEN' });
    assert.deepEqual(lotNumbers(byLabel), ['SEL-0001', 'SEL-0002']);

    const sellable = await queryService.listSamples({ sellableOnly: true });
    assert.deepEqual(lotNumbers(sellable), ['SEL-0001']);
  });

  test('lote vendido e lote perdido ficam de fora', async () => {
    await resetDatabase();
    await createSample({ lotNumber: 'SEL-0010', declaredSacks: 100 });
    await createSample({
      lotNumber: 'SEL-0011',
      declaredSacks: 100,
      soldSacks: 100,
      commercialStatus: 'SOLD',
    });
    await createSample({
      lotNumber: 'SEL-0012',
      declaredSacks: 100,
      lostSacks: 100,
      commercialStatus: 'LOST',
    });

    const sellable = await queryService.listSamples({ sellableOnly: true });
    assert.deepEqual(lotNumbers(sellable), ['SEL-0010']);
  });

  test('lote parcialmente vendido continua vendavel (tem saldo)', async () => {
    await resetDatabase();
    await createSample({
      lotNumber: 'SEL-0020',
      declaredSacks: 100,
      soldSacks: 40,
      commercialStatus: 'PARTIALLY_SOLD',
    });

    const sellable = await queryService.listSamples({ sellableOnly: true });
    assert.deepEqual(lotNumbers(sellable), ['SEL-0020']);
  });

  test('liga inviavel some; liga viavel fica', async () => {
    await resetDatabase();
    // Liga viavel: as duas origens cobrem o que contribuiram.
    const okA = await createSample({ lotNumber: 'SEL-0030', declaredSacks: 100 });
    const okB = await createSample({ lotNumber: 'SEL-0031', declaredSacks: 100 });
    const blendOk = await createSample({
      lotNumber: 'SEL-0032',
      declaredSacks: 40,
      isBlend: true,
    });
    await linkOrigin(blendOk, okA, 20);
    await linkOrigin(blendOk, okB, 20);

    // Liga inviavel: uma origem foi drenada abaixo da contribuicao.
    const drained = await createSample({
      lotNumber: 'SEL-0040',
      declaredSacks: 100,
      soldSacks: 95,
      commercialStatus: 'PARTIALLY_SOLD',
    });
    const badB = await createSample({ lotNumber: 'SEL-0041', declaredSacks: 100 });
    const blendBad = await createSample({
      lotNumber: 'SEL-0042',
      declaredSacks: 40,
      isBlend: true,
    });
    await linkOrigin(blendBad, drained, 20); // disponivel = 5 < 20
    await linkOrigin(blendBad, badB, 20);

    const sellable = await queryService.listSamples({ sellableOnly: true });
    assert.ok(lotNumbers(sellable).includes('SEL-0032'));
    assert.ok(!lotNumbers(sellable).includes('SEL-0042'));
  });

  test('sem a flag nada e restringido (o filtro nao vaza pra /samples)', async () => {
    await resetDatabase();
    await createSample({ lotNumber: 'SEL-0050', declaredSacks: 100 });
    await createSample({ lotNumber: 'SEL-0051', declaredSacks: null });
    await createSample({
      lotNumber: 'SEL-0052',
      declaredSacks: 100,
      soldSacks: 100,
      commercialStatus: 'SOLD',
    });

    const all = await queryService.listSamples({});
    assert.equal(all.items.length, 3);
  });

  test('o cursor sai da ultima linha BUSCADA, nao da ultima exibida', async () => {
    await resetDatabase();
    // 3 lotes bons + 1 liga inviavel no meio. Com limit=4 a pagina busca 4
    // linhas, descarta a liga e mostra 3 — mas ainda tem que oferecer cursor,
    // senao o scroll infinito para antes do fim.
    await createSample({ lotNumber: '90001', declaredSacks: 100 });
    await createSample({ lotNumber: '90002', declaredSacks: 100 });
    const drained = await createSample({
      lotNumber: '90003',
      declaredSacks: 100,
      soldSacks: 99,
      commercialStatus: 'PARTIALLY_SOLD',
    });
    const other = await createSample({ lotNumber: '90004', declaredSacks: 100 });
    const blendBad = await createSample({
      lotNumber: '90005',
      declaredSacks: 40,
      isBlend: true,
    });
    await linkOrigin(blendBad, drained, 20);
    await linkOrigin(blendBad, other, 20);
    await createSample({ lotNumber: '90006', declaredSacks: 100 });

    const firstPage = await queryService.listSamples({ sellableOnly: true, limit: 4 });
    // A liga 90005 caiu: 4 buscadas, 3 exibidas.
    assert.equal(firstPage.items.length, 3);
    assert.ok(!lotNumbers(firstPage).includes('90005'));
    // E o cursor existe, apontando pra ultima linha buscada.
    assert.ok(firstPage.page.nextCursor);
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
