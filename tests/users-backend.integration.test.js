import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { UserService } from '../src/users/user-service.js';

const databaseUrl = process.env.DATABASE_URL;
const databaseReachable = await canReachDatabase(databaseUrl);

if (!databaseUrl || !databaseReachable) {
  test.skip('users backend integration tests require DATABASE_URL and reachable PostgreSQL', () => {});
} else {
  const prisma = new PrismaClient();
  const userService = new UserService({ prisma });

  const adminActor = {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role: 'ADMIN',
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };

  // Prefixo unico p/ isolar os usuarios deste teste dos demais no banco (nao da
  // pra truncar app_user — muitas FKs/seed). O filtro de busca restringe a lista
  // so a eles, deixando as asserciaes imunes a outros usuarios existentes.
  const SEARCH_TOKEN = 'CursorPag';

  async function cleanup() {
    await prisma.user.deleteMany({ where: { username: { startsWith: 'cursorpag-' } } });
  }

  async function createUser(suffix) {
    const username = `cursorpag-${suffix.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`;
    return prisma.user.create({
      data: {
        id: randomUUID(),
        fullName: `${SEARCH_TOKEN} ${suffix}`,
        username,
        usernameCanonical: username.toLowerCase(),
        email: `${username}@test.local`,
        emailCanonical: `${username}@test.local`,
        passwordHash: 'x',
        role: 'CLASSIFIER',
        status: 'ACTIVE',
      },
    });
  }

  test('listUsers pagina por cursor em ordem alfabetica de fullName', async () => {
    await cleanup();
    // Cria fora de ordem p/ provar que a ordenacao e por fullName (nao insercao).
    await createUser('Daniel');
    await createUser('Ana');
    await createUser('Eduardo');
    await createUser('Carlos');
    await createUser('Bruno');

    try {
      const page1 = await userService.listUsers({ search: SEARCH_TOKEN, limit: 2 }, adminActor);
      assert.deepEqual(
        page1.items.map((u) => u.fullName),
        [`${SEARCH_TOKEN} Ana`, `${SEARCH_TOKEN} Bruno`]
      );
      assert.equal(page1.page.total, 5);
      assert.ok(page1.page.nextCursor);
      assert.equal(typeof page1.page.nextCursor.fullName, 'string');
      assert.equal(typeof page1.page.nextCursor.id, 'string');

      const page2 = await userService.listUsers(
        {
          search: SEARCH_TOKEN,
          limit: 2,
          cursorFullName: page1.page.nextCursor.fullName,
          cursorId: page1.page.nextCursor.id,
        },
        adminActor
      );
      assert.deepEqual(
        page2.items.map((u) => u.fullName),
        [`${SEARCH_TOKEN} Carlos`, `${SEARCH_TOKEN} Daniel`]
      );
      assert.equal(page2.page.total, 5);
      assert.ok(page2.page.nextCursor);

      const page3 = await userService.listUsers(
        {
          search: SEARCH_TOKEN,
          limit: 2,
          cursorFullName: page2.page.nextCursor.fullName,
          cursorId: page2.page.nextCursor.id,
        },
        adminActor
      );
      assert.deepEqual(
        page3.items.map((u) => u.fullName),
        [`${SEARCH_TOKEN} Eduardo`]
      );
      assert.equal(page3.page.nextCursor, null);
    } finally {
      await cleanup();
      await prisma.$disconnect();
    }
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
