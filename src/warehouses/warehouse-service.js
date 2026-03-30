import { randomUUID } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';
import {
  assertAuthenticatedActor,
  buildAuditContext,
  buildWarehouseAuditPayload,
  buildWarehouseAuditState,
  buildWarehouseListPage,
  canonicalizeWarehouseName,
  normalizeAuditListInput,
  normalizeCreateWarehouseInput,
  normalizeListWarehousesInput,
  normalizeLookupWarehousesInput,
  normalizeStatusReasonInput,
  normalizeUpdateWarehouseInput,
  toWarehouseAuditEventResponse,
  toWarehouseSummary,
  WAREHOUSE_AUDIT_EVENT_TYPES,
  WAREHOUSE_STATUSES
} from './warehouse-support.js';

const WAREHOUSE_SUMMARY_SELECT = {
  id: true,
  name: true,
  nameCanonical: true,
  address: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { samples: true }
  }
};

const WAREHOUSE_DETAIL_SELECT = {
  id: true,
  name: true,
  nameCanonical: true,
  address: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true
};

const WAREHOUSE_FOR_UPDATE_SELECT = {
  id: true,
  name: true,
  nameCanonical: true,
  address: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true
};

function buildWarehouseWhereFromSearch(search) {
  if (!search) {
    return null;
  }

  const trimmed = search.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return {
    name: { contains: trimmed, mode: 'insensitive' }
  };
}

export class WarehouseService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async resolveAuditActorUserId(tx, actorContext) {
    const actorUserId = actorContext?.actorUserId ?? null;
    if (!actorUserId) {
      return null;
    }

    const existingUser = await tx.user.findUnique({
      where: { id: actorUserId },
      select: { id: true }
    });

    return existingUser?.id ?? null;
  }

  async recordAuditEvent(tx, input) {
    const auditContext = buildAuditContext(input.actorContext);
    const actorUserId =
      input.actorUserId !== undefined
        ? input.actorUserId
        : await this.resolveAuditActorUserId(tx, input.actorContext);

    return tx.warehouseAuditEvent.create({
      data: {
        eventId: input.eventId ?? randomUUID(),
        targetWarehouseId: input.targetWarehouseId ?? null,
        actorUserId: actorUserId ?? null,
        eventType: input.eventType,
        payload: input.payload ?? {},
        reasonText: input.reasonText ?? null,
        requestId: auditContext.requestId,
        correlationId: auditContext.correlationId,
        metadataIp: auditContext.metadataIp,
        metadataUserAgent: auditContext.metadataUserAgent
      }
    });
  }

  async requireWarehouseById(tx, warehouseId) {
    const warehouse = await tx.warehouse.findUnique({
      where: { id: warehouseId },
      select: WAREHOUSE_DETAIL_SELECT
    });

    if (!warehouse) {
      throw new HttpError(404, 'Warehouse not found', {
        code: 'WAREHOUSE_NOT_FOUND'
      });
    }

    return warehouse;
  }

  async requireWarehouseForUpdate(tx, warehouseId) {
    const warehouse = await tx.warehouse.findUnique({
      where: { id: warehouseId },
      select: WAREHOUSE_FOR_UPDATE_SELECT
    });

    if (!warehouse) {
      throw new HttpError(404, 'Warehouse not found', {
        code: 'WAREHOUSE_NOT_FOUND'
      });
    }

    return warehouse;
  }

  async assertNameAvailable(tx, nameCanonical, { excludeWarehouseId = null } = {}) {
    const existing = await tx.warehouse.findFirst({
      where: {
        nameCanonical,
        ...(excludeWarehouseId
          ? { id: { not: excludeWarehouseId } }
          : {})
      },
      select: { id: true }
    });

    if (existing) {
      throw new HttpError(409, 'Um armazem com este nome ja existe', {
        code: 'WAREHOUSE_NAME_ALREADY_EXISTS'
      });
    }
  }

  // ── CRUD (admin) ──────────────────────────────────────────────────

  async listWarehouses(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list warehouses');

    const { page, limit, search, status } = normalizeListWarehousesInput(input);
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status } : {}),
      ...(buildWarehouseWhereFromSearch(search) ?? {})
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.warehouse.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        select: WAREHOUSE_SUMMARY_SELECT
      }),
      this.prisma.warehouse.count({ where })
    ]);

    return {
      items: items.map((item) => toWarehouseSummary(item)),
      page: buildWarehouseListPage(total, page, limit)
    };
  }

  async getWarehouse(warehouseId, actorContext) {
    assertAuthenticatedActor(actorContext, 'get warehouse');

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await this.requireWarehouseById(tx, warehouseId);
      return {
        warehouse: toWarehouseSummary(warehouse)
      };
    });
  }

  async createWarehouse(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'create warehouse');
    const normalized = normalizeCreateWarehouseInput(input);

    return this.prisma.$transaction(async (tx) => {
      await this.assertNameAvailable(tx, normalized.nameCanonical);

      const created = await tx.warehouse.create({
        data: {
          id: randomUUID(),
          ...normalized
        },
        select: WAREHOUSE_SUMMARY_SELECT
      });

      await this.recordAuditEvent(tx, {
        targetWarehouseId: created.id,
        actorContext: actor,
        eventType: WAREHOUSE_AUDIT_EVENT_TYPES.WAREHOUSE_CREATED,
        payload: {
          after: buildWarehouseAuditState(created)
        }
      });

      return {
        warehouse: toWarehouseSummary(created)
      };
    });
  }

  async updateWarehouse(warehouseId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'update warehouse');

    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireWarehouseForUpdate(tx, warehouseId);
      const { data: normalized, reasonText } = normalizeUpdateWarehouseInput(input, current);

      await this.assertNameAvailable(tx, normalized.nameCanonical, {
        excludeWarehouseId: current.id
      });

      const before = buildWarehouseAuditState(current);
      const afterCandidate = buildWarehouseAuditState({
        ...current,
        ...normalized
      });
      const auditPayload = buildWarehouseAuditPayload(before, afterCandidate);
      if (Object.keys(auditPayload.diff.after).length === 0) {
        throw new HttpError(409, 'Nenhuma alteracao detectada no armazem');
      }

      const updated = await tx.warehouse.update({
        where: { id: current.id },
        data: normalized,
        select: WAREHOUSE_SUMMARY_SELECT
      });

      const beforeName = current.name;
      const afterName = updated.name;
      if (beforeName !== afterName && afterName) {
        await tx.$executeRaw`
          UPDATE "sample"
          SET "declared_warehouse" = ${afterName}
          WHERE "warehouse_id" = ${updated.id}::uuid
            AND "declared_warehouse" IS DISTINCT FROM ${afterName}
        `;
      }

      await this.recordAuditEvent(tx, {
        targetWarehouseId: updated.id,
        actorContext: actor,
        eventType: WAREHOUSE_AUDIT_EVENT_TYPES.WAREHOUSE_UPDATED,
        reasonText,
        payload: auditPayload
      });

      return {
        warehouse: toWarehouseSummary(updated)
      };
    });
  }

  async countWarehouseUsage(tx, warehouseId) {
    const linkedSamples = await tx.sample.count({
      where: { warehouseId, status: { not: 'INVALIDATED' } }
    });

    return { linkedSamples };
  }

  async getWarehouseImpact(warehouseId, actorContext) {
    assertAuthenticatedActor(actorContext, 'get warehouse impact');

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await this.requireWarehouseById(tx, warehouseId);
      const usage = await this.countWarehouseUsage(tx, warehouseId);

      return {
        warehouse: {
          id: warehouse.id,
          name: warehouse.name,
          status: warehouse.status
        },
        usage
      };
    });
  }

  async inactivateWarehouse(warehouseId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'inactivate warehouse');
    const { reasonText } = normalizeStatusReasonInput(input);

    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireWarehouseForUpdate(tx, warehouseId);

      if (current.status === WAREHOUSE_STATUSES.INACTIVE) {
        throw new HttpError(409, 'Armazem ja esta inativo', {
          code: 'WAREHOUSE_ALREADY_INACTIVE'
        });
      }

      const usage = await this.countWarehouseUsage(tx, warehouseId);

      const updated = await tx.warehouse.update({
        where: { id: current.id },
        data: { status: WAREHOUSE_STATUSES.INACTIVE },
        select: WAREHOUSE_SUMMARY_SELECT
      });

      await this.recordAuditEvent(tx, {
        targetWarehouseId: updated.id,
        actorContext: actor,
        eventType: WAREHOUSE_AUDIT_EVENT_TYPES.WAREHOUSE_INACTIVATED,
        reasonText,
        payload: {
          before: { status: WAREHOUSE_STATUSES.ACTIVE },
          after: { status: WAREHOUSE_STATUSES.INACTIVE },
          usage
        }
      });

      return {
        warehouse: toWarehouseSummary(updated)
      };
    });
  }

  async reactivateWarehouse(warehouseId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'reactivate warehouse');
    const { reasonText } = normalizeStatusReasonInput(input);

    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireWarehouseForUpdate(tx, warehouseId);

      if (current.status === WAREHOUSE_STATUSES.ACTIVE) {
        throw new HttpError(409, 'Armazem ja esta ativo', {
          code: 'WAREHOUSE_ALREADY_ACTIVE'
        });
      }

      const updated = await tx.warehouse.update({
        where: { id: current.id },
        data: { status: WAREHOUSE_STATUSES.ACTIVE },
        select: WAREHOUSE_SUMMARY_SELECT
      });

      await this.recordAuditEvent(tx, {
        targetWarehouseId: updated.id,
        actorContext: actor,
        eventType: WAREHOUSE_AUDIT_EVENT_TYPES.WAREHOUSE_REACTIVATED,
        reasonText,
        payload: {
          before: { status: WAREHOUSE_STATUSES.INACTIVE },
          after: { status: WAREHOUSE_STATUSES.ACTIVE }
        }
      });

      return {
        warehouse: toWarehouseSummary(updated)
      };
    });
  }

  // ── Lookup (qualquer usuario autenticado) ─────────────────────────

  async lookupWarehouses(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'lookup warehouses');
    const { search, limit } = normalizeLookupWarehousesInput(input);

    const where = {
      status: WAREHOUSE_STATUSES.ACTIVE,
      ...(buildWarehouseWhereFromSearch(search) ?? {})
    };

    const items = await this.prisma.warehouse.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit,
      select: WAREHOUSE_SUMMARY_SELECT
    });

    return {
      items: items.map((item) => toWarehouseSummary(item))
    };
  }

  // ── Resolve-or-create (para registro de amostra) ──────────────────

  async resolveOrCreateWarehouse(name, actorContext) {
    const trimmedName = String(name ?? '').trim();
    if (trimmedName.length === 0) {
      return null;
    }

    const nameCanonical = canonicalizeWarehouseName(trimmedName);
    if (nameCanonical.length === 0) {
      return null;
    }

    const existing = await this.prisma.warehouse.findUnique({
      where: { nameCanonical },
      select: { id: true, name: true, status: true }
    });

    if (existing) {
      return {
        warehouseId: existing.id,
        warehouseName: existing.name
      };
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const raceCheck = await tx.warehouse.findUnique({
          where: { nameCanonical },
          select: { id: true, name: true }
        });

        if (raceCheck) {
          return { warehouseId: raceCheck.id, warehouseName: raceCheck.name };
        }

        const created = await tx.warehouse.create({
          data: {
            id: randomUUID(),
            name: trimmedName,
            nameCanonical,
            address: null,
            phone: null
          },
          select: { id: true, name: true }
        });

        await this.recordAuditEvent(tx, {
          targetWarehouseId: created.id,
          actorContext,
          eventType: WAREHOUSE_AUDIT_EVENT_TYPES.WAREHOUSE_CREATED,
          payload: {
            after: { name: created.name, address: null, phone: null, status: 'ACTIVE' },
            autoCreated: true
          }
        });

        return { warehouseId: created.id, warehouseName: created.name };
      });

      return result;
    } catch (error) {
      if (isNameUniqueConflict(error)) {
        const fallback = await this.prisma.warehouse.findUnique({
          where: { nameCanonical },
          select: { id: true, name: true }
        });

        if (fallback) {
          return { warehouseId: fallback.id, warehouseName: fallback.name };
        }
      }

      throw error;
    }
  }

  // ── Resolve por ID (para validacao) ───────────────────────────────

  async resolveWarehouseById(warehouseId) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, name: true, status: true }
    });

    if (!warehouse) {
      throw new HttpError(422, 'warehouseId nao referencia um armazem existente', {
        code: 'WAREHOUSE_NOT_FOUND',
        field: 'warehouseId'
      });
    }

    if (warehouse.status !== WAREHOUSE_STATUSES.ACTIVE) {
      throw new HttpError(422, 'warehouseId deve referenciar um armazem ativo', {
        code: 'WAREHOUSE_INACTIVE',
        field: 'warehouseId'
      });
    }

    return {
      warehouseId: warehouse.id,
      warehouseName: warehouse.name
    };
  }

  // ── Audit events ──────────────────────────────────────────────────

  async listAuditEvents(warehouseId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list warehouse audit events');

    const { page, limit } = normalizeAuditListInput(input);
    const skip = (page - 1) * limit;

    return this.prisma.$transaction(async (tx) => {
      await this.requireWarehouseById(tx, warehouseId);

      const where = { targetWarehouseId: warehouseId };

      const [items, total] = await Promise.all([
        tx.warehouseAuditEvent.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { eventId: 'desc' }],
          skip,
          take: limit,
          include: {
            actorUser: {
              select: { id: true, fullName: true, username: true }
            },
            targetWarehouse: {
              select: { id: true, name: true, status: true }
            }
          }
        }),
        tx.warehouseAuditEvent.count({ where })
      ]);

      return {
        items: items.map((item) => toWarehouseAuditEventResponse(item)),
        page: buildWarehouseListPage(total, page, limit)
      };
    });
  }
}

function isNameUniqueConflict(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return message.includes('name_canonical') || message.includes('uq_warehouse_name_canonical');
}
