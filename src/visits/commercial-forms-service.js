import { randomUUID } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';
import { assertRoleAllowed, USER_ROLES } from '../auth/roles.js';
import { buildClientDisplayName } from '../clients/client-support.js';
import {
  assertAuthenticatedActor,
  normalizeOptionalText,
  normalizeRequiredText,
  readLimitQuery,
  readPageQuery,
  toIsoString,
} from '../users/user-support.js';
import {
  VISIT_CLIENT_KINDS,
  VISIT_REPORT_LINK_CURATOR_ROLES,
  VISIT_REPORT_VIEWER_ROLES,
} from './visit-report-service.js';
import { toVisitReportView } from './visit-report-service.js';

// Formularios do COMERCIAL (pagina /informe do papel COMMERCIAL — plano
// "um formulario por papel"): visita do comercial (commercial_visit) e
// relatorio semanal (weekly_report), mais o FEED COMBINADO paginado que
// alimenta a pagina do comercial (escopo "mine") e o /resumo (escopo
// "all", incluindo tambem os informes do prospector em visit_report).
// userId e createdAt sao carimbados no servidor; sem fila offline (sem
// capturedAt e sem idempotencia — envio exige internet).

// Reasons aceitos no CREATE. Subconjunto do enum Prisma CommercialVisitReason:
// COLLECTION ("Cobrança") foi DESCONTINUADA do formulario e nao e mais
// criavel via API — mas segue no enum do banco para nao quebrar visitas ja
// registradas (leitura/exibicao preservadas; sem migration de enum).
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

export const INFORME_FEED_SCOPES = Object.freeze(['mine', 'all']);
export const INFORME_FEED_LIMIT_DEFAULT = 20;
export const INFORME_FEED_LIMIT_MAX = 100;

// Quem CRIA os formularios do comercial (a pagina renderiza pros dois).
export const COMMERCIAL_FORM_AUTHOR_ROLES = Object.freeze([
  USER_ROLES.COMMERCIAL,
  USER_ROLES.ADMIN,
]);

const NEW_CLIENT_NAME_MAX = 200;
const NEW_CLIENT_CITY_MAX = 120;
const NEW_CLIENT_PHONE_MAX = 40;
const NOTES_MAX = 1000;
const WEEKLY_TEXT_MAX = 2000;

// Regra R1 do lembrete: ultimo relatorio com mais de 6 dias e 12 horas.
const WEEKLY_REMINDER_MIN_AGE_MS = (6 * 24 + 12) * 3600_000;
// Regra R2: sexta-feira a partir das 17:00 BRT.
const WEEKLY_REMINDER_FRIDAY_HOUR_BRT = 17;

// Offset fixo de Brasilia (UTC-3, sem horario de verao desde 2019) —
// mesmo padrao das demais janelas BRT do projeto.
const SAO_PAULO_UTC_OFFSET_HOURS = 3;

const FORM_USER_SELECT = {
  id: true,
  fullName: true,
  username: true,
};

// Campos minimos pra montar displayName (PF usa fullName; PJ usa
// tradeName/legalName — ver buildClientDisplayName).
const FORM_CLIENT_SELECT = {
  id: true,
  code: true,
  personType: true,
  fullName: true,
  tradeName: true,
  legalName: true,
  status: true,
};

// Semana de referencia do relatorio: segunda 00:00 BRT (inclusive) ate a
// proxima segunda (exclusive). weekStart/weekEndDate sao DATEs date-only
// (meia-noite UTC da data BRT) — weekStart vai direto pra coluna DATE.
// O SERVIDOR sempre computa de now(); o body nunca decide a semana.
// Espelho client-side (apenas exibicao) em lib/weekly-report.ts.
export function computeWeekReference(now = new Date()) {
  const brtNow = new Date(now.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000);
  const year = brtNow.getUTCFullYear();
  const month = brtNow.getUTCMonth();
  const day = brtNow.getUTCDate();
  // getUTCDay: 0=domingo, 1=segunda, ..., 6=sabado
  const weekday = brtNow.getUTCDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;

  return {
    weekStart: new Date(Date.UTC(year, month, day - daysFromMonday)),
    weekEndDate: new Date(Date.UTC(year, month, day - daysFromMonday + 6)),
    weekEndExclusive: new Date(Date.UTC(year, month, day - daysFromMonday + 7)),
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

function toDateOnlyString(value) {
  return value.toISOString().slice(0, 10);
}

function toCommercialVisitView(row) {
  return {
    id: row.id,
    type: 'COMMERCIAL_VISIT',
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
    reason: row.reason,
    reasonNotes: row.reasonNotes,
    outcome: row.outcome,
    outcomeNotes: row.outcomeNotes,
    generalNotes: row.generalNotes,
    // Curadoria do vinculo (espelha visit_report) — so povoado quando o ADM/
    // Cadastro vincula uma visita de cliente NOVO no /resumo.
    linkedBy: row.linkedBy
      ? {
          id: row.linkedBy.id,
          fullName: row.linkedBy.fullName,
          username: row.linkedBy.username,
        }
      : null,
    linkedAt: toIsoString(row.linkedAt ?? null),
    createdAt: toIsoString(row.createdAt),
  };
}

function toWeeklyReportView(row) {
  const weekStart = row.weekStart;
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 3600_000);
  return {
    id: row.id,
    type: 'WEEKLY_REPORT',
    user: row.user
      ? {
          id: row.user.id,
          fullName: row.user.fullName,
          username: row.user.username,
        }
      : null,
    weekStart: toDateOnlyString(weekStart),
    weekEnd: toDateOnlyString(weekEnd),
    summary: row.summary,
    difficulties: row.difficulties,
    nextWeekPlan: row.nextWeekPlan,
    createdAt: toIsoString(row.createdAt),
  };
}

export class CommercialFormsService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  // Identificacao do cliente identica ao visit_report do prospector
  // (comentario cruzado: resolveClientIdentification em
  // visit-report-service.js — manter regras em sincronia):
  //   EXISTING — clientId obrigatorio, existente e ACTIVE; campos new_* zeram.
  //   NEW      — newClientName obrigatorio; cidade/telefone opcionais.
  async resolveClientIdentification(input) {
    const clientKind = normalizeEnumChoice(input.clientKind, VISIT_CLIENT_KINDS, 'clientKind');

    if (clientKind === 'EXISTING') {
      const clientId = normalizeRequiredText(input.clientId, 'clientId', 100);
      const client = await this.prisma.client.findUnique({
        where: { id: clientId },
        select: FORM_CLIENT_SELECT,
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

  async createCommercialVisit(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'create commercial visit');
    assertRoleAllowed(actor.role, COMMERCIAL_FORM_AUTHOR_ROLES, 'create commercial visit');

    const identification = await this.resolveClientIdentification(input ?? {});
    const reason = normalizeEnumChoice(input?.reason, COMMERCIAL_VISIT_REASONS, 'reason');
    const reasonNotes = normalizeOptionalText(input?.reasonNotes, 'reasonNotes', NOTES_MAX);
    const outcome = normalizeEnumChoice(input?.outcome, COMMERCIAL_VISIT_OUTCOMES, 'outcome');
    const outcomeNotes = normalizeOptionalText(input?.outcomeNotes, 'outcomeNotes', NOTES_MAX);
    const generalNotes = normalizeOptionalText(input?.generalNotes, 'generalNotes', NOTES_MAX);

    const created = await this.prisma.commercialVisit.create({
      data: {
        id: randomUUID(),
        userId: actor.actorUserId,
        clientKind: identification.clientKind,
        clientId: identification.clientId,
        newClientName: identification.newClientName,
        newClientCity: identification.newClientCity,
        newClientPhone: identification.newClientPhone,
        reason,
        reasonNotes,
        outcome,
        outcomeNotes,
        generalNotes,
      },
      include: {
        user: { select: FORM_USER_SELECT },
        client: { select: FORM_CLIENT_SELECT },
      },
    });

    return { visit: toCommercialVisitView(created) };
  }

  // `now` e injetavel apenas para testes deterministas da semana.
  async createWeeklyReport(input, actorContext, { now = new Date() } = {}) {
    const actor = assertAuthenticatedActor(actorContext, 'create weekly report');
    assertRoleAllowed(actor.role, COMMERCIAL_FORM_AUTHOR_ROLES, 'create weekly report');

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
        include: {
          user: { select: FORM_USER_SELECT },
        },
      });
    } catch (error) {
      // A UNIQUE (user_id, week_start) e a fonte de verdade do "1 por
      // semana" — sem pre-check (race-safe).
      if (error?.code === 'P2002') {
        throw new HttpError(409, 'Weekly report already submitted for this week', {
          code: 'WEEKLY_REPORT_ALREADY_EXISTS',
        });
      }
      throw error;
    }

    return { report: toWeeklyReportView(created) };
  }

  // Exclusao no mesmo padrao do deleteVisitReport: APENAS o autor exclui o
  // proprio formulario (nem ADMIN exclui alheio). Item alheio (ou
  // inexistente) responde 404 — nao vaza existencia.
  async deleteCommercialVisit(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'delete commercial visit');
    const visitId = normalizeRequiredText(input?.visitId, 'visitId', 100);

    const result = await this.prisma.commercialVisit.deleteMany({
      where: { id: visitId, userId: actor.actorUserId },
    });
    if (result.count === 0) {
      throw new HttpError(404, 'Commercial visit not found', {
        code: 'COMMERCIAL_VISIT_NOT_FOUND',
      });
    }

    return { removed: true };
  }

  async deleteWeeklyReport(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'delete weekly report');
    const reportId = normalizeRequiredText(input?.reportId, 'reportId', 100);

    const result = await this.prisma.weeklyReport.deleteMany({
      where: { id: reportId, userId: actor.actorUserId },
    });
    if (result.count === 0) {
      throw new HttpError(404, 'Weekly report not found', {
        code: 'WEEKLY_REPORT_NOT_FOUND',
      });
    }

    return { removed: true };
  }

  // Curadoria do vinculo da VISITA COMERCIAL (pagina /resumo): ADM/CADASTRO
  // setam/trocam/removem o cliente vinculado — MAS so quando clientKind=NEW
  // (cliente novo, sem vinculo). EXISTING e born-linked pelo lookup do form e
  // NAO e curavel. Espelha linkVisitReportClient; clientId null desvincula
  // (volta o trio a NULL); clientId === undefined responde 422.
  async linkCommercialVisitClient(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'link commercial visit client');
    assertRoleAllowed(actor.role, VISIT_REPORT_LINK_CURATOR_ROLES, 'link commercial visit client');

    const visitId = normalizeRequiredText(input?.visitId, 'visitId', 100);

    let clientId = null;
    if (input?.clientId !== null) {
      if (input?.clientId === undefined) {
        throw new HttpError(422, 'clientId must be a client id string, or null to unlink', {
          code: 'VALIDATION_ERROR',
          field: 'clientId',
        });
      }

      clientId = normalizeRequiredText(input.clientId, 'clientId', 100);
      await this._assertActiveClient(clientId);
    }

    // So clientKind=NEW e curavel — EXISTING (born-linked pelo lookup do form)
    // nao se mexe (decisao do usuario).
    const existing = await this.prisma.commercialVisit.findUnique({
      where: { id: visitId },
      select: { clientKind: true },
    });
    if (!existing) {
      throw new HttpError(404, 'Commercial visit not found', {
        code: 'COMMERCIAL_VISIT_NOT_FOUND',
      });
    }
    if (existing.clientKind !== 'NEW') {
      throw new HttpError(422, 'Only NEW-client commercial visits can be curated', {
        code: 'COMMERCIAL_VISIT_NOT_CURATABLE',
        field: 'clientKind',
      });
    }

    const updated = await this.prisma.commercialVisit.update({
      where: { id: visitId },
      data:
        clientId === null
          ? { clientId: null, linkedByUserId: null, linkedAt: null }
          : { clientId, linkedByUserId: actor.actorUserId, linkedAt: new Date() },
      include: {
        user: { select: FORM_USER_SELECT },
        client: { select: FORM_CLIENT_SELECT },
        linkedBy: { select: FORM_USER_SELECT },
      },
    });

    return { visit: toCommercialVisitView(updated) };
  }

  async _assertActiveClient(clientId) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: FORM_CLIENT_SELECT,
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

  // Feed combinado paginado, mais recentes primeiro:
  //   scope=mine — visitas + relatorios DO PROPRIO ator (pagina /informe
  //                do comercial). Papeis: COMMERCIAL e ADMIN.
  //   scope=all  — os 3 tipos (incluindo visit_report do prospector) de
  //                todos os autores (/resumo). Papeis: viewers do /resumo.
  // Esqueleto via UNION ALL (id, type, created_at) paginado por offset +
  // hidratacao por tipo — pagina exata sem overfetch; total via counts
  // Prisma somados (evita BigInt do COUNT raw).
  async listInformeFeed(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'list informe feed');
    const scope = normalizeEnumChoice(input?.scope, INFORME_FEED_SCOPES, 'scope');

    if (scope === 'mine') {
      assertRoleAllowed(actor.role, COMMERCIAL_FORM_AUTHOR_ROLES, 'list own informe feed');
    } else {
      assertRoleAllowed(actor.role, VISIT_REPORT_VIEWER_ROLES, 'list informe feed');
    }

    const page = readPageQuery(input?.page, 1);
    const limit = readLimitQuery(input?.limit, {
      fallback: INFORME_FEED_LIMIT_DEFAULT,
      max: INFORME_FEED_LIMIT_MAX,
    });
    const offset = (page - 1) * limit;

    let skeleton;
    let total;
    if (scope === 'mine') {
      const userId = actor.actorUserId;
      const [counts, rows] = await Promise.all([
        this.prisma.$transaction([
          this.prisma.commercialVisit.count({ where: { userId } }),
          this.prisma.weeklyReport.count({ where: { userId } }),
        ]),
        this.prisma.$queryRaw`
          SELECT id, 'COMMERCIAL_VISIT' AS type, created_at
            FROM "commercial_visit" WHERE "user_id" = ${userId}::uuid
          UNION ALL
          SELECT id, 'WEEKLY_REPORT' AS type, created_at
            FROM "weekly_report" WHERE "user_id" = ${userId}::uuid
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
      ]);
      total = counts[0] + counts[1];
      skeleton = rows;
    } else {
      const [counts, rows] = await Promise.all([
        this.prisma.$transaction([
          this.prisma.visitReport.count(),
          this.prisma.commercialVisit.count(),
          this.prisma.weeklyReport.count(),
        ]),
        this.prisma.$queryRaw`
          SELECT id, 'VISIT_REPORT' AS type, created_at FROM "visit_report"
          UNION ALL
          SELECT id, 'COMMERCIAL_VISIT' AS type, created_at FROM "commercial_visit"
          UNION ALL
          SELECT id, 'WEEKLY_REPORT' AS type, created_at FROM "weekly_report"
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
      ]);
      total = counts[0] + counts[1] + counts[2];
      skeleton = rows;
    }

    // Hidratacao por tipo, preservando a ordem do esqueleto.
    const idsByType = { VISIT_REPORT: [], COMMERCIAL_VISIT: [], WEEKLY_REPORT: [] };
    for (const row of skeleton) {
      idsByType[row.type]?.push(row.id);
    }

    const [visitReports, commercialVisits, weeklyReports] = await Promise.all([
      idsByType.VISIT_REPORT.length > 0
        ? this.prisma.visitReport.findMany({
            where: { id: { in: idsByType.VISIT_REPORT } },
            include: {
              user: { select: FORM_USER_SELECT },
              client: { select: FORM_CLIENT_SELECT },
              // Curadoria do vinculo (badge/acoes do /resumo).
              linkedBy: { select: FORM_USER_SELECT },
            },
          })
        : [],
      idsByType.COMMERCIAL_VISIT.length > 0
        ? this.prisma.commercialVisit.findMany({
            where: { id: { in: idsByType.COMMERCIAL_VISIT } },
            include: {
              user: { select: FORM_USER_SELECT },
              client: { select: FORM_CLIENT_SELECT },
              // Curadoria do vinculo (badge/acoes do /resumo) — so clientKind=NEW.
              linkedBy: { select: FORM_USER_SELECT },
            },
          })
        : [],
      idsByType.WEEKLY_REPORT.length > 0
        ? this.prisma.weeklyReport.findMany({
            where: { id: { in: idsByType.WEEKLY_REPORT } },
            include: { user: { select: FORM_USER_SELECT } },
          })
        : [],
    ]);

    const viewById = new Map();
    for (const row of visitReports) {
      viewById.set(row.id, { type: 'VISIT_REPORT', ...toVisitReportView(row) });
    }
    for (const row of commercialVisits) {
      viewById.set(row.id, toCommercialVisitView(row));
    }
    for (const row of weeklyReports) {
      viewById.set(row.id, toWeeklyReportView(row));
    }

    return {
      items: skeleton.map((row) => viewById.get(row.id)).filter(Boolean),
      page: buildPage(total, page, limit),
    };
  }

  // Lembrete de preenchimento do relatorio semanal (push, titulo unico
  // "Lembre-se do seu relatório." SEM corpo) — avaliado pelo job
  // push-digest (kind weekly-reminder) a cada execucao agendada. Para cada
  // COMMERCIAL ATIVO sem o relatorio da SEMANA CORRENTE e sem lembrete ja
  // emitido nesta semana, dispara quando QUALQUER uma das regras vale:
  //   R1 — o ultimo relatorio dele (qualquer semana) tem mais de 6 dias e
  //        12 horas (exige pelo menos um relatorio anterior);
  //   R2 — e sexta-feira >= 17:00 BRT (cobre tambem quem nunca enviou).
  // weekly_report_reminder (UNIQUE usuario+semana) garante NO MAXIMO 1
  // lembrete por semana, qualquer que seja a regra — o marcador e inserido
  // ANTES do envio (race-safe entre execucoes concorrentes do job).
  // `now` e injetavel apenas para testes deterministas.
  async sendWeeklyReportReminders({ pushService, now = new Date(), ttlSeconds = 6 * 3600 } = {}) {
    if (!pushService) {
      return { candidates: 0, reminded: 0, sent: 0, failed: 0, pruned: 0 };
    }

    const { weekStart } = computeWeekReference(now);
    const ruleOneThreshold = new Date(now.getTime() - WEEKLY_REMINDER_MIN_AGE_MS);

    const brtNow = new Date(now.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000);
    const isFridayWindow =
      brtNow.getUTCDay() === 5 && brtNow.getUTCHours() >= WEEKLY_REMINDER_FRIDAY_HOUR_BRT;

    const commercials = await this.prisma.user.findMany({
      where: { role: USER_ROLES.COMMERCIAL, status: 'ACTIVE' },
      select: {
        id: true,
        weeklyReports: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true, weekStart: true },
        },
        weeklyReportReminders: {
          where: { weekStart },
          take: 1,
          select: { id: true },
        },
      },
    });

    const targets = [];
    for (const user of commercials) {
      // Ja lembrado nesta semana (qualquer das regras): nada a fazer.
      if (user.weeklyReportReminders.length > 0) {
        continue;
      }

      // O relatorio mais recente e o de maior weekStart — se for o da
      // semana corrente, o usuario ja cumpriu a semana.
      const last = user.weeklyReports[0] ?? null;
      if (last && last.weekStart.getTime() === weekStart.getTime()) {
        continue;
      }

      const ruleOne = last !== null && last.createdAt.getTime() <= ruleOneThreshold.getTime();
      if (ruleOne || isFridayWindow) {
        targets.push(user.id);
      }
    }

    // Marca ANTES de enviar: a UNIQUE derruba a corrida entre execucoes.
    const remindedIds = [];
    for (const userId of targets) {
      try {
        await this.prisma.weeklyReportReminder.create({
          data: { id: randomUUID(), userId, weekStart },
        });
        remindedIds.push(userId);
      } catch (error) {
        if (error?.code === 'P2002') {
          continue;
        }
        throw error;
      }
    }

    let sent = 0;
    let failed = 0;
    let pruned = 0;
    if (remindedIds.length > 0) {
      const result = await pushService.sendToUsers(
        remindedIds,
        {
          title: 'Lembre-se do seu relatório.',
          // Sem corpo, por decisao de produto — o SW renderiza so o titulo
          // (body '' e intencional; fallback do SW vale so pra payload
          // malformado).
          body: '',
          url: '/informe',
          tag: 'weekly-report-reminder',
        },
        { ttl: ttlSeconds, urgency: 'normal' }
      );
      sent = result.sent;
      failed = result.failed;
      pruned = result.pruned;
    }

    return { candidates: targets.length, reminded: remindedIds.length, sent, failed, pruned };
  }
}
