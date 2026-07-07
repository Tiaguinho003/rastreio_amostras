import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { SampleQueryService } from '../src/samples/sample-query-service.js';

// DSH-T1 (revisão geral): getDashboardPending tinha asserção só para
// classificationPending (sample-backend-sprint1). Aqui cobrimos o resto do
// payload: clientsIncomplete (WHERE canônico de completude) e o pulso do dia
// (dailyRegistered/dailySent — janelas de dia BRT sobre sample_event).

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('dashboard-pending integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const queryService = new SampleQueryService({ prisma });

  const HOUR_MS = 3_600_000;

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
  }

  // Documentos únicos por chamada (constraints UNIQUE de cpf/cnpj).
  let documentSequence = 0;
  function nextDocument(len) {
    documentSequence += 1;
    return String(documentSequence).padStart(len, '1');
  }

  // PJ com todos os PJ_RECOMMENDED_FIELDS preenchidos (completo por padrão);
  // `overrides` permite esvaziar um campo pra virar incompleto. cnpj e
  // isSeller satisfazem os checks chk_client_person_type_fields/role_flags.
  async function createPjClient(overrides = {}) {
    const id = randomUUID();
    const suffix = id.slice(0, 8);
    await prisma.client.create({
      data: {
        id,
        personType: 'PJ',
        legalName: `Cliente PJ ${suffix} LTDA`,
        cnpj: nextDocument(14),
        isSeller: true,
        tradeName: `PJ ${suffix}`,
        registrationNumber: `IE-${suffix}`,
        registrationNumberCanonical: `IE${suffix}`,
        addressLine: 'Rua Central, 100',
        district: 'Centro',
        city: 'Varginha',
        state: 'MG',
        postalCode: '37000-000',
        ...overrides,
      },
    });
    return id;
  }

  // PF completo = cpf + 1 unit ATIVA com todos os PF_UNIT_RECOMMENDED_FIELDS.
  // No client PF só podem viver fullName/cpf (check constraint); o resto é da
  // unit.
  async function createPfClient({ withUnit = true, unitOverrides = {}, ...overrides } = {}) {
    const id = randomUUID();
    const suffix = id.slice(0, 8);
    await prisma.client.create({
      data: {
        id,
        personType: 'PF',
        fullName: `Produtor ${suffix}`,
        cpf: nextDocument(11),
        isSeller: true,
        ...overrides,
      },
    });
    if (withUnit) {
      await prisma.clientUnit.create({
        data: {
          id: randomUUID(),
          clientId: id,
          name: 'Fazenda 1',
          code: 1,
          cnpj: nextDocument(14),
          phone: '(35) 99999-0000',
          addressLine: 'Estrada Rural, km 3',
          district: 'Zona Rural',
          city: 'Tres Pontas',
          state: 'MG',
          postalCode: '37190-000',
          registrationNumber: `IE-PF-${suffix}`,
          registrationNumberCanonical: `IEPF${suffix}`,
          car: `CAR-${suffix}`,
          ...unitOverrides,
        },
      });
    }
    return id;
  }

  let eventSequenceBySample = new Map();

  async function insertSampleEvent({ sampleId, eventType, occurredAt }) {
    const sequenceNumber = (eventSequenceBySample.get(sampleId) ?? 0) + 1;
    eventSequenceBySample.set(sampleId, sequenceNumber);
    await prisma.sampleEvent.create({
      data: {
        eventId: randomUUID(),
        sampleId,
        sequenceNumber,
        eventType,
        schemaVersion: 1,
        occurredAt,
        actorType: 'USER',
        actorUserId: randomUUID(),
        source: 'WEB',
        payload: {},
        requestId: `req-${sampleId.slice(0, 8)}-${sequenceNumber}`,
        metadataModule: 'REGISTRATION',
      },
    });
  }

  async function createSampleWithEvent(eventType, occurredAt) {
    const sampleId = randomUUID();
    // Status CLASSIFIED pra não poluir classificationPending (que conta RC).
    await prisma.sample.create({ data: { id: sampleId, status: 'CLASSIFIED' } });
    // Trigger do event store: o 1º evento do lote DEVE ser
    // REGISTRATION_CONFIRMED. Pra eventos de outro tipo, bootstrap com um
    // RC 10 dias atrás — fora das janelas hoje/ontem, não polui o pulso.
    if (eventType !== 'REGISTRATION_CONFIRMED') {
      await insertSampleEvent({
        sampleId,
        eventType: 'REGISTRATION_CONFIRMED',
        occurredAt: new Date(occurredAt.getTime() - 240 * HOUR_MS),
      });
    }
    await insertSampleEvent({ sampleId, eventType, occurredAt });
    return sampleId;
  }

  test.before(async () => {
    await prisma.$connect();
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    eventSequenceBySample = new Map();
    await resetDatabase();
  });

  test('banco vazio: clientsIncomplete e pulso do dia zerados', async () => {
    const result = await queryService.getDashboardPending();

    assert.strictEqual(result.classificationPending.total, 0);
    assert.strictEqual(result.clientsIncomplete.total, 0);
    assert.deepStrictEqual(result.dailyRegistered, { today: 0, yesterday: 0 });
    assert.deepStrictEqual(result.dailySent, { today: 0, yesterday: 0 });
  });

  test('clientsIncomplete conta PJ com campo recomendado faltando e ignora completo', async () => {
    await createPjClient(); // completo
    await createPjClient({ tradeName: null }); // incompleto (campo null)
    await createPjClient({ district: '' }); // incompleto (string vazia)

    const result = await queryService.getDashboardPending();

    assert.strictEqual(result.clientsIncomplete.total, 2);
  });

  test('clientsIncomplete cobre PF: sem cpf, sem unit ativa ou unit com lacuna', async () => {
    await createPfClient(); // completo
    await createPfClient({ cpf: null }); // incompleto (campo do client)
    await createPfClient({ withUnit: false }); // incompleto (nenhuma unit ativa)
    await createPfClient({ unitOverrides: { car: null } }); // incompleto (lacuna na unit)

    const result = await queryService.getDashboardPending();

    assert.strictEqual(result.clientsIncomplete.total, 3);
  });

  test('clientsIncomplete só conta clientes ACTIVE', async () => {
    await createPjClient({ tradeName: null, status: 'INACTIVE' });

    const result = await queryService.getDashboardPending();

    assert.strictEqual(result.clientsIncomplete.total, 0);
  });

  test('pulso do dia: separa hoje e ontem por evento e ignora anteontem', async () => {
    const now = new Date();
    // now-24h cai sempre dentro do dia BRT de ontem (a janela é [início do
    // dia BRT de hoje - 24h, início de hoje)); now-48h cai em anteontem.
    const yesterday = new Date(now.getTime() - 24 * HOUR_MS);
    const beforeYesterday = new Date(now.getTime() - 48 * HOUR_MS);

    await createSampleWithEvent('REGISTRATION_CONFIRMED', now);
    await createSampleWithEvent('REGISTRATION_CONFIRMED', yesterday);
    await createSampleWithEvent('REGISTRATION_CONFIRMED', beforeYesterday);
    await createSampleWithEvent('PHYSICAL_SAMPLE_SENT', now);
    await createSampleWithEvent('PHYSICAL_SAMPLE_SENT', now);
    await createSampleWithEvent('PHYSICAL_SAMPLE_SENT', yesterday);

    const result = await queryService.getDashboardPending();

    assert.deepStrictEqual(result.dailyRegistered, { today: 1, yesterday: 1 });
    assert.deepStrictEqual(result.dailySent, { today: 2, yesterday: 1 });
  });

  test('pulso do dia conta lotes distintos, não eventos (COUNT DISTINCT sample_id)', async () => {
    const now = new Date();
    const sampleId = await createSampleWithEvent('PHYSICAL_SAMPLE_SENT', now);
    // 2º envio do MESMO lote no mesmo dia: não pode contar 2.
    await insertSampleEvent({
      sampleId,
      eventType: 'PHYSICAL_SAMPLE_SENT',
      occurredAt: new Date(now.getTime() + 1000),
    });

    const result = await queryService.getDashboardPending();

    assert.deepStrictEqual(result.dailySent, { today: 1, yesterday: 0 });
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
