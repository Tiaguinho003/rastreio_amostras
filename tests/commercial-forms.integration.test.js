import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { CommercialFormsService } from '../src/visits/commercial-forms-service.js';
import { VisitReportService } from '../src/visits/visit-report-service.js';

// Formularios do comercial — visita (commercial_visit), relatorio semanal
// (weekly_report, max 1 por usuario por semana via UNIQUE) e o feed
// combinado paginado (escopo mine = proprio autor; escopo all = /resumo
// com os 3 tipos, incluindo visit_report do prospector).

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('commercial-forms integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const service = new CommercialFormsService({ prisma });
  const visitReportService = new VisitReportService({ prisma });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE weekly_report_reminder, commercial_visit, weekly_report, visit_report, idempotency_record, client_audit_event, client_commercial_user, client_unit, client, user_session, app_user RESTART IDENTITY CASCADE'
    );
  }

  // Mock do push service pro lembrete semanal: captura os envios.
  function createPushMock() {
    const calls = [];
    return {
      calls,
      async sendToUsers(userIds, message, options) {
        calls.push({ userIds: [...userIds].sort(), message, options });
        return { sent: userIds.length, failed: 0, pruned: 0 };
      },
    };
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

  async function seedClient({ status = 'ACTIVE', fullName = 'Cliente Teste' } = {}) {
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

  function baseVisitInput(overrides = {}) {
    return {
      clientKind: 'NEW',
      newClientName: 'Comprador Novo',
      reason: 'NEGOTIATION',
      outcome: 'PROPOSAL_IN_PROGRESS',
      ...overrides,
    };
  }

  function baseReportInput(overrides = {}) {
    return {
      summary: 'Semana de visitas na regiao sul',
      ...overrides,
    };
  }

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('createCommercialVisit NEW: carimba usuario/data e zera clientId', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');

    const result = await service.createCommercialVisit(
      baseVisitInput({
        newClientCity: 'Varginha/MG',
        reasonNotes: 'indicacao de um parceiro',
        outcomeNotes: 'volta semana que vem',
        generalNotes: 'pediu tabela de precos',
      }),
      actorFor(commercial)
    );

    assert.equal(result.visit.type, 'COMMERCIAL_VISIT');
    assert.equal(result.visit.clientKind, 'NEW');
    assert.equal(result.visit.client, null);
    assert.equal(result.visit.newClient.name, 'Comprador Novo');
    assert.equal(result.visit.reason, 'NEGOTIATION');
    assert.equal(result.visit.reasonNotes, 'indicacao de um parceiro');
    assert.equal(result.visit.outcome, 'PROPOSAL_IN_PROGRESS');
    assert.equal(result.visit.outcomeNotes, 'volta semana que vem');
    assert.equal(result.visit.user.id, commercial.id);

    const row = await prisma.commercialVisit.findUnique({ where: { id: result.visit.id } });
    assert.equal(row.userId, commercial.id);
    assert.equal(row.clientId, null);
  });

  test('createCommercialVisit EXISTING: vincula cliente ativo e zera campos new_*', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();

    const result = await service.createCommercialVisit(
      baseVisitInput({
        clientKind: 'EXISTING',
        clientId: client.id,
        newClientName: 'Nao deveria persistir',
        outcome: 'DEAL_CLOSED',
      }),
      actorFor(commercial)
    );

    assert.equal(result.visit.clientKind, 'EXISTING');
    assert.equal(result.visit.client.id, client.id);
    assert.equal(result.visit.newClient, null);

    const row = await prisma.commercialVisit.findUnique({ where: { id: result.visit.id } });
    assert.equal(row.newClientName, null);
  });

  test('createCommercialVisit: validacoes 422 e matriz de papeis', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const admin = await seedUser('ADMIN');
    const inactive = await seedClient({ status: 'INACTIVE', fullName: 'Inativo' });
    const actor = actorFor(commercial);

    await assert.rejects(
      service.createCommercialVisit(baseVisitInput({ reason: 'OTHER' }), actor),
      (error) => error.status === 422 && error.details?.field === 'reason'
    );
    await assert.rejects(
      service.createCommercialVisit(baseVisitInput({ outcome: 'MAYBE' }), actor),
      (error) => error.status === 422 && error.details?.field === 'outcome'
    );
    await assert.rejects(
      service.createCommercialVisit(
        baseVisitInput({ clientKind: 'EXISTING', clientId: null }),
        actor
      ),
      (error) => error.status === 422 && error.details?.field === 'clientId'
    );
    await assert.rejects(
      service.createCommercialVisit(
        baseVisitInput({ clientKind: 'EXISTING', clientId: inactive.id }),
        actor
      ),
      (error) => error.status === 422 && error.details?.code === 'VISIT_CLIENT_INACTIVE'
    );
    await assert.rejects(
      service.createCommercialVisit(baseVisitInput({ newClientName: '  ' }), actor),
      (error) => error.status === 422 && error.details?.field === 'newClientName'
    );

    // ADMIN tambem cria; demais papeis 403.
    const byAdmin = await service.createCommercialVisit(baseVisitInput(), actorFor(admin));
    assert.equal(byAdmin.visit.user.id, admin.id);

    for (const role of ['CLASSIFIER', 'REGISTRATION', 'CADASTRO', 'PROSPECTOR']) {
      const denied = await seedUser(role);
      await assert.rejects(
        service.createCommercialVisit(baseVisitInput(), actorFor(denied)),
        (error) => error.status === 403
      );
    }
  });

  test('createWeeklyReport: semana do servidor; duplicata na mesma semana responde 409', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const colleague = await seedUser('COMMERCIAL');

    // "Agora" fixo: quarta 2026-06-10 14:00 BRT — semana 08/06 a 14/06.
    const now = new Date('2026-06-10T17:00:00.000Z');

    const created = await service.createWeeklyReport(
      baseReportInput({ difficulties: 'chuva na estrada', nextWeekPlan: 'fechar 2 propostas' }),
      actorFor(commercial),
      { now }
    );
    assert.equal(created.report.type, 'WEEKLY_REPORT');
    assert.equal(created.report.weekStart, '2026-06-08');
    assert.equal(created.report.weekEnd, '2026-06-14');
    assert.equal(created.report.summary, 'Semana de visitas na regiao sul');

    // Mesma semana, mesmo autor: bloqueado pela UNIQUE.
    await assert.rejects(
      service.createWeeklyReport(baseReportInput(), actorFor(commercial), { now }),
      (error) => error.status === 409 && error.details?.code === 'WEEKLY_REPORT_ALREADY_EXISTS'
    );

    // Outro autor na mesma semana: ok.
    const byColleague = await service.createWeeklyReport(baseReportInput(), actorFor(colleague), {
      now,
    });
    assert.equal(byColleague.report.weekStart, '2026-06-08');

    // Mesmo autor em OUTRA semana: ok.
    const nextWeek = await service.createWeeklyReport(baseReportInput(), actorFor(commercial), {
      now: new Date('2026-06-17T17:00:00.000Z'),
    });
    assert.equal(nextWeek.report.weekStart, '2026-06-15');

    // summary obrigatorio.
    await assert.rejects(
      service.createWeeklyReport({ summary: '  ' }, actorFor(commercial), { now }),
      (error) => error.status === 422
    );
  });

  test('listInformeFeed: ordem cronologica cruzando tipos, escopos e papeis', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const colleague = await seedUser('COMMERCIAL');
    const prospector = await seedUser('PROSPECTOR');
    const admin = await seedUser('ADMIN');
    const cadastro = await seedUser('CADASTRO');

    // createdAt explicito pra ordenacao deterministica.
    const base = Date.parse('2026-06-10T12:00:00.000Z');
    await prisma.visitReport.create({
      data: {
        id: randomUUID(),
        userId: prospector.id,
        clientKind: 'NEW',
        newClientName: 'Prospect A',
        farmSize: 'SMALL',
        interestLevel: 'HIGH',
        sellsCurrently: false,
        createdAt: new Date(base),
      },
    });
    await prisma.commercialVisit.create({
      data: {
        id: randomUUID(),
        userId: commercial.id,
        clientKind: 'NEW',
        newClientName: 'Comprador B',
        reason: 'NEGOTIATION',
        outcome: 'NO_PROGRESS',
        createdAt: new Date(base + 60_000),
      },
    });
    await prisma.weeklyReport.create({
      data: {
        id: randomUUID(),
        userId: commercial.id,
        weekStart: new Date('2026-06-08'),
        summary: 'Resumo da semana',
        createdAt: new Date(base + 120_000),
      },
    });
    // Visita de OUTRO comercial: aparece no all, fora do mine do primeiro.
    await prisma.commercialVisit.create({
      data: {
        id: randomUUID(),
        userId: colleague.id,
        clientKind: 'NEW',
        newClientName: 'Comprador C',
        reason: 'COLLECTION',
        outcome: 'NO_INTEREST',
        createdAt: new Date(base + 180_000),
      },
    });

    // mine: so os envios do proprio ator (sem VISIT_REPORT), mais recente primeiro.
    const mine = await service.listInformeFeed({ scope: 'mine' }, actorFor(commercial));
    assert.equal(mine.page.total, 2);
    assert.deepEqual(
      mine.items.map((item) => item.type),
      ['WEEKLY_REPORT', 'COMMERCIAL_VISIT']
    );
    assert.ok(mine.items.every((item) => item.user.id === commercial.id));

    // all: os 3 tipos de todos os autores, total somado.
    const all = await service.listInformeFeed({ scope: 'all' }, actorFor(admin));
    assert.equal(all.page.total, 4);
    assert.deepEqual(
      all.items.map((item) => item.type),
      ['COMMERCIAL_VISIT', 'WEEKLY_REPORT', 'COMMERCIAL_VISIT', 'VISIT_REPORT']
    );

    // Paginacao do feed combinado.
    const firstPage = await service.listInformeFeed(
      { scope: 'all', page: 1, limit: 3 },
      actorFor(cadastro)
    );
    assert.equal(firstPage.items.length, 3);
    assert.equal(firstPage.page.hasNext, true);
    const secondPage = await service.listInformeFeed(
      { scope: 'all', page: 2, limit: 3 },
      actorFor(cadastro)
    );
    assert.equal(secondPage.items.length, 1);
    assert.equal(secondPage.items[0].type, 'VISIT_REPORT');

    // Papeis: mine e exclusivo de COMMERCIAL/ADMIN; all segue viewers.
    const adminMine = await service.listInformeFeed({ scope: 'mine' }, actorFor(admin));
    assert.equal(adminMine.page.total, 0);
    await assert.rejects(
      service.listInformeFeed({ scope: 'mine' }, actorFor(cadastro)),
      (error) => error.status === 403
    );
    await assert.rejects(
      service.listInformeFeed({ scope: 'mine' }, actorFor(prospector)),
      (error) => error.status === 403
    );
    for (const role of ['CLASSIFIER', 'REGISTRATION', 'PROSPECTOR']) {
      const denied = await seedUser(role);
      await assert.rejects(
        service.listInformeFeed({ scope: 'all' }, actorFor(denied)),
        (error) => error.status === 403
      );
    }

    // scope invalido.
    await assert.rejects(
      service.listInformeFeed({ scope: 'team' }, actorFor(admin)),
      (error) => error.status === 422
    );

    // Feed inclui o informe do prospector com a view canonica reusada.
    const prospectItem = all.items.find((item) => item.type === 'VISIT_REPORT');
    assert.equal(prospectItem.newClient.name, 'Prospect A');
    assert.equal(prospectItem.farmSize, 'SMALL');
  });

  test('deletes: so o autor exclui o proprio; alheio 404 (nem ADMIN)', async () => {
    await resetDatabase();
    const admin = await seedUser('ADMIN');
    const commercial = await seedUser('COMMERCIAL');
    const colleague = await seedUser('COMMERCIAL');

    const visit = await service.createCommercialVisit(baseVisitInput(), actorFor(commercial));
    const report = await service.createWeeklyReport(baseReportInput(), actorFor(commercial), {
      now: new Date('2026-06-10T17:00:00.000Z'),
    });

    // Colega nao exclui item alheio (404, sem vazar existencia).
    await assert.rejects(
      service.deleteCommercialVisit({ visitId: visit.visit.id }, actorFor(colleague)),
      (error) => error.status === 404 && error.details?.code === 'COMMERCIAL_VISIT_NOT_FOUND'
    );
    await assert.rejects(
      service.deleteWeeklyReport({ reportId: report.report.id }, actorFor(colleague)),
      (error) => error.status === 404 && error.details?.code === 'WEEKLY_REPORT_NOT_FOUND'
    );

    // Nem ADMIN exclui formulario alheio.
    await assert.rejects(
      service.deleteCommercialVisit({ visitId: visit.visit.id }, actorFor(admin)),
      (error) => error.status === 404 && error.details?.code === 'COMMERCIAL_VISIT_NOT_FOUND'
    );
    await assert.rejects(
      service.deleteWeeklyReport({ reportId: report.report.id }, actorFor(admin)),
      (error) => error.status === 404 && error.details?.code === 'WEEKLY_REPORT_NOT_FOUND'
    );

    // Autor exclui o proprio (visita e relatorio).
    assert.deepEqual(
      await service.deleteCommercialVisit({ visitId: visit.visit.id }, actorFor(commercial)),
      { removed: true }
    );
    assert.deepEqual(
      await service.deleteWeeklyReport({ reportId: report.report.id }, actorFor(commercial)),
      { removed: true }
    );

    // Inexistente (ja removido): 404.
    await assert.rejects(
      service.deleteWeeklyReport({ reportId: report.report.id }, actorFor(commercial)),
      (error) => error.status === 404
    );

    assert.equal(await prisma.commercialVisit.count(), 0);
    assert.equal(await prisma.weeklyReport.count(), 0);
  });

  test('sendWeeklyReportReminders: R1 (>6d12h), R2 (sexta 17h BRT) e 1 lembrete por semana', async () => {
    await resetDatabase();
    const veteran = await seedUser('COMMERCIAL'); // tem relatorio antigo
    const fresh = await seedUser('COMMERCIAL'); // nunca enviou
    const done = await seedUser('COMMERCIAL'); // ja cumpriu a semana
    await seedUser('PROSPECTOR'); // fora do papel — nunca lembrado

    // "Agora": quarta 2026-06-10 14:00 BRT (17:00Z). Semana corrente: 08/06.
    const wednesday = new Date('2026-06-10T17:00:00.000Z');

    // veteran: ultimo relatorio (semana passada) ha exatos 7 dias.
    await prisma.weeklyReport.create({
      data: {
        id: randomUUID(),
        userId: veteran.id,
        weekStart: new Date('2026-06-01'),
        summary: 'semana passada',
        createdAt: new Date('2026-06-03T17:00:00.000Z'),
      },
    });
    // done: relatorio DESTA semana — nunca lembrado.
    await prisma.weeklyReport.create({
      data: {
        id: randomUUID(),
        userId: done.id,
        weekStart: new Date('2026-06-08'),
        summary: 'feita',
        createdAt: new Date('2026-06-09T12:00:00.000Z'),
      },
    });

    // Quarta: so R1 — apenas veteran (fresh nao tem relatorio anterior).
    const push1 = createPushMock();
    const r1 = await service.sendWeeklyReportReminders({ pushService: push1, now: wednesday });
    assert.equal(r1.reminded, 1);
    assert.deepEqual(push1.calls[0].userIds, [veteran.id]);
    assert.equal(push1.calls[0].message.title, 'Lembre-se do seu relatório.');
    assert.equal(push1.calls[0].message.body, '');
    assert.equal(push1.calls[0].message.url, '/informe');

    // Re-execucao (job roda de hora em hora): dedup — nada novo.
    const push2 = createPushMock();
    const r2 = await service.sendWeeklyReportReminders({ pushService: push2, now: wednesday });
    assert.equal(r2.reminded, 0);
    assert.equal(push2.calls.length, 0);

    // Sexta 17:00 BRT (20:00Z): R2 pega fresh; veteran segue dedupado
    // (uma das regras ja lembrou nesta semana); done cumpriu a semana.
    const friday = new Date('2026-06-12T20:00:00.000Z');
    const push3 = createPushMock();
    const r3 = await service.sendWeeklyReportReminders({ pushService: push3, now: friday });
    assert.equal(r3.reminded, 1);
    assert.deepEqual(push3.calls[0].userIds, [fresh.id]);

    // Semana seguinte: dedup zera (novo week_start) — veteran volta a ser
    // elegivel por R1 (ultimo relatorio agora bem antigo).
    const nextWednesday = new Date('2026-06-17T17:00:00.000Z');
    const push4 = createPushMock();
    const r4 = await service.sendWeeklyReportReminders({ pushService: push4, now: nextWednesday });
    assert.ok(push4.calls[0].userIds.includes(veteran.id));
    assert.equal(r4.reminded, push4.calls[0].userIds.length);
  });

  test('sendWeeklyReportReminders: fronteiras de R1 (6d12h) e R2 (17:00 BRT)', async () => {
    await resetDatabase();
    const user = await seedUser('COMMERCIAL');
    // Quarta 2026-06-10 14:00 BRT.
    const now = new Date('2026-06-10T17:00:00.000Z');

    // Ultimo relatorio ha 6d11h: AINDA nao dispara.
    await prisma.weeklyReport.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        weekStart: new Date('2026-06-01'),
        summary: 'x',
        createdAt: new Date(now.getTime() - (6 * 24 + 11) * 3600_000),
      },
    });
    const pushA = createPushMock();
    const a = await service.sendWeeklyReportReminders({ pushService: pushA, now });
    assert.equal(a.reminded, 0);

    // Ha 6d13h: dispara.
    await prisma.weeklyReport.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(now.getTime() - (6 * 24 + 13) * 3600_000) },
    });
    const pushB = createPushMock();
    const b = await service.sendWeeklyReportReminders({ pushService: pushB, now });
    assert.equal(b.reminded, 1);

    // R2: sexta 16:59 BRT nao dispara pra quem nunca enviou; 17:00 sim.
    const fresh = await seedUser('COMMERCIAL');
    const fridayEarly = new Date('2026-06-12T19:59:00.000Z');
    const pushC = createPushMock();
    const c = await service.sendWeeklyReportReminders({ pushService: pushC, now: fridayEarly });
    assert.equal(c.reminded, 0);

    const fridayAt = new Date('2026-06-12T20:00:00.000Z');
    const pushD = createPushMock();
    const d = await service.sendWeeklyReportReminders({ pushService: pushD, now: fridayAt });
    assert.equal(d.reminded, 1);
    assert.deepEqual(pushD.calls[0].userIds, [fresh.id]);
  });

  // O service do prospector segue funcionando lado a lado (smoke do feed).
  test('feed convive com visit_report criado pelo service do prospector', async () => {
    await resetDatabase();
    const prospector = await seedUser('PROSPECTOR');
    const admin = await seedUser('ADMIN');

    await visitReportService.createVisitReport(
      {
        clientKind: 'NEW',
        newClientName: 'Prospect Vivo',
        farmSize: 'MEDIUM',
        interestLevel: 'HIGH',
        sellsCurrently: false,
      },
      actorFor(prospector)
    );

    const all = await service.listInformeFeed({ scope: 'all' }, actorFor(admin));
    assert.equal(all.page.total, 1);
    assert.equal(all.items[0].type, 'VISIT_REPORT');
  });
}

async function canReachDatabase(url) {
  if (!url) {
    return false;
  }

  const probe = new PrismaClient({ datasources: { db: { url } } });
  try {
    await probe.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.$disconnect();
  }
}
