import { randomUUID } from 'node:crypto';

import { assertRoleAllowed, USER_ROLES } from '../auth/roles.js';
import { HttpError } from '../contracts/errors.js';
import { assertAuthenticatedActor, readLimitQuery } from '../users/user-support.js';
import {
  assertBrokersResolved,
  buildBankSnapshot,
  buildPartySnapshot,
  buildWarehouseSnapshot,
  computeContractMoney,
  computeContractMoneyWithAgio,
  formatContractNumber,
  normalizeActionDate,
  normalizeEtapa2Input,
  normalizeFutureSaleContractInput,
  normalizeWashoutReason,
  resolveRevertTarget,
  SALE_CONTRACT_STATUSES,
  SALE_CONTRACT_TYPES,
  SALE_CONTRACT_VIEW_SELECT,
  toSaleContractBrokerView,
  toSaleContractView,
} from './sale-contract-support.js';

// Gestao de Contratos (listar/detalhar/completar/emitir/confirmar/faturar/pagar/
// reverter/quebrar). Acesso restrito a ADMIN (CADASTRO saiu em 2026-06-28). A
// CRIACAO do contrato NAO passa por aqui -- ela acontece junto da venda a vista
// (SampleCommandService.createSampleMovement), na mesma transacao do evento.
const SALE_CONTRACT_MANAGE_ROLES = [USER_ROLES.ADMIN];

// Mesma chave do gerador do numero em src/events/prisma-event-store.js (NNNN
// global, compartilhado a vista + Futuro). pg_advisory_xact_lock serializa a
// alocacao do contract_seq na criacao do contrato Futuro (sem movimento).
const SALE_CONTRACT_SEQ_LOCK_KEY = 831202606;

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

    // Liga? — em liga as sacas sao travadas (F7.1: venda = 100%). O front usa isto
    // pra deixar o campo de sacas so-leitura no "Editar". So consulta se ha sample.
    let sampleIsBlend = null;
    if (row.sampleId) {
      const sample = await this.prisma.sample.findUnique({
        where: { id: row.sampleId },
        select: { isBlend: true },
      });
      sampleIsBlend = sample?.isBlend ?? null;
    }

    return {
      contract: {
        ...toSaleContractView(row),
        brokers: brokers.map(toSaleContractBrokerView),
        sampleIsBlend,
      },
    };
  }

  // Fechamento (Futuro): cria um contrato FUTURO direto no SaleContract — SEM
  // lote (sampleId/movementId nulos, D51). Captura a fase 1 (comprador + termos
  // comerciais + corretores); o VENDEDOR e o resto vem no emit (1 modal so). O
  // numero NNNN/AA usa a MESMA sequencia global do a vista, sob advisory lock.
  // Status nasce EM_ABERTO; o frontend chama emit em seguida (-> CONFERIR).
  async createFutureSaleContract(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'create future sale contract');
    assertRoleAllowed(actorContext.role, SALE_CONTRACT_MANAGE_ROLES, 'create future sale contract');

    const data = normalizeFutureSaleContractInput(input ?? {});
    const buyerClient = await this._requireClient(data.buyerClientId, 'buyerClientId');

    // Corretores: resolve nomes + valida ativos (fora da tx — leitura).
    const brokers = await this.prisma.broker.findMany({
      where: { id: { in: data.brokerIds } },
      select: { id: true, name: true, status: true },
    });
    assertBrokersResolved(brokers, data.brokerIds);
    const nameById = new Map(brokers.map((broker) => [broker.id, broker.name]));

    const money = computeContractMoney({
      unitPrice: data.unitPrice,
      quantitySacks: data.quantitySacks,
      sellerPct: data.sellerBrokeragePct,
      buyerPct: data.buyerBrokeragePct,
    });

    const contractId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SALE_CONTRACT_SEQ_LOCK_KEY}::bigint)`;
      const rows = await tx.$queryRaw`
        SELECT COALESCE(MAX(contract_seq), 0) + 1 AS next FROM sale_contract`;
      const seq = Number(rows?.[0]?.next ?? 1);
      const contractNumber = formatContractNumber(seq, new Date().getFullYear());

      await tx.saleContract.create({
        data: {
          id: contractId,
          type: 'FUTURO',
          status: 'EM_ABERTO',
          contractSeq: seq,
          contractNumber,
          contractDate: new Date(data.contractDate),
          sampleId: null,
          movementId: null,
          sellerClientId: null,
          sellerSnapshot: null,
          buyerClientId: buyerClient.id,
          buyerSnapshot: buildPartySnapshot(buyerClient),
          quantitySacks: data.quantitySacks,
          unitPrice: data.unitPrice.toFixed(2),
          totalValue: money.totalValue,
          sellerBrokeragePct: data.sellerBrokeragePct.toFixed(2),
          sellerBrokerageValue: money.sellerBrokerageValue,
          buyerBrokeragePct: data.buyerBrokeragePct.toFixed(2),
          buyerBrokerageValue: money.buyerBrokerageValue,
          version: 0,
        },
      });
      await tx.saleContractBroker.createMany({
        data: data.brokerIds.map((brokerId) => ({
          id: randomUUID(),
          saleContractId: contractId,
          brokerId,
          brokerNameSnapshot: nameById.get(brokerId),
        })),
      });
    });

    return this.getSaleContract(contractId, actorContext);
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

    // Comprador: usa o editado (se veio) ou o atual do contrato (P20).
    const buyerClientId = etapa2.buyerClientId ?? contract.buyerClientId;
    const buyerClient = buyerClientId
      ? await this._requireClient(buyerClientId, 'buyerClientId')
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

    // Fase 1 (venda) editavel no "Editar" — usa os valores novos quando vierem
    // (sf), senao mantem os do contrato. O comprador segue pela etapa 2 (acima).
    const sf = etapa2.saleFields;
    const effQuantitySacks = sf ? sf.quantitySacks : contract.quantitySacks;
    const effUnitPrice = sf ? sf.unitPrice : Number(contract.unitPrice);
    const effSellerPct = sf ? sf.sellerBrokeragePct : Number(contract.sellerBrokeragePct);
    const effBuyerPct = sf ? sf.buyerBrokeragePct : Number(contract.buyerBrokeragePct);

    const money = computeContractMoneyWithAgio({
      unitPrice: effUnitPrice,
      quantitySacks: effQuantitySacks,
      sellerPct: effSellerPct,
      buyerPct: effBuyerPct,
      agioType: etapa2.agioDesagioType,
      agioValue: etapa2.agioDesagioValue,
    });

    // D48: contrato a vista (tem sampleId) -> mantem o dono da amostra coerente
    // com o vendedor do contrato. Feito ANTES do update do contrato
    // (cross-aggregate nao-atomico — ver plano). No-op se ja coerente.
    if (contract.sampleId) {
      await this._syncSampleOwner(contract.sampleId, sellerClientId, actorContext);
    }

    // Venda do lote coerente com o contrato à vista, via SALE_UPDATED
    // (append-only): comprador (P20) + sacas/data (Editar fase 1). Depois do sync
    // do vendedor (que bumpa a versao do sample). So a vista (tem movementId).
    if (contract.sampleId && contract.movementId) {
      await this._syncMovementFromContract(
        contract.sampleId,
        contract.movementId,
        {
          buyerClientId: buyerClientId || undefined,
          quantitySacks: sf ? sf.quantitySacks : undefined,
          movementDate: sf ? sf.contractDate : undefined,
        },
        actorContext
      );
    }

    const data = {
      status: 'CONFERIR',
      sellerClientId,
      sellerUnitId: sellerUnit?.id ?? null,
      sellerSnapshot: buildPartySnapshot(sellerClient, sellerUnit),
      buyerClientId,
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

    // Editar fase 1: grava as colunas da venda no contrato (o movimento já foi
    // sincronizado acima). No wizard create→emit (sf ausente) nada disso muda.
    if (sf) {
      data.quantitySacks = effQuantitySacks;
      data.unitPrice = effUnitPrice.toFixed(2);
      data.sellerBrokeragePct = effSellerPct.toFixed(2);
      data.buyerBrokeragePct = effBuyerPct.toFixed(2);
      data.contractDate = new Date(sf.contractDate);
    }

    // Corretores (Editar fase 1): resolve fora da tx (leitura) e troca dentro.
    let brokerRows = null;
    if (sf) {
      const brokers = await this.prisma.broker.findMany({
        where: { id: { in: sf.brokerIds } },
        select: { id: true, name: true, status: true },
      });
      assertBrokersResolved(brokers, sf.brokerIds);
      const nameById = new Map(brokers.map((broker) => [broker.id, broker.name]));
      brokerRows = sf.brokerIds.map((brokerId) => ({
        id: randomUUID(),
        saleContractId: contractId,
        brokerId,
        brokerNameSnapshot: nameById.get(brokerId),
      }));
    }

    // Update do contrato + troca de corretores + auditoria numa só transação
    // (concorrência otimista por version mantida no updateMany).
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.saleContract.updateMany({
        where: { id: contractId, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new HttpError(409, 'Sale contract was modified concurrently', {
          code: 'SALE_CONTRACT_VERSION_CONFLICT',
          field: 'expectedVersion',
        });
      }
      if (brokerRows) {
        await tx.saleContractBroker.deleteMany({ where: { saleContractId: contractId } });
        await tx.saleContractBroker.createMany({ data: brokerRows });
      }
      await tx.saleContractExport.create({
        data: {
          id: randomUUID(),
          saleContractId: contractId,
          contractType: contract.type,
          generatedByUserId: actorContext.actorUserId ?? null,
        },
      });
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
    if (contract.version !== expectedVersion) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    // Futuro (sem lote): nao ha venda a cancelar nem sacas a devolver — marca
    // WASH_OUT + motivo/data direto no contrato.
    if (!contract.movementId || !contract.sampleId) {
      const result = await this.prisma.saleContract.updateMany({
        where: { id: contractId, version: expectedVersion, status: contract.status },
        data: {
          status: 'WASH_OUT',
          washoutReason: reason,
          washoutAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new HttpError(409, 'Sale contract was modified concurrently', {
          code: 'SALE_CONTRACT_VERSION_CONFLICT',
          field: 'expectedVersion',
        });
      }
      return this.getSaleContract(contractId, actorContext);
    }

    if (!this.commandService || !this.queryService) {
      throw new HttpError(501, 'Sale washout is not configured', {
        code: 'SALE_WASHOUT_NOT_CONFIGURED',
      });
    }

    // A vista: cancela a venda na versao corrente do sample; o cancelamento
    // restaura as sacas e marca o contrato WASH_OUT (com o motivo) na mesma tx.
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

  // Cancelar um contrato EM_ABERTO (venda registrada, sem documento gerado):
  // descarta o contrato e DESFAZ a venda subjacente (devolve as sacas ao lote).
  // Delega ao cancelSampleMovement, que no EM_ABERTO DELETA o contrato via
  // washoutOrDeleteSaleContractByMovement (na mesma tx). Motivo padrao interno —
  // e o descarte de um rascunho, sem justificativa do usuario. DEFINITIVO.
  async cancelSaleContract(contractId, input, actorContext) {
    assertAuthenticatedActor(actorContext, 'cancel sale contract');
    assertRoleAllowed(actorContext.role, SALE_CONTRACT_MANAGE_ROLES, 'cancel sale contract');
    this._requireContractId(contractId);
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, version: true, sampleId: true, movementId: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    // So o EM_ABERTO e cancelavel (descartavel). CONFERIR+ usa "Quebrar" (washout).
    if (contract.status !== 'EM_ABERTO') {
      throw new HttpError(409, `Sale contract is ${contract.status} and cannot be cancelled`, {
        code: 'SALE_CONTRACT_NOT_CANCELABLE',
      });
    }
    if (contract.version !== expectedVersion) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    // Futuro (sem lote): nao ha venda a desfazer — apaga o contrato direto
    // (corretores antes; FK RESTRICT). Guard por version/status na mesma tx.
    if (!contract.movementId || !contract.sampleId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.saleContractBroker.deleteMany({ where: { saleContractId: contractId } });
        const del = await tx.saleContract.deleteMany({
          where: { id: contractId, version: expectedVersion, status: 'EM_ABERTO' },
        });
        if (del.count === 0) {
          throw new HttpError(409, 'Sale contract was modified concurrently', {
            code: 'SALE_CONTRACT_VERSION_CONFLICT',
            field: 'expectedVersion',
          });
        }
      });
      return { deleted: true, contractId };
    }

    if (!this.commandService || !this.queryService) {
      throw new HttpError(501, 'Sale cancel is not configured', {
        code: 'SALE_CANCEL_NOT_CONFIGURED',
      });
    }

    // A vista: cancela a venda na versao corrente do sample; no EM_ABERTO o
    // cancelamento restaura as sacas e DELETA o contrato (washoutOrDeleteSaleContractByMovement).
    const sample = await this.queryService.requireSample(contract.sampleId);
    await this.commandService.cancelSampleMovement(
      {
        sampleId: contract.sampleId,
        movementId: contract.movementId,
        reasonText: 'Contrato em aberto cancelado',
        expectedVersion: sample.version,
      },
      actorContext
    );

    // O contrato deixou de existir — nada a retornar alem da confirmacao.
    return { deleted: true, contractId };
  }

  // Preview (so-leitura) do PROXIMO numero NNNN/AA — pro modal de venda mostrar
  // qual sera o numero ANTES de criar. So indicativo: sem lock, e o numero real
  // e alocado de fato na criacao (allocateNextContractSeq). Corrida = 2 previews
  // iguais e aceitavel (o unique constraint garante a unicidade na criacao).
  async getNextContractNumber(actorContext) {
    assertAuthenticatedActor(actorContext, 'get next contract number');
    assertRoleAllowed(actorContext.role, SALE_CONTRACT_MANAGE_ROLES, 'get next contract number');
    const rows = await this.prisma.$queryRaw`
      SELECT COALESCE(MAX(contract_seq), 0) + 1 AS next FROM sale_contract
    `;
    const nextSeq = Number(rows?.[0]?.next ?? 1);
    return { contractNumber: formatContractNumber(nextSeq, new Date().getFullYear()) };
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

  // Sincroniza a VENDA do lote (movimento) com o contrato à vista via
  // updateSampleMovement -> SALE_UPDATED (append-only, preserva o histórico e
  // ajusta o saldo do lote). Monta o `after` SÓ com o que mudou (comprador P20 +
  // sacas/data do "Editar" fase 1); no-op se nada mudou. `desired.*` ausente
  // (undefined) = não mexe nesse campo. Sacas em liga são rejeitadas pela trava
  // F7.1 do updateSampleMovement (a UI já deixa o campo só-leitura).
  async _syncMovementFromContract(sampleId, movementId, desired, actorContext) {
    if (!this.commandService || !this.queryService) {
      throw new HttpError(501, 'Movement sync is not configured', {
        code: 'SAMPLE_SYNC_NOT_CONFIGURED',
      });
    }
    const movement = await this.queryService.requireSampleMovement(sampleId, movementId);
    const after = {};
    if (
      desired.buyerClientId !== undefined &&
      (movement.buyerClientId ?? null) !== desired.buyerClientId
    ) {
      after.buyerClientId = desired.buyerClientId;
    }
    if (desired.quantitySacks !== undefined && movement.quantitySacks !== desired.quantitySacks) {
      after.quantitySacks = desired.quantitySacks;
    }
    if (desired.movementDate !== undefined) {
      const current = movement.movementDate
        ? new Date(movement.movementDate).toISOString().slice(0, 10)
        : null;
      if (current !== desired.movementDate) {
        after.movementDate = desired.movementDate;
      }
    }
    if (Object.keys(after).length === 0) {
      return; // nada mudou — evita um evento desnecessario
    }
    const sample = await this.queryService.requireSample(sampleId);
    await this.commandService.updateSampleMovement(
      {
        sampleId,
        movementId,
        expectedVersion: sample.version,
        after,
        reasonText: 'Dados da venda ajustados no contrato (Fechamento)',
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
