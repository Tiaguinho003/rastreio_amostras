import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { UserService } from '../src/users/user-service.js';
import { hashPassword } from '../src/users/user-support.js';

// Fluxo esqueci-a-senha (request -> verify-code -> reset) contra o banco real:
// resposta generica (anti-enumeracao), throttle de resend, TTL de 15min,
// 5 tentativas erradas invalidam o pedido, consumo do codigo e revogacao de
// todas as sessoes no reset. Revisao Geral F1/LOG (LOG-T1).

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('password-reset integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();

  // Email service fake: captura o codigo em claro que o service enviaria —
  // e como o teste "recebe o email".
  const sentEmails = [];
  const emailService = {
    async sendPasswordResetCode({ to, code }) {
      sentEmails.push({ to, code });
    },
  };

  const userService = new UserService({ prisma, emailService });

  const actorContext = {
    actorType: 'ANONYMOUS',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
    requestId: 'password-reset-test',
  };

  const PREFIX = 'pwreset-';

  // user_audit_event e append-only (trigger bloqueia DELETE) e app_user tem
  // FK Restrict a partir dele — limpeza e por TRUNCATE CASCADE, o mesmo
  // padrao de physical-send-report-share. O npm run test:integration:db
  // re-seeda o login local depois da suite.
  async function cleanup() {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE password_reset_request, user_audit_event, user_session, app_user RESTART IDENTITY CASCADE'
    );
    sentEmails.length = 0;
  }

  async function createUser(suffix, overrides = {}) {
    const username = `${PREFIX}${suffix}-${Math.random().toString(36).slice(2, 7)}`;
    const email = `${username}@test.local`;
    return prisma.user.create({
      data: {
        id: randomUUID(),
        fullName: `Password Reset ${suffix}`,
        username,
        usernameCanonical: username.toLowerCase(),
        email,
        emailCanonical: email.toLowerCase(),
        passwordHash: await hashPassword('SenhaAntiga1'),
        role: 'CLASSIFIER',
        status: 'ACTIVE',
        ...overrides,
      },
    });
  }

  function lastSentCode() {
    assert.ok(sentEmails.length > 0, 'esperava email de codigo enviado');
    return sentEmails[sentEmails.length - 1].code;
  }

  test('request para email desconhecido devolve resposta generica sem enviar email', async () => {
    await cleanup();

    const result = await userService.requestPasswordReset(
      { email: `${PREFIX}nao-existe@test.local` },
      actorContext
    );

    assert.ok(result.resetRequest.requestId);
    assert.ok(result.resetRequest.expiresAt);
    assert.equal(sentEmails.length, 0);
    const rows = await prisma.passwordResetRequest.findMany({
      where: { emailCanonical: `${PREFIX}nao-existe@test.local` },
    });
    assert.equal(rows.length, 0);
  });

  test('happy path: request envia codigo de 6 digitos e verify valida sem consumir', async () => {
    await cleanup();
    const user = await createUser('happy');

    await userService.requestPasswordReset({ email: user.email }, actorContext);
    const code = lastSentCode();
    assert.match(code, /^\d{6}$/);

    const verification = await userService.verifyPasswordResetCode({
      email: user.email,
      code,
    });
    assert.equal(verification.verification.verified, true);

    // verify nao consome: pode validar de novo.
    const again = await userService.verifyPasswordResetCode({ email: user.email, code });
    assert.equal(again.verification.verified, true);
  });

  test('resend imediato e bloqueado com 429 PASSWORD_RESET_RATE_LIMITED', async () => {
    await cleanup();
    const user = await createUser('resend');

    await userService.requestPasswordReset({ email: user.email }, actorContext);
    await assert.rejects(
      () => userService.requestPasswordReset({ email: user.email }, actorContext),
      (error) => {
        assert.equal(error.status, 429);
        assert.equal(error.details.code, 'PASSWORD_RESET_RATE_LIMITED');
        return true;
      }
    );
  });

  test('verify/reset respondem generico (INVALID_CODE) sem revelar se o email existe', async () => {
    await cleanup();
    const user = await createUser('generic');

    // Email inexistente e email existente SEM pedido valido: mesma resposta.
    for (const email of [`${PREFIX}fantasma@test.local`, user.email]) {
      await assert.rejects(
        () => userService.verifyPasswordResetCode({ email, code: '123456' }),
        (error) => {
          assert.equal(error.status, 422);
          assert.equal(error.details.code, 'INVALID_CODE');
          return true;
        }
      );
    }
  });

  test('codigo expirado (TTL 15min) responde generico', async () => {
    await cleanup();
    const user = await createUser('ttl');

    await userService.requestPasswordReset({ email: user.email }, actorContext);
    const code = lastSentCode();

    await prisma.passwordResetRequest.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await assert.rejects(
      () => userService.verifyPasswordResetCode({ email: user.email, code }),
      (error) => {
        assert.equal(error.status, 422);
        assert.equal(error.details.code, 'INVALID_CODE');
        return true;
      }
    );
  });

  test('5 tentativas erradas invalidam o pedido; codigo certo depois nao vale mais', async () => {
    await cleanup();
    const user = await createUser('lock');

    await userService.requestPasswordReset({ email: user.email }, actorContext);
    const code = lastSentCode();
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await assert.rejects(
        () => userService.verifyPasswordResetCode({ email: user.email, code: wrong }),
        (error) => {
          assert.equal(error.status, 422);
          assert.equal(error.details.code, 'INVALID_CODE');
          return true;
        }
      );
    }

    // 5a tentativa errada: pedido invalidado com 429 proprio.
    await assert.rejects(
      () => userService.verifyPasswordResetCode({ email: user.email, code: wrong }),
      (error) => {
        assert.equal(error.status, 429);
        assert.equal(error.details.code, 'PASSWORD_RESET_REQUEST_LOCKED');
        return true;
      }
    );

    // Mesmo o codigo CERTO nao funciona mais (pedido invalido -> generico).
    await assert.rejects(
      () => userService.verifyPasswordResetCode({ email: user.email, code }),
      (error) => {
        assert.equal(error.status, 422);
        assert.equal(error.details.code, 'INVALID_CODE');
        return true;
      }
    );
  });

  test('reset troca a senha, consome o pedido e revoga todas as sessoes', async () => {
    await cleanup();
    const user = await createUser('reset');

    // Duas sessoes ativas que devem cair no reset.
    for (let i = 0; i < 2; i += 1) {
      await prisma.userSession.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
    }

    await userService.requestPasswordReset({ email: user.email }, actorContext);
    const code = lastSentCode();

    const result = await userService.resetPasswordWithCode(
      { email: user.email, code, password: 'SenhaNova22' },
      actorContext
    );
    assert.equal(result.sessionRevoked, true);

    // Senha nova autentica; antiga nao.
    const verified = await userService.verifyCredentials(user.username, 'SenhaNova22', {
      ...actorContext,
    });
    assert.equal(verified.id, user.id);
    await assert.rejects(
      () => userService.verifyCredentials(user.username, 'SenhaAntiga1', { ...actorContext }),
      (error) => {
        assert.equal(error.status, 401);
        return true;
      }
    );

    // Sessoes revogadas com endReason PASSWORD_RESET.
    const sessions = await prisma.userSession.findMany({ where: { userId: user.id } });
    assert.equal(sessions.length, 2);
    for (const session of sessions) {
      assert.ok(session.revokedAt);
      assert.equal(session.endReason, 'PASSWORD_RESET');
    }

    // Pedido consumido: reusar o codigo responde generico.
    await assert.rejects(
      () =>
        userService.resetPasswordWithCode(
          { email: user.email, code, password: 'SenhaNova33' },
          actorContext
        ),
      (error) => {
        assert.equal(error.status, 422);
        assert.equal(error.details.code, 'INVALID_CODE');
        return true;
      }
    );
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
