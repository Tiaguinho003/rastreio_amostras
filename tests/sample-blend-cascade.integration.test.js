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

  const clientServiceMock = {
    async resolveOwnerBinding({ ownerClientId, ownerUnitId }) {
      return {
        ownerClientId,
        ownerUnitId: ownerUnitId ?? null,
        displayName: `Cliente ${ownerClientId.slice(0, 8)}`,
      };
    },
    async resolveBuyerBinding({ buyerClientId, buyerUnitId }) {
      return {
        buyerClientId,
        buyerUnitId: buyerUnitId ?? null,
        buyerClient: { id: buyerClientId, displayName: `Comprador ${buyerClientId.slice(0, 8)}` },
        buyerUnit: null,
      };
    },
  };
  const userServiceMock = {
    async findUserOrNull(userId) {
      return { id: userId, fullName: 'Usuário', username: 't', status: 'ACTIVE' };
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
    role: 'COMMERCIAL',
    source: 'api',
    requestId: randomUUID(),
  };

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, sample_blend_component, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  // Cria cliente fictício no banco pra satisfazer FK quando vamos vender
  // pra um buyerClientId (sample_movement.buyer_client_id REFERENCES client).
  // Cria cliente INACTIVE pra satisfazer FK do sample_movement.buyer_client_id
  // sem precisar passar pelo trigger DEFERRABLE
  // trg_assert_client_has_commercial_user_on_status (que so roda quando status
  // passa para ACTIVE). Os testes nao precisam que o cliente seja ACTIVE — so
  // existir.
  async function createBuyerClient(id) {
    await prisma.client.create({
      data: {
        id,
        personType: 'PF',
        fullName: `Comprador ${id.slice(0, 8)}`,
        status: 'INACTIVE',
        isBuyer: true, // satisfaz chk_client_role_flags (is_buyer OR is_seller)
      },
    });
  }

  async function createClassifiedSample({ id, lotNumber, declaredSacks = 10 }) {
    await eventService.appendEvent(
      registrationConfirmedEvent(id, {
        payload: {
          sampleLotNumber: lotNumber,
          declared: {
            owner: 'Produtor',
            sacks: declaredSacks,
            harvest: '24/25',
            originLot: 'LOTE-ORIGEM',
          },
        },
      })
    );
    await prisma.sample.update({ where: { id }, data: { status: 'CLASSIFIED' } });
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

  // Liga A2.4 — cascata recursiva

  test('createSampleMovement SALE on blend propagates to 2 direct origins', async () => {
    const origin1Id = randomUUID();
    const origin2Id = randomUUID();
    const buyerId = randomUUID();
    await createClassifiedSample({ id: origin1Id, lotNumber: '10001', declaredSacks: 50 });
    await createClassifiedSample({ id: origin2Id, lotNumber: '10002', declaredSacks: 30 });
    await createBuyerClient(buyerId);

    const blend = await commandService.createBlend(
      {
        clientDraftId: 'draft-cascade-1',
        components: [
          { originSampleId: origin1Id, contributedSacks: 20 },
          { originSampleId: origin2Id, contributedSacks: 25 },
        ],
        harvest: 'MISTA',
        sampleLotNumber: '10003',
      },
      actor
    );

    // Vender a liga inteira.
    const result = await commandService.createSampleMovement(
      {
        sampleId: blend.sample.id,
        movementType: 'SALE',
        quantitySacks: 0, // ignorado em cascata — usa 100%
        movementDate: '2026-05-20',
        buyerClientId: buyerId,
        expectedVersion: blend.sample.version,
      },
      actor
    );

    assert.equal(result.statusCode, 201);
    // 3 eventos: raiz (liga) + 2 origens.
    assert.equal(result.events.length, 3);
    assert.equal(result.events[0].sampleId, blend.sample.id);
    assert.equal(result.events[0].eventType, 'SALE_CREATED');

    // Movimentos criados: 1 na liga + 2 nas origens = 3.
    const movements = await prisma.sampleMovement.findMany();
    assert.equal(movements.length, 3);

    // Origens com soldSacks > 0.
    const o1 = await prisma.sample.findUnique({ where: { id: origin1Id } });
    const o2 = await prisma.sample.findUnique({ where: { id: origin2Id } });
    assert.equal(o1.soldSacks, 20);
    assert.equal(o2.soldSacks, 25);

    // Liga: soldSacks = declaredSacks (45) -> commercialStatus SOLD.
    const liga = await prisma.sample.findUnique({ where: { id: blend.sample.id } });
    assert.equal(liga.soldSacks, 45);
    assert.equal(liga.commercialStatus, 'SOLD');

    // Causation chain: filhos têm causationId apontando pra raiz.
    const rootEventId = result.events[0].eventId;
    const childEvents = result.events.slice(1);
    childEvents.forEach((event) => {
      assert.equal(event.causationId, rootEventId);
    });

    // Buyer replicado em todos.
    childEvents.forEach((event) => {
      assert.equal(event.payload.buyerClientId, buyerId);
    });
  });

  test('createSampleMovement SALE on blend-of-blend propagates 3 levels (Liga em Liga)', async () => {
    // x1, x2 -> A; A (100%, F7.7) + Y -> B; vender B
    const x1 = randomUUID();
    const x2 = randomUUID();
    const y = randomUUID();
    const buyerId = randomUUID();

    await createClassifiedSample({ id: x1, lotNumber: '10100', declaredSacks: 10 });
    await createClassifiedSample({ id: x2, lotNumber: '10101', declaredSacks: 15 });
    await createClassifiedSample({ id: y, lotNumber: '10102', declaredSacks: 20 });
    await createBuyerClient(buyerId);

    // Cria liga A com x1 + x2.
    const ligaA = await commandService.createBlend(
      {
        clientDraftId: 'draft-A',
        components: [
          { originSampleId: x1, contributedSacks: 10 },
          { originSampleId: x2, contributedSacks: 15 },
        ],
        harvest: 'MISTA',
        sampleLotNumber: '10103',
      },
      actor
    );
    // CLASSIFY A direto via DB (esses tests focam em cascade, nao em
    // classificacao do blend).
    await prisma.sample.update({ where: { id: ligaA.sample.id }, data: { status: 'CLASSIFIED' } });

    // Cria liga B com A (100%, declaredSacks=25 — F7.7) + Y.
    const ligaB = await commandService.createBlend(
      {
        clientDraftId: 'draft-B',
        components: [
          { originSampleId: ligaA.sample.id, contributedSacks: 25 }, // 100% de A
          { originSampleId: y, contributedSacks: 15 },
        ],
        harvest: 'MISTA',
        sampleLotNumber: '10104',
      },
      actor
    );

    // Vender B inteira.
    const result = await commandService.createSampleMovement(
      {
        sampleId: ligaB.sample.id,
        movementType: 'SALE',
        quantitySacks: 0,
        movementDate: '2026-05-20',
        buyerClientId: buyerId,
        expectedVersion: ligaB.sample.version,
      },
      actor
    );

    assert.equal(result.statusCode, 201);
    // 5 eventos: B (raiz) + A + Y (nivel 1) + x1 + x2 (nivel 2).
    assert.equal(result.events.length, 5);

    // x1 e x2 receberam venda em cascata via A (não direto via B).
    const x1Sample = await prisma.sample.findUnique({ where: { id: x1 } });
    const x2Sample = await prisma.sample.findUnique({ where: { id: x2 } });
    assert.equal(x1Sample.soldSacks, 10);
    assert.equal(x2Sample.soldSacks, 15);

    // A vendida 100% (raiz cascade via B).
    const aSample = await prisma.sample.findUnique({ where: { id: ligaA.sample.id } });
    assert.equal(aSample.soldSacks, 25);
    assert.equal(aSample.commercialStatus, 'SOLD');

    // Y vendido 100% (15 sacas direto de B).
    const ySample = await prisma.sample.findUnique({ where: { id: y } });
    assert.equal(ySample.soldSacks, 15);

    // Causation chain: filhos de A apontam pra evento de A; A aponta
    // pra evento de B; B é raiz (causationId null).
    const eventBySampleId = new Map(result.events.map((e) => [e.sampleId, e]));
    const eventB = eventBySampleId.get(ligaB.sample.id);
    const eventA = eventBySampleId.get(ligaA.sample.id);
    const eventY = eventBySampleId.get(y);
    const eventX1 = eventBySampleId.get(x1);
    const eventX2 = eventBySampleId.get(x2);

    assert.equal(eventB.causationId, null);
    assert.equal(eventA.causationId, eventB.eventId);
    assert.equal(eventY.causationId, eventB.eventId);
    assert.equal(eventX1.causationId, eventA.eventId);
    assert.equal(eventX2.causationId, eventA.eventId);
  });

  test('createSampleMovement on blend hard-blocks when descendant has prior commercial movement (F7.6)', async () => {
    const origin1Id = randomUUID();
    const origin2Id = randomUUID();
    const buyerId = randomUUID();
    await createClassifiedSample({ id: origin1Id, lotNumber: '10200', declaredSacks: 10 });
    await createClassifiedSample({ id: origin2Id, lotNumber: '10201', declaredSacks: 15 });
    await createBuyerClient(buyerId);

    const blend = await commandService.createBlend(
      {
        clientDraftId: 'draft-block',
        components: [
          { originSampleId: origin1Id, contributedSacks: 5 },
          { originSampleId: origin2Id, contributedSacks: 8 },
        ],
        harvest: 'MISTA',
        sampleLotNumber: '10202',
      },
      actor
    );

    // Simula venda direta na origin1 (fora da liga) — bloqueando a liga.
    await prisma.sample.update({
      where: { id: origin1Id },
      data: { soldSacks: 3 },
    });

    let caughtError = null;
    try {
      await commandService.createSampleMovement(
        {
          sampleId: blend.sample.id,
          movementType: 'SALE',
          quantitySacks: 0,
          movementDate: '2026-05-20',
          buyerClientId: buyerId,
          expectedVersion: blend.sample.version,
        },
        actor
      );
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError instanceof HttpError);
    assert.equal(caughtError.status, 409);
    assert.equal(caughtError.details?.code, 'BLEND_HAS_BLOCKED_DESCENDANTS');
    assert.equal(caughtError.details.blockedDescendants.length, 1);
    assert.equal(caughtError.details.blockedDescendants[0].sampleId, origin1Id);
  });

  test('createSampleMovement LOSS on blend propagates lossReasonText to all descendants (F7.4)', async () => {
    const origin1Id = randomUUID();
    const origin2Id = randomUUID();
    await createClassifiedSample({ id: origin1Id, lotNumber: '10300', declaredSacks: 12 });
    await createClassifiedSample({ id: origin2Id, lotNumber: '10301', declaredSacks: 18 });

    const blend = await commandService.createBlend(
      {
        clientDraftId: 'draft-loss',
        components: [
          { originSampleId: origin1Id, contributedSacks: 6 },
          { originSampleId: origin2Id, contributedSacks: 9 },
        ],
        harvest: 'MISTA',
        sampleLotNumber: '10302',
      },
      actor
    );

    const result = await commandService.createSampleMovement(
      {
        sampleId: blend.sample.id,
        movementType: 'LOSS',
        quantitySacks: 0,
        movementDate: '2026-05-20',
        lossReasonText: 'umidade',
        expectedVersion: blend.sample.version,
      },
      actor
    );

    assert.equal(result.statusCode, 201);
    assert.equal(result.events.length, 3);
    result.events.forEach((event) => {
      assert.equal(event.eventType, 'LOSS_RECORDED');
      assert.equal(event.payload.lossReasonText, 'umidade');
    });

    const o1 = await prisma.sample.findUnique({ where: { id: origin1Id } });
    const o2 = await prisma.sample.findUnique({ where: { id: origin2Id } });
    assert.equal(o1.lostSacks, 6);
    assert.equal(o2.lostSacks, 9);
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
