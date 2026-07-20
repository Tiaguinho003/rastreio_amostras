import test from 'node:test';
import assert from 'node:assert/strict';

import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { HttpError } from '../src/contracts/errors.js';

function buildService(users) {
  const usersMap = new Map(users.map((user) => [user.id, user]));
  const userService = {
    async findUsersForSnapshotByIds(ids) {
      const result = new Map();
      for (const id of ids) {
        const user = usersMap.get(id);
        if (user) result.set(id, user);
      }
      return result;
    },
  };
  return new SampleCommandService({
    eventService: null,
    queryService: null,
    userService,
  });
}

const UID_A = '11111111-1111-4111-8111-111111111111';
const UID_B = '22222222-2222-4222-8222-222222222222';
const UID_C = '33333333-3333-4333-8333-333333333333';
const UID_ACTOR = '99999999-9999-4999-8999-999999999999';
// Nao usar 4444... — o teste de CLASSIFIER_NOT_FOUND usa esse uuid literal
// como usuario inexistente.
const UID_PROSPECTOR = '55555555-5555-4555-8555-555555555555';

const users = [
  { id: UID_A, fullName: 'Alice Silva', username: 'alice', status: 'ACTIVE', role: 'CLASSIFIER' },
  { id: UID_B, fullName: 'Bruno Souza', username: 'bruno', status: 'ACTIVE', role: 'ADMIN' },
  {
    id: UID_C,
    fullName: 'Carla Inativa',
    username: 'carla',
    status: 'INACTIVE',
    role: 'CLASSIFIER',
  },
  { id: UID_ACTOR, fullName: 'Actor User', username: 'actor', status: 'ACTIVE', role: 'ADMIN' },
  {
    id: UID_PROSPECTOR,
    fullName: 'Aroldo Campo',
    username: 'aroldo',
    status: 'ACTIVE',
    role: 'PROSPECTOR',
  },
];

test('normalizeClassifiers rejects null (classifiers e obrigatorio)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeClassifiers(null),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'CLASSIFIERS_REQUIRED'
  );
});

test('normalizeClassifiers rejects undefined (classifiers e obrigatorio)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeClassifiers(undefined),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'CLASSIFIERS_REQUIRED'
  );
});

test('normalizeClassifiers rejects empty array (classifiers e obrigatorio)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeClassifiers([]),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'CLASSIFIERS_REQUIRED'
  );
});

test('normalizeClassifiers builds snapshots from valid userIds', async () => {
  const svc = buildService(users);
  const result = await svc.normalizeClassifiers([{ userId: UID_A }, { userId: UID_B }]);
  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], {
    id: UID_A,
    fullName: 'Alice Silva',
    username: 'alice',
  });
  assert.deepEqual(result[1], {
    id: UID_B,
    fullName: 'Bruno Souza',
    username: 'bruno',
  });
});

test('normalizeClassifiers dedupes duplicate userIds silently', async () => {
  const svc = buildService(users);
  const result = await svc.normalizeClassifiers([
    { userId: UID_A },
    { userId: UID_A },
    { userId: UID_B },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, UID_A);
  assert.equal(result[1].id, UID_B);
});

test('normalizeClassifiers allows actor in list (no self-exclusion)', async () => {
  const svc = buildService(users);
  const result = await svc.normalizeClassifiers([{ userId: UID_ACTOR }, { userId: UID_A }]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, UID_ACTOR);
  assert.equal(result[1].id, UID_A);
});

test('normalizeClassifiers rejects unknown user (422 CLASSIFIER_NOT_FOUND)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeClassifiers([{ userId: '44444444-4444-4444-8444-444444444444' }]),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'CLASSIFIER_NOT_FOUND'
  );
});

test('normalizeClassifiers rejects inactive user (422 INACTIVE_CLASSIFIER)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeClassifiers([{ userId: UID_C }]),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'INACTIVE_CLASSIFIER'
  );
});

test('normalizeClassifiers rejects PROSPECTOR (422 PROSPECTOR_NOT_ASSIGNABLE)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeClassifiers([{ userId: UID_PROSPECTOR }]),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'PROSPECTOR_NOT_ASSIGNABLE' &&
      error.details?.userId === UID_PROSPECTOR
  );
});

test('normalizeClassifiers rejects a PROSPECTOR mixed with valid classifiers', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeClassifiers([{ userId: UID_A }, { userId: UID_PROSPECTOR }]),
    (error) => error.status === 422 && error.details?.code === 'PROSPECTOR_NOT_ASSIGNABLE'
  );
});

test('normalizeClassifiers rejects non-array input (422 CLASSIFIERS_INVALID_SHAPE)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeClassifiers('oops'),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'CLASSIFIERS_INVALID_SHAPE'
  );
});

test('normalizeClassifiers rejects items without userId (422)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeClassifiers([{ id: UID_A }]),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'CLASSIFIERS_INVALID_SHAPE'
  );
});

test('normalizeClassifiers rejects non-uuid userId (422)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeClassifiers([{ userId: 'not-a-uuid' }]),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'CLASSIFIERS_INVALID_SHAPE'
  );
});

test('normalizeClassifiers rejects more than 50 items (422 CLASSIFIERS_TOO_MANY)', async () => {
  const svc = buildService(users);
  const tooMany = Array.from({ length: 51 }, () => ({ userId: UID_A }));
  await assert.rejects(
    () => svc.normalizeClassifiers(tooMany),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'CLASSIFIERS_TOO_MANY'
  );
});

test('normalizeClassifiers falls back to username when fullName is empty', async () => {
  const svc = buildService([{ id: UID_A, fullName: '   ', username: 'alice', status: 'ACTIVE' }]);
  const result = await svc.normalizeClassifiers([{ userId: UID_A }]);
  assert.equal(result[0].fullName, 'alice');
});

// Regressao: o UUID_REGEX exigia versao [1-5] e variante [89ab] (RFC 4122
// estrito). Os usuarios do seed/fixtures nascem nil-style
// (`00000000-...-0001`), entao classificar era IMPOSSIVEL em dev local — o
// backend devolvia "classifiers[].userId must be a uuid" pra qualquer
// classificador. Nao pegou antes porque toda fixture deste arquivo usa uuid v4.
test('normalizeClassifiers accepts seed-shaped uuid (nil version/variant)', async () => {
  const seedId = '00000000-0000-0000-0000-000000000001';
  const svc = buildService([
    { id: seedId, fullName: 'Flavio Seed', username: 'flavio', status: 'ACTIVE', role: 'ADMIN' },
  ]);
  const result = await svc.normalizeClassifiers([{ userId: seedId }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, seedId);
});

// Mesma classe: v7 (ordenavel por tempo) tem versao 7, fora do [1-5] antigo.
test('normalizeClassifiers accepts a v7-shaped uuid', async () => {
  const v7 = '01890a5d-ac96-774b-bcce-b302099a8057';
  const svc = buildService([
    { id: v7, fullName: 'Uuid Sete', username: 'sete', status: 'ACTIVE', role: 'CLASSIFIER' },
  ]);
  const result = await svc.normalizeClassifiers([{ userId: v7 }]);
  assert.equal(result[0].id, v7);
});
