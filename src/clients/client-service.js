import { randomUUID } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';
import {
  CLIENT_AUDIT_EVENT_TYPES,
  CLIENT_LOOKUP_KINDS,
  CLIENT_REGISTRATION_STATUSES,
  CLIENT_STATUSES,
  assertAuthenticatedActor,
  buildAuditContext,
  buildClientAuditPayload,
  buildClientAuditState,
  buildClientDisplayName,
  buildClientListPage,
  buildRegistrationAuditState,
  normalizeAuditListInput,
  normalizeCreateClientInput,
  normalizeCreateRegistrationInput,
  normalizeListClientsInput,
  normalizeLookupClientsInput,
  normalizeStatusReasonInput,
  normalizeUpdateClientInput,
  normalizeUpdateRegistrationInput,
  readLimitQuery,
  readPageQuery,
  toClientAuditEventResponse,
  toClientRegistrationSummary,
  toClientSummary
} from './client-support.js';

const CLIENT_SUMMARY_SELECT = {
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
  status: true,
  createdAt: true,
  updatedAt: true,
  registrations: {
    where: {
      status: CLIENT_REGISTRATION_STATUSES.ACTIVE
    },
    select: {
      id: true,
      status: true,
      city: true,
      state: true
    },
    orderBy: { createdAt: 'asc' }
  },
  _count: {
    select: {
      registrations: true
    }
  }
};

const CLIENT_DETAIL_SELECT = {
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
  status: true,
  createdAt: true,
  updatedAt: true,
  registrations: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
  }
};

const REGISTRATION_SELECT = {
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
  complement: true,
  createdAt: true,
  updatedAt: true
};

function buildClientWhereFromSearch(search) {
  if (!search) {
    return undefined;
  }

  const numericSearch = Number.parseInt(search, 10);
  const digits = String(search).replace(/\D+/g, '');

  const or = [
    { fullName: { contains: search, mode: 'insensitive' } },
    { legalName: { contains: search, mode: 'insensitive' } },
    { tradeName: { contains: search, mode: 'insensitive' } },
    { cpf: { contains: search } },
    { cnpj: { contains: search } },
    { documentCanonical: { contains: digits.length > 0 ? digits : search.toLowerCase() } }
  ];

  if (Number.isInteger(numericSearch) && String(numericSearch) === search.trim()) {
    or.push({ code: numericSearch });
  }

  return { OR: or };
}

function parseExactCodeSearch(search) {
  if (typeof search !== 'string') {
    return null;
  }

  const trimmed = search.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return parsed;
}

function mapClientRow(row) {
  const activeRegistrations = Array.isArray(row.registrations)
    ? row.registrations.filter((registration) => registration.status === CLIENT_REGISTRATION_STATUSES.ACTIVE)
    : [];
  const activeRegistrationCount = activeRegistrations.length;
  const registrationCount =
    typeof row?._count?.registrations === 'number'
      ? row._count.registrations
      : Array.isArray(row.registrations)
        ? row.registrations.length
        : 0;
  const primaryRegistration = activeRegistrations[0] ?? null;

  return toClientSummary(row, {
    activeRegistrationCount,
    registrationCount,
    primaryCity: primaryRegistration?.city ?? null,
    primaryState: primaryRegistration?.state ?? null
  });
}

export class ClientService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async resolveAuditActorUserId(tx, actorContext) {
    const actorUserId = actorContext?.actorUserId ?? null;
    if (!actorUserId) {
      return null;
    }

    const existingUser = await tx.user.findUnique({
      where: {
        id: actorUserId
      },
      select: {
        id: true
      }
    });

    return existingUser?.id ?? null;
  }

  async recordAuditEvent(tx, input) {
    const auditContext = buildAuditContext(input.actorContext);
    const actorUserId =
      input.actorUserId !== undefined
        ? input.actorUserId
        : await this.resolveAuditActorUserId(tx, input.actorContext);

    return tx.clientAuditEvent.create({
      data: {
        eventId: input.eventId ?? randomUUID(),
        targetClientId: input.targetClientId ?? null,
        targetRegistrationId: input.targetRegistrationId ?? null,
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

  async resolveOwnerBinding({ ownerClientId, ownerRegistrationId = null }) {
    if (typeof ownerClientId !== 'string' || ownerClientId.length === 0) {
      throw new HttpError(422, 'ownerClientId is required for structured owner binding', {
        code: 'OWNER_CLIENT_REQUIRED'
      });
    }

    const client = await this.prisma.client.findUnique({
      where: { id: ownerClientId },
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
    });

    if (!client) {
      throw new HttpError(422, 'ownerClientId does not reference an existing client', {
        code: 'OWNER_CLIENT_NOT_FOUND',
        field: 'ownerClientId'
      });
    }

    if (client.status !== CLIENT_STATUSES.ACTIVE) {
      throw new HttpError(422, 'ownerClientId must reference an active client', {
        code: 'OWNER_CLIENT_INACTIVE',
        field: 'ownerClientId'
      });
    }

    if (!client.isSeller) {
      throw new HttpError(422, 'ownerClientId must reference a seller client', {
        code: 'OWNER_CLIENT_NOT_SELLER',
        field: 'ownerClientId'
      });
    }

    let registration = null;
    if (ownerRegistrationId !== null && ownerRegistrationId !== undefined) {
      registration = await this.prisma.clientRegistration.findFirst({
        where: {
          id: ownerRegistrationId,
          clientId: client.id
        },
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
      });

      if (!registration) {
        throw new HttpError(422, 'ownerRegistrationId must belong to ownerClientId', {
          code: 'OWNER_REGISTRATION_MISMATCH',
          field: 'ownerRegistrationId'
        });
      }

      if (registration.status !== CLIENT_REGISTRATION_STATUSES.ACTIVE) {
        throw new HttpError(422, 'ownerRegistrationId must reference an active registration', {
          code: 'OWNER_REGISTRATION_INACTIVE',
          field: 'ownerRegistrationId'
        });
      }
    }

    return {
      ownerClientId: client.id,
      ownerRegistrationId: registration?.id ?? null,
      displayName: buildClientDisplayName(client),
      ownerClient: toClientSummary(client),
      ownerRegistration: registration ? toClientRegistrationSummary(registration) : null
    };
  }

  async resolveBuyerBinding({ buyerClientId, buyerRegistrationId = null }) {
    if (typeof buyerClientId !== 'string' || buyerClientId.length === 0) {
      throw new HttpError(422, 'buyerClientId is required for sale movement', {
        code: 'BUYER_CLIENT_REQUIRED'
      });
    }

    const client = await this.prisma.client.findUnique({
      where: { id: buyerClientId },
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
    });

    if (!client) {
      throw new HttpError(422, 'buyerClientId does not reference an existing client', {
        code: 'BUYER_CLIENT_NOT_FOUND',
        field: 'buyerClientId'
      });
    }

    if (client.status !== CLIENT_STATUSES.ACTIVE) {
      throw new HttpError(422, 'buyerClientId must reference an active client', {
        code: 'BUYER_CLIENT_INACTIVE',
        field: 'buyerClientId'
      });
    }

    if (!client.isBuyer) {
      throw new HttpError(422, 'buyerClientId must reference a buyer client', {
        code: 'BUYER_CLIENT_NOT_BUYER',
        field: 'buyerClientId'
      });
    }

    let registration = null;
    if (buyerRegistrationId !== null && buyerRegistrationId !== undefined) {
      registration = await this.prisma.clientRegistration.findFirst({
        where: {
          id: buyerRegistrationId,
          clientId: client.id
        },
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
      });

      if (!registration) {
        throw new HttpError(422, 'buyerRegistrationId must belong to buyerClientId', {
          code: 'BUYER_REGISTRATION_MISMATCH',
          field: 'buyerRegistrationId'
        });
      }

      if (registration.status !== CLIENT_REGISTRATION_STATUSES.ACTIVE) {
        throw new HttpError(422, 'buyerRegistrationId must reference an active registration', {
          code: 'BUYER_REGISTRATION_INACTIVE',
          field: 'buyerRegistrationId'
        });
      }
    }

    return {
      buyerClientId: client.id,
      buyerRegistrationId: registration?.id ?? null,
      buyerClient: toClientSummary(client),
      buyerRegistration: registration ? toClientRegistrationSummary(registration) : null
    };
  }

  async resolveRecipientClient(recipientClientId) {
    if (typeof recipientClientId !== 'string' || recipientClientId.length === 0) {
      throw new HttpError(422, 'recipientClientId is required', {
        code: 'RECIPIENT_CLIENT_REQUIRED'
      });
    }

    const client = await this.prisma.client.findUnique({
      where: { id: recipientClientId },
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
    });

    if (!client) {
      throw new HttpError(422, 'recipientClientId does not reference an existing client', {
        code: 'RECIPIENT_CLIENT_NOT_FOUND',
        field: 'recipientClientId'
      });
    }

    if (client.status !== CLIENT_STATUSES.ACTIVE) {
      throw new HttpError(422, 'recipientClientId must reference an active client', {
        code: 'RECIPIENT_CLIENT_INACTIVE',
        field: 'recipientClientId'
      });
    }

    return toClientSummary(client);
  }

  async requireClientById(tx, clientId) {
    const client = await tx.client.findUnique({
      where: { id: clientId },
      select: CLIENT_DETAIL_SELECT
    });

    if (!client) {
      throw new HttpError(404, 'Client not found', {
        code: 'CLIENT_NOT_FOUND'
      });
    }

    return client;
  }

  async requireClientForUpdate(tx, clientId) {
    const client = await tx.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        code: true,
        personType: true,
        fullName: true,
        legalName: true,
        tradeName: true,
        cpf: true,
        cnpj: true,
        documentCanonical: true,
        phone: true,
        isBuyer: true,
        isSeller: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!client) {
      throw new HttpError(404, 'Client not found', {
        code: 'CLIENT_NOT_FOUND'
      });
    }

    return client;
  }

  async requireRegistrationById(tx, clientId, registrationId) {
    const registration = await tx.clientRegistration.findFirst({
      where: {
        id: registrationId,
        clientId
      },
      select: REGISTRATION_SELECT
    });

    if (!registration) {
      throw new HttpError(404, 'Client registration not found', {
        code: 'CLIENT_REGISTRATION_NOT_FOUND'
      });
    }

    return registration;
  }

  async assertDocumentAvailable(tx, documentCanonical, { excludeClientId = null } = {}) {
    const existing = await tx.client.findFirst({
      where: {
        documentCanonical,
        ...(excludeClientId
          ? {
              id: {
                not: excludeClientId
              }
            }
          : {})
      },
      select: {
        id: true
      }
    });

    if (existing) {
      throw new HttpError(409, 'Document already exists for another client', {
        code: 'CLIENT_DOCUMENT_ALREADY_EXISTS'
      });
    }
  }

  async assertRegistrationAvailable(tx, registrationNumberCanonical, { excludeRegistrationId = null } = {}) {
    const existing = await tx.clientRegistration.findFirst({
      where: {
        registrationNumberCanonical,
        ...(excludeRegistrationId
          ? {
              id: {
                not: excludeRegistrationId
              }
            }
          : {})
      },
      select: {
        id: true
      }
    });

    if (existing) {
      throw new HttpError(409, 'Registration number already exists', {
        code: 'CLIENT_REGISTRATION_ALREADY_EXISTS'
      });
    }
  }

  async listClients(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list clients');

    const { page, limit, search, status, personType, isBuyer, isSeller } = normalizeListClientsInput(input);
    const skip = (page - 1) * limit;

    const baseWhere = {
      ...(status ? { status } : {}),
      ...(personType ? { personType } : {}),
      ...(isBuyer === null ? {} : { isBuyer }),
      ...(isSeller === null ? {} : { isSeller })
    };

    const exactCodeSearch = parseExactCodeSearch(search);
    if (exactCodeSearch !== null) {
      const exactCodeWhere = {
        ...baseWhere,
        code: exactCodeSearch
      };

      const [items, total] = await this.prisma.$transaction([
        this.prisma.client.findMany({
          where: exactCodeWhere,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: limit,
          select: CLIENT_SUMMARY_SELECT
        }),
        this.prisma.client.count({ where: exactCodeWhere })
      ]);

      if (total > 0) {
        return {
          items: items.map((item) => mapClientRow(item)),
          page: buildClientListPage(total, page, limit)
        };
      }
    }

    const where = {
      ...baseWhere,
      ...(buildClientWhereFromSearch(search) ?? {})
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        select: CLIENT_SUMMARY_SELECT
      }),
      this.prisma.client.count({ where })
    ]);

    return {
      items: items.map((item) => mapClientRow(item)),
      page: buildClientListPage(total, page, limit)
    };
  }

  async lookupClients(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'lookup clients');
    const { search, kind, limit } = normalizeLookupClientsInput(input);

    const where = {
      status: CLIENT_STATUSES.ACTIVE,
      ...(kind === CLIENT_LOOKUP_KINDS.OWNER
        ? { isSeller: true }
        : kind === CLIENT_LOOKUP_KINDS.BUYER
          ? { isBuyer: true }
          : {}),
      ...(buildClientWhereFromSearch(search) ?? {})
    };

    const items = await this.prisma.client.findMany({
      where,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: limit,
      select: CLIENT_SUMMARY_SELECT
    });

    return {
      items: items.map((item) => mapClientRow(item))
    };
  }

  async getClient(clientId, actorContext) {
    assertAuthenticatedActor(actorContext, 'get client');

    return this.prisma.$transaction(async (tx) => {
      const client = await this.requireClientById(tx, clientId);
      return {
        client: mapClientRow(client),
        registrations: client.registrations.map((registration) => toClientRegistrationSummary(registration))
      };
    });
  }

  async createClient(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'create client');
    const normalized = normalizeCreateClientInput(input);

    return this.prisma.$transaction(async (tx) => {
      await this.assertDocumentAvailable(tx, normalized.documentCanonical);

      const created = await tx.client.create({
        data: {
          id: randomUUID(),
          ...normalized
        },
        select: CLIENT_SUMMARY_SELECT
      });

      await this.recordAuditEvent(tx, {
        targetClientId: created.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_CREATED,
        payload: {
          after: buildClientAuditState(created)
        }
      });

      return {
        client: mapClientRow(created)
      };
    });
  }

  async updateClient(clientId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'update client');

    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireClientForUpdate(tx, clientId);
      const normalized = normalizeUpdateClientInput(input, current);

      await this.assertDocumentAvailable(tx, normalized.data.documentCanonical, {
        excludeClientId: current.id
      });

      const before = buildClientAuditState(current);
      const afterCandidate = {
        ...before,
        ...buildClientAuditState({
          ...current,
          ...normalized.data
        })
      };
      const auditPayload = buildClientAuditPayload(before, afterCandidate);
      if (Object.keys(auditPayload.diff.after).length === 0) {
        throw new HttpError(409, 'No client changes detected');
      }

      const updated = await tx.client.update({
        where: { id: current.id },
        data: normalized.data,
        select: CLIENT_SUMMARY_SELECT
      });

      const beforeDisplayName = buildClientDisplayName(current);
      const afterDisplayName = buildClientDisplayName(updated);
      if (beforeDisplayName !== afterDisplayName && afterDisplayName) {
        await tx.$executeRaw`
          UPDATE "sample"
          SET "declared_owner" = ${afterDisplayName}
          WHERE "owner_client_id" = ${updated.id}::uuid
            AND "declared_owner" IS DISTINCT FROM ${afterDisplayName}
        `;
      }

      await this.recordAuditEvent(tx, {
        targetClientId: updated.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_UPDATED,
        reasonText: normalized.reasonText,
        payload: auditPayload
      });

      return {
        client: mapClientRow(updated)
      };
    });
  }

  async countClientUsage(tx, clientId) {
    const [ownedSamples, activeMovements, activeRegistrations] = await Promise.all([
      tx.sample.count({
        where: { ownerClientId: clientId, status: { not: 'INVALIDATED' } }
      }),
      tx.sampleMovement.count({
        where: { buyerClientId: clientId, status: 'ACTIVE' }
      }),
      tx.clientRegistration.count({
        where: { clientId, status: 'ACTIVE' }
      })
    ]);

    return { ownedSamples, activeMovements, activeRegistrations };
  }

  async countRegistrationUsage(tx, registrationId) {
    const [linkedSamples, linkedMovements] = await Promise.all([
      tx.sample.count({
        where: { ownerRegistrationId: registrationId, status: { not: 'INVALIDATED' } }
      }),
      tx.sampleMovement.count({
        where: { buyerRegistrationId: registrationId, status: 'ACTIVE' }
      })
    ]);

    return { linkedSamples, linkedMovements };
  }

  async getClientImpact(clientId, actorContext) {
    assertAuthenticatedActor(actorContext, 'check client impact');

    const client = await this.requireClientById(this.prisma, clientId);
    const usage = await this.countClientUsage(this.prisma, clientId);

    return {
      client: { id: client.id, displayName: buildClientDisplayName(client), status: client.status },
      usage
    };
  }

  async listClientSamples(clientId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list client samples');
    await this.requireClientById(this.prisma, clientId);

    const page = readPageQuery(input?.page, 1);
    const limit = readLimitQuery(input?.limit, { fallback: 10, max: 30 });
    const offset = (page - 1) * limit;

    const where = {
      ownerClientId: clientId,
      status: { not: 'INVALIDATED' }
    };

    // -- search by lot number --
    const search = typeof input?.search === 'string' ? input.search.trim() : '';
    if (search) {
      where.internalLotNumber = { contains: search, mode: 'insensitive' };
    }

    // -- buyer filter (samples with at least one ACTIVE SALE to matching buyer) --
    const buyer = typeof input?.buyer === 'string' ? input.buyer.trim() : '';
    if (buyer) {
      where.movements = {
        some: {
          movementType: 'SALE',
          status: 'ACTIVE',
          buyerClient: {
            OR: [
              { fullName: { contains: buyer, mode: 'insensitive' } },
              { legalName: { contains: buyer, mode: 'insensitive' } },
              { tradeName: { contains: buyer, mode: 'insensitive' } }
            ]
          }
        }
      };
    }

    // -- commercial status --
    const commercialStatus = typeof input?.commercialStatus === 'string' ? input.commercialStatus.trim() : '';
    if (commercialStatus) {
      where.commercialStatus = commercialStatus;
    }

    // -- harvest --
    const harvest = typeof input?.harvest === 'string' ? input.harvest.trim() : '';
    if (harvest) {
      where.declaredHarvest = harvest;
    }

    // -- sacks range --
    const sacksMin = input?.sacksMin != null && input.sacksMin !== '' ? Number(input.sacksMin) : null;
    const sacksMax = input?.sacksMax != null && input.sacksMax !== '' ? Number(input.sacksMax) : null;
    if (sacksMin != null && !Number.isNaN(sacksMin)) {
      where.declaredSacks = { ...(where.declaredSacks ?? {}), gte: sacksMin };
    }
    if (sacksMax != null && !Number.isNaN(sacksMax)) {
      where.declaredSacks = { ...(where.declaredSacks ?? {}), lte: sacksMax };
    }

    // -- period filter --
    const periodMode = typeof input?.periodMode === 'string' ? input.periodMode.trim() : '';
    const periodValue = typeof input?.periodValue === 'string' ? input.periodValue.trim() : '';
    if (periodValue && periodMode) {
      if (periodMode === 'exact') {
        const date = new Date(periodValue);
        if (!Number.isNaN(date.getTime())) {
          const next = new Date(date);
          next.setDate(next.getDate() + 1);
          where.createdAt = { gte: date, lt: next };
        }
      } else if (periodMode === 'month') {
        // expects YYYY-MM
        const [yearStr, monthStr] = periodValue.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        if (!Number.isNaN(year) && !Number.isNaN(month) && month >= 1 && month <= 12) {
          const start = new Date(year, month - 1, 1);
          const end = new Date(year, month, 1);
          where.createdAt = { gte: start, lt: end };
        }
      } else if (periodMode === 'year') {
        const year = Number(periodValue);
        if (!Number.isNaN(year)) {
          const start = new Date(year, 0, 1);
          const end = new Date(year + 1, 0, 1);
          where.createdAt = { gte: start, lt: end };
        }
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.sample.findMany({
        where,
        select: {
          id: true,
          internalLotNumber: true,
          status: true,
          commercialStatus: true,
          declaredOwner: true,
          declaredSacks: true,
          declaredHarvest: true,
          soldSacks: true,
          lostSacks: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit
      }),
      this.prisma.sample.count({ where })
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        internalLotNumber: item.internalLotNumber,
        status: item.status,
        commercialStatus: item.commercialStatus,
        declaredOwner: item.declaredOwner,
        declaredSacks: item.declaredSacks,
        declaredHarvest: item.declaredHarvest,
        soldSacks: item.soldSacks ?? 0,
        lostSacks: item.lostSacks ?? 0,
        createdAt: item.createdAt?.toISOString() ?? null,
        updatedAt: item.updatedAt?.toISOString() ?? null
      })),
      page: buildClientListPage(total, page, limit)
    };
  }

  async listClientPurchases(clientId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list client purchases');
    await this.requireClientById(this.prisma, clientId);

    const page = readPageQuery(input?.page, 1);
    const limit = readLimitQuery(input?.limit, { fallback: 10, max: 30 });
    const offset = (page - 1) * limit;

    const where = {
      buyerClientId: clientId,
      movementType: 'SALE',
      status: 'ACTIVE'
    };

    // -- search by lot number (via sample relation) --
    const search = typeof input?.search === 'string' ? input.search.trim() : '';
    if (search) {
      where.sample = { ...(where.sample ?? {}), internalLotNumber: { contains: search, mode: 'insensitive' } };
    }

    // -- owner filter (via sample relation) --
    const owner = typeof input?.owner === 'string' ? input.owner.trim() : '';
    if (owner) {
      where.sample = { ...(where.sample ?? {}), declaredOwner: { contains: owner, mode: 'insensitive' } };
    }

    // -- sacks range --
    const sacksMin = input?.sacksMin != null && input.sacksMin !== '' ? Number(input.sacksMin) : null;
    const sacksMax = input?.sacksMax != null && input.sacksMax !== '' ? Number(input.sacksMax) : null;
    if (sacksMin != null && !Number.isNaN(sacksMin)) {
      where.quantitySacks = { ...(where.quantitySacks ?? {}), gte: sacksMin };
    }
    if (sacksMax != null && !Number.isNaN(sacksMax)) {
      where.quantitySacks = { ...(where.quantitySacks ?? {}), lte: sacksMax };
    }

    // -- period filter (on movementDate) --
    const periodMode = typeof input?.periodMode === 'string' ? input.periodMode.trim() : '';
    const periodValue = typeof input?.periodValue === 'string' ? input.periodValue.trim() : '';
    if (periodValue && periodMode) {
      if (periodMode === 'exact') {
        const date = new Date(periodValue);
        if (!Number.isNaN(date.getTime())) {
          const next = new Date(date);
          next.setDate(next.getDate() + 1);
          where.movementDate = { gte: date, lt: next };
        }
      } else if (periodMode === 'month') {
        // expects YYYY-MM
        const [yearStr, monthStr] = periodValue.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        if (!Number.isNaN(year) && !Number.isNaN(month) && month >= 1 && month <= 12) {
          const start = new Date(year, month - 1, 1);
          const end = new Date(year, month, 1);
          where.movementDate = { gte: start, lt: end };
        }
      } else if (periodMode === 'year') {
        const year = Number(periodValue);
        if (!Number.isNaN(year)) {
          const start = new Date(year, 0, 1);
          const end = new Date(year + 1, 0, 1);
          where.movementDate = { gte: start, lt: end };
        }
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.sampleMovement.findMany({
        where,
        select: {
          id: true,
          sampleId: true,
          quantitySacks: true,
          movementDate: true,
          createdAt: true,
          sample: {
            select: {
              internalLotNumber: true,
              declaredOwner: true
            }
          }
        },
        orderBy: [{ movementDate: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: limit
      }),
      this.prisma.sampleMovement.count({ where })
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        sampleId: item.sampleId,
        sampleLotNumber: item.sample?.internalLotNumber ?? null,
        ownerName: item.sample?.declaredOwner ?? null,
        quantitySacks: item.quantitySacks,
        movementDate: item.movementDate?.toISOString()?.split('T')[0] ?? null,
        createdAt: item.createdAt?.toISOString() ?? null
      })),
      page: buildClientListPage(total, page, limit)
    };
  }

  async getClientCommercialSummary(clientId, actorContext) {
    assertAuthenticatedActor(actorContext, 'get client commercial summary');
    await this.requireClientById(this.prisma, clientId);

    const [
      registeredSamples,
      sampleAggregation,
      totalPurchases,
      purchaseAggregation
    ] = await this.prisma.$transaction([
      this.prisma.sample.count({
        where: { ownerClientId: clientId, status: { not: 'INVALIDATED' } }
      }),
      this.prisma.sample.aggregate({
        where: { ownerClientId: clientId, status: { not: 'INVALIDATED' } },
        _sum: { declaredSacks: true, soldSacks: true, lostSacks: true }
      }),
      this.prisma.sampleMovement.count({
        where: { buyerClientId: clientId, movementType: 'SALE', status: 'ACTIVE' }
      }),
      this.prisma.sampleMovement.aggregate({
        where: { buyerClientId: clientId, movementType: 'SALE', status: 'ACTIVE' },
        _sum: { quantitySacks: true }
      })
    ]);

    return {
      seller: {
        registeredSamples,
        totalSacks: sampleAggregation._sum.declaredSacks ?? 0,
        soldSacks: sampleAggregation._sum.soldSacks ?? 0,
        lostSacks: sampleAggregation._sum.lostSacks ?? 0
      },
      buyer: {
        totalPurchases,
        purchasedSacks: purchaseAggregation._sum.quantitySacks ?? 0
      }
    };
  }

  async inactivateClient(clientId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'inactivate client');
    const { reasonText } = normalizeStatusReasonInput(input);

    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireClientForUpdate(tx, clientId);
      if (current.status === CLIENT_STATUSES.INACTIVE) {
        throw new HttpError(409, 'Client is already inactive');
      }

      const usage = await this.countClientUsage(tx, current.id);

      const updated = await tx.client.update({
        where: { id: current.id },
        data: {
          status: CLIENT_STATUSES.INACTIVE
        },
        select: CLIENT_SUMMARY_SELECT
      });

      await this.recordAuditEvent(tx, {
        targetClientId: updated.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_INACTIVATED,
        reasonText,
        payload: {
          before: {
            status: current.status
          },
          after: {
            status: updated.status
          },
          impact: usage
        }
      });

      return {
        client: mapClientRow(updated),
        impact: usage
      };
    });
  }

  async reactivateClient(clientId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'reactivate client');
    const { reasonText } = normalizeStatusReasonInput(input);

    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireClientForUpdate(tx, clientId);
      if (current.status === CLIENT_STATUSES.ACTIVE) {
        throw new HttpError(409, 'Client is already active');
      }

      const updated = await tx.client.update({
        where: { id: current.id },
        data: {
          status: CLIENT_STATUSES.ACTIVE
        },
        select: CLIENT_SUMMARY_SELECT
      });

      await this.recordAuditEvent(tx, {
        targetClientId: updated.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_REACTIVATED,
        reasonText,
        payload: {
          before: {
            status: current.status
          },
          after: {
            status: updated.status
          }
        }
      });

      return {
        client: mapClientRow(updated)
      };
    });
  }

  async listAuditEvents(clientId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list client audit events');
    const { page, limit } = normalizeAuditListInput(input);
    const skip = (page - 1) * limit;

    await this.requireClientById(this.prisma, clientId);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.clientAuditEvent.findMany({
        where: {
          targetClientId: clientId
        },
        orderBy: [{ createdAt: 'desc' }, { eventId: 'desc' }],
        skip,
        take: limit,
        include: {
          actorUser: {
            select: {
              id: true,
              fullName: true,
              username: true
            }
          },
          targetClient: {
            select: {
              id: true,
              code: true,
              personType: true,
              fullName: true,
              legalName: true,
              status: true
            }
          },
          targetRegistration: {
            select: {
              id: true,
              registrationNumber: true,
              registrationType: true,
              status: true
            }
          }
        }
      }),
      this.prisma.clientAuditEvent.count({
        where: {
          targetClientId: clientId
        }
      })
    ]);

    return {
      items: items.map((item) => toClientAuditEventResponse(item)),
      page: buildClientListPage(total, page, limit)
    };
  }

  async createRegistration(clientId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'create client registration');
    const normalized = normalizeCreateRegistrationInput(input);

    return this.prisma.$transaction(async (tx) => {
      const client = await this.requireClientById(tx, clientId);
      await this.assertRegistrationAvailable(tx, normalized.registrationNumberCanonical);

      const created = await tx.clientRegistration.create({
        data: {
          id: randomUUID(),
          clientId: client.id,
          ...normalized
        },
        select: REGISTRATION_SELECT
      });

      await this.recordAuditEvent(tx, {
        targetClientId: client.id,
        targetRegistrationId: created.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_REGISTRATION_CREATED,
        payload: {
          after: buildRegistrationAuditState(created)
        }
      });

      return {
        client: {
          id: client.id,
          code: client.code,
          displayName: buildClientDisplayName(client)
        },
        registration: toClientRegistrationSummary(created)
      };
    });
  }

  async updateRegistration(clientId, registrationId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'update client registration');

    return this.prisma.$transaction(async (tx) => {
      const client = await this.requireClientById(tx, clientId);
      const current = await this.requireRegistrationById(tx, clientId, registrationId);
      const normalized = normalizeUpdateRegistrationInput(input, current);

      if (normalized.data.registrationNumberCanonical) {
        await this.assertRegistrationAvailable(tx, normalized.data.registrationNumberCanonical, {
          excludeRegistrationId: current.id
        });
      }

      const before = buildRegistrationAuditState(current);
      const afterCandidate = buildRegistrationAuditState({
        ...current,
        ...normalized.data
      });
      const auditPayload = buildClientAuditPayload(before, afterCandidate);
      if (Object.keys(auditPayload.diff.after).length === 0) {
        throw new HttpError(409, 'No client registration changes detected');
      }

      const updated = await tx.clientRegistration.update({
        where: { id: current.id },
        data: normalized.data,
        select: REGISTRATION_SELECT
      });

      await this.recordAuditEvent(tx, {
        targetClientId: client.id,
        targetRegistrationId: updated.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_REGISTRATION_UPDATED,
        reasonText: normalized.reasonText,
        payload: auditPayload
      });

      return {
        client: {
          id: client.id,
          code: client.code,
          displayName: buildClientDisplayName(client)
        },
        registration: toClientRegistrationSummary(updated)
      };
    });
  }

  async inactivateRegistration(clientId, registrationId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'inactivate client registration');
    const { reasonText } = normalizeStatusReasonInput(input);

    return this.prisma.$transaction(async (tx) => {
      const client = await this.requireClientById(tx, clientId);
      const current = await this.requireRegistrationById(tx, clientId, registrationId);
      if (current.status === CLIENT_REGISTRATION_STATUSES.INACTIVE) {
        throw new HttpError(409, 'Client registration is already inactive');
      }

      const usage = await this.countRegistrationUsage(tx, current.id);

      const updated = await tx.clientRegistration.update({
        where: { id: current.id },
        data: {
          status: CLIENT_REGISTRATION_STATUSES.INACTIVE
        },
        select: REGISTRATION_SELECT
      });

      await this.recordAuditEvent(tx, {
        targetClientId: client.id,
        targetRegistrationId: updated.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_REGISTRATION_INACTIVATED,
        reasonText,
        payload: {
          before: {
            status: current.status
          },
          after: {
            status: updated.status
          },
          impact: usage
        }
      });

      return {
        client: {
          id: client.id,
          code: client.code,
          displayName: buildClientDisplayName(client)
        },
        registration: toClientRegistrationSummary(updated),
        impact: usage
      };
    });
  }

  async reactivateRegistration(clientId, registrationId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'reactivate client registration');
    const { reasonText } = normalizeStatusReasonInput(input);

    return this.prisma.$transaction(async (tx) => {
      const client = await this.requireClientById(tx, clientId);
      const current = await this.requireRegistrationById(tx, clientId, registrationId);
      if (current.status === CLIENT_REGISTRATION_STATUSES.ACTIVE) {
        throw new HttpError(409, 'Client registration is already active');
      }

      const updated = await tx.clientRegistration.update({
        where: { id: current.id },
        data: {
          status: CLIENT_REGISTRATION_STATUSES.ACTIVE
        },
        select: REGISTRATION_SELECT
      });

      await this.recordAuditEvent(tx, {
        targetClientId: client.id,
        targetRegistrationId: updated.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_REGISTRATION_REACTIVATED,
        reasonText,
        payload: {
          before: {
            status: current.status
          },
          after: {
            status: updated.status
          }
        }
      });

      return {
        client: {
          id: client.id,
          code: client.code,
          displayName: buildClientDisplayName(client)
        },
        registration: toClientRegistrationSummary(updated)
      };
    });
  }
}
