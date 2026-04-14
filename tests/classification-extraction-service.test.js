import test from 'node:test';
import assert from 'node:assert/strict';

import { ClassificationExtractionService } from '../src/samples/classification-extraction-service.js';
import { HttpError } from '../src/contracts/errors.js';

function buildService() {
  return new ClassificationExtractionService({ apiKey: 'sk-test-fake' });
}

test('rejects null classificationType with HttpError 422', async () => {
  const service = buildService();

  await assert.rejects(
    () => service.extractClassificationFromPhoto('/tmp/nao-usado.jpg', null),
    (error) => {
      assert.equal(error instanceof HttpError, true);
      assert.equal(error.status, 422);
      assert.equal(error.code, 'UNSUPPORTED_TYPE');
      assert.match(error.message, /Tipo de classificacao nao suportado/);
      assert.match(error.message, /nao informado/);
      return true;
    }
  );
});

test('rejects undefined classificationType with HttpError 422', async () => {
  const service = buildService();

  await assert.rejects(
    () => service.extractClassificationFromPhoto('/tmp/nao-usado.jpg', undefined),
    (error) => {
      assert.equal(error instanceof HttpError, true);
      assert.equal(error.status, 422);
      return true;
    }
  );
});

test('rejects unknown classificationType string with HttpError 422', async () => {
  const service = buildService();

  await assert.rejects(
    () => service.extractClassificationFromPhoto('/tmp/nao-usado.jpg', 'NAO_EXISTE'),
    (error) => {
      assert.equal(error instanceof HttpError, true);
      assert.equal(error.status, 422);
      assert.match(error.message, /NAO_EXISTE/);
      return true;
    }
  );
});
