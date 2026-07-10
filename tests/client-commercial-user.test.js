import test from 'node:test';
import assert from 'node:assert/strict';

import { ClientService } from '../src/clients/client-service.js';
import { HttpError } from '../src/contracts/errors.js';

// assertCommercialUserAssignable e o gate unico dos QUATRO caminhos de escrita
// do vinculo cliente<->responsavel comercial (createClient, updateClient,
// addCommercialUserToClient, bulkAddCommercialUser). Testar o helper cobre os
// quatro; testar os quatro fluxos exigiria montar o cliente inteiro.
//
// removeCommercialUserFromClient NAO passa por aqui de proposito: remover um
// vinculo legado tem de continuar possivel.

function fakeTx(user) {
  return {
    user: {
      findUnique: async ({ where, select }) => {
        assert.ok(select.role, 'o select precisa trazer role para o gate de papel');
        if (!user || user.id !== where.id) return null;
        return {
          id: user.id,
          status: user.status ?? 'ACTIVE',
          role: user.role,
        };
      },
    },
  };
}

function service() {
  return new ClientService({ prisma: {} });
}

// HttpError guarda { code, field } em `details`, nao no topo.
async function expectHttpError(promise, { status, code }) {
  await assert.rejects(promise, (error) => {
    assert.equal(error instanceof HttpError, true);
    assert.equal(error.status, status);
    assert.equal(error.details.code, code);
    return true;
  });
}

test('assertCommercialUserAssignable: null/undefined sao no-op (responsavel e opcional)', async () => {
  const svc = service();
  await svc.assertCommercialUserAssignable(fakeTx(null), null);
  await svc.assertCommercialUserAssignable(fakeTx(null), undefined);
});

test('assertCommercialUserAssignable: COMMERCIAL ativo passa', async () => {
  const svc = service();
  const tx = fakeTx({ id: 'u1', role: 'COMMERCIAL', status: 'ACTIVE' });
  await svc.assertCommercialUserAssignable(tx, 'u1');
});

test('assertCommercialUserAssignable: papeis nao-comerciais seguem elegiveis', async () => {
  const svc = service();
  for (const role of ['ADMIN', 'CLASSIFIER', 'REGISTRATION', 'CADASTRO']) {
    const tx = fakeTx({ id: 'u1', role, status: 'ACTIVE' });
    await svc.assertCommercialUserAssignable(tx, 'u1');
  }
});

test('assertCommercialUserAssignable: PROSPECTOR vira 422 PROSPECTOR_NOT_ASSIGNABLE', async () => {
  const svc = service();
  const tx = fakeTx({ id: 'u1', role: 'PROSPECTOR', status: 'ACTIVE' });
  await expectHttpError(svc.assertCommercialUserAssignable(tx, 'u1'), {
    status: 422,
    code: 'PROSPECTOR_NOT_ASSIGNABLE',
  });
});

test('assertCommercialUserAssignable: usuario inexistente vira 422 COMMERCIAL_USER_NOT_FOUND', async () => {
  const svc = service();
  await expectHttpError(svc.assertCommercialUserAssignable(fakeTx(null), 'u404'), {
    status: 422,
    code: 'COMMERCIAL_USER_NOT_FOUND',
  });
});

test('assertCommercialUserAssignable: inativo vira 422 antes do gate de papel', async () => {
  const svc = service();
  const tx = fakeTx({ id: 'u1', role: 'PROSPECTOR', status: 'INACTIVE' });
  await expectHttpError(svc.assertCommercialUserAssignable(tx, 'u1'), {
    status: 422,
    code: 'COMMERCIAL_USER_INACTIVE',
  });
});

test('assertCommercialUserAssignable: o erro de papel aponta o campo commercialUserId', async () => {
  const svc = service();
  const tx = fakeTx({ id: 'u1', role: 'PROSPECTOR', status: 'ACTIVE' });
  await assert.rejects(svc.assertCommercialUserAssignable(tx, 'u1'), (error) => {
    assert.equal(error.details.field, 'commercialUserId');
    assert.match(error.message, /PROSPECTOR/);
    return true;
  });
});
