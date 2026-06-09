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

  async function createBuyerClient(id) {
    await prisma.client.create({
      data: {
        id,
        personType: 'PF',
        fullName: `Comprador ${id.slice(0, 8)}`,
        status: 'INACTIVE',
        isBuyer: true,
      },
    });
  }

  // Cria um lote CLASSIFIED com a safra dada (a derivacao da liga e o foco
  // dos testes — por isso harvest e parametrizavel).
  async function createSample({ id, lotNumber, harvest, declaredSacks = 50 }) {
    await eventService.appendEvent(
      registrationConfirmedEvent(id, {
        payload: {
          sampleLotNumber: lotNumber,
          declared: {
            owner: 'Produtor',
            sacks: declaredSacks,
            harvest,
            originLot: 'LOTE-ORIGEM',
          },
        },
      })
    );
    await prisma.sample.update({ where: { id }, data: { status: 'CLASSIFIED' } });
  }

  // Cria uma liga derivando a safra das origens (SEM override input.harvest).
  async function createBlend({ clientDraftId, components, lotNumber }) {
    return commandService.createBlend(
      { clientDraftId, components, sampleLotNumber: lotNumber },
      actor
    );
  }

  async function editHarvest(sampleId, newHarvest, { confirm = false, expectedVersion } = {}) {
    const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
    return commandService.updateRegistration(
      {
        sampleId,
        expectedVersion: expectedVersion ?? sample.version,
        after: { declared: { harvest: newHarvest } },
        reasonCode: 'DATA_FIX',
        reasonText: 'Ajuste de safra',
        confirmHarvestPropagation: confirm,
      },
      actor
    );
  }

  async function harvestOf(sampleId) {
    const row = await prisma.sample.findUnique({ where: { id: sampleId } });
    return row.declaredHarvest;
  }

  async function blendUpdateEvents(blendId) {
    return prisma.sampleEvent.findMany({
      where: { sampleId: blendId, eventType: 'REGISTRATION_UPDATED' },
      orderBy: { sequenceNumber: 'asc' },
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

  // 1. Propagacao simples A -> B
  test('edita safra de origem propaga para a liga (com confirmacao) + causationId', async () => {
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createSample({ id: o1, lotNumber: '20001', harvest: '24/25' });
    await createSample({ id: o2, lotNumber: '20002', harvest: '24/25' });
    const blend = await createBlend({
      clientDraftId: 'd-simple',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
      ],
      lotNumber: '20003',
    });
    assert.equal(await harvestOf(blend.sample.id), '24/25');

    const result = await editHarvest(o1, '25/26', { confirm: true });

    assert.equal(await harvestOf(blend.sample.id), '24/25, 25/26');
    const events = await blendUpdateEvents(blend.sample.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].causationId, result.event.eventId);
    assert.equal(events[0].payload.after.declared.harvest, '24/25, 25/26');
  });

  // 2. Recursiva A -> B -> C (Map em memoria: C usa o valor recalculado de B)
  test('propaga recursivamente liga-de-liga em ordem topologica', async () => {
    const a = randomUUID();
    const x = randomUUID();
    const z = randomUUID();
    await createSample({ id: a, lotNumber: '21001', harvest: '24/25' });
    await createSample({ id: x, lotNumber: '21002', harvest: '23/24' });
    await createSample({ id: z, lotNumber: '21003', harvest: '22/23' });
    const b = await createBlend({
      clientDraftId: 'd-rec-b',
      components: [
        { originSampleId: a, contributedSacks: 10 },
        { originSampleId: x, contributedSacks: 10 },
      ],
      lotNumber: '21004',
    });
    assert.equal(await harvestOf(b.sample.id), '23/24, 24/25');
    const c = await createBlend({
      clientDraftId: 'd-rec-c',
      components: [
        { originSampleId: b.sample.id, contributedSacks: 20 },
        { originSampleId: z, contributedSacks: 10 },
      ],
      lotNumber: '21005',
    });
    assert.equal(await harvestOf(c.sample.id), '22/23, 23/24, 24/25');

    await editHarvest(a, '25/26', { confirm: true });

    // B recalcula direto; C usa o valor JA recalculado de B (Map), nao o antigo.
    assert.equal(await harvestOf(b.sample.id), '23/24, 25/26');
    assert.equal(await harvestOf(c.sample.id), '22/23, 23/24, 25/26');
    assert.equal((await blendUpdateEvents(b.sample.id)).length, 1);
    assert.equal((await blendUpdateEvents(c.sample.id)).length, 1);
  });

  // 3. No-op intermediario: safra da liga nao muda -> nenhum evento
  test('nao emite evento quando a safra recalculada da liga nao muda', async () => {
    const o1 = randomUUID();
    const o2 = randomUUID();
    const o3 = randomUUID();
    await createSample({ id: o1, lotNumber: '22001', harvest: '24/25' });
    await createSample({ id: o2, lotNumber: '22002', harvest: '25/26' });
    await createSample({ id: o3, lotNumber: '22003', harvest: '24/25' });
    const blend = await createBlend({
      clientDraftId: 'd-noop',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
        { originSampleId: o3, contributedSacks: 10 },
      ],
      lotNumber: '22004',
    });
    assert.equal(await harvestOf(blend.sample.id), '24/25, 25/26');

    // o3 vai de 24/25 para 25/26 — o conjunto {24/25,25/26} permanece (o1 ainda
    // tem 24/25). A liga nao muda, entao nao ha liga afetada nem 409.
    await editHarvest(o3, '25/26', { confirm: false });

    assert.equal(await harvestOf(o3), '25/26');
    assert.equal(await harvestOf(blend.sample.id), '24/25, 25/26');
    assert.equal((await blendUpdateEvents(blend.sample.id)).length, 0);
  });

  // 4. Diamante A->B->D e A->C->D: D recebe UM evento, sem version conflict
  test('topologia em diamante recalcula a liga-topo uma unica vez (dedup)', async () => {
    const a = randomUUID();
    const x = randomUUID();
    const y = randomUUID();
    await createSample({ id: a, lotNumber: '23001', harvest: '24/25', declaredSacks: 100 });
    await createSample({ id: x, lotNumber: '23002', harvest: '23/24', declaredSacks: 100 });
    await createSample({ id: y, lotNumber: '23003', harvest: '22/23', declaredSacks: 100 });
    const b = await createBlend({
      clientDraftId: 'd-diam-b',
      components: [
        { originSampleId: a, contributedSacks: 30 },
        { originSampleId: x, contributedSacks: 30 },
      ],
      lotNumber: '23004',
    });
    const c = await createBlend({
      clientDraftId: 'd-diam-c',
      components: [
        { originSampleId: a, contributedSacks: 30 },
        { originSampleId: y, contributedSacks: 30 },
      ],
      lotNumber: '23005',
    });
    // D contem B e C (ligas) — F7.7: contribuicao 100% do declaredSacks.
    const d = await createBlend({
      clientDraftId: 'd-diam-d',
      components: [
        { originSampleId: b.sample.id, contributedSacks: 60 },
        { originSampleId: c.sample.id, contributedSacks: 60 },
      ],
      lotNumber: '23006',
    });
    assert.equal(await harvestOf(d.sample.id), '22/23, 23/24, 24/25');

    // Editar A afeta D por dois caminhos (via B e via C) — nao pode duplicar.
    await editHarvest(a, '25/26', { confirm: true });

    assert.equal(await harvestOf(d.sample.id), '22/23, 23/24, 25/26');
    assert.equal((await blendUpdateEvents(d.sample.id)).length, 1);
  });

  // 5. 409 sem confirmacao: lista as ligas e nao grava nada
  test('sem confirmacao retorna 409 com affectedBlends e nao grava', async () => {
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createSample({ id: o1, lotNumber: '24001', harvest: '24/25' });
    await createSample({ id: o2, lotNumber: '24002', harvest: '24/25' });
    const blend = await createBlend({
      clientDraftId: 'd-409',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
      ],
      lotNumber: '24003',
    });

    let thrown = null;
    try {
      await editHarvest(o1, '25/26', { confirm: false });
    } catch (error) {
      thrown = error;
    }

    assert.ok(thrown instanceof HttpError);
    assert.equal(thrown.status, 409);
    assert.equal(thrown.details.code, 'BLEND_HARVEST_PROPAGATION_REQUIRED');
    assert.equal(thrown.details.affectedBlends.length, 1);
    const affected = thrown.details.affectedBlends[0];
    assert.equal(affected.sampleId, blend.sample.id);
    assert.equal(affected.currentHarvest, '24/25');
    assert.equal(affected.newHarvest, '24/25, 25/26');

    // Nada gravado: nem a origem nem a liga mudaram.
    assert.equal(await harvestOf(o1), '24/25');
    assert.equal(await harvestOf(blend.sample.id), '24/25');
    assert.equal((await blendUpdateEvents(blend.sample.id)).length, 0);
  });

  // 6. Liga ja vendida: propaga e marca commercialStatus no aviso
  test('liga comercializada e marcada no aviso e ainda propaga', async () => {
    const o1 = randomUUID();
    const o2 = randomUUID();
    const buyer = randomUUID();
    await createSample({ id: o1, lotNumber: '25001', harvest: '24/25', declaredSacks: 50 });
    await createSample({ id: o2, lotNumber: '25002', harvest: '24/25', declaredSacks: 50 });
    await createBuyerClient(buyer);
    const blend = await createBlend({
      clientDraftId: 'd-sold',
      components: [
        { originSampleId: o1, contributedSacks: 50 },
        { originSampleId: o2, contributedSacks: 50 },
      ],
      lotNumber: '25003',
    });
    const blendRow = await prisma.sample.findUnique({ where: { id: blend.sample.id } });
    await commandService.createSampleMovement(
      {
        sampleId: blend.sample.id,
        movementType: 'SALE',
        quantitySacks: 0,
        movementDate: '2026-05-20',
        buyerClientId: buyer,
        expectedVersion: blendRow.version,
      },
      actor
    );
    assert.equal(
      (await prisma.sample.findUnique({ where: { id: blend.sample.id } })).commercialStatus,
      'SOLD'
    );

    // 409 lista a liga com o status comercial.
    let thrown = null;
    try {
      await editHarvest(o1, '25/26', { confirm: false });
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof HttpError);
    assert.equal(thrown.details.affectedBlends[0].commercialStatus, 'SOLD');

    // Confirmando, propaga mesmo estando vendida.
    await editHarvest(o1, '25/26', { confirm: true });
    assert.equal(await harvestOf(blend.sample.id), '24/25, 25/26');
  });

  // 7. Liga INVALIDATED e ignorada
  test('liga revertida (INVALIDATED) nao recebe propagacao', async () => {
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createSample({ id: o1, lotNumber: '26001', harvest: '24/25' });
    await createSample({ id: o2, lotNumber: '26002', harvest: '24/25' });
    const blend = await createBlend({
      clientDraftId: 'd-inv',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
      ],
      lotNumber: '26003',
    });
    const blendRow = await prisma.sample.findUnique({ where: { id: blend.sample.id } });
    await commandService.revertBlend(
      { blendId: blend.sample.id, expectedVersion: blendRow.version, reasonText: 'teste' },
      actor
    );
    assert.equal(
      (await prisma.sample.findUnique({ where: { id: blend.sample.id } })).status,
      'INVALIDATED'
    );

    // Sem ligas ativas afetadas -> edicao passa direto (sem 409).
    await editHarvest(o1, '25/26', { confirm: false });

    assert.equal(await harvestOf(o1), '25/26');
    assert.equal(await harvestOf(blend.sample.id), '24/25');
    assert.equal((await blendUpdateEvents(blend.sample.id)).length, 0);
  });

  // 8. Atomicidade: conflito de versao na origem reverte o batch inteiro
  test('conflito de versao na origem nao aplica nada (atomico)', async () => {
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createSample({ id: o1, lotNumber: '27001', harvest: '24/25' });
    await createSample({ id: o2, lotNumber: '27002', harvest: '24/25' });
    const blend = await createBlend({
      clientDraftId: 'd-atom',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
      ],
      lotNumber: '27003',
    });
    const o1Row = await prisma.sample.findUnique({ where: { id: o1 } });

    let thrown = null;
    try {
      await editHarvest(o1, '25/26', { confirm: true, expectedVersion: o1Row.version + 5 });
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof HttpError);
    assert.equal(thrown.status, 409);

    // Nada persistiu: nem a origem nem a liga.
    assert.equal(await harvestOf(o1), '24/25');
    assert.equal(await harvestOf(blend.sample.id), '24/25');
    assert.equal((await blendUpdateEvents(blend.sample.id)).length, 0);
  });

  // 10. Regressao createBlend: origem-liga concatenada nao duplica safra
  test('createBlend nao duplica safra ao combinar origem-liga mista com lote simples', async () => {
    const a = randomUUID();
    const x = randomUUID();
    const w = randomUUID();
    await createSample({ id: a, lotNumber: '28001', harvest: '24/25' });
    await createSample({ id: x, lotNumber: '28002', harvest: '25/26' });
    await createSample({ id: w, lotNumber: '28003', harvest: '24/25' });
    const b = await createBlend({
      clientDraftId: 'd-dup-b',
      components: [
        { originSampleId: a, contributedSacks: 10 },
        { originSampleId: x, contributedSacks: 10 },
      ],
      lotNumber: '28004',
    });
    assert.equal(await harvestOf(b.sample.id), '24/25, 25/26');

    // C combina a liga B ('24/25, 25/26') com um lote '24/25' — o split+dedup
    // garante '24/25, 25/26', nao '24/25, 24/25, 25/26'.
    const c = await createBlend({
      clientDraftId: 'd-dup-c',
      components: [
        { originSampleId: b.sample.id, contributedSacks: 20 },
        { originSampleId: w, contributedSacks: 10 },
      ],
      lotNumber: '28005',
    });
    assert.equal(await harvestOf(c.sample.id), '24/25, 25/26');
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
