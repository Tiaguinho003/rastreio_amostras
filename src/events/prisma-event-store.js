import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

// Fechamento (Fase B.2): chave fixa do advisory lock transacional que serializa
// a geracao do numero do contrato (contract_seq). Lock por transacao (liberado
// no commit/rollback) -> duas vendas concorrentes nunca colidem no MAX+1, e a
// venda nunca falha por corrida de numero. Valor arbitrario e estavel.
const SALE_CONTRACT_SEQ_LOCK_KEY = 831202606;

function sourceToDb(source) {
  const map = {
    web: 'WEB',
    api: 'API',
    worker: 'WORKER',
  };
  return map[source];
}

function sourceFromDb(source) {
  const map = {
    WEB: 'web',
    API: 'api',
    WORKER: 'worker',
  };
  return map[source];
}

function moduleToDb(moduleName) {
  const map = {
    registration: 'REGISTRATION',
    classification: 'CLASSIFICATION',
    print: 'PRINT',
    commercial: 'COMMERCIAL',
  };
  return map[moduleName];
}

function moduleFromDb(moduleName) {
  const map = {
    REGISTRATION: 'registration',
    CLASSIFICATION: 'classification',
    PRINT: 'print',
    COMMERCIAL: 'commercial',
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
      userAgent: event.metadataUserAgent,
    },
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
      where: { eventId },
    });

    return mapDbEventToDomain(event);
  }

  async findEventByIdempotency(sampleId, idempotencyScope, idempotencyKey) {
    const event = await this.prisma.sampleEvent.findFirst({
      where: {
        sampleId,
        idempotencyScope,
        idempotencyKey,
      },
      orderBy: { sequenceNumber: 'desc' },
    });

    return mapDbEventToDomain(event);
  }

  async findEventByPrintAttempt(sampleId, attemptNumber) {
    const rows = await this.prisma.$queryRaw`
      SELECT event_id
      FROM sample_event
      WHERE sample_id = ${sampleId}::uuid
        AND event_type = 'QR_PRINT_REQUESTED'
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
      where: { id: sampleId },
    });
  }

  async findEventByIdempotency(sampleId, idempotencyScope, idempotencyKey) {
    return this.tx.sampleEvent.findFirst({
      where: {
        sampleId,
        idempotencyScope,
        idempotencyKey,
      },
      orderBy: { sequenceNumber: 'desc' },
    });
  }

  async findEventByPrintAttempt(sampleId, attemptNumber) {
    const rows = await this.tx.$queryRaw`
      SELECT event_id
      FROM sample_event
      WHERE sample_id = ${sampleId}::uuid
        AND event_type = 'QR_PRINT_REQUESTED'
        AND (payload->>'attemptNumber')::int = ${attemptNumber}
      ORDER BY sequence_number DESC
      LIMIT 1
    `;

    if (!rows[0]?.event_id) {
      return null;
    }

    return this.tx.sampleEvent.findUnique({
      where: { eventId: rows[0].event_id },
    });
  }

  async createSample(data) {
    return this.tx.sample.create({ data });
  }

  async updateSampleByVersion(sampleId, expectedVersion, data) {
    const result = await this.tx.sample.updateMany({
      where: {
        id: sampleId,
        version: expectedVersion,
      },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.tx.sample.findUnique({ where: { id: sampleId } });
  }

  async updateSample(sampleId, data) {
    return this.tx.sample.update({
      where: { id: sampleId },
      data,
    });
  }

  async createAttachmentFromEvent(event) {
    const payload = event.payload;
    const kind = 'CLASSIFICATION_PHOTO';
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
        kind,
      },
    });

    if (existing) {
      await this.tx.sampleAttachment.delete({
        where: { id: existing.id },
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
        checksumSha256: payload.checksumSha256 ?? null,
      },
    });
  }

  async createPrintJobFromRequestedEvent(event, requestedEventId) {
    return this.tx.printJob.create({
      data: {
        id: requestedEventId,
        sampleId: event.sampleId,
        attemptNumber: event.payload.attemptNumber,
        status: 'PENDING',
        printerId: event.payload.printerId ?? null,
        error: null,
        requestedEventId,
        resultEventId: null,
      },
    });
  }

  async findSampleMovement(sampleId, movementId) {
    return this.tx.sampleMovement.findFirst({
      where: {
        id: movementId,
        sampleId,
      },
    });
  }

  async createSampleMovementFromEvent(event) {
    const payload = event.payload;
    return this.tx.sampleMovement.create({
      data: {
        id: payload.movementId,
        sampleId: event.sampleId,
        movementType: payload.movementType,
        status: 'ACTIVE',
        buyerClientId: payload.buyerClientId ?? null,
        buyerUnitId: payload.buyerUnitId ?? null,
        quantitySacks: payload.quantitySacks,
        movementDate: new Date(payload.movementDate),
        notes: payload.notes ?? null,
        reasonText: payload.lossReasonText ?? null,
        buyerClientSnapshot: payload.buyerClientSnapshot ?? null,
        buyerUnitSnapshot: payload.buyerUnitSnapshot ?? null,
        version: 1,
        cancelledAt: null,
      },
    });
  }

  async updateSampleMovementFromEvent(event) {
    const payload = event.payload;
    const movementId = payload.movementId;
    const after = payload.after ?? {};

    const existing = await this.findSampleMovement(event.sampleId, movementId);
    if (!existing) {
      return null;
    }

    const data = {
      ...(Object.prototype.hasOwnProperty.call(after, 'movementType')
        ? { movementType: after.movementType }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(after, 'buyerClientId')
        ? { buyerClientId: after.buyerClientId ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(after, 'buyerUnitId')
        ? { buyerUnitId: after.buyerUnitId ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(after, 'quantitySacks')
        ? { quantitySacks: after.quantitySacks }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(after, 'movementDate')
        ? { movementDate: new Date(after.movementDate) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(after, 'notes')
        ? { notes: after.notes ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(after, 'lossReasonText')
        ? { reasonText: after.lossReasonText ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(after, 'buyerClientSnapshot')
        ? { buyerClientSnapshot: after.buyerClientSnapshot ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(after, 'buyerUnitSnapshot')
        ? { buyerUnitSnapshot: after.buyerUnitSnapshot ?? null }
        : {}),
      version: { increment: 1 },
    };

    return this.tx.sampleMovement.update({
      where: { id: movementId },
      data,
    });
  }

  async cancelSampleMovementFromEvent(event) {
    const payload = event.payload;
    const existing = await this.findSampleMovement(event.sampleId, payload.movementId);
    if (!existing) {
      return null;
    }

    return this.tx.sampleMovement.update({
      where: { id: payload.movementId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(event.occurredAt),
        version: { increment: 1 },
      },
    });
  }

  async completePrintJobFromResultEvent(event, resultEventId) {
    const status = event.eventType === 'QR_PRINTED' ? 'SUCCESS' : 'FAILED';
    const updateResult = await this.tx.printJob.updateMany({
      where: {
        sampleId: event.sampleId,
        attemptNumber: event.payload.attemptNumber,
        resultEventId: null,
      },
      data: {
        status,
        printerId: event.payload.printerId ?? null,
        error: event.eventType === 'QR_PRINT_FAILED' ? event.payload.error : null,
        resultEventId,
      },
    });

    if (updateResult.count === 0) {
      return null;
    }

    return this.tx.printJob.findUnique({
      where: {
        sampleId_attemptNumber: {
          sampleId: event.sampleId,
          attemptNumber: event.payload.attemptNumber,
        },
      },
    });
  }

  // Liga A2.0: bulk insert de linhas em sample_blend_component dentro da
  // transação corrente. Usado por createBlend pra registrar composição da
  // liga atomicamente com os eventos REGISTRATION_CONFIRMED + BLEND_CREATED.
  async createBlendComponents(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { count: 0 };
    }
    return this.tx.sampleBlendComponent.createMany({
      data: rows.map((row) => ({
        id: row.id,
        sampleId: row.sampleId,
        originSampleId: row.originSampleId,
        contributedSacks: row.contributedSacks,
      })),
    });
  }

  // Liga A2.2: marca um sample como liga (isBlend=true) na mesma tx do
  // REGISTRATION_CONFIRMED + BLEND_CREATED. Não bumpa version (é apenas
  // a denormalização da existência de SampleBlendComponent).
  async markAsBlend(sampleId) {
    return this.tx.sample.update({
      where: { id: sampleId },
      data: { isBlend: true },
    });
  }

  // Etiqueta de Envio (fase 3): cria o SampleReportShare na mesma tx do evento
  // PHYSICAL_SAMPLE_SENT (appendEventBatch + beforeCommit), com sendEventId
  // apontando pro evento recém-criado. Tabela mutável, fora do event store.
  async createReportShare(row) {
    return this.tx.sampleReportShare.create({ data: row });
  }

  // Etiqueta de Envio (fase 6): revoga o share de um envio (D8) na mesma tx do
  // PHYSICAL_SAMPLE_SEND_CANCELLED. updateMany (nao .update) porque o envio pode
  // nao ter share (amostra nao-CLASSIFIED): 0 linhas e ok. Filtra revokedAt:null
  // pra nao sobrescrever uma revogacao anterior.
  async revokeReportShareBySendEvent(sendEventId, revokedAt) {
    return this.tx.sampleReportShare.updateMany({
      where: { sendEventId, revokedAt: null },
      data: { revokedAt },
    });
  }

  // Fechamento (Fase B.2): o contrato de venda a vista nasce na MESMA tx do
  // evento SALE_CREATED (appendEventBatch + beforeCommit), espelhando o
  // SampleReportShare. SaleContract e CRUD (fora do event store).

  // Aloca o proximo numero sequencial do contrato sob advisory lock
  // transacional. O lock serializa o MAX+1 entre vendas concorrentes; e
  // liberado no commit/rollback. Gaps sao aceitaveis (D15).
  async allocateNextContractSeq() {
    // $executeRaw (nao $queryRaw): pg_advisory_xact_lock devolve void, que o
    // $queryRaw nao consegue desserializar.
    await this.tx.$executeRaw`SELECT pg_advisory_xact_lock(${SALE_CONTRACT_SEQ_LOCK_KEY}::bigint)`;
    const rows = await this.tx.$queryRaw`
      SELECT COALESCE(MAX(contract_seq), 0) + 1 AS next FROM sale_contract
    `;
    return Number(rows[0].next);
  }

  async createSaleContract(row) {
    return this.tx.saleContract.create({ data: row });
  }

  async createSaleContractExport(row) {
    return this.tx.saleContractExport.create({ data: row });
  }

  async createSaleContractBrokers(rows) {
    if (!rows || rows.length === 0) {
      return { count: 0 };
    }
    return this.tx.saleContractBroker.createMany({ data: rows });
  }

  async loadBrokersByIds(ids) {
    if (!ids || ids.length === 0) {
      return [];
    }
    return this.tx.broker.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, status: true },
    });
  }

  // Cancelar a venda -> QUEBRA o contrato ligado ao movimento (D104):
  // EMITIDO/FINALIZADO -> WASH_OUT + motivo/data. Ja WASH_OUT (ou sem contrato)
  // -> no-op. O contrato NUNCA e apagado (o "Excluir" saiu na S72); o corretor
  // mantem a comissao (aparece no Financeiro/Espelho).
  async washoutSaleContractByMovement(
    movementId,
    { reason = null, at = null, actorUserId = null } = {}
  ) {
    const existing = await this.tx.saleContract.findFirst({
      where: { movementId },
      select: { id: true, status: true },
    });
    if (!existing || existing.status === 'WASH_OUT') {
      return null;
    }
    await this.tx.saleContract.update({
      where: { id: existing.id },
      data: {
        status: 'WASH_OUT',
        washoutReason: reason,
        washoutAt: at ?? new Date(),
        version: { increment: 1 },
      },
    });
    // Fase J (D123): marco WASH_OUT auditado (quem + quando + motivo) na MESMA
    // tx da quebra — cobre o caminho da venda a vista (cancel do movimento).
    await this.tx.saleContractStatusLog.create({
      data: {
        id: randomUUID(),
        saleContractId: existing.id,
        toStatus: 'WASH_OUT',
        reason,
        actorUserId,
      },
    });
    return { id: existing.id, action: 'WASH_OUT' };
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
        metadataUserAgent: event.metadata.userAgent,
      },
    });
  }

  mapEvent(record) {
    return mapDbEventToDomain(record);
  }
}

export function isPrismaUniqueViolation(error) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
