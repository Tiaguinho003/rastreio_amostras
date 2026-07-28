import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

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

  async function createBlend({ clientDraftId, components, lotNumber, ownerClientId, ownerFixed }) {
    return commandService.createBlend(
      { clientDraftId, components, sampleLotNumber: lotNumber, ownerClientId, ownerFixed },
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

  async function blendRow(sampleId) {
    return prisma.sample.findUnique({ where: { id: sampleId } });
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
  // RC-D36 (2026-07-28): editar o dono de uma ORIGEM nao toca mais o dono da liga
  // — nem de liga sem pin, que era o unico caso que ainda propagava. Antes deste
  // teste inverter, ele afirmava "unanime -> sem dono".
  test('editar o dono de um lote NAO propaga para a liga (RC-D36)', async () => {
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

    // A liga permanece com o dono que tinha: as origens divergiram, mas isso
    // deixou de ser assunto dela.
    const owner = await ownerOf(blend.sample.id);
    assert.equal(owner.ownerClientId, c1);

    // E nenhum evento foi emitido na liga — a propagacao nem chega a montar.
    const events = await prisma.sampleEvent.findMany({
      where: { sampleId: blend.sample.id, eventType: 'REGISTRATION_UPDATED' },
    });
    assert.equal(events.length, 0);

    // A origem editada, essa sim, mudou de dono.
    assert.equal((await ownerOf(o1)).ownerClientId, c2);
  });

  // RC-D36: sem eixo de dono na propagacao, editar so o dono nao afeta liga
  // nenhuma — logo nao ha o que confirmar e o 409 deixa de existir neste caso.
  test('editar dono sem confirmacao NAO exige confirmacao (RC-D36)', async () => {
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

    // Sem confirmacao: aplica direto, sem 409.
    await editOwner(o1, c2, { confirm: false });

    assert.equal((await ownerOf(o1)).ownerClientId, c2);
    // A liga fica onde estava.
    assert.equal((await ownerOf(blend.sample.id)).ownerClientId, c1);
  });

  // Dono fixado: um dono escolhido a mao (terceiro) fica FIXADO — editar uma
  // origem depois nao muda o dono da liga (so a safra deriva).
  test('dono fixado: createBlend com ownerFixed fixa um terceiro; editar origem nao muda o dono', async () => {
    const luis = randomUUID();
    const junior = randomUUID();
    const joao = randomUUID();
    await createClient(luis, 'Luis');
    await createClient(junior, 'Junior');
    await createClient(joao, 'Joao');
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createSample({
      id: o1,
      lotNumber: '31001',
      harvest: '24/25',
      ownerClientId: luis,
      ownerName: 'Luis',
    });
    await createSample({
      id: o2,
      lotNumber: '31002',
      harvest: '24/25',
      ownerClientId: junior,
      ownerName: 'Junior',
    });

    // Origens de clientes diferentes, mas a liga é do Joao (terceiro), fixada.
    const blend = await createBlend({
      clientDraftId: 'd-pin-1',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
      ],
      lotNumber: '31003',
      ownerClientId: joao,
      ownerFixed: true,
    });
    assert.equal((await ownerOf(blend.sample.id)).ownerClientId, joao);
    assert.equal((await blendRow(blend.sample.id)).blendOwnerPinned, true);

    // Editar o dono de uma origem NAO reverte o dono fixado da liga.
    const outro = randomUUID();
    await createClient(outro, 'Outro');
    await editOwner(o1, outro, { confirm: true });
    assert.equal(
      (await ownerOf(blend.sample.id)).ownerClientId,
      joao,
      'o dono fixado permanece apos editar a origem'
    );
  });

  // Dono fixado — "carteira da corretora" (fixado + owner null): sobrevive a
  // edicao de origem; a safra continua derivando.
  test('dono fixado: carteira (fixado null) permanece; a safra ainda deriva das origens', async () => {
    const c1 = randomUUID();
    await createClient(c1, 'C1');
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createSample({
      id: o1,
      lotNumber: '31010',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'C1',
    });
    await createSample({
      id: o2,
      lotNumber: '31011',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'C1',
    });

    // Carteira da corretora: ownerFixed=true, ownerClientId=null (sem dono, fixado).
    const blend = await createBlend({
      clientDraftId: 'd-pin-2',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
      ],
      lotNumber: '31012',
      ownerClientId: null,
      ownerFixed: true,
    });
    assert.equal((await ownerOf(blend.sample.id)).ownerClientId, null);
    assert.equal((await blendRow(blend.sample.id)).blendOwnerPinned, true);

    // Editar a safra de uma origem: a liga recalcula a SAFRA, mas a carteira fica.
    const sample = await prisma.sample.findUnique({ where: { id: o1 } });
    await commandService.updateRegistration(
      {
        sampleId: o1,
        expectedVersion: sample.version,
        after: { declared: { harvest: '25/26' } },
        reasonCode: 'DATA_FIX',
        reasonText: 'Safra',
        confirmHarvestPropagation: true,
      },
      actor
    );
    const row = await blendRow(blend.sample.id);
    assert.equal(row.ownerClientId, null, 'carteira permanece');
    assert.equal(row.blendOwnerPinned, true);
    assert.equal(row.declaredHarvest, '24/25, 25/26', 'a safra derivou das origens');
  });

  // Dono fixado — auto-pin: editar o dono da PROPRIA liga (nao-fixada) fixa; a
  // partir dai, editar uma origem nao reverte mais o dono.
  test('dono fixado: editar o dono da propria liga auto-fixa e blinda de origem', async () => {
    const c1 = randomUUID();
    const c2 = randomUUID();
    await createClient(c1, 'C1');
    await createClient(c2, 'C2');
    const o1 = randomUUID();
    const o2 = randomUUID();
    await createSample({
      id: o1,
      lotNumber: '31020',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'C1',
    });
    await createSample({
      id: o2,
      lotNumber: '31021',
      harvest: '24/25',
      ownerClientId: c1,
      ownerName: 'C1',
    });
    // Liga nao-fixada (herda c1, reativa).
    const blend = await createBlend({
      clientDraftId: 'd-pin-3',
      components: [
        { originSampleId: o1, contributedSacks: 10 },
        { originSampleId: o2, contributedSacks: 10 },
      ],
      lotNumber: '31022',
    });
    assert.equal((await blendRow(blend.sample.id)).blendOwnerPinned, false);

    // Editar o dono da liga direto -> auto-fixa (updateRegistration num blend).
    await editOwner(blend.sample.id, c2, { confirm: true });
    assert.equal((await ownerOf(blend.sample.id)).ownerClientId, c2);
    assert.equal(
      (await blendRow(blend.sample.id)).blendOwnerPinned,
      true,
      'editar o dono de uma liga auto-fixa'
    );

    // Agora editar uma origem NAO reverte mais o dono fixado.
    const c3 = randomUUID();
    await createClient(c3, 'C3');
    await editOwner(o1, c3, { confirm: true });
    assert.equal(
      (await ownerOf(blend.sample.id)).ownerClientId,
      c2,
      'o dono fixado permanece apos editar a origem'
    );
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
