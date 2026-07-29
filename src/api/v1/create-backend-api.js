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
import { BrokerService } from '../../brokers/broker-service.js';
import { ClientBankAccountService } from '../../clients/client-bank-account-service.js';
import { ClientAttachmentService } from '../../clients/client-attachment-service.js';
import { SaleContractService } from '../../sale-contracts/sale-contract-service.js';
import { SaleContractPdfService } from '../../sale-contracts/sale-contract-pdf-service.js';
import { VisitReportService } from '../../visits/visit-report-service.js';
import { createPushServiceFromEnv } from '../../push/create-push-service.js';
import { ClassificationExtractionService } from '../../samples/classification-extraction-service.js';
import { FormDetectionService } from '../../samples/form-detection-service.js';
import { createBackendApiV1 } from './backend-api.js';
import { IdempotencyStore } from './idempotency-helper.js';

function isProductionEnv() {
  return (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production';
}

function assertAuthSecretForProduction() {
  const secret = process.env.AUTH_SECRET;
  if (typeof secret !== 'string' || secret.length < 16) {
    if (!isProductionEnv()) {
      throw new Error('AUTH_SECRET is required and must contain at least 16 characters');
    }

    throw new Error(
      'AUTH_SECRET is required and must contain at least 16 characters in production'
    );
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
  const clientService = new ClientService({
    prisma,
  });
  const brokerService = new BrokerService({ prisma });
  const clientBankAccountService = new ClientBankAccountService({ prisma });
  const clientAttachmentService = new ClientAttachmentService({ prisma, uploadService });
  const userService = new UserService({
    prisma,
    emailService,
    clientService,
  });
  const pushService = createPushServiceFromEnv({ prisma });
  if (!pushService) {
    console.warn('[push] PUSH_VAPID_* not configured — push notifications disabled');
  }
  // Servico unico de Relatorios (visita unificada + semanal + feed) desde a
  // unificacao 2026-07-15 (o antigo CommercialFormsService foi absorvido).
  const visitReportService = new VisitReportService({ prisma });
  const openaiApiKey = (process.env.OPENAI_API_KEY ?? '').trim() || null;
  const extractionService = openaiApiKey
    ? new ClassificationExtractionService({ apiKey: openaiApiKey })
    : null;
  if (!extractionService) {
    console.warn('[extraction] OPENAI_API_KEY not configured — classification extraction disabled');
  }
  const formDetectionService = new FormDetectionService();
  const commandService = new SampleCommandService({
    eventService,
    queryService,
    uploadService,
    clientService,
    extractionService,
    formDetectionService,
    userService,
  });
  // Fechamento (Fase B.2 Passo 2): instanciado APOS o commandService — usa-o
  // (+ queryService) no D48 (sincronizar o vendedor do contrato com a amostra).
  const saleContractService = new SaleContractService({ prisma, commandService, queryService });
  const saleContractPdfService = new SaleContractPdfService();
  const reportService = new SamplePdfReportService({
    queryService,
    commandService,
    uploadsBaseDir: uploadService.baseDir,
  });
  const authService = new DatabaseAuthService({
    prisma,
    secret,
    userService,
  });

  const idempotencyStore = new IdempotencyStore({ prisma });

  return createBackendApiV1({
    authService,
    userService,
    clientService,
    brokerService,
    clientBankAccountService,
    clientAttachmentService,
    saleContractService,
    saleContractPdfService,
    visitReportService,
    pushService,
    commandService,
    queryService,
    reportService,
    idempotencyStore,
  });
}
