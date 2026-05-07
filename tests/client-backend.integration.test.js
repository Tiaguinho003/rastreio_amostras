import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { IdempotencyStore } from '../src/api/v1/idempotency-helper.js';
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
      'TRUNCATE TABLE client_audit_event, client_commercial_user, sample_movement, client_unit, client, print_job, sample_attachment, sample_event, sample, idempotency_record RESTART IDENTITY CASCADE'
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
      idempotencyStore: new IdempotencyStore({ prisma }),
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

  test('Fase 0: PF criado sem units recebe Fazenda 1 placeholder', async () => {
    const result = await createPfClient({ cpf: generateValidCpf(701) });
    assert.equal(result.status, 201);
    assert.equal(result.body.client.units.length, 1);
    const fazenda = result.body.client.units[0];
    assert.equal(fazenda.name, 'Fazenda 1');
    assert.equal(fazenda.code, 1);
    assert.equal(fazenda.status, 'ACTIVE');
    assert.equal(fazenda.cnpj, null);
    assert.equal(fazenda.addressLine, null);
    assert.equal(fazenda.city, null);
    assert.equal(fazenda.state, null);
    assert.equal(fazenda.car, null);
  });

  test('Fase 0: PF criado com units: [] explicito tambem recebe Fazenda 1', async () => {
    const result = await createPfClient({ cpf: generateValidCpf(702), units: [] });
    assert.equal(result.status, 201);
    assert.equal(result.body.client.units.length, 1);
    assert.equal(result.body.client.units[0].name, 'Fazenda 1');
  });

  test('Fase 0: PF com units explicitas nao duplica Fazenda 1', async () => {
    const result = await createPfClient({
      cpf: generateValidCpf(703),
      units: [{ name: 'Fazenda Boa Vista' }],
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.client.units.length, 1);
    assert.equal(result.body.client.units[0].name, 'Fazenda Boa Vista');
  });

  test('Fase 0: PJ continua sem unit (auto-create nao se aplica)', async () => {
    const result = await createPjClient({ cnpj: nextValidCnpj() });
    assert.equal(result.status, 201);
    assert.equal(result.body.client.units.length, 0);
  });

  test('Fase 0: audit event CLIENT_UNIT_CREATED emitido para Fazenda 1 auto-criada', async () => {
    const pf = await createPfClient({ cpf: generateValidCpf(704) });
    assert.equal(pf.status, 201);
    const audit = await api.listClientAuditEvents(
      buildInput({ params: { clientId: pf.body.client.id } })
    );
    assert.equal(audit.status, 200);
    const unitCreated = audit.body.items.filter((it) => it.eventType === 'CLIENT_UNIT_CREATED');
    assert.equal(unitCreated.length, 1, 'um unico CLIENT_UNIT_CREATED para Fazenda 1');
    assert.equal(unitCreated[0].targetUnit?.id, pf.body.client.units[0].id);
    assert.equal(unitCreated[0].targetUnit?.name, 'Fazenda 1');
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

  test('Q-01: getClient com onlyActive=true filtra unidades inativas', async () => {
    const pf = await createPfClient();
    const u1 = await api.createClientUnit(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: { name: 'Fazenda Ativa' },
      })
    );
    const u2 = await api.createClientUnit(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: { name: 'Fazenda Inativa' },
      })
    );
    await api.inactivateClientUnit(
      buildInput({
        params: { clientId: pf.body.client.id, unitId: u2.body.unit.id },
        body: { reasonText: 'pausa' },
      })
    );

    // Sem param: retorna todas (legado).
    // Fase 0: PF nasce com Fazenda 1 auto-criada, entao total = 3 (placeholder + u1 + u2).
    const allUnits = await api.getClient(buildInput({ params: { clientId: pf.body.client.id } }));
    assert.equal(allUnits.status, 200);
    assert.equal(allUnits.body.units.length, 3);

    // Com onlyActive=true: filtra inativas. Restam Fazenda 1 (placeholder) + u1.
    const activeOnly = await api.getClient(
      buildInput({
        params: { clientId: pf.body.client.id },
        query: { onlyActive: 'true' },
      })
    );
    assert.equal(activeOnly.status, 200);
    assert.equal(activeOnly.body.units.length, 2);
    const u1InActive = activeOnly.body.units.find((u) => u.id === u1.body.unit.id);
    const u2InActive = activeOnly.body.units.find((u) => u.id === u2.body.unit.id);
    assert.ok(u1InActive, 'u1 deve aparecer entre as ativas');
    assert.equal(u1InActive.status, 'ACTIVE');
    assert.ok(!u2InActive, 'u2 (inativada) nao deve aparecer entre as ativas');
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

  test('B1 (#post-5): dois PJ com mesma cnpjRoot coexistem (F7.1A nao bloqueia)', async () => {
    // Cenario real: Coopercitrus matriz (CNPJ XXXXXXXX/0001-XX) +
    // filial (CNPJ XXXXXXXX/0002-XX) sao Clients PJ DISTINTOS pos-L5.
    // Ambos tem mesma cnpjRoot (8 primeiros digitos). F7.1A dropou o
    // UNIQUE em cnpjRoot exatamente para suportar esse cenario.
    // generateValidCnpj(seed, branchSeq) gera CNPJs com mesma raiz e
    // sequencia de filial diferente — checksum valido pra ambos.
    const seed = 8800;
    const cnpjMatriz = generateValidCnpj(seed, 1);
    const cnpjFilial = generateValidCnpj(seed, 2);
    const cnpjRootEsperado = cnpjMatriz.slice(0, 8);

    const matriz = await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Grupo Empresarial Matriz LTDA',
          tradeName: 'Grupo Matriz',
          cnpj: cnpjMatriz,
          phone: '35 3222-9001',
          isBuyer: true,
          isSeller: false,
        },
      })
    );
    assert.equal(matriz.status, 201);

    const filial = await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Grupo Empresarial Filial Patos LTDA',
          tradeName: 'Grupo Filial Patos',
          cnpj: cnpjFilial,
          phone: '35 3222-9002',
          isBuyer: true,
          isSeller: false,
        },
      })
    );
    assert.equal(filial.status, 201, 'segundo PJ com mesma cnpjRoot deve ser permitido pos-F7.1A');
    assert.notEqual(filial.body.client.id, matriz.body.client.id);
    assert.notEqual(filial.body.client.cnpj, matriz.body.client.cnpj);

    // Confirma cnpjRoot no DB (toClientSummary nao expoe esse campo —
    // verificamos direto na fonte da verdade).
    const matrizDb = await prisma.client.findUnique({
      where: { id: matriz.body.client.id },
      select: { cnpjRoot: true },
    });
    const filialDb = await prisma.client.findUnique({
      where: { id: filial.body.client.id },
      select: { cnpjRoot: true },
    });
    assert.equal(matrizDb.cnpjRoot, cnpjRootEsperado);
    assert.equal(
      filialDb.cnpjRoot,
      cnpjRootEsperado,
      'matriz e filial compartilham cnpjRoot — nao ha UNIQUE em cnpjRoot pos-F7.1A'
    );
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

  // ============================================================
  // #5 — Q-02 + Q-25: Idempotency-Key middleware
  // ============================================================

  test('#5 Q-02: POST /clients sem Idempotency-Key — sem cache, executa duas vezes', async () => {
    // Sem header, 2 chamadas com mesmo CNPJ — segunda falha por UNIQUE.
    const cnpj1 = nextValidCnpj();
    const r1 = await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Sem Header LTDA',
          tradeName: 'Sem Header',
          cnpj: cnpj1,
          phone: '35 3333-1111',
          isBuyer: true,
          isSeller: false,
        },
      })
    );
    assert.equal(r1.status, 201);
    const r2 = await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Sem Header LTDA',
          tradeName: 'Sem Header',
          cnpj: cnpj1,
          phone: '35 3333-1111',
          isBuyer: true,
          isSeller: false,
        },
      })
    );
    // Sem cache, segundo INSERT colide com UNIQUE de cnpj.
    assert.equal(r2.status, 409);
  });

  test('#5 Q-02: POST /clients com mesma Idempotency-Key — segunda chamada retorna cached', async () => {
    const key = 'idem-key-create-client-' + Math.random().toString(36).slice(2);
    const cnpj = nextValidCnpj();
    const headersWithKey = { ...authHeaders, 'idempotency-key': key };

    const r1 = await api.createClient(
      buildInput({
        headers: headersWithKey,
        body: {
          personType: 'PJ',
          legalName: 'Idempotente LTDA',
          tradeName: 'Idem',
          cnpj,
          phone: '35 3333-2222',
          isBuyer: true,
          isSeller: true,
        },
      })
    );
    assert.equal(r1.status, 201);
    const firstId = r1.body.client.id;

    // Segunda chamada — mesma key, mesmo body → cached.
    const r2 = await api.createClient(
      buildInput({
        headers: headersWithKey,
        body: {
          personType: 'PJ',
          legalName: 'Idempotente LTDA',
          tradeName: 'Idem',
          cnpj,
          phone: '35 3333-2222',
          isBuyer: true,
          isSeller: true,
        },
      })
    );
    assert.equal(r2.status, 201);
    assert.equal(r2.body.client.id, firstId, 'cache hit retorna mesmo ID');
    assert.equal(r2.idempotent, true, 'flag idempotent setada');

    // Confirma que so existe 1 cliente no DB para esse CNPJ.
    const count = await prisma.client.count({ where: { cnpj } });
    assert.equal(count, 1);
  });

  test('#5 A1: mesma key + body diferente → retorna cached do primeiro body', async () => {
    const key = 'idem-key-body-diff-' + Math.random().toString(36).slice(2);
    const cnpj1 = nextValidCnpj();
    const cnpj2 = nextValidCnpj();
    const headersWithKey = { ...authHeaders, 'idempotency-key': key };

    const r1 = await api.createClient(
      buildInput({
        headers: headersWithKey,
        body: {
          personType: 'PJ',
          legalName: 'Body Original LTDA',
          tradeName: 'Original',
          cnpj: cnpj1,
          phone: '35 3333-3333',
          isBuyer: true,
          isSeller: true,
        },
      })
    );
    assert.equal(r1.status, 201);

    const r2 = await api.createClient(
      buildInput({
        headers: headersWithKey,
        body: {
          personType: 'PJ',
          legalName: 'Body Diferente LTDA',
          tradeName: 'Diferente',
          cnpj: cnpj2,
          phone: '99 9999-9999',
          isBuyer: false,
          isSeller: false,
        },
      })
    );
    // A1: ignora body, retorna cached do primeiro.
    assert.equal(r2.status, 201);
    assert.equal(r2.body.client.legalName, 'Body Original LTDA');
    assert.equal(r2.body.client.cnpj, cnpj1);
  });

  test('#5 B1: erros 4xx tambem sao cacheados', async () => {
    const key = 'idem-key-error-cache-' + Math.random().toString(36).slice(2);
    const headersWithKey = { ...authHeaders, 'idempotency-key': key };

    // Primeira chamada: PJ sem cnpj → 422 PJ_REQUIRES_CNPJ
    const r1 = await api.createClient(
      buildInput({
        headers: headersWithKey,
        body: {
          personType: 'PJ',
          legalName: 'Sem CNPJ Ltda',
          tradeName: 'Sem CNPJ',
          phone: '35 3333-4444',
          isBuyer: true,
          isSeller: true,
        },
      })
    );
    assert.equal(r1.status, 422);

    // Segunda chamada — mesma key, body completamente diferente (validacao
    // passaria) — mas B1 cache TUDO, entao retorna o 422 cached.
    const r2 = await api.createClient(
      buildInput({
        headers: headersWithKey,
        body: {
          personType: 'PJ',
          legalName: 'Com CNPJ LTDA',
          tradeName: 'Com',
          cnpj: nextValidCnpj(),
          phone: '35 3333-4444',
          isBuyer: true,
          isSeller: true,
        },
      })
    );
    assert.equal(r2.status, 422, 'erro cacheado retorna mesmo status');
    assert.equal(r2.idempotent, true);
  });

  test('#5 T8: scope persiste actorUserId — record gravado contem user no scope', async () => {
    const key = 'idem-key-scope-' + Math.random().toString(36).slice(2);
    const cnpj = nextValidCnpj();
    const headersWithKey = { ...authHeaders, 'idempotency-key': key };

    const r1 = await api.createClient(
      buildInput({
        headers: headersWithKey,
        body: {
          personType: 'PJ',
          legalName: 'Scope Check LTDA',
          tradeName: 'Scope',
          cnpj,
          phone: '35 3333-5555',
          isBuyer: true,
          isSeller: false,
        },
      })
    );
    assert.equal(r1.status, 201);

    // T8: scope deve incluir actor.actorUserId no formato
    // 'POST /clients:user-<actorUserId>'.
    const records = await prisma.idempotencyRecord.findMany({
      where: { key },
    });
    assert.equal(records.length, 1, 'um record persistido');
    assert.ok(
      records[0].scope.includes(`user-${actor.actorUserId}`),
      `scope inclui actorUserId, recebido: ${records[0].scope}`
    );
    assert.ok(records[0].scope.startsWith('POST /clients:'), 'scope tem prefixo de rota');
  });

  test('B3 (#post-5): pre-populando idempotency_record exercita cache hit (replay path)', async () => {
    // Simula o cenario de "outro request ja gravou primeiro" populando
    // diretamente a tabela idempotency_record antes do api call. O caminho
    // exercitado e store.get hit (linha withIdempotency:117) que retorna
    // o cached sem chamar o handler. Garante que o body cacheado ganha
    // mesmo se for completamente diferente do que o handler retornaria.
    const key = 'b3-prepopulated-' + Math.random().toString(36).slice(2);
    const scope = `POST /clients:user-${actor.actorUserId}`;
    const cachedBody = {
      client: {
        id: '00000000-0000-4000-8000-000000000999',
        code: 9999,
        legalName: 'PRE-POPULATED FROM CACHE',
      },
    };
    await prisma.idempotencyRecord.create({
      data: {
        id: randomUUID(),
        scope,
        key,
        statusCode: 201,
        responseBody: cachedBody,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // Tenta criar com mesma key + body completamente novo. Cache hit
    // antes do handler executar — handler nao roda, body cacheado retorna.
    const r = await api.createClient(
      buildInput({
        headers: { ...authHeaders, 'idempotency-key': key },
        body: {
          personType: 'PJ',
          legalName: 'Body Novo Que Nao Sera Usado LTDA',
          tradeName: 'Body Novo',
          cnpj: nextValidCnpj(),
          phone: '35 3333-9999',
          isBuyer: true,
          isSeller: true,
        },
      })
    );

    assert.equal(r.status, 201);
    assert.equal(r.body.client.id, '00000000-0000-4000-8000-000000000999');
    assert.equal(r.body.client.legalName, 'PRE-POPULATED FROM CACHE');
    assert.equal(r.idempotent, true);

    // Confirma que NENHUM cliente novo foi criado pelo handler.
    const count = await prisma.client.count({
      where: { legalName: 'Body Novo Que Nao Sera Usado LTDA' },
    });
    assert.equal(count, 0, 'handler nao deve ter rodado — cache hit');
  });

  test('#5 Q-02: POST /clients/:id/units com Idempotency-Key — segunda chamada retorna cached', async () => {
    const pf = await createPfClient();
    const key = 'idem-key-create-unit-' + Math.random().toString(36).slice(2);
    const headersWithKey = { ...authHeaders, 'idempotency-key': key };

    const r1 = await api.createClientUnit(
      buildInput({
        headers: headersWithKey,
        params: { clientId: pf.body.client.id },
        body: { name: 'Fazenda Idempotente' },
      })
    );
    assert.equal(r1.status, 201);
    const firstUnitId = r1.body.unit.id;

    const r2 = await api.createClientUnit(
      buildInput({
        headers: headersWithKey,
        params: { clientId: pf.body.client.id },
        body: { name: 'Fazenda Idempotente' },
      })
    );
    assert.equal(r2.status, 201);
    assert.equal(r2.body.unit.id, firstUnitId);
    assert.equal(r2.idempotent, true);

    // Confirma que so 1 unit nova foi criada (alem da Fazenda 1 placeholder
    // auto-criada pela Fase 0): 1 placeholder + 1 idempotente = 2.
    const count = await prisma.clientUnit.count({
      where: { clientId: pf.body.client.id },
    });
    assert.equal(count, 2);
  });

  // ============================================================
  // #6 — Q-05 + Q-08: inativacao em cascata
  // ============================================================

  // Helper: cria sample diretamente no DB vinculada ao cliente. Insere
  // tambem o evento inicial SAMPLE_RECEIVED para satisfazer o trigger
  // append-only de sample_event ("first event must be SAMPLE_RECEIVED").
  async function createSampleForClient(
    clientId,
    { status = 'CLASSIFIED', soldSacks = 0, lostSacks = 0 } = {}
  ) {
    const id = randomUUID();
    await prisma.sample.create({
      data: {
        id,
        ownerClientId: clientId,
        status,
        declaredOwner: 'Test Owner',
        declaredSacks: 50,
        soldSacks,
        lostSacks,
        lastEventSequence: status === 'INVALIDATED' ? 0 : 1,
      },
    });
    // Trigger append-only de sample_event exige SAMPLE_RECEIVED como primeiro
    // evento. Para samples ja INVALIDATED no setup de tests, nao podemos
    // inserir eventos posteriormente (trigger rejeita "cannot append events
    // to INVALIDATED"). Pulamos o seed de evento — esses samples sao usados
    // apenas como "ja terminais" no cascade, nao recebem novos eventos.
    if (status !== 'INVALIDATED') {
      await prisma.sampleEvent.create({
        data: {
          eventId: randomUUID(),
          sampleId: id,
          sequenceNumber: 1,
          eventType: 'SAMPLE_RECEIVED',
          schemaVersion: 1,
          occurredAt: new Date(),
          actorType: 'USER',
          actorUserId: actor.actorUserId,
          source: 'WEB',
          payload: { receivedChannel: 'in_person' },
          requestId: randomUUID(),
          toStatus: 'PHYSICAL_RECEIVED',
          metadataModule: 'REGISTRATION',
        },
      });
    }
    return id;
  }

  test('#6 E1: inactivateClient rejeita 409 CLIENT_HAS_ACTIVE_SAMPLES quando ha samples ativas', async () => {
    const pf = await createPfClient();
    await createSampleForClient(pf.body.client.id, { status: 'CLASSIFIED' });
    await createSampleForClient(pf.body.client.id, { status: 'REGISTRATION_CONFIRMED' });

    const result = await api.inactivateClient(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: { reasonText: 'fim de relacionamento' },
      })
    );

    assert.equal(result.status, 409);
    assert.equal(result.body.error.details.code, 'CLIENT_HAS_ACTIVE_SAMPLES');
    assert.equal(result.body.error.details.details.activeSampleCount, 2);
    assert.equal(result.body.error.details.details.activeSamples.length, 2);
  });

  test('#6 E1: inactivateClient ainda funciona sem samples ativas', async () => {
    const pf = await createPfClient();
    const result = await api.inactivateClient(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: { reasonText: 'sem samples' },
      })
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.client.status, 'INACTIVE');
  });

  test('#6 happy path: inactivateClientWithCascade invalida samples + cliente', async () => {
    const pf = await createPfClient();
    const s1 = await createSampleForClient(pf.body.client.id, { status: 'CLASSIFIED' });
    const s2 = await createSampleForClient(pf.body.client.id, { status: 'REGISTRATION_CONFIRMED' });

    const result = await api.inactivateClientWithCascade(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: { confirmedSampleIds: [s1, s2], reasonText: 'fim do produtor' },
      })
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.client.status, 'INACTIVE');
    assert.equal(result.body.cascade.cascadedSampleCount, 2);
    assert.deepEqual(result.body.cascade.cascadedSampleIds.sort(), [s1, s2].sort());
    assert.deepEqual(result.body.cascade.skippedSampleIds, []);
    assert.ok(result.body.cascade.batchId, 'batchId presente');

    // Confirma DB: ambas samples INVALIDATED.
    const samples = await prisma.sample.findMany({
      where: { id: { in: [s1, s2] } },
      select: { id: true, status: true },
    });
    assert.equal(samples.filter((s) => s.status === 'INVALIDATED').length, 2);

    // Audit SAMPLE_INVALIDATED criado pra cada sample.
    const events = await prisma.sampleEvent.findMany({
      where: { sampleId: { in: [s1, s2] }, eventType: 'SAMPLE_INVALIDATED' },
      select: { sampleId: true, payload: true },
    });
    assert.equal(events.length, 2);
    for (const evt of events) {
      assert.equal(evt.payload.reason, 'OWNER_INACTIVATED');
      assert.equal(evt.payload.batchId, result.body.cascade.batchId);
    }
  });

  test('#6 A1 silencioso: confirmedSampleIds com ID ja INVALIDATED e pulado', async () => {
    const pf = await createPfClient();
    const s1 = await createSampleForClient(pf.body.client.id, { status: 'CLASSIFIED' });
    const s2 = await createSampleForClient(pf.body.client.id, { status: 'INVALIDATED' });

    const result = await api.inactivateClientWithCascade(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: { confirmedSampleIds: [s1, s2] },
      })
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.cascade.cascadedSampleCount, 1);
    assert.deepEqual(result.body.cascade.cascadedSampleIds, [s1]);
    assert.deepEqual(result.body.cascade.skippedSampleIds, [s2]);
  });

  test('#6 C1: cascade rejeita 409 se algum sample tem soldSacks > 0', async () => {
    const pf = await createPfClient();
    const s1 = await createSampleForClient(pf.body.client.id, { status: 'CLASSIFIED' });
    const s2 = await createSampleForClient(pf.body.client.id, {
      status: 'CLASSIFIED',
      soldSacks: 10,
    });

    const result = await api.inactivateClientWithCascade(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: { confirmedSampleIds: [s1, s2] },
      })
    );

    assert.equal(result.status, 409);
    assert.equal(result.body.error.details.code, 'SAMPLES_HAVE_ACTIVE_MOVEMENTS');
    assert.deepEqual(result.body.error.details.details.sampleIds, [s2]);

    // Confirma que NADA foi alterado (transacao rollback).
    const sampleAfter = await prisma.sample.findUnique({
      where: { id: s1 },
      select: { status: true },
    });
    assert.equal(sampleAfter.status, 'CLASSIFIED');
    const clientAfter = await prisma.client.findUnique({
      where: { id: pf.body.client.id },
      select: { status: true },
    });
    assert.equal(clientAfter.status, 'ACTIVE');
  });

  test('#6 D2: reasonText opcional no cascade', async () => {
    const pf = await createPfClient();
    const s1 = await createSampleForClient(pf.body.client.id);

    const result = await api.inactivateClientWithCascade(
      buildInput({
        params: { clientId: pf.body.client.id },
        body: { confirmedSampleIds: [s1] }, // sem reasonText
      })
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.client.status, 'INACTIVE');
  });

  test('#6 B1: reactivateClient NAO reativa samples invalidadas pelo cascade', async () => {
    // Cliente PF com user comercial — pre-requisito do trigger pra reativar.
    const user = await createTestUser('COMMERCIAL');
    const created = await api.createClient(
      buildInput({
        body: {
          personType: 'PF',
          fullName: 'Cliente Teste B1',
          cpf: generateValidCpf(800),
          phone: '35 99911-8089',
          isBuyer: false,
          isSeller: true,
          commercialUserIds: [user.id],
        },
      })
    );
    assert.equal(created.status, 201);
    const clientId = created.body.client.id;
    const s1 = await createSampleForClient(clientId);

    await api.inactivateClientWithCascade(
      buildInput({
        params: { clientId },
        body: { confirmedSampleIds: [s1], reasonText: 'pausa' },
      })
    );

    const reactivated = await api.reactivateClient(
      buildInput({
        params: { clientId },
        body: { reasonText: 'voltou' },
      })
    );

    assert.equal(reactivated.status, 200);
    assert.equal(reactivated.body.client.status, 'ACTIVE');

    // Sample continua INVALIDATED — terminal (B1).
    const sample = await prisma.sample.findUnique({
      where: { id: s1 },
      select: { status: true },
    });
    assert.equal(sample.status, 'INVALIDATED');
  });

  // 14.6.C: sort alfabetico server-side + cursor alfabetico (displayName, id).
  test('14.6.C: listClients retorna em ordem alfabetica de displayName', async () => {
    // PFs com nomes determinados em ordem nao-alfabetica de criacao.
    const seedNames = ['Eduardo', 'Bruno', 'Daniel', 'Ana', 'Carlos'];
    for (const name of seedNames) {
      await api.createClient(
        buildInput({
          body: {
            personType: 'PF',
            fullName: name,
            cpf: generateValidCpf(seedNames.indexOf(name) + 100),
            phone: '35 99000-0000',
            isBuyer: false,
            isSeller: true,
          },
        })
      );
    }

    const result = await api.listClients(buildInput({ query: { limit: '10' } }));
    assert.equal(result.status, 200);
    const names = result.body.items.map((c) => c.fullName);
    assert.deepEqual(names, ['Ana', 'Bruno', 'Carlos', 'Daniel', 'Eduardo']);
  });

  test('14.6.C: cursor alfabetico avanca corretamente entre paginas', async () => {
    const seedNames = ['Ana', 'Bruno', 'Carlos', 'Daniel', 'Eduardo'];
    for (let idx = 0; idx < seedNames.length; idx += 1) {
      await api.createClient(
        buildInput({
          body: {
            personType: 'PF',
            fullName: seedNames[idx],
            cpf: generateValidCpf(idx + 200),
            phone: '35 99000-0000',
            isBuyer: false,
            isSeller: true,
          },
        })
      );
    }

    const page1 = await api.listClients(buildInput({ query: { limit: '2' } }));
    assert.equal(page1.status, 200);
    assert.deepEqual(
      page1.body.items.map((c) => c.fullName),
      ['Ana', 'Bruno']
    );
    assert.ok(page1.body.page.nextCursor);
    assert.equal(typeof page1.body.page.nextCursor.displayName, 'string');
    assert.equal(typeof page1.body.page.nextCursor.id, 'string');

    const page2 = await api.listClients(
      buildInput({
        query: {
          limit: '2',
          cursorDisplayName: page1.body.page.nextCursor.displayName,
          cursorId: page1.body.page.nextCursor.id,
        },
      })
    );
    assert.equal(page2.status, 200);
    assert.deepEqual(
      page2.body.items.map((c) => c.fullName),
      ['Carlos', 'Daniel']
    );
    assert.ok(page2.body.page.nextCursor);

    const page3 = await api.listClients(
      buildInput({
        query: {
          limit: '2',
          cursorDisplayName: page2.body.page.nextCursor.displayName,
          cursorId: page2.body.page.nextCursor.id,
        },
      })
    );
    assert.equal(page3.status, 200);
    assert.deepEqual(
      page3.body.items.map((c) => c.fullName),
      ['Eduardo']
    );
    assert.equal(page3.body.page.nextCursor, null);
  });

  test('14.6.C: empate de displayName desempata por id (cursor estavel)', async () => {
    // 2 PFs com mesmo fullName — backend deve desempatar por id ASC.
    await api.createClient(
      buildInput({
        body: {
          personType: 'PF',
          fullName: 'Joao Silva',
          cpf: generateValidCpf(300),
          phone: '35 99000-0000',
          isBuyer: false,
          isSeller: true,
        },
      })
    );
    await api.createClient(
      buildInput({
        body: {
          personType: 'PF',
          fullName: 'Joao Silva',
          cpf: generateValidCpf(301),
          phone: '35 99000-0001',
          isBuyer: false,
          isSeller: true,
        },
      })
    );

    const page1 = await api.listClients(buildInput({ query: { limit: '1' } }));
    assert.equal(page1.status, 200);
    assert.equal(page1.body.items.length, 1);
    const firstId = page1.body.items[0].id;

    const page2 = await api.listClients(
      buildInput({
        query: {
          limit: '1',
          cursorDisplayName: page1.body.page.nextCursor.displayName,
          cursorId: page1.body.page.nextCursor.id,
        },
      })
    );
    assert.equal(page2.status, 200);
    assert.equal(page2.body.items.length, 1);
    const secondId = page2.body.items[0].id;
    assert.notEqual(firstId, secondId);
    // ids vem em ordem ASC pra empate alfabetico
    assert.ok(firstId < secondId, `expected ${firstId} < ${secondId}`);
  });

  // 14.7: busca acento+espaco-insensivel (search_normalized + search_compact).
  test('14.7: busca sem acento casa nome cadastrado com acento', async () => {
    await api.createClient(
      buildInput({
        body: {
          personType: 'PF',
          fullName: 'Antônio José Caetano',
          cpf: generateValidCpf(400),
          phone: '35 99000-0000',
          isBuyer: false,
          isSeller: true,
        },
      })
    );

    const result = await api.listClients(buildInput({ query: { search: 'antonio' } }));
    assert.equal(result.status, 200);
    assert.equal(result.body.items.length, 1);
    assert.equal(result.body.items[0].fullName, 'Antônio José Caetano');
  });

  test('14.7: busca compacta casa nome com espacamento decorativo entre letras', async () => {
    await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'G A S Comercio de Cafe LTDA',
          tradeName: 'G A S Comercio de Cafe LTDA',
          cnpj: nextValidCnpj(),
          phone: '35 3222-0000',
          isBuyer: true,
          isSeller: false,
        },
      })
    );

    const result = await api.listClients(buildInput({ query: { search: 'GAS' } }));
    assert.equal(result.status, 200);
    assert.equal(result.body.items.length, 1);
    assert.equal(result.body.items[0].legalName, 'G A S Comercio de Cafe LTDA');
  });

  test('14.7: busca normal continua casando token contido no meio do nome', async () => {
    await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'G A S Comercio de Cafe LTDA',
          tradeName: 'G A S Comercio de Cafe LTDA',
          cnpj: nextValidCnpj(),
          phone: '35 3222-0000',
          isBuyer: true,
          isSeller: false,
        },
      })
    );

    const result = await api.listClients(buildInput({ query: { search: 'comercio' } }));
    assert.equal(result.status, 200);
    assert.equal(result.body.items.length, 1);
  });

  test('14.7.D: getClient retorna openLots agregado (zerado quando sem samples)', async () => {
    const created = await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Cliente Sem Lotes LTDA',
          tradeName: 'Cliente Sem Lotes',
          cnpj: nextValidCnpj(),
          phone: '35 3222-0000',
          isBuyer: false,
          isSeller: true,
        },
      })
    );
    const clientId = created.body.client.id;

    const result = await api.getClient(buildInput({ params: { clientId } }));
    assert.equal(result.status, 200);
    assert.ok(result.body.openLots, 'openLots deve estar presente');
    assert.equal(result.body.openLots.count, 0);
    assert.equal(result.body.openLots.sacks, 0);
  });

  test('14.7.D: getClient soma declaredSacks de samples OPEN/PARTIALLY_SOLD', async () => {
    const created = await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Cliente Com Lotes LTDA',
          tradeName: 'Cliente Com Lotes',
          cnpj: nextValidCnpj(),
          phone: '35 3222-0000',
          isBuyer: false,
          isSeller: true,
        },
      })
    );
    const clientId = created.body.client.id;

    // Insere samples diretamente via prisma — evita o pipeline de
    // receiveSample que depende de muitos servicos auxiliares.
    await prisma.sample.createMany({
      data: [
        {
          id: randomUUID(),
          internalLotNumber: 'L-9001',
          status: 'CLASSIFIED',
          commercialStatus: 'OPEN',
          declaredOwner: 'TEST',
          declaredSacks: 50,
          declaredHarvest: '2025',
          ownerClientId: clientId,
          version: 1,
        },
        {
          id: randomUUID(),
          internalLotNumber: 'L-9002',
          status: 'CLASSIFIED',
          commercialStatus: 'PARTIALLY_SOLD',
          declaredOwner: 'TEST',
          declaredSacks: 30,
          declaredHarvest: '2025',
          ownerClientId: clientId,
          version: 1,
        },
        {
          id: randomUUID(),
          internalLotNumber: 'L-9003',
          status: 'CLASSIFIED',
          commercialStatus: 'SOLD',
          declaredOwner: 'TEST',
          declaredSacks: 20,
          declaredHarvest: '2025',
          ownerClientId: clientId,
          version: 1,
        },
        {
          id: randomUUID(),
          internalLotNumber: 'L-9004',
          status: 'INVALIDATED',
          commercialStatus: 'OPEN',
          declaredOwner: 'TEST',
          declaredSacks: 100,
          declaredHarvest: '2025',
          ownerClientId: clientId,
          version: 1,
        },
      ],
    });

    const result = await api.getClient(buildInput({ params: { clientId } }));
    assert.equal(result.status, 200);
    // 2 samples open (50 + 30 = 80 sacas). SOLD e INVALIDATED nao contam.
    assert.equal(result.body.openLots.count, 2);
    assert.equal(result.body.openLots.sacks, 80);
  });

  test('14.7: busca COM espacos preserva precisao (nao casa compactado)', async () => {
    // "Santa Fe" cadastrado, "Santafezinho" cadastrado.
    // Busca "santa fe" deve casar SO Santa Fe (nao usa search_compact
    // quando input tem espacos).
    await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Santa Fe S/A',
          tradeName: 'Santa Fe S/A',
          cnpj: nextValidCnpj(),
          phone: '35 3222-0000',
          isBuyer: true,
          isSeller: false,
        },
      })
    );
    await api.createClient(
      buildInput({
        body: {
          personType: 'PJ',
          legalName: 'Santafezinho LTDA',
          tradeName: 'Santafezinho LTDA',
          cnpj: nextValidCnpj(),
          phone: '35 3222-0001',
          isBuyer: true,
          isSeller: false,
        },
      })
    );

    const result = await api.listClients(buildInput({ query: { search: 'santa fe' } }));
    assert.equal(result.status, 200);
    assert.equal(result.body.items.length, 1);
    assert.equal(result.body.items[0].legalName, 'Santa Fe S/A');
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
