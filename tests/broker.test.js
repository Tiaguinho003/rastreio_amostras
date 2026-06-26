import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeBrokerCpf,
  normalizeBrokerStatus,
  normalizeCreateBrokerInput,
  normalizeUpdateBrokerInput,
  toBrokerView,
} from '../src/brokers/broker-support.js';
import { BrokerService } from '../src/brokers/broker-service.js';

const adminActor = { actorUserId: 'u1', role: 'ADMIN', requestId: 'r1' };
const commercialActor = { actorUserId: 'u2', role: 'COMMERCIAL', requestId: 'r2' };

// ---------------------------------------------------------------------------
// broker-support: normalizacao pura (sem DB)
// ---------------------------------------------------------------------------

test('normalizeBrokerCpf: opcional; 11 digitos; limpa mascara', () => {
  assert.equal(normalizeBrokerCpf(undefined), null);
  assert.equal(normalizeBrokerCpf(''), null);
  assert.equal(normalizeBrokerCpf('123.456.789-00'), '12345678900');
  assert.throws(() => normalizeBrokerCpf('123'), /11 digits/);
});

test('normalizeCreateBrokerInput: nome obrigatorio; contatos opcionais; email lowercase', () => {
  assert.deepEqual(normalizeCreateBrokerInput({ name: '  Joao  ', email: 'A@B.COM' }), {
    name: 'Joao',
    userId: null,
    cpf: null,
    phone: null,
    email: 'a@b.com',
  });
  assert.throws(() => normalizeCreateBrokerInput({ email: 'x@y.com' }), /name is required/);
});

test('normalizeBrokerStatus: case-insensitive; rejeita invalido', () => {
  assert.equal(normalizeBrokerStatus('active'), 'ACTIVE');
  assert.throws(() => normalizeBrokerStatus('FOO'), /must be one of/);
});

test('normalizeUpdateBrokerInput: parcial; rejeita payload vazio', () => {
  assert.deepEqual(normalizeUpdateBrokerInput({ phone: '99999' }), { phone: '99999' });
  assert.deepEqual(normalizeUpdateBrokerInput({ userId: '' }), { userId: null });
  assert.throws(() => normalizeUpdateBrokerInput({}), /no fields to update/);
});

test('toBrokerView: inclui user resumido quando vinculado', () => {
  const now = new Date('2026-06-26T12:00:00.000Z');
  const view = toBrokerView({
    id: 'b1',
    name: 'Joao',
    userId: 'u9',
    cpf: null,
    phone: null,
    email: null,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    user: { id: 'u9', fullName: 'Joao Silva', username: 'joao' },
  });
  assert.deepEqual(view.user, { id: 'u9', fullName: 'Joao Silva', username: 'joao' });
  assert.equal(view.createdAt, '2026-06-26T12:00:00.000Z');
});

// ---------------------------------------------------------------------------
// BrokerService: role gating + FK de usuario + uniques (prisma fake, sem DB)
// ---------------------------------------------------------------------------

function fakePrisma(overrides = {}) {
  return {
    user: {
      findUnique: overrides.userFindUnique ?? (async () => ({ id: 'u9' })),
    },
    broker: {
      create:
        overrides.create ??
        (async ({ data }) => ({
          id: data.id,
          name: data.name,
          userId: data.userId ?? null,
          cpf: data.cpf ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          status: 'ACTIVE',
          createdAt: new Date(0),
          updatedAt: new Date(0),
          user: null,
        })),
      update:
        overrides.update ??
        (async ({ where, data }) => ({
          id: where.id,
          name: data.name ?? 'X',
          userId: data.userId ?? null,
          cpf: data.cpf ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          status: data.status ?? 'ACTIVE',
          createdAt: new Date(0),
          updatedAt: new Date(0),
          user: null,
        })),
      findMany: overrides.findMany ?? (async () => []),
    },
  };
}

test('createBroker: ADMIN cria corretor externo (sem userId)', async () => {
  const svc = new BrokerService({ prisma: fakePrisma() });
  const { broker } = await svc.createBroker({ name: 'Maria', cpf: '12345678900' }, adminActor);
  assert.equal(broker.name, 'Maria');
  assert.equal(broker.cpf, '12345678900');
});

test('createBroker: qualquer usuario autenticado cria (ex.: COMMERCIAL)', async () => {
  const svc = new BrokerService({ prisma: fakePrisma() });
  const { broker } = await svc.createBroker({ name: 'Maria' }, commercialActor);
  assert.equal(broker.name, 'Maria');
});

test('createBroker: sem autenticacao vira 401', async () => {
  const svc = new BrokerService({ prisma: fakePrisma() });
  await assert.rejects(
    () => svc.createBroker({ name: 'X' }, {}),
    (e) => e.status === 401
  );
});

test('createBroker: userId inexistente vira 422', async () => {
  const svc = new BrokerService({ prisma: fakePrisma({ userFindUnique: async () => null }) });
  await assert.rejects(
    () => svc.createBroker({ name: 'X', userId: 'ghost' }, adminActor),
    (e) => e.status === 422 && e.details?.code === 'BROKER_USER_NOT_FOUND'
  );
});

test('createBroker: userId duplicado vira 409 (BROKER_USER_ALREADY_LINKED)', async () => {
  const svc = new BrokerService({
    prisma: fakePrisma({
      create: async () => {
        throw { code: 'P2002', meta: { target: ['user_id'] } };
      },
    }),
  });
  await assert.rejects(
    () => svc.createBroker({ name: 'X', userId: 'u9' }, adminActor),
    (e) => e.status === 409 && e.details?.code === 'BROKER_USER_ALREADY_LINKED'
  );
});

test('createBroker: cpf duplicado vira 409 (BROKER_CPF_ALREADY_EXISTS)', async () => {
  const svc = new BrokerService({
    prisma: fakePrisma({
      create: async () => {
        throw { code: 'P2002', meta: { target: ['cpf'] } };
      },
    }),
  });
  await assert.rejects(
    () => svc.createBroker({ name: 'X', cpf: '12345678900' }, adminActor),
    (e) => e.status === 409 && e.details?.code === 'BROKER_CPF_ALREADY_EXISTS'
  );
});

test('updateBroker: inexistente vira 404', async () => {
  const svc = new BrokerService({
    prisma: fakePrisma({
      update: async () => {
        throw { code: 'P2025' };
      },
    }),
  });
  await assert.rejects(
    () => svc.updateBroker('nope', { name: 'X' }, adminActor),
    (e) => e.status === 404 && e.details?.code === 'BROKER_NOT_FOUND'
  );
});

test('listBrokers: exige usuario autenticado', async () => {
  const svc = new BrokerService({ prisma: fakePrisma() });
  await assert.rejects(
    () => svc.listBrokers({}, {}),
    (e) => e.status === 401
  );
});
