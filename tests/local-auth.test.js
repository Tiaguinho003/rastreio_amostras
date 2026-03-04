import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

import { LocalAuthService } from '../src/auth/local-auth-service.js';
import { HttpError } from '../src/contracts/errors.js';

const hash = bcrypt.hashSync('admin123', 10);

test('login issues bearer token and authenticateAuthorizationHeader returns actor', () => {
  const authService = new LocalAuthService({
    secret: 'super-secret-for-local-tests',
    users: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        username: 'admin',
        passwordHash: hash,
        role: 'ADMIN'
      }
    ]
  });

  const login = authService.login({ username: 'admin', password: 'admin123' });
  assert.equal(login.tokenType, 'Bearer');
  assert.equal(typeof login.accessToken, 'string');
  assert.equal(login.user.role, 'ADMIN');

  const actor = authService.authenticateAuthorizationHeader(`Bearer ${login.accessToken}`);
  assert.equal(actor.actorType, 'USER');
  assert.equal(actor.actorUserId, '00000000-0000-0000-0000-000000000001');
  assert.equal(actor.role, 'ADMIN');
});

test('invalid password returns 401', () => {
  const authService = new LocalAuthService({
    secret: 'super-secret-for-local-tests',
    users: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        username: 'admin',
        passwordHash: hash,
        role: 'ADMIN'
      }
    ]
  });

  assert.throws(
    () => authService.login({ username: 'admin', password: 'wrong' }),
    (error) => error instanceof HttpError && error.status === 401
  );
});

test('plaintext password is rejected when allowPlaintextPasswords is false', () => {
  assert.throws(
    () =>
      new LocalAuthService({
        secret: 'super-secret-for-local-tests',
        users: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            username: 'admin',
            password: 'admin123',
            role: 'ADMIN'
          }
        ]
      }),
    (error) => error instanceof Error && error.message.includes('passwordHash')
  );
});

test('plaintext password login works only when allowPlaintextPasswords is true', () => {
  const authService = new LocalAuthService({
    secret: 'super-secret-for-local-tests',
    allowPlaintextPasswords: true,
    users: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        username: 'admin',
        password: 'admin123',
        role: 'ADMIN'
      }
    ]
  });

  const login = authService.login({ username: 'admin', password: 'admin123' });
  assert.equal(login.user.username, 'admin');
});
