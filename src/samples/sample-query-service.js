import { HttpError } from '../contracts/errors.js';

const PENDING_STATUSES = [
  'PHYSICAL_RECEIVED',
  'REGISTRATION_IN_PROGRESS',
  'QR_PENDING_PRINT',
  'CLASSIFICATION_IN_PROGRESS'
];
const PRINT_PENDING_STATUSES = ['REGISTRATION_CONFIRMED', 'QR_PENDING_PRINT'];
const CLASSIFICATION_PENDING_STATUSES = ['QR_PRINTED'];
const CLASSIFICATION_IN_PROGRESS_STATUSES = ['CLASSIFICATION_IN_PROGRESS'];
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
const MAX_QR_PARTS = 64;
const UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const INTERNAL_LOT_PATTERN = 'AM-\\d{4}-\\d{6}';

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
    OCR: 'ocr'
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

function mapSample(row) {
  if (!row) {
    return null;
  }

  const latestClassificationData = toObjectOrNull(row.latestClassificationData);

  return {
    id: row.id,
    internalLotNumber: row.internalLotNumber,
    status: row.status,
    version: row.version,
    lastEventSequence: row.lastEventSequence,
    declared: {
      owner: row.declaredOwner,
      sacks: row.declaredSacks,
      harvest: row.declaredHarvest,
      originLot: row.declaredOriginLot
    },
    labelPhotoCount: row.labelPhotoCount,
    latestClassification: {
      version: row.latestClassificationVersion,
      data: latestClassificationData,
      technical: {
        type: row.latestType,
        screen: row.latestScreen,
        defectsCount: row.latestDefectsCount,
        moisture: toNumberOrNull(row.latestMoisture),
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
    const sample = await this.prisma.sample.findUnique({ where: { id: sampleId } });
    return mapSample(sample);
  }

  async requireSample(sampleId) {
    const sample = await this.findSampleOrNull(sampleId);
    if (!sample) {
      throw new HttpError(404, `Sample ${sampleId} does not exist`);
    }
    return sample;
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
      take: 50
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

  async listSamples({ status = null, limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const safeOffset = Math.max(offset, 0);

    const where = status ? { status } : undefined;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sample.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: safeOffset,
        take: safeLimit
      }),
      this.prisma.sample.count({ where })
    ]);

    return {
      items: rows.map(mapSample),
      page: {
        limit: safeLimit,
        offset: safeOffset,
        total
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
    const rows = await this.prisma.sampleEvent.findMany({
      where: {
        sampleId,
        eventType: { in: ['QR_PRINT_REQUESTED', 'QR_REPRINT_REQUESTED'] }
      },
      orderBy: { sequenceNumber: 'asc' },
      select: { payload: true }
    });

    let maxAttempt = 0;
    for (const row of rows) {
      const payload = row.payload;
      if (!payload || typeof payload !== 'object') {
        continue;
      }

      if (payload.printAction !== printAction) {
        continue;
      }

      const attempt = parseAttemptNumberFromPayload(payload);
      if (attempt && attempt > maxAttempt) {
        maxAttempt = attempt;
      }
    }

    return maxAttempt + 1;
  }

  async getSampleDetail(sampleId, options = {}) {
    const sample = await this.requireSample(sampleId);
    const [attachments, events] = await Promise.all([
      this.listAttachments(sampleId),
      this.listSampleEvents(sampleId, { limit: options.eventLimit ?? 200 })
    ]);

    return {
      sample,
      attachments,
      events
    };
  }

  async getDashboardPending() {
    const [
      grouped,
      agedPending,
      printPendingGrouped,
      printPendingRows,
      classificationPendingGrouped,
      classificationPendingRows,
      classificationInProgressGrouped,
      classificationInProgressRows,
      latestRegistrationRows,
      latestRegistrationTotal,
      todayReceivedRows
    ] = await this.prisma.$transaction([
      this.prisma.sample.groupBy({
        by: ['status'],
        where: {
          status: {
            in: PENDING_STATUSES
          }
        },
        _count: { status: true }
      }),
      this.prisma.sample.findMany({
        where: {
          status: { in: PENDING_STATUSES }
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: DASHBOARD_LIST_LIMIT
      }),
      this.prisma.sample.groupBy({
        by: ['status'],
        where: {
          status: {
            in: PRINT_PENDING_STATUSES
          }
        },
        _count: { status: true }
      }),
      this.prisma.sample.findMany({
        where: {
          status: {
            in: PRINT_PENDING_STATUSES
          }
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: DASHBOARD_LIST_LIMIT
      }),
      this.prisma.sample.groupBy({
        by: ['status'],
        where: {
          status: {
            in: CLASSIFICATION_PENDING_STATUSES
          }
        },
        _count: { status: true }
      }),
      this.prisma.sample.findMany({
        where: {
          status: { in: CLASSIFICATION_PENDING_STATUSES }
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: DASHBOARD_LIST_LIMIT
      }),
      this.prisma.sample.groupBy({
        by: ['status'],
        where: {
          status: {
            in: CLASSIFICATION_IN_PROGRESS_STATUSES
          }
        },
        _count: { status: true }
      }),
      this.prisma.sample.findMany({
        where: {
          status: { in: CLASSIFICATION_IN_PROGRESS_STATUSES }
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: DASHBOARD_LIST_LIMIT
      }),
      this.prisma.sample.findMany({
        where: {
          status: { in: LATEST_REGISTRATION_STATUSES }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: DASHBOARD_LIST_LIMIT
      }),
      this.prisma.sample.count({
        where: {
          status: { in: LATEST_REGISTRATION_STATUSES }
        }
      }),
      this.prisma.$queryRaw`
        SELECT COUNT(*)::INTEGER AS total
        FROM "sample" s
        WHERE (s."created_at" AT TIME ZONE ${DASHBOARD_BUSINESS_TIMEZONE})::DATE
          = (NOW() AT TIME ZONE ${DASHBOARD_BUSINESS_TIMEZONE})::DATE
          AND (s."created_at" AT TIME ZONE ${DASHBOARD_BUSINESS_TIMEZONE})::TIME >= TIME '07:00:00'
          AND (s."created_at" AT TIME ZONE ${DASHBOARD_BUSINESS_TIMEZONE})::TIME <= TIME '18:00:00'
      `
    ]);

    const pendingCounts = {
      PHYSICAL_RECEIVED: 0,
      REGISTRATION_IN_PROGRESS: 0,
      QR_PENDING_PRINT: 0,
      CLASSIFICATION_IN_PROGRESS: 0
    };

    for (const row of grouped) {
      pendingCounts[row.status] = row._count.status;
    }

    const totalPending = Object.values(pendingCounts).reduce((acc, value) => acc + value, 0);

    const classificationPendingCounts = {
      QR_PRINTED: 0
    };

    for (const row of classificationPendingGrouped) {
      classificationPendingCounts[row.status] = row._count.status;
    }

    const classificationPendingTotal = Object.values(classificationPendingCounts).reduce(
      (acc, value) => acc + value,
      0
    );

    const classificationInProgressCounts = {
      CLASSIFICATION_IN_PROGRESS: 0
    };

    for (const row of classificationInProgressGrouped) {
      classificationInProgressCounts[row.status] = row._count.status;
    }

    const classificationInProgressTotal = Object.values(classificationInProgressCounts).reduce(
      (acc, value) => acc + value,
      0
    );

    const printPendingCounts = {
      REGISTRATION_CONFIRMED: 0,
      QR_PENDING_PRINT: 0
    };

    for (const row of printPendingGrouped) {
      printPendingCounts[row.status] = row._count.status;
    }

    const printPendingTotal = Object.values(printPendingCounts).reduce((acc, value) => acc + value, 0);
    const todayReceivedTotal = toIntegerOrZero(todayReceivedRows?.[0]?.total);

    return {
      pendingCounts,
      totalPending,
      todayReceivedTotal,
      oldestPending: agedPending.map(mapSample),
      printPending: {
        counts: printPendingCounts,
        total: printPendingTotal,
        items: printPendingRows.map(mapSample)
      },
      classificationPending: {
        counts: classificationPendingCounts,
        total: classificationPendingTotal,
        items: classificationPendingRows.map(mapSample)
      },
      classificationInProgress: {
        counts: classificationInProgressCounts,
        total: classificationInProgressTotal,
        items: classificationInProgressRows.map(mapSample)
      },
      latestRegistrations: {
        total: latestRegistrationTotal,
        items: latestRegistrationRows.map(mapSample)
      }
    };
  }

  async getNextInternalLotNumber(year = new Date().getUTCFullYear()) {
    const yearString = String(year);
    const prefix = `AM-${yearString}-`;

    const lastSample = await this.prisma.sample.findFirst({
      where: {
        internalLotNumber: {
          startsWith: prefix
        }
      },
      orderBy: { internalLotNumber: 'desc' },
      select: { internalLotNumber: true }
    });

    const lastLot = lastSample?.internalLotNumber ?? null;
    const lastSequence = lastLot ? Number(lastLot.slice(-6)) : 0;
    const nextSequence = Number.isInteger(lastSequence) && lastSequence > 0 ? lastSequence + 1 : 1;
    const padded = String(nextSequence).padStart(6, '0');

    return `AM-${yearString}-${padded}`;
  }
}

export { PENDING_STATUSES, CLASSIFICATION_PENDING_STATUSES };
