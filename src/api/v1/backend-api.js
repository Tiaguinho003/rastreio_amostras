import { randomUUID } from 'node:crypto';

import { HttpError } from '../../contracts/errors.js';
import { readSessionTokenFromCookieHeader } from '../../auth/session-cookie.js';
import { createRateLimiter } from '../../auth/rate-limiter.js';
import { PROSPECTOR_ALLOWED_API_METHODS } from '../../auth/prospector-access.js';
import { USER_ROLES } from '../../auth/roles.js';
import { executeApi, readPositiveInteger } from '../http-utils.js';
import { IDEMPOTENCY_SCOPES, buildScopeKey, withIdempotency } from './idempotency-helper.js';

const loginRateLimiter = createRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 10,
});

// Etiqueta de Envio (fase 4): rate-limit leve da rota publica do laudo (defesa
// em profundidade — o token de 32 bytes ja torna brute-force inviavel).
const publicReportRateLimiter = createRateLimiter({
  windowMs: Number(process.env.PUBLIC_REPORT_RATE_LIMIT_WINDOW_MS) || 60_000,
  maxRequests: Number(process.env.PUBLIC_REPORT_RATE_LIMIT_MAX_REQUESTS) || 60,
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

  // Gate central do app restrito do PROSPECTOR: fora da allowlist
  // (src/auth/prospector-access.js) responde 403 — fail-closed quando o
  // input nao traz methodName (carimbado no fim de createBackendApiV1).
  // Roda dentro da MESMA resolucao de sessao (sem autenticar duas vezes) e
  // antes do check de senha pendente.
  if (
    actor.role === USER_ROLES.PROSPECTOR &&
    !PROSPECTOR_ALLOWED_API_METHODS.has(input?.methodName)
  ) {
    throw new HttpError(
      403,
      `Role PROSPECTOR is not allowed to ${input?.methodName ?? 'access this resource'}`,
      { code: 'ROLE_FORBIDDEN' }
    );
  }

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

// Le uma lista de ids separada por virgula ("a,b,c") — usada nos filtros
// multi-select (proprietarios/compradores). Dedup + remove vazios.
function readOptionalIdList(value) {
  const raw = readOptionalQueryString(value);
  if (!raw) {
    return [];
  }
  return [
    ...new Set(
      raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    ),
  ];
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

// Espelha MAX_LOTS em components/ApprovalLabelModal.tsx (a etiqueta nao comporta
// mais lotes sem encolher a fonte a ponto de cortar o numero).
const MAX_CUSTOM_LOTS = 16;

// Etiqueta de Aprovacao (modal "Aprovacao" do leque "+" em /samples). Valida/
// normaliza as linhas { label, value } enviadas pelo modal; o agente as
// renderiza como rotulo:valor (sem QR). Generico de proposito: o modal decide os
// rotulos, o backend so sanitiza tamanho/forma e valida a contagem de lotes.
function normalizeCustomLabelLines(rawLines) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new HttpError(422, 'lines deve ser uma lista nao vazia');
  }
  if (rawLines.length > 12) {
    throw new HttpError(422, 'lines suporta no maximo 12 linhas');
  }

  return rawLines.map((line, index) => {
    const label = typeof line?.label === 'string' ? line.label.trim() : '';
    const value = typeof line?.value === 'string' ? line.value.trim() : '';
    if (label.length === 0) {
      throw new HttpError(422, `lines[${index}].label e obrigatorio`);
    }
    // Deteccao do LOTE: MESMA norma do normalizeFieldKey em print-agent/label.js
    // (manter em sincronia). O LOTE carrega varios lotes juntados por virgula (a
    // etiqueta os divide numa grade); validamos a CONTAGEM em vez de cortar 240
    // chars cru, que partia o numero do ultimo lote no meio.
    const isLots = label.replace(/[°º:]/g, '').replace(/\s+/g, ' ').trim().toUpperCase() === 'LOTE';
    if (isLots) {
      const lots = value
        .split(/[,\n]+/)
        .map((lot) => lot.trim().slice(0, 40))
        .filter(Boolean);
      if (lots.length > MAX_CUSTOM_LOTS) {
        throw new HttpError(422, `lotes suporta no maximo ${MAX_CUSTOM_LOTS}`);
      }
      return { label: label.slice(0, 40), value: lots.join(', ') };
    }
    return {
      label: label.slice(0, 40),
      // value pode ser vazio (campo deixado em branco no modal).
      value: value.slice(0, 80),
    };
  });
}

function executeApiForInput(input, handler) {
  const requestId = readHeader(input?.headers ?? {}, 'x-request-id') ?? null;
  return executeApi(handler, { requestId });
}

export function createBackendApiV1({
  authService = null,
  userService = null,
  clientService = null,
  visitReportService = null,
  commercialFormsService = null,
  pushService = null,
  commandService,
  queryService,
  reportService = null,
  idempotencyStore = null,
}) {
  // Etiqueta de Envio: monta a URL publica do laudo pro QR. Usa
  // REPORT_PUBLIC_BASE_URL (dominio dedicado do Firebase Hosting que so expoe
  // /laudo, ex: safras-negocios-laudo.web.app) com fallback pro APP_BASE_URL (a
  // URL do proprio Cloud Run). Em prod a env vem de .env.cloud-production via
  // runtime_env_vars_csv (scripts/gcp/_lib.sh).
  function buildLaudoReportUrl(token) {
    const base = (process.env.REPORT_PUBLIC_BASE_URL ?? process.env.APP_BASE_URL ?? '').replace(
      /\/+$/,
      ''
    );
    return base ? `${base}/laudo/${token}` : `/laudo/${token}`;
  }

  // Etiqueta de Envio (fase 3): enfileira a impressao da etiqueta (best-effort,
  // mesmo padrao desacoplado da CustomPrintJob). token/qrUrl so vem preenchidos
  // quando a amostra estava CLASSIFIED (etiqueta com QR). Se o insert falhar, o
  // envio + share ja estao gravados — a etiqueta pode ser re-enfileirada depois.
  async function enqueueShippingLabel({
    sample,
    recipient,
    sentDate,
    reportedHarvest,
    sendEventId,
    token = null,
    qrUrl = null,
  }) {
    try {
      await queryService.prisma.shippingPrintJob.create({
        data: {
          status: 'PENDING',
          payload: {
            sampleId: sample.id,
            sendEventId,
            token,
            qrUrl,
            internalLotNumber: sample.internalLotNumber ?? null,
            recipientName: recipient?.displayName ?? null,
            sentDate: sentDate ?? null,
            sacks: sample.declared?.sacks ?? null,
            harvest: reportedHarvest ?? sample.declared?.harvest ?? null,
          },
        },
      });
    } catch (cause) {
      console.error('[shipping-print] falha ao enfileirar etiqueta de envio', {
        sampleId: sample.id,
        sendEventId,
        cause,
      });
    }
  }

  const api = {
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

    createSample: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);

        const result = await commandService.createSample(
          {
            clientDraftId: body.clientDraftId,
            owner: body.owner,
            ownerClientId: body.ownerClientId,
            ownerUnitId: body.ownerUnitId,
            sacks: body.sacks,
            harvest: body.harvest,
            originLot: body.originLot,
            location: body.location,
            receivedChannel: body.receivedChannel,
            notes: body.notes ?? null,
            // Lote editavel: numero manual + data de chegada informados no modal.
            sampleLotNumber: body.sampleLotNumber,
            lotNumberManual: body.lotNumberManual,
            receivedDate: body.receivedDate,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    // Liga A3.1: cria uma liga (Sample com isBlend=true) a partir de N
    // amostras-origem. Wrapper REST do commandService.createBlend (Wave A2.2).
    createBlend: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);

        const result = await commandService.createBlend(
          {
            clientDraftId: body.clientDraftId,
            components: body.components,
            ownerClientId: body.ownerClientId,
            ownerUnitId: body.ownerUnitId,
            harvest: body.harvest,
            location: body.location,
            notes: body.notes ?? null,
            sampleId: body.sampleId,
            sampleLotNumber: body.sampleLotNumber,
            idempotencyKey: body.idempotencyKey,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    // Liga A3.2: reverte uma liga (status -> INVALIDATED). Wrapper REST
    // do commandService.revertBlend (Wave A2.3). Restrita a liga sem
    // venda/perda (F8.4).
    revertBlend: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const blendId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.revertBlend(
          {
            blendId,
            expectedVersion: body.expectedVersion,
            reasonText: body.reasonText,
            idempotencyKey: body.idempotencyKey,
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

    // Q.print: requestQrPrint virou acao pura. Sem expectedVersion,
    // sem attemptNumber (backend calcula). requestQrReprint deletado —
    // toda impressao usa requestQrPrint com attemptNumber sequencial.
    requestQrPrint: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.requestQrPrint(
          {
            sampleId,
            printerId: body.printerId ?? null,
            idempotencyKey: body.idempotencyKey,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    // Q.print + Q.final: recordQrPrintFailed/Printed audit-only (sem
    // expectedVersion, sem PrintAction). Body.printAction se vier do print
    // agent legacy e ignorado.
    recordQrPrintFailed: (input) =>
      executeApiForInput(input, async () => {
        const actor = await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const body = readRequestBody(input);

        const result = await commandService.recordQrPrintFailed(
          {
            sampleId,
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
            attemptNumber: body.attemptNumber,
            printerId: body.printerId ?? null,
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
            // Liga: confirma a propagacao da safra para as ligas ancestrais
            // (avisar-e-confirmar). Sem isso, o backend devolve 409 com a lista.
            confirmHarvestPropagation: body.confirmHarvestPropagation,
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
            // Q.cls.2 audit do tipo: passa o tipo opcional pra suportar
            // tipo-only update no detail page (sem after).
            classificationType: body.classificationType,
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
          cursorLotInt: readOptionalQueryString(query.cursorLotInt),
          cursorId: readOptionalQueryString(query.cursorId),
          lot: readOptionalQueryString(query.lot),
          owner: readOptionalQueryString(query.owner),
          buyer: readOptionalQueryString(query.buyer),
          ownerClientIds: readOptionalIdList(query.ownerClientIds),
          buyerClientIds: readOptionalIdList(query.buyerClientIds),
          sentToClientIds: readOptionalIdList(query.sentToClientIds),
          // Filtros de classificacao (CSV de valores). readOptionalIdList e um
          // split CSV generico (trim + dedup), serve pra strings tambem.
          padroes: readOptionalIdList(query.padroes),
          aspectos: readOptionalIdList(query.aspectos),
          catacoes: readOptionalIdList(query.catacoes),
          certificados: readOptionalIdList(query.certificados),
          statusGroup: readOptionalQueryString(query.statusGroup),
          commercialStatus: readOptionalQueryString(query.commercialStatus),
          displayStatus: readOptionalQueryString(query.displayStatus),
          harvest: readOptionalQueryString(query.harvest),
          harvests: readOptionalIdList(query.harvests),
          sacksMin: readOptionalQueryString(query.sacksMin),
          sacksMax: readOptionalQueryString(query.sacksMax),
          createdFrom: readOptionalQueryString(query.createdFrom),
          createdTo: readOptionalQueryString(query.createdTo),
          // Liga A3.3 (F1.B + T0.B): quando true, enriquece cada sample
          // com eligibility + committedSacks.
          eligibleForBlend: readOptionalQueryString(query.eligibleForBlend) === 'true',
          // Liga: filtro "Apenas ligas".
          isBlend: readOptionalQueryString(query.isBlend) === 'true' ? true : null,
        });

        return {
          status: 200,
          body: result,
        };
      }),

    // Lote editavel: sugestao do proximo numero da sequencia pra pre-preencher
    // o campo no modal de criacao. O numero real e gerado no submit (server-side).
    getNextLotNumber: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const nextLotNumber = await queryService.getNextInternalLotNumber();
        return {
          status: 200,
          body: { nextLotNumber },
        };
      }),

    // Valores distintos de um campo de classificacao (?field=padrao|aspecto|
    // catacao|certif) — opcoes dos filtros multi-select de /samples.
    listClassificationValues: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const field = readOptionalQueryString(input?.query?.field);
        const result = await queryService.listClassificationValues(field);
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

    // Liga B4 Fase 2: viabilidade da venda de uma liga (árvore de
    // descendentes + saldos + origens que bloqueiam a cascata F7.6).
    getBlendFeasibility: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const result = await queryService.getBlendFeasibility(sampleId);
        if (!result) {
          throw new HttpError(404, `Sample ${sampleId} not found`);
        }
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
            destination: body.destination,
            recipientClientId: body.recipientClientId,
            // Liga: safra escolhida pro laudo quando a amostra tem mais de uma
            // safra (override de apresentacao; nao muda o declaredHarvest).
            reportedHarvest: body.reportedHarvest,
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

        const sample = await queryService.requireSample(sampleId);

        // Destinatario resolvido uma vez: o displayName vai no cabecalho do
        // laudo e o snapshot e congelado no evento/share. Sem destinatario =>
        // envio anonimo (laudo sem linha de destinatario).
        let recipient = null;
        if (body.recipientClientId) {
          if (!clientService) {
            throw new HttpError(501, 'Client service is not configured');
          }
          recipient = await clientService.resolveRecipientClient(body.recipientClientId);
        }

        // Bifurcacao por status (D4). CLASSIFIED: gera o laudo congelado + o
        // SampleReportShare (atomicos com o evento) e enfileira etiqueta COM QR.
        // REGISTRATION_CONFIRMED: so registra o envio + etiqueta SEM QR.
        if (sample.status === 'CLASSIFIED') {
          if (!reportService) {
            throw new HttpError(501, 'Sample report service is not configured');
          }

          // PDF gerado e gravado FORA de transacao (render lento). Se a foto
          // sumiu do storage, lanca 409 e nada e gravado (envio atomico —
          // preserva a invariante "CLASSIFIED => laudo").
          const persisted = await reportService.persistSampleReportPdf({
            sampleId,
            destination: recipient?.displayName ?? null,
            recipientClientId: body.recipientClientId ?? null,
            reportedHarvest: body.reportedHarvest ?? null,
          });

          const result = await commandService.recordPhysicalSampleSentWithReport(
            { sampleId, recipientClientId: body.recipientClientId, sentDate: body.sentDate },
            {
              storagePath: persisted.storagePath,
              fileName: persisted.fileName,
              checksumSha256: persisted.checksumSha256,
              sizeBytes: persisted.sizeBytes,
              reportedHarvest: persisted.reportedHarvest,
              recipientSnapshot: recipient,
            },
            actor
          );

          const qrUrl = buildLaudoReportUrl(result.share.token);
          await enqueueShippingLabel({
            sample,
            recipient,
            sentDate: result.event.payload?.sentDate ?? body.sentDate ?? null,
            reportedHarvest: persisted.reportedHarvest,
            sendEventId: result.event.eventId,
            token: result.share.token,
            qrUrl,
          });

          return {
            status: 201,
            body: { event: result.event, share: result.share, qrUrl },
          };
        }

        const result = await commandService.recordPhysicalSampleSent(
          {
            sampleId,
            recipientClientId: body.recipientClientId,
            sentDate: body.sentDate,
          },
          actor
        );

        await enqueueShippingLabel({
          sample,
          recipient,
          sentDate: result.event.payload?.sentDate ?? body.sentDate ?? null,
          reportedHarvest: null,
          sendEventId: result.event.eventId,
        });

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
            buyerUnitId: body.buyerUnitId,
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

    // ============================================================
    // Etiqueta de Aprovacao (modal "Aprovacao" do leque "+" em /samples).
    // Fila propria (custom_print_job) — endpoint separado de proposito
    // pra nao tocar no fluxo de impressao das amostras. O print agent
    // poll este /pending alem do /print-queue/pending de sempre.
    // ============================================================

    enqueueCustomPrintJob: (input) =>
      executeApiForInput(input, async () => {
        // Qualquer sessao autenticada nao-PROSPECTOR pode enfileirar: o gate
        // central do PROSPECTOR (allowlist em src/auth/prospector-access.js)
        // ja barra prospector; os demais papeis acessam o modal em /samples.
        await resolveActorContext(input, authService);

        const body = readRequestBody(input);
        const lines = normalizeCustomLabelLines(body.lines);

        const job = await queryService.prisma.customPrintJob.create({
          data: {
            status: 'PENDING',
            // copies sempre 1 (o layout/impressao crava 1); nao gravamos o campo
            // pra nao sugerir uma configurabilidade que nao existe.
            payload: { lines },
          },
          select: { id: true, status: true, createdAt: true },
        });

        return {
          status: 201,
          body: { id: job.id, status: job.status, createdAt: job.createdAt.toISOString() },
        };
      }),

    getPendingCustomPrintJobs: (input) =>
      executeApiForInput(input, async () => {
        // Mesma politica do /print-queue/pending: qualquer sessao autenticada
        // (o print agent loga como usuario normal).
        await resolveActorContext(input, authService);
        const rows = await queryService.prisma.customPrintJob.findMany({
          where: { status: 'PENDING' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 10,
          select: { id: true, payload: true, printerId: true, createdAt: true },
        });
        return {
          status: 200,
          body: {
            items: rows.map((row) => ({
              jobId: row.id,
              kind: 'custom',
              payload: row.payload,
              printerId: row.printerId ?? null,
              createdAt: row.createdAt.toISOString(),
            })),
            total: rows.length,
          },
        };
      }),

    resolveCustomPrintJob: (input) =>
      executeApiForInput(input, async () => {
        // Mesma politica do getPendingCustomPrintJobs: qualquer sessao
        // autenticada (o print agent loga como usuario normal) — por design nao
        // ha identidade dedicada de agente pra restringir a esses dois handlers.
        await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
        if (jobId.length === 0) {
          throw new HttpError(422, 'jobId e obrigatorio');
        }
        const status = body.status === 'FAILED' ? 'FAILED' : 'DONE';
        const error =
          status === 'FAILED' && typeof body.error === 'string' ? body.error.slice(0, 500) : null;

        // updateMany com filtro status=PENDING torna o report idempotente:
        // reentrega do agente apos sucesso nao sobrescreve nem erra.
        const result = await queryService.prisma.customPrintJob.updateMany({
          where: { id: jobId, status: 'PENDING' },
          data: {
            status,
            error,
            // cap defensivo (espelha o .slice de `error`); printerId vem do
            // config do agente, nao de input de usuario, mas a coluna e ilimitada.
            printerId: typeof body.printerId === 'string' ? body.printerId.slice(0, 120) : null,
          },
        });

        return { status: 200, body: { ok: true, updated: result.count } };
      }),

    // Etiqueta de Envio (fase 3): fila lida pelo print agent na fase 5. Mesma
    // politica/forma dos handlers da CustomPrintJob.
    getPendingShippingPrintJobs: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const rows = await queryService.prisma.shippingPrintJob.findMany({
          where: { status: 'PENDING' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 10,
          select: { id: true, payload: true, printerId: true, createdAt: true },
        });
        return {
          status: 200,
          body: {
            items: rows.map((row) => ({
              jobId: row.id,
              kind: 'shipping',
              payload: row.payload,
              printerId: row.printerId ?? null,
              createdAt: row.createdAt.toISOString(),
            })),
            total: rows.length,
          },
        };
      }),

    resolveShippingPrintJob: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
        if (jobId.length === 0) {
          throw new HttpError(422, 'jobId e obrigatorio');
        }
        const status = body.status === 'FAILED' ? 'FAILED' : 'DONE';
        const error =
          status === 'FAILED' && typeof body.error === 'string' ? body.error.slice(0, 500) : null;

        // updateMany filtrando status=PENDING torna o report idempotente.
        const result = await queryService.prisma.shippingPrintJob.updateMany({
          where: { id: jobId, status: 'PENDING' },
          data: {
            status,
            error,
            printerId: typeof body.printerId === 'string' ? body.printerId.slice(0, 120) : null,
          },
        });

        return { status: 200, body: { ok: true, updated: result.count } };
      }),

    // Etiqueta de Envio (fase 4): rota PUBLICA do laudo (sem login). Valida o
    // token, checa revogacao (D8)/expiracao (D7), devolve os bytes do PDF
    // congelado e registra o acesso (analytics, best-effort). Rate-limit leve
    // por IP (P5). 404 = nao existe/arquivo sumido; 410 = revogado/expirado.
    servePublicReportShare: (input) =>
      executeApiForInput(input, async () => {
        if (!reportService) {
          throw new HttpError(501, 'Sample report service is not configured');
        }
        publicReportRateLimiter.check(readHeader(input?.headers ?? {}, 'x-forwarded-for') ?? null);

        const token = typeof input?.params?.token === 'string' ? input.params.token : '';
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
          throw new HttpError(404, 'Laudo nao encontrado', { code: 'REPORT_NOT_FOUND' });
        }

        const share = await queryService.prisma.sampleReportShare.findUnique({
          where: { token },
        });
        if (!share) {
          throw new HttpError(404, 'Laudo nao encontrado', { code: 'REPORT_NOT_FOUND' });
        }
        if (share.revokedAt) {
          throw new HttpError(410, 'Laudo revogado', { code: 'REPORT_REVOKED' });
        }
        if (share.expiresAt.getTime() < Date.now()) {
          throw new HttpError(410, 'Laudo expirado', { code: 'REPORT_EXPIRED' });
        }

        let buffer;
        try {
          buffer = await reportService.readPersistedReport(share.storagePath);
        } catch {
          throw new HttpError(404, 'Laudo nao encontrado', { code: 'REPORT_FILE_MISSING' });
        }

        // Analytics de leitura — best-effort, nao bloqueia a entrega do PDF.
        queryService.prisma.sampleReportShare
          .update({
            where: { id: share.id },
            data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
          })
          .catch(() => {});

        return {
          status: 200,
          body: { buffer, contentType: 'application/pdf', fileName: share.fileName },
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
            isWarehouse: query.isWarehouse,
            commercialUserId: query.commercialUserId,
            commercialUserIds: query.commercialUserIds,
            completeness: query.completeness,
            // 14.6.C: cursor alfabetico (substitui cursorCreatedAt de 14.4.A
            // que nunca chegou aqui — bug latente, scroll infinito do
            // /clients re-baixava a primeira pagina sempre).
            cursorDisplayName: readOptionalQueryString(query.cursorDisplayName),
            cursorId: readOptionalQueryString(query.cursorId),
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

        // Q-01: query param `onlyActive=true` filtra units inativas do
        // payload retornado. Aceita 'true' (string) ou true (boolean).
        const onlyActiveRaw = input?.query?.onlyActive;
        const onlyActiveUnits = onlyActiveRaw === true || onlyActiveRaw === 'true';

        const result = await clientService.getClient(clientId, actor, { onlyActiveUnits });
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

        // #5/Q-02: idempotency-key wrap. Scope inclui actorUserId (T8).
        return withIdempotency({
          store: idempotencyStore,
          scope: buildScopeKey(IDEMPOTENCY_SCOPES.CREATE_CLIENT, actor?.actorUserId),
          headers: input?.headers,
          handler: async () => {
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
              isWarehouse: body.isWarehouse,
            };
            // L5: PJ guarda cnpj/endereco/IE direto no Client.
            assignIfDefined(createPayload, 'cnpj', body.cnpj);
            assignIfDefined(createPayload, 'registrationNumber', body.registrationNumber);
            assignIfDefined(createPayload, 'addressLine', body.addressLine);
            assignIfDefined(createPayload, 'district', body.district);
            assignIfDefined(createPayload, 'city', body.city);
            assignIfDefined(createPayload, 'state', body.state);
            assignIfDefined(createPayload, 'postalCode', body.postalCode);
            assignIfDefined(createPayload, 'complement', body.complement);
            assignIfDefined(createPayload, 'email', body.email);
            assignIfDefined(createPayload, 'commercialUserId', body.commercialUserId);
            assignIfDefined(createPayload, 'commercialUserIds', body.commercialUserIds);
            assignIfDefined(createPayload, 'units', body.units);

            const result = await clientService.createClient(createPayload, actor);

            return {
              status: 201,
              body: result,
            };
          },
        });
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
        // L5: campos PJ no Client direto.
        assignIfDefined(updatePayload, 'cnpj', body.cnpj);
        assignIfDefined(updatePayload, 'registrationNumber', body.registrationNumber);
        assignIfDefined(updatePayload, 'addressLine', body.addressLine);
        assignIfDefined(updatePayload, 'district', body.district);
        assignIfDefined(updatePayload, 'city', body.city);
        assignIfDefined(updatePayload, 'state', body.state);
        assignIfDefined(updatePayload, 'postalCode', body.postalCode);
        assignIfDefined(updatePayload, 'complement', body.complement);
        assignIfDefined(updatePayload, 'email', body.email);
        assignIfDefined(updatePayload, 'phone', body.phone);
        assignIfDefined(updatePayload, 'isBuyer', body.isBuyer);
        assignIfDefined(updatePayload, 'isSeller', body.isSeller);
        assignIfDefined(updatePayload, 'isWarehouse', body.isWarehouse);
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
            status: input?.query?.status,
            page: input?.query?.page,
            limit: input?.query?.limit,
          },
          actor
        );
        return { status: 200, body: result };
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
          { page: input?.query?.page, limit: input?.query?.limit },
          actor
        );
        return { status: 200, body: result };
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

    // #6/Q-05+Q-08: inativacao em cascata. Confirma os IDs das samples
    // ATIVAS que serao invalidadas junto. Body: { confirmedSampleIds, reasonText? }.
    inactivateClientWithCascade: (input) =>
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
        const result = await clientService.inactivateClientWithCascade(
          clientId,
          {
            confirmedSampleIds: body.confirmedSampleIds,
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

    createClientUnit: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }

        // #5/Q-02: idempotency-key wrap. Scope inclui actorUserId (T8).
        return withIdempotency({
          store: idempotencyStore,
          scope: buildScopeKey(IDEMPOTENCY_SCOPES.CREATE_CLIENT_UNIT, actor?.actorUserId),
          headers: input?.headers,
          handler: async () => {
            const body = readRequestBody(input);
            const result = await clientService.createUnit(clientId, body, actor);
            return {
              status: 201,
              body: result,
            };
          },
        });
      }),

    updateClientUnit: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        const unitId = input?.params?.unitId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }
        if (typeof unitId !== 'string' || unitId.length === 0) {
          throw new HttpError(422, 'unitId path param is required');
        }
        const body = readRequestBody(input);

        const result = await clientService.updateUnit(clientId, unitId, body, actor);

        return {
          status: 200,
          body: result,
        };
      }),

    inactivateClientUnit: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        const unitId = input?.params?.unitId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }
        if (typeof unitId !== 'string' || unitId.length === 0) {
          throw new HttpError(422, 'unitId path param is required');
        }
        const body = readRequestBody(input);

        const result = await clientService.inactivateUnit(
          clientId,
          unitId,
          { reasonText: body.reasonText },
          actor
        );

        return {
          status: 200,
          body: result,
        };
      }),

    reactivateClientUnit: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const clientId = input?.params?.clientId;
        const unitId = input?.params?.unitId;
        if (typeof clientId !== 'string' || clientId.length === 0) {
          throw new HttpError(422, 'clientId path param is required');
        }
        if (typeof unitId !== 'string' || unitId.length === 0) {
          throw new HttpError(422, 'unitId path param is required');
        }
        const body = readRequestBody(input);

        const result = await clientService.reactivateUnit(
          clientId,
          unitId,
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
            // Q.cls.2.7: reasonCode/reasonText opcionais — usados na
            // reclassificacao (sub-caminho 5). Em new classification
            // o backend ignora.
            reasonCode: body.reasonCode ?? null,
            reasonText: body.reasonText ?? null,
          },
          actor
        );

        return { status: result.statusCode, body: result };
      }),

    // ============================================================
    // Informe de visita (pagina /informe + listagem admin /resumo)
    // ============================================================

    createVisitReport: (input) =>
      executeApiForInput(input, async () => {
        if (!visitReportService) {
          throw new HttpError(501, 'Visit report service is not configured');
        }

        // Qualquer papel autenticado envia; o service carimba userId do
        // ator e o banco carimba createdAt. capturedAt (opcional) e a hora
        // local do preenchimento quando o envio veio da fila offline.
        const actor = await resolveActorContext(input, authService);

        // Fila offline reenvia com Idempotency-Key = id gerado no aparelho;
        // replay devolve o registro ja criado em vez de duplicar (T8: scope
        // isolado por usuario).
        return withIdempotency({
          store: idempotencyStore,
          scope: buildScopeKey(IDEMPOTENCY_SCOPES.CREATE_VISIT_REPORT, actor?.actorUserId),
          headers: input?.headers,
          handler: async () => {
            const body = readRequestBody(input);
            const result = await visitReportService.createVisitReport(
              {
                clientKind: body.clientKind,
                clientId: body.clientId,
                newClientName: body.newClientName,
                newClientCity: body.newClientCity,
                newClientPhone: body.newClientPhone,
                farmSize: body.farmSize,
                farmSizeNotes: body.farmSizeNotes,
                interestLevel: body.interestLevel,
                interestNotes: body.interestNotes,
                sellsCurrently: body.sellsCurrently,
                sellsToWhom: body.sellsToWhom,
                generalNotes: body.generalNotes,
                capturedAt: body.capturedAt,
              },
              actor
            );

            return { status: 201, body: result };
          },
        });
      }),

    deleteVisitReport: (input) =>
      executeApiForInput(input, async () => {
        if (!visitReportService) {
          throw new HttpError(501, 'Visit report service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const reportId = input?.params?.reportId;
        if (typeof reportId !== 'string' || reportId.length === 0) {
          throw new HttpError(422, 'reportId path param is required');
        }

        const result = await visitReportService.deleteVisitReport({ reportId }, actor);
        return { status: 200, body: result };
      }),

    linkVisitReportClient: (input) =>
      executeApiForInput(input, async () => {
        if (!visitReportService) {
          throw new HttpError(501, 'Visit report service is not configured');
        }

        // Curadoria do /resumo (ADMIN/CADASTRO): seta/troca/remove o
        // cliente vinculado de um informe. Body {clientId: string | null}
        // — null desvincula; a regra de papel fica no service.
        const actor = await resolveActorContext(input, authService);
        const reportId = input?.params?.reportId;
        if (typeof reportId !== 'string' || reportId.length === 0) {
          throw new HttpError(422, 'reportId path param is required');
        }

        const body = readRequestBody(input);
        const result = await visitReportService.linkVisitReportClient(
          { reportId, clientId: body.clientId },
          actor
        );

        return { status: 200, body: result };
      }),

    listVisitReports: (input) =>
      executeApiForInput(input, async () => {
        if (!visitReportService) {
          throw new HttpError(501, 'Visit report service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const query = input?.query ?? {};
        const result = await visitReportService.listVisitReports(
          {
            page: query.page,
            limit: query.limit,
            search: query.search,
          },
          actor
        );

        return { status: 200, body: result };
      }),

    getMyVisitReportStats: (input) =>
      executeApiForInput(input, async () => {
        if (!visitReportService) {
          throw new HttpError(501, 'Visit report service is not configured');
        }

        // Contadores do dashboard do prospector — sempre do proprio ator.
        const actor = await resolveActorContext(input, authService);
        const result = await visitReportService.getMyVisitReportStats(actor);

        return { status: 200, body: result };
      }),

    // ============================================================
    // Formularios do comercial (pagina /informe do papel COMMERCIAL)
    // ============================================================

    createCommercialVisit: (input) =>
      executeApiForInput(input, async () => {
        if (!commercialFormsService) {
          throw new HttpError(501, 'Commercial forms service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await commercialFormsService.createCommercialVisit(
          {
            clientKind: body.clientKind,
            clientId: body.clientId,
            newClientName: body.newClientName,
            newClientCity: body.newClientCity,
            newClientPhone: body.newClientPhone,
            reason: body.reason,
            outcome: body.outcome,
            outcomeNotes: body.outcomeNotes,
            generalNotes: body.generalNotes,
          },
          actor
        );

        return { status: 201, body: result };
      }),

    deleteCommercialVisit: (input) =>
      executeApiForInput(input, async () => {
        if (!commercialFormsService) {
          throw new HttpError(501, 'Commercial forms service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const visitId = input?.params?.visitId;
        if (typeof visitId !== 'string' || visitId.length === 0) {
          throw new HttpError(422, 'visitId path param is required');
        }

        const result = await commercialFormsService.deleteCommercialVisit({ visitId }, actor);
        return { status: 200, body: result };
      }),

    linkCommercialVisitClient: (input) =>
      executeApiForInput(input, async () => {
        if (!commercialFormsService) {
          throw new HttpError(501, 'Commercial forms service is not configured');
        }

        // Curadoria do /resumo (ADMIN/CADASTRO): seta/troca/remove o cliente
        // vinculado de uma VISITA COMERCIAL — so quando clientKind=NEW (a regra
        // de papel + o gate NEW ficam no service). Body {clientId: string |
        // null} — null desvincula.
        const actor = await resolveActorContext(input, authService);
        const visitId = input?.params?.visitId;
        if (typeof visitId !== 'string' || visitId.length === 0) {
          throw new HttpError(422, 'visitId path param is required');
        }

        const body = readRequestBody(input);
        const result = await commercialFormsService.linkCommercialVisitClient(
          { visitId, clientId: body.clientId },
          actor
        );

        return { status: 200, body: result };
      }),

    createWeeklyReport: (input) =>
      executeApiForInput(input, async () => {
        if (!commercialFormsService) {
          throw new HttpError(501, 'Commercial forms service is not configured');
        }

        // A semana de referencia e SEMPRE computada no servidor.
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await commercialFormsService.createWeeklyReport(
          {
            summary: body.summary,
            difficulties: body.difficulties,
            nextWeekPlan: body.nextWeekPlan,
          },
          actor
        );

        return { status: 201, body: result };
      }),

    deleteWeeklyReport: (input) =>
      executeApiForInput(input, async () => {
        if (!commercialFormsService) {
          throw new HttpError(501, 'Commercial forms service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const reportId = input?.params?.reportId;
        if (typeof reportId !== 'string' || reportId.length === 0) {
          throw new HttpError(422, 'reportId path param is required');
        }

        const result = await commercialFormsService.deleteWeeklyReport({ reportId }, actor);
        return { status: 200, body: result };
      }),

    listInformeFeed: (input) =>
      executeApiForInput(input, async () => {
        if (!commercialFormsService) {
          throw new HttpError(501, 'Commercial forms service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const query = input?.query ?? {};
        const result = await commercialFormsService.listInformeFeed(
          {
            scope: query.scope,
            page: query.page,
            limit: query.limit,
          },
          actor
        );

        return { status: 200, body: result };
      }),

    // ============================================================
    // Web Push (inscricoes de notificacao nativa)
    // ============================================================

    getPushConfig: (input) =>
      executeApiForInput(input, async () => {
        if (!pushService) {
          throw new HttpError(501, 'Push service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        // endpoint (opcional) permite ao card do Perfil saber se ESTE
        // aparelho esta inscrito para o usuario logado.
        const status = await pushService.getSubscriptionStatus(
          { endpoint: input?.query?.endpoint },
          actor
        );

        return {
          status: 200,
          body: {
            publicKey: pushService.getPublicKey(),
            subscribed: status.subscribed,
          },
        };
      }),

    savePushSubscription: (input) =>
      executeApiForInput(input, async () => {
        if (!pushService) {
          throw new HttpError(501, 'Push service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await pushService.saveSubscription(
          {
            endpoint: body.endpoint,
            keys: body.keys,
            userAgent: body.userAgent ?? readHeader(input?.headers ?? {}, 'user-agent'),
          },
          actor
        );

        return { status: 201, body: result };
      }),

    deletePushSubscription: (input) =>
      executeApiForInput(input, async () => {
        if (!pushService) {
          throw new HttpError(501, 'Push service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await pushService.removeSubscription({ endpoint: body.endpoint }, actor);

        return { status: 200, body: result };
      }),
  };

  // Carimba o nome do metodo no input de cada chamada — consumido pelo
  // gate de papel do PROSPECTOR dentro de resolveActorContext (enforcement
  // central; ver src/auth/prospector-access.js). Mutar as propriedades do
  // MESMO objeto literal preserva a inferencia de tipos que alimenta
  // BackendMethodName em app/api/v1/_lib/adapter.ts e cobre tambem quem
  // chama a API direto (testes de integracao), nao so as rotas Next.
  for (const name of Object.keys(api)) {
    const original = api[name];
    api[name] = (input) => original({ ...input, methodName: name });
  }

  return api;
}
