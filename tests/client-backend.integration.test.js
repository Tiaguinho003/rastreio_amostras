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
    userAgent: 'node-test'
  };

  function buildInput({ headers = authHeaders, params = {}, query = {}, body = {} } = {}) {
    return {
      headers,
      params,
      query,
      body
    };
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE client_audit_event, sample_movement, client_registration, client, print_job, sample_attachment, sample_event, sample RESTART IDENTITY CASCADE'
    );
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
          ...overrides
        }
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
          ...overrides
        }
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
          displayName: 'Cliente Teste'
        }
      ]
    });

    authHeaders = {
      authorization: `Bearer ${authService.login({ username: 'client-test', password: 'client123' }).accessToken}`,
      'x-forwarded-for': actor.ip,
      'user-agent': actor.userAgent,
      'x-source': actor.source
    };

    api = createBackendApiV1({
      authService,
      clientService,
      commandService: {},
      queryService: {
        async listSamples() {
          return { items: [], page: { total: 0, totalPages: 1, page: 1, limit: 30, offset: 0, hasPrev: false, hasNext: false } };
        },
        async getDashboardPending() {
          return { pending: [] };
        }
      },
      reportService: null
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
      body: {}
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

    assert.equal(pj.status, 201);
    assert.equal(pj.body.client.personType, 'PJ');
    assert.equal(pj.body.client.displayName, 'Atlantica Exportacao e Importacao S/A');
    assert.equal(pj.body.client.document, '03936815000175');

    const byName = await api.listClients(
      buildInput({
        query: {
          search: 'Atlantica'
        }
      })
    );

    assert.equal(byName.status, 200);
    assert.equal(byName.body.page.total, 1);
    assert.equal(byName.body.items[0].id, pj.body.client.id);

    const byDocument = await api.listClients(
      buildInput({
        query: {
          search: '01617970832'
        }
      })
    );

    assert.equal(byDocument.status, 200);
    assert.equal(byDocument.body.page.total, 1);
    assert.equal(byDocument.body.items[0].id, pf.body.client.id);

    const byCode = await api.listClients(
      buildInput({
        query: {
          search: String(pf.body.client.code)
        }
      })
    );

    assert.equal(byCode.status, 200);
    assert.equal(byCode.body.page.total, 1);
    assert.equal(byCode.body.items[0].id, pf.body.client.id);
  });

  test('GET /clients/lookup filters active buyers and sellers', async () => {
    const sellerOnly = await createPfClient();
    const buyerOnly = await createPjClient({
      legalName: 'Comprador Export Ltda',
      tradeName: 'Comprador Export Ltda',
      cnpj: '26.543.626/0001-38',
      isBuyer: true,
      isSeller: false
    });

    const ownerLookup = await api.lookupClients(
      buildInput({
        query: {
          search: 'Francisco',
          kind: 'owner'
        }
      })
    );

    assert.equal(ownerLookup.status, 200);
    assert.equal(ownerLookup.body.items.length, 1);
    assert.equal(ownerLookup.body.items[0].id, sellerOnly.body.client.id);

    const buyerLookup = await api.lookupClients(
      buildInput({
        query: {
          search: 'Comprador',
          kind: 'buyer'
        }
      })
    );

    assert.equal(buyerLookup.status, 200);
    assert.equal(buyerLookup.body.items.length, 1);
    assert.equal(buyerLookup.body.items[0].id, buyerOnly.body.client.id);

    await api.inactivateClient(
      buildInput({
        params: { clientId: buyerOnly.body.client.id },
        body: { reasonText: 'suspenso' }
      })
    );

    const inactiveLookup = await api.lookupClients(
      buildInput({
        query: {
          search: 'Comprador',
          kind: 'buyer'
        }
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
          reasonText: 'corrigir cadastro'
        }
      })
    );

    assert.equal(updated.status, 200);
    assert.equal(updated.body.client.personType, 'PJ');
    assert.equal(updated.body.client.displayName, 'G A S Comercio de Cafe Sociedade LTDA');
    assert.equal(updated.body.client.document, '26543626000138');

    const detail = await api.getClient(
      buildInput({
        params: { clientId: created.body.client.id }
      })
    );

    assert.equal(detail.status, 200);
    assert.equal(detail.body.client.personType, 'PJ');

    const audit = await api.listClientAuditEvents(
      buildInput({
        params: { clientId: created.body.client.id }
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
          complement: null
        }
      })
    );

    assert.equal(registration.status, 201);
    assert.equal(registration.body.registration.registrationNumber, '0028640150010');

    const updatedRegistration = await api.updateClientRegistration(
      buildInput({
        params: {
          clientId: created.body.client.id,
          registrationId: registration.body.registration.id
        },
        body: {
          district: 'Centro',
          reasonText: 'ajuste endereco'
        }
      })
    );

    assert.equal(updatedRegistration.status, 200);
    assert.equal(updatedRegistration.body.registration.district, 'Centro');

    const otherClient = await createPfClient({
      fullName: 'Outro Cliente',
      cpf: '123.456.789-09'
    });

    const wrongOwner = await api.updateClientRegistration(
      buildInput({
        params: {
          clientId: otherClient.body.client.id,
          registrationId: registration.body.registration.id
        },
        body: {
          district: 'Bairro X',
          reasonText: 'nao deveria achar'
        }
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
          complement: null
        }
      })
    );

    await api.inactivateClientRegistration(
      buildInput({
        params: {
          clientId: created.body.client.id,
          registrationId: registration.body.registration.id
        },
        body: {
          reasonText: 'teste'
        }
      })
    );

    const detail = await api.getClient(
      buildInput({
        params: { clientId: created.body.client.id }
      })
    );

    assert.equal(detail.status, 200);
    assert.equal(detail.body.registrations.length, 1);
    assert.equal(detail.body.registrations[0].status, 'INACTIVE');

    const audit = await api.listClientAuditEvents(
      buildInput({
        params: { clientId: created.body.client.id }
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
      tradeName: 'Duplicado Ltda'
    });

    assert.equal(duplicateClient.status, 409);

    const created = await createPfClient({
      fullName: 'Produtor Unico',
      cpf: '999.888.777-66'
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
          complement: null
        }
      })
    );

    assert.equal(firstRegistration.status, 201);

    const otherClient = await createPjClient({
      legalName: 'Atlantica Dois S/A',
      tradeName: 'Atlantica Dois S/A',
      cnpj: '11.222.333/0001-44'
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
          complement: null
        }
      })
    );

    assert.equal(duplicateRegistration.status, 409);
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
