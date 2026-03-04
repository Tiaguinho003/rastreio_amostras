import path from 'node:path';

import { LocalUploadService } from './local-upload-service.js';

export function createLocalUploadServiceFromEnv() {
  const configured = process.env.UPLOADS_DIR;
  const baseDir = configured && configured.length > 0 ? configured : path.resolve(process.cwd(), 'data/uploads');
  return new LocalUploadService({ baseDir });
}
