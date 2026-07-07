import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { HttpError } from '../src/contracts/errors.js';

// LOT-T2/T3 (revisão geral — lacuna #7 da revisão faseada da lista): os
// filtros de classificação (padroes/aspectos/catacoes/certificados), o
// endpoint listClassificationValues, o filtro isBlend e o enriquecimento
// eligibleForBlend/committedSacks do listSamples não tinham NENHUMA
// cobertura. Seeds diretos na tabela sample (latestClassificationData é a
// projeção canônica escrita pelo projetor).

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('sample-classification-filter integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  let lotSequence = 0;

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  async function createSample({
    classification = null,
    isBlend = false,
    declaredSacks = 50,
    status = 'CLASSIFIED',
  } = {}) {
    const id = randomUUID();
    lotSequence += 1;
    await prisma.sample.create({
      data: {
        id,
        status,
        internalLotNumber: String(8000 + lotSequence),
        isBlend,
        declaredSacks,
        ...(classification ? { latestClassificationData: classification } : {}),
      },
    });
    return id;
  }

  test.before(async () => {
    await prisma.$connect();
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    lotSequence = 0;
    await resetDatabase();
  });

  test('filtro padroes: match exato canônico + canoniza a entrada suja', async () => {
    const alvo = await createSample({ classification: { padrao: 'L30-P17' } });
    await createSample({ classification: { padrao: 'L19-P16' } });
    await createSample(); // sem classificação — nunca casa

    // Valor canônico direto.
    const exact = await queryService.listSamples({ padroes: ['L30-P17'] });
    assert.deepEqual(
      exact.items.map((item) => item.id),
      [alvo]
    );

    // Entrada "suja" (separadores/caixa) é canonizada antes do match.
    const dirty = await queryService.listSamples({ padroes: ['l 30 p 17'] });
    assert.deepEqual(
      dirty.items.map((item) => item.id),
      [alvo]
    );
  });

  test('filtros aspecto/catacao/certif casam pelo JSON path e aceitam múltiplos valores (OR)', async () => {
    const a = await createSample({
      classification: { aspecto: 'BOM', catacao: '12', certif: 'ORGANICO' },
    });
    const b = await createSample({
      classification: { aspecto: 'REGULAR', catacao: '30', certif: 'RFA' },
    });
    await createSample({ classification: { aspecto: 'RUIM' } });

    const porAspecto = await queryService.listSamples({ aspectos: ['BOM', 'REGULAR'] });
    assert.deepEqual(porAspecto.items.map((item) => item.id).sort(), [a, b].sort());

    const porCatacao = await queryService.listSamples({ catacoes: ['30'] });
    assert.deepEqual(
      porCatacao.items.map((item) => item.id),
      [b]
    );

    const porCertif = await queryService.listSamples({ certificados: ['ORGANICO'] });
    assert.deepEqual(
      porCertif.items.map((item) => item.id),
      [a]
    );
  });

  test('listClassificationValues: distintos, canônicos, ordenados; campo inválido → 422', async () => {
    await createSample({ classification: { padrao: 'L30-P17' } });
    await createSample({ classification: { padrao: 'L19-P16' } });
    await createSample({ classification: { padrao: 'L30-P17' } }); // duplicado
    await createSample(); // sem classificação

    const result = await queryService.listClassificationValues('padrao');
    assert.deepEqual(result.values, ['L19-P16', 'L30-P17']);

    await assert.rejects(
      () => queryService.listClassificationValues('nope'),
      (error) => error instanceof HttpError && error.status === 422
    );
  });

  test('filtro isBlend: só ligas', async () => {
    const liga = await createSample({ isBlend: true });
    await createSample({ isBlend: false });

    const result = await queryService.listSamples({ isBlend: true });
    assert.deepEqual(
      result.items.map((item) => item.id),
      [liga]
    );
  });

  test('eligibleForBlend enriquece com eligibility + committedSacks (e sem o flag, não)', async () => {
    const comSaldo = await createSample({ declaredSacks: 50 });
    const semSaldo = await createSample({ declaredSacks: 0 });

    const enriched = await queryService.listSamples({ eligibleForBlend: true });
    const byId = new Map(enriched.items.map((item) => [item.id, item]));

    // Não filtra inelegíveis fora — a UI acinzenta.
    assert.equal(enriched.items.length, 2);
    assert.deepEqual(byId.get(comSaldo).eligibility, { eligible: true, reason: null });
    assert.deepEqual(byId.get(semSaldo).eligibility, { eligible: false, reason: 'NO_BALANCE' });
    assert.equal(byId.get(comSaldo).committedSacks, 0);

    const plain = await queryService.listSamples({});
    for (const item of plain.items) {
      assert.equal('eligibility' in item, false);
    }
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
