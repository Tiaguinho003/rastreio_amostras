import { Prisma } from '@prisma/client';

import { buildCompletenessWhere } from '../clients/client-service.js';
import { HttpError } from '../contracts/errors.js';
import {
  canonicalizeAspecto,
  canonicalizeCatacao,
  canonicalizeCertif,
  canonicalizePadrao,
} from './classification-canonicalization.js';

// Campos de classificacao filtraveis por valores distintos (multi-selecao).
// param = chave da query/CSV; key = chave no JSON latestClassificationData;
// canon = canonicalizador (mesmo do projetor) aplicado a opcoes e ao filtro.
const CLASSIFICATION_FILTER_FIELDS = [
  { param: 'padroes', key: 'padrao', canon: canonicalizePadrao },
  { param: 'aspectos', key: 'aspecto', canon: canonicalizeAspecto },
  { param: 'catacoes', key: 'catacao', canon: canonicalizeCatacao },
  { param: 'certificados', key: 'certif', canon: canonicalizeCertif },
];
const CLASSIFICATION_FILTER_FIELD_BY_KEY = new Map(
  CLASSIFICATION_FILTER_FIELDS.map((field) => [field.key, field])
);

// Liga T0.D: profundidade maxima das arvores recursivas de liga — descendente
// (loadBlendTree, loadBlendCascadeMovements) e ascendente (loadAncestorBlendTree).
// Guarda defensiva contra recursao patologica; o grafo de composicao e DAG por
// construcao (composicao imutavel apos a criacao da liga).
const MAX_BLEND_DEPTH = 10;

// Q.print: PRINT_PENDING_STATUSES removido — impressao virou acao pura,
// estado de impressao vive na tabela PrintJob.status='PENDING' (sem
// inflagar status do sample). Card "Aguardando impressao" foi cortado
// do dashboard (decisao Q.1.c #20).
const CLASSIFICATION_PENDING_STATUSES = ['REGISTRATION_CONFIRMED'];
const SAMPLE_STATUS_FILTER_GROUPS = {
  CLASSIFICATION_PENDING: CLASSIFICATION_PENDING_STATUSES,
  CLASSIFIED: ['CLASSIFIED'],
};
// Fila de classificacao pendente: a lista mostra TODOS os pendentes. A contagem
// do card vem de um groupBy separado, entao truncar a lista criava inconsistencia
// (total != itens — ex: 41 pendentes, modal mostrava 20). 500 e salvaguarda de
// payload, muito acima da fila real (dezenas/baixas centenas); sem paginacao.
const DASHBOARD_LIST_LIMIT = 500;
const DASHBOARD_BUSINESS_TIMEZONE = 'America/Sao_Paulo';
const SAMPLES_LIST_DEFAULT_LIMIT = 30;
const SAMPLES_LIST_MAX_LIMIT = 30;
const SAO_PAULO_UTC_OFFSET_HOURS = 3;
const MAX_QR_PARTS = 64;
const UUID_PATTERN =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
// Fase P1: lote interno passa a ser numerico puro. Pattern aceita o
// novo formato (`5641`) e o legado (`A-5641`) — backwards compat com
// samples antigos em local; producao foi wipada no L3.2.
const INTERNAL_LOT_PATTERN = '(?:A-)?\\d+';
const COMMERCIAL_STATUSES = ['OPEN', 'PARTIALLY_SOLD', 'SOLD', 'LOST'];
const DISPLAY_STATUSES = ['OPEN', 'SOLD', 'LOST', 'INVALIDATED'];

function computeMedian(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeMean(values) {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

// Calcula a janela da metrica operacional.
// A "data de referencia" (ultimo dia do grafico) e hoje se ja passou 17:30 BRT,
// senao ontem. A janela cobre 5 dias calendario terminando na data de referencia.
// Retorna instantes UTC (windowStartUtc inclusivo, windowEndUtc exclusivo) e a lista
// ordenada de 5 datas BRT no formato YYYY-MM-DD.
export function computeOperationalMetricsWindow(now = new Date()) {
  const nowMs = now.getTime();
  const brtNowMs = nowMs - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000;
  const brtNow = new Date(brtNowMs);
  const brtYear = brtNow.getUTCFullYear();
  const brtMonth = brtNow.getUTCMonth();
  const brtDay = brtNow.getUTCDate();

  // 17:30 BRT = 20:30 UTC (BRT = UTC-3, sem horario de verao desde 2019).
  const todayCutoffMs = Date.UTC(brtYear, brtMonth, brtDay, 20, 30, 0);

  const refYear = brtYear;
  const refMonth = brtMonth;
  const refDay = nowMs >= todayCutoffMs ? brtDay : brtDay - 1;

  // Inicio: (refDay - 4) 00:00 BRT = (refDay - 4) 03:00 UTC.
  // Fim: (refDay + 1) 00:00 BRT = (refDay + 1) 03:00 UTC (exclusivo).
  const windowStartUtc = new Date(
    Date.UTC(refYear, refMonth, refDay - 4, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0)
  );
  const windowEndUtc = new Date(
    Date.UTC(refYear, refMonth, refDay + 1, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0)
  );

  const bucketDates = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date(Date.UTC(refYear, refMonth, refDay - i));
    bucketDates.push(d.toISOString().slice(0, 10));
  }

  return { windowStartUtc, windowEndUtc, bucketDates };
}

// Calcula a janela da metrica comercial.
// A "semana de referencia" (ultima semana do grafico) e a semana corrente se ja
// passou sexta 17:30 BRT, senao a semana anterior. Semanas ISO (segunda-domingo).
// A janela cobre 4 semanas calendario terminando na semana de referencia.
// Retorna instantes UTC (windowStartUtc inclusivo, windowEndUtc exclusivo) e a lista
// ordenada de 4 datas BRT (segunda-feira de cada semana) no formato YYYY-MM-DD.
export function computeCommercialMetricsWindow(now = new Date()) {
  const nowMs = now.getTime();
  const brtNowMs = nowMs - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000;
  const brtNow = new Date(brtNowMs);
  const brtYear = brtNow.getUTCFullYear();
  const brtMonth = brtNow.getUTCMonth();
  const brtDay = brtNow.getUTCDate();
  // getUTCDay: 0=Domingo, 1=Segunda, ..., 6=Sabado
  const brtWeekday = brtNow.getUTCDay();
  const daysFromMonday = brtWeekday === 0 ? 6 : brtWeekday - 1;

  // Segunda-feira da semana corrente em BRT.
  const thisWeekMondayDay = brtDay - daysFromMonday;
  // Sexta 17:30 BRT = Sexta 20:30 UTC (segunda + 4 dias).
  const thisFridayCutoffMs = Date.UTC(brtYear, brtMonth, thisWeekMondayDay + 4, 20, 30, 0);

  const refMondayDay = nowMs >= thisFridayCutoffMs ? thisWeekMondayDay : thisWeekMondayDay - 7;

  // Inicio: (refMonday - 21 dias) 00:00 BRT = 03:00 UTC.
  // Fim: (refMonday + 7 dias) 00:00 BRT = 03:00 UTC (exclusivo).
  const windowStartUtc = new Date(
    Date.UTC(brtYear, brtMonth, refMondayDay - 21, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0)
  );
  const windowEndUtc = new Date(
    Date.UTC(brtYear, brtMonth, refMondayDay + 7, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0)
  );

  const bucketDates = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(Date.UTC(brtYear, brtMonth, refMondayDay - i * 7));
    bucketDates.push(d.toISOString().slice(0, 10));
  }

  return { windowStartUtc, windowEndUtc, bucketDates };
}

// Retorna a data BRT (YYYY-MM-DD) da segunda-feira da semana ISO de dateStr.
function mondayOfBrtDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const weekday = d.getUTCDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  const monday = new Date(Date.UTC(year, month - 1, day - daysFromMonday));
  return monday.toISOString().slice(0, 10);
}

const RECENT_ACTIVITY_LIMIT = 25;

function mapRecentActivityRow(row) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const eventType = row.eventType;

  let sacks = null;
  if (eventType === 'REGISTRATION_CONFIRMED' || eventType === 'PHYSICAL_SAMPLE_SENT') {
    sacks = typeof row.declaredSacks === 'number' ? row.declaredSacks : null;
  } else if (eventType === 'SALE_CREATED' || eventType === 'LOSS_RECORDED') {
    if (typeof payload.quantitySacks === 'number') {
      sacks = payload.quantitySacks;
    }
  }

  let recipient = null;
  if (eventType === 'PHYSICAL_SAMPLE_SENT') {
    const snapshot = payload.recipientClientSnapshot;
    if (snapshot && typeof snapshot === 'object' && typeof snapshot.displayName === 'string') {
      recipient = snapshot.displayName;
    }
  }

  return {
    // Feed por-evento: chave unica por evento (um sample pode aparecer varias
    // vezes, ex: venda + cancelamento).
    id: `${row.sampleId}:${row.sequenceNumber}`,
    sampleId: row.sampleId,
    internalLotNumber: row.internalLotNumber ?? null,
    producer: row.declaredOwner ?? null,
    sacks,
    recipient,
    // Liga B3.1: flag pra renderizar <BlendBadge> ao lado do lote no
    // dashboard recent activity.
    isBlend: Boolean(row.isBlend),
    // Caminho A: true so pra PHYSICAL_SAMPLE_SENT cujo envio foi cancelado
    // (SEND_CANCELLED) — frontend esmaece o card. Demais tipos sempre false.
    cancelled: Boolean(row.cancelled),
    activity: {
      type: eventType,
      at:
        row.occurredAt instanceof Date
          ? row.occurredAt.toISOString()
          : new Date(row.occurredAt).toISOString(),
    },
  };
}

const CLIENT_INCLUDE_SELECT = {
  id: true,
  code: true,
  personType: true,
  fullName: true,
  legalName: true,
  tradeName: true,
  cpf: true,
  cnpjRoot: true,
  phone: true,
  isBuyer: true,
  isSeller: true,
  isWarehouse: true,
  status: true,
};

const UNIT_INCLUDE_SELECT = {
  id: true,
  clientId: true,
  name: true,
  code: true,
  cnpj: true,
  legalName: true,
  tradeName: true,
  phone: true,
  addressLine: true,
  district: true,
  city: true,
  state: true,
  postalCode: true,
  complement: true,
  registrationNumber: true,
  car: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const SAMPLE_OWNER_INCLUDE = {
  // O lote nao vincula mais fazenda/unit: nao carregamos ownerUnit. (buyerUnit
  // segue carregada no SAMPLE_MOVEMENT_INCLUDE pro historico de vendas.)
  ownerClient: { select: CLIENT_INCLUDE_SELECT },
};
const SAMPLE_INCLUDE = { ...SAMPLE_OWNER_INCLUDE };
const SAMPLE_MOVEMENT_INCLUDE = {
  buyerClient: { select: CLIENT_INCLUDE_SELECT },
  buyerUnit: { select: UNIT_INCLUDE_SELECT },
};

function tryDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function appendQueueValue(queue, value) {
  if (typeof value !== 'string') {
    return;
  }

  const normalized = value.trim();
  if (!normalized) {
    return;
  }

  queue.push(normalized);
}

function extractQrLookupCandidates(qrContent) {
  const queue = [];
  const processedParts = [];
  const seenParts = new Set();

  appendQueueValue(queue, qrContent);

  while (queue.length > 0 && processedParts.length < MAX_QR_PARTS) {
    const part = queue.shift();
    if (!part || seenParts.has(part)) {
      continue;
    }

    seenParts.add(part);
    processedParts.push(part);

    const decoded = tryDecodeURIComponent(part);
    if (decoded !== part) {
      appendQueueValue(queue, decoded);
    }

    try {
      const url = new URL(part);
      appendQueueValue(queue, url.pathname);
      appendQueueValue(queue, url.search);
      appendQueueValue(queue, url.hash);

      for (const key of [
        'sampleId',
        'sample',
        'id',
        'lot',
        'internalLot',
        'internalLotNumber',
        'qr',
        'token',
      ]) {
        appendQueueValue(queue, url.searchParams.get(key));
      }

      for (const segment of url.pathname.split('/')) {
        appendQueueValue(queue, segment);
      }
    } catch {
      // Ignora partes que nao sao URL.
    }
  }

  const idCandidates = [];
  const lotCandidates = [];
  const seenIds = new Set();
  const seenLots = new Set();
  const uuidRegex = new RegExp(UUID_PATTERN, 'g');
  const lotRegex = new RegExp(INTERNAL_LOT_PATTERN, 'g');

  for (const part of processedParts) {
    const uuidMatches = part.match(uuidRegex) ?? [];
    for (const value of uuidMatches) {
      const normalized = value.toLowerCase();
      if (!seenIds.has(normalized)) {
        seenIds.add(normalized);
        idCandidates.push(normalized);
      }
    }

    const lotMatches = part.match(lotRegex) ?? [];
    for (const value of lotMatches) {
      const normalized = value.toUpperCase();
      if (!seenLots.has(normalized)) {
        seenLots.add(normalized);
        lotCandidates.push(normalized);
      }
    }
  }

  return {
    idCandidates,
    lotCandidates,
  };
}

function sourceFromDb(source) {
  const map = {
    WEB: 'web',
    API: 'api',
    WORKER: 'worker',
  };
  return map[source] ?? source;
}

function moduleFromDb(moduleName) {
  const map = {
    REGISTRATION: 'registration',
    CLASSIFICATION: 'classification',
    PRINT: 'print',
    COMMERCIAL: 'commercial',
  };
  return map[moduleName] ?? moduleName;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value?.toNumber === 'function') {
    return value.toNumber();
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIntegerOrZero(value) {
  const parsed = toNumberOrNull(value);
  if (parsed === null) {
    return 0;
  }

  if (parsed <= 0) {
    return 0;
  }

  return Math.trunc(parsed);
}

function toObjectOrNull(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value;
}

function normalizeOptionalText(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseSacksRangeValue(value, fieldName) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d+$/.test(normalized)) {
    throw new HttpError(422, `${fieldName} must be a positive integer`);
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new HttpError(422, `${fieldName} must be a positive integer`);
  }

  return parsed;
}

function resolveSacksRange({ sacksMin = null, sacksMax = null }) {
  const min = parseSacksRangeValue(sacksMin, 'sacksMin');
  const max = parseSacksRangeValue(sacksMax, 'sacksMax');

  if (min !== null && max !== null && min > max) {
    throw new HttpError(422, 'sacksMin cannot be greater than sacksMax');
  }

  if (min === null && max === null) {
    return null;
  }

  // UX "1 valor = exato, 2 = intervalo": com exatamente um campo preenchido o
  // filtro vira busca EXATA (equals); com os dois, intervalo [min, max]. Antes
  // um valor sozinho virava intervalo aberto (gte/lte).
  if (min === null || max === null) {
    return { equals: min ?? max };
  }

  return { gte: min, lte: max };
}

function parseCreatedDateRangeInSaoPaulo(value, fieldName = 'createdDate') {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) {
    throw new HttpError(422, `${fieldName} must follow YYYY-MM-DD format`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new HttpError(422, `${fieldName} must be a valid calendar date`);
  }

  const startUtc = new Date(Date.UTC(year, month - 1, day, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, month - 1, day + 1, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));

  return {
    startUtc,
    endUtc,
  };
}

function resolveCreatedDateRangeInSaoPaulo({ createdFrom = null, createdTo = null }) {
  const fromRange = parseCreatedDateRangeInSaoPaulo(createdFrom, 'createdFrom');
  const toRange = parseCreatedDateRangeInSaoPaulo(createdTo, 'createdTo');

  if (!fromRange && !toRange) {
    return null;
  }

  // UX "1 data = dia especifico, 2 = intervalo": com as duas datas o range vai
  // do inicio do dia menor ao fim do dia maior (em Sao Paulo); com uma so, e
  // aquele dia exato. parseCreatedDateRangeInSaoPaulo ja validou formato/calendario.
  if (fromRange && toRange) {
    if (fromRange.startUtc.getTime() > toRange.startUtc.getTime()) {
      throw new HttpError(422, 'createdFrom cannot be after createdTo');
    }
    return { startUtc: fromRange.startUtc, endUtc: toRange.endUtc };
  }

  const single = fromRange ?? toRange;
  return { startUtc: single.startUtc, endUtc: single.endUtc };
}

function resolveCursor({ cursorLotInt, cursorId }) {
  const normalizedId = normalizeOptionalText(cursorId);
  const normalizedLotInt = normalizeOptionalText(cursorLotInt);

  if (!normalizedId && normalizedLotInt === null) {
    return null;
  }

  if (!normalizedId) {
    throw new HttpError(422, 'cursorId is required when paginating');
  }

  if (!new RegExp(`^${UUID_PATTERN}$`).test(normalizedId)) {
    throw new HttpError(422, 'cursorId must be a valid UUID');
  }

  // Lote editavel: ordenacao por numero do lote (internalLotNumberInt desc,
  // nulls last, desempate por id). O cursor keyset carrega o int + id. lotInt
  // null = cauda de lotes sem numero (pagina so por id entre eles).
  let lotInt = null;
  if (normalizedLotInt !== null) {
    const parsedInt = Number(normalizedLotInt);
    if (!Number.isInteger(parsedInt)) {
      throw new HttpError(422, 'cursorLotInt must be an integer');
    }
    lotInt = parsedInt;
  }

  return {
    lotInt,
    id: normalizedId,
  };
}

function resolveStatusGroupStatuses(statusGroup) {
  const normalized = normalizeOptionalText(statusGroup);
  if (!normalized) {
    return null;
  }

  const resolved = SAMPLE_STATUS_FILTER_GROUPS[normalized];
  if (!resolved) {
    throw new HttpError(422, 'statusGroup must be one of: CLASSIFICATION_PENDING, CLASSIFIED');
  }

  return resolved;
}

function resolveCommercialStatus(commercialStatus) {
  const normalized = normalizeOptionalText(commercialStatus);
  if (!normalized) {
    return null;
  }

  const normalizedUpper = normalized.toUpperCase();
  if (!COMMERCIAL_STATUSES.includes(normalizedUpper)) {
    throw new HttpError(422, 'commercialStatus must be one of: OPEN, PARTIALLY_SOLD, SOLD, LOST');
  }

  return normalizedUpper;
}

function resolveDisplayStatusFilter(displayStatus) {
  const normalized = normalizeOptionalText(displayStatus);
  if (!normalized) return null;

  const upper = normalized.toUpperCase();
  if (!DISPLAY_STATUSES.includes(upper)) {
    throw new HttpError(422, 'displayStatus must be one of: OPEN, SOLD, LOST, INVALIDATED');
  }

  switch (upper) {
    case 'OPEN':
      return {
        status: { not: 'INVALIDATED' },
        commercialStatus: { in: ['OPEN', 'PARTIALLY_SOLD'] },
      };
    case 'SOLD':
      return { status: { not: 'INVALIDATED' }, commercialStatus: 'SOLD' };
    case 'LOST':
      return { status: { not: 'INVALIDATED' }, commercialStatus: 'LOST' };
    case 'INVALIDATED':
      return { status: 'INVALIDATED' };
    default:
      return null;
  }
}

function buildBuyerMovementFilter(buyer) {
  const normalizedBuyer = normalizeOptionalText(buyer);
  if (!normalizedBuyer) {
    return null;
  }

  const numericSearch = Number.parseInt(normalizedBuyer, 10);
  const exactCode =
    Number.isSafeInteger(numericSearch) && String(numericSearch) === normalizedBuyer
      ? numericSearch
      : null;
  const digits = normalizedBuyer.replace(/\D+/g, '');

  const clientOr = [
    {
      fullName: {
        contains: normalizedBuyer,
        mode: 'insensitive',
      },
    },
    {
      legalName: {
        contains: normalizedBuyer,
        mode: 'insensitive',
      },
    },
    {
      tradeName: {
        contains: normalizedBuyer,
        mode: 'insensitive',
      },
    },
  ];

  if (digits) {
    clientOr.push({
      cpf: {
        contains: digits,
      },
    });
    // L5: cnpj vive direto em Client (PJ) e em ClientUnit (filiais PF).
    clientOr.push({
      cnpj: { contains: digits },
    });
    clientOr.push({
      units: {
        some: {
          cnpj: { contains: digits },
        },
      },
    });
  }

  if (exactCode !== null) {
    clientOr.push({
      code: exactCode,
    });
  }

  return {
    movements: {
      some: {
        movementType: 'SALE',
        status: 'ACTIVE',
        buyerClient: {
          is: {
            OR: clientOr,
          },
        },
      },
    },
  };
}

function mapOwnerClient(ownerClient) {
  if (!ownerClient) {
    return null;
  }

  return {
    id: ownerClient.id,
    code: ownerClient.code,
    personType: ownerClient.personType,
    displayName:
      ownerClient.personType === 'PF'
        ? (ownerClient.fullName ?? null)
        : (ownerClient.legalName ?? null),
    fullName: ownerClient.fullName ?? null,
    legalName: ownerClient.legalName ?? null,
    tradeName: ownerClient.tradeName ?? null,
    cpf: ownerClient.cpf ?? null,
    // L5: cnpj vive direto em Client (PJ).
    cnpj: ownerClient.cnpj ?? null,
    phone: ownerClient.phone ?? null,
    isBuyer: ownerClient.isBuyer,
    isSeller: ownerClient.isSeller,
    isWarehouse: ownerClient.isWarehouse,
    status: ownerClient.status,
  };
}

function mapOwnerUnit(ownerUnit) {
  if (!ownerUnit) {
    return null;
  }

  return {
    id: ownerUnit.id,
    clientId: ownerUnit.clientId,
    name: ownerUnit.name ?? null,
    code: ownerUnit.code,
    cnpj: ownerUnit.cnpj ?? null,
    legalName: ownerUnit.legalName ?? null,
    tradeName: ownerUnit.tradeName ?? null,
    phone: ownerUnit.phone ?? null,
    addressLine: ownerUnit.addressLine ?? null,
    district: ownerUnit.district ?? null,
    city: ownerUnit.city ?? null,
    state: ownerUnit.state ?? null,
    postalCode: ownerUnit.postalCode ?? null,
    complement: ownerUnit.complement ?? null,
    registrationNumber: ownerUnit.registrationNumber ?? null,
    car: ownerUnit.car ?? null,
    status: ownerUnit.status,
    createdAt: ownerUnit.createdAt ? ownerUnit.createdAt.toISOString() : null,
    updatedAt: ownerUnit.updatedAt ? ownerUnit.updatedAt.toISOString() : null,
  };
}

function mapSampleMovement(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sampleId: row.sampleId,
    movementType: row.movementType,
    status: row.status,
    buyerClientId: row.buyerClientId ?? null,
    buyerUnitId: row.buyerUnitId ?? null,
    quantitySacks: row.quantitySacks,
    movementDate: new Date(row.movementDate).toISOString().slice(0, 10),
    notes: row.notes ?? null,
    lossReasonText: row.reasonText ?? null,
    buyerClientSnapshot: toObjectOrNull(row.buyerClientSnapshot),
    buyerUnitSnapshot: toObjectOrNull(row.buyerUnitSnapshot),
    version: row.version,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    buyerClient: mapOwnerClient(row.buyerClient),
    buyerUnit: mapOwnerUnit(row.buyerUnit),
  };
}

const DASHBOARD_SAMPLE_SELECT = {
  id: true,
  internalLotNumber: true,
  status: true,
  commercialStatus: true,
  declaredOwner: true,
  declaredSacks: true,
  declaredHarvest: true,
  createdAt: true,
};

function mapDashboardSample(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    internalLotNumber: row.internalLotNumber,
    status: row.status,
    commercialStatus: row.commercialStatus,
    declared: {
      owner: row.declaredOwner,
      sacks: row.declaredSacks,
      harvest: row.declaredHarvest,
      location: row.declaredLocation ?? null,
    },
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPendingPrintJob(row) {
  const sample = row.sample;
  // Classificacao (Padrao/Aspecto) p/ a etiqueta de controle interno — so quando
  // ha classificacao. latestClassificationData e null ate a amostra ser
  // classificada; a etiqueta omite os campos ausentes (imprime sem eles).
  const classificationData = toObjectOrNull(sample.latestClassificationData);
  const classification =
    classificationData && (classificationData.padrao != null || classificationData.aspecto != null)
      ? {
          padrao: classificationData.padrao ?? null,
          aspecto: classificationData.aspecto ?? null,
        }
      : null;
  return {
    jobId: row.id,
    sampleId: row.sampleId,
    attemptNumber: row.attemptNumber,
    printerId: row.printerId ?? null,
    createdAt: row.createdAt.toISOString(),
    sample: {
      id: sample.id,
      internalLotNumber: sample.internalLotNumber,
      status: sample.status,
      version: sample.version,
      qrValue: sample.internalLotNumber ?? sample.id,
      registeredAt: sample.createdAt.toISOString(),
      declared: {
        owner: sample.declaredOwner ?? null,
        sacks: sample.declaredSacks ?? null,
        harvest: sample.declaredHarvest ?? null,
        originLot: sample.declaredOriginLot ?? null,
        location: sample.declaredLocation ?? null,
      },
      classification,
    },
  };
}

function mapSample(row) {
  if (!row) {
    return null;
  }

  const latestClassificationData = toObjectOrNull(row.latestClassificationData);

  return {
    id: row.id,
    internalLotNumber: row.internalLotNumber,
    classificationType: row.classificationType ?? null,
    status: row.status,
    commercialStatus: row.commercialStatus,
    version: row.version,
    lastEventSequence: row.lastEventSequence,
    ownerClientId: row.ownerClientId ?? null,
    // Liga A2.4: expor flag isBlend pra branches de cascata em
    // createSampleMovement e checagens de domínio.
    isBlend: row.isBlend ?? false,
    soldSacks: row.soldSacks ?? 0,
    lostSacks: row.lostSacks ?? 0,
    availableSacks:
      typeof row.declaredSacks === 'number'
        ? Math.max(0, row.declaredSacks - (row.soldSacks ?? 0) - (row.lostSacks ?? 0))
        : null,
    declared: {
      owner: row.declaredOwner,
      sacks: row.declaredSacks,
      harvest: row.declaredHarvest,
      originLot: row.declaredOriginLot,
      location: row.declaredLocation ?? null,
    },
    ownerClient: mapOwnerClient(row.ownerClient),
    latestClassification: {
      version: row.latestClassificationVersion,
      data: latestClassificationData,
      technical: {
        type: row.latestType,
        screen: row.latestScreen,
        defectsCount: row.latestDefectsCount,
        moisture: null,
        density: toNumberOrNull(row.latestDensity),
        colorAspect: row.latestColorAspect,
        notes: row.latestNotes,
      },
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapEvent(event) {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    sampleId: event.sampleId,
    sequenceNumber: event.sequenceNumber,
    occurredAt: event.occurredAt.toISOString(),
    actorType: event.actorType,
    actorUserId: event.actorUserId,
    source: sourceFromDb(event.source),
    schemaVersion: event.schemaVersion,
    payload: event.payload,
    requestId: event.requestId,
    correlationId: event.correlationId,
    causationId: event.causationId,
    idempotencyScope: event.idempotencyScope,
    idempotencyKey: event.idempotencyKey,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    metadata: {
      module: moduleFromDb(event.metadataModule),
      ip: event.metadataIp,
      userAgent: event.metadataUserAgent,
    },
  };
}

function parseAttemptNumberFromPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const raw = payload.attemptNumber;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    return raw;
  }

  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

// Liga A3.3 (F1.B): regra de elegibilidade pra contribuir em liga.
// Retorna { eligible, reason } onde reason e null quando eligible=true.
// Reasons mapeados pelo frontend pra tooltips em pt-BR (F1.B).
//
// F1.4 relaxada em 2026-05-19: aceita REGISTRATION_CONFIRMED ou
// CLASSIFIED (antes era CLASSIFIED only). SampleStatus enum so tem 3
// valores (REGISTRATION_CONFIRMED, CLASSIFIED, INVALIDATED) — entao
// basta bloquear INVALIDATED + saldo zerado. Amostras nao-classificadas
// podem ser ligadas; a liga nasce em branco (F4.b) e segue o fluxo de
// classificacao normal. Quando a liga e vendida/perdida, a cascata
// recursiva emite SALE_CREATED/LOSS_RECORDED nas origens (nao ha
// trigger Prisma bloqueando transicoes de commercialStatus).
function computeBlendEligibility(sample) {
  if (sample.status === 'INVALIDATED') {
    return { eligible: false, reason: 'INVALIDATED' };
  }
  if ((sample.availableSacks ?? 0) <= 0) {
    return { eligible: false, reason: 'NO_BALANCE' };
  }
  return { eligible: true, reason: null };
}

export class SampleQueryService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async findSampleOrNull(sampleId) {
    const sample = await this.prisma.sample.findUnique({
      where: { id: sampleId },
      include: SAMPLE_INCLUDE,
    });
    return mapSample(sample);
  }

  async requireSample(sampleId) {
    const sample = await this.findSampleOrNull(sampleId);
    if (!sample) {
      throw new HttpError(404, `Sample ${sampleId} does not exist`);
    }
    return sample;
  }

  async findPendingPrintJobOrNull(sampleId) {
    const pending = await this.prisma.printJob.findFirst({
      where: { sampleId, status: 'PENDING' },
      orderBy: [{ attemptNumber: 'desc' }, { createdAt: 'desc' }],
    });

    if (!pending) {
      return null;
    }

    return {
      attemptNumber: pending.attemptNumber,
      printerId: pending.printerId ?? null,
      status: pending.status,
    };
  }

  async findLatestPrintJob(sampleId) {
    const row = await this.prisma.printJob.findFirst({
      where: { sampleId },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        attemptNumber: true,
        status: true,
        printerId: true,
        error: true,
        createdAt: true,
      },
    });

    if (!row) return null;

    return {
      jobId: row.id,
      attemptNumber: row.attemptNumber,
      status: row.status,
      printerId: row.printerId ?? null,
      error: row.error ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listPendingPrintJobs(options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
    // Q.print: print virou acao pura — PrintJob.status='PENDING' e a unica
    // condicao. Sample pode estar em qualquer status nao-INVALIDATED.
    const where = {
      status: 'PENDING',
      sample: { status: { not: 'INVALIDATED' } },
    };

    if (options.sampleId) {
      where.sampleId = options.sampleId;
    }

    const rows = await this.prisma.printJob.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      include: {
        sample: {
          select: {
            id: true,
            internalLotNumber: true,
            status: true,
            version: true,
            createdAt: true,
            declaredOwner: true,
            declaredSacks: true,
            declaredHarvest: true,
            declaredOriginLot: true,
            latestClassificationData: true,
          },
        },
      },
    });

    return {
      items: rows.map(mapPendingPrintJob),
      total: rows.length,
    };
  }

  async resolveSampleByLot(lotNumber) {
    if (typeof lotNumber !== 'string' || lotNumber.trim().length === 0) {
      return { found: false };
    }

    const normalized = lotNumber.trim().toUpperCase();

    const row = await this.prisma.sample.findFirst({
      where: {
        internalLotNumber: { equals: normalized, mode: 'insensitive' },
      },
      include: SAMPLE_INCLUDE,
    });

    if (!row) {
      return { found: false };
    }

    const sample = mapSample(row);
    return { found: true, sample };
  }

  async resolveSampleByQrToken(qrContent) {
    if (typeof qrContent !== 'string' || qrContent.trim().length === 0) {
      throw new HttpError(422, 'qr content is required');
    }

    const { idCandidates, lotCandidates } = extractQrLookupCandidates(qrContent.trim());
    if (idCandidates.length === 0 && lotCandidates.length === 0) {
      throw new HttpError(422, 'Could not extract sample identifier from qr content');
    }

    const orConditions = [
      ...idCandidates.map((id) => ({ id })),
      ...lotCandidates.map((internalLotNumber) => ({ internalLotNumber })),
    ];

    const rows = await this.prisma.sample.findMany({
      where: {
        OR: orConditions,
      },
      take: 50,
      include: SAMPLE_INCLUDE,
    });

    if (rows.length === 0) {
      throw new HttpError(404, 'No sample found for provided qr content');
    }

    const rowsById = new Map(rows.map((row) => [row.id.toLowerCase(), row]));
    for (const idCandidate of idCandidates) {
      const byId = rowsById.get(idCandidate);
      if (byId) {
        return mapSample(byId);
      }
    }

    const rowsByLot = new Map(
      rows
        .filter(
          (row) => typeof row.internalLotNumber === 'string' && row.internalLotNumber.length > 0
        )
        .map((row) => [row.internalLotNumber.toUpperCase(), row])
    );
    for (const lotCandidate of lotCandidates) {
      const byLot = rowsByLot.get(lotCandidate);
      if (byLot) {
        return mapSample(byLot);
      }
    }

    return mapSample(rows[0]);
  }

  async listAttachmentIds(sampleId, options = {}) {
    const where = {
      sampleId,
    };
    if (options.kind) {
      where.kind = options.kind;
    }

    const attachments = await this.prisma.sampleAttachment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    return attachments.map((attachment) => attachment.id);
  }

  async findAttachmentByKind(sampleId, kind) {
    const attachment = await this.prisma.sampleAttachment.findFirst({
      where: { sampleId, kind },
      orderBy: { createdAt: 'desc' },
    });

    if (!attachment) {
      return null;
    }

    return {
      id: attachment.id,
      sampleId: attachment.sampleId,
      kind: attachment.kind,
      storagePath: attachment.storagePath,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      checksumSha256: attachment.checksumSha256,
      createdAt: attachment.createdAt.toISOString(),
    };
  }

  async listAttachments(sampleId) {
    const attachments = await this.prisma.sampleAttachment.findMany({
      where: { sampleId },
      orderBy: { createdAt: 'asc' },
    });

    return attachments.map((attachment) => ({
      id: attachment.id,
      sampleId: attachment.sampleId,
      kind: attachment.kind,
      storagePath: attachment.storagePath,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      checksumSha256: attachment.checksumSha256,
      createdAt: attachment.createdAt.toISOString(),
    }));
  }

  // Filtro "Enviado para": projeta os envios fisicos (event-sourced) e retorna
  // os sample_id distintos com >=1 envio ATIVO cujo destinatario ATUAL esta em
  // `clientIds`. Envio = evento PHYSICAL_SAMPLE_SENT; destinatario atual =
  // ultimo PHYSICAL_SAMPLE_SEND_UPDATED (por sequence_number) ou o do SENT;
  // ativo = sem PHYSICAL_SAMPLE_SEND_CANCELLED pra aquele envio. Espelha
  // projectPhysicalSendState (command service) em SQL — mesmo padrao raw do
  // getDashboardRecentActivity. So roda quando o filtro esta ativo.
  async resolveSampleIdsSentToClients(clientIds) {
    const list = Array.isArray(clientIds)
      ? clientIds.filter((id) => typeof id === 'string' && id.length > 0)
      : [];
    if (list.length === 0) {
      return [];
    }

    const rows = await this.prisma.$queryRaw`
      SELECT DISTINCT sent.sample_id AS "sampleId"
      FROM "sample_event" sent
      WHERE sent.event_type = 'PHYSICAL_SAMPLE_SENT'
        AND NOT EXISTS (
          SELECT 1 FROM "sample_event" canc
          WHERE canc.event_type = 'PHYSICAL_SAMPLE_SEND_CANCELLED'
            AND canc.payload->>'sendEventId' = sent.event_id::text
        )
        AND COALESCE(
          (
            SELECT upd.payload->>'recipientClientId'
            FROM "sample_event" upd
            WHERE upd.event_type = 'PHYSICAL_SAMPLE_SEND_UPDATED'
              AND upd.payload->>'sendEventId' = sent.event_id::text
            ORDER BY upd.sequence_number DESC
            LIMIT 1
          ),
          sent.payload->>'recipientClientId'
        ) IN (${Prisma.join(list)})
    `;

    return rows.map((row) => row.sampleId);
  }

  async listSamples({
    search = null,
    status = null,
    statusGroup = null,
    commercialStatus = null,
    displayStatus = null,
    limit = SAMPLES_LIST_DEFAULT_LIMIT,
    offset = 0,
    page = null,
    cursorLotInt = null,
    cursorId = null,
    lot = null,
    owner = null,
    buyer = null,
    ownerClientIds = [],
    buyerClientIds = [],
    sentToClientIds = [],
    padroes = [],
    aspectos = [],
    catacoes = [],
    certificados = [],
    harvest = null,
    harvests = [],
    sacksMin = null,
    sacksMax = null,
    createdFrom = null,
    createdTo = null,
    // Liga A3.3: quando true, enriquece cada sample com
    // `eligibility: { eligible, reason }` (F1.B) e `committedSacks`
    // (T0.B). NAO filtra inelegiveis fora — frontend renderiza
    // acinzentados (F1.4).
    eligibleForBlend = false,
    // Liga: filtro "Apenas ligas" (toggle em /samples). true -> so isBlend=true.
    isBlend = null,
  } = {}) {
    const safeLimit = Math.min(Math.max(limit, 1), SAMPLES_LIST_MAX_LIMIT);
    const cursor = resolveCursor({ cursorLotInt, cursorId });
    // Defensivo: se veio so o id (sem lotInt), busca o int da linha pra montar
    // o keyset. Para a cauda de lotes sem numero o int e null mesmo.
    if (cursor && cursor.lotInt === null) {
      const cursorRow = await this.prisma.sample.findUnique({
        where: { id: cursor.id },
        select: { internalLotNumberInt: true },
      });
      cursor.lotInt = cursorRow?.internalLotNumberInt ?? null;
    }
    const safeOffset = Math.max(offset, 0);
    const safePage = typeof page === 'number' && Number.isInteger(page) && page > 0 ? page : null;
    const resolvedOffset = cursor ? 0 : safePage ? (safePage - 1) * safeLimit : safeOffset;
    const resolvedPage = cursor ? null : (safePage ?? Math.floor(resolvedOffset / safeLimit) + 1);

    const createdPeriodRange = resolveCreatedDateRangeInSaoPaulo({
      createdFrom,
      createdTo,
    });
    const sacksRange = resolveSacksRange({
      sacksMin,
      sacksMax,
    });

    const conditions = [];
    const normalizedSearch = normalizeOptionalText(search);
    if (normalizedSearch) {
      // Busca da pagina de Lotes: por PREFIXO ("comeca com"), case-insensitive.
      // Casa numero do lote OU nome do proprietario (direto e das origens da
      // liga). startsWith, nao contains: "55" traz lotes que COMECAM com 55, nao
      // os que contem 55 no meio. (O filtro avancado `owner` segue por contains.)
      conditions.push({
        OR: [
          {
            internalLotNumber: {
              startsWith: normalizedSearch,
              mode: 'insensitive',
            },
          },
          {
            declaredOwner: {
              startsWith: normalizedSearch,
              mode: 'insensitive',
            },
          },
          // Liga: casa a liga pelo proprietario de qualquer origem (mesma
          // logica do filtro de proprietario).
          {
            blendComponents: {
              some: {
                originSample: {
                  declaredOwner: { startsWith: normalizedSearch, mode: 'insensitive' },
                },
              },
            },
          },
        ],
      });
    }

    const normalizedStatus = normalizeOptionalText(status);
    if (normalizedStatus) {
      conditions.push({ status: normalizedStatus });
    }

    const resolvedStatusGroupStatuses = resolveStatusGroupStatuses(statusGroup);
    if (resolvedStatusGroupStatuses) {
      conditions.push({
        status: {
          in: resolvedStatusGroupStatuses,
        },
      });
    }

    const resolvedCommercialStatus = resolveCommercialStatus(commercialStatus);
    if (resolvedCommercialStatus) {
      conditions.push({
        commercialStatus: resolvedCommercialStatus,
      });
    }

    const displayStatusConditions = resolveDisplayStatusFilter(displayStatus);
    if (displayStatusConditions) {
      conditions.push(displayStatusConditions);
    }

    const normalizedLot = normalizeOptionalText(lot);
    if (normalizedLot) {
      conditions.push({
        internalLotNumber: {
          contains: normalizedLot,
          mode: 'insensitive',
        },
      });
    }

    const normalizedOwner = normalizeOptionalText(owner);
    if (normalizedOwner) {
      // Busca parcial (contains). Liga: casa tambem pela origem — uma liga de
      // donos divergentes (sem dono proprio) aparece se o termo bate o dono de
      // qualquer origem.
      conditions.push({
        OR: [
          { declaredOwner: { contains: normalizedOwner, mode: 'insensitive' } },
          {
            blendComponents: {
              some: {
                originSample: {
                  declaredOwner: { contains: normalizedOwner, mode: 'insensitive' },
                },
              },
            },
          },
        ],
      });
    }

    const buyerFilter = buildBuyerMovementFilter(buyer);
    if (buyerFilter) {
      conditions.push(buyerFilter);
    }

    // Filtro multi-select por identidade do cliente (typeahead de
    // proprietario/comprador no /samples) — match exato e indexado
    // (idx_sample_owner_client / idx_sample_movement_buyer_*). OR dentro de
    // cada campo (qualquer um dos proprietarios/compradores selecionados).
    const ownerClientIdList = Array.isArray(ownerClientIds)
      ? ownerClientIds.filter((id) => typeof id === 'string' && id.length > 0)
      : [];
    if (ownerClientIdList.length > 0) {
      // Liga: casa a amostra pelo proprio dono OU pelo dono de qualquer origem
      // (liga de donos divergentes aparece ao filtrar por qualquer um deles).
      conditions.push({
        OR: [
          { ownerClientId: { in: ownerClientIdList } },
          {
            blendComponents: {
              some: { originSample: { ownerClientId: { in: ownerClientIdList } } },
            },
          },
        ],
      });
    }

    const buyerClientIdList = Array.isArray(buyerClientIds)
      ? buyerClientIds.filter((id) => typeof id === 'string' && id.length > 0)
      : [];
    if (buyerClientIdList.length > 0) {
      conditions.push({
        movements: {
          some: {
            movementType: 'SALE',
            status: 'ACTIVE',
            buyerClientId: { in: buyerClientIdList },
          },
        },
      });
    }

    // Filtro "Enviado para" (envio fisico, event-sourced): projeta os ids das
    // amostras com envio ativo p/ os clientes selecionados e restringe por id.
    // Lista vazia -> { id: { in: [] } } -> zero resultados (correto).
    const sentToClientIdList = Array.isArray(sentToClientIds)
      ? sentToClientIds.filter((id) => typeof id === 'string' && id.length > 0)
      : [];
    if (sentToClientIdList.length > 0) {
      const sentSampleIds = await this.resolveSampleIdsSentToClients(sentToClientIdList);
      conditions.push({ id: { in: sentSampleIds } });
    }

    // Filtro de safra: match por COMPONENTE. A safra de uma liga mista e a
    // string canonica "24/25, 25/26"; filtrar por "24/25" OU por "25/26" casa a
    // liga. `contains` (LIKE '%24/25%') e exato pra este formato — cada safra e
    // "AA/AA" (sem virgula interna) separada por ", ", entao "24/25" so aparece
    // como componente, nunca como substring acidental. Amostra de safra unica
    // casa normalmente.
    // Aceita safra unica (`harvest`, legado) ou multi (`harvests`, novo). Cada
    // valor casa por COMPONENTE via `contains`; entre eles e OR (uniao).
    const harvestValues = Array.from(
      new Set(
        [...(Array.isArray(harvests) ? harvests : []), harvest]
          .map((value) => normalizeOptionalText(value))
          .filter((value) => typeof value === 'string' && value.length > 0)
      )
    );
    if (harvestValues.length > 0) {
      conditions.push({
        OR: harvestValues.map((value) => ({
          declaredHarvest: { contains: value },
        })),
      });
    }

    // Liga: filtro "Apenas ligas" (toggle). Indexado (idx_sample_is_blend).
    if (isBlend === true) {
      conditions.push({ isBlend: true });
    }

    // Filtros de classificacao (Padrao/Aspecto/Catacao/Certificado). Os valores
    // na projecao sao canonicos (projetor + backfill), entao canonizamos os
    // valores recebidos e fazemos match exato no JSON path. OR-de-equals (Prisma
    // nao garante `in` em filtro de path JSON entre versoes). Amostras sem
    // classificacao (latestClassificationData null) nunca casam — ficam de fora.
    const classificationFilterInputs = {
      padrao: padroes,
      aspecto: aspectos,
      catacao: catacoes,
      certif: certificados,
    };
    for (const { key, canon } of CLASSIFICATION_FILTER_FIELDS) {
      const rawValues = classificationFilterInputs[key];
      const canonical = Array.isArray(rawValues)
        ? Array.from(
            new Set(
              rawValues
                .map((value) => canon(value))
                .filter((value) => typeof value === 'string' && value.length > 0)
            )
          )
        : [];
      if (canonical.length > 0) {
        conditions.push({
          OR: canonical.map((value) => ({
            latestClassificationData: { path: [key], equals: value },
          })),
        });
      }
    }

    if (sacksRange) {
      conditions.push({
        declaredSacks: sacksRange,
      });
    }

    if (createdPeriodRange) {
      conditions.push({
        createdAt: {
          gte: createdPeriodRange.startUtc,
          lt: createdPeriodRange.endUtc,
        },
      });
    }

    const whereForCount = conditions.length > 0 ? { AND: conditions } : undefined;

    // Lote editavel: keyset por (internalLotNumberInt desc nulls last, id asc).
    // Linhas "depois" do cursor: numero menor, OU numero nulo (cauda), OU mesmo
    // numero com id maior. Quando o proprio cursor ja esta na cauda (lotInt
    // null), pagina so por id entre os nulos.
    const rowConditions = cursor
      ? [
          ...conditions,
          cursor.lotInt === null
            ? { internalLotNumberInt: null, id: { gt: cursor.id } }
            : {
                OR: [
                  { internalLotNumberInt: { lt: cursor.lotInt } },
                  { internalLotNumberInt: null },
                  { internalLotNumberInt: cursor.lotInt, id: { gt: cursor.id } },
                ],
              },
        ]
      : conditions;
    const whereForRows = rowConditions.length > 0 ? { AND: rowConditions } : undefined;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sample.findMany({
        where: whereForRows,
        orderBy: [{ internalLotNumberInt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
        skip: resolvedOffset,
        take: safeLimit,
        include: SAMPLE_INCLUDE,
      }),
      this.prisma.sample.count({ where: whereForCount }),
    ]);

    const nextCursor =
      rows.length === safeLimit
        ? {
            lotInt: rows[rows.length - 1].internalLotNumberInt,
            id: rows[rows.length - 1].id,
          }
        : null;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const hasPrev = cursor ? false : resolvedPage > 1;
    const hasNext = cursor ? nextCursor !== null : resolvedPage < totalPages;

    let items = rows.map(mapSample);

    // Liga A3.3: enrichment quando eligibleForBlend=true. F1.B + T0.B.
    if (eligibleForBlend && items.length > 0) {
      const sampleIds = items.map((s) => s.id);
      const committedSacksMap = await this._loadCommittedSacksMap(sampleIds);
      items = items.map((sample) => ({
        ...sample,
        eligibility: computeBlendEligibility(sample),
        committedSacks: committedSacksMap.get(sample.id) ?? 0,
      }));
    }

    return {
      items,
      page: {
        limit: safeLimit,
        page: resolvedPage,
        offset: cursor ? null : resolvedOffset,
        total,
        totalPages,
        hasPrev,
        hasNext,
        nextCursor,
      },
    };
  }

  // Valores distintos de um campo de classificacao (padrao/aspecto/catacao/
  // certif) existentes nas amostras — alimenta as opcoes dos filtros de
  // /samples (estilo "autofiltro do Excel"). Canoniza no app pra agrupar
  // variacoes mesmo em linhas ainda nao backfilladas, e ordena. Cardinalidade
  // pequena, entao DISTINCT cru + canonicalizacao em JS e suficiente.
  async listClassificationValues(field) {
    const config = CLASSIFICATION_FILTER_FIELD_BY_KEY.get(field);
    if (!config) {
      throw new HttpError(422, `Campo de classificacao invalido: ${field}`, {
        code: 'INVALID_CLASSIFICATION_FIELD',
        field: 'field',
      });
    }
    // O JSON key vem da whitelist (config existe), e ainda assim passa como
    // parametro vinculado ($1) no operador ->> — sem input livre na query.
    const jsonKey = config.key;
    const rows = await this.prisma.$queryRaw`
      SELECT DISTINCT s."latest_classification_data"->>${jsonKey} AS value
      FROM "sample" s
      WHERE s."latest_classification_data"->>${jsonKey} IS NOT NULL
        AND length(trim(s."latest_classification_data"->>${jsonKey})) > 0
    `;
    const canonicalSet = new Set();
    for (const row of rows) {
      const canonical = config.canon(row.value);
      if (canonical) {
        canonicalSet.add(canonical);
      }
    }
    const values = Array.from(canonicalSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { values };
  }

  // Liga A3.3: query agregada que retorna Map<sampleId, committedSacks>
  // para um conjunto de samples — soma de contributedSacks em ligas
  // ativas pre-comercializacao (T0.B). Sem entradas pra samples nao-
  // comprometidos (callers usam map.get(id) ?? 0).
  async _loadCommittedSacksMap(sampleIds, { executor = null } = {}) {
    if (!Array.isArray(sampleIds) || sampleIds.length === 0) {
      return new Map();
    }
    const client = executor ?? this.prisma;
    const rows = await client.$queryRaw`
      SELECT
        bc.origin_sample_id AS sample_id,
        SUM(bc.contributed_sacks)::bigint AS committed
      FROM sample_blend_component bc
      JOIN sample s ON s.id = bc.sample_id
      WHERE s.status <> 'INVALIDATED'
        AND s.sold_sacks = 0
        AND s.lost_sacks = 0
        AND bc.origin_sample_id = ANY(${sampleIds}::uuid[])
      GROUP BY bc.origin_sample_id
    `;
    const map = new Map();
    for (const row of rows) {
      map.set(row.sample_id, Number(row.committed));
    }
    return map;
  }

  async listSampleEvents(sampleId, { limit = 200, afterSequence = null } = {}) {
    const safeLimit = Math.min(Math.max(limit, 1), 500);

    const where = {
      sampleId,
      ...(typeof afterSequence === 'number' ? { sequenceNumber: { gt: afterSequence } } : {}),
    };

    const rows = await this.prisma.sampleEvent.findMany({
      where,
      orderBy: { sequenceNumber: 'asc' },
      take: safeLimit,
    });

    return rows.map(mapEvent);
  }

  async findSampleMovementOrNull(sampleId, movementId) {
    const row = await this.prisma.sampleMovement.findFirst({
      where: {
        sampleId,
        id: movementId,
      },
      include: SAMPLE_MOVEMENT_INCLUDE,
    });

    return mapSampleMovement(row);
  }

  async requireSampleMovement(sampleId, movementId) {
    const movement = await this.findSampleMovementOrNull(sampleId, movementId);
    if (!movement) {
      throw new HttpError(404, `Movement ${movementId} does not exist for sample ${sampleId}`);
    }

    return movement;
  }

  async listSampleMovements(sampleId, { movementType = null, status = null } = {}) {
    const normalizedMovementType =
      typeof movementType === 'string' && movementType.trim().length > 0
        ? movementType.trim().toUpperCase()
        : null;
    const normalizedStatus =
      typeof status === 'string' && status.trim().length > 0 ? status.trim().toUpperCase() : null;

    if (
      normalizedMovementType &&
      normalizedMovementType !== 'SALE' &&
      normalizedMovementType !== 'LOSS'
    ) {
      throw new HttpError(422, 'movementType must be one of: SALE, LOSS');
    }

    if (normalizedStatus && normalizedStatus !== 'ACTIVE' && normalizedStatus !== 'CANCELLED') {
      throw new HttpError(422, 'status must be one of: ACTIVE, CANCELLED');
    }

    const where = {
      sampleId,
      ...(normalizedMovementType ? { movementType: normalizedMovementType } : {}),
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
    };

    const rows = await this.prisma.sampleMovement.findMany({
      where,
      include: SAMPLE_MOVEMENT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return rows.map((row) => mapSampleMovement(row));
  }

  async findSampleEventOrNull(sampleId, eventId) {
    const row = await this.prisma.sampleEvent.findFirst({
      where: {
        sampleId,
        eventId,
      },
    });

    if (!row) {
      return null;
    }

    return mapEvent(row);
  }

  async requireSampleEvent(sampleId, eventId) {
    const event = await this.findSampleEventOrNull(sampleId, eventId);
    if (!event) {
      throw new HttpError(404, `Event ${eventId} does not exist for sample ${sampleId}`);
    }

    return event;
  }

  // Q.print: getNextPrintAttemptNumber sem distincao printAction (toda
  // impressao e igual; attemptNumber sequencial unico por sample cobre
  // qualquer pergunta operacional). Drop da coluna `print_action` fica
  // em Q.final — por enquanto a coluna ainda existe mas e sempre 'PRINT'.
  async getNextPrintAttemptNumber(sampleId) {
    const lastPrintJob = await this.prisma.printJob.findFirst({
      where: { sampleId },
      orderBy: [{ attemptNumber: 'desc' }, { createdAt: 'desc' }],
      select: { attemptNumber: true },
    });

    return (lastPrintJob?.attemptNumber ?? 0) + 1;
  }

  // Q.print: lazy timeout de PrintJob travado. Marca PrintJobs PENDING
  // mais antigos que `timeoutMs` como FAILED com erro 'timeout 1min'.
  // Aplicado em requestQrPrint (path de escrita) e em getSampleDetail
  // (path de leitura) — sem worker/cron, decisao D3 do plano.
  async expireStalePrintJobs(sampleId, timeoutMs) {
    const cutoff = new Date(Date.now() - timeoutMs);
    return this.prisma.printJob.updateMany({
      where: {
        sampleId,
        status: 'PENDING',
        createdAt: { lt: cutoff },
      },
      data: { status: 'FAILED', error: 'timeout 1min', updatedAt: new Date() },
    });
  }

  async getSampleDetail(sampleId, options = {}) {
    // Q.print: lazy timeout antes de projetar — PrintJobs PENDING > 1min
    // viram FAILED, refletindo no latestPrintJob retornado.
    if (options.applyPrintTimeout !== false) {
      await this.expireStalePrintJobs(sampleId, 60 * 1000);
    }

    const sample = await this.requireSample(sampleId);
    const [
      attachments,
      events,
      movements,
      latestPrintJob,
      components,
      activeBlends,
      cascadedMovementOrigins,
    ] = await Promise.all([
      this.listAttachments(sampleId),
      this.listSampleEvents(sampleId, { limit: options.eventLimit ?? 200 }),
      this.listSampleMovements(sampleId),
      this.findLatestPrintJob(sampleId),
      // Liga A3.4: composicao da liga quando isBlend=true (lista vazia
      // pra Sample normal). Cada componente carrega snapshot da origem
      // (lot/owner/harvest) pra UI renderizar sem JOIN adicional.
      sample.isBlend ? this._listBlendComponents(sampleId) : Promise.resolve([]),
      // Liga A3.4 (T0.B + F7.D): ligas ativas onde este sample e origem.
      // Sempre incluido (vazio se nao esta em nenhuma) — frontend renderiza
      // secao "Comprometida em N ligas" quando length > 0.
      this.findActiveBlendsContainingOrigin(sampleId),
      // Liga B3.6: por movimento cascateado, a liga-pai {sampleId, lotNumber}.
      // A UI esconde editar/cancelar nesses e mostra o trace "via cascata".
      this.loadCascadedMovementOrigins(sampleId),
    ]);

    // Liga B3.6: cada movimento ganha `cascadedFrom` — a liga que o originou
    // via cascata, ou null (movimento direto). Substitui o flag `cascaded`.
    const decoratedMovements = movements.map((movement) => ({
      ...movement,
      cascadedFrom: cascadedMovementOrigins.get(movement.id) ?? null,
    }));

    return {
      sample,
      attachments,
      events,
      movements: decoratedMovements,
      latestPrintJob,
      components,
      activeBlends,
    };
  }

  // Liga A3.4: lista de componentes da liga + snapshot da origem
  // (lot/owner/harvest/sacks/isBlend) pra UI da tela de detalhe da liga
  // (Wave B3 — secao "Composicao"). Ordenado por createdAt pra preservar
  // ordem original de adicao.
  async _listBlendComponents(blendSampleId) {
    const rows = await this.prisma.sampleBlendComponent.findMany({
      where: { sampleId: blendSampleId },
      include: {
        originSample: {
          select: {
            id: true,
            internalLotNumber: true,
            declaredOwner: true,
            declaredHarvest: true,
            declaredSacks: true,
            isBlend: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      originSampleId: row.originSampleId,
      contributedSacks: row.contributedSacks,
      originSample: row.originSample
        ? {
            id: row.originSample.id,
            internalLotNumber: row.originSample.internalLotNumber,
            declaredOwner: row.originSample.declaredOwner,
            declaredHarvest: row.originSample.declaredHarvest,
            declaredSacks: row.originSample.declaredSacks,
            isBlend: row.originSample.isBlend,
            status: row.originSample.status,
          }
        : null,
    }));
  }

  // Q.print: getDashboardPending sem `printPending` (decisao Q.1.c #20 —
  // card "Aguardando impressao" cortado definitivamente). `oldestPending`
  // tambem deletado (cobria QR_PENDING_PRINT que nao existe mais como
  // status). Resta apenas `classificationPending` (samples em RC).
  async getDashboardPending() {
    const [allStatusCounts, classificationPendingRows, todayReceivedRows, clientsIncompleteTotal] =
      await this.prisma.$transaction([
        this.prisma.sample.groupBy({
          by: ['status'],
          where: {
            status: { in: CLASSIFICATION_PENDING_STATUSES },
          },
          _count: { status: true },
        }),
        this.prisma.sample.findMany({
          where: {
            status: { in: CLASSIFICATION_PENDING_STATUSES },
          },
          orderBy: [{ updatedAt: 'asc' }, { internalLotNumber: 'asc' }, { id: 'asc' }],
          take: DASHBOARD_LIST_LIMIT,
          select: DASHBOARD_SAMPLE_SELECT,
        }),
        (() => {
          const nowUtc = new Date();
          const nowSp = new Date(nowUtc.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000);
          const year = nowSp.getUTCFullYear();
          const month = nowSp.getUTCMonth();
          const day = nowSp.getUTCDate();
          const startUtc = new Date(
            Date.UTC(year, month, day, SAO_PAULO_UTC_OFFSET_HOURS + 7, 0, 0, 0)
          );
          const endUtc = new Date(
            Date.UTC(year, month, day, SAO_PAULO_UTC_OFFSET_HOURS + 18, 0, 0, 0)
          );
          return this.prisma.$queryRaw`
            SELECT COUNT(*)::INTEGER AS total
            FROM "sample" s
            WHERE s."created_at" >= ${startUtc}
              AND s."created_at" <= ${endUtc}
          `;
        })(),
        // Contagem de clientes com cadastro incompleto. Reusa o WHERE clause
        // canonico de client-service (mesma regra do chip filtro em /clients).
        this.prisma.client.count({
          where: {
            status: 'ACTIVE',
            ...buildCompletenessWhere('incomplete'),
          },
        }),
      ]);

    const countByStatus = {};
    for (const row of allStatusCounts) {
      countByStatus[row.status] = row._count.status;
    }

    const classificationPendingCounts = {};
    let classificationPendingTotal = 0;
    for (const s of CLASSIFICATION_PENDING_STATUSES) {
      const count = countByStatus[s] ?? 0;
      classificationPendingCounts[s] = count;
      classificationPendingTotal += count;
    }

    const todayReceivedTotal = toIntegerOrZero(todayReceivedRows?.[0]?.total);

    return {
      todayReceivedTotal,
      classificationPending: {
        counts: classificationPendingCounts,
        total: classificationPendingTotal,
        items: classificationPendingRows.map(mapDashboardSample),
      },
      clientsIncomplete: {
        total: clientsIncompleteTotal,
      },
    };
  }

  async getDashboardSalesAvailability() {
    const nowUtc = new Date();
    const nowSp = new Date(nowUtc.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000);

    const spYear = nowSp.getUTCFullYear();
    const spMonth = nowSp.getUTCMonth();
    const spDay = nowSp.getUTCDate();

    const todayStartUtc = new Date(
      Date.UTC(spYear, spMonth, spDay, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0)
    );
    const todayEndUtc = new Date(
      Date.UTC(spYear, spMonth, spDay + 1, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0)
    );

    const boundary30 = new Date(
      Date.UTC(spYear, spMonth, spDay - 30, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0)
    );
    const boundary15 = new Date(
      Date.UTC(spYear, spMonth, spDay - 15, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0)
    );

    const rows = await this.prisma.$queryRaw`
      SELECT
        COUNT(*)::INTEGER                                                                    AS "total",
        COUNT(*) FILTER (WHERE s."created_at" >= ${todayStartUtc}
                           AND s."created_at" <  ${todayEndUtc})::INTEGER                 AS "registeredToday",
        COUNT(*) FILTER (WHERE s."created_at" <  ${boundary30})::INTEGER                  AS "over30",
        COUNT(*) FILTER (WHERE s."created_at" >= ${boundary30}
                           AND s."created_at" <  ${boundary15})::INTEGER                  AS "from15to30",
        COUNT(*) FILTER (WHERE s."created_at" >= ${boundary15})::INTEGER                  AS "under15"
      FROM "sample" s
      WHERE s."status" <> 'INVALIDATED'
        AND s."commercial_status" IN ('OPEN', 'PARTIALLY_SOLD')
    `;

    const row = rows[0] ?? {};

    return {
      total: toIntegerOrZero(row.total),
      registeredToday: toIntegerOrZero(row.registeredToday),
      bands: {
        over30: toIntegerOrZero(row.over30),
        from15to30: toIntegerOrZero(row.from15to30),
        under15: toIntegerOrZero(row.under15),
      },
    };
  }

  async getDashboardOperationalMetrics({ now = new Date() } = {}) {
    // Cohort por classified_at: 5 dias calendario BRT terminando na data de referencia
    // (hoje se NOW >= 17:30 BRT, senao ontem). Mede tempo de registro -> classificacao
    // como media aritmetica. Amostras pendentes nao entram na metrica (quando classificarem
    // aparecem no bucket do dia em que foram classificadas, refletindo atrasos reais ex.
    // fim de semana). Amostras INVALIDATED sao excluidas. Dias sem classificacao retornam
    // bucket vazio (count:0, value:0) para preservar o eixo temporal de 5 dias.
    const { windowStartUtc, windowEndUtc, bucketDates } = computeOperationalMetricsWindow(now);

    const rows = await this.prisma.$queryRaw`
      WITH registered AS (
        SELECT sample_id, MIN(occurred_at) AS registered_at
        FROM sample_event
        WHERE event_type = 'REGISTRATION_CONFIRMED'
        GROUP BY sample_id
      ),
      classified AS (
        SELECT sample_id, MIN(occurred_at) AS classified_at
        FROM sample_event
        WHERE event_type = 'CLASSIFICATION_COMPLETED'
        GROUP BY sample_id
      )
      SELECT
        (c.classified_at - INTERVAL '3 hours')::date AS "date",
        EXTRACT(EPOCH FROM (c.classified_at - r.registered_at)) / 3600.0 AS "hoursElapsed"
      FROM classified c
      JOIN registered r ON r.sample_id = c.sample_id
      JOIN sample s ON s.id = c.sample_id AND s.status != 'INVALIDATED'
      WHERE c.classified_at >= ${windowStartUtc}
        AND c.classified_at < ${windowEndUtc}
        AND c.classified_at > r.registered_at
      ORDER BY c.classified_at
    `;

    const byDate = new Map(bucketDates.map((date) => [date, []]));
    const allValues = [];

    for (const row of rows) {
      const dateStr =
        row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date);
      const hours = Number(row.hoursElapsed);
      if (!byDate.has(dateStr)) continue;
      byDate.get(dateStr).push(hours);
      allValues.push(hours);
    }

    const buckets = bucketDates.map((date) => {
      const values = byDate.get(date);
      return {
        date,
        value: values.length > 0 ? computeMean(values) : 0,
        count: values.length,
      };
    });

    return {
      overall: computeMean(allValues),
      meta: 24,
      sampleCount: allValues.length,
      buckets,
    };
  }

  async getDashboardCommercialMetrics({ now = new Date() } = {}) {
    // Cohort por sold_at (primeira SALE_CREATED com sample_movement ACTIVE): 4 semanas
    // ISO BRT (segunda-domingo) terminando na semana de referencia (semana corrente
    // se NOW >= sexta 17:30 BRT, senao semana anterior). Mede tempo de classificacao ->
    // venda como media aritmetica em dias. Amostras OPEN ou LOST sem venda ficam fora
    // naturalmente (sem SALE_CREATED com movement ativo). Vendas canceladas excluidas
    // pelo filtro sm.status = 'ACTIVE'. Amostras INVALIDATED excluidas. Semanas sem
    // venda retornam bucket vazio (count:0, value:0).
    const { windowStartUtc, windowEndUtc, bucketDates } = computeCommercialMetricsWindow(now);

    const rows = await this.prisma.$queryRaw`
      WITH first_sale AS (
        SELECT
          se.sample_id,
          MIN(se.occurred_at) AS sold_at
        FROM sample_event se
        LEFT JOIN sample_movement sm
          ON sm.sample_id = se.sample_id
          AND sm.movement_type = 'SALE'
          AND sm.status = 'ACTIVE'
          AND sm.created_at <= se.occurred_at + INTERVAL '1 second'
        WHERE se.event_type = 'SALE_CREATED'
          AND se.occurred_at >= ${windowStartUtc}
          AND se.occurred_at < ${windowEndUtc}
          AND (sm.id IS NOT NULL)
        GROUP BY se.sample_id
      ),
      classified AS (
        SELECT sample_id, MIN(occurred_at) AS classified_at
        FROM sample_event
        WHERE event_type = 'CLASSIFICATION_COMPLETED'
        GROUP BY sample_id
      )
      SELECT
        (fs.sold_at - INTERVAL '3 hours')::date AS "soldDate",
        EXTRACT(EPOCH FROM (fs.sold_at - c.classified_at)) / 86400.0 AS "daysElapsed"
      FROM first_sale fs
      JOIN classified c ON c.sample_id = fs.sample_id
      JOIN sample s ON s.id = fs.sample_id AND s.status != 'INVALIDATED'
      WHERE fs.sold_at > c.classified_at
      ORDER BY fs.sold_at
    `;

    const byBucket = new Map(bucketDates.map((date) => [date, []]));
    const allValues = [];

    for (const row of rows) {
      const soldDate =
        row.soldDate instanceof Date
          ? row.soldDate.toISOString().slice(0, 10)
          : String(row.soldDate);
      const days = Number(row.daysElapsed);
      const mondayKey = mondayOfBrtDate(soldDate);
      if (!byBucket.has(mondayKey)) continue;
      byBucket.get(mondayKey).push(days);
      allValues.push(days);
    }

    const buckets = bucketDates.map((date) => {
      const values = byBucket.get(date);
      return {
        date,
        value: values.length > 0 ? computeMean(values) : 0,
        count: values.length,
      };
    });

    return {
      overall: computeMean(allValues),
      meta: 15,
      sampleCount: allValues.length,
      buckets,
    };
  }

  // Performance — Fase 2 do port mobile (2026-05-26): EXPLAIN ANALYZE
  // confirmou que a query atual e eficiente com PostgreSQL 15+ via
  // "Run Condition" no WindowAgg (corta ROW_NUMBER() cedo). Indices
  // existentes em sample_event ((event_type, occurred_at) +
  // (sample_id, occurred_at)) sao suficientes.
  //
  // Revisitar (criar indice composto + considerar reescrita com
  // DISTINCT ON ou pre-LIMIT) APENAS se:
  //   - SELECT count(*) FROM sample_event WHERE event_type IN (...)
  //     ultrapassar ~100k rows, OU
  //   - Slow query log do Cloud SQL mostrar este metodo consistentemente
  //     acima de 200ms P95, OU
  //   - Latencia do endpoint /api/v1/dashboard/recent-activity > 500ms.
  async getDashboardRecentActivity() {
    // Feed por-evento (nao mais "ultimo evento por sample"): cada acao vira um
    // card. Inclui os cancelamentos de movimentacao (SALE_CANCELLED /
    // LOSS_CANCELLED) — assim "vendeu e depois cancelou" aparece como 2
    // atividades. Amostras invalidadas saem do feed por inteiro.
    const rows = await this.prisma.$queryRaw`
      SELECT
        se.sample_id AS "sampleId",
        se.event_type::text AS "eventType",
        se.payload AS "payload",
        se.occurred_at AS "occurredAt",
        se.sequence_number AS "sequenceNumber",
        s.internal_lot_number AS "internalLotNumber",
        s.declared_owner AS "declaredOwner",
        s.declared_sacks AS "declaredSacks",
        s.is_blend AS "isBlend",
        -- Caminho A do envio cancelado: marca o card PHYSICAL_SAMPLE_SENT como
        -- cancelado (o frontend esmaece) quando existe um SEND_CANCELLED
        -- apontando pra ESTE envio via payload.sendEventId = se.event_id. Mesmo
        -- pareamento (forma negada) de resolveSampleIdsSentToClients. Cada
        -- reenvio e independente; demais tipos de evento = false.
        (
          se.event_type = 'PHYSICAL_SAMPLE_SENT'
          AND EXISTS (
            SELECT 1
            FROM "sample_event" canc
            WHERE canc.sample_id = se.sample_id
              AND canc.event_type = 'PHYSICAL_SAMPLE_SEND_CANCELLED'
              AND canc.payload->>'sendEventId' = se.event_id::text
          )
        ) AS "cancelled"
      FROM "sample_event" se
      JOIN "sample" s ON s.id = se.sample_id
      WHERE se.event_type IN (
        'REGISTRATION_CONFIRMED',
        'SALE_CREATED',
        'LOSS_RECORDED',
        'SALE_CANCELLED',
        'LOSS_CANCELLED',
        'PHYSICAL_SAMPLE_SENT'
      )
        AND s.status != 'INVALIDATED'
      ORDER BY se.occurred_at DESC, se.sequence_number DESC
      LIMIT ${RECENT_ACTIVITY_LIMIT}
    `;

    return {
      items: rows.map(mapRecentActivityRow),
    };
  }

  async getNextInternalLotNumber() {
    // Fase P1: lote vira numerico puro (ex: "5641"). Antes era "A-####".
    // Sequencia continua de onde a empresa parou no historico em papel.
    // 2026-05-12: empresa retomou uso do app apos reset do banco —
    // initialSequence bumpada de 5640 -> 5657 pra que a proxima amostra
    // criada (com tabela sample vazia) seja a "5658" definida pelo Flavio.
    //
    // Lote editavel (2026-06-19): o "proximo" considera SO os lotes automaticos
    // (lot_number_manual = false) — um numero informado manualmente nunca avanca
    // o ponteiro da sequencia. Alem disso pulamos qualquer numero ja ocupado
    // (manual ou auto): quando a sequencia natural alcanca um numero manual ja
    // usado, ela segue para o proximo livre. Janela de busca = 1000 numeros.
    const initialSequence = 5657;

    const result = await this.prisma.$queryRaw`
      WITH base AS (
        SELECT COALESCE(MAX(internal_lot_number_int), ${initialSequence}::integer) AS m
        FROM sample
        WHERE lot_number_manual = false
          AND internal_lot_number_int IS NOT NULL
      )
      SELECT g AS candidate
      FROM base
      CROSS JOIN generate_series(base.m + 1, base.m + 1000) AS g
      WHERE NOT EXISTS (
        SELECT 1 FROM sample s WHERE s.internal_lot_number_int = g
      )
      ORDER BY g ASC
      LIMIT 1`;

    const candidate = result[0]?.candidate ?? null;
    if (candidate !== null && candidate !== undefined) {
      return String(Number(candidate));
    }

    // Fallback defensivo (janela de 1000 esgotada — cenario implausivel): o
    // maior numero em uso + 1 e sempre livre (nada esta acima dele).
    const maxRow = await this.prisma.$queryRaw`
      SELECT COALESCE(MAX(internal_lot_number_int), ${initialSequence}::integer) AS m FROM sample`;
    return String(Number(maxRow[0]?.m ?? initialSequence) + 1);
  }

  // Liga A2.1: CTE recursiva carregando a arvore inteira de descendentes
  // de uma liga (Liga T0.D — cascata recursiva, profundidade ilimitada
  // mas com guarda defensiva de 10 niveis).
  //
  // Inclui a propria raiz como primeira linha (depth=0, parent=null,
  // contributedSacks=null). Cada descendente carrega seu parent imediato
  // + contribuicao + dados do sample necessarios pra validacao/cascata
  // (version, sold/lost/declaredSacks, status, isBlend).
  //
  // Aceita transacao opcional (executor) — usar dentro de uma tx aberta
  // pra coletar versions consistente. Sem executor, usa this.prisma.
  async loadBlendTree(rootSampleId, { executor = null } = {}) {
    const client = executor ?? this.prisma;
    const rows = await client.$queryRaw`
      WITH RECURSIVE blend_tree AS (
        SELECT
          s.id AS sample_id,
          NULL::uuid AS parent_blend_id,
          NULL::int AS contributed_sacks,
          0 AS depth,
          s.is_blend,
          s.version,
          s.declared_sacks,
          s.sold_sacks,
          s.lost_sacks,
          s.status::text AS status,
          s.internal_lot_number
        FROM sample s
        WHERE s.id = ${rootSampleId}::uuid

        UNION ALL

        SELECT
          child.id AS sample_id,
          bc.sample_id AS parent_blend_id,
          bc.contributed_sacks,
          bt.depth + 1 AS depth,
          child.is_blend,
          child.version,
          child.declared_sacks,
          child.sold_sacks,
          child.lost_sacks,
          child.status::text AS status,
          child.internal_lot_number
        FROM blend_tree bt
        JOIN sample_blend_component bc ON bc.sample_id = bt.sample_id
        JOIN sample child ON child.id = bc.origin_sample_id
        WHERE bt.depth < ${MAX_BLEND_DEPTH}
      )
      SELECT
        sample_id,
        parent_blend_id,
        contributed_sacks,
        depth,
        is_blend,
        version,
        declared_sacks,
        sold_sacks,
        lost_sacks,
        status,
        internal_lot_number
      FROM blend_tree
      ORDER BY depth ASC, sample_id ASC
    `;

    return rows.map((row) => ({
      sampleId: row.sample_id,
      parentBlendId: row.parent_blend_id,
      contributedSacks: row.contributed_sacks === null ? null : Number(row.contributed_sacks),
      depth: Number(row.depth),
      isBlend: Boolean(row.is_blend),
      version: Number(row.version),
      declaredSacks: row.declared_sacks === null ? null : Number(row.declared_sacks),
      soldSacks: Number(row.sold_sacks),
      lostSacks: Number(row.lost_sacks),
      status: row.status,
      internalLotNumber: row.internal_lot_number,
    }));
  }

  // Liga B4 Fase 2: viabilidade da venda de uma liga. Roda loadBlendTree e,
  // pra cada descendente (não-raiz), avalia se o saldo disponível
  // (declared - sold - lost) ainda cobre a contribuição exigida — espelha
  // EXATAMENTE o hard block quantitativo F7.6 de _createBlendCascadeMovement.
  // Fonte única consumida pela pré-validação do modal de venda (Fase 5) e
  // pelo flag de viabilidade no detalhe da liga (Fase 7). Retorna null
  // quando o sample não existe.
  async getBlendFeasibility(rootSampleId, { executor = null } = {}) {
    const tree = await this.loadBlendTree(rootSampleId, { executor });
    if (tree.length === 0) {
      return null;
    }

    const root = tree.find((node) => node.sampleId === rootSampleId);

    const nodes = tree.map((node) => {
      const availableSacks = (node.declaredSacks ?? 0) - node.soldSacks - node.lostSacks;
      return {
        sampleId: node.sampleId,
        lotNumber: node.internalLotNumber,
        parentBlendId: node.parentBlendId,
        depth: node.depth,
        isBlend: node.isBlend,
        status: node.status,
        contributedSacks: node.contributedSacks,
        declaredSacks: node.declaredSacks,
        soldSacks: node.soldSacks,
        lostSacks: node.lostSacks,
        availableSacks,
      };
    });

    // F7.6 quantitativo: um descendente bloqueia a venda quando o saldo
    // disponível é menor que a contribuição exigida pela liga.
    const blockingOrigins = nodes
      .filter((node) => node.sampleId !== rootSampleId)
      .filter((node) => node.availableSacks < node.contributedSacks)
      .map((node) => ({
        sampleId: node.sampleId,
        lotNumber: node.lotNumber,
        contributedSacks: node.contributedSacks,
        availableSacks: node.availableSacks,
      }));

    return {
      sampleId: rootSampleId,
      isBlend: Boolean(root?.isBlend),
      feasible: blockingOrigins.length === 0,
      nodes,
      blockingOrigins,
    };
  }

  // Liga B4 Fase 3: resolve TODOS os movimentos de uma cascata de venda/perda
  // de liga, a partir do movimento da raiz. A cascata só é amarrada pelo
  // encadeamento de causationId (a raiz tem causationId=null; cada descendente
  // aponta pro evento criador do pai imediato — ver _createBlendCascadeMovement).
  // Percorre sample_event por causation_id desde o evento SALE_CREATED/
  // LOSS_RECORDED da raiz e junta, por nó, o movimento + os saldos/versão
  // atuais do sample. Consumido pela cascata reversa de cancelamento (Fase 3)
  // e pela cascata de update (Fase 4). Retorna [] quando o movimento raiz não
  // tem evento criador.
  async loadBlendCascadeMovements(rootSampleId, rootMovementId, { executor = null } = {}) {
    const client = executor ?? this.prisma;
    const rows = await client.$queryRaw`
      WITH RECURSIVE cascade_events AS (
        SELECT
          e.event_id,
          e.causation_id,
          e.sample_id,
          e.payload,
          0 AS depth
        FROM sample_event e
        WHERE e.sample_id = ${rootSampleId}::uuid
          AND e.event_type::text IN ('SALE_CREATED', 'LOSS_RECORDED')
          AND e.payload->>'movementId' = ${rootMovementId}

        UNION ALL

        SELECT
          child.event_id,
          child.causation_id,
          child.sample_id,
          child.payload,
          ce.depth + 1 AS depth
        FROM cascade_events ce
        JOIN sample_event child ON child.causation_id = ce.event_id
        WHERE ce.depth < ${MAX_BLEND_DEPTH}
          AND child.event_type::text IN ('SALE_CREATED', 'LOSS_RECORDED')
      )
      SELECT
        ce.event_id,
        ce.causation_id,
        ce.sample_id,
        ce.depth,
        (ce.payload->>'movementId')::uuid AS movement_id,
        m.movement_type::text AS movement_type,
        m.quantity_sacks,
        m.status::text AS movement_status,
        s.declared_sacks,
        s.sold_sacks,
        s.lost_sacks,
        s.version,
        s.internal_lot_number
      FROM cascade_events ce
      JOIN sample_movement m ON m.id = (ce.payload->>'movementId')::uuid
      JOIN sample s ON s.id = ce.sample_id
      ORDER BY ce.depth ASC, ce.sample_id ASC
    `;

    return rows.map((row) => ({
      creationEventId: row.event_id,
      causationId: row.causation_id,
      sampleId: row.sample_id,
      depth: Number(row.depth),
      movementId: row.movement_id,
      movementType: row.movement_type,
      quantitySacks: Number(row.quantity_sacks),
      movementStatus: row.movement_status,
      declaredSacks: row.declared_sacks === null ? null : Number(row.declared_sacks),
      soldSacks: Number(row.sold_sacks),
      lostSacks: Number(row.lost_sacks),
      version: Number(row.version),
      internalLotNumber: row.internal_lot_number,
    }));
  }

  // Liga B4 Fase 4: localiza o evento criador (SALE_CREATED/LOSS_RECORDED) de
  // um movimento. O causationId desse evento distingue um movimento de raiz
  // (causationId null — venda direta ou liga raiz) de um movimento CASCATEADO
  // (causationId não-nulo — criado pela cascata de uma liga). Usado pelo guard
  // que impede cancelar/editar um movimento cascateado isoladamente.
  async loadMovementCreationEvent(sampleId, movementId, { executor = null } = {}) {
    const client = executor ?? this.prisma;
    const rows = await client.$queryRaw`
      SELECT event_id, causation_id
      FROM sample_event
      WHERE sample_id = ${sampleId}::uuid
        AND event_type::text IN ('SALE_CREATED', 'LOSS_RECORDED')
        AND payload->>'movementId' = ${movementId}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return null;
    }
    return { eventId: rows[0].event_id, causationId: rows[0].causation_id };
  }

  // Liga B3.6: dado um sample, resolve cada movimento criado pela cascata de
  // uma liga e a liga-pai imediata que o originou. O evento criador
  // (SALE_CREATED/LOSS_RECORDED) cascateado tem causation_id != null; o JOIN
  // sobe pro evento-pai e pro sample-pai (a liga). Retorna
  // Map<movementId, {sampleId, lotNumber}> so dos cascateados (o resto nao
  // gera linha); consumido por getSampleDetail pra `movement.cascadedFrom`.
  async loadCascadedMovementOrigins(sampleId, { executor = null } = {}) {
    const client = executor ?? this.prisma;
    const rows = await client.$queryRaw`
      SELECT
        child.payload->>'movementId'      AS movement_id,
        parent.sample_id::text            AS parent_sample_id,
        parent_sample.internal_lot_number AS parent_lot_number
      FROM sample_event child
      JOIN sample_event parent ON parent.event_id = child.causation_id
      JOIN sample parent_sample ON parent_sample.id = parent.sample_id
      WHERE child.sample_id = ${sampleId}::uuid
        AND child.event_type::text IN ('SALE_CREATED', 'LOSS_RECORDED')
        AND child.causation_id IS NOT NULL
        AND child.payload->>'movementId' IS NOT NULL
    `;
    return new Map(
      rows.map((row) => [
        row.movement_id,
        { sampleId: row.parent_sample_id, lotNumber: row.parent_lot_number },
      ])
    );
  }

  // Liga A2.2: retorna o subset minimo de campos do sample necessario
  // pra validacoes de createBlend (status, isBlend, sacks, lot). Sem
  // include de relacoes — mais barato que findSampleOrNull. Retorna null
  // se o sample nao existe.
  async loadSampleSummary(sampleId, { executor = null } = {}) {
    const client = executor ?? this.prisma;
    const row = await client.sample.findUnique({
      where: { id: sampleId },
      select: {
        id: true,
        status: true,
        isBlend: true,
        declaredSacks: true,
        soldSacks: true,
        lostSacks: true,
        declaredHarvest: true,
        ownerClientId: true,
        declaredOwner: true,
        internalLotNumber: true,
        version: true,
      },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      status: row.status,
      isBlend: row.isBlend,
      declaredSacks: row.declaredSacks,
      soldSacks: row.soldSacks,
      lostSacks: row.lostSacks,
      availableSacks: (row.declaredSacks ?? 0) - row.soldSacks - row.lostSacks,
      declaredHarvest: row.declaredHarvest ?? null,
      ownerClientId: row.ownerClientId ?? null,
      declaredOwner: row.declaredOwner ?? null,
      internalLotNumber: row.internalLotNumber,
      version: row.version,
    };
  }

  // Liga A2.1: encontra ligas ativas (status != INVALIDATED) que contem
  // a amostra dada como originSampleId em sample_blend_component. Usado
  // por invalidateSample (Liga F7.2 + F7.D) e pra validacao de overcommit
  // (Liga T0.B — committedSacks por amostra). Aceita executor opcional.
  async findActiveBlendsContainingOrigin(originSampleId, { executor = null } = {}) {
    const client = executor ?? this.prisma;
    const rows = await client.$queryRaw`
      SELECT
        s.id AS sample_id,
        s.internal_lot_number,
        s.status::text AS status,
        bc.contributed_sacks,
        s.declared_owner,
        s.declared_harvest
      FROM sample_blend_component bc
      JOIN sample s ON s.id = bc.sample_id
      WHERE bc.origin_sample_id = ${originSampleId}::uuid
        AND s.status <> 'INVALIDATED'
      ORDER BY s.internal_lot_number ASC
    `;

    return rows.map((row) => ({
      sampleId: row.sample_id,
      lotNumber: row.internal_lot_number,
      status: row.status,
      contributedSacks: Number(row.contributed_sacks),
      // Liga B3.7: snapshot do dono/safra da liga pra UI mostrar contexto
      // (no lugar de '—'). declaredOwner costuma ser null (carteira da
      // corretora); declaredHarvest e derivado das origens no createBlend.
      declaredOwner: row.declared_owner ?? null,
      declaredHarvest: row.declared_harvest ?? null,
    }));
  }

  // Liga: CTE recursiva ASCENDENTE — todas as ligas ATIVAS que contem
  // editedSampleId como origem, direta ou indiretamente (espelho invertido de
  // loadBlendTree). Base da propagacao reativa de safra: ao editar a safra de
  // um lote, recalcula a safra das ligas ancestrais.
  //
  // Diferente de loadBlendTree, NAO inclui o no editado como raiz (depth 0) —
  // ele e um lote comum cuja safra ja muda no proprio evento de edicao. A
  // ancora ja sao as ligas-pai diretas (depth 1). Ordenado por depth ASC
  // (ordem topologica: liga de nivel 1 antes da liga-de-liga de nivel 2, pois
  // o recalculo da segunda depende do valor ja recalculado da primeira).
  //
  // Topologias em diamante (uma liga alcancada por mais de um caminho) geram
  // linhas duplicadas para o mesmo sampleId — o consumidor DEVE deduplicar por
  // sampleId mantendo o maior depth antes de emitir eventos. Aceita transacao
  // opcional (executor) pra ler versions consistentes dentro de uma tx.
  async loadAncestorBlendTree(editedSampleId, { executor = null } = {}) {
    const client = executor ?? this.prisma;
    const rows = await client.$queryRaw`
      WITH RECURSIVE ancestor_blends AS (
        SELECT
          parent.id AS sample_id,
          1 AS depth,
          parent.version,
          parent.status::text AS status,
          parent.commercial_status::text AS commercial_status,
          parent.declared_harvest,
          parent.owner_client_id,
          parent.declared_owner,
          parent.internal_lot_number,
          parent.sold_sacks,
          parent.lost_sacks
        FROM sample_blend_component bc
        JOIN sample parent ON parent.id = bc.sample_id
        WHERE bc.origin_sample_id = ${editedSampleId}::uuid
          AND parent.status <> 'INVALIDATED'

        UNION ALL

        SELECT
          parent.id AS sample_id,
          ab.depth + 1 AS depth,
          parent.version,
          parent.status::text AS status,
          parent.commercial_status::text AS commercial_status,
          parent.declared_harvest,
          parent.owner_client_id,
          parent.declared_owner,
          parent.internal_lot_number,
          parent.sold_sacks,
          parent.lost_sacks
        FROM ancestor_blends ab
        JOIN sample_blend_component bc ON bc.origin_sample_id = ab.sample_id
        JOIN sample parent ON parent.id = bc.sample_id
        WHERE ab.depth < ${MAX_BLEND_DEPTH}
          AND parent.status <> 'INVALIDATED'
      )
      SELECT
        sample_id,
        depth,
        version,
        status,
        commercial_status,
        declared_harvest,
        owner_client_id,
        declared_owner,
        internal_lot_number,
        sold_sacks,
        lost_sacks
      FROM ancestor_blends
      ORDER BY depth ASC, sample_id ASC
    `;

    return rows.map((row) => ({
      sampleId: row.sample_id,
      depth: Number(row.depth),
      version: Number(row.version),
      status: row.status,
      commercialStatus: row.commercial_status,
      declaredHarvest: row.declared_harvest ?? null,
      ownerClientId: row.owner_client_id ?? null,
      declaredOwner: row.declared_owner ?? null,
      internalLotNumber: row.internal_lot_number,
      soldSacks: Number(row.sold_sacks),
      lostSacks: Number(row.lost_sacks),
    }));
  }

  // Liga: carrega as origens diretas de um conjunto de ligas numa unica query
  // (evita N+1 no recalculo de safra/proprietario). Retorna Map<blendId,
  // Array<{originId, declaredHarvest, ownerClientId, declaredOwner}>>. Aceita
  // transacao opcional (executor).
  async loadDirectOriginsForBlends(blendIds, { executor = null } = {}) {
    const result = new Map();
    if (!Array.isArray(blendIds) || blendIds.length === 0) {
      return result;
    }
    const client = executor ?? this.prisma;
    const rows = await client.$queryRaw`
      SELECT
        bc.sample_id AS blend_id,
        bc.origin_sample_id AS origin_id,
        origin.declared_harvest,
        origin.owner_client_id,
        origin.declared_owner
      FROM sample_blend_component bc
      JOIN sample origin ON origin.id = bc.origin_sample_id
      WHERE bc.sample_id = ANY(${blendIds}::uuid[])
    `;
    for (const row of rows) {
      const blendId = row.blend_id;
      if (!result.has(blendId)) {
        result.set(blendId, []);
      }
      result.get(blendId).push({
        originId: row.origin_id,
        declaredHarvest: row.declared_harvest ?? null,
        ownerClientId: row.owner_client_id ?? null,
        declaredOwner: row.declared_owner ?? null,
      });
    }
    return result;
  }
}
