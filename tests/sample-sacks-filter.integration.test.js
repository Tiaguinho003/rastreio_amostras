import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

// Filtro de Sacas — UX "1 valor = exato, 2 = intervalo": com um campo
// preenchido a busca e EXATA (equals); com os dois, intervalo [min, max].

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('sample-sacks-filter integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  // Cria amostras (linhas diretas, sem eventos — o filtro de sacas le a coluna
  // declaredSacks do sample) com as quantidades de sacas informadas.
  async function seedSacks(values) {
    let index = 0;
    for (const sacks of values) {
      index += 1;
      await prisma.sample.create({
        data: {
          id: randomUUID(),
          internalLotNumber: `SK-${String(index).padStart(4, '0')}`,
          status: 'REGISTRATION_CONFIRMED',
          commercialStatus: 'OPEN',
          declaredSacks: sacks,
          version: 1,
        },
      });
    }
  }

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('1 valor (sacksMin) -> busca EXATA', async () => {
    await resetDatabase();
    await seedSacks([50, 100, 100, 150, 200]);

    const result = await queryService.listSamples({ sacksMin: '100' });

    assert.equal(result.items.length, 2);
    assert.ok(result.items.every((item) => item.declared.sacks === 100));
  });

  test('1 valor no segundo campo (sacksMax sozinho) -> tambem EXATA', async () => {
    await resetDatabase();
    await seedSacks([50, 100, 150]);

    const result = await queryService.listSamples({ sacksMax: '150' });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].declared.sacks, 150);
  });

  test('2 valores -> INTERVALO [min, max] inclusivo', async () => {
    await resetDatabase();
    await seedSacks([50, 100, 150, 200, 250]);

    const result = await queryService.listSamples({ sacksMin: '100', sacksMax: '200' });

    assert.equal(result.items.length, 3);
    const sacks = result.items.map((item) => item.declared.sacks).sort((a, b) => a - b);
    assert.deepEqual(sacks, [100, 150, 200]);
  });

  test('sem filtro de sacas -> nao restringe', async () => {
    await resetDatabase();
    await seedSacks([50, 100, 200]);

    const result = await queryService.listSamples({});
    assert.equal(result.items.length, 3);
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
