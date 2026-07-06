import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { DatabaseAuthService } from '../src/auth/database-auth-service.js';
import { UserService } from '../src/users/user-service.js';
import { hashPassword, LOGIN_MAX_ATTEMPTS } from '../src/users/user-support.js';

// Autenticacao real (banco): login feliz, lockout apos LOGIN_MAX_ATTEMPTS
// falhas, conta inativa, sessao revogada e sessao expirada (auto-registro via
// markSessionExpiredIfNeeded). Revisao Geral F1/LOG (LOG-T2).

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('database-auth-service integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const userService = new UserService({ prisma, emailService: {} });
  const authService = new DatabaseAuthService({
    prisma,
    secret: 'integration-test-secret',
    userService,
  });

  const requestContext = {
    actorType: 'ANONYMOUS',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
    requestId: 'database-auth-test',
  };

  const PREFIX = 'dbauth-';
  const PASSWORD = 'SenhaValida1';

  // user_audit_event e append-only (trigger bloqueia DELETE) e app_user tem
  // FK Restrict a partir dele — limpeza e por TRUNCATE CASCADE, o mesmo
  // padrao de physical-send-report-share. O npm run test:integration:db
  // re-seeda o login local depois da suite.
  async function cleanup() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE user_audit_event, user_session, app_user RESTART IDENTITY CASCADE'
    );
  }

  async function createUser(suffix, overrides = {}) {
    const username = `${PREFIX}${suffix}-${Math.random().toString(36).slice(2, 7)}`;
    const email = `${username}@test.local`;
    return prisma.user.create({
      data: {
        id: randomUUID(),
        fullName: `Database Auth ${suffix}`,
        username,
        usernameCanonical: username.toLowerCase(),
        email,
        emailCanonical: email.toLowerCase(),
        passwordHash: await hashPassword(PASSWORD),
        role: 'CLASSIFIER',
        status: 'ACTIVE',
        ...overrides,
      },
    });
  }

  test('login feliz emite token que autentica e credencial errada da 401', async () => {
    await cleanup();
    const user = await createUser('happy');

    const session = await authService.login(
      { username: user.username, password: PASSWORD },
      requestContext
    );
    assert.ok(session.accessToken);
    assert.equal(session.user.username, user.username);

    const actor = await authService.authenticateAuthorizationHeader(
      `Bearer ${session.accessToken}`,
      requestContext
    );
    assert.equal(actor.actorUserId, user.id);
    assert.equal(actor.role, 'CLASSIFIER');
    assert.equal(actor.sessionId, session.sessionId);

    await assert.rejects(
      () =>
        authService.login({ username: user.username, password: 'senha-errada' }, requestContext),
      (error) => {
        assert.equal(error.status, 401);
        assert.equal(error.details.code, 'INVALID_CREDENTIALS');
        return true;
      }
    );
  });

  test(`lockout: ${LOGIN_MAX_ATTEMPTS} falhas bloqueiam a conta por 5min (423 ate com a senha certa)`, async () => {
    await cleanup();
    const user = await createUser('lockout');

    // Tentativas 1..N-1 respondem 401; a N-esima ja arma o lock e responde 423.
    for (let attempt = 1; attempt < LOGIN_MAX_ATTEMPTS; attempt += 1) {
      await assert.rejects(
        () => authService.login({ username: user.username, password: 'errada' }, requestContext),
        (error) => {
          assert.equal(error.status, 401, `tentativa ${attempt} devia ser 401`);
          return true;
        }
      );
    }

    await assert.rejects(
      () => authService.login({ username: user.username, password: 'errada' }, requestContext),
      (error) => {
        assert.equal(error.status, 423);
        assert.equal(error.details.code, 'ACCOUNT_LOCKED');
        return true;
      }
    );

    // Mesmo a senha CERTA nao entra enquanto o lock vale.
    await assert.rejects(
      () => authService.login({ username: user.username, password: PASSWORD }, requestContext),
      (error) => {
        assert.equal(error.status, 423);
        assert.equal(error.details.code, 'ACCOUNT_LOCKED');
        return true;
      }
    );
  });

  test('conta inativa nao loga (403 ACCOUNT_INACTIVE)', async () => {
    await cleanup();
    const user = await createUser('inactive', { status: 'INACTIVE' });

    await assert.rejects(
      () => authService.login({ username: user.username, password: PASSWORD }, requestContext),
      (error) => {
        assert.equal(error.status, 403);
        assert.equal(error.details.code, 'ACCOUNT_INACTIVE');
        return true;
      }
    );
  });

  test('sessao revogada responde 401 SESSION_REVOKED', async () => {
    await cleanup();
    const user = await createUser('revoked');

    const session = await authService.login(
      { username: user.username, password: PASSWORD },
      requestContext
    );

    await prisma.userSession.update({
      where: { id: session.sessionId },
      data: { revokedAt: new Date(), endReason: 'LOGOUT' },
    });

    await assert.rejects(
      () => authService.authenticateAuthorizationHeader(`Bearer ${session.accessToken}`),
      (error) => {
        assert.equal(error.status, 401);
        assert.equal(error.details.code, 'SESSION_REVOKED');
        return true;
      }
    );
  });

  test('sessao expirada responde 401 SESSION_EXPIRED e e revogada no banco', async () => {
    await cleanup();
    const user = await createUser('expired');

    const session = await authService.login(
      { username: user.username, password: PASSWORD },
      requestContext
    );

    await prisma.userSession.update({
      where: { id: session.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await assert.rejects(
      () => authService.authenticateAuthorizationHeader(`Bearer ${session.accessToken}`),
      (error) => {
        assert.equal(error.status, 401);
        assert.equal(error.details.code, 'SESSION_EXPIRED');
        return true;
      }
    );

    const row = await prisma.userSession.findUnique({ where: { id: session.sessionId } });
    assert.ok(row.revokedAt);
    assert.equal(row.endReason, 'EXPIRED');
  });

  test.after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
}

async function canReachDatabase(databaseUrlValue) {
  if (!databaseUrlValue) {
    return false;
  }

  const probe = new PrismaClient();
  try {
    await probe.$connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.$disconnect().catch(() => {});
  }
}
