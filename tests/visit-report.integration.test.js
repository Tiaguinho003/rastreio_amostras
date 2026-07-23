import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { IdempotencyStore } from '../src/api/v1/idempotency-helper.js';
import { LocalAuthService } from '../src/auth/local-auth-service.js';
import { VisitReportService } from '../src/visits/visit-report-service.js';

// Relatorio de VISITA unificado (UNIFICACAO 2026-07-15): funde o antigo informe
// do prospector + a visita do comercial. A visita NASCE VINCULADA (clientId
// obrigatorio nos dois kinds); TODOS os papeis criam (incl. PROSPECTOR); os
// campos da uniao (fazenda/interesse/comercializa + motivo/resultado) sao
// OPCIONAIS. Imutavel: erro = CANCELAR (soft) e reenviar (so o proprio autor).
// Listagem: viewers veem tudo; PROSPECTOR so os proprios. Stats do dashboard
// do prospector excluem canceladas. (curadoria de vinculo + fila offline foram
// removidas na unificacao.)

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('visit-report integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const service = new VisitReportService({ prisma });

  const ACTOR_USER_ID = '00000000-0000-0000-0000-000000000901';
  const OTHER_USER_ID = '00000000-0000-0000-0000-000000000902';
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
      'TRUNCATE TABLE visit_report, weekly_report, idempotency_record, client_audit_event, client_commercial_user, client_unit, client, user_session, app_user RESTART IDENTITY CASCADE'
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

  // Visita NASCE VINCULADA: clientId obrigatorio. Default EXISTING (achou no
  // lookup); overrides trocam pra NEW + anotacao.
  function visitInput(client, overrides = {}) {
    return { clientKind: 'EXISTING', clientId: client.id, ...overrides };
  }

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('createVisitReport EXISTING: nasce vinculado ao cliente real, sem anotacao', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();

    const result = await service.createVisitReport(
      visitInput(client, {
        // Campos new_* enviados por engano num EXISTING devem ser descartados.
        newClientName: 'Nao deveria persistir',
      }),
      actorFor(commercial)
    );

    assert.equal(result.report.type, 'VISIT_REPORT');
    assert.equal(result.report.clientKind, 'EXISTING');
    assert.equal(result.report.client.id, client.id);
    assert.equal(result.report.client.displayName, 'Produtor Teste');
    assert.equal(result.report.newClient, null);
    assert.equal(result.report.user.id, commercial.id);
    assert.equal(result.report.cancelledAt, null);
    assert.ok(result.report.createdAt);

    const row = await prisma.visitReport.findUnique({ where: { id: result.report.id } });
    assert.equal(row.userId, commercial.id);
    assert.equal(row.clientId, client.id);
    assert.equal(row.newClientName, null);
  });

  test('createVisitReport NEW: vinculado a cliente real + anotacao de campo preservada', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient({ fullName: 'Cliente Cadastrado no Form' });

    const result = await service.createVisitReport(
      visitInput(client, {
        clientKind: 'NEW',
        newClientName: 'Fazenda Boa Vista',
        newClientCity: 'Tres Pontas/MG',
        newClientPhone: '(35) 99999-9999',
      }),
      actorFor(commercial)
    );

    assert.equal(result.report.clientKind, 'NEW');
    // Nasce vinculada ao Client real (cadastrado no proprio form)...
    assert.equal(result.report.client.id, client.id);
    // ...e a anotacao de campo (nome/cidade/telefone digitados) sobrevive.
    assert.equal(result.report.newClient.name, 'Fazenda Boa Vista');
    assert.equal(result.report.newClient.city, 'Tres Pontas/MG');
    assert.equal(result.report.newClient.phone, '(35) 99999-9999');
  });

  test('createVisitReport: exige clientId nos DOIS kinds (born-linked, 422)', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');

    await assert.rejects(
      () =>
        service.createVisitReport({ clientKind: 'NEW', newClientName: 'X' }, actorFor(commercial)),
      (err) => err.status === 422 && err.details?.field === 'clientId'
    );
    await assert.rejects(
      () => service.createVisitReport({ clientKind: 'EXISTING' }, actorFor(commercial)),
      (err) => err.status === 422 && err.details?.field === 'clientId'
    );
  });

  test('createVisitReport: campos da uniao sao OPCIONAIS (so cliente obrigatorio)', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();

    // So o cliente — nenhum campo de fazenda/interesse/motivo/resultado.
    const result = await service.createVisitReport(visitInput(client), actorFor(commercial));

    assert.equal(result.report.client.id, client.id);
    assert.equal(result.report.farmSize, null);
    assert.equal(result.report.interestLevel, null);
    assert.equal(result.report.sellsCurrently, null);
    assert.equal(result.report.reason, null);
    assert.equal(result.report.outcome, null);
    assert.equal(result.report.generalNotes, null);
  });

  test('createVisitReport: motivo/resultado (herdados da visita comercial) persistem', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();

    const result = await service.createVisitReport(
      visitInput(client, {
        reason: 'NEGOTIATION',
        reasonNotes: 'Falamos de preco',
        outcome: 'PROPOSAL_IN_PROGRESS',
        outcomeNotes: 'Aguardando retorno',
        farmSize: 'LARGE',
        interestLevel: 'HIGH',
        sellsCurrently: true,
        sellsToWhom: 'Cooxupe',
        generalNotes: 'Visita boa',
      }),
      actorFor(commercial)
    );

    assert.equal(result.report.reason, 'NEGOTIATION');
    assert.equal(result.report.reasonNotes, 'Falamos de preco');
    assert.equal(result.report.outcome, 'PROPOSAL_IN_PROGRESS');
    assert.equal(result.report.farmSize, 'LARGE');
    assert.equal(result.report.sellsToWhom, 'Cooxupe');
  });

  test('createVisitReport: sellsToWhom descartado quando sellsCurrently ausente/false', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();

    const result = await service.createVisitReport(
      visitInput(client, { sellsCurrently: false, sellsToWhom: 'nao deveria persistir' }),
      actorFor(commercial)
    );
    assert.equal(result.report.sellsToWhom, null);
  });

  test('createVisitReport: cliente inexistente/inativo rejeita 422', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const inactive = await seedClient({ status: 'INACTIVE' });

    await assert.rejects(
      () =>
        service.createVisitReport(
          { clientKind: 'EXISTING', clientId: randomUUID() },
          actorFor(commercial)
        ),
      (err) => err.status === 422 && err.details?.code === 'VISIT_CLIENT_NOT_FOUND'
    );
    await assert.rejects(
      () => service.createVisitReport(visitInput(inactive), actorFor(commercial)),
      (err) => err.status === 422 && err.details?.code === 'VISIT_CLIENT_INACTIVE'
    );
  });

  test('createVisitReport: QUALQUER papel cria, incl. PROSPECTOR', async () => {
    await resetDatabase();
    const client = await seedClient();
    for (const role of [
      'ADMIN',
      'CLASSIFIER',
      'REGISTRATION',
      'COMMERCIAL',
      'CADASTRO',
      'PROSPECTOR',
    ]) {
      const user = await seedUser(role);
      const result = await service.createVisitReport(visitInput(client), actorFor(user));
      assert.equal(result.report.user.id, user.id, `papel ${role} deveria criar`);
    }
  });

  test('createVisitReport: exige ator autenticado (401)', async () => {
    await resetDatabase();
    const client = await seedClient();
    await assert.rejects(
      () => service.createVisitReport(visitInput(client), null),
      (err) => err.status === 401
    );
  });

  test('cancelVisitReport: soft, so o proprio autor; alheio/inexistente/ja-cancelada => 404', async () => {
    await resetDatabase();
    const author = await seedUser('COMMERCIAL');
    const other = await seedUser('ADMIN');
    const client = await seedClient();
    const created = await service.createVisitReport(visitInput(client), actorFor(author));

    // Alheio (nem ADMIN cancela) => 404.
    await assert.rejects(
      () => service.cancelVisitReport({ reportId: created.report.id }, actorFor(other)),
      (err) => err.status === 404
    );

    // O proprio autor cancela (soft): marca cancelledAt e mantem a row.
    const cancelled = await service.cancelVisitReport(
      { reportId: created.report.id },
      actorFor(author)
    );
    assert.ok(cancelled.report.cancelledAt);
    const row = await prisma.visitReport.findUnique({ where: { id: created.report.id } });
    assert.ok(row); // continua no banco
    assert.equal(row.cancelledByUserId, author.id);

    // Ja cancelada => 404 (idempotente do ponto de vista do 2o cancel).
    await assert.rejects(
      () => service.cancelVisitReport({ reportId: created.report.id }, actorFor(author)),
      (err) => err.status === 404
    );

    // Inexistente => 404.
    await assert.rejects(
      () => service.cancelVisitReport({ reportId: randomUUID() }, actorFor(author)),
      (err) => err.status === 404
    );
  });

  test('listVisitReports: viewers veem tudo; PROSPECTOR so os proprios (canceladas marcadas ficam)', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const prospector = await seedUser('PROSPECTOR');
    const client = await seedClient();

    await service.createVisitReport(visitInput(client), actorFor(commercial));
    const own = await service.createVisitReport(visitInput(client), actorFor(prospector));
    await service.cancelVisitReport({ reportId: own.report.id }, actorFor(prospector));

    // Viewer (COMMERCIAL) ve os dois (incl. a cancelada do prospector).
    const asViewer = await service.listVisitReports({}, actorFor(commercial));
    assert.equal(asViewer.items.length, 2);
    const cancelledInFeed = asViewer.items.find((i) => i.id === own.report.id);
    assert.ok(cancelledInFeed.cancelledAt);

    // PROSPECTOR ve APENAS a propria (a cancelada continua listada, marcada).
    const asProspector = await service.listVisitReports({}, actorFor(prospector));
    assert.equal(asProspector.items.length, 1);
    assert.equal(asProspector.items[0].id, own.report.id);
    assert.ok(asProspector.items[0].cancelledAt);
  });

  test('listVisitReports: ordena recente-primeiro e pagina com hasNext', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();
    for (let i = 0; i < 3; i += 1) {
      await service.createVisitReport(visitInput(client), actorFor(commercial));
    }
    const firstPage = await service.listVisitReports({ page: 1, limit: 2 }, actorFor(commercial));
    assert.equal(firstPage.items.length, 2);
    assert.equal(firstPage.page.total, 3);
    assert.equal(firstPage.page.hasNext, true);
    const secondPage = await service.listVisitReports({ page: 2, limit: 2 }, actorFor(commercial));
    assert.equal(secondPage.items.length, 1);
    assert.equal(secondPage.page.hasNext, false);
  });

  test('listVisitReports: limit acima do maximo rejeita 422', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    await assert.rejects(
      () => service.listVisitReports({ limit: 101 }, actorFor(commercial)),
      (err) => err.status === 422
    );
  });

  test('getMyVisitReportStats: so do ator, exclui CANCELADAS', async () => {
    await resetDatabase();
    const prospector = await seedUser('PROSPECTOR');
    const other = await seedUser('COMMERCIAL');
    const client = await seedClient();

    // 2 NEW + 1 EXISTING do proprio ator; 1 do outro (nao conta).
    await service.createVisitReport(
      visitInput(client, { clientKind: 'NEW', newClientName: 'A' }),
      actorFor(prospector)
    );
    const toCancel = await service.createVisitReport(
      visitInput(client, { clientKind: 'NEW', newClientName: 'B' }),
      actorFor(prospector)
    );
    await service.createVisitReport(visitInput(client), actorFor(prospector));
    await service.createVisitReport(visitInput(client), actorFor(other));

    // Cancela uma NEW => sai da contagem.
    await service.cancelVisitReport({ reportId: toCancel.report.id }, actorFor(prospector));

    const stats = await service.getMyVisitReportStats(actorFor(prospector));
    assert.equal(stats.todayCount, 2); // 3 criadas - 1 cancelada
    assert.equal(stats.todayNewClientsCount, 1); // 2 NEW - 1 NEW cancelada
  });

  test('listVisitReports: search filtra por nome do cliente cadastrado', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const cafeMonteVerde = await seedClient({ fullName: 'Cafe Monte Verde' });
    const outro = await seedClient({ fullName: 'Sitio Aguas Claras' });
    await service.createVisitReport(visitInput(cafeMonteVerde), actorFor(commercial));
    await service.createVisitReport(visitInput(outro), actorFor(commercial));

    const found = await service.listVisitReports({ search: 'monte' }, actorFor(commercial));
    assert.equal(found.page.total, 1);
    assert.equal(found.items[0].client.displayName, 'Cafe Monte Verde');
  });

  // ---- caminho via backend-api (rota HTTP) ----

  test('POST /visit-reports (backend-api): cria vinculado 201', async () => {
    await resetDatabase();
    await seedActorUser();
    const client = await seedClient();

    const res = await api.createVisitReport({
      headers: authHeaders,
      params: {},
      query: {},
      body: { clientKind: 'EXISTING', clientId: client.id, reason: 'RELATIONSHIP' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.report.client.id, client.id);
    assert.equal(res.body.report.reason, 'RELATIONSHIP');
    assert.equal(res.body.report.user.id, ACTOR_USER_ID);
  });

  test('DELETE /visit-reports/:id (backend-api): cancela soft (so autor) 200; sem reportId 422', async () => {
    await resetDatabase();
    await seedActorUser();
    const client = await seedClient();
    const created = await api.createVisitReport({
      headers: authHeaders,
      params: {},
      query: {},
      body: { clientKind: 'EXISTING', clientId: client.id },
    });
    const reportId = created.body.report.id;

    const missing = await api.cancelVisitReport({
      headers: authHeaders,
      params: {},
      query: {},
      body: {},
    });
    assert.equal(missing.status, 422);

    const cancelled = await api.cancelVisitReport({
      headers: authHeaders,
      params: { reportId },
      query: {},
      body: {},
    });
    assert.equal(cancelled.status, 200);
    assert.ok(cancelled.body.report.cancelledAt);
  });

  // ===== R7 (v2 2026-07-23): cards de /relatorios + filtros do feed =====
  // Insere linhas com created_at CONTROLADO (o create do service carimba now()).
  // newClientNameNormalized e coluna GERADA — o Postgres a popula do newClientName
  // no proprio INSERT, entao a busca por cliente casa sem precisar setar.

  async function seedVisitRow({
    user,
    client,
    createdAt,
    cancelledAt = null,
    clientKind = 'EXISTING',
    newClientName = null,
  }) {
    return prisma.visitReport.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        clientKind,
        clientId: client ? client.id : null,
        newClientName,
        createdAt,
        cancelledAt,
        cancelledByUserId: cancelledAt ? user.id : null,
      },
    });
  }

  async function seedWeeklyRow({
    user,
    weekStart,
    createdAt,
    summary = 'Resumo da semana',
    cancelledAt = null,
  }) {
    return prisma.weeklyReport.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        weekStart,
        summary,
        createdAt,
        cancelledAt,
        cancelledByUserId: cancelledAt ? user.id : null,
      },
    });
  }

  test('getRelatoriosStats: total (nao-cancelado) + esta semana + semana passada', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();
    const now = new Date('2026-07-22T17:00:00.000Z'); // quarta BRT, semana 20-26/07

    await seedVisitRow({
      user: commercial,
      client,
      createdAt: new Date('2026-07-21T12:00:00.000Z'),
    });
    await seedVisitRow({
      user: commercial,
      client,
      createdAt: new Date('2026-07-22T12:00:00.000Z'),
    });
    await seedVisitRow({
      user: commercial,
      client,
      createdAt: new Date('2026-07-15T12:00:00.000Z'),
    });
    await seedVisitRow({
      user: commercial,
      client,
      createdAt: new Date('2026-06-10T12:00:00.000Z'),
    });
    await seedVisitRow({
      user: commercial,
      client,
      createdAt: new Date('2026-07-22T13:00:00.000Z'),
      cancelledAt: new Date('2026-07-22T14:00:00.000Z'),
    });

    const stats = await service.getRelatoriosStats(actorFor(commercial), { now });
    assert.equal(stats.totalVisits, 4); // 5 linhas, 1 cancelada excluida
    assert.equal(stats.visitsThisWeek, 2); // 2 nao-canceladas nesta semana
    assert.equal(stats.visitsLastWeek, 1);
  });

  test('getRelatoriosStats: PROSPECTOR nao acessa (403 no gate do service)', async () => {
    await resetDatabase();
    const prospector = await seedUser('PROSPECTOR');
    await assert.rejects(
      () => service.getRelatoriosStats(actorFor(prospector)),
      (err) => err.status === 403
    );
  });

  test('listInformeFeed type=: filtra a perna do UNION', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();
    await seedVisitRow({
      user: commercial,
      client,
      createdAt: new Date('2026-07-22T12:00:00.000Z'),
    });
    await seedWeeklyRow({
      user: commercial,
      weekStart: new Date('2026-07-20'),
      createdAt: new Date('2026-07-22T13:00:00.000Z'),
    });

    const all = await service.listInformeFeed({}, actorFor(commercial));
    assert.equal(all.page.total, 2);

    const visits = await service.listInformeFeed({ type: 'VISIT_REPORT' }, actorFor(commercial));
    assert.equal(visits.page.total, 1);
    assert.equal(visits.items[0].type, 'VISIT_REPORT');

    const weeklies = await service.listInformeFeed({ type: 'WEEKLY_REPORT' }, actorFor(commercial));
    assert.equal(weeklies.page.total, 1);
    assert.equal(weeklies.items[0].type, 'WEEKLY_REPORT');
  });

  test('listInformeFeed status=: filtra cancelledAt (active/cancelled)', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();
    await seedVisitRow({
      user: commercial,
      client,
      createdAt: new Date('2026-07-22T12:00:00.000Z'),
    });
    await seedVisitRow({
      user: commercial,
      client,
      createdAt: new Date('2026-07-22T13:00:00.000Z'),
      cancelledAt: new Date('2026-07-22T14:00:00.000Z'),
    });

    const active = await service.listInformeFeed({ status: 'active' }, actorFor(commercial));
    assert.equal(active.page.total, 1);
    assert.equal(active.items[0].cancelledAt, null);

    const cancelled = await service.listInformeFeed({ status: 'cancelled' }, actorFor(commercial));
    assert.equal(cancelled.page.total, 1);
    assert.ok(cancelled.items[0].cancelledAt);
  });

  test('listInformeFeed authorId=: filtra por autor (os dois tipos) + valida UUID', async () => {
    await resetDatabase();
    const a = await seedUser('COMMERCIAL');
    const b = await seedUser('COMMERCIAL');
    const client = await seedClient();
    await seedVisitRow({ user: a, client, createdAt: new Date('2026-07-22T12:00:00.000Z') });
    await seedWeeklyRow({
      user: a,
      weekStart: new Date('2026-07-20'),
      createdAt: new Date('2026-07-22T13:00:00.000Z'),
    });
    await seedVisitRow({ user: b, client, createdAt: new Date('2026-07-22T14:00:00.000Z') });

    const onlyA = await service.listInformeFeed({ authorId: a.id }, actorFor(a));
    assert.equal(onlyA.page.total, 2);
    for (const item of onlyA.items) {
      assert.equal(item.user.id, a.id);
    }

    await assert.rejects(
      () => service.listInformeFeed({ authorId: 'nao-e-uuid' }, actorFor(a)),
      (err) => err.status === 422 && err.details?.field === 'authorId'
    );
  });

  test('listInformeFeed search=: casa autor (2 tipos) e cliente novo (so visita)', async () => {
    await resetDatabase();
    const zelia = await seedUser('COMMERCIAL', 'zebrafeed');
    const other = await seedUser('COMMERCIAL', 'otherfeed');
    const client = await seedClient();
    await seedVisitRow({
      user: zelia,
      client,
      clientKind: 'NEW',
      newClientName: 'Fazenda Girassol',
      createdAt: new Date('2026-07-22T12:00:00.000Z'),
    });
    await seedWeeklyRow({
      user: zelia,
      weekStart: new Date('2026-07-20'),
      createdAt: new Date('2026-07-22T13:00:00.000Z'),
    });
    await seedVisitRow({ user: other, client, createdAt: new Date('2026-07-22T14:00:00.000Z') });

    // autor: username "user-zebrafeed" contem "zebrafeed" -> visita + semanal do zelia
    const byAuthor = await service.listInformeFeed({ search: 'zebrafeed' }, actorFor(zelia));
    assert.equal(byAuthor.page.total, 2);

    // cliente: "Girassol" (newClientNameNormalized gerado) casa SO a visita
    const byClient = await service.listInformeFeed({ search: 'Girassol' }, actorFor(zelia));
    assert.equal(byClient.page.total, 1);
    assert.equal(byClient.items[0].type, 'VISIT_REPORT');
  });

  test('listInformeFeed from/to: filtra por periodo (createdAt, dia BRT inclusivo)', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();
    const inside = await seedVisitRow({
      user: commercial,
      client,
      createdAt: new Date('2026-07-20T12:00:00.000Z'),
    });
    await seedVisitRow({
      user: commercial,
      client,
      createdAt: new Date('2026-07-10T12:00:00.000Z'),
    });
    await seedVisitRow({
      user: commercial,
      client,
      createdAt: new Date('2026-07-25T12:00:00.000Z'),
    });

    const ranged = await service.listInformeFeed(
      { from: '2026-07-15', to: '2026-07-22' },
      actorFor(commercial)
    );
    assert.equal(ranged.page.total, 1);
    assert.equal(ranged.items[0].id, inside.id);
  });

  test('listInformeFeed: funde visita+semanal por created_at desc e pagina certo', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();
    const v1 = await seedVisitRow({
      user: commercial,
      client,
      createdAt: new Date('2026-07-22T10:00:00.000Z'),
    });
    const w1 = await seedWeeklyRow({
      user: commercial,
      weekStart: new Date('2026-07-20'),
      createdAt: new Date('2026-07-22T11:00:00.000Z'),
    });
    const v2 = await seedVisitRow({
      user: commercial,
      client,
      createdAt: new Date('2026-07-22T12:00:00.000Z'),
    });

    const page1 = await service.listInformeFeed({ page: 1, limit: 2 }, actorFor(commercial));
    assert.equal(page1.page.total, 3);
    assert.equal(page1.page.hasNext, true);
    assert.deepEqual(
      page1.items.map((i) => i.id),
      [v2.id, w1.id]
    );

    const page2 = await service.listInformeFeed({ page: 2, limit: 2 }, actorFor(commercial));
    assert.deepEqual(
      page2.items.map((i) => i.id),
      [v1.id]
    );
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
