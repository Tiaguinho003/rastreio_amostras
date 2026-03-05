import { Prisma } from '@prisma/client';

function sourceToDb(source) {
  const map = {
    web: 'WEB',
    api: 'API',
    worker: 'WORKER'
  };
  return map[source];
}

function sourceFromDb(source) {
  const map = {
    WEB: 'web',
    API: 'api',
    WORKER: 'worker'
  };
  return map[source];
}

function moduleToDb(moduleName) {
  const map = {
    registration: 'REGISTRATION',
    classification: 'CLASSIFICATION',
    print: 'PRINT',
    commercial: 'COMMERCIAL',
    ocr: 'OCR'
  };
  return map[moduleName];
}

function moduleFromDb(moduleName) {
  const map = {
    REGISTRATION: 'registration',
    CLASSIFICATION: 'classification',
    PRINT: 'print',
    COMMERCIAL: 'commercial',
    OCR: 'ocr'
  };
  return map[moduleName];
}

function mapDbEventToDomain(event) {
  if (!event) {
    return null;
  }

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

export class PrismaEventStore {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async withTransaction(work) {
    return this.prisma.$transaction(async (tx) => {
      const txStore = new PrismaEventStoreTx(tx);
      return work(txStore);
    });
  }

  async findEventById(eventId) {
    const event = await this.prisma.sampleEvent.findUnique({
      where: { eventId }
    });

    return mapDbEventToDomain(event);
  }

  async findEventByIdempotency(sampleId, idempotencyScope, idempotencyKey) {
    const event = await this.prisma.sampleEvent.findFirst({
      where: {
        sampleId,
        idempotencyScope,
        idempotencyKey
      },
      orderBy: { sequenceNumber: 'desc' }
    });

    return mapDbEventToDomain(event);
  }

  async findEventByPrintAttempt(sampleId, printAction, attemptNumber) {
    const rows = await this.prisma.$queryRaw`
      SELECT event_id
      FROM sample_event
      WHERE sample_id = ${sampleId}::uuid
        AND event_type IN ('QR_PRINT_REQUESTED', 'QR_REPRINT_REQUESTED')
        AND payload->>'printAction' = ${printAction}
        AND (payload->>'attemptNumber')::int = ${attemptNumber}
      ORDER BY sequence_number DESC
      LIMIT 1
    `;

    if (!rows[0]?.event_id) {
      return null;
    }

    return this.findEventById(rows[0].event_id);
  }
}

class PrismaEventStoreTx {
  constructor(tx) {
    this.tx = tx;
  }

  async getSampleForUpdate(sampleId) {
    const rows = await this.tx.$queryRaw`
      SELECT *
      FROM sample
      WHERE id = ${sampleId}::uuid
      FOR UPDATE
    `;

    if (!rows.length) {
      return null;
    }

    return this.tx.sample.findUnique({
      where: { id: sampleId }
    });
  }

  async findEventByIdempotency(sampleId, idempotencyScope, idempotencyKey) {
    return this.tx.sampleEvent.findFirst({
      where: {
        sampleId,
        idempotencyScope,
        idempotencyKey
      },
      orderBy: { sequenceNumber: 'desc' }
    });
  }

  async findEventByPrintAttempt(sampleId, printAction, attemptNumber) {
    const rows = await this.tx.$queryRaw`
      SELECT event_id
      FROM sample_event
      WHERE sample_id = ${sampleId}::uuid
        AND event_type IN ('QR_PRINT_REQUESTED', 'QR_REPRINT_REQUESTED')
        AND payload->>'printAction' = ${printAction}
        AND (payload->>'attemptNumber')::int = ${attemptNumber}
      ORDER BY sequence_number DESC
      LIMIT 1
    `;

    if (!rows[0]?.event_id) {
      return null;
    }

    return this.tx.sampleEvent.findUnique({
      where: { eventId: rows[0].event_id }
    });
  }

  async createSample(data) {
    return this.tx.sample.create({ data });
  }

  async updateSampleByVersion(sampleId, expectedVersion, data) {
    const result = await this.tx.sample.updateMany({
      where: {
        id: sampleId,
        version: expectedVersion
      },
      data
    });

    if (result.count === 0) {
      return null;
    }

    return this.tx.sample.findUnique({ where: { id: sampleId } });
  }

  async updateSample(sampleId, data) {
    return this.tx.sample.update({
      where: { id: sampleId },
      data
    });
  }

  async createAttachmentFromEvent(event) {
    const payload = event.payload;
    const kind = payload.kind === 'CLASSIFICATION_PHOTO' ? 'CLASSIFICATION_PHOTO' : 'ARRIVAL_PHOTO';
    const safeFileName =
      typeof payload.fileName === 'string' && payload.fileName.length > 0
        ? payload.fileName
        : `${payload.attachmentId}.bin`;
    const storagePath =
      typeof payload.storagePath === 'string' && payload.storagePath.length > 0
        ? payload.storagePath
        : `samples/${event.sampleId}/${payload.attachmentId}-${safeFileName}`;

    const existing = await this.tx.sampleAttachment.findFirst({
      where: {
        sampleId: event.sampleId,
        kind
      }
    });

    if (existing) {
      await this.tx.sampleAttachment.delete({
        where: { id: existing.id }
      });
    }

    return this.tx.sampleAttachment.create({
      data: {
        id: payload.attachmentId,
        sampleId: event.sampleId,
        kind,
        storagePath,
        mimeType: payload.mimeType ?? null,
        sizeBytes: payload.sizeBytes ?? null,
        checksumSha256: payload.checksumSha256 ?? null
      }
    });
  }

  async createPrintJobFromRequestedEvent(event, requestedEventId) {
    return this.tx.printJob.create({
      data: {
        id: requestedEventId,
        sampleId: event.sampleId,
        printAction: event.payload.printAction,
        attemptNumber: event.payload.attemptNumber,
        status: 'PENDING',
        printerId: event.payload.printerId ?? null,
        error: null,
        requestedEventId,
        resultEventId: null
      }
    });
  }

  async completePrintJobFromResultEvent(event, resultEventId) {
    const status = event.eventType === 'QR_PRINTED' ? 'SUCCESS' : 'FAILED';
    const updateResult = await this.tx.printJob.updateMany({
      where: {
        sampleId: event.sampleId,
        printAction: event.payload.printAction,
        attemptNumber: event.payload.attemptNumber,
        resultEventId: null
      },
      data: {
        status,
        printerId: event.payload.printerId ?? null,
        error: event.eventType === 'QR_PRINT_FAILED' ? event.payload.error : null,
        resultEventId
      }
    });

    if (updateResult.count === 0) {
      return null;
    }

    return this.tx.printJob.findUnique({
      where: {
        sampleId_printAction_attemptNumber: {
          sampleId: event.sampleId,
          printAction: event.payload.printAction,
          attemptNumber: event.payload.attemptNumber
        }
      }
    });
  }

  async insertEvent(event) {
    return this.tx.sampleEvent.create({
      data: {
        eventId: event.eventId,
        sampleId: event.sampleId,
        sequenceNumber: event.sequenceNumber,
        eventType: event.eventType,
        schemaVersion: event.schemaVersion,
        occurredAt: new Date(event.occurredAt),
        actorType: event.actorType,
        actorUserId: event.actorUserId,
        source: sourceToDb(event.source),
        payload: event.payload,
        requestId: event.requestId,
        correlationId: event.correlationId,
        causationId: event.causationId,
        idempotencyScope: event.idempotencyScope ?? null,
        idempotencyKey: event.idempotencyKey ?? null,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        metadataModule: moduleToDb(event.metadata.module),
        metadataIp: event.metadata.ip,
        metadataUserAgent: event.metadata.userAgent
      }
    });
  }

  mapEvent(record) {
    return mapDbEventToDomain(record);
  }
}

export function isPrismaUniqueViolation(error) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
