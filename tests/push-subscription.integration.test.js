import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';
import { LocalAuthService } from '../src/auth/local-auth-service.js';
import { PushNotificationService } from '../src/push/push-notification-service.js';
import { VisitReportService } from '../src/visits/visit-report-service.js';

// Web Push — rotas de inscricao (CRUD + 501), envio por papel contra o DB
// real (com webPushClient fake) e o gatilho do informe de visita.

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('push-subscription integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();

  const ACTOR_A_ID = '00000000-0000-0000-0000-000000000801';
  const ACTOR_B_ID = '00000000-0000-0000-0000-000000000802';

  let fakeWebPush;
  let pushService;
  let api;
  let apiWithoutPush;
  let headersA;
  let headersB;

  function buildFakeWebPush() {
    const sent = [];
    const failures = {};
    return {
      sent,
      failures,
      async sendNotification(subscription, payload, options) {
        const failure = failures[subscription.endpoint];
        if (failure) {
          const error = new Error(`push failed ${failure}`);
          error.statusCode = failure;
          throw error;
        }
        sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload), options });
        return { statusCode: 201 };
      },
    };
  }

  test.before(() => {
    const authService = new LocalAuthService({
      secret: 'super-secret-for-push-subscription-tests',
      allowPlaintextPasswords: true,
      users: [
        {
          id: ACTOR_A_ID,
          username: 'push-admin',
          password: 'push123',
          role: 'ADMIN',
          displayName: 'Push Admin',
        },
        {
          id: ACTOR_B_ID,
          username: 'push-commercial',
          password: 'push123',
          role: 'COMMERCIAL',
          displayName: 'Push Comercial',
        },
      ],
    });

    headersA = {
      authorization: `Bearer ${authService.login({ username: 'push-admin', password: 'push123' }).accessToken}`,
      'x-source': 'web',
    };
    headersB = {
      authorization: `Bearer ${authService.login({ username: 'push-commercial', password: 'push123' }).accessToken}`,
      'x-source': 'web',
    };

    fakeWebPush = buildFakeWebPush();
    pushService = new PushNotificationService({
      prisma,
      webPushClient: fakeWebPush,
      vapidPublicKey: 'test-public-key',
      vapidPrivateKey: 'test-private-key',
      vapidSubject: 'mailto:test@example.com',
    });

    api = createBackendApiV1({
      authService,
      pushService,
      visitReportService: new VisitReportService({ prisma, pushService }),
      commandService: {},
      queryService: {},
    });

    apiWithoutPush = createBackendApiV1({
      authService,
      commandService: {},
      queryService: {},
    });
  });

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE push_subscription, visit_report, client_audit_event, client_commercial_user, client_unit, client, user_session, app_user RESTART IDENTITY CASCADE'
    );
    fakeWebPush.sent.length = 0;
    for (const key of Object.keys(fakeWebPush.failures)) {
      delete fakeWebPush.failures[key];
    }
  }

  async function seedUser(id, role, suffix) {
    return prisma.user.create({
      data: {
        id,
        fullName: `Usuario ${suffix}`,
        username: `push-${suffix}`,
        usernameCanonical: `push-${suffix}`,
        email: `push-${suffix}@example.com`,
        emailCanonical: `push-${suffix}@example.com`,
        passwordHash: 'x',
        role,
      },
    });
  }

  function subscriptionBody(endpointSuffix) {
    return {
      endpoint: `https://push.example/sub-${endpointSuffix}`,
      keys: { p256dh: 'AbC_-123', auth: 'xYz123' },
      userAgent: 'node-test',
    };
  }

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('rotas de push respondem 501 quando o service nao esta configurado', async () => {
    await resetDatabase();
    await seedUser(ACTOR_A_ID, 'ADMIN', 'a501');

    const config = await apiWithoutPush.getPushConfig({
      headers: headersA,
      params: {},
      query: {},
      body: {},
    });
    assert.equal(config.status, 501);

    const save = await apiWithoutPush.savePushSubscription({
      headers: headersA,
      params: {},
      query: {},
      body: subscriptionBody('x'),
    });
    assert.equal(save.status, 501);
  });

  test('savePushSubscription cria e re-inscricao do mesmo endpoint troca o dono', async () => {
    await resetDatabase();
    await seedUser(ACTOR_A_ID, 'ADMIN', 'a1');
    await seedUser(ACTOR_B_ID, 'COMMERCIAL', 'b1');
    const body = subscriptionBody('owner-swap');

    const first = await api.savePushSubscription({
      headers: headersA,
      params: {},
      query: {},
      body,
    });
    assert.equal(first.status, 201);

    let row = await prisma.pushSubscription.findUnique({ where: { endpoint: body.endpoint } });
    assert.equal(row.userId, ACTOR_A_ID);

    // Outro usuario ativa no MESMO aparelho: upsert troca o dono, sem duplicar.
    const second = await api.savePushSubscription({
      headers: headersB,
      params: {},
      query: {},
      body,
    });
    assert.equal(second.status, 201);

    row = await prisma.pushSubscription.findUnique({ where: { endpoint: body.endpoint } });
    assert.equal(row.userId, ACTOR_B_ID);
    assert.equal(await prisma.pushSubscription.count(), 1);
  });

  test('getPushConfig informa subscribed por ator; delete e escopado ao dono', async () => {
    await resetDatabase();
    await seedUser(ACTOR_A_ID, 'ADMIN', 'a2');
    await seedUser(ACTOR_B_ID, 'COMMERCIAL', 'b2');
    const body = subscriptionBody('scoped');
    await api.savePushSubscription({ headers: headersA, params: {}, query: {}, body });

    const configOwner = await api.getPushConfig({
      headers: headersA,
      params: {},
      query: { endpoint: body.endpoint },
      body: {},
    });
    assert.equal(configOwner.status, 200);
    assert.equal(configOwner.body.publicKey, 'test-public-key');
    assert.equal(configOwner.body.subscribed, true);

    // Pra outro usuario o mesmo endpoint NAO conta como inscrito.
    const configOther = await api.getPushConfig({
      headers: headersB,
      params: {},
      query: { endpoint: body.endpoint },
      body: {},
    });
    assert.equal(configOther.body.subscribed, false);

    // Delete de quem nao e dono: removed=false e a row continua.
    const deleteOther = await api.deletePushSubscription({
      headers: headersB,
      params: {},
      query: {},
      body: { endpoint: body.endpoint },
    });
    assert.equal(deleteOther.status, 200);
    assert.equal(deleteOther.body.removed, false);
    assert.equal(await prisma.pushSubscription.count(), 1);

    // Delete do dono remove.
    const deleteOwner = await api.deletePushSubscription({
      headers: headersA,
      params: {},
      query: {},
      body: { endpoint: body.endpoint },
    });
    assert.equal(deleteOwner.body.removed, true);
    assert.equal(await prisma.pushSubscription.count(), 0);
  });

  test('sendToRoles contra o DB real: alvo por papel ATIVO, excludeUserId e prune 410', async () => {
    await resetDatabase();
    const adminA = await seedUser(ACTOR_A_ID, 'ADMIN', 'a3');
    const adminInactive = await seedUser(randomUUID(), 'ADMIN', 'inactive');
    await prisma.user.update({ where: { id: adminInactive.id }, data: { status: 'INACTIVE' } });
    const commercial = await seedUser(ACTOR_B_ID, 'COMMERCIAL', 'b3');
    const adminC = await seedUser(randomUUID(), 'ADMIN', 'c3');

    async function seedSubscription(userId, suffix) {
      await prisma.pushSubscription.create({
        data: {
          id: randomUUID(),
          userId,
          endpoint: `https://push.example/dev-${suffix}`,
          p256dh: 'k',
          auth: 'a',
        },
      });
    }

    await seedSubscription(adminA.id, 'admin-a');
    await seedSubscription(adminInactive.id, 'admin-inactive');
    await seedSubscription(commercial.id, 'commercial');
    await seedSubscription(adminC.id, 'admin-c');
    fakeWebPush.failures['https://push.example/dev-admin-c'] = 410;

    const result = await pushService.sendToRoles(
      ['ADMIN'],
      { title: 'Teste', body: 'corpo', url: '/resumo', tag: 't' },
      { excludeUserId: null }
    );

    // admin-a entregue; admin-c 410 (podado); inativo e comercial fora.
    assert.equal(result.sent, 1);
    assert.equal(result.pruned, 1);
    assert.equal(result.failed, 0);
    assert.deepEqual(
      fakeWebPush.sent.map((s) => s.endpoint),
      ['https://push.example/dev-admin-a']
    );
    const remaining = await prisma.pushSubscription.findMany({ select: { endpoint: true } });
    assert.equal(
      remaining.some((r) => r.endpoint === 'https://push.example/dev-admin-c'),
      false
    );
  });

  test('gatilho de visita: situacoes (promissora, cliente novo, sem match) com autor excluido', async () => {
    await resetDatabase();
    const admin = await seedUser(ACTOR_A_ID, 'ADMIN', 'a4');
    const author = await seedUser(ACTOR_B_ID, 'COMMERCIAL', 'b4');
    const cadastro = await seedUser(randomUUID(), 'CADASTRO', 'cad4');
    const existingClient = await prisma.client.create({
      data: {
        id: randomUUID(),
        personType: 'PF',
        fullName: 'Produtor Existente',
        status: 'ACTIVE',
        isSeller: true,
      },
    });

    async function seedSubscription(userId, suffix) {
      await prisma.pushSubscription.create({
        data: {
          id: randomUUID(),
          userId,
          endpoint: `https://push.example/trig-${suffix}`,
          p256dh: 'k',
          auth: 'a',
        },
      });
    }

    await seedSubscription(admin.id, 'admin');
    await seedSubscription(cadastro.id, 'cadastro');
    // Aparelho do proprio autor (COMMERCIAL): NAO recebe a promissora dele.
    await seedSubscription(author.id, 'author');

    async function sendVisit(overrides) {
      const created = await api.createVisitReport({
        headers: headersB,
        params: {},
        query: {},
        body: {
          clientKind: 'NEW',
          newClientName: 'Fazenda Push',
          farmSize: 'SMALL',
          interestLevel: 'HIGH',
          sellsCurrently: false,
          ...overrides,
        },
      });
      assert.equal(created.status, 201);
    }

    // Situacao 2 isolada: cliente novo + tamanho pequeno -> so "Novo cliente
    // encontrado!" pra ADMIN + CADASTRO.
    await sendVisit({});
    assert.deepEqual(fakeWebPush.sent.map((s) => s.payload.title).sort(), [
      'Novo cliente encontrado!',
      'Novo cliente encontrado!',
    ]);
    assert.deepEqual(fakeWebPush.sent.map((s) => s.endpoint).sort(), [
      'https://push.example/trig-admin',
      'https://push.example/trig-cadastro',
    ]);
    assert.equal(fakeWebPush.sent[0].payload.url, '/resumo');
    fakeWebPush.sent.length = 0;

    // Situacao 1 isolada: cliente EXISTENTE + Medio + Alto -> so a
    // promissora, pra ADMIN + COMMERCIAL com o autor (COMMERCIAL) excluido.
    await sendVisit({
      clientKind: 'EXISTING',
      clientId: existingClient.id,
      newClientName: null,
      farmSize: 'MEDIUM',
    });
    assert.equal(fakeWebPush.sent.length, 1);
    assert.equal(fakeWebPush.sent[0].endpoint, 'https://push.example/trig-admin');
    assert.equal(fakeWebPush.sent[0].payload.title, 'Nova visita promissora enviada');
    assert.ok(fakeWebPush.sent[0].payload.body.includes('cliente promissor'));
    fakeWebPush.sent.length = 0;

    // Interesse Alto com tamanho PEQUENO (so uma das condicoes): nao e
    // promissora — cliente existente sem match nenhum = silencio.
    await sendVisit({
      clientKind: 'EXISTING',
      clientId: existingClient.id,
      newClientName: null,
      farmSize: 'SMALL',
      interestLevel: 'HIGH',
    });
    assert.equal(fakeWebPush.sent.length, 0);

    // Sem match total: existente + pequeno + interesse baixo -> silencio.
    await sendVisit({
      clientKind: 'EXISTING',
      clientId: existingClient.id,
      newClientName: null,
      interestLevel: 'LOW',
    });
    assert.equal(fakeWebPush.sent.length, 0);

    // As duas situacoes juntas: cliente NOVO + Grande + Alto -> promissora
    // (ADMIN+COMMERCIAL, autor fora) E novo cliente (ADMIN+CADASTRO).
    await sendVisit({ farmSize: 'LARGE' });
    const titles = fakeWebPush.sent.map((s) => s.payload.title).sort();
    assert.deepEqual(titles, [
      'Nova visita promissora enviada',
      'Novo cliente encontrado!',
      'Novo cliente encontrado!',
    ]);
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
