import { DatabaseAuthService } from '../../auth/database-auth-service.js';
import { getPrismaClient } from '../../db/prisma-client.js';
import { createAppEmailServiceFromEnv } from '../../email/create-email-service.js';
import { createPrismaEventService } from '../../events/create-prisma-event-service.js';
import { SamplePdfReportService } from '../../reports/sample-pdf-report-service.js';
import { SampleCommandService } from '../../samples/sample-command-service.js';
import { SampleQueryService } from '../../samples/sample-query-service.js';
import { createLocalUploadServiceFromEnv } from '../../uploads/create-local-upload-service.js';
import { UserService } from '../../users/user-service.js';
import { ClientService } from '../../clients/client-service.js';
import { WarehouseService } from '../../warehouses/warehouse-service.js';
import { createBackendApiV1 } from './backend-api.js';

function isProductionEnv() {
  return (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production';
}

function assertAuthSecretForProduction() {
  const secret = process.env.AUTH_SECRET;
  if (typeof secret !== 'string' || secret.length < 16) {
    if (!isProductionEnv()) {
      throw new Error('AUTH_SECRET is required and must contain at least 16 characters');
    }

    throw new Error('AUTH_SECRET is required and must contain at least 16 characters in production');
  }

  return secret;
}

export function createBackendApiV1FromEnv() {
  const secret = assertAuthSecretForProduction();

  const prisma = getPrismaClient();
  const eventService = createPrismaEventService();
  const queryService = new SampleQueryService({ prisma });
  const uploadService = createLocalUploadServiceFromEnv();
  const emailService = createAppEmailServiceFromEnv();
  const userService = new UserService({
    prisma,
    emailService
  });
  const clientService = new ClientService({
    prisma
  });
  const warehouseService = new WarehouseService({
    prisma
  });
  const commandService = new SampleCommandService({
    eventService,
    queryService,
    uploadService,
    clientService,
    warehouseService
  });
  const reportService = new SamplePdfReportService({
    queryService,
    commandService,
    uploadsBaseDir: uploadService.baseDir
  });
  const authService = new DatabaseAuthService({
    prisma,
    secret,
    userService
  });

  return createBackendApiV1({
    authService,
    userService,
    clientService,
    warehouseService,
    commandService,
    queryService,
    reportService
  });
}
