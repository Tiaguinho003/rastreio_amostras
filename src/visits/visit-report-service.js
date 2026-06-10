import { randomUUID } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';
import { buildClientDisplayName } from '../clients/client-support.js';
import {
  assertAdminActor,
  assertAuthenticatedActor,
  normalizeOptionalText,
  normalizeRequiredText,
  readLimitQuery,
  readPageQuery,
  toIsoString,
} from '../users/user-support.js';

// Informe de visita (pagina /informe): cada envio do formulario vira 1 row
// imutavel em visit_report. Qualquer usuario autenticado envia; a listagem
// (pagina /resumo) e exclusiva do admin. userId e createdAt sao carimbados
// no servidor — o body nunca decide quem enviou nem quando.

export const VISIT_CLIENT_KINDS = Object.freeze(['EXISTING', 'NEW']);
export const VISIT_FARM_SIZES = Object.freeze(['SMALL', 'MEDIUM', 'LARGE']);
export const VISIT_INTEREST_LEVELS = Object.freeze(['NONE', 'LOW', 'MEDIUM', 'HIGH']);

export const VISIT_REPORT_LIST_LIMIT_DEFAULT = 20;
export const VISIT_REPORT_LIST_LIMIT_MAX = 100;

const NEW_CLIENT_NAME_MAX = 200;
const NEW_CLIENT_CITY_MAX = 120;
const NEW_CLIENT_PHONE_MAX = 40;
const NOTES_MAX = 1000;

// Tolerancia de relogio adiantado do aparelho ao validar capturedAt.
const CAPTURED_AT_FUTURE_SKEW_MS = 5 * 60 * 1000;

const VISIT_REPORT_USER_SELECT = {
  id: true,
  fullName: true,
  username: true,
};

// Campos minimos pra montar displayName (PF usa fullName; PJ usa
// tradeName/legalName — ver buildClientDisplayName).
const VISIT_REPORT_CLIENT_SELECT = {
  id: true,
  code: true,
  personType: true,
  fullName: true,
  tradeName: true,
  legalName: true,
  status: true,
};

function buildPage(total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  return {
    limit,
    page: safePage,
    offset,
    total,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

function normalizeEnumChoice(value, allowedValues, fieldName) {
  if (typeof value !== 'string' || !allowedValues.includes(value)) {
    throw new HttpError(422, `${fieldName} must be one of: ${allowedValues.join(', ')}`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return value;
}

function normalizeBooleanFlag(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new HttpError(422, `${fieldName} must be a boolean`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  return value;
}

// Hora local do preenchimento, informada pelo aparelho quando o envio veio
// da fila offline. Opcional (null = envio online direto); quando presente
// precisa ser data valida e nao-futura (com tolerancia pra clock skew).
function normalizeCapturedAt(value, fieldName = 'capturedAt') {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new HttpError(422, `${fieldName} must be an ISO-8601 string`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(422, `${fieldName} must be a valid ISO-8601 date`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }

  if (parsed.getTime() > Date.now() + CAPTURED_AT_FUTURE_SKEW_MS) {
    throw new HttpError(422, `${fieldName} must not be in the future`, {
      code: 'VISIT_CAPTURED_AT_FUTURE',
      field: fieldName,
    });
  }

  return parsed;
}

function toVisitReportView(row) {
  return {
    id: row.id,
    user: row.user
      ? {
          id: row.user.id,
          fullName: row.user.fullName,
          username: row.user.username,
        }
      : null,
    clientKind: row.clientKind,
    client: row.client
      ? {
          id: row.client.id,
          code: row.client.code,
          displayName: buildClientDisplayName(row.client),
          status: row.client.status,
        }
      : null,
    newClient:
      row.clientKind === 'NEW'
        ? {
            name: row.newClientName,
            city: row.newClientCity,
            phone: row.newClientPhone,
          }
        : null,
    farmSize: row.farmSize,
    farmSizeNotes: row.farmSizeNotes,
    interestLevel: row.interestLevel,
    interestNotes: row.interestNotes,
    sellsCurrently: row.sellsCurrently,
    sellsToWhom: row.sellsToWhom,
    capturedAt: toIsoString(row.capturedAt),
    createdAt: toIsoString(row.createdAt),
  };
}

export class VisitReportService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  // Valida a identificacao do cliente conforme o kind:
  //   EXISTING — clientId obrigatorio, precisa existir e estar ACTIVE
  //              (espelha resolveOwnerBinding, sem exigir isSeller: a visita
  //              pode ser a qualquer cliente do cadastro). Campos new_* zeram.
  //   NEW      — newClientName obrigatorio; cidade/telefone opcionais.
  //              clientId zera (prospect ainda fora do cadastro).
  async resolveClientIdentification(input) {
    const clientKind = normalizeEnumChoice(input.clientKind, VISIT_CLIENT_KINDS, 'clientKind');

    if (clientKind === 'EXISTING') {
      const clientId = normalizeRequiredText(input.clientId, 'clientId', 100);
      const client = await this.prisma.client.findUnique({
        where: { id: clientId },
        select: VISIT_REPORT_CLIENT_SELECT,
      });

      if (!client) {
        throw new HttpError(422, 'clientId does not reference an existing client', {
          code: 'VISIT_CLIENT_NOT_FOUND',
          field: 'clientId',
        });
      }

      if (client.status !== 'ACTIVE') {
        throw new HttpError(422, 'clientId must reference an active client', {
          code: 'VISIT_CLIENT_INACTIVE',
          field: 'clientId',
        });
      }

      return {
        clientKind,
        clientId: client.id,
        newClientName: null,
        newClientCity: null,
        newClientPhone: null,
      };
    }

    return {
      clientKind,
      clientId: null,
      newClientName: normalizeRequiredText(
        input.newClientName,
        'newClientName',
        NEW_CLIENT_NAME_MAX
      ),
      newClientCity: normalizeOptionalText(
        input.newClientCity,
        'newClientCity',
        NEW_CLIENT_CITY_MAX
      ),
      newClientPhone: normalizeOptionalText(
        input.newClientPhone,
        'newClientPhone',
        NEW_CLIENT_PHONE_MAX
      ),
    };
  }

  async createVisitReport(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'create visit report');

    const identification = await this.resolveClientIdentification(input ?? {});
    const farmSize = normalizeEnumChoice(input?.farmSize, VISIT_FARM_SIZES, 'farmSize');
    const farmSizeNotes = normalizeOptionalText(input?.farmSizeNotes, 'farmSizeNotes', NOTES_MAX);
    const interestLevel = normalizeEnumChoice(
      input?.interestLevel,
      VISIT_INTEREST_LEVELS,
      'interestLevel'
    );
    const interestNotes = normalizeOptionalText(input?.interestNotes, 'interestNotes', NOTES_MAX);
    const sellsCurrently = normalizeBooleanFlag(input?.sellsCurrently, 'sellsCurrently');
    // "Com quem" so existe quando ja comercializa; descarta texto perdido
    // de quem marcou Sim, preencheu e voltou pra Nao.
    const sellsToWhom = sellsCurrently
      ? normalizeOptionalText(input?.sellsToWhom, 'sellsToWhom', NOTES_MAX)
      : null;
    const capturedAt = normalizeCapturedAt(input?.capturedAt);

    const created = await this.prisma.visitReport.create({
      data: {
        id: randomUUID(),
        userId: actor.actorUserId,
        clientKind: identification.clientKind,
        clientId: identification.clientId,
        newClientName: identification.newClientName,
        newClientCity: identification.newClientCity,
        newClientPhone: identification.newClientPhone,
        farmSize,
        farmSizeNotes,
        interestLevel,
        interestNotes,
        sellsCurrently,
        sellsToWhom,
        capturedAt,
      },
      include: {
        user: { select: VISIT_REPORT_USER_SELECT },
        client: { select: VISIT_REPORT_CLIENT_SELECT },
      },
    });

    return { report: toVisitReportView(created) };
  }

  async listVisitReports(input, actorContext) {
    assertAdminActor(actorContext, 'list visit reports');
    const page = readPageQuery(input?.page, 1);
    const limit = readLimitQuery(input?.limit, {
      fallback: VISIT_REPORT_LIST_LIMIT_DEFAULT,
      max: VISIT_REPORT_LIST_LIMIT_MAX,
    });
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.visitReport.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        include: {
          user: { select: VISIT_REPORT_USER_SELECT },
          client: { select: VISIT_REPORT_CLIENT_SELECT },
        },
      }),
      this.prisma.visitReport.count(),
    ]);

    return {
      items: items.map(toVisitReportView),
      page: buildPage(total, page, limit),
    };
  }
}
