import { randomUUID } from 'node:crypto';

import { HttpError } from '../../contracts/errors.js';
import { executeApi, readPositiveInteger } from '../http-utils.js';

function readHeader(headers, key) {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const exact = headers[key];
  if (exact !== undefined) {
    return exact;
  }

  const lowerKey = key.toLowerCase();
  const normalized = Object.entries(headers).find(([candidate]) => candidate.toLowerCase() === lowerKey);
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
    source: String(readHeader(headers, 'x-source') ?? 'web').toLowerCase()
  };
}

async function resolveActorContext(input, authService) {
  if (!authService) {
    throw new HttpError(501, 'Auth service is not configured');
  }

  const requestContext = buildRequestContext(input);
  const headers = input?.headers ?? {};
  const authorization = readHeader(headers, 'authorization');
  if (!authorization) {
    throw new HttpError(401, 'Authentication required (Bearer token)', {
      code: 'AUTH_REQUIRED'
    });
  }

  return {
    ...(await authService.authenticateAuthorizationHeader(authorization, requestContext)),
    ...requestContext
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
  commandService,
  queryService,
  reportService = null
}) {
  return {
    health: () =>
      executeApi(async () => ({
        status: 200,
        body: {
          status: 'ok',
          timestamp: new Date().toISOString()
        }
      })),

    login: (input) =>
      executeApiForInput(input, async () => {
        if (!authService) {
          throw new HttpError(501, 'Auth service is not configured');
        }

        const body = readRequestBody(input);
        const result = await authService.login(
          {
            username: body.username,
            password: body.password
          },
          buildRequestContext(input)
        );

        return {
          status: 200,
          body: result
        };
      }),

    receiveSample: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await commandService.receiveSample(body, actor);
        return { status: result.statusCode, body: result };
      }),

    createSampleAndPreparePrint: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);

        let arrivalPhoto = null;
        let arrivalPhotoFileBuffer = null;
        if (Buffer.isBuffer(body.arrivalPhotoFileBuffer)) {
          arrivalPhotoFileBuffer = body.arrivalPhotoFileBuffer;
        } else if (typeof body.arrivalPhotoBase64 === 'string' && body.arrivalPhotoBase64.length > 0) {
          arrivalPhotoFileBuffer = Buffer.from(body.arrivalPhotoBase64, 'base64');
        }

        if (arrivalPhotoFileBuffer) {
          arrivalPhoto = {
            fileBuffer: arrivalPhotoFileBuffer,
            mimeType: body.arrivalPhotoMimeType ?? null,
            originalFileName: body.arrivalPhotoOriginalFileName ?? null
          };
        }

        const result = await commandService.createSampleAndPreparePrint(
          {
            clientDraftId: body.clientDraftId,
            owner: body.owner,
            sacks: body.sacks,
            harvest: body.harvest,
            originLot: body.originLot,
            receivedChannel: body.receivedChannel,
            notes: body.notes ?? null,
            printerId: body.printerId ?? null,
            arrivalPhoto
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
            expectedVersion: body.expectedVersion
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
            kind: body.kind ?? 'ARRIVAL_PHOTO',
            fileBuffer,
            mimeType: body.mimeType ?? null,
            originalFileName: body.originalFileName ?? null,
            replaceExisting: body.replaceExisting
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
            ocr: body.ocr,
            labelPhotoIds: body.labelPhotoIds,
            idempotencyKey: body.idempotencyKey
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
            idempotencyKey: body.idempotencyKey
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
            idempotencyKey: body.idempotencyKey
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
            error: body.error
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
            printerId: body.printerId ?? null
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
            notes: body.notes ?? null
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
              : {})
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
            classifierUserId: body.classifierUserId,
            classifierName: body.classifierName,
            idempotencyKey: body.idempotencyKey
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
            reasonText: body.reasonText
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
            reasonText: body.reasonText
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
            reasonText: body.reasonText
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
            idempotencyKey: body.idempotencyKey
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
            idempotencyKey: body.idempotencyKey
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
          lot: readOptionalQueryString(query.lot),
          owner: readOptionalQueryString(query.owner),
          statusGroup: readOptionalQueryString(query.statusGroup),
          commercialStatus: readOptionalQueryString(query.commercialStatus),
          harvest: readOptionalQueryString(query.harvest),
          createdDate: readOptionalQueryString(query.createdDate),
          createdMonth: readOptionalQueryString(query.createdMonth),
          createdYear: readOptionalQueryString(query.createdYear)
        });

        return {
          status: 200,
          body: result
        };
      }),

    getSampleDetail: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const query = input?.query ?? {};

        const result = await queryService.getSampleDetail(sampleId, {
          eventLimit: readPositiveInteger(query.eventLimit, 200, 'eventLimit')
        });

        return {
          status: 200,
          body: result
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
            destination: body.destination
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
            buffer: exported.buffer
          }
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
                originLot: sample.declared.originLot
              }
            },
            redirectPath: `/samples/${sample.id}?focus=classification&source=qr`
          }
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
            query.afterSequence === undefined ? null : readPositiveInteger(query.afterSequence, 0, 'afterSequence')
        });

        return {
          status: 200,
          body: {
            sampleId,
            events
          }
        };
      }),

    getDashboardPending: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const dashboard = await queryService.getDashboardPending();
        return {
          status: 200,
          body: dashboard
        };
      }),

    logout: (input) =>
      executeApiForInput(input, async () => {
        if (!authService) {
          throw new HttpError(501, 'Auth service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const result = await authService.logout(actor);
        return {
          status: 200,
          body: result
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
            sessionId: body.sessionId
          },
          buildRequestContext(input)
        );
        return {
          status: 200,
          body: result
        };
      }),

    getCurrentUser: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const result = await userService.getMe(actor);
        return {
          status: 200,
          body: result
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
            phone: body.phone
          },
          actor
        );
        return {
          status: 200,
          body: result
        };
      }),

    changeCurrentUserPassword: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await userService.changeOwnPassword(
          {
            password: body.password
          },
          actor
        );
        return {
          status: 200,
          body: result
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
            email: body.email
          },
          actor
        );
        return {
          status: 200,
          body: result
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
          body: result
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
            code: body.code
          },
          actor
        );
        return {
          status: 200,
          body: result
        };
      }),

    recordInitialPasswordDecision: (input) =>
      executeApiForInput(input, async () => {
        if (!userService) {
          throw new HttpError(501, 'User service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await userService.recordInitialPasswordDecision(
          {
            decision: body.decision
          },
          actor
        );
        return {
          status: 200,
          body: result
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
            email: body.email
          },
          buildRequestContext(input)
        );
        return {
          status: 200,
          body: result
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
            password: body.password
          },
          buildRequestContext(input)
        );
        return {
          status: 200,
          body: result
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
            status: query.status
          },
          actor
        );
        return {
          status: 200,
          body: result
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
          body: result
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
            role: body.role
          },
          actor
        );
        return {
          status: 201,
          body: result
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
            role: body.role
          },
          actor
        );
        return {
          status: 200,
          body: result
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
            reasonText: body.reasonText
          },
          actor
        );
        return {
          status: 200,
          body: result
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
          body: result
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
          body: result
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
            password: body.password
          },
          actor
        );
        return {
          status: 200,
          body: result
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
            limit: query.limit
          },
          actor
        );
        return {
          status: 200,
          body: result
        };
      })
  };
}
