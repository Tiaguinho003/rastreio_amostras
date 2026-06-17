import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

// Filtro de Safra — match por COMPONENTE: uma amostra de safra mista (liga,
// ex.: "24/25, 25/26") e filtrada por QUALQUER uma das safras que a compoem.

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('sample-harvest-filter integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, sample_blend_component, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  // Cria amostras (linhas diretas — o filtro le a coluna declaredHarvest) com
  // as safras informadas (string canonica; mista = "AA/AA, AA/AA").
  async function seedHarvests(values) {
    let index = 0;
    for (const harvest of values) {
      index += 1;
      await prisma.sample.create({
        data: {
          id: randomUUID(),
          internalLotNumber: `HV-${String(index).padStart(4, '0')}`,
          status: 'REGISTRATION_CONFIRMED',
          commercialStatus: 'OPEN',
          declaredHarvest: harvest,
          version: 1,
        },
      });
    }
  }

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('filtro por safra casa amostra de safra unica E liga mista que a contem', async () => {
    await resetDatabase();
    await seedHarvests(['24/25', '24/25, 25/26', '26/27']);

    const result = await queryService.listSamples({ harvest: '24/25' });

    assert.equal(result.items.length, 2);
    const harvests = result.items.map((item) => item.declared.harvest).sort();
    assert.deepEqual(harvests, ['24/25', '24/25, 25/26']);
  });

  test('filtro pela OUTRA safra da liga mista tambem casa', async () => {
    await resetDatabase();
    await seedHarvests(['24/25', '24/25, 25/26', '26/27']);

    const result = await queryService.listSamples({ harvest: '25/26' });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].declared.harvest, '24/25, 25/26');
  });

  test('filtro por safra que nao compoe a liga nao casa', async () => {
    await resetDatabase();
    await seedHarvests(['24/25, 25/26']);

    const result = await queryService.listSamples({ harvest: '26/27' });

    assert.equal(result.items.length, 0);
  });

  test('sem filtro de safra -> nao restringe', async () => {
    await resetDatabase();
    await seedHarvests(['24/25', '25/26', '24/25, 25/26']);

    const result = await queryService.listSamples({});
    assert.equal(result.items.length, 3);
  });

  test('filtro por MULTIPLAS safras (harvests) casa a UNIAO', async () => {
    await resetDatabase();
    await seedHarvests(['24/25', '24/25, 25/26', '26/27', '27/28']);

    const result = await queryService.listSamples({ harvests: ['24/25', '27/28'] });

    // '24/25' (direto), '24/25, 25/26' (componente) e '27/28' (direto); '26/27' fica de fora.
    assert.equal(result.items.length, 3);
    const harvests = result.items.map((item) => item.declared.harvest).sort();
    assert.deepEqual(harvests, ['24/25', '24/25, 25/26', '27/28']);
  });

  test('harvests vazio -> nao restringe', async () => {
    await resetDatabase();
    await seedHarvests(['24/25', '25/26']);

    const result = await queryService.listSamples({ harvests: [] });
    assert.equal(result.items.length, 2);
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
