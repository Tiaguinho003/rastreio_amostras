import { HttpError } from '../contracts/errors.js';

const PENDING_STATUSES = [
  'PHYSICAL_RECEIVED',
  'REGISTRATION_IN_PROGRESS',
  'QR_PENDING_PRINT',
  'CLASSIFICATION_IN_PROGRESS'
];
const PRINT_PENDING_STATUSES = ['REGISTRATION_CONFIRMED', 'QR_PENDING_PRINT'];
const CLASSIFICATION_PENDING_STATUSES = ['QR_PRINTED', 'CLASSIFICATION_IN_PROGRESS'];
const SAMPLE_STATUS_FILTER_GROUPS = {
  PRINT_PENDING: PRINT_PENDING_STATUSES,
  CLASSIFICATION_PENDING: CLASSIFICATION_PENDING_STATUSES,
  CLASSIFIED: ['CLASSIFIED']
};
const LATEST_REGISTRATION_STATUSES = [
  'REGISTRATION_CONFIRMED',
  'QR_PENDING_PRINT',
  'QR_PRINTED',
  'CLASSIFICATION_IN_PROGRESS',
  'CLASSIFIED',
  'INVALIDATED'
];
const DASHBOARD_LIST_LIMIT = 20;
const DASHBOARD_BUSINESS_TIMEZONE = 'America/Sao_Paulo';
const SAMPLES_LIST_DEFAULT_LIMIT = 30;
const SAMPLES_LIST_MAX_LIMIT = 30;
const SAO_PAULO_UTC_OFFSET_HOURS = 3;
const MAX_QR_PARTS = 64;
const UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const INTERNAL_LOT_PATTERN = 'A-\\d+';
const COMMERCIAL_STATUSES = ['OPEN', 'PARTIALLY_SOLD', 'SOLD', 'LOST'];
const SAMPLE_OWNER_INCLUDE = {
  ownerClient: {
    select: {
      id: true,
      code: true,
      personType: true,
      fullName: true,
      legalName: true,
      tradeName: true,
      cpf: true,
      cnpj: true,
      phone: true,
      isBuyer: true,
      isSeller: true,
      status: true
    }
  },
  ownerRegistration: {
    select: {
      id: true,
      clientId: true,
      status: true,
      registrationNumber: true,
      registrationType: true,
      addressLine: true,
      district: true,
      city: true,
      state: true,
      postalCode: true,
      complement: true
    }
  }
};
const SAMPLE_INCLUDE = { ...SAMPLE_OWNER_INCLUDE };
const SAMPLE_MOVEMENT_INCLUDE = {
  buyerClient: {
    select: {
      id: true,
      code: true,
      personType: true,
      fullName: true,
      legalName: true,
      tradeName: true,
      cpf: true,
      cnpj: true,
      phone: true,
      isBuyer: true,
      isSeller: true,
      status: true
    }
  },
  buyerRegistration: {
    select: {
      id: true,
      clientId: true,
      status: true,
      registrationNumber: true,
      registrationType: true,
      addressLine: true,
      district: true,
      city: true,
      state: true,
      postalCode: true,
      complement: true
    }
  }
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
        'token'
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
    lotCandidates
  };
}

function sourceFromDb(source) {
  const map = {
    WEB: 'web',
    API: 'api',
    WORKER: 'worker'
  };
  return map[source] ?? source;
}

function moduleFromDb(moduleName) {
  const map = {
    REGISTRATION: 'registration',
    CLASSIFICATION: 'classification',
    PRINT: 'print',
    COMMERCIAL: 'commercial'
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

  return {
    gte: min ?? undefined,
    lte: max ?? undefined
  };
}

function parseCreatedDateRangeInSaoPaulo(createdDate) {
  const normalized = normalizeOptionalText(createdDate);
  if (!normalized) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) {
    throw new HttpError(422, 'createdDate must follow YYYY-MM-DD format');
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
    throw new HttpError(422, 'createdDate must be a valid calendar date');
  }

  const startUtc = new Date(Date.UTC(year, month - 1, day, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, month - 1, day + 1, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));

  return {
    startUtc,
    endUtc
  };
}

function parseCreatedMonthRangeInSaoPaulo(createdMonth) {
  const normalized = normalizeOptionalText(createdMonth);
  if (!normalized) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})$/.exec(normalized);
  if (!match) {
    throw new HttpError(422, 'createdMonth must follow YYYY-MM format');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const parsed = new Date(Date.UTC(year, month - 1, 1));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1) {
    throw new HttpError(422, 'createdMonth must be a valid calendar month');
  }

  const startUtc = new Date(Date.UTC(year, month - 1, 1, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, month, 1, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));

  return {
    startUtc,
    endUtc
  };
}

function parseCreatedYearRangeInSaoPaulo(createdYear) {
  const normalized = normalizeOptionalText(createdYear);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}$/.test(normalized)) {
    throw new HttpError(422, 'createdYear must follow YYYY format');
  }

  const year = Number(normalized);
  const startUtc = new Date(Date.UTC(year, 0, 1, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year + 1, 0, 1, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));

  return {
    startUtc,
    endUtc
  };
}

function resolveCreatedPeriodRangeInSaoPaulo({ createdDate = null, createdMonth = null, createdYear = null }) {
  const normalizedDate = normalizeOptionalText(createdDate);
  const normalizedMonth = normalizeOptionalText(createdMonth);
  const normalizedYear = normalizeOptionalText(createdYear);

  const informedPeriods = [normalizedDate, normalizedMonth, normalizedYear].filter(Boolean).length;
  if (informedPeriods > 1) {
    throw new HttpError(422, 'Use only one period filter: createdDate, createdMonth or createdYear');
  }

  if (normalizedDate) {
    return parseCreatedDateRangeInSaoPaulo(normalizedDate);
  }

  if (normalizedMonth) {
    return parseCreatedMonthRangeInSaoPaulo(normalizedMonth);
  }

  if (normalizedYear) {
    return parseCreatedYearRangeInSaoPaulo(normalizedYear);
  }

  return null;
}

const CLASSIFIED_AGING_BANDS = ['over30', 'from15to30', 'under15'];

function resolveClassifiedAgingConditions(classifiedAging) {
  const normalized = normalizeOptionalText(classifiedAging);
  if (!normalized) return null;

  if (!CLASSIFIED_AGING_BANDS.includes(normalized)) {
    throw new HttpError(422, 'classifiedAging must be one of: over30, from15to30, under15');
  }

  const nowUtc = new Date();
  const nowSp = new Date(nowUtc.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000);
  const spYear = nowSp.getUTCFullYear();
  const spMonth = nowSp.getUTCMonth();
  const spDay = nowSp.getUTCDate();

  const boundary30 = new Date(Date.UTC(spYear, spMonth, spDay - 30, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));
  const boundary15 = new Date(Date.UTC(spYear, spMonth, spDay - 15, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));

  const conditions = [
    { status: 'CLASSIFIED' },
    { commercialStatus: { in: ['OPEN', 'PARTIALLY_SOLD'] } },
    { classifiedAt: { not: null } }
  ];

  if (normalized === 'over30') {
    conditions.push({ classifiedAt: { lt: boundary30 } });
  } else if (normalized === 'from15to30') {
    conditions.push({ classifiedAt: { gte: boundary30, lt: boundary15 } });
  } else {
    conditions.push({ classifiedAt: { gte: boundary15 } });
  }

  return conditions;
}

function resolveStatusGroupStatuses(statusGroup) {
  const normalized = normalizeOptionalText(statusGroup);
  if (!normalized) {
    return null;
  }

  const resolved = SAMPLE_STATUS_FILTER_GROUPS[normalized];
  if (!resolved) {
    throw new HttpError(
      422,
      'statusGroup must be one of: PRINT_PENDING, CLASSIFICATION_PENDING, CLASSIFICATION_IN_PROGRESS, CLASSIFIED'
    );
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

function buildBuyerMovementFilter(buyer) {
  const normalizedBuyer = normalizeOptionalText(buyer);
  if (!normalizedBuyer) {
    return null;
  }

  const numericSearch = Number.parseInt(normalizedBuyer, 10);
  const exactCode = Number.isSafeInteger(numericSearch) && String(numericSearch) === normalizedBuyer ? numericSearch : null;
  const digits = normalizedBuyer.replace(/\D+/g, '');

  const clientOr = [
    {
      fullName: {
        contains: normalizedBuyer,
        mode: 'insensitive'
      }
    },
    {
      legalName: {
        contains: normalizedBuyer,
        mode: 'insensitive'
      }
    },
    {
      tradeName: {
        contains: normalizedBuyer,
        mode: 'insensitive'
      }
    }
  ];

  if (digits) {
    clientOr.push({
      cpf: {
        contains: digits
      }
    });
    clientOr.push({
      cnpj: {
        contains: digits
      }
    });
  }

  if (exactCode !== null) {
    clientOr.push({
      code: exactCode
    });
  }

  return {
    movements: {
      some: {
        movementType: 'SALE',
        status: 'ACTIVE',
        buyerClient: {
          is: {
            OR: clientOr
          }
        }
      }
    }
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
    displayName: ownerClient.personType === 'PF' ? ownerClient.fullName ?? null : ownerClient.legalName ?? null,
    fullName: ownerClient.fullName ?? null,
    legalName: ownerClient.legalName ?? null,
    tradeName: ownerClient.tradeName ?? null,
    cpf: ownerClient.cpf ?? null,
    cnpj: ownerClient.cnpj ?? null,
    phone: ownerClient.phone ?? null,
    isBuyer: ownerClient.isBuyer,
    isSeller: ownerClient.isSeller,
    status: ownerClient.status
  };
}

function mapOwnerRegistration(ownerRegistration) {
  if (!ownerRegistration) {
    return null;
  }

  return {
    id: ownerRegistration.id,
    clientId: ownerRegistration.clientId,
    status: ownerRegistration.status,
    registrationNumber: ownerRegistration.registrationNumber,
    registrationType: ownerRegistration.registrationType,
    addressLine: ownerRegistration.addressLine,
    district: ownerRegistration.district,
    city: ownerRegistration.city,
    state: ownerRegistration.state,
    postalCode: ownerRegistration.postalCode,
    complement: ownerRegistration.complement ?? null
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
    buyerRegistrationId: row.buyerRegistrationId ?? null,
    quantitySacks: row.quantitySacks,
    movementDate: new Date(row.movementDate).toISOString().slice(0, 10),
    notes: row.notes ?? null,
    lossReasonText: row.reasonText ?? null,
    buyerClientSnapshot: toObjectOrNull(row.buyerClientSnapshot),
    buyerRegistrationSnapshot: toObjectOrNull(row.buyerRegistrationSnapshot),
    version: row.version,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    buyerClient: mapOwnerClient(row.buyerClient),
    buyerRegistration: mapOwnerRegistration(row.buyerRegistration)
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
  createdAt: true
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
      location: row.declaredLocation ?? null
    },
    createdAt: row.createdAt.toISOString()
  };
}

function mapPendingPrintJob(row) {
  const sample = row.sample;
  return {
    jobId: row.id,
    sampleId: row.sampleId,
    printAction: row.printAction,
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
        location: sample.declaredLocation ?? null
      }
    }
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
    ownerRegistrationId: row.ownerRegistrationId ?? null,
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
      location: row.declaredLocation ?? null
    },
    ownerClient: mapOwnerClient(row.ownerClient),
    ownerRegistration: mapOwnerRegistration(row.ownerRegistration),
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
        notes: row.latestNotes
      }
    },
    classificationDraft: {
      snapshot: toObjectOrNull(row.classificationDraftData),
      completionPercent: row.classificationDraftCompletionPercent
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
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
      userAgent: event.metadataUserAgent
    }
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

export class SampleQueryService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async findSampleOrNull(sampleId) {
    const sample = await this.prisma.sample.findUnique({
      where: { id: sampleId },
      include: SAMPLE_INCLUDE
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

  async findPendingPrintJobOrNull(sampleId, printAction = null) {
    const where = {
      sampleId,
      status: 'PENDING'
    };

    if (printAction) {
      where.printAction = printAction;
    }

    const pending = await this.prisma.printJob.findFirst({
      where,
      orderBy: [{ attemptNumber: 'desc' }, { createdAt: 'desc' }]
    });

    if (!pending) {
      return null;
    }

    return {
      printAction: pending.printAction,
      attemptNumber: pending.attemptNumber,
      printerId: pending.printerId ?? null,
      status: pending.status
    };
  }

  async findLatestPrintJob(sampleId) {
    const row = await this.prisma.printJob.findFirst({
      where: { sampleId },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        printAction: true,
        attemptNumber: true,
        status: true,
        printerId: true,
        error: true,
        createdAt: true
      }
    });

    if (!row) return null;

    return {
      jobId: row.id,
      printAction: row.printAction,
      attemptNumber: row.attemptNumber,
      status: row.status,
      printerId: row.printerId ?? null,
      error: row.error ?? null,
      createdAt: row.createdAt.toISOString()
    };
  }

  async listPendingPrintJobs(options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
    const where = {
      status: 'PENDING',
      // Only return jobs for samples still awaiting print — if the sample
      // already advanced past QR_PENDING_PRINT the job is stale.
      sample: { status: 'QR_PENDING_PRINT' }
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
            declaredOriginLot: true
          }
        }
      }
    });

    return {
      items: rows.map(mapPendingPrintJob),
      total: rows.length
    };
  }

  async resolveSampleByLot(lotNumber) {
    if (typeof lotNumber !== 'string' || lotNumber.trim().length === 0) {
      return { found: false };
    }

    const normalized = lotNumber.trim().toUpperCase();

    const row = await this.prisma.sample.findFirst({
      where: {
        internalLotNumber: { equals: normalized, mode: 'insensitive' }
      },
      include: SAMPLE_INCLUDE
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
      ...lotCandidates.map((internalLotNumber) => ({ internalLotNumber }))
    ];

    const rows = await this.prisma.sample.findMany({
      where: {
        OR: orConditions
      },
      take: 50,
      include: SAMPLE_INCLUDE
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
        .filter((row) => typeof row.internalLotNumber === 'string' && row.internalLotNumber.length > 0)
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
      sampleId
    };
    if (options.kind) {
      where.kind = options.kind;
    }

    const attachments = await this.prisma.sampleAttachment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    });

    return attachments.map((attachment) => attachment.id);
  }

  async findAttachmentByKind(sampleId, kind) {
    const attachment = await this.prisma.sampleAttachment.findFirst({
      where: { sampleId, kind },
      orderBy: { createdAt: 'desc' }
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
      createdAt: attachment.createdAt.toISOString()
    };
  }

  async listAttachments(sampleId) {
    const attachments = await this.prisma.sampleAttachment.findMany({
      where: { sampleId },
      orderBy: { createdAt: 'asc' }
    });

    return attachments.map((attachment) => ({
      id: attachment.id,
      sampleId: attachment.sampleId,
      kind: attachment.kind,
      storagePath: attachment.storagePath,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      checksumSha256: attachment.checksumSha256,
      createdAt: attachment.createdAt.toISOString()
    }));
  }

  async listSamples({
    search = null,
    status = null,
    statusGroup = null,
    commercialStatus = null,
    limit = SAMPLES_LIST_DEFAULT_LIMIT,
    offset = 0,
    page = null,
    lot = null,
    owner = null,
    buyer = null,
    harvest = null,
    sacksMin = null,
    sacksMax = null,
    createdDate = null,
    createdMonth = null,
    createdYear = null,
    classifiedAging = null
  } = {}) {
    const safeLimit = Math.min(Math.max(limit, 1), SAMPLES_LIST_MAX_LIMIT);
    const safeOffset = Math.max(offset, 0);
    const safePage = typeof page === 'number' && Number.isInteger(page) && page > 0 ? page : null;
    const resolvedOffset = safePage ? (safePage - 1) * safeLimit : safeOffset;
    const resolvedPage = safePage ?? Math.floor(resolvedOffset / safeLimit) + 1;

    const createdPeriodRange = resolveCreatedPeriodRangeInSaoPaulo({
      createdDate,
      createdMonth,
      createdYear
    });
    const sacksRange = resolveSacksRange({
      sacksMin,
      sacksMax
    });

    const conditions = [];
    const normalizedSearch = normalizeOptionalText(search);
    if (normalizedSearch) {
      conditions.push({
        OR: [
          {
            internalLotNumber: {
              contains: normalizedSearch,
              mode: 'insensitive'
            }
          },
          {
            declaredOwner: {
              contains: normalizedSearch,
              mode: 'insensitive'
            }
          }
        ]
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
          in: resolvedStatusGroupStatuses
        }
      });
    }

    const resolvedCommercialStatus = resolveCommercialStatus(commercialStatus);
    if (resolvedCommercialStatus) {
      conditions.push({
        commercialStatus: resolvedCommercialStatus
      });
    }

    const normalizedLot = normalizeOptionalText(lot);
    if (normalizedLot) {
      conditions.push({
        internalLotNumber: {
          contains: normalizedLot,
          mode: 'insensitive'
        }
      });
    }

    const normalizedOwner = normalizeOptionalText(owner);
    if (normalizedOwner) {
      conditions.push({
        declaredOwner: {
          equals: normalizedOwner,
          mode: 'insensitive'
        }
      });
    }

    const buyerFilter = buildBuyerMovementFilter(buyer);
    if (buyerFilter) {
      conditions.push(buyerFilter);
    }

    const normalizedHarvest = normalizeOptionalText(harvest);
    if (normalizedHarvest) {
      conditions.push({
        declaredHarvest: normalizedHarvest
      });
    }

    if (sacksRange) {
      conditions.push({
        declaredSacks: sacksRange
      });
    }

    if (createdPeriodRange) {
      conditions.push({
        createdAt: {
          gte: createdPeriodRange.startUtc,
          lt: createdPeriodRange.endUtc
        }
      });
    }

    const agingConditions = resolveClassifiedAgingConditions(classifiedAging);
    if (agingConditions) {
      conditions.push(...agingConditions);
    }

    const where = conditions.length > 0 ? { AND: conditions } : undefined;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sample.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: resolvedOffset,
        take: safeLimit,
        include: SAMPLE_INCLUDE
      }),
      this.prisma.sample.count({ where })
    ]);

    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const hasPrev = resolvedPage > 1;
    const hasNext = resolvedPage < totalPages;

    return {
      items: rows.map(mapSample),
      page: {
        limit: safeLimit,
        page: resolvedPage,
        offset: resolvedOffset,
        total,
        totalPages,
        hasPrev,
        hasNext
      }
    };
  }

  async listSampleEvents(sampleId, { limit = 200, afterSequence = null } = {}) {
    const safeLimit = Math.min(Math.max(limit, 1), 500);

    const where = {
      sampleId,
      ...(typeof afterSequence === 'number' ? { sequenceNumber: { gt: afterSequence } } : {})
    };

    const rows = await this.prisma.sampleEvent.findMany({
      where,
      orderBy: { sequenceNumber: 'asc' },
      take: safeLimit
    });

    return rows.map(mapEvent);
  }

  async findSampleMovementOrNull(sampleId, movementId) {
    const row = await this.prisma.sampleMovement.findFirst({
      where: {
        sampleId,
        id: movementId
      },
      include: SAMPLE_MOVEMENT_INCLUDE
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
      typeof movementType === 'string' && movementType.trim().length > 0 ? movementType.trim().toUpperCase() : null;
    const normalizedStatus =
      typeof status === 'string' && status.trim().length > 0 ? status.trim().toUpperCase() : null;

    if (normalizedMovementType && normalizedMovementType !== 'SALE' && normalizedMovementType !== 'LOSS') {
      throw new HttpError(422, 'movementType must be one of: SALE, LOSS');
    }

    if (normalizedStatus && normalizedStatus !== 'ACTIVE' && normalizedStatus !== 'CANCELLED') {
      throw new HttpError(422, 'status must be one of: ACTIVE, CANCELLED');
    }

    const where = {
      sampleId,
      ...(normalizedMovementType ? { movementType: normalizedMovementType } : {}),
      ...(normalizedStatus ? { status: normalizedStatus } : {})
    };

    const rows = await this.prisma.sampleMovement.findMany({
      where,
      include: SAMPLE_MOVEMENT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });

    return rows.map((row) => mapSampleMovement(row));
  }

  async findSampleEventOrNull(sampleId, eventId) {
    const row = await this.prisma.sampleEvent.findFirst({
      where: {
        sampleId,
        eventId
      }
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

  async getNextPrintAttemptNumber(sampleId, printAction = 'PRINT') {
    const lastPrintJob = await this.prisma.printJob.findFirst({
      where: {
        sampleId,
        printAction
      },
      orderBy: [{ attemptNumber: 'desc' }, { createdAt: 'desc' }],
      select: { attemptNumber: true }
    });

    return (lastPrintJob?.attemptNumber ?? 0) + 1;
  }

  async getSampleDetail(sampleId, options = {}) {
    const sample = await this.requireSample(sampleId);
    const [attachments, events, movements, latestPrintJob] = await Promise.all([
      this.listAttachments(sampleId),
      this.listSampleEvents(sampleId, { limit: options.eventLimit ?? 200 }),
      this.listSampleMovements(sampleId),
      this.findLatestPrintJob(sampleId)
    ]);

    return {
      sample,
      attachments,
      events,
      movements,
      latestPrintJob
    };
  }

  async getDashboardPending() {
    const ALL_DASHBOARD_STATUSES = [
      ...new Set([
        ...PENDING_STATUSES,
        ...PRINT_PENDING_STATUSES,
        ...CLASSIFICATION_PENDING_STATUSES
      ])
    ];

    const [
      allStatusCounts,
      agedPending,
      printPendingRows,
      classificationPendingRows,
      latestRegistrationRows,
      latestRegistrationTotal,
      todayReceivedRows
    ] = await this.prisma.$transaction([
      this.prisma.sample.groupBy({
        by: ['status'],
        where: {
          status: { in: ALL_DASHBOARD_STATUSES }
        },
        _count: { status: true }
      }),
      this.prisma.sample.findMany({
        where: {
          status: { in: PENDING_STATUSES }
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: DASHBOARD_LIST_LIMIT,
        select: DASHBOARD_SAMPLE_SELECT
      }),
      this.prisma.sample.findMany({
        where: {
          status: { in: PRINT_PENDING_STATUSES }
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: DASHBOARD_LIST_LIMIT,
        select: DASHBOARD_SAMPLE_SELECT
      }),
      this.prisma.sample.findMany({
        where: {
          status: { in: CLASSIFICATION_PENDING_STATUSES }
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: DASHBOARD_LIST_LIMIT,
        select: DASHBOARD_SAMPLE_SELECT
      }),
      this.prisma.sample.findMany({
        where: {
          status: { in: LATEST_REGISTRATION_STATUSES }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: DASHBOARD_LIST_LIMIT,
        select: DASHBOARD_SAMPLE_SELECT
      }),
      this.prisma.sample.count({
        where: {
          status: { in: LATEST_REGISTRATION_STATUSES }
        }
      }),
      (() => {
        const nowUtc = new Date();
        const nowSp = new Date(nowUtc.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000);
        const year = nowSp.getUTCFullYear();
        const month = nowSp.getUTCMonth();
        const day = nowSp.getUTCDate();
        const startUtc = new Date(Date.UTC(year, month, day, SAO_PAULO_UTC_OFFSET_HOURS + 7, 0, 0, 0));
        const endUtc = new Date(Date.UTC(year, month, day, SAO_PAULO_UTC_OFFSET_HOURS + 18, 0, 0, 0));
        return this.prisma.$queryRaw`
          SELECT COUNT(*)::INTEGER AS total
          FROM "sample" s
          WHERE s."created_at" >= ${startUtc}
            AND s."created_at" <= ${endUtc}
        `;
      })()
    ]);

    const countByStatus = {};
    for (const row of allStatusCounts) {
      countByStatus[row.status] = row._count.status;
    }

    function sumStatuses(statuses) {
      let total = 0;
      for (const s of statuses) {
        total += countByStatus[s] ?? 0;
      }
      return total;
    }

    function pickCounts(statuses) {
      const counts = {};
      for (const s of statuses) {
        counts[s] = countByStatus[s] ?? 0;
      }
      return counts;
    }

    const pendingCounts = pickCounts(PENDING_STATUSES);
    const totalPending = sumStatuses(PENDING_STATUSES);
    const printPendingCounts = pickCounts(PRINT_PENDING_STATUSES);
    const printPendingTotal = sumStatuses(PRINT_PENDING_STATUSES);
    const classificationPendingCounts = pickCounts(CLASSIFICATION_PENDING_STATUSES);
    const classificationPendingTotal = sumStatuses(CLASSIFICATION_PENDING_STATUSES);
    const todayReceivedTotal = toIntegerOrZero(todayReceivedRows?.[0]?.total);

    return {
      pendingCounts,
      totalPending,
      todayReceivedTotal,
      oldestPending: agedPending.map(mapDashboardSample),
      printPending: {
        counts: printPendingCounts,
        total: printPendingTotal,
        items: printPendingRows.map(mapDashboardSample)
      },
      classificationPending: {
        counts: classificationPendingCounts,
        total: classificationPendingTotal,
        items: classificationPendingRows.map(mapDashboardSample)
      },
      classificationInProgress: {
        counts: { CLASSIFICATION_IN_PROGRESS: classificationPendingCounts.CLASSIFICATION_IN_PROGRESS ?? 0 },
        total: classificationPendingCounts.CLASSIFICATION_IN_PROGRESS ?? 0,
        items: []
      },
      latestRegistrations: {
        total: latestRegistrationTotal,
        items: latestRegistrationRows.map(mapDashboardSample)
      }
    };
  }

  async getDashboardSalesAvailability() {
    const nowUtc = new Date();
    const nowSp = new Date(nowUtc.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000);

    const spYear = nowSp.getUTCFullYear();
    const spMonth = nowSp.getUTCMonth();
    const spDay = nowSp.getUTCDate();

    const todayStartUtc = new Date(Date.UTC(spYear, spMonth, spDay, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));
    const todayEndUtc = new Date(Date.UTC(spYear, spMonth, spDay + 1, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));

    const boundary30 = new Date(Date.UTC(spYear, spMonth, spDay - 30, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));
    const boundary15 = new Date(Date.UTC(spYear, spMonth, spDay - 15, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));

    const rows = await this.prisma.$queryRaw`
      SELECT
        COUNT(*)::INTEGER                                                                    AS "total",
        COUNT(*) FILTER (WHERE s."classified_at" >= ${todayStartUtc}
                           AND s."classified_at" <  ${todayEndUtc})::INTEGER                 AS "classifiedToday",
        COUNT(*) FILTER (WHERE s."classified_at" <  ${boundary30})::INTEGER                  AS "over30",
        COUNT(*) FILTER (WHERE s."classified_at" >= ${boundary30}
                           AND s."classified_at" <  ${boundary15})::INTEGER                  AS "from15to30",
        COUNT(*) FILTER (WHERE s."classified_at" >= ${boundary15})::INTEGER                  AS "under15"
      FROM "sample" s
      WHERE s."status" = 'CLASSIFIED'
        AND s."commercial_status" IN ('OPEN', 'PARTIALLY_SOLD')
        AND s."classified_at" IS NOT NULL
    `;

    const row = rows[0] ?? {};

    return {
      total: toIntegerOrZero(row.total),
      classifiedToday: toIntegerOrZero(row.classifiedToday),
      bands: {
        over30: toIntegerOrZero(row.over30),
        from15to30: toIntegerOrZero(row.from15to30),
        under15: toIntegerOrZero(row.under15)
      }
    };
  }

  async getNextInternalLotNumber() {
    const initialSequence = 5469;

    const result = await this.prisma.$queryRaw`
      SELECT internal_lot_number FROM sample
      WHERE internal_lot_number LIKE 'A-%'
      ORDER BY CAST(SUBSTRING(internal_lot_number FROM 3) AS INTEGER) DESC
      LIMIT 1`;

    const lastLot = result[0]?.internal_lot_number ?? null;
    const lastSequence = lastLot ? Number(lastLot.replace('A-', '')) : initialSequence;
    const nextSequence = Number.isInteger(lastSequence) && lastSequence > 0 ? lastSequence + 1 : initialSequence + 1;

    return `A-${nextSequence}`;
  }
}

export { PENDING_STATUSES, CLASSIFICATION_PENDING_STATUSES };
