import { randomUUID } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';
import { assertRoleAllowed, NON_PROSPECTOR_ROLES, USER_ROLES } from '../auth/roles.js';
import { buildClientDisplayName, normalizeSearchInput } from '../clients/client-support.js';
import {
  assertAuthenticatedActor,
  normalizeOptionalText,
  normalizeRequiredText,
  readLimitQuery,
  readPageQuery,
  toIsoString,
} from '../users/user-support.js';

// Relatorios (pagina "Relatorios", rota /relatorios). Desde a UNIFICACAO
// (2026-07-15) sao 2 tipos:
//   - VISITA (visit_report): funde o antigo informe do prospector + a visita
//     do comercial num relatorio UNICO. O cliente NASCE vinculado (lookup +
//     cadastro no proprio form); TODOS os papeis criam (incl. PROSPECTOR).
//   - SEMANAL (weekly_report): so ADMIN + COMMERCIAL criam.
// Ambos IMUTAVEIS: erro = cancelar (soft) e reenviar (so o proprio autor).
// A pagina e viewer scope=all p/ todo nao-PROSPECTOR; o PROSPECTOR ve so os
// PROPRIOS (lista do dashboard dele). user_id/created_at carimbados no servidor.

export const VISIT_CLIENT_KINDS = Object.freeze(['EXISTING', 'NEW']);
export const VISIT_FARM_SIZES = Object.freeze(['SMALL', 'MEDIUM', 'LARGE']);
export const VISIT_INTEREST_LEVELS = Object.freeze(['NONE', 'LOW', 'MEDIUM', 'HIGH']);
// Motivos/resultados herdados da visita comercial (COLLECTION legado nao entra).
export const COMMERCIAL_VISIT_REASONS = Object.freeze([
  'NEGOTIATION',
  'SAMPLE_DELIVERY_OR_PICKUP',
  'RELATIONSHIP',
]);
export const COMMERCIAL_VISIT_OUTCOMES = Object.freeze([
  'DEAL_CLOSED',
  'PROPOSAL_IN_PROGRESS',
  'NO_PROGRESS',
  'NO_INTEREST',
]);

export const VISIT_REPORT_LIST_LIMIT_DEFAULT = 20;
export const VISIT_REPORT_LIST_LIMIT_MAX = 100;
export const INFORME_FEED_LIMIT_DEFAULT = 20;
export const INFORME_FEED_LIMIT_MAX = 100;

// Quem ve a pagina "Relatorios" (feed scope=all — TODOS os relatorios). Todo
// papel nao-PROSPECTOR (ACESSO UNIFICADO 2026-07-15). PROSPECTOR ve so os
// PROPRIOS (escopo forcado por userId em listVisitReports). Espelho no front:
// isVisitReportViewer (lib/roles.ts).
export const VISIT_REPORT_VIEWER_ROLES = NON_PROSPECTOR_ROLES;

// Quem CRIA o relatorio SEMANAL — so ADMIN + COMMERCIAL (unificacao 2026-07-15).
// A VISITA, ao contrario, e criada por qualquer autenticado (incl. PROSPECTOR).
export const WEEKLY_REPORT_AUTHOR_ROLES = Object.freeze([USER_ROLES.ADMIN, USER_ROLES.COMMERCIAL]);

const NEW_CLIENT_NAME_MAX = 200;
const NEW_CLIENT_CITY_MAX = 120;
const NEW_CLIENT_PHONE_MAX = 40;
const NOTES_MAX = 1000;
const WEEKLY_TEXT_MAX = 2000;

// Offset fixo de Brasilia (UTC-3, sem horario de verao desde 2019).
const SAO_PAULO_UTC_OFFSET_HOURS = 3;

const REPORT_USER_SELECT = { id: true, fullName: true, username: true };

// Campos minimos p/ montar displayName (PF=fullName; PJ=tradeName/legalName).
const REPORT_CLIENT_SELECT = {
  id: true,
  code: true,
  personType: true,
  fullName: true,
  tradeName: true,
  legalName: true,
  status: true,
};

// Janela do dia BRT corrente (inicio inclusivo, fim exclusivo) — base dos dois
// contadores do dashboard do prospector.
export function computeVisitStatsWindows(now = new Date()) {
  const brtNow = new Date(now.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000);
  const brtYear = brtNow.getUTCFullYear();
  const brtMonth = brtNow.getUTCMonth();
  const brtDay = brtNow.getUTCDate();
  return {
    todayStartUtc: new Date(Date.UTC(brtYear, brtMonth, brtDay, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0)),
    todayEndUtc: new Date(
      Date.UTC(brtYear, brtMonth, brtDay + 1, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0)
    ),
  };
}

// Semana de referencia do relatorio semanal: segunda 00:00 BRT (inclusive) ate
// a proxima segunda (exclusive). O SERVIDOR sempre computa de now(); o body
// nunca decide a semana. Espelho client-side em lib/weekly-report.ts.
export function computeWeekReference(now = new Date()) {
  const brtNow = new Date(now.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000);
  const year = brtNow.getUTCFullYear();
  const month = brtNow.getUTCMonth();
  const day = brtNow.getUTCDate();
  const weekday = brtNow.getUTCDay(); // 0=domingo
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  return {
    weekStart: new Date(Date.UTC(year, month, day - daysFromMonday)),
    weekEndDate: new Date(Date.UTC(year, month, day - daysFromMonday + 6)),
    weekEndExclusive: new Date(Date.UTC(year, month, day - daysFromMonday + 7)),
  };
}

function buildPage(total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  return {
    limit,
    page: safePage,
    offset: (safePage - 1) * limit,
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

// Enum opcional: null quando ausente/vazio; valida quando presente. Os campos
// da visita (fazenda/interesse/motivo/resultado) sao TODOS opcionais no form
// unificado — a obrigatoriedade fica p/ o remodel futuro das perguntas.
function normalizeOptionalEnum(value, allowedValues, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return normalizeEnumChoice(value, allowedValues, fieldName);
}

function normalizeOptionalBoolean(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'boolean') {
    throw new HttpError(422, `${fieldName} must be a boolean`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return value;
}

// View da VISITA (unificada). newClient = anotacao de campo (nome/cidade/tel do
// "Cliente novo"), preservada ao lado do vinculo real. cancelledAt != null =
// cancelado (soft).
export function toVisitReportView(row) {
  return {
    id: row.id,
    type: 'VISIT_REPORT',
    user: row.user
      ? { id: row.user.id, fullName: row.user.fullName, username: row.user.username }
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
    newClient: row.newClientName
      ? { name: row.newClientName, city: row.newClientCity, phone: row.newClientPhone }
      : null,
    farmSize: row.farmSize,
    farmSizeNotes: row.farmSizeNotes,
    interestLevel: row.interestLevel,
    interestNotes: row.interestNotes,
    sellsCurrently: row.sellsCurrently,
    sellsToWhom: row.sellsToWhom,
    reason: row.reason,
    reasonNotes: row.reasonNotes,
    outcome: row.outcome,
    outcomeNotes: row.outcomeNotes,
    generalNotes: row.generalNotes,
    cancelledAt: toIsoString(row.cancelledAt ?? null),
    createdAt: toIsoString(row.createdAt),
  };
}

function toDateOnlyString(value) {
  return value.toISOString().slice(0, 10);
}

// View do relatorio SEMANAL.
export function toWeeklyReportView(row) {
  const weekStart = row.weekStart;
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 3600_000);
  return {
    id: row.id,
    type: 'WEEKLY_REPORT',
    user: row.user
      ? { id: row.user.id, fullName: row.user.fullName, username: row.user.username }
      : null,
    weekStart: toDateOnlyString(weekStart),
    weekEnd: toDateOnlyString(weekEnd),
    summary: row.summary,
    difficulties: row.difficulties,
    nextWeekPlan: row.nextWeekPlan,
    cancelledAt: toIsoString(row.cancelledAt ?? null),
    createdAt: toIsoString(row.createdAt),
  };
}

export class VisitReportService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async _assertActiveClient(clientId) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: REPORT_CLIENT_SELECT,
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
    return client;
  }

  // Identificacao do cliente — a visita NASCE vinculada (clientId obrigatorio
  // nos dois kinds; unificacao 2026-07-15). clientKind e so a DECLARACAO do
  // autor: EXISTING = achou no lookup; NEW = cadastrou o cliente ali mesmo, e
  // newClientName/City/Phone ficam como ANOTACAO ao lado do vinculo.
  async resolveClientIdentification(input) {
    const clientKind = normalizeEnumChoice(input.clientKind, VISIT_CLIENT_KINDS, 'clientKind');
    const client = await this._assertActiveClient(
      normalizeRequiredText(input.clientId, 'clientId', 100)
    );
    if (clientKind === 'EXISTING') {
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
      clientId: client.id,
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
    // Campos da visita — TODOS opcionais (remodel das perguntas fica p/ depois).
    const farmSize = normalizeOptionalEnum(input?.farmSize, VISIT_FARM_SIZES, 'farmSize');
    const farmSizeNotes = normalizeOptionalText(input?.farmSizeNotes, 'farmSizeNotes', NOTES_MAX);
    const interestLevel = normalizeOptionalEnum(
      input?.interestLevel,
      VISIT_INTEREST_LEVELS,
      'interestLevel'
    );
    const interestNotes = normalizeOptionalText(input?.interestNotes, 'interestNotes', NOTES_MAX);
    const sellsCurrently = normalizeOptionalBoolean(input?.sellsCurrently, 'sellsCurrently');
    // "Com quem" so persiste quando comercializa.
    const sellsToWhom = sellsCurrently
      ? normalizeOptionalText(input?.sellsToWhom, 'sellsToWhom', NOTES_MAX)
      : null;
    const reason = normalizeOptionalEnum(input?.reason, COMMERCIAL_VISIT_REASONS, 'reason');
    const reasonNotes = normalizeOptionalText(input?.reasonNotes, 'reasonNotes', NOTES_MAX);
    const outcome = normalizeOptionalEnum(input?.outcome, COMMERCIAL_VISIT_OUTCOMES, 'outcome');
    const outcomeNotes = normalizeOptionalText(input?.outcomeNotes, 'outcomeNotes', NOTES_MAX);
    const generalNotes = normalizeOptionalText(input?.generalNotes, 'generalNotes', NOTES_MAX);

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
        reason,
        reasonNotes,
        outcome,
        outcomeNotes,
        generalNotes,
      },
      include: {
        user: { select: REPORT_USER_SELECT },
        client: { select: REPORT_CLIENT_SELECT },
      },
    });

    return { report: toVisitReportView(created) };
  }

  // Cancelamento SOFT — so o proprio autor cancela a propria visita (nem ADMIN
  // cancela alheia). Marca cancelled_at/by; a row fica no historico como
  // "Cancelado". Ja cancelada / alheia / inexistente => 404 (nao vaza).
  async cancelVisitReport(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'cancel visit report');
    const reportId = normalizeRequiredText(input?.reportId, 'reportId', 100);
    const result = await this.prisma.visitReport.updateMany({
      where: { id: reportId, userId: actor.actorUserId, cancelledAt: null },
      data: { cancelledAt: new Date(), cancelledByUserId: actor.actorUserId },
    });
    if (result.count === 0) {
      throw new HttpError(404, 'Visit report not found', { code: 'VISIT_REPORT_NOT_FOUND' });
    }
    const row = await this.prisma.visitReport.findUnique({
      where: { id: reportId },
      include: {
        user: { select: REPORT_USER_SELECT },
        client: { select: REPORT_CLIENT_SELECT },
      },
    });
    return { report: toVisitReportView(row) };
  }

  async listVisitReports(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'list visit reports');
    assertRoleAllowed(
      actor.role,
      [...VISIT_REPORT_VIEWER_ROLES, USER_ROLES.PROSPECTOR],
      'list visit reports'
    );
    // Viewers veem todas; PROSPECTOR ve APENAS as PROPRIAS (escopo forcado).
    const where = {};
    if (actor.role === USER_ROLES.PROSPECTOR) {
      where.userId = actor.actorUserId;
    }
    const search = normalizeOptionalText(input?.search, 'search', 120);
    if (search) {
      const normalized = normalizeSearchInput(search);
      where.OR =
        normalized.length > 0
          ? [
              { newClientNameNormalized: { contains: normalized } },
              { client: { is: { searchNormalized: { contains: normalized } } } },
            ]
          : [{ newClientName: { contains: search, mode: 'insensitive' } }];
    }
    const page = readPageQuery(input?.page, 1);
    const limit = readLimitQuery(input?.limit, {
      fallback: VISIT_REPORT_LIST_LIMIT_DEFAULT,
      max: VISIT_REPORT_LIST_LIMIT_MAX,
    });
    const skip = (page - 1) * limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.visitReport.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        include: {
          user: { select: REPORT_USER_SELECT },
          client: { select: REPORT_CLIENT_SELECT },
        },
      }),
      this.prisma.visitReport.count({ where }),
    ]);
    return { items: items.map(toVisitReportView), page: buildPage(total, page, limit) };
  }

  // Contadores do dashboard do prospector — sempre do proprio ator, EXCLUINDO
  // canceladas. `now` injetavel p/ testes.
  async getMyVisitReportStats(actorContext, { now = new Date() } = {}) {
    const actor = assertAuthenticatedActor(actorContext, 'read visit report stats');
    const { todayStartUtc, todayEndUtc } = computeVisitStatsWindows(now);
    const [row] = await this.prisma.$queryRaw`
      SELECT
        COUNT(*) FILTER (
          WHERE v."cancelled_at" IS NULL
            AND COALESCE(v."captured_at", v."created_at") >= ${todayStartUtc}
            AND COALESCE(v."captured_at", v."created_at") < ${todayEndUtc}
        )::INTEGER AS "todayCount",
        COUNT(*) FILTER (
          WHERE v."cancelled_at" IS NULL
            AND v."client_kind" = 'NEW'
            AND COALESCE(v."captured_at", v."created_at") >= ${todayStartUtc}
            AND COALESCE(v."captured_at", v."created_at") < ${todayEndUtc}
        )::INTEGER AS "todayNewClientsCount"
      FROM "visit_report" v
      WHERE v."user_id" = ${actor.actorUserId}::uuid
    `;
    return {
      todayCount: row?.todayCount ?? 0,
      todayNewClientsCount: row?.todayNewClientsCount ?? 0,
    };
  }

  // ---- Relatorio SEMANAL ----

  // `now` injetavel apenas para testes deterministas da semana.
  async createWeeklyReport(input, actorContext, { now = new Date() } = {}) {
    const actor = assertAuthenticatedActor(actorContext, 'create weekly report');
    assertRoleAllowed(actor.role, WEEKLY_REPORT_AUTHOR_ROLES, 'create weekly report');
    const summary = normalizeRequiredText(input?.summary, 'summary', WEEKLY_TEXT_MAX);
    const difficulties = normalizeOptionalText(
      input?.difficulties,
      'difficulties',
      WEEKLY_TEXT_MAX
    );
    const nextWeekPlan = normalizeOptionalText(
      input?.nextWeekPlan,
      'nextWeekPlan',
      WEEKLY_TEXT_MAX
    );
    const { weekStart } = computeWeekReference(now);
    let created;
    try {
      created = await this.prisma.weeklyReport.create({
        data: {
          id: randomUUID(),
          userId: actor.actorUserId,
          weekStart,
          summary,
          difficulties,
          nextWeekPlan,
        },
        include: { user: { select: REPORT_USER_SELECT } },
      });
    } catch (error) {
      // A UNIQUE (user_id, week_start) e a fonte de verdade do "1 por semana".
      if (error?.code === 'P2002') {
        throw new HttpError(409, 'Weekly report already submitted for this week', {
          code: 'WEEKLY_REPORT_ALREADY_EXISTS',
        });
      }
      throw error;
    }
    return { report: toWeeklyReportView(created) };
  }

  // Cancelamento SOFT do semanal — mesmo padrao da visita (so o proprio autor).
  async cancelWeeklyReport(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'cancel weekly report');
    const reportId = normalizeRequiredText(input?.reportId, 'reportId', 100);
    const result = await this.prisma.weeklyReport.updateMany({
      where: { id: reportId, userId: actor.actorUserId, cancelledAt: null },
      data: { cancelledAt: new Date(), cancelledByUserId: actor.actorUserId },
    });
    if (result.count === 0) {
      throw new HttpError(404, 'Weekly report not found', { code: 'WEEKLY_REPORT_NOT_FOUND' });
    }
    const row = await this.prisma.weeklyReport.findUnique({
      where: { id: reportId },
      include: { user: { select: REPORT_USER_SELECT } },
    });
    return { report: toWeeklyReportView(row) };
  }

  // ---- Feed combinado da pagina "Relatorios" ----
  // scope=all (todo nao-PROSPECTOR): visita + semanal de TODOS os autores, mais
  // recentes primeiro. UNION ALL (id, type, created_at) paginado por offset +
  // hidratacao por tipo — pagina exata sem overfetch; total via counts somados.
  async listInformeFeed(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'list informe feed');
    assertRoleAllowed(actor.role, VISIT_REPORT_VIEWER_ROLES, 'list informe feed');
    const page = readPageQuery(input?.page, 1);
    const limit = readLimitQuery(input?.limit, {
      fallback: INFORME_FEED_LIMIT_DEFAULT,
      max: INFORME_FEED_LIMIT_MAX,
    });
    const offset = (page - 1) * limit;
    const [counts, skeleton] = await Promise.all([
      this.prisma.$transaction([this.prisma.visitReport.count(), this.prisma.weeklyReport.count()]),
      this.prisma.$queryRaw`
        SELECT id, 'VISIT_REPORT' AS type, created_at FROM "visit_report"
        UNION ALL
        SELECT id, 'WEEKLY_REPORT' AS type, created_at FROM "weekly_report"
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
    ]);
    const total = counts[0] + counts[1];
    const idsByType = { VISIT_REPORT: [], WEEKLY_REPORT: [] };
    for (const row of skeleton) {
      idsByType[row.type]?.push(row.id);
    }
    const [visitReports, weeklyReports] = await Promise.all([
      idsByType.VISIT_REPORT.length > 0
        ? this.prisma.visitReport.findMany({
            where: { id: { in: idsByType.VISIT_REPORT } },
            include: {
              user: { select: REPORT_USER_SELECT },
              client: { select: REPORT_CLIENT_SELECT },
            },
          })
        : [],
      idsByType.WEEKLY_REPORT.length > 0
        ? this.prisma.weeklyReport.findMany({
            where: { id: { in: idsByType.WEEKLY_REPORT } },
            include: { user: { select: REPORT_USER_SELECT } },
          })
        : [],
    ]);
    const viewById = new Map();
    for (const row of visitReports) {
      viewById.set(row.id, toVisitReportView(row));
    }
    for (const row of weeklyReports) {
      viewById.set(row.id, toWeeklyReportView(row));
    }
    return {
      items: skeleton.map((row) => viewById.get(row.id)).filter(Boolean),
      page: buildPage(total, page, limit),
    };
  }
}
