import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { LocalUploadService } from '../src/uploads/local-upload-service.js';
import { HttpError } from '../src/contracts/errors.js';
import {
  DEFAULT_MAX_UPLOAD_SIZE_BYTES,
  resolveMaxUploadSizeBytes,
} from '../src/uploads/upload-policy.js';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8f5i8AAAAASUVORK5CYII=',
  'base64'
);

test('resolveMaxUploadSizeBytes defaults to 8 MiB and rejects invalid values', () => {
  assert.equal(resolveMaxUploadSizeBytes(undefined), DEFAULT_MAX_UPLOAD_SIZE_BYTES);
  assert.equal(resolveMaxUploadSizeBytes('8388608'), 8 * 1024 * 1024);
  assert.throws(
    () => resolveMaxUploadSizeBytes('0'),
    /MAX_UPLOAD_SIZE_BYTES must be a positive integer/
  );
});

test('LocalUploadService saves files below the configured limit', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-service-ok-'));
  const service = new LocalUploadService({ baseDir, maxUploadSizeBytes: 4096 });

  try {
    const saved = await service.saveSamplePhoto({
      sampleId: 'sample-1',
      kind: 'CLASSIFICATION_PHOTO',
      buffer: TINY_PNG,
      mimeType: 'image/jpeg',
      originalFileName: 'small.png',
    });

    assert.equal(saved.sizeBytes, TINY_PNG.length);
    assert.equal(saved.mimeType, 'image/png');
    assert.match(saved.storagePath, /^samples[\\/]+sample-1[\\/]+classification[\\/]/);

    const absolutePath = path.join(baseDir, saved.storagePath);
    const bytes = await fs.readFile(absolutePath);
    assert.equal(bytes.length, TINY_PNG.length);
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
});

test('LocalUploadService rejects files above the configured limit before writing to disk', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-service-too-large-'));
  const service = new LocalUploadService({ baseDir, maxUploadSizeBytes: 8 });

  try {
    await assert.rejects(
      service.saveSamplePhoto({
        sampleId: 'sample-2',
        kind: 'CLASSIFICATION_PHOTO',
        buffer: TINY_PNG,
        mimeType: 'image/png',
        originalFileName: 'large.png',
      }),
      (error) => {
        assert.equal(error?.status, 413);
        assert.match(error?.message ?? '', /maximum upload size of/);
        return true;
      }
    );

    const sampleDir = path.join(baseDir, 'samples', 'sample-2');
    await assert.rejects(fs.access(sampleDir));
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
});

test('LocalUploadService rejects non-image binary with 415', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-service-bad-type-'));
  const service = new LocalUploadService({ baseDir, maxUploadSizeBytes: 4096 });

  try {
    await assert.rejects(
      service.saveSamplePhoto({
        sampleId: 'sample-3',
        kind: 'CLASSIFICATION_PHOTO',
        buffer: Buffer.from('not a real image just random bytes'),
        mimeType: 'image/jpeg',
        originalFileName: 'fake.jpg',
      }),
      (error) => {
        assert.equal(error instanceof HttpError, true);
        assert.equal(error.status, 415);
        assert.match(error.message, /Unsupported file type/);
        return true;
      }
    );
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
});
