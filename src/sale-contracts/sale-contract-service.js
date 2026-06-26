import { assertRoleAllowed, USER_ROLES } from '../auth/roles.js';
import { HttpError } from '../contracts/errors.js';
import { assertAuthenticatedActor, readLimitQuery } from '../users/user-support.js';
import {
  SALE_CONTRACT_STATUSES,
  SALE_CONTRACT_TYPES,
  SALE_CONTRACT_VIEW_SELECT,
  toSaleContractBrokerView,
  toSaleContractView,
} from './sale-contract-support.js';

// Gestao de Contratos (listar/detalhar; no Passo 2 entram completar/emitir/
// confirmar). Decisao desta sessao: acesso restrito a ADMIN + CADASTRO. A
// CRIACAO do contrato NAO passa por aqui -- ela acontece junto da venda a vista
// (SampleCommandService.createSampleMovement), na mesma transacao do evento.
const SALE_CONTRACT_MANAGE_ROLES = [USER_ROLES.ADMIN, USER_ROLES.CADASTRO];

const SALE_CONTRACT_LIST_LIMIT_DEFAULT = 200;
const SALE_CONTRACT_LIST_LIMIT_MAX = 500;

export class SaleContractService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async listSaleContracts(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list sale contracts');
    assertRoleAllowed(actorContext.role, SALE_CONTRACT_MANAGE_ROLES, 'list sale contracts');

    const search = typeof input?.search === 'string' ? input.search.trim() : '';
    const status = input?.status ? this._normalizeStatusFilter(input.status) : null;
    const type = input?.type ? this._normalizeTypeFilter(input.type) : null;
    const limit = readLimitQuery(input?.limit, {
      fallback: SALE_CONTRACT_LIST_LIMIT_DEFAULT,
      max: SALE_CONTRACT_LIST_LIMIT_MAX,
    });

    const where = {};
    if (status) {
      where.status = status;
    }
    if (type) {
      where.type = type;
    }
    if (search.length >= 1) {
      where.OR = [
        { contractNumber: { contains: search, mode: 'insensitive' } },
        { purchaseNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.saleContract.findMany({
      where,
      orderBy: [{ contractSeq: 'desc' }],
      take: limit,
      select: SALE_CONTRACT_VIEW_SELECT,
    });

    return { items: rows.map(toSaleContractView) };
  }

  async getSaleContract(contractId, actorContext) {
    assertAuthenticatedActor(actorContext, 'get sale contract');
    assertRoleAllowed(actorContext.role, SALE_CONTRACT_MANAGE_ROLES, 'get sale contract');

    if (typeof contractId !== 'string' || contractId.length === 0) {
      throw new HttpError(422, 'contractId is required', {
        code: 'VALIDATION_ERROR',
        field: 'contractId',
      });
    }

    const row = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: SALE_CONTRACT_VIEW_SELECT,
    });
    if (!row) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }

    // SaleContract nao tem @relation (refs sao colunas escalares + snapshot) —
    // os corretores vem em consulta separada.
    const brokers = await this.prisma.saleContractBroker.findMany({
      where: { saleContractId: contractId },
      orderBy: [{ createdAt: 'asc' }],
      select: { id: true, brokerId: true, brokerNameSnapshot: true },
    });

    return {
      contract: { ...toSaleContractView(row), brokers: brokers.map(toSaleContractBrokerView) },
    };
  }

  _normalizeStatusFilter(value) {
    const normalized = String(value).trim().toUpperCase();
    if (!SALE_CONTRACT_STATUSES.includes(normalized)) {
      throw new HttpError(422, 'status is invalid', {
        code: 'VALIDATION_ERROR',
        field: 'status',
      });
    }
    return normalized;
  }

  _normalizeTypeFilter(value) {
    const normalized = String(value).trim().toUpperCase();
    if (!SALE_CONTRACT_TYPES.includes(normalized)) {
      throw new HttpError(422, 'type is invalid', {
        code: 'VALIDATION_ERROR',
        field: 'type',
      });
    }
    return normalized;
  }
}
