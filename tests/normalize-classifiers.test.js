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

const users = [
  { id: UID_A, fullName: 'Alice Silva', username: 'alice', status: 'ACTIVE' },
  { id: UID_B, fullName: 'Bruno Souza', username: 'bruno', status: 'ACTIVE' },
  { id: UID_C, fullName: 'Carla Inativa', username: 'carla', status: 'INACTIVE' },
  { id: UID_ACTOR, fullName: 'Actor User', username: 'actor', status: 'ACTIVE' },
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
