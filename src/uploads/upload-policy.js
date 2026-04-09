import { HttpError } from '../contracts/errors.js';

export const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;

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
