import { randomUUID } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';
import { assertAuthenticatedActor, readLimitQuery } from '../users/user-support.js';
import {
  BROKER_VIEW_SELECT,
  normalizeBrokerStatus,
  normalizeCreateBrokerInput,
  normalizeUpdateBrokerInput,
  toBrokerView,
} from './broker-support.js';

// Politica de acesso (decisao do Flavio): cadastrar/editar/listar corretores e
// liberado a QUALQUER usuario autenticado -- o gate central de PROSPECTOR
// (src/auth/prospector-access.js) ja exclui o app restrito.

const BROKER_LIST_LIMIT_DEFAULT = 200;
const BROKER_LIST_LIMIT_MAX = 500;

export class BrokerService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  // Distingue qual UNIQUE estourou (userId vs cpf) pelo meta.target do P2002.
  _mapUniqueError(error) {
    if (error?.code === 'P2002') {
      const target = String(error?.meta?.target ?? '');
      if (target.includes('user')) {
        return new HttpError(409, 'user already has a broker profile', {
          code: 'BROKER_USER_ALREADY_LINKED',
          field: 'userId',
        });
      }
      if (target.includes('cpf')) {
        return new HttpError(409, 'cpf already exists for another broker', {
          code: 'BROKER_CPF_ALREADY_EXISTS',
          field: 'cpf',
        });
      }
      return new HttpError(409, 'broker already exists', { code: 'BROKER_ALREADY_EXISTS' });
    }
    return error;
  }

  async _assertUserExists(userId) {
    if (!userId) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new HttpError(422, 'userId does not reference an existing user', {
        code: 'BROKER_USER_NOT_FOUND',
        field: 'userId',
      });
    }
  }

  async createBroker(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'create broker');

    const data = normalizeCreateBrokerInput(input ?? {});
    await this._assertUserExists(data.userId);

    let created;
    try {
      created = await this.prisma.broker.create({
        data: {
          id: randomUUID(),
          name: data.name,
          userId: data.userId,
          cpf: data.cpf,
          phone: data.phone,
          email: data.email,
        },
        select: BROKER_VIEW_SELECT,
      });
    } catch (error) {
      throw this._mapUniqueError(error);
    }

    return { broker: toBrokerView(created) };
  }

  async updateBroker(brokerId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'update broker');

    if (typeof brokerId !== 'string' || brokerId.length === 0) {
      throw new HttpError(422, 'brokerId is required', {
        code: 'VALIDATION_ERROR',
        field: 'brokerId',
      });
    }

    const data = normalizeUpdateBrokerInput(input ?? {});
    if (data.userId !== undefined) {
      await this._assertUserExists(data.userId);
    }

    let updated;
    try {
      updated = await this.prisma.broker.update({
        where: { id: brokerId },
        data,
        select: BROKER_VIEW_SELECT,
      });
    } catch (error) {
      if (error?.code === 'P2025') {
        throw new HttpError(404, 'Broker not found', { code: 'BROKER_NOT_FOUND' });
      }
      throw this._mapUniqueError(error);
    }

    return { broker: toBrokerView(updated) };
  }

  async listBrokers(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list brokers');

    const search = typeof input?.search === 'string' ? input.search.trim() : '';
    const status = input?.status ? normalizeBrokerStatus(input.status) : null;
    const limit = readLimitQuery(input?.limit, {
      fallback: BROKER_LIST_LIMIT_DEFAULT,
      max: BROKER_LIST_LIMIT_MAX,
    });

    const where = {};
    if (status) {
      where.status = status;
    }
    if (search.length >= 1) {
      const digits = search.replace(/\D/g, '');
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        ...(digits ? [{ cpf: { contains: digits } }] : []),
      ];
    }

    const rows = await this.prisma.broker.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      take: limit,
      select: BROKER_VIEW_SELECT,
    });

    return { items: rows.map(toBrokerView) };
  }
}
