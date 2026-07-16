import test from 'node:test';
import assert from 'node:assert/strict';

import { UserService } from '../src/users/user-service.js';

// CAM-B4: o limit do lookupUsersForReference chega como STRING via query
// params das rotas HTTP. Number.isFinite sem coercao rejeitava "300" e o
// pedido caia silenciosamente no default 200 (cap silencioso). Estes testes
// fixam o contrato: string numerica vale, cap 500, minimo 1, e
// lixo/vazio/ausente caem no default 200.

const actor = { actorUserId: 'u1', role: 'ADMIN', requestId: 'r1' };

function serviceCapturingTake() {
  const captured = {};
  const prisma = {
    user: {
      findMany: async (args) => {
        captured.take = args.take;
        return [];
      },
    },
  };
  return { svc: new UserService({ prisma, emailService: {} }), captured };
}

test('lookupUsersForReference: limit "300" (string de query) vale 300', async () => {
  const { svc, captured } = serviceCapturingTake();
  await svc.lookupUsersForReference({ limit: '300' }, actor);
  assert.equal(captured.take, 300);
});

test('lookupUsersForReference: limit numerico segue valendo', async () => {
  const { svc, captured } = serviceCapturingTake();
  await svc.lookupUsersForReference({ limit: 42 }, actor);
  assert.equal(captured.take, 42);
});

test('lookupUsersForReference: cap maximo em 500', async () => {
  const { svc, captured } = serviceCapturingTake();
  await svc.lookupUsersForReference({ limit: '1000' }, actor);
  assert.equal(captured.take, 500);
});

test('lookupUsersForReference: minimo 1', async () => {
  const { svc, captured } = serviceCapturingTake();
  await svc.lookupUsersForReference({ limit: '0' }, actor);
  assert.equal(captured.take, 1);
});

test('lookupUsersForReference: lixo, vazio e ausente caem no default 200', async () => {
  for (const limit of ['banana', '', '   ', undefined, null]) {
    const { svc, captured } = serviceCapturingTake();
    await svc.lookupUsersForReference({ limit }, actor);
    assert.equal(captured.take, 200, `limit=${JSON.stringify(limit)}`);
  }
});
