import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';

import { HttpError } from '../contracts/errors.js';
import { assertAcceptedUploadSize, DEFAULT_MAX_UPLOAD_SIZE_BYTES } from './upload-policy.js';

const ATTACHMENT_KIND_TO_FOLDER = {
  CLASSIFICATION_PHOTO: 'classification',
};

function sanitizeFileName(fileName) {
  const normalized = typeof fileName === 'string' && fileName.length > 0 ? fileName : 'photo.bin';
  return normalized.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export class LocalUploadService {
  constructor({ baseDir, maxUploadSizeBytes = DEFAULT_MAX_UPLOAD_SIZE_BYTES }) {
    if (typeof baseDir !== 'string' || baseDir.length === 0) {
      throw new Error('LocalUploadService requires baseDir');
    }

    if (!Number.isInteger(maxUploadSizeBytes) || maxUploadSizeBytes <= 0) {
      throw new Error('LocalUploadService requires a positive maxUploadSizeBytes');
    }

    this.baseDir = baseDir;
    this.maxUploadSizeBytes = maxUploadSizeBytes;
  }

  async saveSamplePhoto({ sampleId, kind, buffer, mimeType = null, originalFileName = null }) {
    if (!sampleId || typeof sampleId !== 'string') {
      throw new HttpError(422, 'sampleId is required for photo upload');
    }

    if (!ATTACHMENT_KIND_TO_FOLDER[kind]) {
      throw new HttpError(422, 'photo kind is invalid');
    }

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new HttpError(422, 'file buffer is required');
    }

    assertAcceptedUploadSize(buffer.length, {
      limitBytes: this.maxUploadSizeBytes,
      fieldLabel: 'Uploaded image',
    });

    const attachmentId = randomUUID();
    const safeName = sanitizeFileName(originalFileName);
    const relativePath = path.join(
      'samples',
      sampleId,
      ATTACHMENT_KIND_TO_FOLDER[kind],
      `${attachmentId}-${safeName}`
    );
    const absolutePath = path.join(this.baseDir, relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);

    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');

    return {
      attachmentId,
      storagePath: relativePath,
      fileName: safeName,
      mimeType,
      sizeBytes: buffer.length,
      checksumSha256,
    };
  }

  async deleteByStoragePath(storagePath) {
    if (!storagePath) {
      return;
    }

    const absolutePath = path.join(this.baseDir, storagePath);
    await fs.rm(absolutePath, { force: true });
  }
}
