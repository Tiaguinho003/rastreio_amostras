import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeBankStatus,
  normalizeCompeCode,
  normalizeCreateBankInput,
  normalizeUpdateBankInput,
  toBankView,
} from '../src/banks/bank-support.js';
import { BankService } from '../src/banks/bank-service.js';

const adminActor = { actorUserId: 'u1', role: 'ADMIN', requestId: 'r1' };
const commercialActor = { actorUserId: 'u2', role: 'COMMERCIAL', requestId: 'r2' };

// ---------------------------------------------------------------------------
// bank-support: normalizacao pura (sem DB)
// ---------------------------------------------------------------------------

test('normalizeCompeCode: zero-pad e remove nao-digitos', () => {
  assert.equal(normalizeCompeCode('1'), '001');
  assert.equal(normalizeCompeCode('41'), '041');
  assert.equal(normalizeCompeCode('341'), '341');
  assert.equal(normalizeCompeCode(237), '237');
  assert.equal(normalizeCompeCode('2-3-7'), '237');
});

test('normalizeCompeCode: rejeita vazio e mais de 3 digitos', () => {
  assert.throws(() => normalizeCompeCode(''), /compeCode/);
  assert.throws(() => normalizeCompeCode('1234'), /1 to 3 digits/);
  assert.throws(() => normalizeCompeCode(null), /compeCode/);
});

test('normalizeCreateBankInput: nome obrigatorio + compe normalizado', () => {
  assert.deepEqual(normalizeCreateBankInput({ name: '  Banco do Brasil  ', compeCode: '1' }), {
    name: 'Banco do Brasil',
    compeCode: '001',
  });
  assert.throws(() => normalizeCreateBankInput({ compeCode: '1' }), /name is required/);
});

test('normalizeBankStatus: case-insensitive; rejeita invalido', () => {
  assert.equal(normalizeBankStatus('active'), 'ACTIVE');
  assert.equal(normalizeBankStatus('INACTIVE'), 'INACTIVE');
  assert.throws(() => normalizeBankStatus('FOO'), /must be one of/);
});

test('normalizeUpdateBankInput: parcial; rejeita payload vazio', () => {
  assert.deepEqual(normalizeUpdateBankInput({ name: 'Itau' }), { name: 'Itau' });
  assert.deepEqual(normalizeUpdateBankInput({ status: 'inactive' }), { status: 'INACTIVE' });
  assert.throws(() => normalizeUpdateBankInput({}), /no fields to update/);
});

test('toBankView: shape estavel com datas em ISO', () => {
  const now = new Date('2026-06-26T12:00:00.000Z');
  assert.deepEqual(
    toBankView({
      id: 'b1',
      name: 'BB',
      compeCode: '001',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    }),
    {
      id: 'b1',
      name: 'BB',
      compeCode: '001',
      status: 'ACTIVE',
      createdAt: '2026-06-26T12:00:00.000Z',
      updatedAt: '2026-06-26T12:00:00.000Z',
    }
  );
});

// ---------------------------------------------------------------------------
// BankService: role gating + mapeamento de erro (prisma fake, sem DB)
// ---------------------------------------------------------------------------

function fakePrisma(overrides = {}) {
  return {
    bank: {
      create:
        overrides.create ??
        (async ({ data }) => ({
          id: data.id,
          name: data.name,
          compeCode: data.compeCode,
          status: 'ACTIVE',
          createdAt: new Date(0),
          updatedAt: new Date(0),
        })),
      update:
        overrides.update ??
        (async ({ where, data }) => ({
          id: where.id,
          name: data.name ?? 'X',
          compeCode: data.compeCode ?? '001',
          status: data.status ?? 'ACTIVE',
          createdAt: new Date(0),
          updatedAt: new Date(0),
        })),
      findMany: overrides.findMany ?? (async () => []),
    },
  };
}

test('createBank: ADMIN cria e retorna a view', async () => {
  const svc = new BankService({ prisma: fakePrisma() });
  const { bank } = await svc.createBank({ name: 'Itau', compeCode: '341' }, adminActor);
  assert.equal(bank.name, 'Itau');
  assert.equal(bank.compeCode, '341');
  assert.equal(bank.status, 'ACTIVE');
});

test('createBank: qualquer usuario autenticado cria (ex.: COMMERCIAL)', async () => {
  const svc = new BankService({ prisma: fakePrisma() });
  const { bank } = await svc.createBank({ name: 'X', compeCode: '1' }, commercialActor);
  assert.equal(bank.compeCode, '001');
});

test('createBank: sem autenticacao vira 401', async () => {
  const svc = new BankService({ prisma: fakePrisma() });
  await assert.rejects(
    () => svc.createBank({ name: 'X', compeCode: '1' }, {}),
    (e) => e.status === 401
  );
});

test('createBank: compeCode duplicado vira 409 com field', async () => {
  const svc = new BankService({
    prisma: fakePrisma({
      create: async () => {
        throw { code: 'P2002' };
      },
    }),
  });
  await assert.rejects(
    () => svc.createBank({ name: 'X', compeCode: '1' }, adminActor),
    (e) =>
      e.status === 409 &&
      e.details?.code === 'BANK_COMPE_CODE_ALREADY_EXISTS' &&
      e.details?.field === 'compeCode'
  );
});

test('updateBank: banco inexistente vira 404', async () => {
  const svc = new BankService({
    prisma: fakePrisma({
      update: async () => {
        throw { code: 'P2025' };
      },
    }),
  });
  await assert.rejects(
    () => svc.updateBank('nope', { name: 'X' }, adminActor),
    (e) => e.status === 404 && e.details?.code === 'BANK_NOT_FOUND'
  );
});

test('listBanks: exige usuario autenticado', async () => {
  const svc = new BankService({ prisma: fakePrisma() });
  await assert.rejects(
    () => svc.listBanks({}, {}),
    (e) => e.status === 401
  );
});
