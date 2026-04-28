import test from 'node:test';
import assert from 'node:assert/strict';

import { PrismaClient } from '@prisma/client';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { LocalAuthService } from '../src/auth/local-auth-service.js';
import { ClientService } from '../src/clients/client-service.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('client backend integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const clientService = new ClientService({ prisma });

  let api;
  let authService;
  let authHeaders;

  const actor = {
    actorType: 'USER',
    actorUserId: '00000000-0000-0000-0000-000000000201',
    role: 'CLASSIFIER',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };

  function buildInput({ headers = authHeaders, params = {}, query = {}, body = {} } = {}) {
    return {
      headers,
      params,
      query,
      body,
    };
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, client_commercial_user, sample_movement, client_registration, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
    await prisma.$executeRawUnsafe('DELETE FROM "app_user" WHERE "username" LIKE \'test-%\'');
  }

  async function createTestUser(role, overrides = {}) {
    const id =
      overrides.id ?? `00000000-0000-0000-0000-0000000003${Math.floor(Math.random() * 90 + 10)}`;
    const username = overrides.username ?? `test-user-${Math.random().toString(36).slice(2, 8)}`;
    return prisma.user.create({
      data: {
        id,
        fullName: overrides.fullName ?? `Test ${role}`,
        username,
        usernameCanonical: username.toLowerCase(),
        email: overrides.email ?? `${username}@test.local`,
        emailCanonical: (overrides.email ?? `${username}@test.local`).toLowerCase(),
        passwordHash: 'x',
        role,
        status: overrides.status ?? 'ACTIVE',
      },
    });
  }

  async function createPfClient(overrides = {}) {
    return api.createClient(
      buildInput({
        body: {
          personType: 'PF',
          fullName: 'Francisco Sales Darcadia',
          cpf: '016.179.708-32',
          phone: '35 99911-8089',
          isBuyer: false,
          isSeller: true,
          ...overrides,
        },
      })
    );
  }

  async function createPjClient(overrides = {}) {
    return api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Atlantica Exportacao e Importacao S/A',
          tradeName: 'Atlantica Exportacao e Importacao S/A',
          cnpj: '03.936.815/0001-75',
          phone: '35 3222-0495',
          isBuyer: true,
          isSeller: true,
          ...overrides,
        },
      })
    );
  }

  test.before(async () => {
    await prisma.$connect();

    authService = new LocalAuthService({
      secret: 'super-secret-for-client-backend-tests',
      allowPlaintextPasswords: true,
      users: [
        {
          id: actor.actorUserId,
          username: 'client-test',
          password: 'client123',
          role: actor.role,
          displayName: 'Cliente Teste',
        },
      ],
    });

    authHeaders = {
      authorization: `Bearer ${authService.login({ username: 'client-test', password: 'client123' }).accessToken}`,
      'x-forwarded-for': actor.ip,
      'user-agent': actor.userAgent,
      'x-source': actor.source,
    };

    api = createBackendApiV1({
      authService,
      clientService,
      commandService: {},
      queryService: {
        async listSamples() {
          return {
            items: [],
            page: {
              total: 0,
              totalPages: 1,
              page: 1,
              limit: 30,
              offset: 0,
              hasPrev: false,
              hasNext: false,
            },
          };
        },
        async getDashboardPending() {
          return { pending: [] };
        },
      },
      reportService: null,
    });
  });

  test.after(async () => {
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    await resetDatabase();
  });

  test('GET /clients requires authentication', async () => {
    const result = await api.listClients({
      headers: {},
      params: {},
      query: {},
      body: {},
    });

    assert.equal(result.status, 401);
  });

  test('POST /clients creates PF and PJ clients and GET /clients searches by name, document and code', async () => {
    const pf = await createPfClient();
    const pj = await createPjClient();

    assert.equal(pf.status, 201);
    assert.equal(pf.body.client.personType, 'PF');
    assert.equal(pf.body.client.displayName, 'Francisco Sales Darcadia');
    assert.equal(pf.body.client.document, '01617970832');
    assert.equal(pf.body.client.phone, '35999118089');

    assert.equal(pj.status, 201);
    assert.equal(pj.body.client.personType, 'PJ');
    assert.equal(pj.body.client.displayName, 'Atlantica Exportacao e Importacao S/A');
    assert.equal(pj.body.client.document, '03936815000175');
    assert.equal(pj.body.client.phone, '3532220495');

    const byName = await api.listClients(
      buildInput({
        query: {
          search: 'Atlantica',
        },
      })
    );

    assert.equal(byName.status, 200);
    assert.equal(byName.body.page.total, 1);
    assert.equal(byName.body.items[0].id, pj.body.client.id);

    const byDocument = await api.listClients(
      buildInput({
        query: {
          search: '01617970832',
        },
      })
    );

    assert.equal(byDocument.status, 200);
    assert.equal(byDocument.body.page.total, 1);
    assert.equal(byDocument.body.items[0].id, pf.body.client.id);

    const byCode = await api.listClients(
      buildInput({
        query: {
          search: String(pf.body.client.code),
        },
      })
    );

    assert.equal(byCode.status, 200);
    assert.equal(byCode.body.page.total, 1);
    assert.equal(byCode.body.items[0].id, pf.body.client.id);
  });

  test('GET /clients accepts limit 30 and rejects values above the new maximum', async () => {
    for (let index = 0; index < 31; index += 1) {
      const created = await createPfClient({
        fullName: `Cliente limite ${index + 1}`,
        cpf: String(70000000000 + index),
      });

      assert.equal(created.status, 201);
    }

    const paged = await api.listClients(
      buildInput({
        query: {
          page: '1',
          limit: '30',
        },
      })
    );

    assert.equal(paged.status, 200);
    assert.equal(paged.body.items.length, 30);
    assert.equal(paged.body.page.limit, 30);
    assert.equal(paged.body.page.total, 31);
    assert.equal(paged.body.page.hasNext, true);

    const aboveMax = await api.listClients(
      buildInput({
        query: {
          limit: '31',
        },
      })
    );

    assert.equal(aboveMax.status, 422);
    assert.equal(aboveMax.body.error.message, 'limit must be an integer between 1 and 30');
  });

  test('GET /clients/lookup filters active buyers and sellers', async () => {
    const sellerOnly = await createPfClient();
    const buyerOnly = await createPjClient({
      legalName: 'Comprador Export Ltda',
      tradeName: 'Comprador Export Ltda',
      cnpj: '26.543.626/0001-38',
      isBuyer: true,
      isSeller: false,
    });

    const ownerLookup = await api.lookupClients(
      buildInput({
        query: {
          search: 'Francisco',
          kind: 'owner',
        },
      })
    );

    assert.equal(ownerLookup.status, 200);
    assert.equal(ownerLookup.body.items.length, 1);
    assert.equal(ownerLookup.body.items[0].id, sellerOnly.body.client.id);

    const buyerLookup = await api.lookupClients(
      buildInput({
        query: {
          search: 'Comprador',
          kind: 'buyer',
        },
      })
    );

    assert.equal(buyerLookup.status, 200);
    assert.equal(buyerLookup.body.items.length, 1);
    assert.equal(buyerLookup.body.items[0].id, buyerOnly.body.client.id);

    await api.inactivateClient(
      buildInput({
        params: { clientId: buyerOnly.body.client.id },
        body: { reasonText: 'suspenso' },
      })
    );

    const inactiveLookup = await api.lookupClients(
      buildInput({
        query: {
          search: 'Comprador',
          kind: 'buyer',
        },
      })
    );

    assert.equal(inactiveLookup.status, 200);
    assert.equal(inactiveLookup.body.items.length, 0);
  });

  test('PATCH /clients updates same client, including person type/document change, and records audit', async () => {
    const created = await createPfClient();

    const updated = await api.updateClient(
      buildInput({
        params: { clientId: created.body.client.id },
        body: {
          personType: 'PJ',
          legalName: 'G A S Comercio de Cafe Sociedade LTDA',
          tradeName: 'G A S Comercio de Cafe Sociedade LTDA',
          cnpj: '26.543.626/0001-38',
          isBuyer: true,
          isSeller: true,
          reasonText: 'corrigir cadastro',
        },
      })
    );

    assert.equal(updated.status, 200);
    assert.equal(updated.body.client.personType, 'PJ');
    assert.equal(updated.body.client.displayName, 'G A S Comercio de Cafe Sociedade LTDA');
    assert.equal(updated.body.client.document, '26543626000138');

    const detail = await api.getClient(
      buildInput({
        params: { clientId: created.body.client.id },
      })
    );

    assert.equal(detail.status, 200);
    assert.equal(detail.body.client.personType, 'PJ');

    const audit = await api.listClientAuditEvents(
      buildInput({
        params: { clientId: created.body.client.id },
      })
    );

    assert.equal(audit.status, 200);
    assert.equal(audit.body.items[0].eventType, 'CLIENT_UPDATED');
    assert.equal(audit.body.items[0].reasonText, 'corrigir cadastro');
  });

  test('POST/PATCH client registrations manage same record and enforce ownership', async () => {
    const created = await createPjClient();

    const registration = await api.createClientRegistration(
      buildInput({
        params: { clientId: created.body.client.id },
        body: {
          registrationNumber: '0028640150010',
          registrationType: 'estadual',
          addressLine: 'Av. Oliveira Rezende, 1397',
          district: 'JD Bernadete',
          city: 'Sao Sebastiao do Paraiso',
          state: 'MG',
          postalCode: '37950-078',
          complement: null,
        },
      })
    );

    assert.equal(registration.status, 201);
    assert.equal(registration.body.registration.registrationNumber, '0028640150010');

    const updatedRegistration = await api.updateClientRegistration(
      buildInput({
        params: {
          clientId: created.body.client.id,
          registrationId: registration.body.registration.id,
        },
        body: {
          district: 'Centro',
          reasonText: 'ajuste endereco',
        },
      })
    );

    assert.equal(updatedRegistration.status, 200);
    assert.equal(updatedRegistration.body.registration.district, 'Centro');

    const otherClient = await createPfClient({
      fullName: 'Outro Cliente',
      cpf: '123.456.789-09',
    });

    const wrongOwner = await api.updateClientRegistration(
      buildInput({
        params: {
          clientId: otherClient.body.client.id,
          registrationId: registration.body.registration.id,
        },
        body: {
          district: 'Bairro X',
          reasonText: 'nao deveria achar',
        },
      })
    );

    assert.equal(wrongOwner.status, 404);
  });

  test('GET /clients/:id returns registrations and audit includes registration events', async () => {
    const created = await createPjClient();
    const registration = await api.createClientRegistration(
      buildInput({
        params: { clientId: created.body.client.id },
        body: {
          registrationNumber: '3940945840042',
          registrationType: 'estadual',
          addressLine: 'Av. Princesa do Sul, 1885',
          district: 'Rezende',
          city: 'Varginha',
          state: 'MG',
          postalCode: '37062-447',
          complement: null,
        },
      })
    );

    await api.inactivateClientRegistration(
      buildInput({
        params: {
          clientId: created.body.client.id,
          registrationId: registration.body.registration.id,
        },
        body: {
          reasonText: 'teste',
        },
      })
    );

    const detail = await api.getClient(
      buildInput({
        params: { clientId: created.body.client.id },
      })
    );

    assert.equal(detail.status, 200);
    assert.equal(detail.body.registrations.length, 1);
    assert.equal(detail.body.registrations[0].status, 'INACTIVE');

    const audit = await api.listClientAuditEvents(
      buildInput({
        params: { clientId: created.body.client.id },
      })
    );

    assert.equal(audit.status, 200);
    assert.equal(
      audit.body.items.some((item) => item.eventType === 'CLIENT_REGISTRATION_CREATED'),
      true
    );
    assert.equal(
      audit.body.items.some((item) => item.eventType === 'CLIENT_REGISTRATION_INACTIVATED'),
      true
    );
  });

  test('duplicate document and duplicate registration number return 409', async () => {
    const firstClient = await createPjClient();
    assert.equal(firstClient.status, 201);

    const duplicateClient = await createPjClient({
      legalName: 'Duplicado Ltda',
      tradeName: 'Duplicado Ltda',
    });

    assert.equal(duplicateClient.status, 409);

    const created = await createPfClient({
      fullName: 'Produtor Unico',
      cpf: '999.888.777-66',
    });

    const firstRegistration = await api.createClientRegistration(
      buildInput({
        params: { clientId: created.body.client.id },
        body: {
          registrationNumber: '0028617410051',
          registrationType: 'estadual',
          addressLine: 'Estrada Capitolio/Vargem Bonita, S/N',
          district: 'Zona Rural',
          city: 'Capitolio',
          state: 'MG',
          postalCode: '37930-000',
          complement: null,
        },
      })
    );

    assert.equal(firstRegistration.status, 201);

    const otherClient = await createPjClient({
      legalName: 'Atlantica Dois S/A',
      tradeName: 'Atlantica Dois S/A',
      cnpj: '11.222.333/0001-44',
    });

    const duplicateRegistration = await api.createClientRegistration(
      buildInput({
        params: { clientId: otherClient.body.client.id },
        body: {
          registrationNumber: '0028617410051',
          registrationType: 'estadual',
          addressLine: 'Rua A',
          district: 'Centro',
          city: 'Varginha',
          state: 'MG',
          postalCode: '37000-000',
          complement: null,
        },
      })
    );

    assert.equal(duplicateRegistration.status, 409);
  });

  test('POST /clients accepts optional commercialUserId and returns nested commercialUser', async () => {
    const user = await createTestUser('COMMERCIAL', { username: 'test-commercial-a' });

    const created = await createPjClient({ commercialUserId: user.id });

    assert.equal(created.status, 201);
    assert.deepEqual(created.body.client.commercialUser, {
      id: user.id,
      fullName: user.fullName,
    });
  });

  test('POST /clients rejects unknown commercialUserId with 422', async () => {
    const result = await createPjClient({
      commercialUserId: '00000000-0000-0000-0000-0000000099ff',
    });

    assert.equal(result.status, 422);
    assert.equal(result.body.error.details.field, 'commercialUserId');
  });

  test('POST /clients rejects inactive commercialUserId with 422', async () => {
    const user = await createTestUser('CLASSIFIER', {
      username: 'test-inactive',
      status: 'INACTIVE',
    });

    const result = await createPjClient({ commercialUserId: user.id });

    assert.equal(result.status, 422);
    assert.equal(result.body.error.details.code, 'COMMERCIAL_USER_INACTIVE');
  });

  test('PATCH /clients updates commercialUserId and records CLIENT_UPDATED with diff', async () => {
    const firstUser = await createTestUser('COMMERCIAL', { username: 'test-first' });
    const secondUser = await createTestUser('COMMERCIAL', { username: 'test-second' });

    const created = await createPjClient({ commercialUserId: firstUser.id });

    const updated = await api.updateClient(
      buildInput({
        params: { clientId: created.body.client.id },
        body: {
          commercialUserId: secondUser.id,
          reasonText: 'trocar responsavel',
        },
      })
    );

    assert.equal(updated.status, 200);
    assert.equal(updated.body.client.commercialUser.id, secondUser.id);
    assert.equal(updated.body.client.commercialUser.fullName, secondUser.fullName);

    const audit = await api.listClientAuditEvents(
      buildInput({ params: { clientId: created.body.client.id } })
    );

    assert.equal(audit.status, 200);
    const updateEvent = audit.body.items.find((i) => i.eventType === 'CLIENT_UPDATED');
    assert.ok(updateEvent);
    assert.deepEqual(updateEvent.payload.diff.before.commercialUserIds, [firstUser.id]);
    assert.deepEqual(updateEvent.payload.diff.after.commercialUserIds, [secondUser.id]);
  });

  test('PATCH /clients accepts null commercialUserId to unlink (Client INACTIVE)', async () => {
    const user = await createTestUser('COMMERCIAL', { username: 'test-unlinkable' });
    const created = await createPjClient({ commercialUserId: user.id });

    // Apos R1.3 a invariante "Client ACTIVE tem >=1 user na join" e
    // garantida pelo trigger DEFERRABLE: desvincular o unico user de um
    // Client ACTIVE viola o trigger. Para testar o caminho de unlink em
    // PATCH, primeiro inativamos o Client.
    await prisma.client.update({
      where: { id: created.body.client.id },
      data: { status: 'INACTIVE' },
    });

    const updated = await api.updateClient(
      buildInput({
        params: { clientId: created.body.client.id },
        body: {
          commercialUserId: null,
          reasonText: 'desvincular',
        },
      })
    );

    assert.equal(updated.status, 200);
    assert.equal(updated.body.client.commercialUser, null);
  });

  test('GET /clients filters by commercialUserId', async () => {
    const userA = await createTestUser('COMMERCIAL', { username: 'test-filter-a' });
    const userB = await createTestUser('COMMERCIAL', { username: 'test-filter-b' });

    const mine = await createPjClient({
      legalName: 'Cliente A',
      cnpj: '10.111.222/0001-11',
      commercialUserId: userA.id,
    });
    await createPjClient({
      legalName: 'Cliente B',
      cnpj: '20.222.333/0001-22',
      commercialUserId: userB.id,
    });
    await createPjClient({
      legalName: 'Cliente C',
      cnpj: '30.333.444/0001-33',
    });

    const filtered = await api.listClients(buildInput({ query: { commercialUserId: userA.id } }));

    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.page.total, 1);
    assert.equal(filtered.body.items[0].id, mine.body.client.id);
  });

  test('bulkUnlinkCommercialUser bloqueia quando user e sole custodian de Client ACTIVE', async () => {
    const targetUser = await createTestUser('COMMERCIAL', { username: 'test-bulk-sole' });
    const linkedA = await createPjClient({
      legalName: 'Sole Custodian A',
      cnpj: '40.444.555/0001-44',
      commercialUserId: targetUser.id,
    });

    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          await clientService.bulkUnlinkCommercialUser(
            tx,
            targetUser.id,
            actor,
            'tentando inativar'
          );
        }),
      (err) => {
        assert.equal(err.statusCode ?? err.status, 409);
        assert.equal(err.details?.code, 'COMMERCIAL_USER_HAS_SOLE_CUSTODIANS');
        assert.ok(err.details?.details?.clientIds?.includes(linkedA.body.client.id));
        return true;
      }
    );

    // Nada foi alterado: o link permanece intacto.
    const links = await prisma.clientCommercialUser.findMany({
      where: { userId: targetUser.id },
    });
    assert.equal(links.length, 1);
  });

  test('bulkUnlinkCommercialUser permite desvincular quando Client tem outros users', async () => {
    const targetUser = await createTestUser('COMMERCIAL', { username: 'test-bulk-shared' });
    const otherUser = await createTestUser('COMMERCIAL', { username: 'test-bulk-other2' });

    const sharedClient = await createPjClient({
      legalName: 'Shared Client',
      cnpj: '40.444.555/0001-99',
      commercialUserId: targetUser.id,
    });

    // Adiciona segundo user direto na join (cenario que so existira via UI multi-user em Fase 2;
    // aqui inserimos manualmente para validar o caminho onde nao ha sole custodian).
    await prisma.clientCommercialUser.create({
      data: { clientId: sharedClient.body.client.id, userId: otherUser.id },
    });

    await prisma.$transaction(async (tx) => {
      const result = await clientService.bulkUnlinkCommercialUser(
        tx,
        targetUser.id,
        actor,
        'desvinculado, outro user assume'
      );
      assert.equal(result.unlinkedCount, 1);
    });

    const remaining = await prisma.clientCommercialUser.findMany({
      where: { clientId: sharedClient.body.client.id },
    });
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].userId, otherUser.id);

    // Audit event registrado para o client afetado.
    const events = await prisma.clientAuditEvent.findMany({
      where: {
        eventType: 'CLIENT_UPDATED',
        targetClientId: sharedClient.body.client.id,
        reasonText: 'desvinculado, outro user assume',
      },
    });
    assert.equal(events.length, 1);
    assert.deepEqual(
      events[0].payload.diff.before.commercialUserIds.sort(),
      [otherUser.id, targetUser.id].sort()
    );
    assert.deepEqual(events[0].payload.diff.after.commercialUserIds, [otherUser.id]);
  });

  test('POST /clients dual-write: insere linha em client_commercial_user', async () => {
    const user = await createTestUser('COMMERCIAL', { username: 'test-dual-create' });
    const created = await createPjClient({ commercialUserId: user.id });

    assert.equal(created.status, 201);
    const links = await prisma.clientCommercialUser.findMany({
      where: { clientId: created.body.client.id },
    });
    assert.equal(links.length, 1);
    assert.equal(links[0].userId, user.id);
  });

  test('POST /clients sem commercialUserId nao cria linha em client_commercial_user', async () => {
    const created = await createPjClient({});
    assert.equal(created.status, 201);
    const links = await prisma.clientCommercialUser.findMany({
      where: { clientId: created.body.client.id },
    });
    assert.equal(links.length, 0);
  });

  test('PATCH /clients trocando commercialUserId faz swap atomico na join', async () => {
    const userA = await createTestUser('COMMERCIAL', { username: 'test-swap-a' });
    const userB = await createTestUser('COMMERCIAL', { username: 'test-swap-b' });

    const created = await createPjClient({ commercialUserId: userA.id });

    const updated = await api.updateClient(
      buildInput({
        params: { clientId: created.body.client.id },
        body: { commercialUserId: userB.id, reasonText: 'swap' },
      })
    );
    assert.equal(updated.status, 200);

    const links = await prisma.clientCommercialUser.findMany({
      where: { clientId: created.body.client.id },
    });
    assert.equal(links.length, 1);
    assert.equal(links[0].userId, userB.id);
  });

  test('GET /clients filtra por commercialUserId via tabela join', async () => {
    const userA = await createTestUser('COMMERCIAL', { username: 'test-filter-join-a' });
    const userB = await createTestUser('COMMERCIAL', { username: 'test-filter-join-b' });

    const mine = await createPjClient({
      legalName: 'Cliente Filtro A',
      cnpj: '11.111.222/0001-11',
      commercialUserId: userA.id,
    });
    await createPjClient({
      legalName: 'Cliente Filtro B',
      cnpj: '22.222.333/0001-22',
      commercialUserId: userB.id,
    });

    const filtered = await api.listClients(buildInput({ query: { commercialUserId: userA.id } }));
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.page.total, 1);
    assert.equal(filtered.body.items[0].id, mine.body.client.id);
  });

  // Triggers DEFERRABLE (R1.3): garantem invariante "Client ACTIVE tem >=1 user"

  test('Trigger DEFERRABLE: swap (delete old + insert new) na mesma tx passa', async () => {
    const userA = await createTestUser('COMMERCIAL', { username: 'test-trg-swap-a' });
    const userB = await createTestUser('COMMERCIAL', { username: 'test-trg-swap-b' });
    const created = await createPjClient({
      legalName: 'Trigger Swap',
      cnpj: '12.121.121/0001-12',
      commercialUserId: userA.id,
    });

    await prisma.$transaction(async (tx) => {
      await tx.clientCommercialUser.deleteMany({
        where: { clientId: created.body.client.id, userId: userA.id },
      });
      await tx.clientCommercialUser.create({
        data: { clientId: created.body.client.id, userId: userB.id },
      });
    });

    const links = await prisma.clientCommercialUser.findMany({
      where: { clientId: created.body.client.id },
    });
    assert.equal(links.length, 1);
    assert.equal(links[0].userId, userB.id);
  });

  test('Trigger bloqueia delete unico do ultimo user de Client ACTIVE', async () => {
    const user = await createTestUser('COMMERCIAL', { username: 'test-trg-block' });
    const created = await createPjClient({
      legalName: 'Trigger Block',
      cnpj: '13.131.313/0001-13',
      commercialUserId: user.id,
    });

    await assert.rejects(
      () =>
        prisma.clientCommercialUser.deleteMany({
          where: { clientId: created.body.client.id },
        }),
      /Active client cannot have zero commercial users/
    );

    // Verifica que nada mudou.
    const links = await prisma.clientCommercialUser.findMany({
      where: { clientId: created.body.client.id },
    });
    assert.equal(links.length, 1);
  });

  test('Trigger permite remover users quando Client e INACTIVE', async () => {
    const user = await createTestUser('COMMERCIAL', { username: 'test-trg-inactive' });
    const created = await createPjClient({
      legalName: 'Trigger Inactive',
      cnpj: '14.141.414/0001-14',
      commercialUserId: user.id,
    });
    await prisma.client.update({
      where: { id: created.body.client.id },
      data: { status: 'INACTIVE' },
    });

    await prisma.clientCommercialUser.deleteMany({
      where: { clientId: created.body.client.id },
    });

    const links = await prisma.clientCommercialUser.findMany({
      where: { clientId: created.body.client.id },
    });
    assert.equal(links.length, 0);
  });

  test('Trigger bloqueia reativacao de Client (INACTIVE -> ACTIVE) sem users', async () => {
    const user = await createTestUser('COMMERCIAL', { username: 'test-trg-reactivate' });
    const created = await createPjClient({
      legalName: 'Trigger Reactivate',
      cnpj: '15.151.515/0001-15',
      commercialUserId: user.id,
    });

    // Inativa Client e remove todos os users (permitido em INACTIVE).
    await prisma.client.update({
      where: { id: created.body.client.id },
      data: { status: 'INACTIVE' },
    });
    await prisma.clientCommercialUser.deleteMany({
      where: { clientId: created.body.client.id },
    });

    // Tentar reativar deve falhar — Client passaria a ACTIVE sem users.
    await assert.rejects(
      () =>
        prisma.client.update({
          where: { id: created.body.client.id },
          data: { status: 'ACTIVE' },
        }),
      /Active client cannot have zero commercial users/
    );

    const stillInactive = await prisma.client.findUnique({
      where: { id: created.body.client.id },
    });
    assert.equal(stillInactive.status, 'INACTIVE');
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
