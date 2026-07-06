import test from 'node:test';
import assert from 'node:assert/strict';

import { createBackendApiV1 } from '../src/api/v1/backend-api.js';

// Wiring do rate limiter HTTP das 3 rotas publicas de esqueci-a-senha
// (Revisao Geral F1/LOG, LOG-D4): por IP, bucket COMPARTILHADO entre
// request/verify/reset, defaults 10 req/60s (mesmos do login). O limiter e
// module-scoped: cada teste usa um IP proprio pra nao interferir nos demais.

function createApi() {
  const userService = {
    async requestPasswordReset() {
      return { resetRequest: { requestId: 'fake', expiresAt: null, resendAvailableAt: null } };
    },
    async verifyPasswordResetCode() {
      return { verification: { verified: true } };
    },
    async resetPasswordWithCode() {
      return { sessionRevoked: true };
    },
  };

  return createBackendApiV1({
    commandService: {},
    queryService: {},
    reportService: null,
    userService,
  });
}

function inputFromIp(ip, body = {}) {
  return {
    headers: { 'x-forwarded-for': ip },
    params: {},
    query: {},
    body: { email: 'x@test.local', code: '123456', password: 'SenhaNova1', ...body },
  };
}

test('11a chamada do mesmo IP responde 429 (default 10/60s)', async () => {
  const api = createApi();
  const ip = 'ip-limite-a';

  for (let i = 0; i < 10; i += 1) {
    const result = await api.requestPasswordReset(inputFromIp(ip));
    assert.equal(result.status, 200, `chamada ${i + 1} devia passar`);
  }

  const blocked = await api.requestPasswordReset(inputFromIp(ip));
  assert.equal(blocked.status, 429);
});

test('bucket e compartilhado entre request, verify-code e reset', async () => {
  const api = createApi();
  const ip = 'ip-limite-b';

  for (let i = 0; i < 4; i += 1) {
    assert.equal((await api.requestPasswordReset(inputFromIp(ip))).status, 200);
  }
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await api.verifyPasswordResetCode(inputFromIp(ip))).status, 200);
  }
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await api.resetPasswordWithCode(inputFromIp(ip))).status, 200);
  }

  // 10 chamadas consumidas no total: a 11a bloqueia em QUALQUER das 3 rotas.
  const blocked = await api.verifyPasswordResetCode(inputFromIp(ip));
  assert.equal(blocked.status, 429);
});

test('IP diferente nao e afetado pelo bucket de outro IP', async () => {
  const api = createApi();
  const exhausted = 'ip-limite-c';
  for (let i = 0; i < 11; i += 1) {
    await api.requestPasswordReset(inputFromIp(exhausted));
  }

  const other = await api.requestPasswordReset(inputFromIp('ip-limite-d'));
  assert.equal(other.status, 200);
});
