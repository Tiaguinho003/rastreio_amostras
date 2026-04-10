import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

import { LocalAuthService } from '../src/auth/local-auth-service.js';
import { issueAccessToken, verifyAccessToken } from '../src/auth/token-service.js';
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
        role: 'ADMIN',
      },
    ],
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
        role: 'ADMIN',
      },
    ],
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
            role: 'ADMIN',
          },
        ],
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
        role: 'ADMIN',
      },
    ],
  });

  const login = authService.login({ username: 'admin', password: 'admin123' });
  assert.equal(login.user.username, 'admin');
});

test('login with nonexistent username returns 401', () => {
  const authService = new LocalAuthService({
    secret: 'super-secret-for-local-tests',
    users: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        username: 'admin',
        passwordHash: hash,
        role: 'ADMIN',
      },
    ],
  });

  assert.throws(
    () => authService.login({ username: 'nonexistent', password: 'any' }),
    (error) => error instanceof HttpError && error.status === 401
  );
});

test('expired token is rejected by verifyAccessToken', () => {
  const secret = 'super-secret-for-local-tests';
  const now = Date.now();

  const { token } = issueAccessToken(
    {
      userId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000010',
      role: 'ADMIN',
      username: 'admin',
    },
    { secret, ttlSeconds: 1, nowMs: now }
  );

  assert.throws(
    () => verifyAccessToken(token, { secret, nowMs: now + 10_000 }),
    (error) => {
      assert.equal(error instanceof HttpError, true);
      assert.equal(error.status, 401);
      assert.match(error.message, /expired/i);
      return true;
    }
  );
});
