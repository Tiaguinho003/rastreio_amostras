import test from 'node:test';
import assert from 'node:assert/strict';

import { PushNotificationService } from '../src/push/push-notification-service.js';
import { SampleCommandService } from '../src/samples/sample-command-service.js';

// Unidade do PushNotificationService (prisma + webPushClient fakes) e do
// guard de replay do hook de movimentacao.

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

// Guard de replay do hook de movimentacao: idempotent=true (replay) NAO
// notifica; resultado novo notifica com payload do evento (raiz da cascata).
test('_notifyMovementCreated: notifica so resultado novo, nunca replay', async () => {
  const notifications = [];
  const fakePush = {
    async sendToRoles(roles, message, options) {
      notifications.push({ roles, message, options });
      return { sent: 1, failed: 0, pruned: 0 };
    },
  };
  const commandService = new SampleCommandService({
    eventService: {},
    queryService: {},
    pushService: fakePush,
  });

  const sample = { id: 'sample-1', internalLotNumber: '5641' };
  const freshResult = {
    statusCode: 201,
    idempotent: false,
    event: {
      eventId: 'evt-1',
      payload: {
        movementId: 'mov-1',
        movementType: 'SALE',
        quantitySacks: 25,
        buyerClientSnapshot: { displayName: 'Atlantica' },
      },
    },
  };

  await commandService._notifyMovementCreated(freshResult, sample, ACTOR);
  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0].roles, ['ADMIN']);
  assert.equal(notifications[0].message.title, 'Venda registrada');
  assert.equal(notifications[0].message.body, '25 sacas do lote 5641 — Atlantica.');
  assert.equal(notifications[0].message.url, '/samples/sample-1');
  assert.equal(notifications[0].options.excludeUserId, ACTOR.actorUserId);

  // Replay idempotente: nada novo.
  await commandService._notifyMovementCreated({ ...freshResult, idempotent: true }, sample, ACTOR);
  assert.equal(notifications.length, 1);

  // LOSS sem comprador.
  await commandService._notifyMovementCreated(
    {
      statusCode: 201,
      idempotent: false,
      event: {
        eventId: 'evt-2',
        payload: { movementId: 'mov-2', movementType: 'LOSS', quantitySacks: 3 },
      },
    },
    sample,
    ACTOR
  );
  assert.equal(notifications.length, 2);
  assert.equal(notifications[1].message.title, 'Perda registrada');
  assert.equal(notifications[1].message.body, '3 sacas do lote 5641.');
});

test('_notifyMovementCreated: falha do push nao propaga (fire-and-forget)', async () => {
  const fakePush = {
    async sendToRoles() {
      throw new Error('push service down');
    },
  };
  const commandService = new SampleCommandService({
    eventService: {},
    queryService: {},
    pushService: fakePush,
  });

  await assert.doesNotReject(
    commandService._notifyMovementCreated(
      {
        idempotent: false,
        event: { payload: { movementId: 'm', movementType: 'SALE', quantitySacks: 1 } },
      },
      { id: 's', internalLotNumber: '1' },
      ACTOR
    )
  );
});
