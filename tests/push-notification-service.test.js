import test from 'node:test';
import assert from 'node:assert/strict';

import { PushNotificationService } from '../src/push/push-notification-service.js';

// Unidade do PushNotificationService (prisma + webPushClient fakes): o canal
// de entrega e a inscricao do aparelho. Nenhuma notificacao concreta e
// exercitada aqui — o catalogo esta vazio (ver docs/Notificacoes.md).

const ACTOR = { actorUserId: '00000000-0000-0000-0000-000000000001', role: 'COMMERCIAL' };

function buildFakePrisma({ subscriptions = [] } = {}) {
  const calls = { findMany: [], deleteMany: [], upsert: [], findUnique: [] };
  return {
    calls,
    pushSubscription: {
      async findMany(args) {
        calls.findMany.push(args);
        return subscriptions;
      },
      async deleteMany(args) {
        calls.deleteMany.push(args);
        return { count: 1 };
      },
      async upsert(args) {
        calls.upsert.push(args);
        return args.create;
      },
      async findUnique(args) {
        calls.findUnique.push(args);
        return null;
      },
    },
  };
}

function buildFakeWebPush({ failures = {} } = {}) {
  const sent = [];
  return {
    sent,
    async sendNotification(subscription, payload, options) {
      const failure = failures[subscription.endpoint];
      if (failure) {
        const error = new Error(`push failed ${failure}`);
        error.statusCode = failure;
        throw error;
      }
      sent.push({ subscription, payload: JSON.parse(payload), options });
      return { statusCode: 201 };
    },
  };
}

function buildService({ prisma, webPushClient }) {
  return new PushNotificationService({
    prisma,
    webPushClient,
    vapidPublicKey: 'pub',
    vapidPrivateKey: 'priv',
    vapidSubject: 'mailto:test@example.com',
  });
}

test('sendToRoles: payload JSON + TTL/urgency/topic repassados e textos truncados', async () => {
  const prisma = buildFakePrisma({
    subscriptions: [{ endpoint: 'https://push.example/a', p256dh: 'k', auth: 'a' }],
  });
  const webPushClient = buildFakeWebPush();
  const service = buildService({ prisma, webPushClient });

  const longTitle = 'T'.repeat(200);
  const result = await service.sendToRoles(
    ['ADMIN'],
    { title: longTitle, body: 'corpo', url: '/resumo', tag: 'visit-report' },
    { ttl: 3600, urgency: 'normal', topic: 'daily-x' }
  );

  assert.deepEqual(result, { sent: 1, failed: 0, pruned: 0 });
  const call = webPushClient.sent[0];
  assert.equal(call.options.TTL, 3600);
  assert.equal(call.options.urgency, 'normal');
  assert.equal(call.options.topic, 'daily-x');
  assert.equal(call.payload.url, '/resumo');
  assert.equal(call.payload.tag, 'visit-report');
  assert.ok(call.payload.title.length <= 80);
  assert.ok(call.payload.title.endsWith('…'));
});

test('sendToRoles: filtra por papel/status ativo e excludeUserId na query', async () => {
  const prisma = buildFakePrisma();
  const service = buildService({ prisma, webPushClient: buildFakeWebPush() });

  await service.sendToRoles(
    ['ADMIN', 'CLASSIFIER'],
    { title: 't', body: 'b' },
    { excludeUserId: 'user-x' }
  );

  const where = prisma.calls.findMany[0].where;
  assert.deepEqual(where.user.role, { in: ['ADMIN', 'CLASSIFIER'] });
  assert.equal(where.user.status, 'ACTIVE');
  assert.deepEqual(where.userId, { not: 'user-x' });
});

test('sendToRoles: poda 404/410, conta falha (sem poda) em 403', async () => {
  const prisma = buildFakePrisma({
    subscriptions: [
      { endpoint: 'https://push.example/ok', p256dh: 'k', auth: 'a' },
      { endpoint: 'https://push.example/dead-410', p256dh: 'k', auth: 'a' },
      { endpoint: 'https://push.example/dead-404', p256dh: 'k', auth: 'a' },
      { endpoint: 'https://push.example/vapid-403', p256dh: 'k', auth: 'a' },
    ],
  });
  const webPushClient = buildFakeWebPush({
    failures: {
      'https://push.example/dead-410': 410,
      'https://push.example/dead-404': 404,
      'https://push.example/vapid-403': 403,
    },
  });
  const service = buildService({ prisma, webPushClient });

  const result = await service.sendToRoles(['ADMIN'], { title: 't', body: 'b' });

  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.pruned, 2);
  const pruneWhere = prisma.calls.deleteMany[0].where;
  assert.deepEqual(pruneWhere.endpoint.in.sort(), [
    'https://push.example/dead-404',
    'https://push.example/dead-410',
  ]);
});

test('saveSubscription: valida endpoint https e chaves base64url', async () => {
  const prisma = buildFakePrisma();
  const service = buildService({ prisma, webPushClient: buildFakeWebPush() });

  await assert.rejects(
    service.saveSubscription(
      { endpoint: 'http://inseguro.example', keys: { p256dh: 'k', auth: 'a' } },
      ACTOR
    ),
    (error) => error.status === 422 && error.details?.field === 'endpoint'
  );

  await assert.rejects(
    service.saveSubscription(
      { endpoint: 'https://push.example/x', keys: { p256dh: 'tem espaco!', auth: 'a' } },
      ACTOR
    ),
    (error) => error.status === 422 && error.details?.field === 'keys.p256dh'
  );

  const ok = await service.saveSubscription(
    { endpoint: 'https://push.example/x', keys: { p256dh: 'AbC_-123', auth: 'xYz=' } },
    ACTOR
  );
  assert.equal(ok.subscription.endpoint, 'https://push.example/x');
  assert.equal(prisma.calls.upsert[0].update.userId, ACTOR.actorUserId);
});

test('removeSubscription: delete escopado ao ator', async () => {
  const prisma = buildFakePrisma();
  const service = buildService({ prisma, webPushClient: buildFakeWebPush() });

  await service.removeSubscription({ endpoint: 'https://push.example/x' }, ACTOR);

  assert.deepEqual(prisma.calls.deleteMany[0].where, {
    endpoint: 'https://push.example/x',
    userId: ACTOR.actorUserId,
  });
});

// Mecanismo da personalizacao: buildMessage(user) roda por inscricao. As
// fixtures sao genericas de proposito — nenhuma notificacao real existe.
test('sendPersonalizedToRoles: mensagem montada por usuario', async () => {
  const prisma = buildFakePrisma({
    subscriptions: [
      {
        endpoint: 'https://push.example/p1',
        p256dh: 'k',
        auth: 'a',
        user: { id: 'u1', fullName: 'Maria Souza Lima', username: 'maria' },
      },
      {
        endpoint: 'https://push.example/p2',
        p256dh: 'k',
        auth: 'a',
        user: { id: 'u2', fullName: 'Pedro Alves', username: 'pedro' },
      },
    ],
  });
  const webPushClient = buildFakeWebPush();
  const service = buildService({ prisma, webPushClient });

  const result = await service.sendPersonalizedToRoles(
    ['PROSPECTOR'],
    (user) => ({
      title: `Olá ${user.fullName.split(' ')[0]}!`,
      body: 'Corpo de teste.',
      url: '/dashboard',
      tag: 'test-personalized',
    }),
    { ttl: 21600, urgency: 'normal', topic: 'test-personalized' }
  );

  assert.deepEqual(result, { sent: 2, failed: 0, pruned: 0 });
  const titles = webPushClient.sent.map((s) => s.payload.title).sort();
  assert.deepEqual(titles, ['Olá Maria!', 'Olá Pedro!']);
  assert.equal(webPushClient.sent[0].options.topic, 'test-personalized');
  assert.deepEqual(prisma.calls.findMany[0].where.user.role, { in: ['PROSPECTOR'] });
});
