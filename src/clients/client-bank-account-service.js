import { randomUUID } from 'node:crypto';

import { HttpError } from '../contracts/errors.js';
import { assertAuthenticatedActor } from '../users/user-support.js';
import {
  CLIENT_BANK_ACCOUNT_VIEW_SELECT,
  normalizeCreateClientBankAccountInput,
  normalizeUpdateClientBankAccountInput,
  toClientBankAccountView,
} from './client-bank-account-support.js';

function requireId(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpError(422, `${field} is required`, { code: 'VALIDATION_ERROR', field });
  }
}

// Conta bancaria por cliente (Fechamento Fase 0 -- D28). Escopo via clientId
// (sub-entidade do Cliente). Acesso = qualquer usuario autenticado (D59); o
// gate central ja exclui o PROSPECTOR.
export class ClientBankAccountService {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async _assertClientExists(clientId) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      throw new HttpError(404, 'Client not found', { code: 'CLIENT_NOT_FOUND' });
    }
  }

  async _assertBankExists(bankId) {
    const bank = await this.prisma.bank.findUnique({
      where: { id: bankId },
      select: { id: true },
    });
    if (!bank) {
      throw new HttpError(422, 'bankId does not reference an existing bank', {
        code: 'BANK_NOT_FOUND',
        field: 'bankId',
      });
    }
  }

  async listClientBankAccounts(clientId, actorContext) {
    assertAuthenticatedActor(actorContext, 'list client bank accounts');
    requireId(clientId, 'clientId');
    await this._assertClientExists(clientId);

    const rows = await this.prisma.clientBankAccount.findMany({
      where: { clientId },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      select: CLIENT_BANK_ACCOUNT_VIEW_SELECT,
    });
    return { items: rows.map(toClientBankAccountView) };
  }

  async createClientBankAccount(clientId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'create client bank account');
    requireId(clientId, 'clientId');
    await this._assertClientExists(clientId);

    const data = normalizeCreateClientBankAccountInput(input ?? {});
    await this._assertBankExists(data.bankId);

    const created = await this.prisma.clientBankAccount.create({
      data: { id: randomUUID(), clientId, ...data },
      select: CLIENT_BANK_ACCOUNT_VIEW_SELECT,
    });
    return { account: toClientBankAccountView(created) };
  }

  async updateClientBankAccount(clientId, accountId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'update client bank account');
    requireId(clientId, 'clientId');
    requireId(accountId, 'accountId');

    const data = normalizeUpdateClientBankAccountInput(input ?? {});
    if (data.bankId !== undefined) {
      await this._assertBankExists(data.bankId);
    }

    // Escopo: a conta tem que pertencer ao cliente da rota.
    const existing = await this.prisma.clientBankAccount.findFirst({
      where: { id: accountId, clientId },
      select: { id: true },
    });
    if (!existing) {
      throw new HttpError(404, 'Bank account not found', {
        code: 'CLIENT_BANK_ACCOUNT_NOT_FOUND',
      });
    }

    const updated = await this.prisma.clientBankAccount.update({
      where: { id: accountId },
      data,
      select: CLIENT_BANK_ACCOUNT_VIEW_SELECT,
    });
    return { account: toClientBankAccountView(updated) };
  }
}
