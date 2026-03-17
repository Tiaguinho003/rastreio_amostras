import path from 'node:path';

import { LocalUploadService } from './local-upload-service.js';
import { resolveMaxUploadSizeBytes } from './upload-policy.js';

export function createLocalUploadServiceFromEnv() {
  const configured = process.env.UPLOADS_DIR;
  const baseDir = configured && configured.length > 0 ? configured : path.resolve(process.cwd(), 'data/uploads');
  const maxUploadSizeBytes = resolveMaxUploadSizeBytes();
  return new LocalUploadService({ baseDir, maxUploadSizeBytes });
}
