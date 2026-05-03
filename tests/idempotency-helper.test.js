import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_KEY_MAX_LEN,
  buildScopeKey,
  readIdempotencyKey,
  withIdempotency,
} from '../src/api/v1/idempotency-helper.js';

// Unit tests do withIdempotency com store mockado. Sem dependencia de
// Prisma/DB. Cobre logica de cache hit, miss, e B3 (race com replay flag).

function createMockStore({ getResult = null, putResult = null, putThrows = null } = {}) {
  const calls = { get: [], put: [] };
  return {
    calls,
    async get(scope, key) {
      calls.get.push({ scope, key });
      return getResult;
    },
    async put(scope, key, statusCode, responseBody, ttlMs) {
      calls.put.push({ scope, key, statusCode, responseBody, ttlMs });
      if (putThrows) throw putThrows;
      return putResult;
    },
  };
}

test('readIdempotencyKey — header lowercase', () => {
  assert.equal(readIdempotencyKey({ [IDEMPOTENCY_HEADER]: 'abc-123' }), 'abc-123');
});

test('readIdempotencyKey — header capitalized (defensivo)', () => {
  assert.equal(readIdempotencyKey({ 'Idempotency-Key': 'XYZ' }), 'XYZ');
});

test('readIdempotencyKey — header ausente retorna null', () => {
  assert.equal(readIdempotencyKey({}), null);
  assert.equal(readIdempotencyKey(null), null);
  assert.equal(readIdempotencyKey(undefined), null);
});

test('readIdempotencyKey — string vazia ou maior que limite retorna null', () => {
  assert.equal(readIdempotencyKey({ [IDEMPOTENCY_HEADER]: '' }), null);
  assert.equal(readIdempotencyKey({ [IDEMPOTENCY_HEADER]: '   ' }), null);
  const tooLong = 'a'.repeat(IDEMPOTENCY_KEY_MAX_LEN + 1);
  assert.equal(readIdempotencyKey({ [IDEMPOTENCY_HEADER]: tooLong }), null);
});

test('readIdempotencyKey — non-string retorna null', () => {
  assert.equal(readIdempotencyKey({ [IDEMPOTENCY_HEADER]: 12345 }), null);
  assert.equal(readIdempotencyKey({ [IDEMPOTENCY_HEADER]: ['array'] }), null);
});

test('buildScopeKey concatena rota + actorUserId', () => {
  assert.equal(buildScopeKey('POST /clients', 'user-id-1'), 'POST /clients:user-user-id-1');
});

test('buildScopeKey usa "anon" quando actorUserId ausente', () => {
  assert.equal(buildScopeKey('POST /x', null), 'POST /x:user-anon');
  assert.equal(buildScopeKey('POST /x', undefined), 'POST /x:user-anon');
});

test('withIdempotency — sem header executa handler direto sem cache (C1)', async () => {
  const store = createMockStore();
  let handlerCalls = 0;
  const result = await withIdempotency({
    store,
    scope: 'POST /clients:user-1',
    headers: {},
    handler: async () => {
      handlerCalls += 1;
      return { status: 201, body: { id: 'X' } };
    },
  });
  assert.equal(handlerCalls, 1);
  assert.deepEqual(result, { status: 201, body: { id: 'X' } });
  assert.equal(store.calls.get.length, 0);
  assert.equal(store.calls.put.length, 0);
});

test('withIdempotency — cache hit retorna cached sem chamar handler', async () => {
  const store = createMockStore({
    getResult: {
      statusCode: 201,
      responseBody: { id: 'cached-X' },
    },
  });
  let handlerCalls = 0;
  const result = await withIdempotency({
    store,
    scope: 'POST /clients:user-1',
    headers: { [IDEMPOTENCY_HEADER]: 'key-1' },
    handler: async () => {
      handlerCalls += 1;
      return { status: 201, body: { id: 'X' } };
    },
  });
  assert.equal(handlerCalls, 0, 'handler nao deve ser chamado em cache hit');
  assert.deepEqual(result, {
    status: 201,
    body: { id: 'cached-X' },
    idempotent: true,
  });
});

test('withIdempotency — cache miss + put success retorna result do handler', async () => {
  const store = createMockStore({
    getResult: null,
    putResult: { statusCode: 201, responseBody: { id: 'X' }, replay: false },
  });
  const result = await withIdempotency({
    store,
    scope: 'POST /clients:user-1',
    headers: { [IDEMPOTENCY_HEADER]: 'key-1' },
    handler: async () => ({ status: 201, body: { id: 'X' } }),
  });
  assert.deepEqual(result, { status: 201, body: { id: 'X' } });
  assert.equal(store.calls.put.length, 1);
});

test('B3: cache miss + put replay (race condition) retorna stored em vez de result', async () => {
  // Simulando: outro request gravou primeiro com body diferente.
  // Sob B3 fix, store.put retorna { ..., replay: true } quando bate
  // P2002 e faz fallback de leitura. withIdempotency DEVE retornar o
  // stored (cached), nao o result do handler.
  const store = createMockStore({
    getResult: null,
    putResult: {
      statusCode: 201,
      responseBody: { id: 'WINNER' }, // body do request que ganhou a race
      replay: true,
    },
  });
  const result = await withIdempotency({
    store,
    scope: 'POST /clients:user-1',
    headers: { [IDEMPOTENCY_HEADER]: 'race-key' },
    handler: async () => ({ status: 201, body: { id: 'LOSER' } }),
  });
  // Antes do B3 fix, retornaria { id: 'LOSER' } porque statusCode coincidia
  // (ambos 201). Sob B3 fix, retorna o stored (WINNER) baseado em
  // `stored.replay === true`.
  assert.deepEqual(result, {
    status: 201,
    body: { id: 'WINNER' },
    idempotent: true,
  });
});

test('B3: cache miss + put replay com status diferente tambem retorna stored', async () => {
  // Caso onde o status diverge: vencedor da race retornou 422, segundo
  // retornaria 201. replay flag cobre tambem esse caso (compatibilidade
  // com comportamento pre-B3).
  const store = createMockStore({
    getResult: null,
    putResult: {
      statusCode: 422,
      responseBody: { error: { message: 'Validation' } },
      replay: true,
    },
  });
  const result = await withIdempotency({
    store,
    scope: 'POST /clients:user-1',
    headers: { [IDEMPOTENCY_HEADER]: 'race-key-2' },
    handler: async () => ({ status: 201, body: { id: 'L' } }),
  });
  assert.equal(result.status, 422);
  assert.equal(result.idempotent, true);
});

test('withIdempotency — handler que lanca erro tem resposta cacheada (B1)', async () => {
  const { HttpError } = await import('../src/contracts/errors.js');
  const store = createMockStore({
    getResult: null,
    putResult: { statusCode: 422, responseBody: {}, replay: false },
  });
  const result = await withIdempotency({
    store,
    scope: 'POST /clients:user-1',
    headers: { [IDEMPOTENCY_HEADER]: 'err-key' },
    handler: async () => {
      throw new HttpError(422, 'Validation failed', { code: 'X' });
    },
  });
  // toHttpErrorResponse converteu o throw para { status: 422, body: { error: { ... } } }
  assert.equal(result.status, 422);
  assert.ok(result.body, 'body presente apos catch');
  assert.equal(store.calls.put.length, 1, 'erro foi cacheado');
});

test('withIdempotency — sem store (defensivo) executa handler direto', async () => {
  let handlerCalls = 0;
  const result = await withIdempotency({
    store: null,
    scope: 'POST /x',
    headers: { [IDEMPOTENCY_HEADER]: 'key' },
    handler: async () => {
      handlerCalls += 1;
      return { status: 200, body: {} };
    },
  });
  assert.equal(handlerCalls, 1);
  assert.deepEqual(result, { status: 200, body: {} });
});

test('B4: handler retornando body undefined cacheia objeto vazio (nao null)', async () => {
  // Evita PrismaClientValidationError ao tentar gravar null em
  // responseBody NOT NULL.
  const store = createMockStore({
    getResult: null,
    putResult: { statusCode: 204, responseBody: {}, replay: false },
  });
  await withIdempotency({
    store,
    scope: 'POST /x:user-1',
    headers: { [IDEMPOTENCY_HEADER]: 'k' },
    handler: async () => ({ status: 204, body: undefined }),
  });
  // Confirma que `body` passado pro put e {} (nao null).
  assert.equal(store.calls.put.length, 1);
  assert.deepEqual(store.calls.put[0].responseBody, {});
});
