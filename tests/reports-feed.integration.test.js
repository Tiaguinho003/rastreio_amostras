import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { VisitReportService } from '../src/visits/visit-report-service.js';

// Relatorio SEMANAL (weekly_report, so ADMIN + COMMERCIAL criam; max 1 por
// usuario por semana via UNIQUE; cancelamento soft) e o FEED combinado da
// pagina "Relatorios" (listInformeFeed, scope=all: visita + semanal de TODOS
// os autores; viewer = todo nao-PROSPECTOR). Unificacao 2026-07-15: o antigo
// commercial_visit foi fundido no visit_report (ver visit-report.integration).

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('reports-feed integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const service = new VisitReportService({ prisma });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE weekly_report, visit_report, idempotency_record, client_audit_event, client_commercial_user, client_unit, client, user_session, app_user RESTART IDENTITY CASCADE'
    );
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

  async function seedClient({ fullName = 'Cliente Teste' } = {}) {
    return prisma.client.create({
      data: {
        id: randomUUID(),
        personType: 'PF',
        fullName,
        status: 'ACTIVE',
        isSeller: true,
      },
    });
  }

  function actorFor(user) {
    return { actorUserId: user.id, role: user.role };
  }

  function visitInput(client, overrides = {}) {
    return { clientKind: 'EXISTING', clientId: client.id, ...overrides };
  }

  test.after(async () => {
    await prisma.$disconnect();
  });

  // ---- Relatorio SEMANAL ----

  test('createWeeklyReport: so ADMIN + COMMERCIAL criam; demais papeis 403', async () => {
    await resetDatabase();
    const now = new Date('2026-07-15T12:00:00Z');

    for (const role of ['ADMIN', 'COMMERCIAL']) {
      const user = await seedUser(role);
      const result = await service.createWeeklyReport(
        { summary: `Semana de ${role}` },
        actorFor(user),
        { now }
      );
      assert.equal(result.report.type, 'WEEKLY_REPORT');
      assert.equal(result.report.user.id, user.id);
    }

    for (const role of ['CLASSIFIER', 'REGISTRATION', 'CADASTRO', 'PROSPECTOR']) {
      const user = await seedUser(role);
      await assert.rejects(
        () => service.createWeeklyReport({ summary: 'x' }, actorFor(user), { now }),
        (err) => err.status === 403,
        `papel ${role} nao deveria criar semanal`
      );
    }
  });

  test('createWeeklyReport: UNIQUE 1 por usuario por semana => 409', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const now = new Date('2026-07-15T12:00:00Z');

    await service.createWeeklyReport({ summary: 'primeira' }, actorFor(commercial), { now });
    await assert.rejects(
      () =>
        service.createWeeklyReport({ summary: 'segunda na mesma semana' }, actorFor(commercial), {
          now,
        }),
      (err) => err.status === 409 && err.details?.code === 'WEEKLY_REPORT_ALREADY_EXISTS'
    );
  });

  test('cancelWeeklyReport: soft, so o proprio autor; alheio/ja-cancelada => 404', async () => {
    await resetDatabase();
    const author = await seedUser('COMMERCIAL');
    const other = await seedUser('ADMIN');
    const now = new Date('2026-07-15T12:00:00Z');
    const created = await service.createWeeklyReport({ summary: 'x' }, actorFor(author), { now });

    await assert.rejects(
      () => service.cancelWeeklyReport({ reportId: created.report.id }, actorFor(other)),
      (err) => err.status === 404
    );

    const cancelled = await service.cancelWeeklyReport(
      { reportId: created.report.id },
      actorFor(author)
    );
    assert.ok(cancelled.report.cancelledAt);
    const row = await prisma.weeklyReport.findUnique({ where: { id: created.report.id } });
    assert.ok(row); // soft: continua no banco
    assert.equal(row.cancelledByUserId, author.id);

    await assert.rejects(
      () => service.cancelWeeklyReport({ reportId: created.report.id }, actorFor(author)),
      (err) => err.status === 404
    );
  });

  // ---- Feed combinado (listInformeFeed, scope=all) ----

  test('listInformeFeed: visita + semanal de TODOS os autores', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const prospector = await seedUser('PROSPECTOR');
    const viewer = await seedUser('CADASTRO');
    const client = await seedClient();

    // Visita do prospector, visita do comercial, semanal do comercial.
    await service.createVisitReport(visitInput(client), actorFor(prospector));
    await service.createVisitReport(visitInput(client), actorFor(commercial));
    await service.createWeeklyReport({ summary: 'semana' }, actorFor(commercial), {
      now: new Date('2026-07-15T12:00:00Z'),
    });

    const feed = await service.listInformeFeed({}, actorFor(viewer));
    assert.equal(feed.page.total, 3);
    assert.equal(feed.items.length, 3);
    const types = feed.items.map((i) => i.type).sort();
    assert.deepEqual(types, ['VISIT_REPORT', 'VISIT_REPORT', 'WEEKLY_REPORT']);
  });

  test('listInformeFeed: PROSPECTOR nao e viewer => 403', async () => {
    await resetDatabase();
    const prospector = await seedUser('PROSPECTOR');
    await assert.rejects(
      () => service.listInformeFeed({}, actorFor(prospector)),
      (err) => err.status === 403
    );
  });

  test('listInformeFeed: pagina com hasNext', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');
    const client = await seedClient();
    for (let i = 0; i < 3; i += 1) {
      await service.createVisitReport(visitInput(client), actorFor(commercial));
    }
    const firstPage = await service.listInformeFeed({ page: 1, limit: 2 }, actorFor(commercial));
    assert.equal(firstPage.items.length, 2);
    assert.equal(firstPage.page.total, 3);
    assert.equal(firstPage.page.hasNext, true);
    const secondPage = await service.listInformeFeed({ page: 2, limit: 2 }, actorFor(commercial));
    assert.equal(secondPage.items.length, 1);
    assert.equal(secondPage.page.hasNext, false);
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
