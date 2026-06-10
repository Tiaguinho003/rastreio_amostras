import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { VisitReportService } from '../src/visits/visit-report-service.js';

// Informe de visita — service de criacao (qualquer papel autenticado, com
// userId/createdAt carimbados no servidor) e listagem admin-only paginada.

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('visit-report integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const service = new VisitReportService({ prisma });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE visit_report, client_audit_event, client_commercial_user, client_unit, client, user_session, app_user RESTART IDENTITY CASCADE'
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

  test('listVisitReports: admin-only (403 para nao-admin)', async () => {
    await resetDatabase();
    const commercial = await seedUser('COMMERCIAL');

    await assert.rejects(
      service.listVisitReports({}, actorFor(commercial)),
      (error) => error.status === 403
    );
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
