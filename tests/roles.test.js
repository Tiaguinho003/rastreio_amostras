import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertRoleAllowed,
  isAssignableUserRole,
  isCommercialRole,
  isKnownRole,
  NON_ASSIGNABLE_ROLES,
  USER_ROLES,
} from '../src/auth/roles.js';
import { HttpError } from '../src/contracts/errors.js';

test('USER_ROLES contains the six known roles', () => {
  assert.deepEqual(Object.keys(USER_ROLES).sort(), [
    'ADMIN',
    'CADASTRO',
    'CLASSIFIER',
    'COMMERCIAL',
    'PROSPECTOR',
    'REGISTRATION',
  ]);
});

test('assertRoleAllowed does not throw when role is in the allowed list', () => {
  assert.doesNotThrow(() => assertRoleAllowed('ADMIN', ['ADMIN']));
  assert.doesNotThrow(() => assertRoleAllowed('ADMIN', ['ADMIN', 'CLASSIFIER']));
  assert.doesNotThrow(() => assertRoleAllowed('CLASSIFIER', ['CLASSIFIER', 'REGISTRATION']));
});

test('assertRoleAllowed throws 403 when role is not in the allowed list', () => {
  assert.throws(
    () => assertRoleAllowed('CLASSIFIER', ['ADMIN'], 'test action'),
    (error) => {
      assert.equal(error instanceof HttpError, true);
      assert.equal(error.status, 403);
      assert.match(error.message, /CLASSIFIER/);
      assert.match(error.message, /test action/);
      return true;
    }
  );
});

test('assertRoleAllowed throws for undefined or unknown role', () => {
  assert.throws(
    () => assertRoleAllowed(undefined, ['ADMIN'], 'restricted'),
    (error) => error instanceof HttpError && error.status === 403
  );
  assert.throws(
    () => assertRoleAllowed('INVENTED_ROLE', ['ADMIN'], 'restricted'),
    (error) => error instanceof HttpError && error.status === 403
  );
});

test('isKnownRole returns true for valid roles and false for invalid ones', () => {
  assert.equal(isKnownRole('ADMIN'), true);
  assert.equal(isKnownRole('CLASSIFIER'), true);
  assert.equal(isKnownRole('REGISTRATION'), true);
  assert.equal(isKnownRole('COMMERCIAL'), true);
  assert.equal(isKnownRole('PROSPECTOR'), true);
  assert.equal(isKnownRole('CADASTRO'), true);
  assert.equal(isKnownRole('BANANA'), false);
  assert.equal(isKnownRole(undefined), false);
  assert.equal(isKnownRole(''), false);
});

test('isCommercialRole is COMMERCIAL only — PROSPECTOR nao e mais elegivel', () => {
  assert.equal(isCommercialRole('COMMERCIAL'), true);
  assert.equal(isCommercialRole('PROSPECTOR'), false);
  assert.equal(isCommercialRole('ADMIN'), false);
  assert.equal(isCommercialRole(undefined), false);
});

test('NON_ASSIGNABLE_ROLES contem apenas o PROSPECTOR e e imutavel', () => {
  assert.deepEqual([...NON_ASSIGNABLE_ROLES], [USER_ROLES.PROSPECTOR]);
  assert.equal(Object.isFrozen(NON_ASSIGNABLE_ROLES), true);
});

test('isAssignableUserRole barra o PROSPECTOR e libera os demais papeis', () => {
  assert.equal(isAssignableUserRole('PROSPECTOR'), false);
  for (const role of ['ADMIN', 'CLASSIFIER', 'REGISTRATION', 'COMMERCIAL', 'CADASTRO']) {
    assert.equal(isAssignableUserRole(role), true, `${role} deveria ser atribuivel`);
  }
});
