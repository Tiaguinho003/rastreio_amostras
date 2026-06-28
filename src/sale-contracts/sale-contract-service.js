import { randomUUID } from 'node:crypto';

import { assertRoleAllowed, USER_ROLES } from '../auth/roles.js';
import { HttpError } from '../contracts/errors.js';
import { assertAuthenticatedActor, readLimitQuery } from '../users/user-support.js';
import {
  buildBankSnapshot,
  buildPartySnapshot,
  buildWarehouseSnapshot,
  computeContractMoneyWithAgio,
  normalizeActionDate,
  normalizeEtapa2Input,
  normalizeWashoutReason,
  resolveRevertTarget,
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
  // commandService + queryService sao opcionais (usados so no D48 — sincronizar
  // o vendedor do contrato com o Sample.ownerClientId via updateRegistration).
  constructor({ prisma, commandService = null, queryService = null }) {
    this.prisma = prisma;
    this.commandService = commandService;
    this.queryService = queryService;
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

  // Fechamento (Fase B.2 Passo 2): "Emitir" — salva os campos da etapa 2,
  // monta os snapshots, recalcula o total (com agio/desagio) e leva o status de
  // EM_ABERTO|CONFERIR -> CONFERIR (regeneravel apos "Editar"). Grava 1 linha de
  // auditoria (SaleContractExport). O PDF real entra na Fase C neste mesmo ponto.
  async emitSaleContract(contractId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'emit sale contract');
    assertRoleAllowed(actorContext.role, SALE_CONTRACT_MANAGE_ROLES, 'emit sale contract');
    this._requireContractId(contractId);

    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const etapa2 = normalizeEtapa2Input(input ?? {});

    const contract = await this.prisma.saleContract.findUnique({ where: { id: contractId } });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    if (contract.status !== 'EM_ABERTO' && contract.status !== 'CONFERIR') {
      throw new HttpError(409, `Sale contract is ${contract.status} and cannot be emitted`, {
        code: 'SALE_CONTRACT_NOT_EMITTABLE',
      });
    }
    if (contract.version !== expectedVersion) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    // Vendedor: usa o editado (se veio) ou o atual do contrato.
    const sellerClientId = etapa2.sellerClientId ?? contract.sellerClientId;
    if (!sellerClientId) {
      throw new HttpError(422, 'sellerClientId is required to emit the contract', {
        code: 'VALIDATION_ERROR',
        field: 'sellerClientId',
      });
    }
    const sellerClient = await this._requireClient(sellerClientId, 'sellerClientId');
    const sellerUnit = await this._resolvePartyUnit(
      sellerClient,
      etapa2.sellerUnitId,
      'sellerUnitId'
    );

    const buyerClient = contract.buyerClientId
      ? await this._requireClient(contract.buyerClientId, 'buyerClientId')
      : null;
    const buyerUnit = await this._resolvePartyUnit(buyerClient, etapa2.buyerUnitId, 'buyerUnitId');

    const bankAccount = await this._requireSellerBankAccount(
      etapa2.sellerBankAccountId,
      sellerClientId
    );

    const buyerWarehouse = etapa2.buyerWarehouseClientId
      ? await this._requireClient(etapa2.buyerWarehouseClientId, 'buyerWarehouseClientId')
      : null;
    const sellerWarehouse = etapa2.sellerWarehouseClientId
      ? await this._requireClient(etapa2.sellerWarehouseClientId, 'sellerWarehouseClientId')
      : null;

    const paymentForm = await this._requireLookup(
      'contractPaymentForm',
      etapa2.paymentFormId,
      'paymentFormId'
    );
    const modality = await this._requireLookup('contractModality', etapa2.modalityId, 'modalityId');
    const packaging = await this._requireLookup(
      'contractPackaging',
      etapa2.packagingId,
      'packagingId'
    );

    const money = computeContractMoneyWithAgio({
      unitPrice: Number(contract.unitPrice),
      quantitySacks: contract.quantitySacks,
      sellerPct: Number(contract.sellerBrokeragePct),
      buyerPct: Number(contract.buyerBrokeragePct),
      agioType: etapa2.agioDesagioType,
      agioValue: etapa2.agioDesagioValue,
    });

    // D48: contrato a vista (tem sampleId) -> mantem o dono da amostra coerente
    // com o vendedor do contrato. Feito ANTES do update do contrato
    // (cross-aggregate nao-atomico — ver plano). No-op se ja coerente.
    if (contract.sampleId) {
      await this._syncSampleOwner(contract.sampleId, sellerClientId, actorContext);
    }

    const data = {
      status: 'CONFERIR',
      sellerClientId,
      sellerUnitId: sellerUnit?.id ?? null,
      sellerSnapshot: buildPartySnapshot(sellerClient, sellerUnit),
      buyerUnitId: buyerUnit?.id ?? null,
      buyerSnapshot: buildPartySnapshot(buyerClient, buyerUnit),
      buyerWarehouseClientId: buyerWarehouse?.id ?? null,
      buyerWarehouseSnapshot: buildWarehouseSnapshot(buyerWarehouse),
      sellerWarehouseClientId: sellerWarehouse?.id ?? null,
      sellerWarehouseSnapshot: buildWarehouseSnapshot(sellerWarehouse),
      sellerBankAccountId: bankAccount.id,
      sellerBankSnapshot: buildBankSnapshot(bankAccount),
      agioDesagioType: etapa2.agioDesagioType,
      agioDesagioValue: etapa2.agioDesagioValue,
      totalValue: money.totalValue,
      sellerBrokerageValue: money.sellerBrokerageValue,
      buyerBrokerageValue: money.buyerBrokerageValue,
      weightKg: etapa2.weightKg,
      purchaseNumber: etapa2.purchaseNumber,
      paymentCondition: etapa2.paymentCondition,
      paymentFormId: paymentForm.id,
      paymentFormText: paymentForm.name,
      modalityId: modality.id,
      modalityText: modality.name,
      packagingId: packaging.id,
      packagingText: packaging.name,
      invoiceDate: etapa2.invoiceDate,
      paymentDate: etapa2.paymentDate,
      observations: etapa2.observations,
      description: etapa2.description,
    };

    const result = await this.prisma.saleContract.updateMany({
      where: { id: contractId, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    await this.prisma.saleContractExport.create({
      data: {
        id: randomUUID(),
        saleContractId: contractId,
        contractType: contract.type,
        generatedByUserId: actorContext.actorUserId ?? null,
      },
    });

    return this.getSaleContract(contractId, actorContext);
  }

  // "Confirmar" — CONFERIR -> CONFIRMADO. Congela (sem mais emit/edit). Sem PDF
  // novo (D47). Snapshots ja foram gravados no ultimo "Emitir".
  async confirmSaleContract(contractId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'confirm sale contract');
    assertRoleAllowed(actorContext.role, SALE_CONTRACT_MANAGE_ROLES, 'confirm sale contract');
    this._requireContractId(contractId);
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, version: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    if (contract.status !== 'CONFERIR') {
      throw new HttpError(409, `Sale contract is ${contract.status} and cannot be confirmed`, {
        code: 'SALE_CONTRACT_NOT_CONFIRMABLE',
      });
    }

    const result = await this.prisma.saleContract.updateMany({
      where: { id: contractId, version: expectedVersion, status: 'CONFERIR' },
      data: { status: 'CONFIRMADO', version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    return this.getSaleContract(contractId, actorContext);
  }

  // "Faturar" — CONFIRMADO -> FATURADO. Grava a data REAL do faturamento
  // (invoicedAt; pode diferir da planejada invoiceDate). Reversivel via
  // revertSaleContractStatus. CRUD direto + concorrencia otimista por version.
  async invoiceSaleContract(contractId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'invoice sale contract');
    assertRoleAllowed(actorContext.role, SALE_CONTRACT_MANAGE_ROLES, 'invoice sale contract');
    this._requireContractId(contractId);
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const invoicedAt = normalizeActionDate(input?.date, 'date');

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, version: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    if (contract.status !== 'CONFIRMADO') {
      throw new HttpError(409, `Sale contract is ${contract.status} and cannot be invoiced`, {
        code: 'SALE_CONTRACT_NOT_INVOICEABLE',
      });
    }
    if (contract.version !== expectedVersion) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    const result = await this.prisma.saleContract.updateMany({
      where: { id: contractId, version: expectedVersion, status: 'CONFIRMADO' },
      data: { status: 'FATURADO', invoicedAt, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    return this.getSaleContract(contractId, actorContext);
  }

  // "Pagar" — CONFIRMADO ou FATURADO -> PAGO (pode pular o faturamento). Grava a
  // data REAL do pagamento (paidAt). Reversivel.
  async paySaleContract(contractId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'pay sale contract');
    assertRoleAllowed(actorContext.role, SALE_CONTRACT_MANAGE_ROLES, 'pay sale contract');
    this._requireContractId(contractId);
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const paidAt = normalizeActionDate(input?.date, 'date');

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, version: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    if (contract.status !== 'CONFIRMADO' && contract.status !== 'FATURADO') {
      throw new HttpError(409, `Sale contract is ${contract.status} and cannot be paid`, {
        code: 'SALE_CONTRACT_NOT_PAYABLE',
      });
    }
    if (contract.version !== expectedVersion) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    const result = await this.prisma.saleContract.updateMany({
      where: {
        id: contractId,
        version: expectedVersion,
        status: { in: ['CONFIRMADO', 'FATURADO'] },
      },
      data: { status: 'PAGO', paidAt, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    return this.getSaleContract(contractId, actorContext);
  }

  // "Desfazer" — volta um passo no ciclo pos-CONFIRMADO (corrige erro de clique).
  // FATURADO -> CONFIRMADO (limpa invoicedAt); PAGO -> FATURADO|CONFIRMADO
  // conforme houve faturamento, limpando paidAt (ver resolveRevertTarget).
  async revertSaleContractStatus(contractId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'revert sale contract status');
    assertRoleAllowed(actorContext.role, SALE_CONTRACT_MANAGE_ROLES, 'revert sale contract status');
    this._requireContractId(contractId);
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, version: true, invoicedAt: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    const target = resolveRevertTarget(contract.status, contract.invoicedAt != null);
    if (!target) {
      throw new HttpError(409, `Sale contract is ${contract.status} and cannot be reverted`, {
        code: 'SALE_CONTRACT_NOT_REVERTABLE',
      });
    }
    if (contract.version !== expectedVersion) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    // Limpa a data do marco desfeito: saindo de FATURADO zera invoicedAt; de
    // PAGO zera paidAt (preservando invoicedAt quando volta a FATURADO).
    const clearedDate = contract.status === 'FATURADO' ? { invoicedAt: null } : { paidAt: null };

    const result = await this.prisma.saleContract.updateMany({
      where: { id: contractId, version: expectedVersion, status: contract.status },
      data: { status: target, ...clearedDate, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    return this.getSaleContract(contractId, actorContext);
  }

  // Quebra MANUAL (P17): CONFERIR/CONFIRMADO/FATURADO/PAGO -> WASH_OUT, cancelando
  // a venda subjacente (devolve as sacas ao lote) com motivo OBRIGATORIO. Delega
  // ao cancelSampleMovement, que grava o SALE_CANCELLED e dispara o washout via
  // washoutOrDeleteSaleContractByMovement na mesma tx. DEFINITIVA (event store
  // append-only — retomar = nova venda/contrato).
  async washoutSaleContract(contractId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'washout sale contract');
    assertRoleAllowed(actorContext.role, SALE_CONTRACT_MANAGE_ROLES, 'washout sale contract');
    this._requireContractId(contractId);
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const reason = normalizeWashoutReason(input?.reason);

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, version: true, sampleId: true, movementId: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    if (!['CONFERIR', 'CONFIRMADO', 'FATURADO', 'PAGO'].includes(contract.status)) {
      throw new HttpError(409, `Sale contract is ${contract.status} and cannot be washed out`, {
        code: 'SALE_CONTRACT_NOT_WASHOUTABLE',
      });
    }
    // A vista: a quebra cancela a venda. Futuro (sem movimento) ainda nao tem
    // backend (D50) -> recusa por ora.
    if (!contract.movementId || !contract.sampleId) {
      throw new HttpError(422, 'Sale contract has no linked sale to wash out', {
        code: 'SALE_CONTRACT_NO_MOVEMENT',
      });
    }
    if (contract.version !== expectedVersion) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }
    if (!this.commandService || !this.queryService) {
      throw new HttpError(501, 'Sale washout is not configured', {
        code: 'SALE_WASHOUT_NOT_CONFIGURED',
      });
    }

    // Cancela a venda na versao corrente do sample; o cancelamento restaura as
    // sacas e marca o contrato WASH_OUT (com o motivo) na mesma transacao.
    const sample = await this.queryService.requireSample(contract.sampleId);
    await this.commandService.cancelSampleMovement(
      {
        sampleId: contract.sampleId,
        movementId: contract.movementId,
        reasonText: reason,
        expectedVersion: sample.version,
      },
      actorContext
    );

    return this.getSaleContract(contractId, actorContext);
  }

  _requireContractId(contractId) {
    if (typeof contractId !== 'string' || contractId.length === 0) {
      throw new HttpError(422, 'contractId is required', {
        code: 'VALIDATION_ERROR',
        field: 'contractId',
      });
    }
  }

  _requireExpectedVersion(value) {
    if (!Number.isInteger(value) || value < 0) {
      throw new HttpError(422, 'expectedVersion must be a non-negative integer', {
        code: 'VALIDATION_ERROR',
        field: 'expectedVersion',
      });
    }
    return value;
  }

  async _requireClient(clientId, field) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      throw new HttpError(422, `${field} does not reference an existing client`, {
        code: 'CLIENT_NOT_FOUND',
        field,
      });
    }
    return client;
  }

  // Filial obrigatoria p/ PF, ignorada p/ PJ (etapa 2). Quando exigida, precisa
  // pertencer ao cliente.
  async _resolvePartyUnit(client, unitId, field) {
    if (!client || client.personType !== 'PF') {
      return null;
    }
    if (!unitId) {
      throw new HttpError(422, `${field} is required for an individual (PF) party`, {
        code: 'VALIDATION_ERROR',
        field,
      });
    }
    const unit = await this.prisma.clientUnit.findFirst({
      where: { id: unitId, clientId: client.id },
    });
    if (!unit) {
      throw new HttpError(422, `${field} does not reference a unit of this client`, {
        code: 'CLIENT_UNIT_NOT_FOUND',
        field,
      });
    }
    return unit;
  }

  async _requireSellerBankAccount(accountId, sellerClientId) {
    const account = await this.prisma.clientBankAccount.findUnique({
      where: { id: accountId },
      include: { bank: { select: { id: true, name: true, compeCode: true } } },
    });
    if (!account || account.clientId !== sellerClientId) {
      throw new HttpError(
        422,
        'sellerBankAccountId does not reference a bank account of the seller',
        { code: 'CLIENT_BANK_ACCOUNT_NOT_FOUND', field: 'sellerBankAccountId' }
      );
    }
    return account;
  }

  async _requireLookup(model, id, field) {
    const row = await this.prisma[model].findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
    if (!row || row.status !== 'ACTIVE') {
      throw new HttpError(422, `${field} does not reference an active option`, {
        code: 'CONTRACT_LOOKUP_NOT_FOUND',
        field,
      });
    }
    return row;
  }

  async _syncSampleOwner(sampleId, newOwnerClientId, actorContext) {
    if (!this.commandService || !this.queryService) {
      throw new HttpError(501, 'Sample owner sync is not configured', {
        code: 'SAMPLE_SYNC_NOT_CONFIGURED',
      });
    }
    const sample = await this.queryService.requireSample(sampleId);
    if ((sample.ownerClientId ?? null) === newOwnerClientId) {
      return; // ja coerente — evita "No registration changes detected"
    }
    await this.commandService.updateRegistration(
      {
        sampleId,
        expectedVersion: sample.version,
        after: { ownerClientId: newOwnerClientId },
        reasonCode: 'DATA_FIX',
        reasonText: 'Vendedor ajustado no contrato (Fechamento)',
      },
      actorContext
    );
  }

  // Fechamento (Fase B.2 Passo 2): as 3 listas da etapa 2 (Forma/Modalidade/
  // Embalagem). Leitura simples (ACTIVE, ordenadas) p/ os selects da etapa 2 —
  // acesso a qualquer autenticado (o gate central ja exclui o PROSPECTOR). A
  // gestao/CRUD das listas fica para depois.
  async listContractLookups(actorContext) {
    assertAuthenticatedActor(actorContext, 'list contract lookups');

    const order = [{ sortOrder: 'asc' }, { name: 'asc' }];
    const select = { id: true, name: true };
    const where = { status: 'ACTIVE' };
    const [paymentForms, modalities, packagings] = await Promise.all([
      this.prisma.contractPaymentForm.findMany({ where, orderBy: order, select }),
      this.prisma.contractModality.findMany({ where, orderBy: order, select }),
      this.prisma.contractPackaging.findMany({ where, orderBy: order, select }),
    ]);

    return { paymentForms, modalities, packagings };
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
