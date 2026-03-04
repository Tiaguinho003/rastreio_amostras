import { createLocalAuthServiceFromEnv } from '../../auth/create-local-auth-service.js';
import { getPrismaClient } from '../../db/prisma-client.js';
import { createPrismaEventService } from '../../events/create-prisma-event-service.js';
import { SamplePdfReportService } from '../../reports/sample-pdf-report-service.js';
import { SampleCommandService } from '../../samples/sample-command-service.js';
import { SampleQueryService } from '../../samples/sample-query-service.js';
import { createLocalUploadServiceFromEnv } from '../../uploads/create-local-upload-service.js';
import { createBackendApiV1 } from './backend-api.js';

const BOOLEAN_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const BOOLEAN_FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function isProductionEnv() {
  return (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production';
}

function readBooleanEnv(name) {
  const raw = process.env[name];
  if (raw === undefined) {
    return null;
  }

  const normalized = String(raw).trim().toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (BOOLEAN_FALSE_VALUES.has(normalized)) {
    return false;
  }

  throw new Error(`${name} must be boolean (true/false/1/0/yes/no/on/off)`);
}

function resolveHeaderAuthFallbackEnabled() {
  const explicit = readBooleanEnv('AUTH_HEADER_FALLBACK_ENABLED');
  if (explicit !== null) {
    return explicit;
  }

  return !isProductionEnv();
}

function assertAuthSecretForProduction() {
  if (!isProductionEnv()) {
    return;
  }

  const secret = process.env.AUTH_SECRET;
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('AUTH_SECRET is required and must contain at least 16 characters in production');
  }
}

export function createBackendApiV1FromEnv() {
  assertAuthSecretForProduction();

  const prisma = getPrismaClient();
  const eventService = createPrismaEventService();
  const queryService = new SampleQueryService({ prisma });
  const uploadService = createLocalUploadServiceFromEnv();
  const commandService = new SampleCommandService({
    eventService,
    queryService,
    uploadService
  });
  const reportService = new SamplePdfReportService({
    queryService,
    commandService,
    uploadsBaseDir: uploadService.baseDir
  });

  let authService = null;
  if (process.env.AUTH_SECRET) {
    authService = createLocalAuthServiceFromEnv();
  }

  const headerAuthFallbackEnabled = resolveHeaderAuthFallbackEnabled();

  return createBackendApiV1({
    authService,
    commandService,
    queryService,
    reportService,
    headerAuthFallbackEnabled
  });
}
