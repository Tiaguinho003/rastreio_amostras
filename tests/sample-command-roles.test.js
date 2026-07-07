import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { HttpError } from '../src/contracts/errors.js';

// LOT-D2 (revisão geral): PROSPECTOR saiu de USER_ACTION_ROLES — o service é
// a SEGUNDA barreira de papel, além da allowlist central (resolveActorContext
// + prospector-access.js). Estes testes garantem que, mesmo que um método de
// sample entrasse na allowlist por engano, o command-service rejeitaria o
// PROSPECTOR com 403. O gate roda ANTES de qualquer dependência — por isso o
// service é construído com dependências nulas (se algo rodasse antes do gate,
// o teste falharia com outro erro, denunciando a regressão).

function buildActor(role) {
  return {
    actorType: 'USER',
    actorUserId: randomUUID(),
    role,
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };
}

const service = new SampleCommandService({ eventService: null, queryService: null });

function assertForbidden(promise) {
  return assert.rejects(promise, (error) => error instanceof HttpError && error.status === 403);
}

test('PROSPECTOR é rejeitado no service: createSample', async () => {
  await assertForbidden(service.createSample({}, buildActor('PROSPECTOR')));
});

test('PROSPECTOR é rejeitado no service: createBlend', async () => {
  await assertForbidden(service.createBlend({}, buildActor('PROSPECTOR')));
});

test('PROSPECTOR é rejeitado no service: invalidateSample', async () => {
  await assertForbidden(
    service.invalidateSample({ expectedVersion: 1 }, buildActor('PROSPECTOR'))
  );
});

test('papéis operacionais seguem passando pelo gate (falham DEPOIS, por dependência/validação)', async () => {
  // CADASTRO passa pelo gate de papel; a chamada quebra adiante (input
  // inválido/dep nula), NUNCA com 403 — prova que o gate não ficou largo
  // demais nem estreito demais.
  await assert.rejects(
    service.createSample({}, buildActor('CADASTRO')),
    (error) => !(error instanceof HttpError && error.status === 403)
  );
});
