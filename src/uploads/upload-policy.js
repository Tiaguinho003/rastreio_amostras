import { fileTypeFromBuffer } from 'file-type';

import { HttpError } from '../contracts/errors.js';

export const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 12 * 1024 * 1024;

export const ACCEPTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Magic bytes — NUNCA confiar no Content-Type declarado pelo cliente
// (regra 5 do CLAUDE.md). Compartilhado entre os uploads definitivos
// (saveSamplePhoto, saveContractShipmentPhoto) e as entradas temporarias
// da camera (detect-form / extract-and-prepare, CAM-I1), que antes
// gravavam buffer arbitrario no _temp e o mandavam pro sharp + OpenAI.
export async function assertImageMagicBytes(buffer) {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ACCEPTED_IMAGE_MIME_TYPES.has(detected.mime)) {
    throw new HttpError(415, 'Unsupported file type. Only JPEG, PNG and WebP images are accepted');
  }
  return detected.mime;
}

function formatUploadLimit(bytes) {
  const mebibytes = bytes / (1024 * 1024);
  return Number.isInteger(mebibytes) ? `${mebibytes} MiB` : `${mebibytes.toFixed(2)} MiB`;
}

export function resolveMaxUploadSizeBytes(rawValue = process.env.MAX_UPLOAD_SIZE_BYTES) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return DEFAULT_MAX_UPLOAD_SIZE_BYTES;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('MAX_UPLOAD_SIZE_BYTES must be a positive integer');
  }

  return parsed;
}

export function assertAcceptedUploadSize(
  sizeBytes,
  { limitBytes = resolveMaxUploadSizeBytes(), fieldLabel = 'Uploaded image' } = {}
) {
  if (!Number.isInteger(sizeBytes) || sizeBytes < 0) {
    throw new HttpError(422, `${fieldLabel} size is invalid`);
  }

  if (sizeBytes <= limitBytes) {
    return;
  }

  throw new HttpError(
    413,
    `${fieldLabel} exceeds the maximum upload size of ${formatUploadLimit(limitBytes)}`,
    {
      maxUploadSizeBytes: limitBytes,
      receivedSizeBytes: sizeBytes,
    }
  );
}
