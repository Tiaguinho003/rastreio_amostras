import { randomUUID } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';
import { assertRoleAllowed, USER_ROLES } from '../auth/roles.js';
import { assertAuthenticatedActor, readLimitQuery } from '../users/user-support.js';
import {
  BANK_VIEW_SELECT,
  normalizeBankStatus,
  normalizeCreateBankInput,
  normalizeUpdateBankInput,
  toBankView,
} from './bank-support.js';

// Quem pode CADASTRAR/EDITAR bancos -- lookup controlado. Leitura (listBanks)
// e liberada a qualquer usuario autenticado (o gate central ja bloqueia o
// PROSPECTOR), pois o lookup alimenta o cadastro de contas bancarias.
export const BANK_MANAGE_ROLES = Object.freeze([USER_ROLES.ADMIN, USER_ROLES.CADASTRO]);

const BANK_LIST_LIMIT_DEFAULT = 200;
const BANK_LIST_LIMIT_MAX = 500;

export class BankService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  // Mapeia violacao de UNIQUE(compe_code) para 409 com field, no padrao das
  // outras entidades (erro exibivel dentro do campo no frontend).
  _mapUniqueError(error) {
    if (error?.code === 'P2002') {
      return new HttpError(409, 'compeCode already exists for another bank', {
        code: 'BANK_COMPE_CODE_ALREADY_EXISTS',
        field: 'compeCode',
      });
    }
    return error;
  }

  async createBank(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'create bank');
    assertRoleAllowed(actor.role, BANK_MANAGE_ROLES, 'create bank');

    const data = normalizeCreateBankInput(input ?? {});

    let created;
    try {
      created = await this.prisma.bank.create({
        data: { id: randomUUID(), name: data.name, compeCode: data.compeCode },
        select: BANK_VIEW_SELECT,
      });
    } catch (error) {
      throw this._mapUniqueError(error);
    }

    return { bank: toBankView(created) };
  }

  async updateBank(bankId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'update bank');
    assertRoleAllowed(actor.role, BANK_MANAGE_ROLES, 'update bank');

    if (typeof bankId !== 'string' || bankId.length === 0) {
      throw new HttpError(422, 'bankId is required', {
        code: 'VALIDATION_ERROR',
        field: 'bankId',
      });
    }

    const data = normalizeUpdateBankInput(input ?? {});

    let updated;
    try {
      updated = await this.prisma.bank.update({
        where: { id: bankId },
        data,
        select: BANK_VIEW_SELECT,
      });
    } catch (error) {
      if (error?.code === 'P2025') {
        throw new HttpError(404, 'Bank not found', { code: 'BANK_NOT_FOUND' });
      }
      throw this._mapUniqueError(error);
    }

    return { bank: toBankView(updated) };
  }

  async listBanks(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list banks');

    const search = typeof input?.search === 'string' ? input.search.trim() : '';
    const status = input?.status ? normalizeBankStatus(input.status) : null;
    const limit = readLimitQuery(input?.limit, {
      fallback: BANK_LIST_LIMIT_DEFAULT,
      max: BANK_LIST_LIMIT_MAX,
    });

    const where = {};
    if (status) {
      where.status = status;
    }
    if (search.length >= 1) {
      const digits = search.replace(/\D/g, '');
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        ...(digits ? [{ compeCode: { contains: digits } }] : []),
      ];
    }

    const rows = await this.prisma.bank.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      take: limit,
      select: BANK_VIEW_SELECT,
    });

    return { items: rows.map(toBankView) };
  }
}
