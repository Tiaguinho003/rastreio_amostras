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
  test.skip('sample-blend-owner integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
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

  // Cliente so pra satisfazer a FK sample.owner_client_id (resolveOwnerBinding e
  // mockado, entao nao precisa ser ACTIVE/seller de verdade).
  async function createClient(id, name) {
    await prisma.client.create({
      data: { id, personType: 'PF', fullName: name, status: 'INACTIVE', isSeller: true },
    });
  }

  async function createSample({
    id,
    lotNumber,
    harvest,
    ownerClientId,
    ownerName,
    declaredSacks = 50,
  }) {
    await eventService.appendEvent(
      registrationConfirmedEvent(id, {
        payload: {
          sampleLotNumber: lotNumber,
          ownerClientId: ownerClientId ?? null,
          declared: {
            owner: ownerName ?? null,
            sacks: declaredSacks,
            harvest,
            originLot: 'LOTE-ORIGEM',
          },
        },
      })
    );
    await prisma.sample.update({ where: { id }, data: { status: 'CLASSIFIED' } });
  }

  async function createBlend({ clientDraftId, components, lotNumber }) {
    return commandService.createBlend(
      { clientDraftId, components, sampleLotNumber: lotNumber },
      actor
    );
  }

  async function editOwner(sampleId, newOwnerClientId, { confirm = false } = {}) {
    const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
    return commandService.updateRegistration(
      {
        sampleId,
        expectedVersion: sample.version,
        after: { ownerClientId: newOwnerClientId },
        reasonCode: 'DATA_FIX',
        reasonText: 'Ajuste de dono',
        confirmHarvestPropagation: confirm,
      },
      actor
    );
  }

  async function ownerOf(sampleId) {
    const row = await prisma.sample.findUnique({ where: { id: sampleId } });
    return { ownerClientId: row.ownerClientId, declaredOwner: row.declaredOwner };
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

  // 1. Criação: origens do mesmo dono -> liga herda
  test('createBlend herda o dono quando todas as origens sao do mesmo cliente', async () => {
    const c1 = randomUUID();
    await createClient(c1, 'Joao');
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createSample({
      id: o1,
      lotNumber: '30001',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'Joao',
    });
    await createSample({
      id: o2,
      lotNumber: '30002',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'Joao',
    });

    const blend = await createBlend({
      clientDraftId: 'd-own-1',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
      ],
      lotNumber: '30003',
    });

    const owner = await ownerOf(blend.sample.id);
    assert.equal(owner.ownerClientId, c1);
    assert.equal(owner.declaredOwner, 'Joao');
  });

  // 2. Criação: origens de donos diferentes -> liga sem dono
  test('createBlend fica sem dono quando as origens sao de clientes diferentes', async () => {
    const c1 = randomUUID();
    const c2 = randomUUID();
    await createClient(c1, 'Joao');
    await createClient(c2, 'Maria');
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createSample({
      id: o1,
      lotNumber: '31001',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'Joao',
    });
    await createSample({
      id: o2,
      lotNumber: '31002',
      harvest: '24/25',
      ownerClientId: c2,
      ownerName: 'Maria',
    });

    const blend = await createBlend({
      clientDraftId: 'd-own-2',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
      ],
      lotNumber: '31003',
    });

    const owner = await ownerOf(blend.sample.id);
    assert.equal(owner.ownerClientId, null);
    assert.equal(owner.declaredOwner, null);
  });

  // 3. Propagação só-owner: liga unânime vira mista ao trocar o dono de um lote
  test('editar o dono de um lote propaga para a liga (unanime -> sem dono), sem tocar a safra', async () => {
    const c1 = randomUUID();
    const c2 = randomUUID();
    await createClient(c1, 'Joao');
    await createClient(c2, 'Maria');
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createSample({
      id: o1,
      lotNumber: '32001',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'Joao',
    });
    await createSample({
      id: o2,
      lotNumber: '32002',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'Joao',
    });
    const blend = await createBlend({
      clientDraftId: 'd-own-3',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
      ],
      lotNumber: '32003',
    });
    assert.equal((await ownerOf(blend.sample.id)).ownerClientId, c1);

    await editOwner(o1, c2, { confirm: true });

    const owner = await ownerOf(blend.sample.id);
    assert.equal(owner.ownerClientId, null);
    assert.equal(owner.declaredOwner, null);

    // O evento da liga mexe no owner mas NAO na safra (so-owner muda).
    const events = await prisma.sampleEvent.findMany({
      where: { sampleId: blend.sample.id, eventType: 'REGISTRATION_UPDATED' },
    });
    assert.equal(events.length, 1);
    assert.equal(
      Object.prototype.hasOwnProperty.call(events[0].payload.after, 'ownerClientId'),
      true
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(events[0].payload.after.declared ?? {}, 'harvest'),
      false
    );
  });

  // 4. Sem confirmação -> 409 lista a liga afetada pelo owner
  test('editar dono sem confirmacao retorna 409 com a liga afetada', async () => {
    const c1 = randomUUID();
    const c2 = randomUUID();
    await createClient(c1, 'Joao');
    await createClient(c2, 'Maria');
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createSample({
      id: o1,
      lotNumber: '33001',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'Joao',
    });
    await createSample({
      id: o2,
      lotNumber: '33002',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'Joao',
    });
    const blend = await createBlend({
      clientDraftId: 'd-own-4',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
      ],
      lotNumber: '33003',
    });

    let thrown = null;
    try {
      await editOwner(o1, c2, { confirm: false });
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof HttpError);
    assert.equal(thrown.status, 409);
    assert.equal(thrown.details.code, 'BLEND_HARVEST_PROPAGATION_REQUIRED');
    assert.equal(thrown.details.affectedBlends[0].sampleId, blend.sample.id);
    // Nada gravado.
    assert.equal((await ownerOf(blend.sample.id)).ownerClientId, c1);
  });

  // 5. Filtro de proprietário casa a liga mista por qualquer dono das origens
  test('filtro ownerClientIds casa a liga mista pelo dono de qualquer origem', async () => {
    const c1 = randomUUID();
    const c2 = randomUUID();
    await createClient(c1, 'Joao');
    await createClient(c2, 'Maria');
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createSample({
      id: o1,
      lotNumber: '34001',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'Joao',
    });
    await createSample({
      id: o2,
      lotNumber: '34002',
      harvest: '24/25',
      ownerClientId: c2,
      ownerName: 'Maria',
    });
    const blend = await createBlend({
      clientDraftId: 'd-own-5',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
      ],
      lotNumber: '34003',
    });

    // Filtrar por c1 traz o1 (dono direto) + a liga (origem c1).
    const byC1 = await queryService.listSamples({ ownerClientIds: [c1] });
    const idsC1 = byC1.items.map((item) => item.id);
    assert.ok(idsC1.includes(blend.sample.id), 'liga deve aparecer ao filtrar por c1');
    assert.ok(idsC1.includes(o1));

    // Filtrar por c2 tambem traz a liga (origem c2).
    const byC2 = await queryService.listSamples({ ownerClientIds: [c2] });
    assert.ok(
      byC2.items.map((i) => i.id).includes(blend.sample.id),
      'liga deve aparecer ao filtrar por c2'
    );
  });

  // 6. Filtro "Apenas ligas"
  test('filtro isBlend=true retorna so as ligas', async () => {
    const c1 = randomUUID();
    await createClient(c1, 'Joao');
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createSample({
      id: o1,
      lotNumber: '35001',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'Joao',
    });
    await createSample({
      id: o2,
      lotNumber: '35002',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'Joao',
    });
    const blend = await createBlend({
      clientDraftId: 'd-own-6',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
      ],
      lotNumber: '35003',
    });

    const onlyBlends = await queryService.listSamples({ isBlend: true });
    const ids = onlyBlends.items.map((item) => item.id);
    assert.equal(ids.length, 1);
    assert.equal(ids[0], blend.sample.id);
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
