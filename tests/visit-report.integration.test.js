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
// offline), listagem paginada (viewers veem tudo; PROSPECTOR so os
// proprios) e CURADORIA do vinculo informe -> cliente
// (linkVisitReportClient: ADMIN/CADASTRO setam/trocam/removem clientId com
// auditoria linkedBy/linkedAt). clientKind e declaracao do autor: nome
// anotado obrigatorio nos dois kinds; payload legado EXISTING+clientId
// (fila offline antiga) segue aceito e nasce born-linked. Inclui os
// caminhos via backend-api: POST idempotente (replay da fila nao duplica)
// e PATCH /visit-reports/:id/client.

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('visit-report integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const service = new VisitReportService({ prisma });

  // Actors fixos do caminho via backend-api (LocalAuthService + FK em
  // app_user): autor COMMERCIAL (envia informes) e curador CADASTRO
  // (vincula cliente).
  const ACTOR_USER_ID = '00000000-0000-0000-0000-000000000901';
  const CURATOR_USER_ID = '00000000-0000-0000-0000-000000000902';
  let api;
  let authHeaders;
  let curatorHeaders;

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
        {
          id: CURATOR_USER_ID,
          username: 'visit-curator',
          password: 'curator123',
          role: 'CADASTRO',
          displayName: 'Curadora Cadastro',
        },
      ],
    });

    authHeaders = {
      authorization: `Bearer ${authService.login({ username: 'visit-test', password: 'visit123' }).accessToken}`,
      'x-source': 'web',
    };
    curatorHeaders = {
      authorization: `Bearer ${authService.login({ username: 'visit-curator', password: 'curator123' }).accessToken}`,
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

  async function seedCuratorUser() {
    return prisma.user.create({
      data: {
        id: CURATOR_USER_ID,
        fullName: 'Curadora Cadastro',
        username: 'visit-curator',
        usernameCanonical: 'visit-curator',
        email: 'visit-curator@example.com',
        emailCanonical: 'visit-curator@example.com',
        passwordHash: 'x',
        role: 'CADASTRO',
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

  test('createVisitReport EXISTING legado (clientId no payload): nasce born-linked e zera campos new_*', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();

    // Payload de versoes antigas do app (fila offline anterior a curadoria):
    // EXISTING + clientId selecionado no lookup. Continua aceito por compat.
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
    // Born-linked: clientId setado na criacao, SEM auditoria de curadoria.
    assert.equal(result.report.linkedBy, null);
    assert.equal(result.report.linkedAt, null);

    const row = await prisma.visitReport.findUnique({ where: { id: result.report.id } });
    assert.equal(row.newClientName, null);
    assert.equal(row.newClientCity, null);
    assert.equal(row.newClientPhone, null);
    assert.equal(row.linkedByUserId, null);
    assert.equal(row.linkedAt, null);
  });

  test('createVisitReport EXISTING (declaracao): sem clientId persiste nome anotado e nasce aguardando vinculo', async () => {
    await resetDatabase();
    const prospector = await seedUser('PROSPECTOR');

    // Formulario novo: "Ja e cliente" e declaracao do autor, sem lookup —
    // nome/cidade/telefone capturados em texto livre como no Cliente novo.
    const result = await service.createVisitReport(
      baseInput({
        clientKind: 'EXISTING',
        clientId: null,
        newClientName: 'João da Boa Vista',
        newClientCity: 'Campos Altos/MG',
        newClientPhone: '(34) 98888-7777',
      }),
      actorFor(prospector)
    );

    assert.equal(result.report.clientKind, 'EXISTING');
    assert.equal(result.report.client, null);
    assert.equal(result.report.newClient.name, 'João da Boa Vista');
    assert.equal(result.report.newClient.city, 'Campos Altos/MG');
    assert.equal(result.report.newClient.phone, '(34) 98888-7777');
    assert.equal(result.report.linkedBy, null);
    assert.equal(result.report.linkedAt, null);

    const row = await prisma.visitReport.findUnique({ where: { id: result.report.id } });
    assert.equal(row.clientId, null);
    assert.equal(row.newClientName, 'João da Boa Vista');
    assert.equal(row.linkedByUserId, null);
    assert.equal(row.linkedAt, null);
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

    // EXISTING sem clientId e sem nome anotado: a falta agora e do NOME
    // (declaracao exige texto livre nos dois kinds).
    await assert.rejects(
      service.createVisitReport(
        baseInput({ clientKind: 'EXISTING', clientId: null, newClientName: '  ' }),
        actor
      ),
      (error) => error.status === 422 && error.details?.field === 'newClientName'
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

  test('listVisitReports: viewers veem tudo; PROSPECTOR ve so autores prospectores; 403 pros demais', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const cadastro = await seedUser('CADASTRO');
    const classifier = await seedUser('CLASSIFIER');
    const registration = await seedUser('REGISTRATION');
    const prospector = await seedUser('PROSPECTOR');
    const colleague = await seedUser('PROSPECTOR');

    // Informes de tres autores: 2 do prospector + 1 do colega prospector
    // + 1 do comercial.
    await service.createVisitReport(
      baseInput({ newClientName: 'Visita Prospector 1' }),
      actorFor(prospector)
    );
    await service.createVisitReport(
      baseInput({ newClientName: 'Visita Prospector 2' }),
      actorFor(prospector)
    );
    await service.createVisitReport(
      baseInput({ newClientName: 'Visita Colega 1' }),
      actorFor(colleague)
    );
    await service.createVisitReport(
      baseInput({ newClientName: 'Visita Comercial 1' }),
      actorFor(commercial)
    );

    // Papeis com acesso ao /resumo (ADMIN + CADASTRO) veem tudo.
    const allowedCadastro = await service.listVisitReports({}, actorFor(cadastro));
    assert.equal(allowedCadastro.page.total, 4);

    // PROSPECTOR ve os informes de TODOS os autores prospectores
    // (comparacao da equipe), mas nao os dos demais papeis.
    const team = await service.listVisitReports({}, actorFor(prospector));
    assert.equal(team.page.total, 3);
    assert.equal(team.items.length, 3);
    const teamAuthors = new Set(team.items.map((item) => item.user.id));
    assert.deepEqual([...teamAuthors].sort(), [prospector.id, colleague.id].sort());

    for (const denied of [classifier, registration, commercial]) {
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

  test('getMyVisitReportStats: conta so do ator, fronteiras BRT e COALESCE(capturedAt)', async () => {
    await resetDatabase();
    const prospector = await seedUser('PROSPECTOR');
    const other = await seedUser('COMMERCIAL');
    const idle = await seedUser('PROSPECTOR');

    // "Agora" fixo: 2026-06-15 12:00 BRT (15:00Z). Janela do dia esperada:
    // [2026-06-15T03:00Z, 2026-06-16T03:00Z)
    const now = new Date('2026-06-15T15:00:00.000Z');

    async function seedReport({ userId, clientKind = 'NEW', createdAt, capturedAt = null }) {
      await prisma.visitReport.create({
        data: {
          id: randomUUID(),
          userId,
          clientKind,
          newClientName: clientKind === 'NEW' ? 'Prospect Stats' : null,
          farmSize: 'SMALL',
          interestLevel: 'LOW',
          sellsCurrently: false,
          createdAt: new Date(createdAt),
          capturedAt: capturedAt ? new Date(capturedAt) : null,
        },
      });
    }

    // NEW dentro do dia BRT corrente: conta nos dois cards.
    await seedReport({ userId: prospector.id, createdAt: '2026-06-15T14:00:00.000Z' });
    // COALESCE: preenchido offline ontem, sincronizado hoje — conta ontem
    // (fora do dia, fora dos dois cards).
    await seedReport({
      userId: prospector.id,
      createdAt: '2026-06-15T14:30:00.000Z',
      capturedAt: '2026-06-14T18:00:00.000Z',
    });
    // EXISTING hoje: conta nas visitas do dia, nao como cliente novo.
    await seedReport({
      userId: prospector.id,
      clientKind: 'EXISTING',
      createdAt: '2026-06-15T10:00:00.000Z',
    });
    // Bem fora da janela (31/05 BRT).
    await seedReport({ userId: prospector.id, createdAt: '2026-05-31T20:00:00.000Z' });
    // Fronteira inclusiva do dia (00:00 BRT exato): conta nos dois cards.
    await seedReport({ userId: prospector.id, createdAt: '2026-06-15T03:00:00.000Z' });
    // Fronteira exclusiva (1ms antes = 14/06 BRT): fora do dia.
    await seedReport({ userId: prospector.id, createdAt: '2026-06-15T02:59:59.999Z' });
    // Informe de OUTRO usuario hoje: nunca entra na conta do ator.
    await seedReport({ userId: other.id, createdAt: '2026-06-15T13:00:00.000Z' });

    const stats = await service.getMyVisitReportStats(actorFor(prospector), { now });
    assert.equal(stats.todayCount, 3);
    assert.equal(stats.todayNewClientsCount, 2);

    // Usuario sem informes: zeros.
    const empty = await service.getMyVisitReportStats(actorFor(idle), { now });
    assert.equal(empty.todayCount, 0);
    assert.equal(empty.todayNewClientsCount, 0);

    // Sem ator autenticado: 401.
    await assert.rejects(
      service.getMyVisitReportStats({}, { now }),
      (error) => error.status === 401
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

  test('deleteVisitReport: so o autor exclui o proprio; alheio 404 (nem ADMIN)', async () => {
    await resetDatabase();
    const admin = await seedUser('ADMIN');
    const commercial = await seedUser('COMMERCIAL');
    const prospector = await seedUser('PROSPECTOR');

    const own = await service.createVisitReport(baseInput(), actorFor(prospector));
    const other = await service.createVisitReport(baseInput(), actorFor(commercial));

    // Informe alheio: mesma resposta de inexistente (404), sem vazar existencia.
    await assert.rejects(
      service.deleteVisitReport({ reportId: other.report.id }, actorFor(prospector)),
      (error) => error.status === 404 && error.details?.code === 'VISIT_REPORT_NOT_FOUND'
    );

    // Nem ADMIN exclui informe alheio: o /resumo e curadoria de vinculo, nao
    // de exclusao.
    await assert.rejects(
      service.deleteVisitReport({ reportId: own.report.id }, actorFor(admin)),
      (error) => error.status === 404 && error.details?.code === 'VISIT_REPORT_NOT_FOUND'
    );

    // Autor exclui o proprio (lixeira do dashboard do prospector).
    const removedOwn = await service.deleteVisitReport(
      { reportId: own.report.id },
      actorFor(prospector)
    );
    assert.deepEqual(removedOwn, { removed: true });

    // O outro autor exclui o proprio.
    const removedOther = await service.deleteVisitReport(
      { reportId: other.report.id },
      actorFor(commercial)
    );
    assert.deepEqual(removedOther, { removed: true });
    assert.equal(await prisma.visitReport.count(), 0);

    // Ja removido: 404.
    await assert.rejects(
      service.deleteVisitReport({ reportId: other.report.id }, actorFor(commercial)),
      (error) => error.status === 404 && error.details?.code === 'VISIT_REPORT_NOT_FOUND'
    );
  });

  test('linkVisitReportClient: ADMIN e CADASTRO vinculam com auditoria, preservando nome anotado e declaracao', async () => {
    await resetDatabase();
    const prospector = await seedUser('PROSPECTOR');
    const cadastro = await seedUser('CADASTRO');
    const admin = await seedUser('ADMIN');
    const clientA = await seedClient({ fullName: 'Produtor A' });
    const clientB = await seedClient({ fullName: 'Produtor B' });

    const created = await service.createVisitReport(
      baseInput({ newClientName: 'Anotado na Visita' }),
      actorFor(prospector)
    );

    // CADASTRO vincula: clientId + auditoria; nome anotado e clientKind
    // (declaracao do autor) ficam intactos.
    const linked = await service.linkVisitReportClient(
      { reportId: created.report.id, clientId: clientA.id },
      actorFor(cadastro)
    );
    assert.equal(linked.report.client.id, clientA.id);
    assert.equal(linked.report.client.displayName, 'Produtor A');
    assert.equal(linked.report.newClient.name, 'Anotado na Visita');
    assert.equal(linked.report.clientKind, 'NEW');
    assert.equal(linked.report.linkedBy.id, cadastro.id);
    assert.ok(linked.report.linkedAt);

    // ADMIN re-vincula para outro cliente: troca o vinculo e a auditoria.
    const relinked = await service.linkVisitReportClient(
      { reportId: created.report.id, clientId: clientB.id },
      actorFor(admin)
    );
    assert.equal(relinked.report.client.id, clientB.id);
    assert.equal(relinked.report.linkedBy.id, admin.id);

    const row = await prisma.visitReport.findUnique({ where: { id: created.report.id } });
    assert.equal(row.clientId, clientB.id);
    assert.equal(row.linkedByUserId, admin.id);
    assert.ok(row.linkedAt);
    assert.equal(row.newClientName, 'Anotado na Visita');
    assert.equal(row.clientKind, 'NEW');
  });

  test('linkVisitReportClient: desvincular (clientId null) limpa vinculo e auditoria', async () => {
    await resetDatabase();
    const prospector = await seedUser('PROSPECTOR');
    const admin = await seedUser('ADMIN');
    const client = await seedClient();

    const created = await service.createVisitReport(baseInput(), actorFor(prospector));
    await service.linkVisitReportClient(
      { reportId: created.report.id, clientId: client.id },
      actorFor(admin)
    );

    const unlinked = await service.linkVisitReportClient(
      { reportId: created.report.id, clientId: null },
      actorFor(admin)
    );
    assert.equal(unlinked.report.client, null);
    assert.equal(unlinked.report.linkedBy, null);
    assert.equal(unlinked.report.linkedAt, null);
    // Nome anotado segue disponivel pra re-vincular depois.
    assert.equal(unlinked.report.newClient.name, 'Fazenda Boa Vista');

    const row = await prisma.visitReport.findUnique({ where: { id: created.report.id } });
    assert.equal(row.clientId, null);
    assert.equal(row.linkedByUserId, null);
    assert.equal(row.linkedAt, null);
  });

  test('linkVisitReportClient: permissoes e validacoes (403/401/422/404)', async () => {
    await resetDatabase();
    const prospector = await seedUser('PROSPECTOR');
    const admin = await seedUser('ADMIN');
    const inactive = await seedClient({ status: 'INACTIVE', fullName: 'Inativo' });
    const client = await seedClient();

    const created = await service.createVisitReport(baseInput(), actorFor(prospector));
    const reportId = created.report.id;

    // Papeis fora da curadoria (viewers ou nao): 403.
    for (const role of ['COMMERCIAL', 'PROSPECTOR', 'CLASSIFIER', 'REGISTRATION']) {
      const denied = await seedUser(role);
      await assert.rejects(
        service.linkVisitReportClient({ reportId, clientId: client.id }, actorFor(denied)),
        (error) => error.status === 403
      );
    }

    // Sem ator autenticado: 401.
    await assert.rejects(
      service.linkVisitReportClient({ reportId, clientId: client.id }, {}),
      (error) => error.status === 401
    );

    // clientId ausente (undefined): 422 — PATCH com body vazio nao pode
    // desvincular por acidente.
    await assert.rejects(
      service.linkVisitReportClient({ reportId }, actorFor(admin)),
      (error) => error.status === 422 && error.details?.field === 'clientId'
    );

    // Informe inexistente: 404 sem vazar existencia.
    await assert.rejects(
      service.linkVisitReportClient(
        { reportId: randomUUID(), clientId: client.id },
        actorFor(admin)
      ),
      (error) => error.status === 404 && error.details?.code === 'VISIT_REPORT_NOT_FOUND'
    );

    // Cliente inexistente ou inativo: 422 (mesmos codigos do create legado).
    await assert.rejects(
      service.linkVisitReportClient({ reportId, clientId: randomUUID() }, actorFor(admin)),
      (error) => error.status === 422 && error.details?.code === 'VISIT_CLIENT_NOT_FOUND'
    );
    await assert.rejects(
      service.linkVisitReportClient({ reportId, clientId: inactive.id }, actorFor(admin)),
      (error) => error.status === 422 && error.details?.code === 'VISIT_CLIENT_INACTIVE'
    );

    // Nada disso mudou o informe.
    const row = await prisma.visitReport.findUnique({ where: { id: reportId } });
    assert.equal(row.clientId, null);
    assert.equal(row.linkedByUserId, null);
  });

  test('listVisitReports: search filtra por nome do cliente (novo e cadastrado) com total real', async () => {
    await resetDatabase();
    const prospector = await seedUser('PROSPECTOR');
    const commercial = await seedUser('COMMERCIAL');

    // search_normalized e coluna GERADA pelo Postgres a partir do nome —
    // o banco materializa 'jose produtor' sozinho.
    const clientJose = await prisma.client.create({
      data: {
        id: randomUUID(),
        personType: 'PF',
        fullName: 'José Produtor',
        status: 'ACTIVE',
        isSeller: true,
      },
    });

    await service.createVisitReport(
      baseInput({ newClientName: 'Fazenda Boa Vista' }),
      actorFor(prospector)
    );
    await service.createVisitReport(
      baseInput({ newClientName: 'Sítio São José' }),
      actorFor(prospector)
    );
    await service.createVisitReport(
      baseInput({ clientKind: 'EXISTING', clientId: clientJose.id }),
      actorFor(prospector)
    );
    // De autor COMERCIAL: casa a busca, mas prospector so ve autores
    // prospectores.
    await service.createVisitReport(
      baseInput({ newClientName: 'Boa Esperanca' }),
      actorFor(commercial)
    );

    // Cliente novo: case-insensitive.
    const byNew = await service.listVisitReports({ search: 'bOa' }, actorFor(prospector));
    assert.equal(byNew.page.total, 1);
    assert.equal(byNew.items[0].newClient.name, 'Fazenda Boa Vista');

    // 'jose' sem acento casa o cliente CADASTRADO (search_normalized) e o
    // cliente NOVO acentuado (new_client_name_normalized) — os dois caminhos.
    const byName = await service.listVisitReports({ search: 'jose' }, actorFor(prospector));
    assert.equal(byName.page.total, 2);
    assert.deepEqual(byName.items.map((item) => item.clientKind).sort(), ['EXISTING', 'NEW']);

    // 'sao jose' atinge apenas o cliente novo acentuado.
    const byNewAccent = await service.listVisitReports(
      { search: 'sao jose' },
      actorFor(prospector)
    );
    assert.equal(byNewAccent.page.total, 1);
    assert.equal(byNewAccent.items[0].newClient.name, 'Sítio São José');

    // Sem match: lista vazia com total 0 (o contador do dashboard segue a busca).
    const none = await service.listVisitReports({ search: 'inexistente' }, actorFor(prospector));
    assert.equal(none.page.total, 0);
    assert.equal(none.items.length, 0);

    // Viewer busca cruzando autores.
    const viewer = await service.listVisitReports({ search: 'boa' }, actorFor(commercial));
    assert.equal(viewer.page.total, 2);
  });

  test('listVisitReports: search casa o nome anotado de claim EXISTING aguardando vinculo', async () => {
    await resetDatabase();
    const prospector = await seedUser('PROSPECTOR');

    // Declaracao "Ja e cliente" sem vinculo: o nome anotado vive em
    // new_client_name e a coluna gerada normalizada cobre a busca
    // acento-insensitive de graca.
    await service.createVisitReport(
      baseInput({ clientKind: 'EXISTING', clientId: null, newClientName: 'Café São Bento' }),
      actorFor(prospector)
    );

    const hits = await service.listVisitReports({ search: 'sao bento' }, actorFor(prospector));
    assert.equal(hits.page.total, 1);
    assert.equal(hits.items[0].clientKind, 'EXISTING');
    assert.equal(hits.items[0].client, null);
    assert.equal(hits.items[0].newClient.name, 'Café São Bento');
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

  test('PATCH /visit-reports/:id/client via backend-api: 422 sem reportId, 200 no vinculo, 403 fora da curadoria', async () => {
    await resetDatabase();
    await seedActorUser();
    await seedCuratorUser();
    const client = await seedClient();

    const created = await api.createVisitReport({
      headers: authHeaders,
      params: {},
      query: {},
      body: {
        clientKind: 'NEW',
        newClientName: 'Fazenda Vinculo',
        farmSize: 'SMALL',
        interestLevel: 'LOW',
        sellsCurrently: false,
      },
    });
    assert.equal(created.status, 201);
    const reportId = created.body.report.id;

    // Path param ausente: 422 antes de chegar no service.
    const missing = await api.linkVisitReportClient({
      headers: curatorHeaders,
      params: {},
      query: {},
      body: { clientId: client.id },
    });
    assert.equal(missing.status, 422);

    // Curador CADASTRO vincula com 200 e auditoria.
    const linked = await api.linkVisitReportClient({
      headers: curatorHeaders,
      params: { reportId },
      query: {},
      body: { clientId: client.id },
    });
    assert.equal(linked.status, 200);
    assert.equal(linked.body.report.client.id, client.id);
    assert.equal(linked.body.report.linkedBy.id, CURATOR_USER_ID);

    // Ator COMMERCIAL (viewer, nao curador): 403.
    const denied = await api.linkVisitReportClient({
      headers: authHeaders,
      params: { reportId },
      query: {},
      body: { clientId: null },
    });
    assert.equal(denied.status, 403);
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
