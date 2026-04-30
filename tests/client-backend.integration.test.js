import test from 'node:test';
import assert from 'node:assert/strict';

import { PrismaClient } from '@prisma/client';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { LocalAuthService } from '../src/auth/local-auth-service.js';
import { ClientService } from '../src/clients/client-service.js';
import { generateValidCnpj, generateValidCpf } from './helpers/cnpj-generator.js';

// L5: counter local pra gerar CNPJs validos sequenciais nos testes.
let _cnpjSeed = 500;
function nextValidCnpj() {
  _cnpjSeed += 1;
  return generateValidCnpj(_cnpjSeed);
}

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
      'TRUNCATE TABLE client_audit_event, client_commercial_user, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
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

  // L5: PJ guarda cnpj + endereco + IE direto no Client. Sem units pra PJ.
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

  test('L5: POST /clients PF and PJ — creates and document derives correctly', async () => {
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
    assert.equal(pj.body.client.cnpj, '03936815000175');
  });

  test('L5: PJ create rejects without cnpj (PJ_REQUIRES_CNPJ)', async () => {
    const result = await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Sem CNPJ Ltda',
          tradeName: 'Sem CNPJ Ltda',
          phone: '35 3222-0495',
          isBuyer: true,
          isSeller: true,
        },
      })
    );

    assert.equal(result.status, 422);
  });

  test('L5: PJ create rejects units[] in body', async () => {
    const result = await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Atlantica',
          tradeName: 'Atlantica',
          cnpj: nextValidCnpj(),
          phone: '35 3222-0495',
          isBuyer: true,
          isSeller: true,
          units: [{ name: 'Unidade qualquer' }],
        },
      })
    );

    assert.equal(result.status, 422);
  });

  test('L5: PF create accepts units[] (fazendas)', async () => {
    const result = await api.createClient(
      buildInput({
        body: {
          personType: 'PF',
          fullName: 'Francisco Fazendeiro',
          cpf: generateValidCpf(700),
          phone: '35 99911-8089',
          isBuyer: false,
          isSeller: true,
          units: [
            {
              name: 'Fazenda Sao Joao',
              city: 'Sao Sebastiao do Paraiso',
              state: 'mg',
              car: 'MG-1',
            },
            { name: 'Fazenda Bom Retiro', city: 'Sao Sebastiao do Paraiso', state: 'mg' },
          ],
        },
      })
    );

    assert.equal(result.status, 201);
    assert.equal(result.body.client.units.length, 2);
    assert.equal(result.body.client.units[0].name, 'Fazenda Sao Joao');
    assert.equal(result.body.client.units[0].car, 'MG-1');
    assert.equal(result.body.client.units[0].state, 'MG');
  });

  test('L5: createUnit on PJ rejects with 422 CLIENT_PJ_HAS_NO_UNITS', async () => {
    const pj = await createPjClient();
    const res = await api.createClientUnit(
      buildInput({
        params: { clientId: pj.body.client.id },
        body: { name: 'Tentativa de filial' },
      })
    );
    assert.equal(res.status, 422);
  });

  test('L5: PF can createUnit (fazenda) and updateUnit', async () => {
    const pf = await createPfClient();
    const created = await api.createClientUnit(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: {
          name: 'Fazenda Nova',
          city: 'Varginha',
          state: 'mg',
          car: 'MG-99',
        },
      })
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.unit.name, 'Fazenda Nova');
    assert.equal(created.body.unit.car, 'MG-99');

    const updated = await api.updateClientUnit(
      buildInput({
        params: { clientId: pf.body.client.id, unitId: created.body.unit.id },
        body: { city: 'Tres Pontas', reasonText: 'corrigir cidade' },
      })
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.unit.city, 'Tres Pontas');
  });

  test('L5: PF inactivateUnit + reactivateUnit work', async () => {
    const pf = await createPfClient();
    const created = await api.createClientUnit(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: { name: 'Fazenda X' },
      })
    );

    const inactivated = await api.inactivateClientUnit(
      buildInput({
        params: { clientId: pf.body.client.id, unitId: created.body.unit.id },
        body: { reasonText: 'fim de ciclo' },
      })
    );
    assert.equal(inactivated.status, 200);
    assert.equal(inactivated.body.unit.status, 'INACTIVE');

    const reactivated = await api.reactivateClientUnit(
      buildInput({
        params: { clientId: pf.body.client.id, unitId: created.body.unit.id },
        body: { reasonText: 'voltou' },
      })
    );
    assert.equal(reactivated.status, 200);
    assert.equal(reactivated.body.unit.status, 'ACTIVE');
  });

  test('L5: updateUnit on PJ rejects with 422', async () => {
    const pj = await createPjClient();
    // injeta unit "ilegal" via prisma direto, somente para garantir que update rejeita
    const ghostId = '00000000-0000-0000-0000-000000099999';
    const res = await api.updateClientUnit(
      buildInput({
        params: { clientId: pj.body.client.id, unitId: ghostId },
        body: { name: 'X', reasonText: 'tentativa' },
      })
    );
    assert.equal(res.status, 422);
  });

  test('L5: PATCH /clients updates client fields and PJ accepts cnpj/endereco update', async () => {
    const created = await createPjClient();
    const clientId = created.body.client.id;

    const updated = await api.updateClient(
      buildInput({
        params: { clientId },
        body: {
          legalName: 'G A S Comercio de Cafe Sociedade LTDA',
          tradeName: 'G A S Comercio de Cafe Sociedade LTDA',
          city: 'Belo Horizonte',
          state: 'mg',
          isBuyer: true,
          isSeller: true,
          reasonText: 'corrigir cadastro',
        },
      })
    );

    assert.equal(updated.status, 200);
    assert.equal(updated.body.client.legalName, 'G A S Comercio de Cafe Sociedade LTDA');
    assert.equal(updated.body.client.city, 'Belo Horizonte');
    assert.equal(updated.body.client.state, 'MG');

    const audit = await api.listClientAuditEvents(buildInput({ params: { clientId } }));
    assert.equal(audit.status, 200);
    const updatedEvent = audit.body.items.find((it) => it.eventType === 'CLIENT_UPDATED');
    assert.ok(updatedEvent, 'CLIENT_UPDATED event esperado');
    assert.equal(updatedEvent.reasonText, 'corrigir cadastro');
  });

  test('L5: cnpj UNIQUE em Client — duplicado retorna 409', async () => {
    const cnpj = nextValidCnpj();
    const first = await createPjClient({ cnpj });
    assert.equal(first.status, 201);

    const second = await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Outra empresa',
          tradeName: 'Outra empresa',
          cnpj,
          phone: '35 3222-1111',
          isBuyer: true,
          isSeller: true,
        },
      })
    );

    assert.equal(second.status, 409);
  });

  test('L5: PATCH /clients rejects switching personType (PF<->PJ)', async () => {
    const pf = await createPfClient();
    const result = await api.updateClient(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: {
          personType: 'PJ',
          legalName: 'Tentativa',
          reasonText: 'tentando trocar',
        },
      })
    );

    assert.equal(result.status, 422);
  });

  test('L5: lookup by full CNPJ resolves PJ direct', async () => {
    const cnpj = nextValidCnpj();
    const pj = await createPjClient({ cnpj, isBuyer: true, isSeller: true });

    const result = await api.lookupClients(
      buildInput({
        query: { search: cnpj, kind: 'any' },
      })
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.items.length, 1);
    assert.equal(result.body.items[0].id, pj.body.client.id);
  });

  test('L5: email validation rejects malformed', async () => {
    const result = await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Empresa',
          tradeName: 'Empresa',
          cnpj: nextValidCnpj(),
          phone: '35 3222-0495',
          email: 'naoeumemail',
          isBuyer: true,
          isSeller: true,
        },
      })
    );

    assert.equal(result.status, 422);
  });

  test('L5: inactivateClient + reactivateClient happy path', async () => {
    // Para reativar um cliente ACTIVE precisa ter pelo menos 1 user
    // comercial vinculado (trigger DB).
    const user = await createTestUser('COMMERCIAL');
    const created = await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Atlantica Lifecycle',
          tradeName: 'Atlantica Lifecycle',
          cnpj: nextValidCnpj(),
          phone: '35 3222-0495',
          isBuyer: true,
          isSeller: true,
          commercialUserIds: [user.id],
        },
      })
    );
    assert.equal(created.status, 201);
    const clientId = created.body.client.id;

    const inactivated = await api.inactivateClient(
      buildInput({
        params: { clientId },
        body: { reasonText: 'pausado temporariamente' },
      })
    );
    assert.equal(inactivated.status, 200);
    assert.equal(inactivated.body.client.status, 'INACTIVE');

    const reactivated = await api.reactivateClient(
      buildInput({
        params: { clientId },
        body: { reasonText: 'voltou ativo' },
      })
    );
    assert.equal(reactivated.status, 200);
    assert.equal(reactivated.body.client.status, 'ACTIVE');
  });

  test('GET /clients lookup filters active buyers and sellers', async () => {
    const sellerOnly = await createPfClient();
    const buyerOnly = await createPjClient({
      legalName: 'Comprador Export Ltda',
      tradeName: 'Comprador Export Ltda',
      cnpj: nextValidCnpj(),
      isBuyer: true,
      isSeller: false,
    });

    const ownerLookup = await api.lookupClients(
      buildInput({
        query: { search: 'Francisco', kind: 'owner' },
      })
    );
    assert.equal(ownerLookup.status, 200);
    assert.equal(ownerLookup.body.items.length, 1);
    assert.equal(ownerLookup.body.items[0].id, sellerOnly.body.client.id);

    const buyerLookup = await api.lookupClients(
      buildInput({
        query: { search: 'Comprador', kind: 'buyer' },
      })
    );
    assert.equal(buyerLookup.status, 200);
    assert.equal(buyerLookup.body.items.length, 1);
    assert.equal(buyerLookup.body.items[0].id, buyerOnly.body.client.id);
  });

  test('L5: ClientUnit rejects isPrimary, registrationType, cnpjOrder in input', async () => {
    const pf = await createPfClient();

    const withIsPrimary = await api.createClientUnit(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: { name: 'Faz', isPrimary: true },
      })
    );
    assert.equal(withIsPrimary.status, 422);

    const withType = await api.createClientUnit(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: { name: 'Faz', registrationType: 'estadual' },
      })
    );
    assert.equal(withType.status, 422);

    const withOrder = await api.createClientUnit(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: { name: 'Faz', cnpjOrder: '0001' },
      })
    );
    assert.equal(withOrder.status, 422);
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
