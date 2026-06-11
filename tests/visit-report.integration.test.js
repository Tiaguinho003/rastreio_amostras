import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { IdempotencyStore } from '../src/api/v1/idempotency-helper.js';
import { LocalAuthService } from '../src/auth/local-auth-service.js';
import { VisitReportService } from '../src/visits/visit-report-service.js';

// Informe de visita — service de criacao (qualquer papel autenticado, com
// userId/createdAt carimbados no servidor; capturedAt opcional da fila
// offline) e listagem paginada (viewers veem tudo; PROSPECTOR so os
// proprios). Inclui o caminho idempotente do POST /visit-reports via
// backend-api (replay da fila nao duplica).

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('visit-report integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const service = new VisitReportService({ prisma });

  // Actor fixo do caminho via backend-api (LocalAuthService + FK em app_user).
  const ACTOR_USER_ID = '00000000-0000-0000-0000-000000000901';
  let api;
  let authHeaders;

  test.before(() => {
    const authService = new LocalAuthService({
      secret: 'super-secret-for-visit-report-tests',
      allowPlaintextPasswords: true,
      users: [
        {
          id: ACTOR_USER_ID,
          username: 'visit-test',
          password: 'visit123',
          role: 'COMMERCIAL',
          displayName: 'Visita Teste',
        },
      ],
    });

    authHeaders = {
      authorization: `Bearer ${authService.login({ username: 'visit-test', password: 'visit123' }).accessToken}`,
      'x-source': 'web',
    };

    api = createBackendApiV1({
      authService,
      visitReportService: service,
      commandService: {},
      queryService: {},
      idempotencyStore: new IdempotencyStore({ prisma }),
    });
  });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE visit_report, idempotency_record, client_audit_event, client_commercial_user, client_unit, client, user_session, app_user RESTART IDENTITY CASCADE'
    );
  }

  async function seedActorUser() {
    return prisma.user.create({
      data: {
        id: ACTOR_USER_ID,
        fullName: 'Visita Teste',
        username: 'visit-test',
        usernameCanonical: 'visit-test',
        email: 'visit-test@example.com',
        emailCanonical: 'visit-test@example.com',
        passwordHash: 'x',
        role: 'COMMERCIAL',
      },
    });
  }

  async function seedUser(role, suffix = randomUUID().slice(0, 8)) {
    return prisma.user.create({
      data: {
        id: randomUUID(),
        fullName: `Usuario ${role} ${suffix}`,
        username: `user-${suffix}`,
        usernameCanonical: `user-${suffix}`,
        email: `user-${suffix}@example.com`,
        emailCanonical: `user-${suffix}@example.com`,
        passwordHash: 'x',
        role,
      },
    });
  }

  async function seedClient({ status = 'ACTIVE', fullName = 'Produtor Teste' } = {}) {
    return prisma.client.create({
      data: {
        id: randomUUID(),
        personType: 'PF',
        fullName,
        status,
        // chk_client_role_flags exige pelo menos um papel.
        isSeller: true,
      },
    });
  }

  function actorFor(user) {
    return { actorUserId: user.id, role: user.role };
  }

  function baseInput(overrides = {}) {
    return {
      clientKind: 'NEW',
      newClientName: 'Fazenda Boa Vista',
      farmSize: 'SMALL',
      interestLevel: 'HIGH',
      sellsCurrently: false,
      ...overrides,
    };
  }

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('createVisitReport NEW: carimba usuario/data no servidor e zera clientId', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');

    const result = await service.createVisitReport(
      baseInput({
        newClientCity: 'Tres Pontas/MG',
        newClientPhone: '(35) 99999-9999',
        farmSizeNotes: '30 ha no total, 12 de cafe',
      }),
      actorFor(commercial)
    );

    assert.equal(result.report.clientKind, 'NEW');
    assert.equal(result.report.client, null);
    assert.equal(result.report.newClient.name, 'Fazenda Boa Vista');
    assert.equal(result.report.newClient.city, 'Tres Pontas/MG');
    assert.equal(result.report.user.id, commercial.id);
    assert.ok(result.report.createdAt);

    const row = await prisma.visitReport.findUnique({ where: { id: result.report.id } });
    assert.equal(row.userId, commercial.id);
    assert.equal(row.clientId, null);
    assert.equal(row.farmSize, 'SMALL');
    assert.equal(row.interestLevel, 'HIGH');
    assert.equal(row.sellsCurrently, false);
  });

  test('createVisitReport EXISTING: vincula cliente ativo do cadastro e zera campos new_*', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();

    const result = await service.createVisitReport(
      baseInput({
        clientKind: 'EXISTING',
        clientId: client.id,
        // Campos de cliente novo enviados por engano devem ser descartados.
        newClientName: 'Nao deveria persistir',
        sellsCurrently: true,
        sellsToWhom: 'Cooxupe, corretor local',
      }),
      actorFor(commercial)
    );

    assert.equal(result.report.clientKind, 'EXISTING');
    assert.equal(result.report.client.id, client.id);
    assert.equal(result.report.client.displayName, 'Produtor Teste');
    assert.equal(result.report.newClient, null);
    assert.equal(result.report.sellsToWhom, 'Cooxupe, corretor local');

    const row = await prisma.visitReport.findUnique({ where: { id: result.report.id } });
    assert.equal(row.newClientName, null);
    assert.equal(row.newClientCity, null);
    assert.equal(row.newClientPhone, null);
  });

  test('createVisitReport: sellsToWhom e descartado quando sellsCurrently=false', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');

    const result = await service.createVisitReport(
      baseInput({ sellsCurrently: false, sellsToWhom: 'Texto perdido' }),
      actorFor(commercial)
    );

    assert.equal(result.report.sellsToWhom, null);
  });

  test('createVisitReport: validacoes 422', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const inactive = await seedClient({ status: 'INACTIVE', fullName: 'Inativo' });
    const actor = actorFor(commercial);

    // clientKind invalido
    await assert.rejects(
      service.createVisitReport(baseInput({ clientKind: 'OTHER' }), actor),
      (error) => error.status === 422 && error.details?.field === 'clientKind'
    );

    // EXISTING sem clientId
    await assert.rejects(
      service.createVisitReport(baseInput({ clientKind: 'EXISTING', clientId: null }), actor),
      (error) => error.status === 422 && error.details?.field === 'clientId'
    );

    // EXISTING com clientId inexistente
    await assert.rejects(
      service.createVisitReport(
        baseInput({ clientKind: 'EXISTING', clientId: randomUUID() }),
        actor
      ),
      (error) => error.status === 422 && error.details?.code === 'VISIT_CLIENT_NOT_FOUND'
    );

    // EXISTING com cliente inativo
    await assert.rejects(
      service.createVisitReport(
        baseInput({ clientKind: 'EXISTING', clientId: inactive.id }),
        actor
      ),
      (error) => error.status === 422 && error.details?.code === 'VISIT_CLIENT_INACTIVE'
    );

    // NEW sem nome
    await assert.rejects(
      service.createVisitReport(baseInput({ newClientName: '  ' }), actor),
      (error) => error.status === 422 && error.details?.field === 'newClientName'
    );

    // farmSize fora do enum
    await assert.rejects(
      service.createVisitReport(baseInput({ farmSize: 'HUGE' }), actor),
      (error) => error.status === 422 && error.details?.field === 'farmSize'
    );

    // interestLevel fora do enum
    await assert.rejects(
      service.createVisitReport(baseInput({ interestLevel: 'MAYBE' }), actor),
      (error) => error.status === 422 && error.details?.field === 'interestLevel'
    );

    // sellsCurrently nao-boolean
    await assert.rejects(
      service.createVisitReport(baseInput({ sellsCurrently: 'sim' }), actor),
      (error) => error.status === 422 && error.details?.field === 'sellsCurrently'
    );
  });

  test('createVisitReport: exige ator autenticado', async () => {
    await resetDatabase();

    await assert.rejects(
      service.createVisitReport(baseInput(), {}),
      (error) => error.status === 401
    );
  });

  test('listVisitReports: viewers veem tudo; PROSPECTOR so os proprios; 403 pros demais', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const cadastro = await seedUser('CADASTRO');
    const classifier = await seedUser('CLASSIFIER');
    const registration = await seedUser('REGISTRATION');
    const prospector = await seedUser('PROSPECTOR');

    // Informes de dois autores: 2 do prospector + 1 do comercial.
    await service.createVisitReport(
      baseInput({ newClientName: 'Visita Prospector 1' }),
      actorFor(prospector)
    );
    await service.createVisitReport(
      baseInput({ newClientName: 'Visita Prospector 2' }),
      actorFor(prospector)
    );
    await service.createVisitReport(
      baseInput({ newClientName: 'Visita Comercial 1' }),
      actorFor(commercial)
    );

    // Papeis com acesso ao /resumo (VISIT_REPORT_VIEWER_ROLES) veem tudo.
    const allowedCommercial = await service.listVisitReports({}, actorFor(commercial));
    assert.equal(allowedCommercial.page.total, 3);
    const allowedCadastro = await service.listVisitReports({}, actorFor(cadastro));
    assert.equal(allowedCadastro.page.total, 3);

    // PROSPECTOR lista apenas os proprios informes (dashboard dele) —
    // escopo forcado por userId no service, items e total.
    const own = await service.listVisitReports({}, actorFor(prospector));
    assert.equal(own.page.total, 2);
    assert.equal(own.items.length, 2);
    assert.ok(own.items.every((item) => item.user.id === prospector.id));

    for (const denied of [classifier, registration]) {
      await assert.rejects(
        service.listVisitReports({}, actorFor(denied)),
        (error) => error.status === 403
      );
    }
  });

  test('listVisitReports: ordena mais recente primeiro e pagina com hasNext', async () => {
    await resetDatabase();
    const admin = await seedUser('ADMIN');
    const commercial = await seedUser('COMMERCIAL');

    // createdAt explicito pra ordenacao deterministica.
    const base = Date.parse('2026-06-10T12:00:00.000Z');
    for (let index = 0; index < 3; index += 1) {
      await prisma.visitReport.create({
        data: {
          id: randomUUID(),
          userId: commercial.id,
          clientKind: 'NEW',
          newClientName: `Visita ${index + 1}`,
          farmSize: 'MEDIUM',
          interestLevel: 'LOW',
          sellsCurrently: false,
          createdAt: new Date(base + index * 60_000),
        },
      });
    }

    const firstPage = await service.listVisitReports({ page: 1, limit: 2 }, actorFor(admin));
    assert.equal(firstPage.items.length, 2);
    assert.equal(firstPage.items[0].newClient.name, 'Visita 3');
    assert.equal(firstPage.items[1].newClient.name, 'Visita 2');
    assert.equal(firstPage.page.total, 3);
    assert.equal(firstPage.page.hasNext, true);

    const secondPage = await service.listVisitReports({ page: 2, limit: 2 }, actorFor(admin));
    assert.equal(secondPage.items.length, 1);
    assert.equal(secondPage.items[0].newClient.name, 'Visita 1');
    assert.equal(secondPage.page.hasNext, false);
    assert.equal(secondPage.items[0].user.fullName, commercial.fullName);
  });

  test('listVisitReports: limit acima do maximo rejeita 422', async () => {
    await resetDatabase();
    const admin = await seedUser('ADMIN');

    await assert.rejects(
      service.listVisitReports({ limit: '9999' }, actorFor(admin)),
      (error) => error.status === 422
    );
  });

  test('createVisitReport: generalNotes (campo 5) persiste; ausente fica null', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');

    const withNotes = await service.createVisitReport(
      baseInput({ generalNotes: '  Produtor pediu retorno em julho.  ' }),
      actorFor(commercial)
    );
    assert.equal(withNotes.report.generalNotes, 'Produtor pediu retorno em julho.');

    const row = await prisma.visitReport.findUnique({ where: { id: withNotes.report.id } });
    assert.equal(row.generalNotes, 'Produtor pediu retorno em julho.');

    const without = await service.createVisitReport(baseInput(), actorFor(commercial));
    assert.equal(without.report.generalNotes, null);
  });

  test('deleteVisitReport: admin exclui; nao-admin 403; inexistente 404', async () => {
    await resetDatabase();
    const admin = await seedUser('ADMIN');
    const commercial = await seedUser('COMMERCIAL');

    const created = await service.createVisitReport(baseInput(), actorFor(commercial));

    // Comercial (que pode LER o /resumo) nao pode excluir.
    await assert.rejects(
      service.deleteVisitReport({ reportId: created.report.id }, actorFor(commercial)),
      (error) => error.status === 403
    );

    const removed = await service.deleteVisitReport(
      { reportId: created.report.id },
      actorFor(admin)
    );
    assert.deepEqual(removed, { removed: true });
    assert.equal(await prisma.visitReport.count(), 0);

    await assert.rejects(
      service.deleteVisitReport({ reportId: created.report.id }, actorFor(admin)),
      (error) => error.status === 404 && error.details?.code === 'VISIT_REPORT_NOT_FOUND'
    );
  });

  test('createVisitReport: capturedAt passado e persistido e retornado; ausente fica null', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const capturedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    const offline = await service.createVisitReport(
      baseInput({ capturedAt }),
      actorFor(commercial)
    );
    assert.equal(offline.report.capturedAt, capturedAt);

    const offlineRow = await prisma.visitReport.findUnique({ where: { id: offline.report.id } });
    assert.equal(offlineRow.capturedAt.toISOString(), capturedAt);

    const direct = await service.createVisitReport(baseInput(), actorFor(commercial));
    assert.equal(direct.report.capturedAt, null);
  });

  test('createVisitReport: capturedAt futuro ou invalido rejeita 422', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const actor = actorFor(commercial);

    await assert.rejects(
      service.createVisitReport(
        baseInput({ capturedAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }),
        actor
      ),
      (error) => error.status === 422 && error.details?.code === 'VISIT_CAPTURED_AT_FUTURE'
    );

    await assert.rejects(
      service.createVisitReport(baseInput({ capturedAt: 'ontem-de-manha' }), actor),
      (error) => error.status === 422 && error.details?.field === 'capturedAt'
    );
  });

  test('POST /visit-reports com Idempotency-Key: replay devolve o mesmo registro sem duplicar', async () => {
    await resetDatabase();
    await seedActorUser();

    const key = randomUUID();
    const body = {
      clientKind: 'NEW',
      newClientName: 'Fazenda Replay',
      farmSize: 'MEDIUM',
      interestLevel: 'HIGH',
      sellsCurrently: false,
      capturedAt: new Date(Date.now() - 60_000).toISOString(),
    };

    const first = await api.createVisitReport({
      headers: { ...authHeaders, 'idempotency-key': key },
      params: {},
      query: {},
      body,
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.report.user.id, ACTOR_USER_ID);

    const second = await api.createVisitReport({
      headers: { ...authHeaders, 'idempotency-key': key },
      params: {},
      query: {},
      body,
    });
    assert.equal(second.status, 201);
    assert.equal(second.idempotent, true);
    assert.equal(second.body.report.id, first.body.report.id);

    const total = await prisma.visitReport.count();
    assert.equal(total, 1);
  });

  test('POST /visit-reports sem Idempotency-Key: envios repetidos criam registros distintos', async () => {
    await resetDatabase();
    await seedActorUser();

    const body = {
      clientKind: 'NEW',
      newClientName: 'Fazenda Sem Key',
      farmSize: 'SMALL',
      interestLevel: 'LOW',
      sellsCurrently: false,
    };

    const first = await api.createVisitReport({
      headers: authHeaders,
      params: {},
      query: {},
      body,
    });
    const second = await api.createVisitReport({
      headers: authHeaders,
      params: {},
      query: {},
      body,
    });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(second.body.report.id, first.body.report.id);

    const total = await prisma.visitReport.count();
    assert.equal(total, 2);
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
