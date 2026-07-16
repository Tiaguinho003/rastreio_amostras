import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';

import { SampleCommandService } from '../src/samples/sample-command-service.js';
import { assertImageMagicBytes } from '../src/uploads/upload-policy.js';
import { HttpError } from '../src/contracts/errors.js';

// CAM-I1: as entradas temporarias da camera (detect-form e o Mode 1 legacy
// do extract-and-prepare) validam magic bytes ANTES de gravar o _temp e de
// chamar sharp/OpenAI. Antes so o confirm validava — buffer arbitrario
// passava batido e virava custo de IA.

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const NOT_AN_IMAGE = Buffer.from('definitivamente nao e uma imagem, e um txt');

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

// uploadService stub: o gate de magic bytes roda ANTES de qualquer escrita —
// se algo tentasse gravar, o baseDir de tmp evita poluir o repo e o teste
// falharia adiante de qualquer forma (denunciando a regressao de ordem).
const service = new SampleCommandService({
  eventService: null,
  queryService: null,
  uploadService: { baseDir: os.tmpdir() },
});

function assertUnsupportedType(promise) {
  return assert.rejects(promise, (error) => {
    assert.equal(error instanceof HttpError, true);
    assert.equal(error.status, 415);
    assert.match(error.message, /Unsupported file type/);
    return true;
  });
}

test('detectClassificationForm: buffer nao-imagem cai em 415 antes de gravar', async () => {
  await assertUnsupportedType(
    service.detectClassificationForm({ fileBuffer: NOT_AN_IMAGE }, buildActor())
  );
});

test('extractAndPrepareClassification (Mode 1): buffer nao-imagem cai em 415', async () => {
  await assertUnsupportedType(
    service.extractAndPrepareClassification({ fileBuffer: NOT_AN_IMAGE }, buildActor())
  );
});

test('assertImageMagicBytes: PNG real passa e retorna o mime detectado', async () => {
  assert.equal(await assertImageMagicBytes(ONE_BY_ONE_PNG), 'image/png');
});

test('assertImageMagicBytes: buffer vazio/lixo cai em 415', async () => {
  await assertUnsupportedType(assertImageMagicBytes(NOT_AN_IMAGE));
});
