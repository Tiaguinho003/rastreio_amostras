import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { IdempotencyStore } from '../src/api/v1/idempotency-helper.js';
import { LocalAuthService } from '../src/auth/local-auth-service.js';
import { ClientService } from '../src/clients/client-service.js';
import { generateValidCnpj } from './helpers/cnpj-generator.js';
import { EventContractDbService } from '../src/events/event-contract-db-service.js';
import { PrismaEventStore } from '../src/events/prisma-event-store.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { SampleQueryService } from '../src/samples/sample-query-service.js';
import { HttpError } from '../src/contracts/errors.js';

// LNW-T1 (Revisao Geral F4): validacoes do createSample — limites 422 dos
// campos declarados, erros do binding do dono (resolveOwnerBinding), a
// idempotencia por clientDraftId (retry -> 200 idempotent; INVALIDATED -> 409),
// o numero manual (normalizeManualLotNumber + colisao 409) e o hardening
// LNW-B1 na API: sampleLotNumber cru SEM lotNumberManual=true e ignorado.

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('sample-create-validation integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const eventStore = new PrismaEventStore(prisma);
  const eventService = new EventContractDbService({ store: eventStore });
  const queryService = new SampleQueryService({ prisma });
  const clientService = new ClientService({ prisma });
  const commandService = new SampleCommandService({
    eventService,
    queryService,
    clientService,
  });

  const actor = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'ADMIN',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };

  let api;
  let authHeaders;
  let sellerSequence = 0;

  async function createSellerClient(overrides = {}) {
    sellerSequence += 1;
    const cnpj = generateValidCnpj(sellerSequence);
    const name = `Proprietario Validacao ${sellerSequence} LTDA`;
    return clientService.createClient(
      {
        personType: 'PJ',
        legalName: name,
        tradeName: name,
        cnpj,
        phone: '35 99999-0000',
        isBuyer: true,
        isSeller: true,
        ...overrides,
      },
      actor
    );
  }

  // Input valido de base; cada teste sobrescreve so o campo em prova.
  async function validInput(overrides = {}) {
    const ownerClient = await createSellerClient();
    return {
      clientDraftId: `draft-${randomUUID().slice(0, 8)}`,
      ownerClientId: ownerClient.client.id,
      owner: ownerClient.client.displayName,
      sacks: 9,
      harvest: '25/26',
      ...overrides,
    };
  }

  function rejects422(input, matcher = null) {
    return assert.rejects(
      () => commandService.createSample(input, actor),
      (err) => {
        assert.ok(err instanceof HttpError, `esperava HttpError, veio ${err?.constructor?.name}`);
        assert.equal(err.status, 422);
        if (matcher) matcher(err);
        return true;
      }
    );
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample, idempotency_record RESTART IDENTITY CASCADE'
    );
  }

  test.before(async () => {
    await prisma.$connect();

    const authService = new LocalAuthService({
      secret: 'super-secret-for-create-validation-tests',
      allowPlaintextPasswords: true,
      users: [
        {
          id: actor.actorUserId,
          username: 'create-test',
          password: 'create123',
          role: actor.role,
          displayName: 'Criacao Teste',
        },
      ],
    });

    authHeaders = {
      authorization: `Bearer ${authService.login({ username: 'create-test', password: 'create123' }).accessToken}`,
      'x-forwarded-for': actor.ip,
      'user-agent': actor.userAgent,
      'x-source': actor.source,
    };

    api = createBackendApiV1({
      authService,
      clientService,
      commandService,
      queryService,
      reportService: null,
      idempotencyStore: new IdempotencyStore({ prisma }),
    });
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    await resetDatabase();
  });

  // --- Limites 422 dos campos declarados ---

  test('sacks < 1 e sacks nao-inteiro -> 422', async () => {
    await rejects422(await validInput({ sacks: 0 }));
    await rejects422(await validInput({ sacks: 2.5 }));
  });

  test('harvest vazio -> 422', async () => {
    await rejects422(await validInput({ harvest: '' }));
  });

  test('originLot > 2000 caracteres -> 422', async () => {
    // Chips: sem limite pratico (cap so anti-abuso subiu de 100 para 2000).
    await rejects422(await validInput({ originLot: 'x'.repeat(2001) }));
  });

  test('location > 30 caracteres -> 422', async () => {
    await rejects422(await validInput({ location: 'x'.repeat(31) }));
  });

  test('notes > 500 caracteres -> 422', async () => {
    await rejects422(await validInput({ notes: 'x'.repeat(501) }));
  });

  // --- Binding do dono (resolveOwnerBinding) ---

  test('ownerClientId ausente -> 422', async () => {
    const input = await validInput();
    delete input.ownerClientId;
    await rejects422(input);
  });

  test('ownerClientId inexistente -> 422 OWNER_CLIENT_NOT_FOUND', async () => {
    await rejects422(await validInput({ ownerClientId: randomUUID() }), (err) => {
      assert.equal(err.details?.code, 'OWNER_CLIENT_NOT_FOUND');
    });
  });

  test('ownerClientId INACTIVE -> 422 OWNER_CLIENT_INACTIVE', async () => {
    const input = await validInput();
    await prisma.client.update({
      where: { id: input.ownerClientId },
      data: { status: 'INACTIVE' },
    });
    await rejects422(input, (err) => {
      assert.equal(err.details?.code, 'OWNER_CLIENT_INACTIVE');
    });
  });

  test('ownerClientId que nao e vendedor -> 422 OWNER_CLIENT_NOT_SELLER', async () => {
    const buyerOnly = await createSellerClient({ isSeller: false, isBuyer: true });
    const input = await validInput({ ownerClientId: buyerOnly.client.id });
    await rejects422(input, (err) => {
      assert.equal(err.details?.code, 'OWNER_CLIENT_NOT_SELLER');
    });
  });

  // --- Idempotencia por clientDraftId ---

  test('retry do mesmo clientDraftId -> 200 idempotent com o mesmo lote', async () => {
    const input = await validInput();

    const first = await commandService.createSample(input, actor);
    assert.equal(first.statusCode, 201);
    assert.equal(first.idempotent, false);

    const retry = await commandService.createSample(input, actor);
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.idempotent, true);
    assert.equal(retry.sample.id, first.sample.id);
    assert.equal(retry.sample.internalLotNumber, first.sample.internalLotNumber);

    const events = await prisma.sampleEvent.count({ where: { sampleId: first.sample.id } });
    assert.equal(events, 1);
  });

  test('recriar draft de lote INVALIDATED -> 409', async () => {
    const input = await validInput();
    const first = await commandService.createSample(input, actor);

    // Projecao direta: triggers append-only vivem no sample_event, nao aqui.
    await prisma.sample.update({
      where: { id: first.sample.id },
      data: { status: 'INVALIDATED' },
    });

    await assert.rejects(
      () => commandService.createSample(input, actor),
      (err) => err instanceof HttpError && err.status === 409
    );
  });

  // --- Numero manual (normalizeManualLotNumber) ---

  test('manual "0" e "0000" -> 422 dentro do campo lotNumber', async () => {
    for (const value of ['0', '0000']) {
      await rejects422(
        await validInput({ lotNumberManual: true, sampleLotNumber: value }),
        (err) => {
          assert.equal(err.details?.field, 'lotNumber');
        }
      );
    }
  });

  test('manual com nao-digitos e com mais de 7 digitos -> 422', async () => {
    await rejects422(await validInput({ lotNumberManual: true, sampleLotNumber: 'A123' }));
    await rejects422(await validInput({ lotNumberManual: true, sampleLotNumber: '12345678' }));
  });

  test('manual valido fixa o numero e normaliza zeros a esquerda', async () => {
    const result = await commandService.createSample(
      await validInput({ lotNumberManual: true, sampleLotNumber: '0055' }),
      actor
    );
    assert.equal(result.statusCode, 201);
    assert.equal(result.sample.internalLotNumber, '55');
    assert.equal(result.event.payload.lotNumberManual, true);

    // Projecao: a flag persiste na row (read model mapeado nao a expoe).
    const row = await prisma.sample.findUnique({ where: { id: result.sample.id } });
    assert.equal(row.lotNumberManual, true);
  });

  test('manual colidindo com lote existente -> 409 dentro do campo', async () => {
    const first = await commandService.createSample(await validInput(), actor);
    const taken = first.sample.internalLotNumber;

    await assert.rejects(
      () =>
        commandService.createSample(
          validInputSync(first, { lotNumberManual: true, sampleLotNumber: taken }),
          actor
        ),
      (err) => err instanceof HttpError && err.status === 409 && err.details?.field === 'lotNumber'
    );
  });

  // --- Hardening LNW-B1: a API so repassa numero fixo com a flag ---

  test('API: sampleLotNumber cru SEM lotNumberManual e ignorado (numero segue automatico)', async () => {
    const ownerClient = await createSellerClient();
    const result = await api.createSample({
      headers: authHeaders,
      params: {},
      query: {},
      body: {
        clientDraftId: `draft-${randomUUID().slice(0, 8)}`,
        ownerClientId: ownerClient.client.id,
        owner: ownerClient.client.displayName,
        sacks: 5,
        harvest: '25/26',
        sampleLotNumber: '4321',
      },
    });

    assert.equal(result.status, 201);
    assert.notEqual(result.body.sample.internalLotNumber, '4321');
    assert.equal(result.body.event.payload.lotNumberManual, false);
  });

  test('API: sampleLotNumber COM lotNumberManual=true fixa o numero', async () => {
    const ownerClient = await createSellerClient();
    const result = await api.createSample({
      headers: authHeaders,
      params: {},
      query: {},
      body: {
        clientDraftId: `draft-${randomUUID().slice(0, 8)}`,
        ownerClientId: ownerClient.client.id,
        owner: ownerClient.client.displayName,
        sacks: 5,
        harvest: '25/26',
        sampleLotNumber: '4321',
        lotNumberManual: true,
      },
    });

    assert.equal(result.status, 201);
    assert.equal(result.body.sample.internalLotNumber, '4321');
    assert.equal(result.body.event.payload.lotNumberManual, true);
  });

  // Reusa o dono do primeiro create pra provocar a colisao sem criar outro
  // cliente (o draft precisa ser NOVO pra nao cair na idempotencia).
  function validInputSync(previousResult, overrides) {
    return {
      clientDraftId: `draft-${randomUUID().slice(0, 8)}`,
      ownerClientId: previousResult.sample.ownerClientId,
      owner: previousResult.sample.declared.owner,
      sacks: 9,
      harvest: '25/26',
      ...overrides,
    };
  }
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
