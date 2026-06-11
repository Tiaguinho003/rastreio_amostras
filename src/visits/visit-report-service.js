import { randomUUID } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';
import { assertRoleAllowed, USER_ROLES } from '../auth/roles.js';
import { buildClientDisplayName, normalizeSearchInput } from '../clients/client-support.js';
import {
  assertAuthenticatedActor,
  normalizeOptionalText,
  normalizeRequiredText,
  readLimitQuery,
  readPageQuery,
  toIsoString,
} from '../users/user-support.js';

// Informe de visita (pagina /informe): cada envio do formulario vira 1 row
// imutavel em visit_report. Qualquer usuario autenticado envia; a listagem
// e dos viewers (pagina /resumo, veem tudo) e do PROSPECTOR (informes de
// todos os autores prospectores — comparacao da equipe — na lista do
// dashboard dele). userId e createdAt sao carimbados no servidor — o body
// nunca decide quem enviou nem quando.

export const VISIT_CLIENT_KINDS = Object.freeze(['EXISTING', 'NEW']);
export const VISIT_FARM_SIZES = Object.freeze(['SMALL', 'MEDIUM', 'LARGE']);
export const VISIT_INTEREST_LEVELS = Object.freeze(['NONE', 'LOW', 'MEDIUM', 'HIGH']);

export const VISIT_REPORT_LIST_LIMIT_DEFAULT = 20;
export const VISIT_REPORT_LIST_LIMIT_MAX = 100;

// Quem ve a pagina /resumo (espelhado no front em lib/roles.ts
// isVisitReportViewer): Administracao + Comercial + Cadastro — as
// notificacoes situacionais de visita apontam pra la. PROSPECTOR nao e
// viewer: lista apenas informes de autores PROSPECTOR (escopo forcado).
export const VISIT_REPORT_VIEWER_ROLES = Object.freeze([
  USER_ROLES.ADMIN,
  USER_ROLES.COMMERCIAL,
  USER_ROLES.CADASTRO,
]);

const NEW_CLIENT_NAME_MAX = 200;
const NEW_CLIENT_CITY_MAX = 120;
const NEW_CLIENT_PHONE_MAX = 40;
const NOTES_MAX = 1000;

// Tolerancia de relogio adiantado do aparelho ao validar capturedAt.
const CAPTURED_AT_FUTURE_SKEW_MS = 5 * 60 * 1000;

// Offset fixo de Brasilia (UTC-3, sem horario de verao desde 2019) —
// mesmo padrao das janelas do dashboard (src/samples/sample-query-service.js).
const SAO_PAULO_UTC_OFFSET_HOURS = 3;

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

// Janela do dia BRT corrente como instantes UTC (inicio inclusivo, fim
// exclusivo) — base dos dois contadores do dashboard do prospector.
// Dia inteiro 00:00→24:00 BRT — nao confundir com a janela 07:00–18:00 do
// todayReceivedTotal do dashboard (horario comercial, outro proposito).
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

// Exportada: o feed combinado (commercial-forms-service) reusa esta view
// para os itens do tipo VISIT_REPORT.
export function toVisitReportView(row) {
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
    generalNotes: row.generalNotes,
    capturedAt: toIsoString(row.capturedAt),
    createdAt: toIsoString(row.createdAt),
  };
}

export class VisitReportService {
  constructor({ prisma, pushService = null }) {
    this.prisma = prisma;
    this.pushService = pushService;
  }

  // Side-effects fire-and-forget (padrao Q.auto): notificacoes SITUACIONAIS
  // do informe — um formulario pode disparar 0, 1 ou 2 (as condicoes sao
  // independentes; sem match = sem notificacao, o informe segue no /resumo).
  // Nunca quebram o request — falha so loga. O replay idempotente da rota
  // (withIdempotency) e curto-circuitado ANTES do service, entao este hook
  // nao roda duas vezes pra mesma Idempotency-Key. Tags por informe: varias
  // notificacoes nao lidas empilham na central em vez de se substituirem.
  async _notifyVisitReportCreated(view, actorContext) {
    if (!this.pushService) {
      return;
    }

    const exclude = { excludeUserId: actorContext?.actorUserId ?? null };
    const visitorName = view.user?.fullName ?? view.user?.username ?? 'Alguém';
    const sends = [];

    // Situacao 1 — visita promissora: tamanho (Medio OU Grande) E interesse
    // Alto, as DUAS condicoes juntas.
    const isPromising =
      (view.farmSize === 'MEDIUM' || view.farmSize === 'LARGE') && view.interestLevel === 'HIGH';
    if (isPromising) {
      sends.push(
        this.pushService.sendToRoles(
          ['ADMIN', 'COMMERCIAL'],
          {
            title: 'Nova visita promissora enviada',
            body: `${visitorName} visitou um cliente promissor. Confira!`,
            url: '/resumo',
            tag: `visit-promising-${view.id}`,
          },
          exclude
        )
      );
    }

    // Situacao 2 — cliente novo: independente das demais respostas.
    if (view.clientKind === 'NEW') {
      sends.push(
        this.pushService.sendToRoles(
          ['ADMIN', 'CADASTRO'],
          {
            title: 'Novo cliente encontrado!',
            body: 'Clique para ver os dados e cadastrá-lo',
            url: '/resumo',
            tag: `visit-new-client-${view.id}`,
          },
          exclude
        )
      );
    }

    if (sends.length === 0) {
      return;
    }

    const results = await Promise.allSettled(sends);
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[push] falha ao notificar informe de visita', {
          reportId: view.id,
          message: result.reason?.message ?? 'unknown',
        });
      }
    }
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
    // Campo 5: observacoes gerais — discursivo e opcional.
    const generalNotes = normalizeOptionalText(input?.generalNotes, 'generalNotes', NOTES_MAX);
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
        generalNotes,
        capturedAt,
      },
      include: {
        user: { select: VISIT_REPORT_USER_SELECT },
        client: { select: VISIT_REPORT_CLIENT_SELECT },
      },
    });

    const view = toVisitReportView(created);
    await this._notifyVisitReportCreated(view, actorContext);

    return { report: view };
  }

  // Exclusao: Administracao exclui QUALQUER informe (curadoria do feed
  // /resumo); os demais papeis excluem apenas o PROPRIO (lixeira do
  // dashboard do prospector). Informe alheio responde 404 — mesma resposta
  // de inexistente, sem vazar existencia. Hard delete: o informe nao
  // participa de projecoes nem do event store.
  async deleteVisitReport(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'delete visit report');
    const reportId = normalizeRequiredText(input?.reportId, 'reportId', 100);

    const where =
      actor.role === USER_ROLES.ADMIN
        ? { id: reportId }
        : { id: reportId, userId: actor.actorUserId };

    const result = await this.prisma.visitReport.deleteMany({ where });
    if (result.count === 0) {
      throw new HttpError(404, 'Visit report not found', {
        code: 'VISIT_REPORT_NOT_FOUND',
      });
    }

    return { removed: true };
  }

  async listVisitReports(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'list visit reports');
    assertRoleAllowed(
      actor.role,
      [...VISIT_REPORT_VIEWER_ROLES, USER_ROLES.PROSPECTOR],
      'list visit reports'
    );
    // Viewers (/resumo) veem todos os informes; PROSPECTOR ve os informes
    // de TODOS os autores com papel PROSPECTOR — o proprio incluido —
    // para comparacao entre a equipe de campo (mas nao os dos demais
    // papeis). O escopo e forcado aqui, nunca decidido pelo cliente; os
    // contadores (getMyVisitReportStats) seguem sendo so do proprio ator.
    const where = {};
    if (actor.role === USER_ROLES.PROSPECTOR) {
      where.user = { is: { role: USER_ROLES.PROSPECTOR } };
    }

    // Busca por nome do cliente (barra do dashboard do prospector) —
    // acento-insensitive nos dois caminhos, via colunas GERADAS pelo banco
    // (LOWER + immutable_unaccent): cliente novo em
    // visit_report.new_client_name_normalized e cliente cadastrado em
    // client.search_normalized (mesma semantica da busca de clientes).
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
          user: { select: VISIT_REPORT_USER_SELECT },
          client: { select: VISIT_REPORT_CLIENT_SELECT },
        },
      }),
      this.prisma.visitReport.count({ where }),
    ]);

    return {
      items: items.map(toVisitReportView),
      page: buildPage(total, page, limit),
    };
  }

  // Contadores do dashboard do prospector — sempre do proprio ator (escopo
  // inerente por actorUserId; sem regra de papel aqui: quem alcanca o
  // endpoint e decidido pelo gate central de API). Os dois cards contam o
  // DIA corrente: visitas enviadas hoje e, dentre elas, as com "Cliente
  // novo". Base temporal COALESCE(captured_at, created_at): informe
  // preenchido offline ontem e sincronizado hoje conta ontem, coerente com
  // a data que /resumo exibe. `now` e injetavel apenas para testes.
  async getMyVisitReportStats(actorContext, { now = new Date() } = {}) {
    const actor = assertAuthenticatedActor(actorContext, 'read visit report stats');
    const { todayStartUtc, todayEndUtc } = computeVisitStatsWindows(now);

    const [row] = await this.prisma.$queryRaw`
      SELECT
        COUNT(*) FILTER (
          WHERE COALESCE(v."captured_at", v."created_at") >= ${todayStartUtc}
            AND COALESCE(v."captured_at", v."created_at") < ${todayEndUtc}
        )::INTEGER AS "todayCount",
        COUNT(*) FILTER (
          WHERE v."client_kind" = 'NEW'
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
}
