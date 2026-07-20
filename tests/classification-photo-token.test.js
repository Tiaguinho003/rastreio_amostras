import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';

import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { HttpError } from '../src/contracts/errors.js';

// EXT (ciclo da extracao, rodada 1): photoToken vira segmento de nome de
// arquivo em _temp/ — sem validacao de formato, um token com ../ leria
// qualquer .jpg do filesystem no extract (Mode 2) e o anexaria a amostra no
// confirm. O formato UUID (randomUUID do detect) e obrigatorio nos dois
// pontos de entrada.

function buildActor(role = 'ADMIN') {
  return {
    actorType: 'USER',
    actorUserId: '00000000-0000-4000-8000-000000000001',
    role,
    source: 'web',
    ip: '127.0.0.1',
    userAgent: 'node-test',
  };
}

const service = new SampleCommandService({
  eventService: null,
  queryService: null,
  uploadService: { baseDir: os.tmpdir() },
});

const TRAVERSAL_TOKENS = [
  '../../../../etc/passwd',
  'x/../../segredo',
  'a/b',
  'temp-injetado',
  '00000000-0000-4000-8000-00000000000g',
];

function assertInvalidToken(promise) {
  return assert.rejects(promise, (error) => {
    assert.equal(error instanceof HttpError, true);
    assert.equal(error.status, 422);
    assert.match(error.message, /photoToken/);
    return true;
  });
}

test('extractAndPrepareClassification (Mode 2): token fora do formato UUID cai em 422', async () => {
  for (const token of TRAVERSAL_TOKENS) {
    await assertInvalidToken(
      service.extractAndPrepareClassification({ photoToken: token }, buildActor())
    );
  }
});

test('confirmClassificationFromCamera: token fora do formato UUID cai em 422', async () => {
  for (const token of TRAVERSAL_TOKENS) {
    await assertInvalidToken(
      service.confirmClassificationFromCamera(
        {
          sampleId: '00000000-0000-4000-8000-000000000002',
          photoToken: token,
        },
        buildActor()
      )
    );
  }
});

test('extractAndPrepareClassification (Mode 2): UUID valido sem temp preserva o 404', async () => {
  await assert.rejects(
    service.extractAndPrepareClassification(
      { photoToken: '00000000-0000-4000-8000-0000000000aa' },
      buildActor()
    ),
    (error) => {
      assert.equal(error instanceof HttpError, true);
      assert.equal(error.status, 404);
      return true;
    }
  );
});

test('extractAndPrepareClassification (Mode 2): UUID em caixa alta e aceito (normaliza pra minusculo)', async () => {
  // 404 (temp inexistente), e nao 422 — prova que o formato foi aceito.
  await assert.rejects(
    service.extractAndPrepareClassification(
      { photoToken: '00000000-0000-4000-8000-0000000000AA' },
      buildActor()
    ),
    (error) => {
      assert.equal(error instanceof HttpError, true);
      assert.equal(error.status, 404);
      return true;
    }
  );
});
