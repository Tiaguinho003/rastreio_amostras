import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

import { HttpError } from '../src/contracts/errors.js';
import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { registrationConfirmedEvent } from './helpers/event-builders.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const store = new PrismaEventStore(prisma);
  const eventService = new EventContractDbService({ store });
  const queryService = new SampleQueryService({ prisma });

  // Mock clientService: aceita resolveOwnerBinding com cliente real ou nao.
  // createBlend so chama quando ownerClientId esta definido — pode mockar
  // retornando snapshot fake.
  const clientServiceMock = {
    async resolveOwnerBinding({ ownerClientId, ownerUnitId }) {
      return {
        ownerClientId,
        ownerUnitId: ownerUnitId ?? null,
        displayName: `Cliente ${ownerClientId.slice(0, 8)}`,
      };
    },
  };

  const userServiceMock = {
    async findUserOrNull(userId) {
      return {
        id: userId,
        fullName: 'Usuário Teste',
        username: 'teste',
        status: 'ACTIVE',
      };
    },
  };

  const commandService = new SampleCommandService({
    eventService,
    queryService,
    clientService: clientServiceMock,
    userService: userServiceMock,
  });

  const actor = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'REGISTRATION',
    source: 'api',
    requestId: randomUUID(),
  };

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, sample_blend_component, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  // Helper: cria sample CLASSIFIED com REGISTRATION_CONFIRMED real
  // (necessario porque triggers do event store exigem 1o evento como
  // REGISTRATION_CONFIRMED). Apos o evento, faz UPDATE direto pra
  // CLASSIFIED bypassa fluxo de classificacao completo (esses testes
  // focam em createBlend/revertBlend/invalidateSample, nao em
  // classificacao).
  async function createClassifiedSample({ id, lotNumber, declaredSacks = 10 }) {
    await eventService.appendEvent(
      registrationConfirmedEvent(id, {
        payload: {
          sampleLotNumber: lotNumber,
          declared: {
            owner: 'Produtor Teste',
            sacks: declaredSacks,
            harvest: '24/25',
            originLot: 'LOTE-ORIGEM',
          },
        },
      })
    );
    await prisma.sample.update({
      where: { id },
      data: { status: 'CLASSIFIED' },
    });
  }

  async function createClassifiedBlend({ id, lotNumber, declaredSacks }) {
    await eventService.appendEvent(
      registrationConfirmedEvent(id, {
        payload: {
          sampleLotNumber: lotNumber,
          declared: {
            owner: null,
            sacks: declaredSacks,
            harvest: 'MISTA',
            originLot: null,
          },
        },
      })
    );
    await prisma.sample.update({
      where: { id },
      data: { status: 'CLASSIFIED', isBlend: true },
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

  // Liga A2.2 — createBlend happy path

  test('createBlend creates a blend with 2 classified origins (happy path)', async () => {
    const origin1Id = randomUUID();
    const origin2Id = randomUUID();
    await createClassifiedSample({ id: origin1Id, lotNumber: '8001', declaredSacks: 50 });
    await createClassifiedSample({ id: origin2Id, lotNumber: '8002', declaredSacks: 70 });

    const result = await commandService.createBlend(
      {
        clientDraftId: 'draft-blend-001',
        components: [
          { originSampleId: origin1Id, contributedSacks: 30 },
          { originSampleId: origin2Id, contributedSacks: 40 },
        ],
        // Sem ownerClientId — happy path testa criacao sem dono (mais simples,
        // evita criar Client real pra satisfazer FK). Caso com dono e testado
        // separadamente noutro teste.
        harvest: 'MISTA',
        sampleLotNumber: '8003',
      },
      actor
    );

    assert.equal(result.statusCode, 201);
    assert.equal(result.idempotent, false);
    assert.equal(result.events.length, 2);
    assert.equal(result.events[0].eventType, 'REGISTRATION_CONFIRMED');
    assert.equal(result.events[1].eventType, 'BLEND_CREATED');

    const blendSample = await prisma.sample.findUnique({ where: { id: result.sample.id } });
    assert.equal(blendSample.isBlend, true);
    assert.equal(blendSample.declaredSacks, 70);
    assert.equal(blendSample.internalLotNumber, '8003');
    assert.equal(blendSample.declaredHarvest, 'MISTA');

    const components = await prisma.sampleBlendComponent.findMany({
      where: { sampleId: result.sample.id },
      orderBy: { contributedSacks: 'asc' },
    });
    assert.equal(components.length, 2);
    assert.equal(components[0].contributedSacks, 30);
    assert.equal(components[0].originSampleId, origin1Id);
    assert.equal(components[1].contributedSacks, 40);
    assert.equal(components[1].originSampleId, origin2Id);
  });

  test('createBlend creates blend without owner (carteira da corretora — F3.A)', async () => {
    const origin1Id = randomUUID();
    const origin2Id = randomUUID();
    await createClassifiedSample({ id: origin1Id, lotNumber: '8010', declaredSacks: 20 });
    await createClassifiedSample({ id: origin2Id, lotNumber: '8011', declaredSacks: 30 });

    const result = await commandService.createBlend(
      {
        clientDraftId: 'draft-blend-no-owner',
        components: [
          { originSampleId: origin1Id, contributedSacks: 20 },
          { originSampleId: origin2Id, contributedSacks: 30 },
        ],
        // ownerClientId omitido — liga sem dono (F3.1 + F3.A)
        harvest: 'MISTA',
        sampleLotNumber: '8012',
      },
      actor
    );

    assert.equal(result.statusCode, 201);

    const blendSample = await prisma.sample.findUnique({ where: { id: result.sample.id } });
    assert.equal(blendSample.ownerClientId, null);
    assert.equal(blendSample.declaredOwner, null);
    assert.equal(blendSample.isBlend, true);
  });

  test('createBlend rejects fewer than 2 components', async () => {
    const origin1Id = randomUUID();
    await createClassifiedSample({ id: origin1Id, lotNumber: '8020' });

    await assert.rejects(
      commandService.createBlend(
        {
          clientDraftId: 'draft-too-few',
          components: [{ originSampleId: origin1Id, contributedSacks: 5 }],
          harvest: 'MISTA',
        },
        actor
      ),
      (error) => error instanceof HttpError && error.status === 422
    );
  });

  test('createBlend rejects duplicate origins in components', async () => {
    const origin1Id = randomUUID();
    await createClassifiedSample({ id: origin1Id, lotNumber: '8030' });

    await assert.rejects(
      commandService.createBlend(
        {
          clientDraftId: 'draft-dup',
          components: [
            { originSampleId: origin1Id, contributedSacks: 5 },
            { originSampleId: origin1Id, contributedSacks: 3 },
          ],
          harvest: 'MISTA',
        },
        actor
      ),
      (error) => error instanceof HttpError && /Duplicate origin/.test(error.message)
    );
  });

  test('createBlend accepts origin in REGISTRATION_CONFIRMED (F1.4 relaxed 2026-05-19)', async () => {
    const origin1Id = randomUUID();
    const origin2Id = randomUUID();
    // Origin1 fica em REGISTRATION_CONFIRMED (não classificado) — antes
    // era rejeitado; agora deve ser aceito.
    await prisma.sample.create({
      data: {
        id: origin1Id,
        internalLotNumber: '8040',
        status: 'REGISTRATION_CONFIRMED',
        commercialStatus: 'OPEN',
        version: 1,
        lastEventSequence: 1,
        declaredOwner: 'Produtor',
        declaredSacks: 10,
        declaredHarvest: '24/25',
        soldSacks: 0,
        lostSacks: 0,
        isBlend: false,
      },
    });
    await createClassifiedSample({ id: origin2Id, lotNumber: '8041' });

    const result = await commandService.createBlend(
      {
        clientDraftId: 'draft-mixed-statuses',
        components: [
          { originSampleId: origin1Id, contributedSacks: 5 },
          { originSampleId: origin2Id, contributedSacks: 3 },
        ],
        harvest: 'MISTA',
      },
      actor
    );

    assert.equal(result.statusCode, 201);
    assert.equal(result.sample.isBlend, true);
    assert.equal(result.sample.declared.sacks, 8);
  });

  test('createBlend rejects origin in INVALIDATED status', async () => {
    const origin1Id = randomUUID();
    const origin2Id = randomUUID();
    await createClassifiedSample({ id: origin1Id, lotNumber: '8042' });
    await createClassifiedSample({ id: origin2Id, lotNumber: '8043' });
    // Invalida origin1 — appendEvent do registrationConfirmedEvent deixou
    // version=1; UPDATE no createClassifiedSample nao incrementa version.
    await commandService.invalidateSample(
      {
        sampleId: origin1Id,
        reasonCode: 'OTHER',
        reasonText: 'test',
        expectedVersion: 1,
      },
      actor
    );

    await assert.rejects(
      commandService.createBlend(
        {
          clientDraftId: 'draft-invalidated-origin',
          components: [
            { originSampleId: origin1Id, contributedSacks: 5 },
            { originSampleId: origin2Id, contributedSacks: 3 },
          ],
          harvest: 'MISTA',
        },
        actor
      ),
      (error) => error instanceof HttpError && /is INVALIDATED/.test(error.message)
    );
  });

  test('createBlend rejects contributedSacks > availableSacks', async () => {
    const origin1Id = randomUUID();
    const origin2Id = randomUUID();
    await createClassifiedSample({ id: origin1Id, lotNumber: '8050', declaredSacks: 10 });
    await createClassifiedSample({ id: origin2Id, lotNumber: '8051', declaredSacks: 20 });

    await assert.rejects(
      commandService.createBlend(
        {
          clientDraftId: 'draft-oversacks',
          components: [
            { originSampleId: origin1Id, contributedSacks: 99 }, // > 10
            { originSampleId: origin2Id, contributedSacks: 10 },
          ],
          harvest: 'MISTA',
        },
        actor
      ),
      (error) => error instanceof HttpError && /exceeds availableSacks/.test(error.message)
    );
  });

  test('createBlend enforces F7.7 (blend-in-blend = 100% obrigatorio)', async () => {
    const innerBlendId = randomUUID();
    const otherOriginId = randomUUID();
    await createClassifiedBlend({ id: innerBlendId, lotNumber: '8060', declaredSacks: 100 });
    await createClassifiedSample({ id: otherOriginId, lotNumber: '8061', declaredSacks: 30 });

    // Tentativa: 50 sacas (parcial) da liga interna — deve falhar.
    await assert.rejects(
      commandService.createBlend(
        {
          clientDraftId: 'draft-f77-partial',
          components: [
            { originSampleId: innerBlendId, contributedSacks: 50 }, // != 100
            { originSampleId: otherOriginId, contributedSacks: 20 },
          ],
          harvest: 'MISTA',
        },
        actor
      ),
      (error) => error instanceof HttpError && /F7\.7|origin .+ is a blend/i.test(error.message)
    );

    // Já 100% (= declaredSacks) deve passar.
    const result = await commandService.createBlend(
      {
        clientDraftId: 'draft-f77-full',
        components: [
          { originSampleId: innerBlendId, contributedSacks: 100 }, // 100% = declaredSacks
          { originSampleId: otherOriginId, contributedSacks: 20 },
        ],
        harvest: 'MISTA',
        sampleLotNumber: '8062',
      },
      actor
    );
    assert.equal(result.statusCode, 201);
    assert.equal(result.sample.declared.sacks, 120);
  });

  test('createBlend is idempotent on retry with same clientDraftId', async () => {
    const origin1Id = randomUUID();
    const origin2Id = randomUUID();
    await createClassifiedSample({ id: origin1Id, lotNumber: '8070', declaredSacks: 30 });
    await createClassifiedSample({ id: origin2Id, lotNumber: '8071', declaredSacks: 40 });

    const firstResult = await commandService.createBlend(
      {
        clientDraftId: 'draft-idem',
        components: [
          { originSampleId: origin1Id, contributedSacks: 15 },
          { originSampleId: origin2Id, contributedSacks: 25 },
        ],
        harvest: 'MISTA',
        sampleLotNumber: '8072',
      },
      actor
    );
    assert.equal(firstResult.statusCode, 201);

    // Retry com mesmo clientDraftId — deve retornar o mesmo sampleId,
    // idempotent=true, sem criar segundo blend.
    const secondResult = await commandService.createBlend(
      {
        clientDraftId: 'draft-idem',
        components: [
          { originSampleId: origin1Id, contributedSacks: 15 },
          { originSampleId: origin2Id, contributedSacks: 25 },
        ],
        harvest: 'MISTA',
        sampleLotNumber: '8073', // ignorado em retry
      },
      actor
    );
    assert.equal(secondResult.statusCode, 200);
    assert.equal(secondResult.idempotent, true);
    assert.equal(secondResult.sample.id, firstResult.sample.id);

    // Só uma liga foi criada.
    const blends = await prisma.sample.findMany({ where: { isBlend: true } });
    assert.equal(blends.length, 1);
  });

  // Liga A2.3 — revertBlend

  async function createBlendForRevert(lotBase) {
    const origin1Id = randomUUID();
    const origin2Id = randomUUID();
    await createClassifiedSample({ id: origin1Id, lotNumber: `${lotBase}0`, declaredSacks: 30 });
    await createClassifiedSample({ id: origin2Id, lotNumber: `${lotBase}1`, declaredSacks: 40 });
    const result = await commandService.createBlend(
      {
        clientDraftId: `draft-revert-${lotBase}`,
        components: [
          { originSampleId: origin1Id, contributedSacks: 15 },
          { originSampleId: origin2Id, contributedSacks: 20 },
        ],
        harvest: 'MISTA',
        sampleLotNumber: `${lotBase}2`,
      },
      actor
    );
    return result.sample;
  }

  test('revertBlend transitions blend to INVALIDATED and preserves composition', async () => {
    const blend = await createBlendForRevert('900');

    const result = await commandService.revertBlend(
      {
        blendId: blend.id,
        reasonText: 'cancelado por engano',
        expectedVersion: blend.version,
      },
      actor
    );

    assert.equal(result.statusCode, 200);
    assert.equal(result.events.length, 2);
    assert.equal(result.events[0].eventType, 'BLEND_REVERTED');
    assert.equal(result.events[1].eventType, 'SAMPLE_INVALIDATED');

    const dbSample = await prisma.sample.findUnique({ where: { id: blend.id } });
    assert.equal(dbSample.status, 'INVALIDATED');
    assert.equal(dbSample.isBlend, true);

    // Composição preservada (F8.3).
    const components = await prisma.sampleBlendComponent.findMany({
      where: { sampleId: blend.id },
    });
    assert.equal(components.length, 2);
  });

  test('revertBlend rejects non-blend sample', async () => {
    const normalSampleId = randomUUID();
    await createClassifiedSample({ id: normalSampleId, lotNumber: '9010' });

    await assert.rejects(
      commandService.revertBlend({ blendId: normalSampleId, expectedVersion: 1 }, actor),
      (error) => error instanceof HttpError && /is not a blend/.test(error.message)
    );
  });

  test('revertBlend rejects blend already INVALIDATED', async () => {
    const blend = await createBlendForRevert('902');
    // Invalida diretamente via DB pra simular ja-invalidated.
    await prisma.sample.update({
      where: { id: blend.id },
      data: { status: 'INVALIDATED' },
    });

    await assert.rejects(
      commandService.revertBlend({ blendId: blend.id, expectedVersion: blend.version }, actor),
      (error) =>
        error instanceof HttpError &&
        /must be REGISTRATION_CONFIRMED or CLASSIFIED/.test(error.message)
    );
  });

  test('revertBlend rejects blend with sold or lost sacks (F8.4)', async () => {
    const blend = await createBlendForRevert('903');
    // Simula venda direta no DB pra forçar soldSacks > 0.
    await prisma.sample.update({
      where: { id: blend.id },
      data: { soldSacks: 10 },
    });

    await assert.rejects(
      commandService.revertBlend({ blendId: blend.id, expectedVersion: blend.version }, actor),
      (error) => error instanceof HttpError && /sold or lost sacks/.test(error.message)
    );
  });

  // Liga A2.5 — invalidateSample com SAMPLE_HAS_ACTIVE_BLENDS

  test('invalidateSample rejects origin participating in active blend (F7.2/F7.D)', async () => {
    const origin1Id = randomUUID();
    const origin2Id = randomUUID();
    await createClassifiedSample({ id: origin1Id, lotNumber: '9100', declaredSacks: 20 });
    await createClassifiedSample({ id: origin2Id, lotNumber: '9101', declaredSacks: 30 });

    // Cria liga ativa contendo origin1.
    await commandService.createBlend(
      {
        clientDraftId: 'draft-block-invalidate',
        components: [
          { originSampleId: origin1Id, contributedSacks: 10 },
          { originSampleId: origin2Id, contributedSacks: 15 },
        ],
        harvest: 'MISTA',
        sampleLotNumber: '9102',
      },
      actor
    );

    // Tenta invalidar origin1 → deve falhar com SAMPLE_HAS_ACTIVE_BLENDS.
    let caughtError = null;
    try {
      await commandService.invalidateSample(
        {
          sampleId: origin1Id,
          reasonCode: 'OTHER',
          reasonText: 'tentativa',
          expectedVersion: 1,
        },
        actor
      );
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError instanceof HttpError, 'should throw HttpError');
    assert.equal(caughtError.status, 409);
    assert.equal(caughtError.details?.code, 'SAMPLE_HAS_ACTIVE_BLENDS');
    assert.ok(Array.isArray(caughtError.details?.activeBlends));
    assert.equal(caughtError.details.activeBlends.length, 1);
    assert.equal(caughtError.details.activeBlends[0].lotNumber, '9102');
    assert.equal(caughtError.details.activeBlends[0].contributedSacks, 10);
  });

  test('invalidateSample allows origin when its blend was already INVALIDATED', async () => {
    const origin1Id = randomUUID();
    const origin2Id = randomUUID();
    await createClassifiedSample({ id: origin1Id, lotNumber: '9200', declaredSacks: 15 });
    await createClassifiedSample({ id: origin2Id, lotNumber: '9201', declaredSacks: 25 });

    const blendResult = await commandService.createBlend(
      {
        clientDraftId: 'draft-then-revert',
        components: [
          { originSampleId: origin1Id, contributedSacks: 5 },
          { originSampleId: origin2Id, contributedSacks: 10 },
        ],
        harvest: 'MISTA',
        sampleLotNumber: '9202',
      },
      actor
    );

    // Reverte a liga.
    await commandService.revertBlend(
      {
        blendId: blendResult.sample.id,
        expectedVersion: blendResult.sample.version,
      },
      actor
    );

    // Agora invalidar origin1 deve passar (a liga ja esta INVALIDATED,
    // findActiveBlendsContainingOrigin filtra ela fora).
    // version=1 porque createClassifiedSample cria via REGISTRATION_CONFIRMED
    // (v=1) + UPDATE direto pra CLASSIFIED (sem bump de version).
    const result = await commandService.invalidateSample(
      {
        sampleId: origin1Id,
        reasonCode: 'OTHER',
        reasonText: 'sem mais usos',
        expectedVersion: 1,
      },
      actor
    );

    assert.equal(result.statusCode, 201);

    const dbSample = await prisma.sample.findUnique({ where: { id: origin1Id } });
    assert.equal(dbSample.status, 'INVALIDATED');
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
