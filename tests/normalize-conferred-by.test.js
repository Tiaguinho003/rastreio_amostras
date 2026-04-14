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
];

const actor = { actorUserId: UID_ACTOR };

test('normalizeConferredBy returns null for null input', async () => {
  const svc = buildService(users);
  const result = await svc.normalizeConferredBy(null, { actor });
  assert.equal(result, null);
});

test('normalizeConferredBy returns null for undefined input', async () => {
  const svc = buildService(users);
  const result = await svc.normalizeConferredBy(undefined, { actor });
  assert.equal(result, null);
});

test('normalizeConferredBy returns null for empty array', async () => {
  const svc = buildService(users);
  const result = await svc.normalizeConferredBy([], { actor });
  assert.equal(result, null);
});

test('normalizeConferredBy builds snapshots from valid userIds', async () => {
  const svc = buildService(users);
  const result = await svc.normalizeConferredBy([{ userId: UID_A }, { userId: UID_B }], { actor });
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

test('normalizeConferredBy dedupes duplicate userIds silently', async () => {
  const svc = buildService(users);
  const result = await svc.normalizeConferredBy(
    [{ userId: UID_A }, { userId: UID_A }, { userId: UID_B }],
    { actor }
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].id, UID_A);
  assert.equal(result[1].id, UID_B);
});

test('normalizeConferredBy rejects self-conferral (422 SELF_CONFERRAL_NOT_ALLOWED)', async () => {
  const svc = buildService([
    ...users,
    { id: UID_ACTOR, fullName: 'Actor', username: 'actor', status: 'ACTIVE' },
  ]);
  await assert.rejects(
    () => svc.normalizeConferredBy([{ userId: UID_A }, { userId: UID_ACTOR }], { actor }),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'SELF_CONFERRAL_NOT_ALLOWED'
  );
});

test('normalizeConferredBy rejects unknown user (422 CONFERRER_NOT_FOUND)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeConferredBy([{ userId: '44444444-4444-4444-8444-444444444444' }], { actor }),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'CONFERRER_NOT_FOUND'
  );
});

test('normalizeConferredBy rejects inactive user (422 INACTIVE_CONFERRER)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeConferredBy([{ userId: UID_C }], { actor }),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'INACTIVE_CONFERRER'
  );
});

test('normalizeConferredBy rejects non-array input (422 CONFERRED_BY_INVALID_SHAPE)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeConferredBy('oops', { actor }),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'CONFERRED_BY_INVALID_SHAPE'
  );
});

test('normalizeConferredBy rejects items without userId (422)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeConferredBy([{ id: UID_A }], { actor }),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'CONFERRED_BY_INVALID_SHAPE'
  );
});

test('normalizeConferredBy rejects non-uuid userId (422)', async () => {
  const svc = buildService(users);
  await assert.rejects(
    () => svc.normalizeConferredBy([{ userId: 'not-a-uuid' }], { actor }),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'CONFERRED_BY_INVALID_SHAPE'
  );
});

test('normalizeConferredBy rejects more than 50 items (422 CONFERRED_BY_TOO_MANY)', async () => {
  const svc = buildService(users);
  const tooMany = Array.from({ length: 51 }, () => ({ userId: UID_A }));
  await assert.rejects(
    () => svc.normalizeConferredBy(tooMany, { actor }),
    (error) =>
      error instanceof HttpError &&
      error.status === 422 &&
      error.details?.code === 'CONFERRED_BY_TOO_MANY'
  );
});

test('normalizeConferredBy falls back to username when fullName is empty', async () => {
  const svc = buildService([{ id: UID_A, fullName: '   ', username: 'alice', status: 'ACTIVE' }]);
  const result = await svc.normalizeConferredBy([{ userId: UID_A }], { actor });
  assert.equal(result[0].fullName, 'alice');
});
