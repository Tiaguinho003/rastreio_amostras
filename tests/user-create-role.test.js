import test from 'node:test';
import assert from 'node:assert/strict';

import { HttpError } from '../src/contracts/errors.js';
import { UserService } from '../src/users/user-service.js';

// createUser recusa papeis nao atribuiveis ANTES de tocar o banco, entao o
// service roda com um prisma vazio. updateUser NAO tem esse gate de proposito:
// os PROSPECTOR que ja existem precisam seguir editaveis (nome, telefone,
// senha, inativacao).

const adminActor = { actorUserId: 'admin-1', role: 'ADMIN', requestId: 'r1' };

function service() {
  return new UserService({ prisma: {}, emailService: {} });
}

function validInput(overrides = {}) {
  return {
    fullName: 'Fulano de Tal',
    username: 'fulano',
    email: 'fulano@example.com',
    phone: '11999998888',
    password: 'senha-forte-123',
    role: 'COMMERCIAL',
    ...overrides,
  };
}

test('createUser: PROSPECTOR vira 422 PROSPECTOR_NOT_ASSIGNABLE no campo role', async () => {
  const svc = service();
  await assert.rejects(svc.createUser(validInput({ role: 'PROSPECTOR' }), adminActor), (error) => {
    assert.equal(error instanceof HttpError, true);
    assert.equal(error.status, 422);
    assert.equal(error.details.code, 'PROSPECTOR_NOT_ASSIGNABLE');
    assert.equal(error.details.field, 'role');
    return true;
  });
});

test('createUser: papel invalido continua caindo no VALIDATION_ERROR do normalizeRole', async () => {
  const svc = service();
  await assert.rejects(svc.createUser(validInput({ role: 'BANANA' }), adminActor), (error) => {
    assert.equal(error.status, 422);
    assert.equal(error.details.code, 'VALIDATION_ERROR');
    return true;
  });
});

test('createUser: nao-ADMIN e barrado antes do gate de papel', async () => {
  const svc = service();
  await assert.rejects(
    svc.createUser(validInput({ role: 'PROSPECTOR' }), {
      actorUserId: 'u2',
      role: 'COMMERCIAL',
    }),
    (error) => {
      assert.equal(error.status, 403);
      return true;
    }
  );
});
