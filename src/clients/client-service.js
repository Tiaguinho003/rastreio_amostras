import { randomUUID } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';
import {
  CLIENT_AUDIT_EVENT_TYPES,
  CLIENT_BRANCH_STATUSES,
  CLIENT_LOOKUP_KINDS,
  CLIENT_STATUSES,
  CLIENT_PERSON_TYPES,
  assertAuthenticatedActor,
  buildAuditContext,
  buildBranchAuditState,
  buildClientAuditPayload,
  buildClientAuditState,
  buildClientDisplayName,
  buildClientListPage,
  normalizeAuditListInput,
  normalizeCommercialUserId,
  normalizeCommercialUserIds,
  normalizeCreateBranchInput,
  normalizeCreateClientInput,
  normalizeListClientsInput,
  normalizeLookupClientsInput,
  normalizeStatusReasonInput,
  normalizeUpdateBranchInput,
  normalizeUpdateClientInput,
  readLimitQuery,
  readPageQuery,
  toClientAuditEventResponse,
  toClientBranchSummary,
  toClientSummary,
} from './client-support.js';

const COMMERCIAL_USER_SELECT = {
  select: {
    id: true,
    fullName: true,
  },
};

const COMMERCIAL_USERS_SELECT = {
  select: {
    user: COMMERCIAL_USER_SELECT,
  },
  orderBy: { createdAt: 'asc' },
};

const CLIENT_BRANCH_SUMMARY_SELECT = {
  id: true,
  clientId: true,
  name: true,
  isPrimary: true,
  code: true,
  cnpj: true,
  cnpjOrder: true,
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
  registrationType: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

const CLIENT_SUMMARY_SELECT = {
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
  status: true,
  createdAt: true,
  updatedAt: true,
  commercialUsers: COMMERCIAL_USERS_SELECT,
  branches: {
    where: { status: CLIENT_BRANCH_STATUSES.ACTIVE },
    select: CLIENT_BRANCH_SUMMARY_SELECT,
    orderBy: [{ isPrimary: 'desc' }, { code: 'asc' }],
  },
  _count: {
    select: {
      branches: true,
    },
  },
};

const CLIENT_DETAIL_SELECT = {
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
  status: true,
  createdAt: true,
  updatedAt: true,
  commercialUsers: COMMERCIAL_USERS_SELECT,
  branches: {
    select: CLIENT_BRANCH_SUMMARY_SELECT,
    orderBy: [{ isPrimary: 'desc' }, { code: 'asc' }],
  },
  _count: {
    select: {
      branches: true,
    },
  },
};

function buildClientWhereFromSearch(search) {
  if (!search) {
    return undefined;
  }

  const numericSearch = Number.parseInt(search, 10);
  const digits = String(search).replace(/\D+/g, '');

  // F5.2: cnpj e documentCanonical foram movidos para client_branch / cnpj_root.
  // Search agora cobre cpf no Client e cnpj/cnpjRoot via branch (some).
  const cnpjDigits = digits.length > 0 ? digits : null;
  const or = [
    { fullName: { contains: search, mode: 'insensitive' } },
    { legalName: { contains: search, mode: 'insensitive' } },
    { tradeName: { contains: search, mode: 'insensitive' } },
    { cpf: { contains: digits.length > 0 ? digits : search } },
  ];

  if (cnpjDigits) {
    or.push({ cnpjRoot: { startsWith: cnpjDigits.slice(0, 8) } });
    or.push({ branches: { some: { cnpj: { contains: cnpjDigits } } } });
  }

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
  const activeBranches = Array.isArray(row.branches)
    ? row.branches.filter((branch) => branch.status === CLIENT_BRANCH_STATUSES.ACTIVE)
    : [];
  const activeBranchCount = activeBranches.length;
  const branchCount =
    typeof row?._count?.branches === 'number'
      ? row._count.branches
      : Array.isArray(row.branches)
        ? row.branches.length
        : 0;
  const primaryBranch =
    activeBranches.find((b) => b.isPrimary === true) ?? activeBranches[0] ?? null;

  return toClientSummary(row, {
    activeBranchCount,
    branchCount,
    primaryCity: primaryBranch?.city ?? null,
    primaryState: primaryBranch?.state ?? null,
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
        id: actorUserId,
      },
      select: {
        id: true,
      },
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
        targetBranchId: input.targetBranchId ?? null,
        actorUserId: actorUserId ?? null,
        eventType: input.eventType,
        payload: input.payload ?? {},
        reasonText: input.reasonText ?? null,
        requestId: auditContext.requestId,
        correlationId: auditContext.correlationId,
        metadataIp: auditContext.metadataIp,
        metadataUserAgent: auditContext.metadataUserAgent,
      },
    });
  }

  // F5.2: owner binding agora valida ownerBranchId (req) + ownerClientId (req).
  // C2: ambos sao denormalizados; branch.clientId DEVE ser igual a ownerClientId.
  async resolveOwnerBinding({ ownerClientId, ownerBranchId = null }) {
    if (typeof ownerClientId !== 'string' || ownerClientId.length === 0) {
      throw new HttpError(422, 'ownerClientId is required for structured owner binding', {
        code: 'OWNER_CLIENT_REQUIRED',
      });
    }

    const client = await this.prisma.client.findUnique({
      where: { id: ownerClientId },
      select: CLIENT_SUMMARY_SELECT,
    });

    if (!client) {
      throw new HttpError(422, 'ownerClientId does not reference an existing client', {
        code: 'OWNER_CLIENT_NOT_FOUND',
        field: 'ownerClientId',
      });
    }

    if (client.status !== CLIENT_STATUSES.ACTIVE) {
      throw new HttpError(422, 'ownerClientId must reference an active client', {
        code: 'OWNER_CLIENT_INACTIVE',
        field: 'ownerClientId',
      });
    }

    if (!client.isSeller) {
      throw new HttpError(422, 'ownerClientId must reference a seller client', {
        code: 'OWNER_CLIENT_NOT_SELLER',
        field: 'ownerClientId',
      });
    }

    let branch = null;
    if (ownerBranchId !== null && ownerBranchId !== undefined) {
      branch = await this.prisma.clientBranch.findFirst({
        where: { id: ownerBranchId, clientId: client.id },
        select: CLIENT_BRANCH_SUMMARY_SELECT,
      });

      if (!branch) {
        throw new HttpError(422, 'ownerBranchId must belong to ownerClientId', {
          code: 'OWNER_BRANCH_MISMATCH',
          field: 'ownerBranchId',
        });
      }

      if (branch.status !== CLIENT_BRANCH_STATUSES.ACTIVE) {
        throw new HttpError(422, 'ownerBranchId must reference an active branch', {
          code: 'OWNER_BRANCH_INACTIVE',
          field: 'ownerBranchId',
        });
      }
    }

    return {
      ownerClientId: client.id,
      ownerBranchId: branch?.id ?? null,
      displayName: buildClientDisplayName(client),
      ownerClient: mapClientRow(client),
      ownerBranch: branch ? toClientBranchSummary(branch) : null,
    };
  }

  async resolveBuyerBinding({ buyerClientId, buyerBranchId = null }) {
    if (typeof buyerClientId !== 'string' || buyerClientId.length === 0) {
      throw new HttpError(422, 'buyerClientId is required for sale movement', {
        code: 'BUYER_CLIENT_REQUIRED',
      });
    }

    const client = await this.prisma.client.findUnique({
      where: { id: buyerClientId },
      select: CLIENT_SUMMARY_SELECT,
    });

    if (!client) {
      throw new HttpError(422, 'buyerClientId does not reference an existing client', {
        code: 'BUYER_CLIENT_NOT_FOUND',
        field: 'buyerClientId',
      });
    }

    if (client.status !== CLIENT_STATUSES.ACTIVE) {
      throw new HttpError(422, 'buyerClientId must reference an active client', {
        code: 'BUYER_CLIENT_INACTIVE',
        field: 'buyerClientId',
      });
    }

    if (!client.isBuyer) {
      throw new HttpError(422, 'buyerClientId must reference a buyer client', {
        code: 'BUYER_CLIENT_NOT_BUYER',
        field: 'buyerClientId',
      });
    }

    let branch = null;
    if (buyerBranchId !== null && buyerBranchId !== undefined) {
      branch = await this.prisma.clientBranch.findFirst({
        where: { id: buyerBranchId, clientId: client.id },
        select: CLIENT_BRANCH_SUMMARY_SELECT,
      });

      if (!branch) {
        throw new HttpError(422, 'buyerBranchId must belong to buyerClientId', {
          code: 'BUYER_BRANCH_MISMATCH',
          field: 'buyerBranchId',
        });
      }

      if (branch.status !== CLIENT_BRANCH_STATUSES.ACTIVE) {
        throw new HttpError(422, 'buyerBranchId must reference an active branch', {
          code: 'BUYER_BRANCH_INACTIVE',
          field: 'buyerBranchId',
        });
      }
    }

    return {
      buyerClientId: client.id,
      buyerBranchId: branch?.id ?? null,
      buyerClient: mapClientRow(client),
      buyerBranch: branch ? toClientBranchSummary(branch) : null,
    };
  }

  async resolveRecipientClient(recipientClientId) {
    if (typeof recipientClientId !== 'string' || recipientClientId.length === 0) {
      throw new HttpError(422, 'recipientClientId is required', {
        code: 'RECIPIENT_CLIENT_REQUIRED',
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
        status: true,
      },
    });

    if (!client) {
      throw new HttpError(422, 'recipientClientId does not reference an existing client', {
        code: 'RECIPIENT_CLIENT_NOT_FOUND',
        field: 'recipientClientId',
      });
    }

    if (client.status !== CLIENT_STATUSES.ACTIVE) {
      throw new HttpError(422, 'recipientClientId must reference an active client', {
        code: 'RECIPIENT_CLIENT_INACTIVE',
        field: 'recipientClientId',
      });
    }

    return toClientSummary(client);
  }

  async requireClientById(tx, clientId) {
    const client = await tx.client.findUnique({
      where: { id: clientId },
      select: CLIENT_DETAIL_SELECT,
    });

    if (!client) {
      throw new HttpError(404, 'Client not found', {
        code: 'CLIENT_NOT_FOUND',
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
        cnpjRoot: true,
        phone: true,
        isBuyer: true,
        isSeller: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        commercialUsers: {
          select: { userId: true },
          orderBy: { createdAt: 'asc' },
        },
        branches: {
          select: CLIENT_BRANCH_SUMMARY_SELECT,
          orderBy: [{ isPrimary: 'desc' }, { code: 'asc' }],
        },
      },
    });

    if (!client) {
      throw new HttpError(404, 'Client not found', {
        code: 'CLIENT_NOT_FOUND',
      });
    }

    return client;
  }

  async assertCommercialUserAssignable(tx, commercialUserId) {
    if (commercialUserId === null || commercialUserId === undefined) {
      return;
    }

    const user = await tx.user.findUnique({
      where: { id: commercialUserId },
      select: { id: true, status: true },
    });

    if (!user) {
      throw new HttpError(422, 'commercialUserId does not reference an existing user', {
        code: 'COMMERCIAL_USER_NOT_FOUND',
        field: 'commercialUserId',
      });
    }

    if (user.status !== 'ACTIVE') {
      throw new HttpError(422, 'commercialUserId must reference an active user', {
        code: 'COMMERCIAL_USER_INACTIVE',
        field: 'commercialUserId',
      });
    }
  }

  async requireBranchById(tx, clientId, branchId) {
    const branch = await tx.clientBranch.findFirst({
      where: { id: branchId, clientId },
      select: CLIENT_BRANCH_SUMMARY_SELECT,
    });

    if (!branch) {
      throw new HttpError(404, 'Client branch not found', {
        code: 'CLIENT_BRANCH_NOT_FOUND',
      });
    }

    return branch;
  }

  // F5.2: PF -> uniqueness em client.cpf. PJ -> uniqueness em client.cnpj_root.
  async assertCpfAvailable(tx, cpf, { excludeClientId = null } = {}) {
    if (!cpf) return;
    const existing = await tx.client.findFirst({
      where: {
        cpf,
        ...(excludeClientId ? { id: { not: excludeClientId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new HttpError(409, 'CPF already exists for another client', {
        code: 'CLIENT_DOCUMENT_ALREADY_EXISTS',
      });
    }
  }

  async assertCnpjRootAvailable(tx, cnpjRoot, { excludeClientId = null } = {}) {
    if (!cnpjRoot) return;
    const existing = await tx.client.findFirst({
      where: {
        cnpjRoot,
        ...(excludeClientId ? { id: { not: excludeClientId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new HttpError(409, 'CNPJ root already exists for another client', {
        code: 'CLIENT_DOCUMENT_ALREADY_EXISTS',
      });
    }
  }

  async assertBranchCnpjAvailable(tx, cnpj, { excludeBranchId = null } = {}) {
    if (!cnpj) return;
    const existing = await tx.clientBranch.findFirst({
      where: {
        cnpj,
        ...(excludeBranchId ? { id: { not: excludeBranchId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new HttpError(409, 'CNPJ already exists for another branch', {
        code: 'CLIENT_BRANCH_CNPJ_ALREADY_EXISTS',
      });
    }
  }

  async assertBranchRegistrationCanonicalAvailable(tx, canonical, { excludeBranchId = null } = {}) {
    if (!canonical) return;
    const existing = await tx.clientBranch.findFirst({
      where: {
        registrationNumberCanonical: canonical,
        ...(excludeBranchId ? { id: { not: excludeBranchId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new HttpError(409, 'Registration number already exists', {
        code: 'CLIENT_BRANCH_REGISTRATION_ALREADY_EXISTS',
      });
    }
  }

  async listClients(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list clients');

    const { page, limit, search, status, personType, isBuyer, isSeller, commercialUserIds } =
      normalizeListClientsInput(input);
    const skip = (page - 1) * limit;

    // Filtro multi-user: ANY (some) — clients onde QUALQUER um dos userIds da
    // lista esta vinculado. Vazio = sem filtro.
    const baseWhere = {
      ...(status ? { status } : {}),
      ...(personType ? { personType } : {}),
      ...(isBuyer === null ? {} : { isBuyer }),
      ...(isSeller === null ? {} : { isSeller }),
      ...(commercialUserIds.length > 0
        ? { commercialUsers: { some: { userId: { in: commercialUserIds } } } }
        : {}),
    };

    const exactCodeSearch = parseExactCodeSearch(search);
    if (exactCodeSearch !== null) {
      const exactCodeWhere = {
        ...baseWhere,
        code: exactCodeSearch,
      };

      const [items, total] = await this.prisma.$transaction([
        this.prisma.client.findMany({
          where: exactCodeWhere,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: limit,
          select: CLIENT_SUMMARY_SELECT,
        }),
        this.prisma.client.count({ where: exactCodeWhere }),
      ]);

      if (total > 0) {
        return {
          items: items.map((item) => mapClientRow(item)),
          page: buildClientListPage(total, page, limit),
        };
      }
    }

    const where = {
      ...baseWhere,
      ...(buildClientWhereFromSearch(search) ?? {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        select: CLIENT_SUMMARY_SELECT,
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      items: items.map((item) => mapClientRow(item)),
      page: buildClientListPage(total, page, limit),
    };
  }

  async lookupClients(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'lookup clients');
    const { search, kind, limit } = normalizeLookupClientsInput(input);

    // F6.1 G1: smart resolve por CNPJ completo (14 digitos exatos).
    // Se search for 14 digitos e bate com cnpj de uma branch, retorna o
    // client owner como primeiro resultado (UI destaca a branch que casou).
    const searchDigits = String(search ?? '').replace(/\D+/g, '');
    if (searchDigits.length === 14) {
      const branch = await this.prisma.clientBranch.findFirst({
        where: { cnpj: searchDigits },
        select: { clientId: true, id: true },
      });
      if (branch) {
        const owner = await this.prisma.client.findUnique({
          where: { id: branch.clientId },
          select: CLIENT_SUMMARY_SELECT,
        });
        if (
          owner &&
          owner.status === CLIENT_STATUSES.ACTIVE &&
          (kind === CLIENT_LOOKUP_KINDS.ANY ||
            (kind === CLIENT_LOOKUP_KINDS.OWNER && owner.isSeller) ||
            (kind === CLIENT_LOOKUP_KINDS.BUYER && owner.isBuyer))
        ) {
          return {
            items: [mapClientRow(owner)],
            matchedBranchId: branch.id,
          };
        }
      }
    }

    const where = {
      status: CLIENT_STATUSES.ACTIVE,
      ...(kind === CLIENT_LOOKUP_KINDS.OWNER
        ? { isSeller: true }
        : kind === CLIENT_LOOKUP_KINDS.BUYER
          ? { isBuyer: true }
          : {}),
      ...(buildClientWhereFromSearch(search) ?? {}),
    };

    const items = await this.prisma.client.findMany({
      where,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: limit,
      select: CLIENT_SUMMARY_SELECT,
    });

    return {
      items: items.map((item) => mapClientRow(item)),
    };
  }

  async getClient(clientId, actorContext) {
    assertAuthenticatedActor(actorContext, 'get client');

    return this.prisma.$transaction(async (tx) => {
      const client = await this.requireClientById(tx, clientId);
      return {
        client: mapClientRow(client),
        branches: Array.isArray(client.branches)
          ? client.branches.map((branch) =>
              toClientBranchSummary({ ...branch, clientId: branch.clientId ?? client.id })
            )
          : [],
      };
    });
  }

  async createClient(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'create client');
    const { data, commercialUserIds, branches } = normalizeCreateClientInput(input);

    return this.prisma.$transaction(async (tx) => {
      // F5.2: validacao de unicidade dividida — PF: cpf; PJ: cnpj_root.
      // cnpjRoot e derivado da primeira branch com cnpj.
      const primaryBranchInput = branches.find((b) => b.isPrimary === true) ?? branches[0] ?? null;
      const cnpjRoot =
        primaryBranchInput?.cnpj && data.personType === CLIENT_PERSON_TYPES.PJ
          ? primaryBranchInput.cnpj.slice(0, 8)
          : null;

      if (data.personType === CLIENT_PERSON_TYPES.PF) {
        await this.assertCpfAvailable(tx, data.cpf);
      } else if (cnpjRoot) {
        await this.assertCnpjRootAvailable(tx, cnpjRoot);
      }

      for (const userId of commercialUserIds) {
        await this.assertCommercialUserAssignable(tx, userId);
      }

      // Pre-checa unicidade de cnpj e registrationNumberCanonical de cada branch
      for (const b of branches) {
        if (b.cnpj) {
          await this.assertBranchCnpjAvailable(tx, b.cnpj);
        }
        if (b.registrationNumberCanonical) {
          await this.assertBranchRegistrationCanonicalAvailable(tx, b.registrationNumberCanonical);
        }
      }

      const createdRaw = await tx.client.create({
        data: {
          id: randomUUID(),
          ...data,
          cnpjRoot,
        },
        select: { id: true },
      });

      if (commercialUserIds.length > 0) {
        await tx.clientCommercialUser.createMany({
          data: commercialUserIds.map((userId) => ({ clientId: createdRaw.id, userId })),
        });
      }

      // Cria branches inline (B3): pode ser lista vazia (transient state).
      const createdBranches = [];
      let nextCode = 1;
      for (const b of branches) {
        const created = await tx.clientBranch.create({
          data: {
            id: randomUUID(),
            clientId: createdRaw.id,
            isPrimary: b.isPrimary === true,
            code: nextCode,
            name: b.name ?? null,
            cnpj: b.cnpj ?? null,
            cnpjOrder: b.cnpjOrder ?? null,
            legalName: b.legalName ?? null,
            tradeName: b.tradeName ?? null,
            phone: b.phone ?? null,
            addressLine: b.addressLine ?? null,
            district: b.district ?? null,
            city: b.city ?? null,
            state: b.state ?? null,
            postalCode: b.postalCode ?? null,
            complement: b.complement ?? null,
            registrationNumber: b.registrationNumber ?? null,
            registrationNumberCanonical: b.registrationNumberCanonical ?? null,
            registrationType: b.registrationType ?? null,
            status: 'ACTIVE',
          },
        });
        createdBranches.push(created);
        nextCode++;
      }

      const created = await tx.client.findUniqueOrThrow({
        where: { id: createdRaw.id },
        select: CLIENT_SUMMARY_SELECT,
      });

      await this.recordAuditEvent(tx, {
        targetClientId: created.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_CREATED,
        payload: {
          after: buildClientAuditState(created),
          branches: createdBranches.map((b) => buildBranchAuditState(b)),
        },
      });

      // Audit individual de cada branch criada inline
      for (const branch of createdBranches) {
        await this.recordAuditEvent(tx, {
          targetClientId: created.id,
          targetBranchId: branch.id,
          actorContext: actor,
          eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_BRANCH_CREATED,
          payload: { after: buildBranchAuditState(branch) },
        });
      }

      return {
        client: mapClientRow(created),
      };
    });
  }

  async updateClient(clientId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'update client');

    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireClientForUpdate(tx, clientId);
      const { data, reasonText, commercialUserIdsInput } = normalizeUpdateClientInput(
        input,
        current
      );

      // F5.2: PF -> assertCpfAvailable. PJ -> uniqueness ja na branch.cnpj
      // (cnpj_root e derivado da primary branch — no updateClient nao mexemos
      // diretamente em cnpjRoot; isso fica para POST /branches ou updateBranch).
      if (data.personType === CLIENT_PERSON_TYPES.PF) {
        await this.assertCpfAvailable(tx, data.cpf, { excludeClientId: current.id });
      }

      // commercialUserIdsInput:
      //   undefined  -> nao mexer (mantem atual)
      //   string[]   -> substitui a lista inteira; vazio em Client ACTIVE viola invariante
      //                 (validamos em codigo para erro 409 amigavel; o trigger DB e a ultima linha)
      const previousIds = (current.commercialUsers ?? []).map((entry) => entry.userId);
      const nextIds = commercialUserIdsInput === undefined ? previousIds : commercialUserIdsInput;

      const previousSet = new Set(previousIds);
      const nextSet = new Set(nextIds);
      const toAdd = nextIds.filter((id) => !previousSet.has(id));
      const toRemove = previousIds.filter((id) => !nextSet.has(id));
      const commercialChanged = toAdd.length > 0 || toRemove.length > 0;

      if (commercialChanged && nextIds.length === 0 && current.status === CLIENT_STATUSES.ACTIVE) {
        throw new HttpError(409, 'Active client must keep at least one commercial user', {
          code: 'COMMERCIAL_USER_REQUIRED_FOR_ACTIVE',
          field: 'commercialUserIds',
        });
      }
      for (const userId of toAdd) {
        await this.assertCommercialUserAssignable(tx, userId);
      }

      const before = buildClientAuditState(current);
      const afterCandidate = {
        ...before,
        ...buildClientAuditState({
          ...current,
          ...data,
          commercialUsers: nextIds.map((userId) => ({ userId })),
        }),
      };
      const auditPayload = buildClientAuditPayload(before, afterCandidate);
      if (Object.keys(auditPayload.diff.after).length === 0) {
        throw new HttpError(409, 'No client changes detected');
      }

      // Atualiza o Client e sincroniza a join. O findUniqueOrThrow final
      // garante que CLIENT_SUMMARY_SELECT (que inclui commercialUsers) reflete
      // o estado pos-sync.
      const updatedRaw = await tx.client.update({
        where: { id: current.id },
        data,
        select: { id: true },
      });

      if (toRemove.length > 0) {
        await tx.clientCommercialUser.deleteMany({
          where: { clientId: updatedRaw.id, userId: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.clientCommercialUser.createMany({
          data: toAdd.map((userId) => ({ clientId: updatedRaw.id, userId })),
        });
      }

      const updated = await tx.client.findUniqueOrThrow({
        where: { id: updatedRaw.id },
        select: CLIENT_SUMMARY_SELECT,
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
        reasonText,
        payload: auditPayload,
      });

      return {
        client: mapClientRow(updated),
      };
    });
  }

  async countClientUsage(tx, clientId) {
    const [ownedSamples, activeMovements, activeBranches] = await Promise.all([
      tx.sample.count({
        where: { ownerClientId: clientId, status: { not: 'INVALIDATED' } },
      }),
      tx.sampleMovement.count({
        where: { buyerClientId: clientId, status: 'ACTIVE' },
      }),
      tx.clientBranch.count({
        where: { clientId, status: 'ACTIVE' },
      }),
    ]);

    return { ownedSamples, activeMovements, activeBranches };
  }

  async countBranchUsage(tx, branchId) {
    const [linkedSamples, linkedMovements] = await Promise.all([
      tx.sample.count({
        where: { ownerBranchId: branchId, status: { not: 'INVALIDATED' } },
      }),
      tx.sampleMovement.count({
        where: { buyerBranchId: branchId, status: 'ACTIVE' },
      }),
    ]);

    return { linkedSamples, linkedMovements };
  }

  async getClientImpact(clientId, actorContext) {
    assertAuthenticatedActor(actorContext, 'check client impact');

    const client = await this.requireClientById(this.prisma, clientId);
    const usage = await this.countClientUsage(this.prisma, clientId);

    return {
      client: { id: client.id, displayName: buildClientDisplayName(client), status: client.status },
      usage,
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
      status: { not: 'INVALIDATED' },
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
              { tradeName: { contains: buyer, mode: 'insensitive' } },
            ],
          },
        },
      };
    }

    // -- commercial status --
    const commercialStatus =
      typeof input?.commercialStatus === 'string' ? input.commercialStatus.trim() : '';
    if (commercialStatus) {
      where.commercialStatus = commercialStatus;
    }

    // -- harvest --
    const harvest = typeof input?.harvest === 'string' ? input.harvest.trim() : '';
    if (harvest) {
      where.declaredHarvest = harvest;
    }

    // -- sacks range --
    const sacksMin =
      input?.sacksMin != null && input.sacksMin !== '' ? Number(input.sacksMin) : null;
    const sacksMax =
      input?.sacksMax != null && input.sacksMax !== '' ? Number(input.sacksMax) : null;
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
          updatedAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.sample.count({ where }),
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
        updatedAt: item.updatedAt?.toISOString() ?? null,
      })),
      page: buildClientListPage(total, page, limit),
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
      status: 'ACTIVE',
    };

    // -- search by lot number (via sample relation) --
    const search = typeof input?.search === 'string' ? input.search.trim() : '';
    if (search) {
      where.sample = {
        ...(where.sample ?? {}),
        internalLotNumber: { contains: search, mode: 'insensitive' },
      };
    }

    // -- owner filter (via sample relation) --
    const owner = typeof input?.owner === 'string' ? input.owner.trim() : '';
    if (owner) {
      where.sample = {
        ...(where.sample ?? {}),
        declaredOwner: { contains: owner, mode: 'insensitive' },
      };
    }

    // -- sacks range --
    const sacksMin =
      input?.sacksMin != null && input.sacksMin !== '' ? Number(input.sacksMin) : null;
    const sacksMax =
      input?.sacksMax != null && input.sacksMax !== '' ? Number(input.sacksMax) : null;
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
              declaredOwner: true,
            },
          },
        },
        orderBy: [{ movementDate: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.sampleMovement.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        sampleId: item.sampleId,
        sampleLotNumber: item.sample?.internalLotNumber ?? null,
        ownerName: item.sample?.declaredOwner ?? null,
        quantitySacks: item.quantitySacks,
        movementDate: item.movementDate?.toISOString()?.split('T')[0] ?? null,
        createdAt: item.createdAt?.toISOString() ?? null,
      })),
      page: buildClientListPage(total, page, limit),
    };
  }

  async getClientCommercialSummary(clientId, actorContext) {
    assertAuthenticatedActor(actorContext, 'get client commercial summary');
    await this.requireClientById(this.prisma, clientId);

    const [registeredSamples, sampleAggregation, totalPurchases, purchaseAggregation] =
      await this.prisma.$transaction([
        this.prisma.sample.count({
          where: { ownerClientId: clientId, status: { not: 'INVALIDATED' } },
        }),
        this.prisma.sample.aggregate({
          where: { ownerClientId: clientId, status: { not: 'INVALIDATED' } },
          _sum: { declaredSacks: true, soldSacks: true, lostSacks: true },
        }),
        this.prisma.sampleMovement.count({
          where: { buyerClientId: clientId, movementType: 'SALE', status: 'ACTIVE' },
        }),
        this.prisma.sampleMovement.aggregate({
          where: { buyerClientId: clientId, movementType: 'SALE', status: 'ACTIVE' },
          _sum: { quantitySacks: true },
        }),
      ]);

    return {
      seller: {
        registeredSamples,
        totalSacks: sampleAggregation._sum.declaredSacks ?? 0,
        soldSacks: sampleAggregation._sum.soldSacks ?? 0,
        lostSacks: sampleAggregation._sum.lostSacks ?? 0,
      },
      buyer: {
        totalPurchases,
        purchasedSacks: purchaseAggregation._sum.quantitySacks ?? 0,
      },
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
          status: CLIENT_STATUSES.INACTIVE,
        },
        select: CLIENT_SUMMARY_SELECT,
      });

      await this.recordAuditEvent(tx, {
        targetClientId: updated.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_INACTIVATED,
        reasonText,
        payload: {
          before: {
            status: current.status,
          },
          after: {
            status: updated.status,
          },
          impact: usage,
        },
      });

      return {
        client: mapClientRow(updated),
        impact: usage,
      };
    });
  }

  async bulkUnlinkCommercialUser(tx, commercialUserId, actorContext, reasonText) {
    // R1.3: invariante "Client ACTIVE tem >=1 user na join" e garantida pelo
    // trigger DEFERRABLE no banco. Antes de tentar desvincular, detectamos
    // clients onde este user e o UNICO responsavel (sole custodian) e
    // retornamos um 409 estruturado para a aplicacao chamadora reatribuir
    // (a Fase 4 expoe a UI de reatribuicao em massa).
    const linkedActiveClients = await tx.client.findMany({
      where: {
        status: CLIENT_STATUSES.ACTIVE,
        commercialUsers: { some: { userId: commercialUserId } },
      },
      select: {
        id: true,
        code: true,
        _count: { select: { commercialUsers: true } },
      },
    });

    const soleCustodianOf = linkedActiveClients.filter(
      (client) => client._count.commercialUsers === 1
    );
    if (soleCustodianOf.length > 0) {
      throw new HttpError(
        409,
        'Cannot unlink commercial user: still the sole responsible for active clients',
        {
          code: 'COMMERCIAL_USER_HAS_SOLE_CUSTODIANS',
          details: {
            clientIds: soleCustodianOf.map((c) => c.id),
            clientCodes: soleCustodianOf.map((c) => c.code),
          },
        }
      );
    }

    const clients = await tx.client.findMany({
      where: { commercialUsers: { some: { userId: commercialUserId } } },
      select: CLIENT_SUMMARY_SELECT,
    });

    if (clients.length === 0) {
      return { unlinkedCount: 0 };
    }

    await tx.clientCommercialUser.deleteMany({
      where: { userId: commercialUserId },
    });

    for (const client of clients) {
      const before = buildClientAuditState(client);
      const after = {
        ...before,
        commercialUserIds: before.commercialUserIds.filter((id) => id !== commercialUserId),
      };
      const auditPayload = buildClientAuditPayload(before, after);

      await this.recordAuditEvent(tx, {
        targetClientId: client.id,
        actorContext,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_UPDATED,
        reasonText: reasonText ?? null,
        payload: auditPayload,
      });
    }

    return { unlinkedCount: clients.length };
  }

  async addCommercialUserToClient(clientId, userId, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'add commercial user to client');
    const normalizedUserId = normalizeCommercialUserId(userId, 'userId');
    if (!normalizedUserId) {
      throw new HttpError(422, 'userId is required', {
        code: 'VALIDATION_ERROR',
        field: 'userId',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireClientForUpdate(tx, clientId);
      await this.assertCommercialUserAssignable(tx, normalizedUserId);

      const alreadyLinked = current.commercialUsers.some(
        (entry) => entry.userId === normalizedUserId
      );
      if (alreadyLinked) {
        throw new HttpError(409, 'User is already linked to this client', {
          code: 'USER_ALREADY_LINKED',
          field: 'userId',
        });
      }

      await tx.clientCommercialUser.create({
        data: { clientId: current.id, userId: normalizedUserId },
      });

      const updated = await tx.client.findUniqueOrThrow({
        where: { id: current.id },
        select: CLIENT_SUMMARY_SELECT,
      });

      const before = buildClientAuditState(current);
      const after = buildClientAuditState(updated);
      await this.recordAuditEvent(tx, {
        targetClientId: updated.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_UPDATED,
        payload: buildClientAuditPayload(before, after),
      });

      return { client: mapClientRow(updated) };
    });
  }

  async removeCommercialUserFromClient(clientId, userId, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'remove commercial user from client');
    const normalizedUserId = normalizeCommercialUserId(userId, 'userId');
    if (!normalizedUserId) {
      throw new HttpError(422, 'userId is required', {
        code: 'VALIDATION_ERROR',
        field: 'userId',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireClientForUpdate(tx, clientId);
      const existingLink = current.commercialUsers.find(
        (entry) => entry.userId === normalizedUserId
      );
      if (!existingLink) {
        throw new HttpError(404, 'User is not linked to this client', {
          code: 'USER_NOT_LINKED',
          field: 'userId',
        });
      }

      // Validacao aplicacional para erro amigavel; o trigger DEFERRABLE no DB
      // e a ultima linha de defesa.
      if (current.status === CLIENT_STATUSES.ACTIVE && current.commercialUsers.length === 1) {
        throw new HttpError(409, 'Cannot remove the last commercial user of an active client', {
          code: 'LAST_COMMERCIAL_USER',
          field: 'userId',
        });
      }

      await tx.clientCommercialUser.delete({
        where: {
          clientId_userId: { clientId: current.id, userId: normalizedUserId },
        },
      });

      const updated = await tx.client.findUniqueOrThrow({
        where: { id: current.id },
        select: CLIENT_SUMMARY_SELECT,
      });

      const before = buildClientAuditState(current);
      const after = buildClientAuditState(updated);
      await this.recordAuditEvent(tx, {
        targetClientId: updated.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_UPDATED,
        payload: buildClientAuditPayload(before, after),
      });

      return { client: mapClientRow(updated) };
    });
  }

  async bulkAddCommercialUser(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'bulk add commercial user');
    const userId = normalizeCommercialUserId(input?.userId, 'userId');
    if (!userId) {
      throw new HttpError(422, 'userId is required', {
        code: 'VALIDATION_ERROR',
        field: 'userId',
      });
    }
    const clientIds = normalizeCommercialUserIds(input?.clientIds, 'clientIds');
    if (clientIds === undefined || clientIds.length === 0) {
      throw new HttpError(422, 'clientIds must be a non-empty array of uuids', {
        code: 'VALIDATION_ERROR',
        field: 'clientIds',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertCommercialUserAssignable(tx, userId);

      const existingClients = await tx.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true },
      });
      if (existingClients.length !== clientIds.length) {
        throw new HttpError(422, 'one or more clientIds do not exist', {
          code: 'CLIENTS_NOT_FOUND',
          field: 'clientIds',
        });
      }

      const existingLinks = await tx.clientCommercialUser.findMany({
        where: { userId, clientId: { in: clientIds } },
        select: { clientId: true },
      });
      const alreadyLinkedIds = new Set(existingLinks.map((l) => l.clientId));
      const toAddIds = clientIds.filter((id) => !alreadyLinkedIds.has(id));

      if (toAddIds.length > 0) {
        await tx.clientCommercialUser.createMany({
          data: toAddIds.map((clientId) => ({ clientId, userId })),
        });

        // 1 audit event por client efetivamente alterado.
        for (const clientId of toAddIds) {
          const beforeRow = await tx.client.findUniqueOrThrow({
            where: { id: clientId },
            select: CLIENT_SUMMARY_SELECT,
          });
          const before = {
            ...buildClientAuditState(beforeRow),
            commercialUserIds: beforeRow.commercialUsers
              .map((e) => e.user?.id)
              .filter((id) => id !== userId),
          };
          const after = buildClientAuditState(beforeRow);
          await this.recordAuditEvent(tx, {
            targetClientId: clientId,
            actorContext: actor,
            eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_UPDATED,
            payload: buildClientAuditPayload(before, after),
          });
        }
      }

      return {
        userId,
        totalRequested: clientIds.length,
        added: toAddIds.length,
        alreadyLinked: alreadyLinkedIds.size,
      };
    });
  }

  async getUserClientsImpact(userId, actorContext) {
    assertAuthenticatedActor(actorContext, 'get user clients impact');
    const normalizedUserId = normalizeCommercialUserId(userId, 'userId');
    if (!normalizedUserId) {
      throw new HttpError(422, 'userId is required', {
        code: 'VALIDATION_ERROR',
        field: 'userId',
      });
    }

    const linkedClients = await this.prisma.client.findMany({
      where: {
        commercialUsers: { some: { userId: normalizedUserId } },
      },
      select: {
        id: true,
        code: true,
        personType: true,
        fullName: true,
        legalName: true,
        tradeName: true,
        status: true,
        commercialUsers: {
          select: { user: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { code: 'asc' },
    });

    const soleCustodianOf = [];
    const coCustodianOf = [];
    for (const client of linkedClients) {
      const summary = {
        id: client.id,
        code: client.code,
        displayName: buildClientDisplayName(client),
        status: client.status,
      };
      if (client.commercialUsers.length === 1) {
        soleCustodianOf.push(summary);
      } else {
        coCustodianOf.push({
          ...summary,
          otherUsers: client.commercialUsers
            .filter((entry) => entry.user.id !== normalizedUserId)
            .map((entry) => ({ id: entry.user.id, fullName: entry.user.fullName })),
        });
      }
    }

    return {
      userId: normalizedUserId,
      totalLinks: linkedClients.length,
      soleCustodianOf,
      coCustodianOf,
    };
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
          status: CLIENT_STATUSES.ACTIVE,
        },
        select: CLIENT_SUMMARY_SELECT,
      });

      await this.recordAuditEvent(tx, {
        targetClientId: updated.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_REACTIVATED,
        reasonText,
        payload: {
          before: {
            status: current.status,
          },
          after: {
            status: updated.status,
          },
        },
      });

      return {
        client: mapClientRow(updated),
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
          targetClientId: clientId,
        },
        orderBy: [{ createdAt: 'desc' }, { eventId: 'desc' }],
        skip,
        take: limit,
        include: {
          actorUser: {
            select: {
              id: true,
              fullName: true,
              username: true,
            },
          },
          targetClient: {
            select: {
              id: true,
              code: true,
              personType: true,
              fullName: true,
              legalName: true,
              status: true,
            },
          },
          targetBranch: {
            select: {
              id: true,
              name: true,
              code: true,
              isPrimary: true,
              cnpj: true,
              legalName: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.clientAuditEvent.count({
        where: {
          targetClientId: clientId,
        },
      }),
    ]);

    return {
      items: items.map((item) => toClientAuditEventResponse(item)),
      page: buildClientListPage(total, page, limit),
    };
  }

  // F5.2: createBranch substitui createRegistration. Branch e fonte unica.
  // Re-deriva client.cnpjRoot a partir da primary se a branch criada for primary
  // ou se for a primeira branch do client (PJ).
  async createBranch(clientId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'create client branch');
    const { isPrimary, data } = normalizeCreateBranchInput(input);

    return this.prisma.$transaction(async (tx) => {
      const client = await this.requireClientById(tx, clientId);

      if (data.cnpj) {
        await this.assertBranchCnpjAvailable(tx, data.cnpj);
      }
      if (data.registrationNumberCanonical) {
        await this.assertBranchRegistrationCanonicalAvailable(tx, data.registrationNumberCanonical);
      }

      const aggregate = await tx.clientBranch.aggregate({
        where: { clientId: client.id },
        _max: { code: true },
        _count: { _all: true },
      });
      const isFirst = (aggregate._count?._all ?? 0) === 0;
      const nextCode = (aggregate._max?.code ?? 0) + 1;
      const finalIsPrimary = isPrimary || isFirst;

      // Se este branch sera primary, demote os outros primary do mesmo client
      if (finalIsPrimary && !isFirst) {
        await tx.clientBranch.updateMany({
          where: { clientId: client.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const created = await tx.clientBranch.create({
        data: {
          id: randomUUID(),
          clientId: client.id,
          isPrimary: finalIsPrimary,
          code: nextCode,
          status: 'ACTIVE',
          ...data,
        },
        select: CLIENT_BRANCH_SUMMARY_SELECT,
      });

      // Se PJ e primary mudou, atualiza cnpjRoot do client
      if (finalIsPrimary && client.personType === CLIENT_PERSON_TYPES.PJ && created.cnpj) {
        await tx.client.update({
          where: { id: client.id },
          data: { cnpjRoot: created.cnpj.slice(0, 8) },
        });
      }

      await this.recordAuditEvent(tx, {
        targetClientId: client.id,
        targetBranchId: created.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_BRANCH_CREATED,
        payload: { after: buildBranchAuditState(created) },
      });

      return {
        client: {
          id: client.id,
          code: client.code,
          displayName: buildClientDisplayName(client),
        },
        branch: toClientBranchSummary({ ...created, clientId: client.id }),
      };
    });
  }

  async updateBranch(clientId, branchId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'update client branch');
    const { reasonText, isPrimary, data } = normalizeUpdateBranchInput(input);

    return this.prisma.$transaction(async (tx) => {
      const client = await this.requireClientById(tx, clientId);
      const current = await this.requireBranchById(tx, clientId, branchId);

      if (data.cnpj && data.cnpj !== current.cnpj) {
        await this.assertBranchCnpjAvailable(tx, data.cnpj, { excludeBranchId: current.id });
      }
      if (
        data.registrationNumberCanonical &&
        data.registrationNumberCanonical !== current.registrationNumberCanonical
      ) {
        await this.assertBranchRegistrationCanonicalAvailable(
          tx,
          data.registrationNumberCanonical,
          {
            excludeBranchId: current.id,
          }
        );
      }

      const before = buildBranchAuditState(current);
      const afterCandidate = buildBranchAuditState({ ...current, ...data });
      if (isPrimary !== undefined) {
        afterCandidate.isPrimary = isPrimary;
      }
      const auditPayload = buildClientAuditPayload(before, afterCandidate);
      if (Object.keys(auditPayload.diff.after).length === 0) {
        throw new HttpError(409, 'No client branch changes detected');
      }

      // Se promovendo outra branch a primary, demote a atual primary primeiro
      if (isPrimary === true && current.isPrimary !== true) {
        await tx.clientBranch.updateMany({
          where: { clientId: client.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const updated = await tx.clientBranch.update({
        where: { id: current.id },
        data: {
          ...data,
          ...(isPrimary !== undefined ? { isPrimary } : {}),
        },
        select: CLIENT_BRANCH_SUMMARY_SELECT,
      });

      // Re-derivar cnpjRoot do client se a branch atual ou a nova primary mudou cnpj
      if (client.personType === CLIENT_PERSON_TYPES.PJ) {
        const primary = await tx.clientBranch.findFirst({
          where: { clientId: client.id, isPrimary: true },
          select: { cnpj: true },
        });
        const nextRoot = primary?.cnpj ? primary.cnpj.slice(0, 8) : null;
        if (nextRoot !== client.cnpjRoot) {
          await tx.client.update({
            where: { id: client.id },
            data: { cnpjRoot: nextRoot },
          });
        }
      }

      await this.recordAuditEvent(tx, {
        targetClientId: client.id,
        targetBranchId: updated.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_BRANCH_UPDATED,
        reasonText,
        payload: auditPayload,
      });

      return {
        client: {
          id: client.id,
          code: client.code,
          displayName: buildClientDisplayName(client),
        },
        branch: toClientBranchSummary({ ...updated, clientId: client.id }),
      };
    });
  }

  async inactivateBranch(clientId, branchId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'inactivate client branch');
    const { reasonText } = normalizeStatusReasonInput(input);

    return this.prisma.$transaction(async (tx) => {
      const client = await this.requireClientById(tx, clientId);
      const current = await this.requireBranchById(tx, clientId, branchId);
      if (current.status === CLIENT_BRANCH_STATUSES.INACTIVE) {
        throw new HttpError(409, 'Client branch is already inactive');
      }

      const usage = await this.countBranchUsage(tx, current.id);

      // F6.0: se inativando a matriz, auto-promove a proxima ACTIVE por code asc
      // (excluindo a propria que esta sendo inativada). Atualiza cnpjRoot do
      // client a partir do CNPJ da nova matriz. Se nenhuma outra ACTIVE existe,
      // client fica em estado transient (cnpjRoot null).
      let autoPromotedBranch = null;
      if (current.isPrimary === true) {
        autoPromotedBranch = await tx.clientBranch.findFirst({
          where: {
            clientId: client.id,
            status: CLIENT_BRANCH_STATUSES.ACTIVE,
            id: { not: current.id },
          },
          orderBy: [{ code: 'asc' }],
          select: CLIENT_BRANCH_SUMMARY_SELECT,
        });
      }

      // Atualiza branch atual para INACTIVE primeiro (e demote isPrimary se era
      // matriz) — garante que nao ha colisao com uq_client_branch_primary_per_client
      // ao promover a proxima.
      const updated = await tx.clientBranch.update({
        where: { id: current.id },
        data: {
          status: CLIENT_BRANCH_STATUSES.INACTIVE,
          ...(current.isPrimary === true ? { isPrimary: false } : {}),
        },
        select: CLIENT_BRANCH_SUMMARY_SELECT,
      });

      if (current.isPrimary === true) {
        if (autoPromotedBranch) {
          // Promove a proxima ACTIVE
          await tx.clientBranch.update({
            where: { id: autoPromotedBranch.id },
            data: { isPrimary: true },
          });
          // Atualiza cnpjRoot do client se PJ e nova primary tem cnpj
          if (client.personType === CLIENT_PERSON_TYPES.PJ) {
            const newRoot = autoPromotedBranch.cnpj ? autoPromotedBranch.cnpj.slice(0, 8) : null;
            if (newRoot !== client.cnpjRoot) {
              await tx.client.update({
                where: { id: client.id },
                data: { cnpjRoot: newRoot },
              });
            }
          }
          // Audit event de promocao automatica
          await this.recordAuditEvent(tx, {
            targetClientId: client.id,
            targetBranchId: autoPromotedBranch.id,
            actorContext: actor,
            eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_BRANCH_UPDATED,
            payload: {
              before: { isPrimary: false },
              after: { isPrimary: true },
              autoPromoted: true,
              triggeredBy: { branchId: current.id, action: 'inactivate' },
            },
          });
        } else if (client.personType === CLIENT_PERSON_TYPES.PJ && client.cnpjRoot) {
          // Nenhuma outra ACTIVE — zera cnpjRoot (transient)
          await tx.client.update({
            where: { id: client.id },
            data: { cnpjRoot: null },
          });
        }
      }

      await this.recordAuditEvent(tx, {
        targetClientId: client.id,
        targetBranchId: updated.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_BRANCH_INACTIVATED,
        reasonText,
        payload: {
          before: { status: current.status, isPrimary: current.isPrimary === true },
          after: { status: updated.status, isPrimary: false },
          impact: usage,
          autoPromotedBranchId: autoPromotedBranch?.id ?? null,
        },
      });

      return {
        client: {
          id: client.id,
          code: client.code,
          displayName: buildClientDisplayName(client),
        },
        branch: toClientBranchSummary({ ...updated, clientId: client.id }),
        impact: usage,
        autoPromoted: autoPromotedBranch
          ? toClientBranchSummary({ ...autoPromotedBranch, isPrimary: true, clientId: client.id })
          : null,
      };
    });
  }

  async reactivateBranch(clientId, branchId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'reactivate client branch');
    const { reasonText } = normalizeStatusReasonInput(input);

    return this.prisma.$transaction(async (tx) => {
      const client = await this.requireClientById(tx, clientId);
      const current = await this.requireBranchById(tx, clientId, branchId);
      if (current.status === CLIENT_BRANCH_STATUSES.ACTIVE) {
        throw new HttpError(409, 'Client branch is already active');
      }

      const updated = await tx.clientBranch.update({
        where: { id: current.id },
        data: { status: CLIENT_BRANCH_STATUSES.ACTIVE },
        select: CLIENT_BRANCH_SUMMARY_SELECT,
      });

      await this.recordAuditEvent(tx, {
        targetClientId: client.id,
        targetBranchId: updated.id,
        actorContext: actor,
        eventType: CLIENT_AUDIT_EVENT_TYPES.CLIENT_BRANCH_REACTIVATED,
        reasonText,
        payload: {
          before: { status: current.status },
          after: { status: updated.status },
        },
      });

      return {
        client: {
          id: client.id,
          code: client.code,
          displayName: buildClientDisplayName(client),
        },
        branch: toClientBranchSummary({ ...updated, clientId: client.id }),
      };
    });
  }
}
