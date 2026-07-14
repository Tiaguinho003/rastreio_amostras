import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeClientBankAccountStatus,
  normalizeCreateClientBankAccountInput,
  normalizeHolderTaxId,
  normalizeUpdateClientBankAccountInput,
  toClientBankAccountView,
} from '../src/clients/client-bank-account-support.js';
import { ClientBankAccountService } from '../src/clients/client-bank-account-service.js';

const actor = { actorUserId: 'u1', role: 'COMMERCIAL', requestId: 'r1' };

const validInput = {
  bankName: 'BANCO DO BRASIL',
  agency: '0001',
  accountNumber: '12345-6',
  holderName: 'Fazenda Boa Vista',
  holderTaxId: '123.456.789-00',
  pixKey: 'fazenda@boa.com',
};

// ---------------------------------------------------------------------------
// support (sem DB)
// ---------------------------------------------------------------------------

test('normalizeHolderTaxId: aceita CPF(11) e CNPJ(14); rejeita outros', () => {
  assert.equal(normalizeHolderTaxId('123.456.789-00'), '12345678900');
  assert.equal(normalizeHolderTaxId('12.345.678/0001-95'), '12345678000195');
  assert.throws(() => normalizeHolderTaxId('123'), /11 \(CPF\) or 14 \(CNPJ\)/);
  assert.throws(() => normalizeHolderTaxId(undefined), /required/);
});

test('normalizeCreateClientBankAccountInput: campos obrigatorios + pix opcional', () => {
  const data = normalizeCreateClientBankAccountInput(validInput);
  assert.equal(data.bankName, 'BANCO DO BRASIL');
  assert.equal(data.accountNumber, '12345-6');
  assert.equal(data.holderTaxId, '12345678900');
  assert.equal(data.pixKey, 'fazenda@boa.com');
  assert.throws(
    () => normalizeCreateClientBankAccountInput({ ...validInput, agency: '' }),
    /agency/
  );
});

test('normalizeCreateClientBankAccountInput: bankName obrigatorio (texto livre, D141)', () => {
  assert.throws(
    () => normalizeCreateClientBankAccountInput({ ...validInput, bankName: '' }),
    /bankName/
  );
  assert.throws(
    () => normalizeCreateClientBankAccountInput({ ...validInput, bankName: undefined }),
    /bankName/
  );
});

test('normalizeClientBankAccountStatus: case-insensitive; rejeita invalido', () => {
  assert.equal(normalizeClientBankAccountStatus('inactive'), 'INACTIVE');
  assert.throws(() => normalizeClientBankAccountStatus('X'), /must be one of/);
});

test('normalizeUpdateClientBankAccountInput: parcial; rejeita vazio', () => {
  assert.deepEqual(normalizeUpdateClientBankAccountInput({ agency: '99' }), { agency: '99' });
  assert.deepEqual(normalizeUpdateClientBankAccountInput({ bankName: 'SICREDI' }), {
    bankName: 'SICREDI',
  });
  assert.throws(() => normalizeUpdateClientBankAccountInput({}), /no fields to update/);
});

test('toClientBankAccountView: bankName plano + datas ISO', () => {
  const now = new Date('2026-06-26T12:00:00.000Z');
  const view = toClientBankAccountView({
    id: 'a1',
    clientId: 'c1',
    bankName: 'BANCO DO BRASIL',
    agency: '0001',
    accountNumber: '12345-6',
    holderName: 'X',
    holderTaxId: '12345678900',
    pixKey: null,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  assert.equal(view.bankName, 'BANCO DO BRASIL');
  assert.equal(view.pixKey, null);
  assert.equal(view.createdAt, '2026-06-26T12:00:00.000Z');
});

// ---------------------------------------------------------------------------
// service (prisma fake, sem DB)
// ---------------------------------------------------------------------------

function fakePrisma(overrides = {}) {
  return {
    client: {
      findUnique: overrides.clientFindUnique ?? (async () => ({ id: 'c1' })),
    },
    clientBankAccount: {
      findMany: overrides.findMany ?? (async () => []),
      findFirst: overrides.findFirst ?? (async () => ({ id: 'a1' })),
      create:
        overrides.create ??
        (async ({ data }) => ({
          ...data,
          status: 'ACTIVE',
          createdAt: new Date(0),
          updatedAt: new Date(0),
        })),
      update:
        overrides.update ??
        (async ({ where, data }) => ({
          id: where.id,
          clientId: 'c1',
          bankName: data.bankName ?? 'BANCO DO BRASIL',
          agency: data.agency ?? '0001',
          accountNumber: data.accountNumber ?? '12345-6',
          holderName: data.holderName ?? 'X',
          holderTaxId: data.holderTaxId ?? '12345678900',
          pixKey: data.pixKey ?? null,
          status: data.status ?? 'ACTIVE',
          createdAt: new Date(0),
          updatedAt: new Date(0),
        })),
    },
  };
}

test('createClientBankAccount: cria e retorna a view', async () => {
  const svc = new ClientBankAccountService({ prisma: fakePrisma() });
  const { account } = await svc.createClientBankAccount('c1', validInput, actor);
  assert.equal(account.holderTaxId, '12345678900');
  assert.equal(account.bankName, 'BANCO DO BRASIL');
});

test('createClientBankAccount: cliente inexistente vira 404', async () => {
  const svc = new ClientBankAccountService({
    prisma: fakePrisma({ clientFindUnique: async () => null }),
  });
  await assert.rejects(
    () => svc.createClientBankAccount('ghost', validInput, actor),
    (e) => e.status === 404 && e.details?.code === 'CLIENT_NOT_FOUND'
  );
});

test('createClientBankAccount: sem autenticacao vira 401', async () => {
  const svc = new ClientBankAccountService({ prisma: fakePrisma() });
  await assert.rejects(
    () => svc.createClientBankAccount('c1', validInput, {}),
    (e) => e.status === 401
  );
});

test('updateClientBankAccount: conta fora do cliente vira 404', async () => {
  const svc = new ClientBankAccountService({
    prisma: fakePrisma({ findFirst: async () => null }),
  });
  await assert.rejects(
    () => svc.updateClientBankAccount('c1', 'a-outro', { agency: '9' }, actor),
    (e) => e.status === 404 && e.details?.code === 'CLIENT_BANK_ACCOUNT_NOT_FOUND'
  );
});

test('updateClientBankAccount: atualiza status (inativar)', async () => {
  const svc = new ClientBankAccountService({ prisma: fakePrisma() });
  const { account } = await svc.updateClientBankAccount('c1', 'a1', { status: 'inactive' }, actor);
  assert.equal(account.status, 'INACTIVE');
});

test('listClientBankAccounts: retorna items', async () => {
  const svc = new ClientBankAccountService({ prisma: fakePrisma() });
  const result = await svc.listClientBankAccounts('c1', actor);
  assert.ok(Array.isArray(result.items));
});
