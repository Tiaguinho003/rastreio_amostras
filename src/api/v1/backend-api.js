import { randomUUID } from 'node:crypto';

import { HttpError } from '../../contracts/errors.js';
import { readSessionTokenFromCookieHeader } from '../../auth/session-cookie.js';
import { createRateLimiter } from '../../auth/rate-limiter.js';
import { PROSPECTOR_ALLOWED_API_METHODS } from '../../auth/prospector-access.js';
import { USER_ROLES } from '../../auth/roles.js';
import { executeApi, readPositiveInteger } from '../http-utils.js';
import { IDEMPOTENCY_SCOPES, buildScopeKey, withIdempotency } from './idempotency-helper.js';
import { getContractIssuer } from '../../sale-contracts/issuer-config.js';
import {
  APPROVAL_ELIGIBLE_STATUSES,
  assertEspelhoEligible,
  buildApprovalPrefill,
  buildEspelhoSnapshot,
  splitOriginLotForLabel,
} from '../../sale-contracts/sale-contract-support.js';
import { REGISTRATION_UPDATE_ALLOWED_STATUSES } from '../../samples/sample-command-service.js';
import { formatHarvestLabel, normalizeReportedHarvest } from '../../reports/export-fields.js';

const loginRateLimiter = createRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 10,
});

// Rate-limit HTTP das 3 rotas publicas de esqueci-a-senha (request/verify/
// reset), POR IP — mesma primitiva e mesmos envs/defaults do login. Best-
// effort (XFF spoofavel); o freio por-usuario continua sendo o throttle da
// tabela passwordResetRequest (resend 60s, retry 5min, 5 tentativas).
const passwordResetRateLimiter = createRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 10,
});

// Rate-limit da rota publica do laudo POR IP — BEST-EFFORT: o `x-forwarded-for`
// vem do request e e SPOOFAVEL (um atacante forja o header e troca de chave a
// cada request). Pega cliente normal/bot ingenuo, mas NAO um atacante que forja
// XFF. O cap REAL contra DoS de render e o limite POR TOKEN abaixo.
const publicReportRateLimiter = createRateLimiter({
  windowMs: Number(process.env.PUBLIC_REPORT_RATE_LIMIT_WINDOW_MS) || 60_000,
  maxRequests: Number(process.env.PUBLIC_REPORT_RATE_LIMIT_MAX_REQUESTS) || 60,
});

// Rate-limit da rota publica do laudo POR TOKEN — defesa primaria: a chave e o
// proprio share na URL (NAO forjavel), entao limita diretamente a operacao cara
// (gerar o laudo daquele share) por mais que o atacante troque de IP/XFF.
// In-memory por instancia (no Cloud Run multi-instancia o cap efetivo e Nx —
// aceitavel p/ este endpoint; store compartilhado seria o passo seguinte).
const publicReportTokenRateLimiter = createRateLimiter({
  windowMs: Number(process.env.PUBLIC_REPORT_TOKEN_RATE_LIMIT_WINDOW_MS) || 60_000,
  maxRequests: Number(process.env.PUBLIC_REPORT_TOKEN_RATE_LIMIT_MAX_REQUESTS) || 30,
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

// Guarda de FORMA da linha de lotes. Desde a RC-D100 o recorte de exibicao (8)
// e do splitOriginLotForLabel, entao esta linha nunca mais chega perto do teto —
// ele sobrevive como defesa contra um chamador que monte a linha na mao.
const MAX_CUSTOM_LOTS = 16;

// Nome do arquivo do Espelho. Extraido porque a releitura de um espelho guardado
// (RC-D103, ?logId=) precisa do MESMO nome do que foi entregue.
function espelhoFileName(contractNumber, side) {
  const sideTag = side === 'seller' ? 'vendedor' : 'comprador';
  return `espelho-corretagem-${String(contractNumber ?? '').replace('/', '-')}-${sideTag}.pdf`;
}

// Etiqueta de Aprovacao (o formulario da ABA Aprovacao do detalhe do contrato —
// RC-D126/D127; antes era um modal aberto pela worklist, e as duas coisas
// morreram). Valida/normaliza as linhas { label, value } que o formulario envia;
// o agente as renderiza como rotulo:valor (sem QR). Generico de proposito: quem
// decide os rotulos e o front, o backend so sanitiza tamanho/forma e valida a
// contagem de lotes.
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
    // (manter em sincronia).
    //
    // RC-D100: desde que o campo virou EDITAVEL, o modal manda o texto CRU do
    // lote de origem (o mesmo que vai pro cadastro), nao a lista ja recortada.
    // Quem recorta pro papel e o splitOriginLotForLabel — a MESMA funcao do
    // prefill, agora tambem no envio: a regra dos 16 chars por codigo e do
    // 7 + "+" acima de 8 passa a viver num lugar so. De quebra, o cap de
    // MAX_CUSTOM_LOTS deixa de ser alcancavel por esta linha (o recorte para
    // em 8), e o separador passa a ser o canonico [\s,;] — o mesmo do
    // OriginLotChips e do deriveBlendOriginLot, que o antigo [,\n] contrariava.
    const isLots = label.replace(/[°º:]/g, '').replace(/\s+/g, ' ').trim().toUpperCase() === 'LOTE';
    if (isLots) {
      const lots = splitOriginLotForLabel(value);
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

// Guard barato de UUID pros handlers approval-labels: id malformado em coluna
// @db.Uuid derruba o Prisma com P2023 (500) — aqui vira 404 limpo, ja que
// esses endpoints sao chamados por QUALQUER papel nao-PROSPECTOR.
const APPROVAL_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function executeApiForInput(input, handler) {
  const requestId = readHeader(input?.headers ?? {}, 'x-request-id') ?? null;
  return executeApi(handler, { requestId });
}

export function createBackendApiV1({
  authService = null,
  userService = null,
  clientService = null,
  brokerService = null,
  clientBankAccountService = null,
  clientAttachmentService = null,
  saleContractService = null,
  saleContractPdfService = null,
  visitReportService = null,
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

  // Etiqueta de Envio: enfileira a impressao da etiqueta (best-effort, mesmo
  // padrao desacoplado da CustomPrintJob). token/qrUrl sempre vem preenchidos
  // agora (etiqueta unificada COM QR para qualquer status). Se o insert falhar, o
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
            // Liga (safra "Mix"): sem escolha (envios novos), uma liga
            // multi-safra imprime "Mix — 24/25, 25/26" na etiqueta; safra unica
            // passa direto. Escolha gravada (shares antigos) segue single.
            harvest: reportedHarvest ?? formatHarvestLabel(sample.declared?.harvest ?? null),
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
            // ownerUnitId nao e mais repassado (LNW-I1): o binding do dono
            // descarta a unidade desde a era "lote sem fazenda".
            sacks: body.sacks,
            harvest: body.harvest,
            originLot: body.originLot,
            location: body.location,
            receivedChannel: body.receivedChannel,
            notes: body.notes ?? null,
            // Lote editavel: numero manual + data de chegada informados no
            // modal. LNW-B1: o numero fixo SO passa com a flag manual=true —
            // sem ela, um sampleLotNumber cru pularia a validacao
            // (normalizeManualLotNumber) e uma colisao viraria 500. O caminho
            // direto do service segue aceitando numero fixo sem flag
            // (testes/imports).
            sampleLotNumber: body.lotNumberManual === true ? body.sampleLotNumber : null,
            lotNumberManual: body.lotNumberManual === true,
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

    // CL13 (auditoria 2026-07-13): dispatch completeClassification removido
    // junto com a rota DEPRECATED /classification/complete. O metodo do
    // command service continua existindo (harness dos testes de integracao).

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
          // RC-D30: so lote que da venda (saldo declarado + liga viavel).
          // Consumido pelo picker de lote do contrato a vista.
          sellableOnly: readOptionalQueryString(query.sellableOnly) === 'true',
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

    // Autorizacao da foto do anexo: a rota binaria de foto (que serve os bytes
    // direto do disco) NAO passa pelo executeBackend (resposta binaria), entao
    // delega a auth aqui. resolveActorContext garante sessao + barra PROSPECTOR
    // pela allowlist (metodo fora dela => 403). Devolve so o descritor
    // (storagePath + mimeType); a leitura do arquivo fica na rota.
    getSampleAttachmentDescriptor: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const sampleId = requireSampleId(input?.params);
        const attachmentId = input?.params?.attachmentId;
        if (typeof attachmentId !== 'string' || attachmentId.length === 0) {
          throw new HttpError(422, 'attachmentId path param is required');
        }

        const descriptor = await queryService.findAttachmentForSample(sampleId, attachmentId);
        if (!descriptor) {
          throw new HttpError(404, 'Attachment not found', { code: 'ATTACHMENT_NOT_FOUND' });
        }

        return {
          status: 200,
          body: descriptor,
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

        // Etiqueta unificada (laudo ao vivo): TODO envio cria o
        // SampleReportShare (token) e a etiqueta sai sempre COM QR — classificada
        // ou nao. O PDF NAO e congelado; a rota publica /laudo/[token] o gera ao
        // vivo a cada acesso, refletindo o estado atual da amostra. A safra do
        // laudo: numa liga sem escolha explicita, reportedHarvest fica null e o
        // laudo renderiza "Mix" + as safras + % (a escolha forcada de UMA safra
        // foi removida). Uma escolha explicita ainda e validada contra as safras.
        const reportedHarvest = normalizeReportedHarvest(
          body.reportedHarvest ?? null,
          sample.declared?.harvest ?? null
        );

        const result = await commandService.recordPhysicalSampleSentWithReport(
          { sampleId, recipientClientId: body.recipientClientId, sentDate: body.sentDate },
          { reportedHarvest, recipientSnapshot: recipient },
          actor
        );

        const qrUrl = buildLaudoReportUrl(result.share.token);
        await enqueueShippingLabel({
          sample,
          recipient,
          sentDate: result.event.payload?.sentDate ?? body.sentDate ?? null,
          reportedHarvest,
          sendEventId: result.event.eventId,
          token: result.share.token,
          qrUrl,
        });

        return {
          status: 201,
          body: { event: result.event, share: result.share, qrUrl },
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
            // Fechamento (Fase B.2): termos do contrato (venda a vista).
            unitPrice: body.unitPrice,
            sellerBrokeragePct: body.sellerBrokeragePct,
            buyerBrokeragePct: body.buyerBrokeragePct,
            brokerIds: body.brokerIds,
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

        // RC-D87: esta rota NAO passa `washoutBillable` de proposito. Cancelar um
        // movimento com contrato quebra o contrato (-> WASH_OUT), e isso so pode
        // acontecer pelo washout, que pergunta a corretagem (RC-D89). O guard vive
        // no commandService (mesmo lugar do SAMPLE_HAS_CONTRACT do invalidateSample)
        // e recusa com 409 MOVEMENT_HAS_CONTRACT quem chega sem a resposta.
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

    // FV /samples: KPI row da lista de Lotes (Total/Em aberto/Lotes
    // vendidos/Aguardando classificacao). So autenticacao, como os demais
    // endpoints de amostra; PROSPECTOR cai no 403 da allowlist central.
    getSampleStats: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const result = await queryService.getSampleStats();
        return {
          status: 200,
          body: result,
        };
      }),

    // Card "Amostras enviadas" da pagina de Lotes (DSB-D14; nasceu no dashboard,
    // DSH-D5). So autenticacao, sem gate positivo de papel (DSH-D2); PROSPECTOR
    // cai no 403 da allowlist central.
    getSampleRecentSends: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const result = await queryService.getRecentSampleSends();
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
    // Fila da Etiqueta de Aprovacao (custom_print_job): consumo pelo print
    // agent (poll /pending + report /result), separada do fluxo das amostras.
    // O ENFILEIRAMENTO migrou pro sendApprovalLabel (Fase I, D112-D119) —
    // auditado, com ator + vinculo opcional ao contrato na mesma transacao.
    // ============================================================

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

    // ============================================================
    // Aprovacao do contrato (Fase I — D112-D119): a Etiqueta de Aprovacao
    // vira marco AUDITADO. Prefill + envio auditado (o seletor de contratos
    // do /samples saiu com a AP29; a sub-aba que o sucedeu morreu com a
    // /embarques, e desde a RC-D126 a geracao e a ABA Aprovacao do detalhe).
    // Gate = qualquer autenticado nao-PROSPECTOR (metodos fora da allowlist
    // do prospector); SEM posse por contrato — excecao deliberada da
    // D110/D113: COMMERCIAL etiqueta contrato de terceiros por aqui, e
    // CLASSIFIER/REGISTRATION/CADASTRO etiquetam sem acesso a /contratos.
    // NUNCA reusar a view completa do contrato nesses handlers (vaza
    // financeiro + PII dos snapshots) — so os selects minimos abaixo.
    // ============================================================

    getApprovalLabelPrefill: (input) =>
      executeApiForInput(input, async () => {
        await resolveActorContext(input, authService);
        const contractId =
          typeof input?.params?.contractId === 'string' ? input.params.contractId.trim() : '';
        if (contractId.length === 0) {
          throw new HttpError(422, 'contractId e obrigatorio');
        }
        if (!APPROVAL_UUID_REGEX.test(contractId)) {
          // Malformado = inexistente (404 limpo em vez de P2023/500).
          throw new HttpError(404, 'Contrato nao encontrado');
        }
        const contract = await queryService.prisma.saleContract.findUnique({
          where: { id: contractId },
          select: {
            id: true,
            status: true,
            requiresApproval: true,
            purchaseNumber: true,
            contractNumber: true,
            sellerSnapshot: true,
            sellerWarehouseSnapshot: true,
            quantitySacks: true,
            sampleId: true,
            // RC-D99: o expectedVersion da cascata do Nº compra.
            version: true,
          },
        });
        if (!contract) {
          throw new HttpError(404, 'Contrato nao encontrado');
        }
        // Portao AP17: so se gera etiqueta de contrato MARCADO ("Sim"). Defesa no
        // backend — a UI so busca o prefill quando `requiresApproval` (RC-D126),
        // mas o gate fecha o caminho de quem chamar a rota direto.
        if (!contract.requiresApproval) {
          throw new HttpError(409, 'Contrato nao esta marcado para aprovacao', {
            code: 'APPROVAL_CONTRACT_NOT_MARKED',
          });
        }
        if (!APPROVAL_ELIGIBLE_STATUSES.includes(contract.status)) {
          throw new HttpError(409, 'Contrato nao esta elegivel para aprovacao', {
            code: 'APPROVAL_CONTRACT_NOT_ELIGIBLE',
          });
        }
        // Lotes: a vista le o "Lote de origem" da amostra vinculada; Futuro
        // (sem amostra) resulta em lotes vazios (D116). A LIGA tem origem sim —
        // a somatoria das origens dos componentes (deriveBlendOriginLot) —, ao
        // contrario do que este comentario afirmava antes da derivacao reativa.
        //
        // RC-D100: aqui tambem se decide se o campo e EDITAVEL no modal. Trava
        // nos tres casos em que a escrita teria efeito alem do lote: liga (o
        // updateRegistration fixaria a derivacao pra sempre), componente de liga
        // (propagaria pras ancestrais, e o servico exige confirmacao explicita) e
        // status fora da janela do updateRegistration.
        let originLotText = null;
        let originLotLockReason = 'NO_SAMPLE';
        let sampleVersion = null;
        if (contract.sampleId) {
          const sample = await queryService.prisma.sample.findUnique({
            where: { id: contract.sampleId },
            select: { declaredOriginLot: true, isBlend: true, status: true, version: true },
          });
          originLotText = sample?.declaredOriginLot ?? null;
          sampleVersion = sample?.version ?? null;
          if (!sample) {
            originLotLockReason = 'NO_SAMPLE';
          } else if (sample.isBlend) {
            originLotLockReason = 'BLEND';
          } else if (!REGISTRATION_UPDATE_ALLOWED_STATUSES.includes(sample.status)) {
            originLotLockReason = 'SAMPLE_STATUS';
          } else {
            // Uma linha basta: se o lote e origem de QUALQUER liga, editar
            // propaga. O indice idx_blend_component_origin cobre a busca.
            const component = await queryService.prisma.sampleBlendComponent.findFirst({
              where: { originSampleId: contract.sampleId },
              select: { id: true },
            });
            originLotLockReason = component ? 'BLEND_COMPONENT' : null;
          }
        }
        return {
          status: 200,
          body: buildApprovalPrefill({
            ...contract,
            originLotText,
            contractVersion: contract.version,
            originLotLockReason,
            sampleId: contract.sampleId,
            sampleVersion,
          }),
        };
      }),

    sendApprovalLabel: (input) =>
      executeApiForInput(input, async () => {
        // CAPTURA o ator (a diferenca central pro enqueue antigo, que
        // descartava o retorno): a auditoria exige o actorUserId.
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const lines = normalizeCustomLabelLines(body.lines);
        if (lines.every((line) => line.value.length === 0)) {
          // Regra ">=1 campo" (D118) agora tambem no backend (era so no modal).
          throw new HttpError(422, 'Preencha ao menos um campo para imprimir.', {
            code: 'APPROVAL_LABEL_EMPTY',
          });
        }

        const rawContractId =
          typeof body.saleContractId === 'string' ? body.saleContractId.trim() : '';
        const saleContractId = rawContractId.length > 0 ? rawContractId : null;
        // Reforma AP12: NAO ha aprovacao sem contrato (o "Manual"/avulsa foi removido).
        // Vem DEPOIS do guard de linhas-vazias, pra preservar o APPROVAL_LABEL_EMPTY.
        if (!saleContractId) {
          throw new HttpError(422, 'Selecione um contrato para a etiqueta.', {
            code: 'APPROVAL_CONTRACT_REQUIRED',
          });
        }
        if (!APPROVAL_UUID_REGEX.test(saleContractId)) {
          throw new HttpError(404, 'Contrato nao encontrado');
        }
        const contract = await queryService.prisma.saleContract.findUnique({
          where: { id: saleContractId },
          select: { status: true, requiresApproval: true },
        });
        if (!contract) {
          throw new HttpError(404, 'Contrato nao encontrado');
        }
        // Portao AP17: so se gera etiqueta de contrato MARCADO ("Sim"). Fecha a
        // divergencia "enviou sem marcar" (a AP8 permitia) — vem antes da
        // elegibilidade pra dar o motivo certo (nao-marcado != nao-elegivel).
        if (!contract.requiresApproval) {
          throw new HttpError(409, 'Contrato nao esta marcado para aprovacao', {
            code: 'APPROVAL_CONTRACT_NOT_MARKED',
          });
        }
        if (!APPROVAL_ELIGIBLE_STATUSES.includes(contract.status)) {
          throw new HttpError(409, 'Contrato nao esta elegivel para aprovacao', {
            code: 'APPROVAL_CONTRACT_NOT_ELIGIBLE',
          });
        }

        // Job + auditoria na MESMA tx (D114): falha em qualquer um desfaz os
        // dois — nunca imprime sem registrar, nem registra sem enfileirar.
        // saleContractId sempre presente (AP12: nao ha mais avulsa). Avulsas
        // historicas (sale_contract_id NULL) permanecem no banco.
        const result = await queryService.prisma.$transaction(async (tx) => {
          const job = await tx.customPrintJob.create({
            data: {
              status: 'PENDING',
              // copies sempre 1 (o layout/impressao crava 1) — igual ao fluxo
              // do enqueue antigo.
              payload: { lines },
            },
            select: { id: true, createdAt: true },
          });
          const log = await tx.approvalLabelLog.create({
            data: {
              id: randomUUID(),
              saleContractId,
              actorUserId: actor.actorUserId ?? null,
              customPrintJobId: job.id,
              // As MESMAS linhas normalizadas que foram pro job: audita-se o
              // ENVIO (o desfecho DONE/FAILED fica no proprio job).
              payload: { lines },
            },
            select: { id: true },
          });
          return { job, log };
        });

        return {
          status: 201,
          body: {
            id: result.log.id,
            customPrintJobId: result.job.id,
            createdAt: result.job.createdAt.toISOString(),
          },
        };
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

    // Etiqueta de Envio: rota PUBLICA do laudo (sem login). Valida o token, checa
    // revogacao (D8)/expiracao (D7), GERA o PDF do laudo ao vivo (estado atual da
    // amostra) e registra o acesso (analytics, best-effort). Rate-limit leve por
    // IP (P5). 404 = nao existe/falha ao gerar; 410 = revogado/expirado.
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

        // Cap a prova de bypass (chave = o token na URL, nao forjavel): limita o
        // numero de geracoes por share, por mais que o atacante troque de IP/XFF.
        publicReportTokenRateLimiter.check(token);

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

        // Laudo gerado ao vivo a partir do estado ATUAL da amostra: classificar
        // depois do envio reflete no mesmo QR. O destino (cabecalho) e a safra
        // (anti-vazamento de liga) vem congelados no share. Falha ao gerar =>
        // 404 (a pagina publica nunca vaza erro interno).
        let rendered;
        try {
          rendered = await reportService.renderReportPdfLive({
            sampleId: share.sampleId,
            destination: share.recipientSnapshot?.displayName ?? null,
            reportedHarvest: share.reportedHarvest,
          });
        } catch (cause) {
          // Falha REAL de geracao (nao "nao encontrado"): loga p/ diagnostico e
          // alerta de 5xx. NUNCA loga o token (segredo) — usa share.id/sampleId.
          console.error('[laudo] falha ao gerar o laudo ao vivo', {
            shareId: share.id,
            sampleId: share.sampleId,
            cause,
          });
          throw new HttpError(500, 'Falha ao gerar o laudo', { code: 'REPORT_RENDER_FAILED' });
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
          body: {
            buffer: rendered.buffer,
            contentType: 'application/pdf',
            fileName: rendered.fileName,
          },
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

    // RD14: KPI row de /cadastros (Total/Ativos/Incompletos/Novos no mes).
    // Auth-only como os demais endpoints de cliente; PROSPECTOR cai no 403 da
    // allowlist central (metodo fora de PROSPECTOR_ALLOWED_API_METHODS).
    getClientStats: (input) =>
      executeApiForInput(input, async () => {
        if (!clientService) {
          throw new HttpError(501, 'Client service is not configured');
        }

        const actor = await resolveActorContext(input, authService);
        const result = await clientService.getClientStats(actor);

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

        passwordResetRateLimiter.check(readHeader(input?.headers ?? {}, 'x-forwarded-for') ?? null);

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

        passwordResetRateLimiter.check(readHeader(input?.headers ?? {}, 'x-forwarded-for') ?? null);

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

        passwordResetRateLimiter.check(readHeader(input?.headers ?? {}, 'x-forwarded-for') ?? null);

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
            limit: query.limit,
            search: query.search,
            role: query.role,
            status: query.status,
            cursorFullName: readOptionalQueryString(query.cursorFullName),
            cursorId: readOptionalQueryString(query.cursorId),
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
    // Relatorios (pagina "Relatorios", rota /relatorios): visita unificada
    // (prospector + comercial) + relatorio semanal — servico unico (2026-07-15).
    // ============================================================

    createVisitReport: (input) =>
      executeApiForInput(input, async () => {
        if (!visitReportService) {
          throw new HttpError(501, 'Visit report service is not configured');
        }

        // Qualquer papel autenticado (incl. PROSPECTOR) cria a visita; nasce
        // vinculada a um cliente real (clientId obrigatorio). Online-only —
        // a fila offline foi removida na unificacao 2026-07-15.
        const actor = await resolveActorContext(input, authService);
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
            reason: body.reason,
            reasonNotes: body.reasonNotes,
            outcome: body.outcome,
            outcomeNotes: body.outcomeNotes,
            generalNotes: body.generalNotes,
          },
          actor
        );

        return { status: 201, body: result };
      }),

    cancelVisitReport: (input) =>
      executeApiForInput(input, async () => {
        if (!visitReportService) {
          throw new HttpError(501, 'Visit report service is not configured');
        }

        // Cancelamento SOFT — so o proprio autor (regra no service). A visita
        // e imutavel: erro = cancelar e reenviar.
        const actor = await resolveActorContext(input, authService);
        const reportId = input?.params?.reportId;
        if (typeof reportId !== 'string' || reportId.length === 0) {
          throw new HttpError(422, 'reportId path param is required');
        }

        const result = await visitReportService.cancelVisitReport({ reportId }, actor);
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

    getRelatoriosStats: (input) =>
      executeApiForInput(input, async () => {
        if (!visitReportService) {
          throw new HttpError(501, 'Visit report service is not configured');
        }

        // Cards da pagina "Relatorios" (2 KPIs de visita) — viewer scope=all
        // (gate no service). PROSPECTOR nem chega (fora do allowlist central).
        const actor = await resolveActorContext(input, authService);
        const result = await visitReportService.getRelatoriosStats(actor);

        return { status: 200, body: result };
      }),

    createWeeklyReport: (input) =>
      executeApiForInput(input, async () => {
        if (!visitReportService) {
          throw new HttpError(501, 'Visit report service is not configured');
        }

        // A semana de referencia e SEMPRE computada no servidor. So ADMIN +
        // COMMERCIAL criam (gate no service).
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await visitReportService.createWeeklyReport(
          {
            summary: body.summary,
            difficulties: body.difficulties,
            nextWeekPlan: body.nextWeekPlan,
          },
          actor
        );

        return { status: 201, body: result };
      }),

    cancelWeeklyReport: (input) =>
      executeApiForInput(input, async () => {
        if (!visitReportService) {
          throw new HttpError(501, 'Visit report service is not configured');
        }

        // Cancelamento SOFT do semanal — so o proprio autor (regra no service).
        const actor = await resolveActorContext(input, authService);
        const reportId = input?.params?.reportId;
        if (typeof reportId !== 'string' || reportId.length === 0) {
          throw new HttpError(422, 'reportId path param is required');
        }

        const result = await visitReportService.cancelWeeklyReport({ reportId }, actor);
        return { status: 200, body: result };
      }),

    listInformeFeed: (input) =>
      executeApiForInput(input, async () => {
        if (!visitReportService) {
          throw new HttpError(501, 'Visit report service is not configured');
        }

        // Feed scope=all (todo nao-PROSPECTOR) — visita + semanal de todos.
        const actor = await resolveActorContext(input, authService);
        const query = input?.query ?? {};
        const result = await visitReportService.listInformeFeed(
          {
            page: query.page,
            limit: query.limit,
            search: query.search,
            type: query.type,
            authorId: query.authorId,
            from: query.from,
            to: query.to,
            status: query.status,
          },
          actor
        );

        return { status: 200, body: result };
      }),

    // ============================================================
    // Cadastro de corretores (Fechamento Fase 0)
    // ============================================================
    listBrokers: (input) =>
      executeApiForInput(input, async () => {
        if (!brokerService) {
          throw new HttpError(501, 'Broker service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const query = input?.query ?? {};
        const result = await brokerService.listBrokers(
          { search: query.search, status: query.status, limit: query.limit },
          actor
        );
        return { status: 200, body: result };
      }),

    createBroker: (input) =>
      executeApiForInput(input, async () => {
        if (!brokerService) {
          throw new HttpError(501, 'Broker service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await brokerService.createBroker(
          {
            name: body.name,
            userId: body.userId,
            cpf: body.cpf,
            phone: body.phone,
            email: body.email,
          },
          actor
        );
        return { status: 201, body: result };
      }),

    updateBroker: (input) =>
      executeApiForInput(input, async () => {
        if (!brokerService) {
          throw new HttpError(501, 'Broker service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const brokerId = input?.params?.brokerId;
        if (typeof brokerId !== 'string' || brokerId.length === 0) {
          throw new HttpError(422, 'brokerId path param is required');
        }
        const body = readRequestBody(input);
        const result = await brokerService.updateBroker(
          brokerId,
          {
            name: body.name,
            userId: body.userId,
            cpf: body.cpf,
            phone: body.phone,
            email: body.email,
            status: body.status,
          },
          actor
        );
        return { status: 200, body: result };
      }),

    // ============================================================
    // Contratos de venda (Fechamento -- gestao: todo nao-PROSPECTOR, ACESSO
    // UNIFICADO 2026-07-15; escopo aberto D140; gates de papel vivem no service)
    // ============================================================
    listSaleContracts: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const query = input?.query ?? {};
        // RC-F6: a lista virou servidor-side. `state` e `type` chegam como lista
        // separada por virgula (sao multi-selecao na tela).
        // RC-D117/D118: `cursor` e opaco (base64url {g,pd,seq}) porque a ordem e por
        // grupo de estado; e o filtro de situacao e `state` (os 4 estados derivados),
        // nao mais `status` (o enum de 3 do banco).
        const result = await saleContractService.listSaleContracts(
          {
            search: query.search,
            state: query.state,
            type: query.type,
            buyerClientId: query.buyerClientId,
            sellerClientId: query.sellerClientId,
            periodBase: query.periodBase,
            periodFrom: query.periodFrom,
            periodTo: query.periodTo,
            limit: query.limit,
            cursor: query.cursor,
          },
          actor
        );
        return { status: 200, body: result };
      }),

    // Financeiro (Fase F): corretagem a receber por fechamento. Acesso =
    // FINANCEIRO_ROLES (= ADMIN desde a RC-D3; era NON_PROSPECTOR_ROLES).
    // Escopo ABERTO (D140): sem recorte por Broker.userId — o ADMIN ve TODOS os
    // fechamentos (o service NAO escopa por posse).
    listBrokerReceivables: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const result = await saleContractService.listBrokerReceivables(
          {
            search: input?.query?.search,
            limit: input?.query?.limit,
            cursor: input?.query?.cursor,
            filter: input?.query?.filter,
          },
          actor
        );
        return { status: 200, body: result };
      }),

    // Card de Eventos (dashboard desktop, E24/D138): feed de pagamentos de contrato
    // por janela de data. Gate no service (PAYMENT_FEED_ROLES = NON_PROSPECTOR_ROLES
    // — RC-D5: o calendario NAO acompanhou a carteira pro ADMIN-only); escopo aberto
    // — sem recorte por corretor. Janela ?from&to = 'YYYY-MM-DD'.
    getDashboardPaymentEvents: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const events = await saleContractService.getDashboardPaymentEvents(
          { from: input?.query?.from, to: input?.query?.to },
          actor
        );
        return { status: 200, body: { events } };
      }),

    // Faturamento (DSB-D11): feed de eventos de faturamento do card de Eventos.
    // Auth-only (todos os nao-PROSPECTOR); navegacao pura no front (→ aba Contratos).
    getDashboardInvoiceEvents: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const events = await saleContractService.getDashboardInvoiceEvents(
          { from: input?.query?.from, to: input?.query?.to },
          actor
        );
        return { status: 200, body: { events } };
      }),

    // AP31/DSB-D19: feed do card de "Avisos" do dashboard (1º tipo = aprovacao a
    // enviar). Auth-only (todos os nao-PROSPECTOR; PROSPECTOR barrado no allowlist
    // central). Sem janela — e "pendente agora" (binario), nao calendario.
    getDashboardAvisos: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const result = await saleContractService.getDashboardAvisos({}, actor);
        return { status: 200, body: result };
      }),

    getSaleContract: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const contractId = input?.params?.contractId;
        if (typeof contractId !== 'string' || contractId.length === 0) {
          throw new HttpError(422, 'contractId path param is required');
        }
        const result = await saleContractService.getSaleContract(contractId, actor);
        return { status: 200, body: result };
      }),

    // Fechamento (D97): cria um contrato JA EMITIDO num passo so. Discrimina pelo
    // `type` do corpo: MERCADO_A_VISTA -> createSpot (registra a venda no lote +
    // contrato na mesma tx); FUTURO -> createFuture (CRUD direto, sem lote). Em
    // ambos o corpo traz a fase 1 + a etapa 2 completa.
    createSaleContract: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result =
          body?.type === 'MERCADO_A_VISTA'
            ? await saleContractService.createSpotSaleContract(body, actor)
            : await saleContractService.createFutureSaleContract(body, actor);
        return { status: 201, body: result };
      }),

    emitSaleContract: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const contractId = input?.params?.contractId;
        if (typeof contractId !== 'string' || contractId.length === 0) {
          throw new HttpError(422, 'contractId path param is required');
        }
        const body = readRequestBody(input);
        const result = await saleContractService.emitSaleContract(contractId, body, actor);
        return { status: 200, body: result };
      }),

    // "Aplicar agio/desagio" no card de um contrato EMITIDO (D87): recalcula
    // total + corretagem e registra a aplicacao. Todo nao-PROSPECTOR (gate
    // SALE_CONTRACT_ACCESS_ROLES no service, escopo aberto D140).
    applyAgioSaleContract: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const contractId = input?.params?.contractId;
        if (typeof contractId !== 'string' || contractId.length === 0) {
          throw new HttpError(422, 'contractId path param is required');
        }
        const body = readRequestBody(input);
        const result = await saleContractService.applyAgioSaleContract(contractId, body, actor);
        return { status: 200, body: result };
      }),

    // AP23: toggle rapido Sim/Nao do requiresApproval (Detalhes). So ADMIN/COMMERCIAL
    // (gate no service); travas AP20 (so EMITIDO; Sim->Nao so sem etiqueta).
    setSaleContractApprovalFlag: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const contractId = input?.params?.contractId;
        if (typeof contractId !== 'string' || contractId.length === 0) {
          throw new HttpError(422, 'contractId path param is required');
        }
        const body = readRequestBody(input);
        const result = await saleContractService.setSaleContractApprovalFlag(
          contractId,
          body,
          actor
        );
        return { status: 200, body: result };
      }),

    // RC-D99: cascata do "Nº compra" da etiqueta de aprovacao. Escrita ESTREITA
    // (uma coluna + version), fora do "Editar" — ver o porque no service.
    setSaleContractPurchaseNumber: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const contractId = input?.params?.contractId;
        if (typeof contractId !== 'string' || contractId.length === 0) {
          throw new HttpError(422, 'contractId path param is required');
        }
        const body = readRequestBody(input);
        const result = await saleContractService.setSaleContractPurchaseNumber(
          contractId,
          body,
          actor
        );
        return { status: 200, body: result };
      }),

    // RC-D62/D63: o unico marco que sobrou do ciclo pos-EMITIDO. "Finalizar" nao
    // grava data (nao afirma fato do mundo, so tira o contrato da fila) e volta
    // por "Reabrir" — quem e quando ficam no status log.
    finalizeSaleContract: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const contractId = input?.params?.contractId;
        if (typeof contractId !== 'string' || contractId.length === 0) {
          throw new HttpError(422, 'contractId path param is required');
        }
        const body = readRequestBody(input);
        const result = await saleContractService.finalizeSaleContract(contractId, body, actor);
        return { status: 200, body: result };
      }),

    reopenSaleContract: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const contractId = input?.params?.contractId;
        if (typeof contractId !== 'string' || contractId.length === 0) {
          throw new HttpError(422, 'contractId path param is required');
        }
        const body = readRequestBody(input);
        const result = await saleContractService.reopenSaleContract(contractId, body, actor);
        return { status: 200, body: result };
      }),

    // Timeline do modal de Detalhes (Fase J — D125): auditorias agregadas do
    // contrato (criacao/edicoes, agio, aprovacoes, marcos, espelhos). Mesmo
    // gate/posse do getSaleContract (via service).
    getSaleContractTimeline: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const contractId = input?.params?.contractId;
        if (typeof contractId !== 'string' || contractId.length === 0) {
          throw new HttpError(422, 'contractId path param is required');
        }
        const result = await saleContractService.getSaleContractTimeline(contractId, actor);
        return { status: 200, body: result };
      }),

    // Quebra MANUAL (P17): cancela a venda subjacente e marca o contrato WASH_OUT
    // (motivo obrigatorio). Delega ao cancelSampleMovement no servico.
    washoutSaleContract: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const contractId = input?.params?.contractId;
        if (typeof contractId !== 'string' || contractId.length === 0) {
          throw new HttpError(422, 'contractId path param is required');
        }
        const body = readRequestBody(input);
        const result = await saleContractService.washoutSaleContract(contractId, body, actor);
        return { status: 200, body: result };
      }),

    listContractLookups: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const result = await saleContractService.listContractLookups(actor);
        return { status: 200, body: result };
      }),

    // "+ Adicionar" inline nas listas do contrato (D91): cria 1 valor (Forma/
    // Modalidade/Embalagem). Qualquer autenticado (D59); so o modal ADMIN o expoe.
    createContractLookup: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await saleContractService.createContractLookup(body, actor);
        return { status: 200, body: result };
      }),

    // Preview do proximo numero de contrato (NNNN/AA), so-leitura — pro modal de
    // venda mostrar o numero antes de criar.
    getNextContractNumber: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const result = await saleContractService.getNextContractNumber(actor);
        return { status: 200, body: result };
      }),

    // Fechamento (Fase C): gera o PDF do contrato on-demand (regeneravel, sem
    // armazenar — D32). Gate via getSaleContract (todo nao-PROSPECTOR em
    // qualquer contrato — escopo aberto D140; o own-only da S74 foi revogado).
    // Todo contrato nasce EMITIDO (D97), entao nao ha mais gate de status aqui.
    // Devolve o buffer; a rota serve como application/pdf binario.
    exportSaleContractPdf: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService || !saleContractPdfService) {
          throw new HttpError(501, 'Sale contract PDF service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const contractId = input?.params?.contractId;
        if (typeof contractId !== 'string' || contractId.length === 0) {
          throw new HttpError(422, 'contractId path param is required');
        }
        const { contract } = await saleContractService.getSaleContract(contractId, actor);
        let lotNumber = null;
        if (contract.sampleId) {
          try {
            const sample = await queryService.requireSample(contract.sampleId);
            lotNumber = sample.internalLotNumber ?? null;
          } catch {
            lotNumber = null;
          }
        }
        const { buffer } = await saleContractPdfService.renderContractPdf(contract, {
          lotNumber,
          issuer: getContractIssuer(),
        });
        return {
          status: 200,
          body: {
            buffer,
            fileName: `contrato-${contract.contractNumber.replace('/', '-')}.pdf`,
            contentType: 'application/pdf',
          },
        };
      }),

    // RC-D27/D28: PDF de PREVIA da emissao — o mesmo documento, sem gravar nada.
    // E a confirmacao pelo documento que passou a preceder o "Emitir". Reusa o
    // `previewSaleContract` (que reusa o `_resolveEmitData` da emissao) e o
    // MESMO `renderContractPdf` do PDF definitivo: fidelidade por construcao,
    // nao por replica. O numero pode ser provisorio (a alocacao real so acontece
    // na transacao) — o header `X-Provisional-Number` diz quando.
    previewSaleContractPdf: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService || !saleContractPdfService) {
          throw new HttpError(501, 'Sale contract PDF service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const { contract, provisionalNumber, sampleId } =
          await saleContractService.previewSaleContract(input?.body ?? {}, actor);
        let lotNumber = null;
        if (sampleId) {
          try {
            const sample = await queryService.requireSample(sampleId);
            lotNumber = sample.internalLotNumber ?? null;
          } catch {
            lotNumber = null;
          }
        }
        const { buffer } = await saleContractPdfService.renderContractPdf(contract, {
          lotNumber,
          issuer: getContractIssuer(),
        });
        return {
          status: 200,
          body: {
            buffer,
            fileName: `contrato-${String(contract.contractNumber).replace('/', '-')}-previa.pdf`,
            contentType: 'application/pdf',
            provisionalNumber,
            contractNumber: contract.contractNumber,
          },
        };
      }),

    // Espelho de Corretagem (Fase E): PDF DERIVADO de UM contrato (D70-D76). Gate
    // via getSaleContract (todo nao-PROSPECTOR em qualquer contrato — escopo aberto
    // D140; o own-only da S74 foi revogado); elegiveis = EMITIDO/FINALIZADO/WASH_OUT
    // (RC-D62 aposentou FATURADO/PAGO; D105 incluiu o washout). `side` (query) =
    // seller|buyer (D72) define o CLIENTE (topo) e o lado da comissao impressa. O
    // espelho e um documento de CORRETAGEM: EXIGE comissao no lado pedido (S74).
    //
    // RC-D103: o PDF e sempre renderizado de um SNAPSHOT — aqui, construido do
    // contrato fresco. O que fica GUARDADO e o snapshot da entrega (POST /log), e a
    // releitura de um espelho guardado renderiza dele. Os bytes seguem sem persistir.
    exportEspelhoPdf: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService || !saleContractPdfService) {
          throw new HttpError(501, 'Sale contract PDF service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const contractId = input?.params?.contractId;
        if (typeof contractId !== 'string' || contractId.length === 0) {
          throw new HttpError(422, 'contractId path param is required');
        }
        // RC-D103/D105: com ?logId= le-se um espelho GUARDADO — o snapshot congelado
        // na entrega, com a data da propria linha de auditoria. Sem logId, gera do
        // contrato fresco. Sao os dois unicos caminhos, e os dois renderizam de um
        // snapshot: o documento guardado nao e uma aproximacao do entregue, e ele.
        const logId = input?.query?.logId;
        if (typeof logId === 'string' && logId.length > 0) {
          const [{ contract }, stored] = await Promise.all([
            saleContractService.getSaleContract(contractId, actor),
            saleContractService.getEspelhoSnapshot(contractId, logId, actor),
          ]);
          const { buffer } = await saleContractPdfService.renderEspelhoPdf(stored.snapshot, {
            issuer: getContractIssuer(),
            generatedAt: stored.generatedAt,
          });
          // Releitura NAO audita de novo: e o MESMO documento, e a linha que o guarda
          // ja registra quem exportou e quando.
          return {
            status: 200,
            body: {
              buffer,
              fileName: espelhoFileName(contract.contractNumber, stored.side),
              contentType: 'application/pdf',
            },
          };
        }
        const side = input?.query?.side;
        if (side !== 'seller' && side !== 'buyer') {
          throw new HttpError(422, "query param 'side' deve ser 'seller' ou 'buyer'", {
            code: 'ESPELHO_INVALID_SIDE',
          });
        }
        const { contract } = await saleContractService.getSaleContract(contractId, actor);
        // Elegibilidade (D105/D145/S74) — helper compartilhado com o logEspelhoExport.
        assertEspelhoEligible(contract, side);
        const snapshot = buildEspelhoSnapshot(contract, side);
        const { buffer } = await saleContractPdfService.renderEspelhoPdf(snapshot, {
          issuer: getContractIssuer(),
        });
        // D127 (revisa a D124): a PRÉVIA do modal passa ?preview=1 e NÃO conta
        // como auditoria — o registro de exportação vem do POST /espelho/log
        // (Exportar/Baixar). Sem o param (acesso direto à URL) loga aqui,
        // best-effort: um log falho não invalida um PDF já renderizado.
        // RC-D103: o log carrega o MESMO snapshot que acabou de ser renderizado —
        // por isso ele é construído uma vez, acima.
        const isPreview = input?.query?.preview === '1' || input?.query?.preview === 'true';
        if (!isPreview) {
          try {
            await saleContractService.logEspelhoGenerated(contract.id, side, actor, { snapshot });
          } catch (cause) {
            console.error('espelho: falha ao gravar o log de exportacao', cause);
          }
        }
        return {
          status: 200,
          body: {
            buffer,
            fileName: espelhoFileName(contract.contractNumber, side),
            contentType: 'application/pdf',
          },
        };
      }),

    // D127: registra a EXPORTAÇÃO do espelho (clique em Exportar/Baixar no
    // modal — a prévia não audita). Mesmo gate/posse do getSaleContract +
    // assertEspelhoEligible (o endpoint valida elegibilidade pra não gravar
    // export impossível). Alimenta o timeline do modal de Detalhes (D125).
    //
    // RC-D103/D104: é AQUI que o documento é congelado — a linha deixa de ser só
    // "houve um export" e passa a guardar o snapshot do que foi impresso. O snapshot
    // é construído no SERVIDOR a partir do contrato fresco; o cliente nunca manda
    // números.
    //
    // RC-D107: `expectedVersion` (opcional) fecha a janela entre a prévia e a
    // entrega. Se o contrato mudou nesse meio, o PDF que o operador acabou de
    // entregar já não corresponde ao contrato — gravá-lo como o documento oficial
    // seria congelar a mentira. É opcional porque o acesso direto à URL do PDF
    // (sem ?preview=1) também loga, e ali não há prévia da qual divergir.
    logEspelhoExport: (input) =>
      executeApiForInput(input, async () => {
        if (!saleContractService) {
          throw new HttpError(501, 'Sale contract service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const contractId = input?.params?.contractId;
        if (typeof contractId !== 'string' || contractId.length === 0) {
          throw new HttpError(422, 'contractId path param is required');
        }
        const body = readRequestBody(input);
        const side = body?.side;
        if (side !== 'seller' && side !== 'buyer') {
          throw new HttpError(422, "body param 'side' deve ser 'seller' ou 'buyer'", {
            code: 'ESPELHO_INVALID_SIDE',
          });
        }
        const { contract } = await saleContractService.getSaleContract(contractId, actor);
        // Fix da auditoria: valida elegibilidade antes de gravar (spot-washout / sem
        // corretagem eram aceitos e poluíam o timeline com export impossível).
        assertEspelhoEligible(contract, side);
        const expectedVersion = body?.expectedVersion;
        if (expectedVersion !== undefined && expectedVersion !== null) {
          if (!Number.isInteger(expectedVersion)) {
            throw new HttpError(422, 'expectedVersion deve ser um inteiro', {
              code: 'VALIDATION_ERROR',
              field: 'expectedVersion',
            });
          }
          if (expectedVersion !== contract.version) {
            throw new HttpError(
              409,
              'O contrato mudou desde a conferência. Gere o espelho de novo.',
              { code: 'SALE_CONTRACT_VERSION_CONFLICT' }
            );
          }
        }
        const { id: logId } = await saleContractService.logEspelhoGenerated(
          contract.id,
          side,
          actor,
          { snapshot: buildEspelhoSnapshot(contract, side) }
        );
        return { status: 200, body: { logged: true, logId } };
      }),

    // ============================================================
    // Contas bancarias de cliente (Fechamento Fase 0 -- D28)
    // ============================================================
    listClientBankAccounts: (input) =>
      executeApiForInput(input, async () => {
        if (!clientBankAccountService) {
          throw new HttpError(501, 'Client bank account service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const result = await clientBankAccountService.listClientBankAccounts(
          input?.params?.clientId,
          actor
        );
        return { status: 200, body: result };
      }),

    createClientBankAccount: (input) =>
      executeApiForInput(input, async () => {
        if (!clientBankAccountService) {
          throw new HttpError(501, 'Client bank account service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await clientBankAccountService.createClientBankAccount(
          input?.params?.clientId,
          {
            bankName: body.bankName,
            agency: body.agency,
            accountNumber: body.accountNumber,
            holderName: body.holderName,
            holderTaxId: body.holderTaxId,
            pixKey: body.pixKey,
          },
          actor
        );
        return { status: 201, body: result };
      }),

    updateClientBankAccount: (input) =>
      executeApiForInput(input, async () => {
        if (!clientBankAccountService) {
          throw new HttpError(501, 'Client bank account service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await clientBankAccountService.updateClientBankAccount(
          input?.params?.clientId,
          input?.params?.accountId,
          {
            bankName: body.bankName,
            agency: body.agency,
            accountNumber: body.accountNumber,
            holderName: body.holderName,
            holderTaxId: body.holderTaxId,
            pixKey: body.pixKey,
            status: body.status,
          },
          actor
        );
        return { status: 200, body: result };
      }),

    // ============================================================
    // Anexos de cliente (Fechamento Fase 0 -- D27; PDF + imagens)
    // ============================================================
    listClientAttachments: (input) =>
      executeApiForInput(input, async () => {
        if (!clientAttachmentService) {
          throw new HttpError(501, 'Client attachment service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const result = await clientAttachmentService.listClientAttachments(
          input?.params?.clientId,
          actor
        );
        return { status: 200, body: result };
      }),

    addClientAttachment: (input) =>
      executeApiForInput(input, async () => {
        if (!clientAttachmentService) {
          throw new HttpError(501, 'Client attachment service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);

        let fileBuffer = null;
        if (Buffer.isBuffer(body.fileBuffer)) {
          fileBuffer = body.fileBuffer;
        } else if (typeof body.fileBase64 === 'string' && body.fileBase64.length > 0) {
          fileBuffer = Buffer.from(body.fileBase64, 'base64');
        }

        const result = await clientAttachmentService.addClientAttachment(
          input?.params?.clientId,
          {
            fileBuffer,
            originalFileName: body.originalFileName ?? null,
            description: body.description ?? null,
          },
          actor
        );
        return { status: 201, body: result };
      }),

    linkClientAttachmentUnit: (input) =>
      executeApiForInput(input, async () => {
        if (!clientAttachmentService) {
          throw new HttpError(501, 'Client attachment service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const body = readRequestBody(input);
        const result = await clientAttachmentService.linkClientAttachmentUnit(
          input?.params?.clientId,
          input?.params?.attachmentId,
          { unitId: body.unitId ?? null },
          actor
        );
        return { status: 200, body: result };
      }),

    deleteClientAttachment: (input) =>
      executeApiForInput(input, async () => {
        if (!clientAttachmentService) {
          throw new HttpError(501, 'Client attachment service is not configured');
        }
        const actor = await resolveActorContext(input, authService);
        const result = await clientAttachmentService.deleteClientAttachment(
          input?.params?.clientId,
          input?.params?.attachmentId,
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
