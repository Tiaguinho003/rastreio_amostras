import { randomUUID } from 'node:crypto';

import { HttpError } from '../../contracts/errors.js';
import { readSessionTokenFromCookieHeader } from '../../auth/session-cookie.js';
import { createRateLimiter } from '../../auth/rate-limiter.js';
import { executeApi, readPositiveInteger } from '../http-utils.js';

const loginRateLimiter = createRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 10,
});

function readHeader(headers, key) {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const exact = headers[key];
  if (exact !== undefined) {
    return exact;
  }

  const lowerKey = key.toLowerCase();
  const normalized = Object.entries(headers).find(
    ([candidate]) => candidate.toLowerCase() === lowerKey
  );
  return normalized?.[1];
}

function readRequestBody(input) {
  return input?.body ?? {};
}

function buildRequestContext(input) {
  const headers = input?.headers ?? {};
  return {
    requestId: readHeader(headers, 'x-request-id') ?? randomUUID(),
    correlationId: readHeader(headers, 'x-correlation-id') ?? null,
    userAgent: readHeader(headers, 'user-agent') ?? null,
    ip: readHeader(headers, 'x-forwarded-for') ?? null,
    source: String(readHeader(headers, 'x-source') ?? 'web').toLowerCase(),
  };
}

async function resolveActorContext(input, authService, { allowPending = false } = {}) {
  if (!authService) {
    throw new HttpError(501, 'Auth service is not configured');
  }

  const requestContext = buildRequestContext(input);
  const headers = input?.headers ?? {};
  const cookieToken = readSessionTokenFromCookieHeader(readHeader(headers, 'cookie'));
  const authorization =
    readHeader(headers, 'authorization') ?? (cookieToken ? `Bearer ${cookieToken}` : null);
  if (!authorization) {
    throw new HttpError(401, 'Authentication required', {
      code: 'AUTH_REQUIRED',
    });
  }

  const actor = await authService.authenticateAuthorizationHeader(authorization, requestContext);

  if (!allowPending && actor.initialPasswordDecision === 'PENDING') {
    throw new HttpError(403, 'Troca de senha obrigatoria antes de continuar', {
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }

  return {
    ...actor,
    ...requestContext,
  };
}

function requireSampleId(params) {
  const sampleId = params?.sampleId;
  if (typeof sampleId !== 'string' || sampleId.length === 0) {
    throw new HttpError(422, 'sampleId path param is required');
  }
  return sampleId;
}

function readOptionalQueryString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function assignIfDefined(target, key, value) {
  if (value !== undefined) {
    target[key] = value;
  }

  return target;
}

function readPageQuery(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = readPositiveInteger(value, 1, 'page');
  if (parsed < 1) {
    throw new HttpError(422, 'page must be an integer greater than or equal to 1');
  }

  return parsed;
}

function executeApiForInput(input, handler) {
  const requestId = readHeader(input?.headers ?? {}, 'x-request-id') ?? null;
  return executeApi(handler, { requestId });
}

export function createBackendApiV1({
  authService = null,
  userService = null,
  clientService = null,
  commandService,
  queryService,
  reportService = null,
}) {
  return {
    health: () =>
      executeApi(async () => ({
        status: 200,
        body: {
          status: 'ok',
          timestamp: new Date().toISOString(),
        },
      })),

    login: (input) =>
      executeApiForInput(input, async () => {
        if (!authService) {
          throw new HttpError(501, 'Auth service is not configured');
        }

        const ip = readHeader(input?.headers ?? {}, 'x-forwarded-for') ?? null;
        loginRateLimiter.check(ip);

        const body = readRequestBody(input);
        const result = await authService.login(
          {
            username: body.username,
            password: body.password,
          },
          buildRequestContext(input)
        );

        return {
          status: 200,
          body: result,
        };
      }),

    getSession: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService, { allowPending: true });
        const currentUser = await userService.getMe(actor);

        return {
          status: 200,
          body: {
            sessionId: actor.sessionId,
            expiresAt: actor.sessionExpiresAt,
            user: {
              id: currentUser.user.id,
              username: currentUser.user.username,
              email: currentUser.user.email,
              fullName: currentUser.user.fullName,
              displayName: currentUser.user.fullName,
              role: currentUser.user.role,
              status: currentUser.user.status,
              initialPasswordDecision: currentUser.user.initialPasswordDecision,
              pendingEmailChange: currentUser.user.pendingEmailChange,
            },
          },
        };
      }),

    receiveSample: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await commandService.receiveSample(body, actor);
        return { status: result.statusCode, body: result };
      }),

    bulkCreateLegacySkeletons: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await commandService.bulkCreateLegacySkeletons(body, actor);
        return { status: 200, body: result };
      }),

    createSampleAndPreparePrint: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);

        const result = await commandService.createSampleAndPreparePrint(
          {
            clientDraftId: body.clientDraftId,
            owner: body.owner,
            ownerClientId: body.ownerClientId,
            ownerBranchId: body.ownerBranchId,
            sacks: body.sacks,
            harvest: body.harvest,
            originLot: body.originLot,
            receivedChannel: body.receivedChannel,
            notes: body.notes ?? null,
            printerId: body.printerId ?? null,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    startRegistration: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);
        const result = await commandService.startRegistration(
          {
            sampleId,
            notes: body.notes ?? null,
            expectedVersion: body.expectedVersion,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    addLabelPhoto: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        let fileBuffer = null;
        if (Buffer.isBuffer(body.fileBuffer)) {
          fileBuffer = body.fileBuffer;
        } else if (typeof body.fileBase64 === 'string' && body.fileBase64.length > 0) {
          fileBuffer = Buffer.from(body.fileBase64, 'base64');
        }

        const result = await commandService.addSamplePhoto(
          {
            sampleId,
            kind: 'CLASSIFICATION_PHOTO',
            fileBuffer,
            mimeType: body.mimeType ?? null,
            originalFileName: body.originalFileName ?? null,
            replaceExisting: body.replaceExisting,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    confirmRegistration: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.confirmRegistration(
          {
            sampleId,
            expectedVersion: body.expectedVersion,
            sampleLotNumber: body.sampleLotNumber,
            declared: body.declared,
            ownerClientId: body.ownerClientId,
            ownerBranchId: body.ownerBranchId,
            idempotencyKey: body.idempotencyKey,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    requestQrPrint: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.requestQrPrint(
          {
            sampleId,
            expectedVersion: body.expectedVersion,
            attemptNumber: body.attemptNumber,
            printerId: body.printerId ?? null,
            idempotencyKey: body.idempotencyKey,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    requestQrReprint: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.requestQrReprint(
          {
            sampleId,
            attemptNumber: body.attemptNumber,
            printerId: body.printerId ?? null,
            reasonText: body.reasonText ?? null,
            idempotencyKey: body.idempotencyKey,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    recordQrPrintFailed: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.recordQrPrintFailed(
          {
            sampleId,
            printAction: body.printAction ?? 'PRINT',
            attemptNumber: body.attemptNumber,
            printerId: body.printerId ?? null,
            error: body.error,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    recordQrPrinted: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.recordQrPrinted(
          {
            sampleId,
            expectedVersion: body.expectedVersion,
            printAction: body.printAction ?? 'PRINT',
            attemptNumber: body.attemptNumber,
            printerId: body.printerId ?? null,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    startClassification: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.startClassification(
          {
            sampleId,
            expectedVersion: body.expectedVersion,
            classificationId: body.classificationId ?? null,
            notes: body.notes ?? null,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    saveClassificationPartial: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.saveClassificationPartial(
          {
            sampleId,
            expectedVersion: body.expectedVersion,
            snapshotPartial: body.snapshotPartial,
            ...(Object.prototype.hasOwnProperty.call(body, 'completionPercent')
              ? { completionPercent: body.completionPercent }
              : {}),
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    completeClassification: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.completeClassification(
          {
            sampleId,
            expectedVersion: body.expectedVersion,
            classificationVersion: body.classificationVersion,
            technical: body.technical,
            classificationData: body.classificationData,
            consumptionGrams: body.consumptionGrams ?? null,
            classifiers: body.classifiers,
            idempotencyKey: body.idempotencyKey,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    updateRegistration: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.updateRegistration(
          {
            sampleId,
            expectedVersion: body.expectedVersion,
            before: body.before,
            after: body.after,
            reasonCode: body.reasonCode,
            reasonText: body.reasonText,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    updateClassification: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.updateClassification(
          {
            sampleId,
            expectedVersion: body.expectedVersion,
            before: body.before,
            after: body.after,
            reasonCode: body.reasonCode,
            reasonText: body.reasonText,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    revertSampleUpdate: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.revertSampleUpdate(
          {
            sampleId,
            expectedVersion: body.expectedVersion,
            targetEventId: body.targetEventId,
            reasonCode: body.reasonCode,
            reasonText: body.reasonText,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    invalidateSample: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.invalidateSample(
          {
            sampleId,
            expectedVersion: body.expectedVersion,
            reasonCode: body.reasonCode,
            reasonText: body.reasonText,
            idempotencyKey: body.idempotencyKey,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    updateCommercialStatus: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.updateCommercialStatus(
          {
            sampleId,
            expectedVersion: body.expectedVersion,
            toCommercialStatus: body.toCommercialStatus,
            reasonText: body.reasonText,
            idempotencyKey: body.idempotencyKey,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    listSamples: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const query = input?.query ?? {};

        const result = await queryService.listSamples({
          search: readOptionalQueryString(query.search),
          status: readOptionalQueryString(query.status),
          limit: readPositiveInteger(query.limit, 30, 'limit'),
          offset: readPositiveInteger(query.offset, 0, 'offset'),
          page: readPageQuery(query.page),
          cursorCreatedAt: readOptionalQueryString(query.cursorCreatedAt),
          cursorId: readOptionalQueryString(query.cursorId),
          cursorInternalLotNumber: readOptionalQueryString(query.cursorInternalLotNumber),
          lot: readOptionalQueryString(query.lot),
          owner: readOptionalQueryString(query.owner),
          buyer: readOptionalQueryString(query.buyer),
          statusGroup: readOptionalQueryString(query.statusGroup),
          commercialStatus: readOptionalQueryString(query.commercialStatus),
          displayStatus: readOptionalQueryString(query.displayStatus),
          harvest: readOptionalQueryString(query.harvest),
          sacksMin: readOptionalQueryString(query.sacksMin),
          sacksMax: readOptionalQueryString(query.sacksMax),
          createdDate: readOptionalQueryString(query.createdDate),
          createdMonth: readOptionalQueryString(query.createdMonth),
          createdYear: readOptionalQueryString(query.createdYear),
          classifiedAging: readOptionalQueryString(query.classifiedAging),
        });

        return {
          status: 200,
          body: result,
        };
      }),

    getSampleDetail: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const query = input?.query ?? {};

        const result = await queryService.getSampleDetail(sampleId, {
          eventLimit: readPositiveInteger(query.eventLimit, 200, 'eventLimit'),
        });

        return {
          status: 200,
          body: result,
        };
      }),

    exportSamplePdf: (input) =>
      executeApiForInput(input, async () => {
        if (!reportService) {
          throw new HttpError(501, 'Sample report service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const exported = await reportService.exportSamplePdf(
          {
            sampleId,
            exportType: body.exportType,
            destination: body.destination,
            recipientClientId: body.recipientClientId,
          },
          actor
        );

        return {
          status: 200,
          body: {
            fileName: exported.fileName,
            contentType: exported.contentType,
            sizeBytes: exported.sizeBytes,
            checksumSha256: exported.checksumSha256,
            exportType: exported.exportType,
            destination: exported.destination,
            selectedFields: exported.selectedFields,
            auditEvent: exported.auditEvent,
            buffer: exported.buffer,
          },
        };
      }),

    recordPhysicalSampleSent: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.recordPhysicalSampleSent(
          {
            sampleId,
            recipientClientId: body.recipientClientId,
            sentDate: body.sentDate,
          },
          actor
        );

        return {
          status: 201,
          body: { event: result.event },
        };
      }),

    updatePhysicalSampleSend: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const sendEventId = input?.params?.sendEventId;
        if (typeof sendEventId !== 'string' || sendEventId.length === 0) {
          throw new HttpError(422, 'sendEventId path param is required');
        }
        const body = readRequestBody(input);

        const result = await commandService.updatePhysicalSampleSend(
          {
            sampleId,
            sendEventId,
            recipientClientId: body.recipientClientId,
            sentDate: body.sentDate,
          },
          actor
        );

        return {
          status: 200,
          body: { event: result.event },
        };
      }),

    cancelPhysicalSampleSend: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const sendEventId = input?.params?.sendEventId;
        if (typeof sendEventId !== 'string' || sendEventId.length === 0) {
          throw new HttpError(422, 'sendEventId path param is required');
        }

        const result = await commandService.cancelPhysicalSampleSend(
          {
            sampleId,
            sendEventId,
          },
          actor
        );

        return {
          status: 200,
          body: { event: result.event },
        };
      }),

    resolveSampleByQr: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const query = input?.query ?? {};
        const qr =
          typeof query.qr === 'string'
            ? query.qr
            : typeof query.token === 'string'
              ? query.token
              : typeof query.content === 'string'
                ? query.content
                : '';

        const sample = await queryService.resolveSampleByQrToken(qr);

        return {
          status: 200,
          body: {
            query: qr,
            sample: {
              id: sample.id,
              internalLotNumber: sample.internalLotNumber,
              status: sample.status,
              commercialStatus: sample.commercialStatus,
              declared: {
                owner: sample.declared.owner,
                sacks: sample.declared.sacks,
                harvest: sample.declared.harvest,
                originLot: sample.declared.originLot,
              },
            },
            redirectPath: `/samples/${sample.id}?focus=classification&source=qr`,
          },
        };
      }),

    resolveSampleByLot: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const query = input?.query ?? {};
        const lot = typeof query.lot === 'string' ? query.lot.trim() : '';

        if (!lot) {
          return { status: 422, body: { error: 'Numero do lote e obrigatorio' } };
        }

        const result = await queryService.resolveSampleByLot(lot);

        if (!result.found) {
          return { status: 200, body: { found: false } };
        }

        return {
          status: 200,
          body: {
            found: true,
            sample: {
              id: result.sample.id,
              internalLotNumber: result.sample.internalLotNumber,
              status: result.sample.status,
              version: result.sample.version,
              declared: {
                owner: result.sample.declared.owner,
                sacks: result.sample.declared.sacks,
                harvest: result.sample.declared.harvest,
                originLot: result.sample.declared.originLot,
              },
            },
          },
        };
      }),

    listSampleEvents: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const query = input?.query ?? {};

        const events = await queryService.listSampleEvents(sampleId, {
          limit: readPositiveInteger(query.limit, 200, 'limit'),
          afterSequence:
            query.afterSequence === undefined
              ? null
              : readPositiveInteger(query.afterSequence, 0, 'afterSequence'),
        });

        return {
          status: 200,
          body: {
            sampleId,
            events,
          },
        };
      }),

    listSampleMovements: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const query = input?.query ?? {};

        const movements = await queryService.listSampleMovements(sampleId, {
          movementType: readOptionalQueryString(query.movementType),
          status: readOptionalQueryString(query.status),
        });

        return {
          status: 200,
          body: {
            sampleId,
            movements,
          },
        };
      }),

    createSampleMovement: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.createSampleMovement(
          {
            sampleId,
            expectedVersion: body.expectedVersion,
            movementType: body.movementType,
            buyerClientId: body.buyerClientId,
            buyerBranchId: body.buyerBranchId,
            quantitySacks: body.quantitySacks,
            movementDate: body.movementDate,
            notes: body.notes ?? null,
            lossReasonText: body.lossReasonText,
          },
          actor
        );

        return {
          status: result.statusCode,
          body: result,
        };
      }),

    updateSampleMovement: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const movementId = input?.params?.movementId;
        if (typeof movementId !== 'string' || movementId.length === 0) {
          throw new HttpError(422, 'movementId path param is required');
        }
        const body = readRequestBody(input);

        const result = await commandService.updateSampleMovement(
          {
            sampleId,
            movementId,
            expectedVersion: body.expectedVersion,
            after: body.after ?? body.changes ?? {},
            reasonText: body.reasonText,
          },
          actor
        );

        return {
          status: result.statusCode,
          body: result,
        };
      }),

    cancelSampleMovement: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const movementId = input?.params?.movementId;
        if (typeof movementId !== 'string' || movementId.length === 0) {
          throw new HttpError(422, 'movementId path param is required');
        }
        const body = readRequestBody(input);

        const result = await commandService.cancelSampleMovement(
          {
            sampleId,
            movementId,
            expectedVersion: body.expectedVersion,
            reasonText: body.reasonText,
          },
          actor
        );

        return {
          status: result.statusCode,
          body: result,
        };
      }),

    getDashboardPending: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const dashboard = await queryService.getDashboardPending();
        return {
          status: 200,
          body: dashboard,
        };
      }),

    getDashboardSalesAvailability: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const result = await queryService.getDashboardSalesAvailability();
        return {
          status: 200,
          body: result,
        };
      }),

    getDashboardOperationalMetrics: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const result = await queryService.getDashboardOperationalMetrics();
        return {
          status: 200,
          body: result,
        };
      }),

    getDashboardCommercialMetrics: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const result = await queryService.getDashboardCommercialMetrics();
        return {
          status: 200,
          body: result,
        };
      }),

    getDashboardRecentActivity: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const result = await queryService.getDashboardRecentActivity();
        return {
          status: 200,
          body: result,
        };
      }),

    getPendingPrintJobs: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const query = input?.query ?? {};
        const result = await queryService.listPendingPrintJobs({
          limit: query.limit,
          sampleId: query.sampleId ?? null,
        });
        return {
          status: 200,
          body: result,
        };
      }),

    listClients: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const query = input?.query ?? {};
        const result = await clientService.listClients(
          {
            page: query.page,
            limit: query.limit,
            search: query.search,
            status: query.status,
            personType: query.personType,
            isBuyer: query.isBuyer,
            isSeller: query.isSeller,
            commercialUserId: query.commercialUserId,
            commercialUserIds: query.commercialUserIds,
          },
          actor
        );

        return {
          status: 200,
          body: result,
        };
      }),

    lookupClients: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const query = input?.query ?? {};
        const result = await clientService.lookupClients(
          {
            search: query.search,
            kind: query.kind,
          },
          actor
        );

        return {
          status: 200,
          body: result,
        };
      }),

    getClient: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }

        const result = await clientService.getClient(clientId, actor);
        return {
          status: 200,
          body: result,
        };
      }),

    createClient: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const createPayload = {
          personType: body.personType,
          fullName: body.fullName,
          legalName: body.legalName,
          tradeName: body.tradeName,
          cpf: body.cpf,
          phone: body.phone,
          isBuyer: body.isBuyer,
          isSeller: body.isSeller,
        };
        assignIfDefined(createPayload, 'commercialUserId', body.commercialUserId);
        assignIfDefined(createPayload, 'commercialUserIds', body.commercialUserIds);
        assignIfDefined(createPayload, 'branches', body.branches);

        const result = await clientService.createClient(createPayload, actor);

        return {
          status: 201,
          body: result,
        };
      }),

    updateClient: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }

        const body = readRequestBody(input);
        const updatePayload = {};
        assignIfDefined(updatePayload, 'personType', body.personType);
        assignIfDefined(updatePayload, 'fullName', body.fullName);
        assignIfDefined(updatePayload, 'legalName', body.legalName);
        assignIfDefined(updatePayload, 'tradeName', body.tradeName);
        assignIfDefined(updatePayload, 'cpf', body.cpf);
        assignIfDefined(updatePayload, 'phone', body.phone);
        assignIfDefined(updatePayload, 'isBuyer', body.isBuyer);
        assignIfDefined(updatePayload, 'isSeller', body.isSeller);
        assignIfDefined(updatePayload, 'commercialUserId', body.commercialUserId);
        assignIfDefined(updatePayload, 'commercialUserIds', body.commercialUserIds);
        assignIfDefined(updatePayload, 'reasonText', body.reasonText);

        const result = await clientService.updateClient(clientId, updatePayload, actor);

        return {
          status: 200,
          body: result,
        };
      }),

    getClientImpact: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }

        const result = await clientService.getClientImpact(clientId, actor);

        return {
          status: 200,
          body: result,
        };
      }),

    listClientSamples: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }

        const result = await clientService.listClientSamples(
          clientId,
          {
            page: input?.query?.page,
            limit: input?.query?.limit,
            search: input?.query?.search,
            buyer: input?.query?.buyer,
            commercialStatus: input?.query?.commercialStatus,
            harvest: input?.query?.harvest,
            sacksMin: input?.query?.sacksMin,
            sacksMax: input?.query?.sacksMax,
            periodMode: input?.query?.periodMode,
            periodValue: input?.query?.periodValue,
          },
          actor
        );

        return {
          status: 200,
          body: result,
        };
      }),

    listClientPurchases: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }

        const result = await clientService.listClientPurchases(
          clientId,
          {
            page: input?.query?.page,
            limit: input?.query?.limit,
            search: input?.query?.search,
            owner: input?.query?.owner,
            sacksMin: input?.query?.sacksMin,
            sacksMax: input?.query?.sacksMax,
            periodMode: input?.query?.periodMode,
            periodValue: input?.query?.periodValue,
          },
          actor
        );

        return {
          status: 200,
          body: result,
        };
      }),

    getClientCommercialSummary: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }

        const result = await clientService.getClientCommercialSummary(clientId, actor);

        return {
          status: 200,
          body: result,
        };
      }),

    addCommercialUserToClient: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }
        const body = readRequestBody(input);
        const result = await clientService.addCommercialUserToClient(clientId, body?.userId, actor);
        return { status: 201, body: result };
      }),

    removeCommercialUserFromClient: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        const userId = input?.params?.userId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }
        if (typeof userId !== 'string' || userId.length === 0) {
          throw new HttpError(422, 'userId path param is required');
        }
        const result = await clientService.removeCommercialUserFromClient(clientId, userId, actor);
        return { status: 200, body: result };
      }),

    bulkAddCommercialUser: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await clientService.bulkAddCommercialUser(
          { clientIds: body?.clientIds, userId: body?.userId },
          actor
        );
        return { status: 200, body: result };
      }),

    getUserClientsImpact: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const userId = input?.params?.userId;
        if (typeof userId !== 'string' || userId.length === 0) {
          throw new HttpError(422, 'userId path param is required');
        }
        const result = await clientService.getUserClientsImpact(userId, actor);
        return { status: 200, body: result };
      }),

    inactivateClient: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }

        const body = readRequestBody(input);
        const result = await clientService.inactivateClient(
          clientId,
          {
            reasonText: body.reasonText,
          },
          actor
        );

        return {
          status: 200,
          body: result,
        };
      }),

    reactivateClient: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }

        const body = readRequestBody(input);
        const result = await clientService.reactivateClient(
          clientId,
          {
            reasonText: body.reasonText,
          },
          actor
        );

        return {
          status: 200,
          body: result,
        };
      }),

    listClientAuditEvents: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }
        const query = input?.query ?? {};
        const result = await clientService.listAuditEvents(
          clientId,
          {
            page: query.page,
            limit: query.limit,
          },
          actor
        );

        return {
          status: 200,
          body: result,
        };
      }),

    createClientBranch: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }
        const body = readRequestBody(input);

        const result = await clientService.createBranch(clientId, body, actor);

        return {
          status: 201,
          body: result,
        };
      }),

    updateClientBranch: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        const branchId = input?.params?.branchId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }
        if (typeof branchId !== 'string' || branchId.length === 0) {
          throw new HttpError(422, 'branchId path param is required');
        }
        const body = readRequestBody(input);

        const result = await clientService.updateBranch(clientId, branchId, body, actor);

        return {
          status: 200,
          body: result,
        };
      }),

    inactivateClientBranch: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        const branchId = input?.params?.branchId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }
        if (typeof branchId !== 'string' || branchId.length === 0) {
          throw new HttpError(422, 'branchId path param is required');
        }
        const body = readRequestBody(input);

        const result = await clientService.inactivateBranch(
          clientId,
          branchId,
          { reasonText: body.reasonText },
          actor
        );

        return {
          status: 200,
          body: result,
        };
      }),

    reactivateClientBranch: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        const branchId = input?.params?.branchId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }
        if (typeof branchId !== 'string' || branchId.length === 0) {
          throw new HttpError(422, 'branchId path param is required');
        }
        const body = readRequestBody(input);

        const result = await clientService.reactivateBranch(
          clientId,
          branchId,
          { reasonText: body.reasonText },
          actor
        );

        return {
          status: 200,
          body: result,
        };
      }),

    logout: (input) =>
      executeApiForInput(input, async () => {
        if (!authService) {
          throw new HttpError(501, 'Auth service is not configured');
        }

        const actor = await resolveActorContext(input, authService, { allowPending: true });
        const result = await authService.logout(actor);
        return {
          status: 200,
          body: result,
        };
      }),

    recordSessionExpired: (input) =>
      executeApiForInput(input, async () => {
        if (!authService) {
          throw new HttpError(501, 'Auth service is not configured');
        }

        const body = readRequestBody(input);
        const result = await authService.recordSessionExpired(
          {
            sessionId: body.sessionId,
          },
          buildRequestContext(input)
        );
        return {
          status: 200,
          body: result,
        };
      }),

    getCurrentUser: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService, { allowPending: true });
        const result = await userService.getMe(actor);
        return {
          status: 200,
          body: result,
        };
      }),

    updateCurrentUserProfile: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await userService.updateOwnProfile(
          {
            fullName: body.fullName,
            username: body.username,
            phone: body.phone,
          },
          actor
        );
        return {
          status: 200,
          body: result,
        };
      }),

    changeCurrentUserPassword: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService, { allowPending: true });
        const body = readRequestBody(input);
        const result = await userService.changeOwnPassword(
          {
            password: body.password,
          },
          actor
        );
        return {
          status: 200,
          body: result,
        };
      }),

    requestCurrentUserEmailChange: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await userService.requestOwnEmailChange(
          {
            email: body.email,
          },
          actor
        );
        return {
          status: 200,
          body: result,
        };
      }),

    resendCurrentUserEmailChangeCode: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const result = await userService.resendOwnEmailChangeCode(actor);
        return {
          status: 200,
          body: result,
        };
      }),

    confirmCurrentUserEmailChange: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await userService.confirmOwnEmailChange(
          {
            code: body.code,
          },
          actor
        );
        return {
          status: 200,
          body: result,
        };
      }),

    recordInitialPasswordDecision: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService, { allowPending: true });
        const body = readRequestBody(input);
        const result = await userService.recordInitialPasswordDecision(
          {
            decision: body.decision,
          },
          actor
        );
        return {
          status: 200,
          body: result,
        };
      }),

    requestPasswordReset: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const body = readRequestBody(input);
        const result = await userService.requestPasswordReset(
          {
            email: body.email,
          },
          buildRequestContext(input)
        );
        return {
          status: 200,
          body: result,
        };
      }),

    verifyPasswordResetCode: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const body = readRequestBody(input);
        const result = await userService.verifyPasswordResetCode(
          {
            email: body.email,
            code: body.code,
          },
          buildRequestContext(input)
        );
        return {
          status: 200,
          body: result,
        };
      }),

    resetPasswordWithCode: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const body = readRequestBody(input);
        const result = await userService.resetPasswordWithCode(
          {
            email: body.email,
            code: body.code,
            password: body.password,
          },
          buildRequestContext(input)
        );
        return {
          status: 200,
          body: result,
        };
      }),

    listUsers: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const query = input?.query ?? {};
        const result = await userService.listUsers(
          {
            page: query.page,
            limit: query.limit,
            search: query.search,
            role: query.role,
            status: query.status,
          },
          actor
        );
        return {
          status: 200,
          body: result,
        };
      }),

    lookupUsersForReference: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const query = input?.query ?? {};
        const result = await userService.lookupUsersForReference(
          {
            search: query.search,
            excludeUserId: query.excludeUserId,
            limit: query.limit,
          },
          actor
        );
        return {
          status: 200,
          body: result,
        };
      }),

    getUser: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const userId = input?.params?.userId;
        if (typeof userId !== 'string' || userId.length === 0) {
          throw new HttpError(422, 'userId path param is required');
        }

        const result = await userService.getUser(userId, actor);
        return {
          status: 200,
          body: result,
        };
      }),

    createUser: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await userService.createUser(
          {
            fullName: body.fullName,
            username: body.username,
            email: body.email,
            phone: body.phone,
            password: body.password,
            role: body.role,
          },
          actor
        );
        return {
          status: 201,
          body: result,
        };
      }),

    updateUser: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const userId = input?.params?.userId;
        if (typeof userId !== 'string' || userId.length === 0) {
          throw new HttpError(422, 'userId path param is required');
        }

        const body = readRequestBody(input);
        const result = await userService.updateUser(
          userId,
          {
            fullName: body.fullName,
            username: body.username,
            email: body.email,
            phone: body.phone,
            role: body.role,
          },
          actor
        );
        return {
          status: 200,
          body: result,
        };
      }),

    inactivateUser: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const userId = input?.params?.userId;
        if (typeof userId !== 'string' || userId.length === 0) {
          throw new HttpError(422, 'userId path param is required');
        }

        const body = readRequestBody(input);
        const result = await userService.inactivateUser(
          userId,
          {
            reasonText: body.reasonText,
          },
          actor
        );
        return {
          status: 200,
          body: result,
        };
      }),

    reactivateUser: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const userId = input?.params?.userId;
        if (typeof userId !== 'string' || userId.length === 0) {
          throw new HttpError(422, 'userId path param is required');
        }

        const result = await userService.reactivateUser(userId, actor);
        return {
          status: 200,
          body: result,
        };
      }),

    unlockUser: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const userId = input?.params?.userId;
        if (typeof userId !== 'string' || userId.length === 0) {
          throw new HttpError(422, 'userId path param is required');
        }

        const result = await userService.unlockUser(userId, actor);
        return {
          status: 200,
          body: result,
        };
      }),

    resetUserPassword: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const userId = input?.params?.userId;
        if (typeof userId !== 'string' || userId.length === 0) {
          throw new HttpError(422, 'userId path param is required');
        }

        const body = readRequestBody(input);
        const result = await userService.resetUserPassword(
          userId,
          {
            password: body.password,
          },
          actor
        );
        return {
          status: 200,
          body: result,
        };
      }),

    listUserAuditEvents: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const query = input?.query ?? {};
        const result = await userService.listAuditEvents(
          {
            page: query.page,
            limit: query.limit,
          },
          actor
        );
        return {
          status: 200,
          body: result,
        };
      }),

    detectClassificationForm: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);

        const result = await commandService.detectClassificationForm(
          {
            fileBuffer: Buffer.isBuffer(body.fileBuffer) ? body.fileBuffer : null,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    extractAndPrepareClassification: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);

        let fileBuffer = null;
        if (Buffer.isBuffer(body.fileBuffer)) {
          fileBuffer = body.fileBuffer;
        } else if (typeof body.fileBase64 === 'string' && body.fileBase64.length > 0) {
          fileBuffer = Buffer.from(body.fileBase64, 'base64');
        }

        const result = await commandService.extractAndPrepareClassification(
          {
            fileBuffer,
            photoToken: typeof body.photoToken === 'string' ? body.photoToken : null,
            mimeType: body.mimeType ?? null,
            originalFileName: body.originalFileName ?? null,
            classificationType: body.classificationType ?? null,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    confirmClassificationFromCamera: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);

        const result = await commandService.confirmClassificationFromCamera(
          {
            sampleId: body.sampleId,
            classificationData: body.classificationData,
            photoToken: body.photoToken,
            idempotencyKey: body.idempotencyKey,
            classificationType: body.classificationType ?? null,
            classifiers: body.classifiers,
            applySampleUpdates: body.applySampleUpdates ?? null,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),
  };
}
