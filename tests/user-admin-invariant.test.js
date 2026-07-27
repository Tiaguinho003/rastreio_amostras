import test from 'node:test';
import assert from 'node:assert/strict';

import { HttpError } from '../src/contracts/errors.js';
import { UserService } from '../src/users/user-service.js';

// Duas travas do `assertAdminInvariant`, ambas 409 LAST_ADMIN_REQUIRED:
//
//   1. o ADMIN nao tira o PROPRIO acesso administrativo — nem trocando o papel,
//      nem se inativando. Esse ramo nem consulta o banco, entao roda com um tx
//      que estoura se for tocado.
//   2. o sistema nao fica sem ADMIN ativo — vale pra QUALQUER alvo ADMIN, e
//      esse ramo conta os outros admins ativos (por isso o stub de count).
//
// A UI antecipa so a trava 1 (U-D7, RD16 §2.11): a 2 precisaria de uma contagem
// que a tela nao tem, entao ela aparece na tentativa.

const ACTOR_ID = 'admin-1';

function service() {
  return new UserService({ prisma: {}, emailService: {} });
}

// tx que denuncia qualquer consulta — usado nos casos que devem falhar ANTES
// de tocar o banco.
const txProibido = {
  user: {
    count() {
      throw new Error('nao deveria consultar o banco neste ramo');
    },
  },
};

function txComAdminsAtivos(quantidade) {
  return {
    user: {
      count: async () => quantidade,
    },
  };
}

function admin(overrides = {}) {
  return { id: ACTOR_ID, role: 'ADMIN', status: 'ACTIVE', ...overrides };
}

test('assertAdminInvariant: ADMIN trocando o PROPRIO papel vira 409 LAST_ADMIN_REQUIRED', async () => {
  const error = await service()
    .assertAdminInvariant(txProibido, admin(), {
      nextRole: 'COMMERCIAL',
      actorUserId: ACTOR_ID,
    })
    .then(
      () => null,
      (cause) => cause
    );

  assert.ok(error instanceof HttpError);
  assert.equal(error.status, 409);
  assert.equal(error.details.code, 'LAST_ADMIN_REQUIRED');
});

test('assertAdminInvariant: ADMIN se inativando vira 409 LAST_ADMIN_REQUIRED', async () => {
  const error = await service()
    .assertAdminInvariant(txProibido, admin(), {
      nextStatus: 'INACTIVE',
      actorUserId: ACTOR_ID,
    })
    .then(
      () => null,
      (cause) => cause
    );

  assert.ok(error instanceof HttpError);
  assert.equal(error.status, 409);
  assert.equal(error.details.code, 'LAST_ADMIN_REQUIRED');
});

test('assertAdminInvariant: inativar o ULTIMO ADMIN ativo (outro ator) vira 409', async () => {
  const alvo = admin({ id: 'admin-2' });

  const error = await service()
    .assertAdminInvariant(txComAdminsAtivos(0), alvo, {
      nextStatus: 'INACTIVE',
      actorUserId: ACTOR_ID,
    })
    .then(
      () => null,
      (cause) => cause
    );

  assert.ok(error instanceof HttpError);
  assert.equal(error.status, 409);
  assert.equal(error.details.code, 'LAST_ADMIN_REQUIRED');
});

test('assertAdminInvariant: inativar um ADMIN com OUTRO admin ativo passa', async () => {
  const alvo = admin({ id: 'admin-2' });

  await service().assertAdminInvariant(txComAdminsAtivos(1), alvo, {
    nextStatus: 'INACTIVE',
    actorUserId: ACTOR_ID,
  });
});

test('assertAdminInvariant: alvo nao-ADMIN nao consulta a contagem de admins', async () => {
  const alvo = { id: 'user-9', role: 'COMMERCIAL', status: 'ACTIVE' };

  await service().assertAdminInvariant(txProibido, alvo, {
    nextStatus: 'INACTIVE',
    actorUserId: ACTOR_ID,
  });
});

test('assertAdminInvariant: o proprio ADMIN editando dados que NAO mexem no acesso passa', async () => {
  await service().assertAdminInvariant(txProibido, admin(), {
    nextRole: 'ADMIN',
    actorUserId: ACTOR_ID,
  });
});
