import { randomUUID } from 'node:crypto';

import { assertRoleAllowed, USER_ROLES } from '../auth/roles.js';
import { HttpError } from '../contracts/errors.js';
import { assertAuthenticatedActor, readLimitQuery } from '../users/user-support.js';
import {
  APPROVAL_REMINDER_SELECT,
  assertBrokersResolved,
  buildBankSnapshot,
  buildContractTimeline,
  buildPartySnapshot,
  buildReceivableView,
  bucketApprovalReminders,
  bucketPaymentEvents,
  buildWarehouseSnapshot,
  computeContractMoneyWithAgio,
  CONTRACT_LOOKUP_LISTS,
  formatContractNumber,
  normalizeActionDate,
  normalizeContractLookupInput,
  normalizeEtapa2Input,
  normalizeFutureSaleContractInput,
  normalizeRequiredAgio,
  normalizeWashoutReason,
  PAYMENT_EVENT_SELECT,
  RECEIVABLE_VIEW_SELECT,
  SALE_CONTRACT_STATUSES,
  SALE_CONTRACT_TYPES,
  SALE_CONTRACT_VIEW_SELECT,
  toSaleContractBrokerView,
  toSaleContractView,
} from './sale-contract-support.js';

// Gestao de Contratos (criar a vista/Futuro, listar/detalhar, editar/emitir,
// faturar/pagar/reverter, quebrar/washout). Acesso restrito a ADMIN (CADASTRO
// saiu em 2026-06-28). A CRIACAO nasce EMITIDO numa so operacao (D97): a vista
// via createSpotSaleContract (delega ao createSampleMovement na tx do evento);
// Futuro via createFutureSaleContract (CRUD direto).
const SALE_CONTRACT_MANAGE_ROLES = [USER_ROLES.ADMIN];

// Financeiro (Fase F): a pagina de recebiveis e ADMIN + COMMERCIAL (D135 reabre;
// revisa a D128 que a deixou ADMIN-only). ADMIN ve TODOS os fechamentos; COMMERCIAL
// so os EM QUE E CORRETOR (Broker.userId, mesmo escopo do /contratos), com os
// co-corretores VISIVEIS (revisa D86) e o total = a COTA dele.
const FINANCEIRO_ROLES = [USER_ROLES.ADMIN, USER_ROLES.COMMERCIAL];

// Acesso/gestao dos contratos por ADMIN + COMMERCIAL (S74): revoga o
// "Gestao de Contratos = ADMIN-only". ADMIN ve/gerencia TUDO; COMMERCIAL so os
// contratos EM QUE E CORRETOR (SaleContractBroker -> Broker.userId, mesmo modelo
// do Financeiro). A autorizacao por contrato vem dos helpers _resolveOwnBrokerId
// + _assertActorMayAccessContract; a listagem filtra aos contratos do corretor.
const SALE_CONTRACT_ACCESS_ROLES = [USER_ROLES.ADMIN, USER_ROLES.COMMERCIAL];

// Mesma chave do gerador do numero em src/events/prisma-event-store.js (NNNN
// global, compartilhado a vista + Futuro). pg_advisory_xact_lock serializa a
// alocacao do contract_seq na criacao do contrato Futuro (sem movimento).
const SALE_CONTRACT_SEQ_LOCK_KEY = 831202606;

const SALE_CONTRACT_LIST_LIMIT_DEFAULT = 200;
const SALE_CONTRACT_LIST_LIMIT_MAX = 500;

// Financeiro (S86): pagina por cursor (contractSeq) com scroll infinito no front.
const FINANCEIRO_LIST_LIMIT_DEFAULT = 30;
const FINANCEIRO_LIST_LIMIT_MAX = 60;

export class SaleContractService {
  // commandService + queryService sao opcionais (usados so no D48 — sincronizar
  // o vendedor do contrato com o Sample.ownerClientId via updateRegistration).
  constructor({ prisma, commandService = null, queryService = null }) {
    this.prisma = prisma;
    this.commandService = commandService;
    this.queryService = queryService;
  }

  // Autorizacao COMMERCIAL (S74): resolve o Broker do usuario (Broker.userId
  // @unique). COMMERCIAL sem Broker vinculado -> null (nao possui contrato).
  async _resolveOwnBrokerId(actor) {
    const broker = await this.prisma.broker.findUnique({
      where: { userId: actor.actorUserId },
      select: { id: true },
    });
    return broker?.id ?? null;
  }

  // Autoriza o ator num contrato ESPECIFICO. ADMIN: sempre. COMMERCIAL: precisa
  // ser corretor do contrato (SaleContractBroker). Roda ANTES do findUnique nos
  // chamadores, entao "nao existe" e "nao e meu" viram ambos 403 (nao vaza
  // existencia ao COMMERCIAL); ADMIN segue vendo o 404 de contrato inexistente.
  async _assertActorMayAccessContract(actor, contractId) {
    if (actor.role === USER_ROLES.ADMIN) {
      return;
    }
    const ownBrokerId = await this._resolveOwnBrokerId(actor);
    if (ownBrokerId) {
      const link = await this.prisma.saleContractBroker.findFirst({
        where: { saleContractId: contractId, brokerId: ownBrokerId },
        select: { id: true },
      });
      if (link) {
        return;
      }
    }
    throw new HttpError(403, 'Você não tem acesso a este contrato', {
      code: 'SALE_CONTRACT_FORBIDDEN',
    });
  }

  // COMMERCIAL cria contrato (D110): precisa estar ENTRE os corretores — senão o
  // contrato não seria "dele" e ele o perderia de vista na hora (a lista filtra
  // por posse). ADMIN pode qualquer combinação de corretores.
  async _assertActorAmongBrokersOnCreate(actor, brokerIds) {
    if (actor.role === USER_ROLES.ADMIN) {
      return;
    }
    const ownBrokerId = await this._resolveOwnBrokerId(actor);
    if (!ownBrokerId || !brokerIds.includes(ownBrokerId)) {
      throw new HttpError(422, 'Inclua você mesmo como corretor do contrato', {
        code: 'SALE_CONTRACT_MUST_INCLUDE_OWN_BROKER',
        field: 'brokerIds',
      });
    }
  }

  async listSaleContracts(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'list sale contracts');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'list sale contracts');

    // COMMERCIAL (S74): so os contratos em que e corretor (Broker.userId). Sem
    // Broker vinculado ou sem contratos -> lista vazia. ADMIN ve todos.
    let ownContractIds = null;
    if (actor.role !== USER_ROLES.ADMIN) {
      const ownBrokerId = await this._resolveOwnBrokerId(actor);
      if (!ownBrokerId) {
        return { items: [] };
      }
      const links = await this.prisma.saleContractBroker.findMany({
        where: { brokerId: ownBrokerId },
        select: { saleContractId: true },
      });
      ownContractIds = links.map((l) => l.saleContractId);
      if (ownContractIds.length === 0) {
        return { items: [] };
      }
    }

    const search = typeof input?.search === 'string' ? input.search.trim() : '';
    const status = input?.status ? this._normalizeStatusFilter(input.status) : null;
    const type = input?.type ? this._normalizeTypeFilter(input.type) : null;
    const limit = readLimitQuery(input?.limit, {
      fallback: SALE_CONTRACT_LIST_LIMIT_DEFAULT,
      max: SALE_CONTRACT_LIST_LIMIT_MAX,
    });

    const where = {};
    if (ownContractIds) {
      where.id = { in: ownContractIds };
    }
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

  // Financeiro (Fase F): lista a corretagem A RECEBER por fechamento. Relatorio
  // DERIVADO (sem persistencia): TODOS os contratos congelados (EMITIDO/FATURADO/
  // PAGO), inclusive os SEM corretagem (P24/D92 — e o unico lugar onde o total do
  // contrato aparece) E os em WASH_OUT (D105: o corretor recebe a comissao mesmo
  // com washout, pois fez a negociacao); a cota de cada corretor = total / N
  // (divisao igual, D79; resto de centavos no 1º — D129); sem corretagem => cota 0.
  // ACESSO (D135): ADMIN ve todos; COMMERCIAL so os contratos DELE (Broker.userId),
  // com os co-corretores visiveis e o total = a cota dele. Select enxuto
  // (RECEIVABLE_VIEW_SELECT, sem snapshots). Sem `@relation` contrato<->broker: os
  // corretores vem num batch separado (agrupado em JS).
  async listBrokerReceivables(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'list broker receivables');
    assertRoleAllowed(actor.role, FINANCEIRO_ROLES, 'list broker receivables');

    const isAdmin = actor.role === USER_ROLES.ADMIN;

    // COMMERCIAL (D135): so os fechamentos em que e corretor (Broker.userId, mesmo
    // escopo do /contratos). Sem Broker vinculado -> vazio. O escopo entra no
    // filterWhere (SQL), nao em pos-filtro JS, pra casar com a paginacao por cursor
    // E com o total agregado.
    let ownBrokerId = null;
    if (!isAdmin) {
      ownBrokerId = await this._resolveOwnBrokerId(actor);
      if (!ownBrokerId) {
        return { items: [], nextCursor: null, totalCommission: 0 };
      }
    }

    const limit = readLimitQuery(input?.limit, {
      fallback: FINANCEIRO_LIST_LIMIT_DEFAULT,
      max: FINANCEIRO_LIST_LIMIT_MAX,
    });
    // Cursor de campo unico: contractSeq (global, unico, monotonico) do ultimo
    // item da pagina anterior. String da query -> numero; NaN/invalido = 1a pagina.
    const cursorSeq = Number(input?.cursor);
    const cursor = Number.isInteger(cursorSeq) && cursorSeq > 0 ? cursorSeq : null;
    const search = typeof input?.search === 'string' ? input.search.trim() : '';

    // filterWhere = status congelados + (COMMERCIAL) escopo own-only + busca (nº do
    // contrato OU nome do corretor). A busca por corretor vem de um pre-batch dos
    // SaleContractBroker (sem @relation), preservando a busca que era client-side.
    const filterWhere = { status: { in: ['EMITIDO', 'FATURADO', 'PAGO', 'WASH_OUT'] } };
    if (ownBrokerId) {
      const ownLinks = await this.prisma.saleContractBroker.findMany({
        where: { brokerId: ownBrokerId },
        select: { saleContractId: true },
      });
      const ownContractIds = [...new Set(ownLinks.map((l) => l.saleContractId))];
      if (ownContractIds.length === 0) {
        return { items: [], nextCursor: null, totalCommission: 0 };
      }
      // AND (Prisma ANDa os campos de topo) -> intersecta com a busca abaixo, entao
      // a busca por nome de corretor NAO vaza contratos alheios ao COMMERCIAL.
      filterWhere.AND = [{ id: { in: ownContractIds } }];
    }
    if (search.length >= 1) {
      const brokerMatches = await this.prisma.saleContractBroker.findMany({
        where: { brokerNameSnapshot: { contains: search, mode: 'insensitive' } },
        select: { saleContractId: true },
      });
      const brokerMatchIds = [...new Set(brokerMatches.map((b) => b.saleContractId))];
      filterWhere.OR = [
        { contractNumber: { contains: search, mode: 'insensitive' } },
        { id: { in: brokerMatchIds } },
      ];
    }
    const pageWhere = cursor
      ? { AND: [filterWhere, { contractSeq: { lt: cursor } }] }
      : filterWhere;

    // Total do topo = corretagem cheia (2 lados) do conjunto que casa com a busca
    // (filterWhere; ignora o cursor -> reflete o conjunto inteiro, nao so a pagina).
    // ADMIN: da empresa. COMMERCIAL: o filterWhere ja vem escopado aos contratos dele
    // (D135), entao e a corretagem total dos fechamentos DELE (D136 — sem rateio ÷N).
    const [rows, sums] = await Promise.all([
      this.prisma.saleContract.findMany({
        where: pageWhere,
        orderBy: [{ contractSeq: 'desc' }],
        take: limit + 1,
        select: RECEIVABLE_VIEW_SELECT,
      }),
      this.prisma.saleContract.aggregate({
        where: filterWhere,
        _sum: { sellerBrokerageValue: true, buyerBrokerageValue: true },
      }),
    ]);
    const sellerSum = Number(sums._sum.sellerBrokerageValue ?? 0);
    const buyerSum = Number(sums._sum.buyerBrokerageValue ?? 0);
    const totalCommission = Math.round((sellerSum + buyerSum) * 100) / 100;

    // take: limit + 1 detecta a proxima pagina; nextCursor = contractSeq do
    // ultimo item realmente retornado (ou null na ultima pagina).
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    if (pageRows.length === 0) {
      return { items: [], nextCursor: null, totalCommission };
    }
    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && lastRow ? lastRow.contractSeq : null;

    // Corretores num batch (sem @relation): agrupa por saleContractId; ordem
    // createdAt asc (estavel) — atribuicao/metrica, sem valor por corretor (D136).
    const brokerRows = await this.prisma.saleContractBroker.findMany({
      where: { saleContractId: { in: pageRows.map((r) => r.id) } },
      orderBy: [{ createdAt: 'asc' }],
      select: { saleContractId: true, brokerId: true, brokerNameSnapshot: true },
    });
    const brokersByContract = new Map();
    for (const b of brokerRows) {
      const list = brokersByContract.get(b.saleContractId);
      if (list) {
        list.push(b);
      } else {
        brokersByContract.set(b.saleContractId, [b]);
      }
    }

    return {
      items: pageRows.map((row) => buildReceivableView(row, brokersByContract.get(row.id) ?? [])),
      nextCursor,
      totalCommission,
    };
  }

  // F1 (E21-E27/D138): eventos de "pagamento de contrato" do card de Eventos do
  // dashboard. Agendado = NAO pagos (EMITIDO/FATURADO) no paymentDate; realizado =
  // PAGO no paidAt; WASH_OUT fora. Escopo E22: ADMIN todos; COMMERCIAL so os dele
  // (Broker.userId); demais papeis nem chegam (gate FINANCEIRO_ROLES). Janela
  // [from, to] = 'YYYY-MM-DD' (a quinzena visivel do card). Retorna
  // Record<'YYYY-MM-DD', evento[]> (o formato da prop `events` do card).
  async getDashboardPaymentEvents(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'list dashboard payment events');
    assertRoleAllowed(actor.role, FINANCEIRO_ROLES, 'list dashboard payment events');

    const dayKeyRe = /^\d{4}-\d{2}-\d{2}$/;
    const from = typeof input?.from === 'string' && dayKeyRe.test(input.from) ? input.from : null;
    const to = typeof input?.to === 'string' && dayKeyRe.test(input.to) ? input.to : null;
    if (!from || !to) {
      return {};
    }

    // Escopo own-only do COMMERCIAL (mesmo do Financeiro): resolve o Broker e
    // restringe aos contratos dele. Sem Broker vinculado -> vazio.
    const scope = {};
    if (actor.role !== USER_ROLES.ADMIN) {
      const ownBrokerId = await this._resolveOwnBrokerId(actor);
      if (!ownBrokerId) {
        return {};
      }
      const ownLinks = await this.prisma.saleContractBroker.findMany({
        where: { brokerId: ownBrokerId },
        select: { saleContractId: true },
      });
      const ownContractIds = [...new Set(ownLinks.map((l) => l.saleContractId))];
      if (ownContractIds.length === 0) {
        return {};
      }
      scope.id = { in: ownContractIds };
    }

    // paymentDate/paidAt sao @db.Date (midnight UTC); a janela 'YYYY-MM-DD' vira
    // Date UTC — inclui os dois extremos.
    const gte = new Date(`${from}T00:00:00.000Z`);
    const lte = new Date(`${to}T00:00:00.000Z`);

    const [dueRows, paidRows] = await Promise.all([
      this.prisma.saleContract.findMany({
        where: { ...scope, status: { in: ['EMITIDO', 'FATURADO'] }, paymentDate: { gte, lte } },
        select: PAYMENT_EVENT_SELECT,
      }),
      this.prisma.saleContract.findMany({
        where: { ...scope, status: 'PAGO', paidAt: { gte, lte } },
        select: PAYMENT_EVENT_SELECT,
      }),
    ]);

    return bucketPaymentEvents(dueRows, paidRows);
  }

  // F2 (reforma AP6/AP7/AP10/AP14): "lembrete de aprovacao" do card de Eventos.
  // Pendente = requiresApproval + EMITIDO + SEM etiqueta (approval_label_log). O
  // lembrete aparece TODOS os dias de max(hoje, invoiceDate−lead) ate o fim da janela
  // (so de hoje pra frente). Visibilidade: TODOS os nao-PROSPECTOR (AP10 — sem gate de
  // papel, sem escopo por corretor; PROSPECTOR e barrado no allowlist central). Janela
  // [from, to] = 'YYYY-MM-DD'. Retorna Record<'YYYY-MM-DD', evento[]>.
  async getDashboardApprovalEvents(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list dashboard approval events');

    const dayKeyRe = /^\d{4}-\d{2}-\d{2}$/;
    const from = typeof input?.from === 'string' && dayKeyRe.test(input.from) ? input.from : null;
    const to = typeof input?.to === 'string' && dayKeyRe.test(input.to) ? input.to : null;
    if (!from || !to) {
      return {};
    }

    // Hoje-BRT (offset -3h, molde do getBrtToday do front): o lembrete NAO pinta dias
    // passados — o piso do fan-out e max(from, hoje).
    const todayKey = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [pending, withLabel] = await Promise.all([
      // Pendentes: precisa de aprovacao + EMITIDO + com data de faturamento (ancora do
      // lembrete). O filtro "sem etiqueta" vem do anti-join abaixo.
      this.prisma.saleContract.findMany({
        where: { requiresApproval: true, status: 'EMITIDO', invoiceDate: { not: null } },
        select: APPROVAL_REMINDER_SELECT,
      }),
      // Contratos que JA tem etiqueta (>=1 linha em approval_label_log). saleContractId
      // e nullable (avulsas = NULL) -> filtra not null (NUNCA NOT IN com NULL).
      this.prisma.approvalLabelLog.groupBy({
        by: ['saleContractId'],
        where: { saleContractId: { not: null } },
      }),
    ]);

    const labeledIds = new Set(withLabel.map((r) => r.saleContractId));
    const rows = pending.filter((row) => !labeledIds.has(row.id));

    return bucketApprovalReminders(rows, { fromKey: from, toKey: to, todayKey });
  }

  async getSaleContract(contractId, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'get sale contract');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'get sale contract');

    if (typeof contractId !== 'string' || contractId.length === 0) {
      throw new HttpError(422, 'contractId is required', {
        code: 'VALIDATION_ERROR',
        field: 'contractId',
      });
    }

    // COMMERCIAL (S74): so pode ler os contratos em que e corretor (403 antes do
    // findUnique -> nao vaza existencia). ADMIN passa direto.
    await this._assertActorMayAccessContract(actor, contractId);

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
  // lote (sampleId/movementId nulos, D51). Coleta a fase 1 (comprador + termos +
  // corretores) E a etapa 2 (vendedor, banco, filiais, armazens, listas, datas,
  // textos) NUM MODAL SO -> nasce EMITIDO (D97). O numero NNNN/AA usa a MESMA
  // sequencia global do a vista, sob advisory lock. Grava a auditoria (Export).
  async createFutureSaleContract(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'create future sale contract');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'create future sale contract');

    const fase1 = normalizeFutureSaleContractInput(input ?? {});
    // COMMERCIAL (D110): precisa estar entre os corretores do contrato que cria.
    await this._assertActorAmongBrokersOnCreate(actor, fase1.brokerIds);
    const etapa2 = normalizeEtapa2Input(input ?? {});
    // O vendedor do Futuro vem da etapa 2 (nao ha lote/dono).
    if (!etapa2.sellerClientId) {
      throw new HttpError(422, 'sellerClientId is required to create a future contract', {
        code: 'VALIDATION_ERROR',
        field: 'sellerClientId',
      });
    }

    // Corretores: resolve nomes + valida ativos (fora da tx — leitura).
    const brokers = await this.prisma.broker.findMany({
      where: { id: { in: fase1.brokerIds } },
      select: { id: true, name: true, status: true },
    });
    assertBrokersResolved(brokers, fase1.brokerIds);
    const nameById = new Map(brokers.map((broker) => [broker.id, broker.name]));

    // Resolve a etapa 2 + monta o `data` EMITIDO (partes/banco/armazens/listas +
    // snapshots + totais com agio). So leitura, fora da tx.
    const { data: emitData } = await this._resolveEmitData({
      sellerClientId: etapa2.sellerClientId,
      buyerClientId: fase1.buyerClientId,
      quantitySacks: fase1.quantitySacks,
      unitPrice: fase1.unitPrice,
      sellerBrokeragePct: fase1.sellerBrokeragePct,
      buyerBrokeragePct: fase1.buyerBrokeragePct,
      etapa2,
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
          contractSeq: seq,
          contractNumber,
          contractDate: new Date(fase1.contractDate),
          sampleId: null,
          movementId: null,
          quantitySacks: fase1.quantitySacks,
          unitPrice: fase1.unitPrice.toFixed(2),
          sellerBrokeragePct: fase1.sellerBrokeragePct.toFixed(2),
          buyerBrokeragePct: fase1.buyerBrokeragePct.toFixed(2),
          version: 0,
          // etapa 2 (status EMITIDO + snapshots + banco/armazens/listas + totais)
          ...emitData,
        },
      });
      await tx.saleContractBroker.createMany({
        data: fase1.brokerIds.map((brokerId) => ({
          id: randomUUID(),
          saleContractId: contractId,
          brokerId,
          brokerNameSnapshot: nameById.get(brokerId),
        })),
      });
      await tx.saleContractExport.create({
        data: {
          id: randomUUID(),
          saleContractId: contractId,
          contractType: 'FUTURO',
          generatedByUserId: actorContext.actorUserId ?? null,
        },
      });
    });

    return this.getSaleContract(contractId, actorContext);
  }

  // Fechamento (Mercado a vista): cria a venda no lote + o contrato EMITIDO numa
  // SO operacao (D97). Orquestra: (1) resolve a etapa 2 fora da tx (partes/banco/
  // armazens/listas + snapshots + totais); (2) se o vendedor escolhido difere do
  // dono do lote, sincroniza o dono ANTES da venda (D48); (3) delega a
  // commandService.createSampleMovement (SALE), que grava o SALE_CREATED + o
  // contrato EMITIDO (com o emitData) + a auditoria, tudo na MESMA tx. O contrato
  // nunca passa por EM_ABERTO.
  async createSpotSaleContract(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'create spot sale contract');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'create spot sale contract');
    if (!this.commandService || !this.queryService) {
      throw new HttpError(501, 'Spot sale contract creation is not configured', {
        code: 'SALE_CONTRACT_CREATE_NOT_CONFIGURED',
      });
    }

    const sampleId = input?.sampleId;
    if (typeof sampleId !== 'string' || sampleId.length === 0) {
      throw new HttpError(422, 'sampleId is required', {
        code: 'VALIDATION_ERROR',
        field: 'sampleId',
      });
    }
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const etapa2 = normalizeEtapa2Input(input ?? {});

    // Fase 1 da venda a vista (mesmos normalizadores do createSampleMovement).
    const fase1 = normalizeFutureSaleContractInput(input ?? {});
    // COMMERCIAL (D110): precisa estar entre os corretores do contrato que cria.
    await this._assertActorAmongBrokersOnCreate(actor, fase1.brokerIds);

    const sample = await this.queryService.requireSample(sampleId);
    // Concorrencia otimista: rejeita se o lote mudou desde que a tela carregou.
    if (sample.version !== expectedVersion) {
      throw new HttpError(409, 'Sample was modified concurrently', {
        code: 'SAMPLE_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }
    // Vendedor: escolhido na etapa 2 (D48) ou o dono atual do lote.
    const sellerClientId = etapa2.sellerClientId ?? sample.ownerClientId;
    if (!sellerClientId) {
      throw new HttpError(422, 'sellerClientId is required to create the contract', {
        code: 'VALIDATION_ERROR',
        field: 'sellerClientId',
      });
    }

    // Resolve a etapa 2 + monta o `data` EMITIDO (fora da tx — leitura).
    const { data: emitData } = await this._resolveEmitData({
      sellerClientId,
      buyerClientId: fase1.buyerClientId,
      quantitySacks: fase1.quantitySacks,
      unitPrice: fase1.unitPrice,
      sellerBrokeragePct: fase1.sellerBrokeragePct,
      buyerBrokeragePct: fase1.buyerBrokeragePct,
      etapa2,
    });

    // D48: o dono do lote passa a ser o vendedor ANTES da venda (bumpa a versao;
    // no-op se ja coerente). Assim o SALE_CREATED e o snapshot base ja nascem com
    // o vendedor certo, sem precisar de owner-sync depois.
    await this._syncSampleOwner(sampleId, sellerClientId, actorContext);
    const refreshed = await this.queryService.requireSample(sampleId);

    const result = await this.commandService.createSampleMovement(
      {
        sampleId,
        expectedVersion: refreshed.version,
        movementType: 'SALE',
        buyerClientId: fase1.buyerClientId,
        buyerUnitId: etapa2.buyerUnitId ?? null,
        quantitySacks: fase1.quantitySacks,
        movementDate: fase1.contractDate,
        unitPrice: fase1.unitPrice,
        sellerBrokeragePct: fase1.sellerBrokeragePct,
        buyerBrokeragePct: fase1.buyerBrokeragePct,
        brokerIds: fase1.brokerIds,
        // etapa 2 ja resolvida: o contrato nasce EMITIDO na tx do SALE_CREATED.
        saleContractEmitData: emitData,
      },
      actorContext
    );

    const contractId = result?.saleContract?.id;
    if (!contractId) {
      throw new HttpError(500, 'Sale contract was not created', {
        code: 'SALE_CONTRACT_NOT_CREATED',
      });
    }
    return this.getSaleContract(contractId, actorContext);
  }

  // Fechamento: "Editar" um contrato EMITIDO — re-salva os campos da etapa 2,
  // remonta os snapshots e recalcula o total (com agio/desagio), mantendo o
  // status EMITIDO. Grava 1 linha de auditoria (SaleContractExport). A CRIACAO
  // nao passa mais por aqui (nasce EMITIDO em createSpot/createFuture, D97);
  // este metodo cobre so a re-emissao (regeneravel).
  async emitSaleContract(contractId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'emit sale contract');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'emit sale contract');
    this._requireContractId(contractId);
    // COMMERCIAL (D110): só gerencia os contratos em que é corretor.
    await this._assertActorMayAccessContract(actor, contractId);

    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const etapa2 = normalizeEtapa2Input(input ?? {});

    const contract = await this.prisma.saleContract.findUnique({ where: { id: contractId } });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    // Editar so age sobre um EMITIDO (a criacao ja nasce EMITIDO — D97). O passo
    // EM_ABERTO nao existe mais.
    if (contract.status !== 'EMITIDO') {
      throw new HttpError(409, `Sale contract is ${contract.status} and cannot be edited`, {
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
    // Comprador: usa o editado (se veio) ou o atual do contrato (P20).
    const buyerClientId = etapa2.buyerClientId ?? contract.buyerClientId;

    // Fase 1 (venda) editavel no "Editar" — usa os valores novos quando vierem
    // (sf), senao mantem os do contrato. O comprador segue pela etapa 2 (acima).
    const sf = etapa2.saleFields;
    const effQuantitySacks = sf ? sf.quantitySacks : contract.quantitySacks;
    const effUnitPrice = sf ? sf.unitPrice : Number(contract.unitPrice);
    const effSellerPct = sf ? sf.sellerBrokeragePct : Number(contract.sellerBrokeragePct);
    const effBuyerPct = sf ? sf.buyerBrokeragePct : Number(contract.buyerBrokeragePct);

    // Resolve a etapa 2 (partes/banco/armazens/listas) + monta o `data` do
    // estado EMITIDO (mesma logica reusada pela criacao atomica).
    const { data } = await this._resolveEmitData({
      sellerClientId,
      buyerClientId,
      quantitySacks: effQuantitySacks,
      unitPrice: effUnitPrice,
      sellerBrokeragePct: effSellerPct,
      buyerBrokeragePct: effBuyerPct,
      etapa2,
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

  // "Aplicar agio/desagio" — acao dedicada do card em EMITIDO (D87/D89).
  // SUBSTITUI o agio vigente (sempre sobre o unitPrice cru, D88), recalcula o
  // total + as duas corretagens (computeContractMoneyWithAgio — corretagem
  // incide sobre o total ajustado) e registra a aplicacao em
  // sale_contract_agio_log (D90, antes->depois). O status NAO muda; Financeiro
  // e Espelho leem ao vivo. CRUD direto + concorrencia otimista por version.
  async applyAgioSaleContract(contractId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'apply agio to sale contract');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'apply agio to sale contract');
    this._requireContractId(contractId);
    // COMMERCIAL (D110): só gerencia os contratos em que é corretor.
    await this._assertActorMayAccessContract(actor, contractId);
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const { agioDesagioType, agioDesagioValue } = normalizeRequiredAgio(input);

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        status: true,
        version: true,
        unitPrice: true,
        quantitySacks: true,
        sellerBrokeragePct: true,
        buyerBrokeragePct: true,
        agioDesagioType: true,
        agioDesagioValue: true,
        totalValue: true,
      },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    if (contract.status !== 'EMITIDO') {
      throw new HttpError(409, `Sale contract is ${contract.status} and cannot receive agio`, {
        code: 'SALE_CONTRACT_NOT_ADJUSTABLE',
      });
    }
    if (contract.version !== expectedVersion) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    // Substitui (nao acumula): recalcula SEMPRE a partir do unitPrice cru.
    const money = computeContractMoneyWithAgio({
      unitPrice: Number(contract.unitPrice),
      quantitySacks: contract.quantitySacks,
      sellerPct: Number(contract.sellerBrokeragePct),
      buyerPct: Number(contract.buyerBrokeragePct),
      agioType: agioDesagioType,
      agioValue: agioDesagioValue,
    });

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.saleContract.updateMany({
        where: { id: contractId, version: expectedVersion, status: 'EMITIDO' },
        data: {
          agioDesagioType,
          agioDesagioValue,
          totalValue: money.totalValue,
          sellerBrokerageValue: money.sellerBrokerageValue,
          buyerBrokerageValue: money.buyerBrokerageValue,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new HttpError(409, 'Sale contract was modified concurrently', {
          code: 'SALE_CONTRACT_VERSION_CONFLICT',
          field: 'expectedVersion',
        });
      }
      await tx.saleContractAgioLog.create({
        data: {
          id: randomUUID(),
          saleContractId: contractId,
          agioDesagioType,
          agioDesagioValue,
          previousAgioType: contract.agioDesagioType ?? null,
          previousAgioValue: contract.agioDesagioValue ?? null,
          previousTotalValue: contract.totalValue,
          newTotalValue: money.totalValue,
          appliedByUserId: actorContext.actorUserId ?? null,
        },
      });
    });

    return this.getSaleContract(contractId, actorContext);
  }

  // "Faturar" — EMITIDO -> FATURADO. Grava a data REAL do faturamento
  // (invoicedAt; pode diferir da planejada invoiceDate) + o marco auditado
  // (D123). SEM volta (o "Desfazer" foi removido na Fase J, D122); engano ->
  // Washout. CRUD direto + concorrencia otimista por version.
  async invoiceSaleContract(contractId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'invoice sale contract');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'invoice sale contract');
    this._requireContractId(contractId);
    // COMMERCIAL (D110): só gerencia os contratos em que é corretor.
    await this._assertActorMayAccessContract(actor, contractId);
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const invoicedAt = normalizeActionDate(input?.date, 'date');

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, version: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    if (contract.status !== 'EMITIDO') {
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

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.saleContract.updateMany({
        where: { id: contractId, version: expectedVersion, status: 'EMITIDO' },
        data: { status: 'FATURADO', invoicedAt, version: { increment: 1 } },
      });
      if (updated.count > 0) {
        // Fase J (D123): marco auditado (quem + quando) na MESMA tx.
        await tx.saleContractStatusLog.create({
          data: this._statusLogData(contractId, 'FATURADO', actor),
        });
      }
      return updated;
    });
    if (result.count === 0) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    return this.getSaleContract(contractId, actorContext);
  }

  // "Pagar" — FATURADO -> PAGO (SÓ depois do faturamento — D106; na
  // comercializacao o pagamento vem sempre depois de faturar). Grava a data REAL
  // do pagamento (paidAt) + o marco auditado (D123). Sem volta (D122).
  async paySaleContract(contractId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'pay sale contract');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'pay sale contract');
    this._requireContractId(contractId);
    // COMMERCIAL (D110): só gerencia os contratos em que é corretor.
    await this._assertActorMayAccessContract(actor, contractId);
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const paidAt = normalizeActionDate(input?.date, 'date');

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, version: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    if (contract.status !== 'FATURADO') {
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

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.saleContract.updateMany({
        where: {
          id: contractId,
          version: expectedVersion,
          status: 'FATURADO',
        },
        data: { status: 'PAGO', paidAt, version: { increment: 1 } },
      });
      if (updated.count > 0) {
        // Fase J (D123): marco auditado (quem + quando) na MESMA tx.
        await tx.saleContractStatusLog.create({
          data: this._statusLogData(contractId, 'PAGO', actor),
        });
      }
      return updated;
    });
    if (result.count === 0) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    return this.getSaleContract(contractId, actorContext);
  }

  // Quebra MANUAL (P17): EMITIDO/FATURADO/PAGO -> WASH_OUT, cancelando
  // a venda subjacente (devolve as sacas ao lote) com motivo OBRIGATORIO. Delega
  // ao cancelSampleMovement, que grava o SALE_CANCELLED e dispara o washout via
  // washoutSaleContractByMovement na mesma tx. DEFINITIVA (event store
  // append-only — retomar = nova venda/contrato). O contrato NUNCA e apagado
  // (D104) e o corretor mantem a comissao (Financeiro/Espelho — D105).
  async washoutSaleContract(contractId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'washout sale contract');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'washout sale contract');
    this._requireContractId(contractId);
    // COMMERCIAL (D110): só gerencia os contratos em que é corretor.
    await this._assertActorMayAccessContract(actor, contractId);
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const reason = normalizeWashoutReason(input?.reason);

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, version: true, sampleId: true, movementId: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    if (!['EMITIDO', 'FATURADO', 'PAGO'].includes(contract.status)) {
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
      const result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.saleContract.updateMany({
          where: { id: contractId, version: expectedVersion, status: contract.status },
          data: {
            status: 'WASH_OUT',
            washoutReason: reason,
            washoutAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (updated.count > 0) {
          // Fase J (D123): marco auditado (quem + quando + MOTIVO) na MESMA tx
          // — cobre o buraco do washout de Futuro, que nao tinha ator.
          await tx.saleContractStatusLog.create({
            data: this._statusLogData(contractId, 'WASH_OUT', actor, reason),
          });
        }
        return updated;
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

  // Fase J (D123): payload da linha de auditoria de marco de status. Reason so
  // no washout. actorUserId nullable (convencao dos satelites), sempre
  // preenchido em sessao autenticada.
  _statusLogData(saleContractId, toStatus, actorContext, reason = null) {
    return {
      id: randomUUID(),
      saleContractId,
      toStatus,
      reason,
      actorUserId: actorContext?.actorUserId ?? null,
    };
  }

  // Fase J (D124, revisada pela D127): auditoria da EXPORTACAO do Espelho de
  // Corretagem. Chamada pelo handler logEspelhoExport (clique em Exportar/
  // Baixar no modal) e pelo exportEspelhoPdf sem ?preview=1 (acesso direto a
  // URL) — posse, elegibilidade e side ja foram validados la.
  async logEspelhoGenerated(contractId, side, actorContext) {
    await this.prisma.saleContractEspelhoLog.create({
      data: {
        id: randomUUID(),
        saleContractId: contractId,
        side,
        actorUserId: actorContext?.actorUserId ?? null,
      },
    });
  }

  // Timeline do modal de Detalhes (Fase J — D125): agrega criacao/edicoes
  // (Export), agio (AgioLog), aprovacoes (ApprovalLabelLog), marcos de status
  // (StatusLog + legados so-com-data) e espelhos (EspelhoLog), com os nomes dos
  // atores resolvidos via app_user (join manual — as satelites nao tem
  // @relation). Mesmo gate/posse do getSaleContract (o timeline vive no modal
  // de Detalhes do /contratos).
  async getSaleContractTimeline(contractId, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'get sale contract timeline');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'get sale contract timeline');
    this._requireContractId(contractId);
    // COMMERCIAL (D110): só acessa os contratos em que é corretor.
    await this._assertActorMayAccessContract(actor, contractId);

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, invoicedAt: true, paidAt: true, washoutAt: true, washoutReason: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }

    const where = { saleContractId: contractId };
    const [exportRows, agioLogs, approvalLogs, statusLogs, espelhoLogs] = await Promise.all([
      this.prisma.saleContractExport.findMany({ where, orderBy: { generatedAt: 'asc' } }),
      this.prisma.saleContractAgioLog.findMany({ where, orderBy: { appliedAt: 'asc' } }),
      this.prisma.approvalLabelLog.findMany({ where, orderBy: { createdAt: 'asc' } }),
      this.prisma.saleContractStatusLog.findMany({ where, orderBy: { createdAt: 'asc' } }),
      this.prisma.saleContractEspelhoLog.findMany({ where, orderBy: { createdAt: 'asc' } }),
    ]);

    const actorIds = [
      ...new Set(
        [
          ...exportRows.map((row) => row.generatedByUserId),
          ...agioLogs.map((row) => row.appliedByUserId),
          ...approvalLogs.map((row) => row.actorUserId),
          ...statusLogs.map((row) => row.actorUserId),
          ...espelhoLogs.map((row) => row.actorUserId),
        ].filter(Boolean)
      ),
    ];
    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true, username: true },
        })
      : [];
    const usersById = Object.fromEntries(users.map((user) => [user.id, user]));

    return {
      items: buildContractTimeline({
        contract,
        exports: exportRows,
        agioLogs,
        approvalLogs,
        statusLogs,
        espelhoLogs,
        usersById,
      }),
    };
  }

  // Preview (so-leitura) do PROXIMO numero NNNN/AA — pro modal de venda mostrar
  // qual sera o numero ANTES de criar. So indicativo: sem lock, e o numero real
  // e alocado de fato na criacao (allocateNextContractSeq). Corrida = 2 previews
  // iguais e aceitavel (o unique constraint garante a unicidade na criacao).
  async getNextContractNumber(actorContext) {
    assertAuthenticatedActor(actorContext, 'get next contract number');
    assertRoleAllowed(actorContext.role, SALE_CONTRACT_ACCESS_ROLES, 'get next contract number');
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

  // Resolve/valida as entidades da etapa 2 (partes/filiais/banco/armazens/listas)
  // e monta o objeto `data` do estado EMITIDO (snapshots + ids/textos + agio +
  // totais com agio). SO LEITURA — roda FORA da transacao. Reusado pelos 3
  // caminhos: "Editar" (emitSaleContract), criacao a vista (createSpotSaleContract
  // -> createSaleContractInTx) e Futuro (createFutureSaleContract). NAO faz
  // owner-sync/movement-sync nem grava — isso e responsabilidade de quem chama.
  // Recebe os valores da fase 1 (partes/sacas/preco/pct) porque os totais
  // dependem deles + do agio.
  async _resolveEmitData({
    sellerClientId,
    buyerClientId,
    quantitySacks,
    unitPrice,
    sellerBrokeragePct,
    buyerBrokeragePct,
    etapa2,
  }) {
    const sellerClient = await this._requireClient(sellerClientId, 'sellerClientId');
    const sellerUnit = await this._resolvePartyUnit(
      sellerClient,
      etapa2.sellerUnitId,
      'sellerUnitId'
    );

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

    const money = computeContractMoneyWithAgio({
      unitPrice,
      quantitySacks,
      sellerPct: sellerBrokeragePct,
      buyerPct: buyerBrokeragePct,
      agioType: etapa2.agioDesagioType,
      agioValue: etapa2.agioDesagioValue,
    });

    const data = {
      status: 'EMITIDO',
      sellerClientId,
      sellerUnitId: sellerUnit?.id ?? null,
      sellerSnapshot: buildPartySnapshot(sellerClient, sellerUnit),
      buyerClientId: buyerClientId ?? null,
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
      // Aprovacao (reforma AP1/AP6): sinal + lembrete ja resolvidos no
      // normalizeEtapa2Input (null quando "Nao"). Cobre criar-futuro, criar-a-vista
      // e editar de uma vez (todos derivam o data daqui).
      requiresApproval: etapa2.requiresApproval,
      approvalReminderLeadDays: etapa2.approvalReminderLeadDays,
    };

    return { data };
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

  // "+ Adicionar" inline (D91): cria um valor numa das 3 listas (Forma/Modalidade/
  // Embalagem) a partir do dropdown do modal. ADMIN-only (P26/D94 — alinhado ao
  // gate da gestao de contratos); append no fim (sortOrder = max+1); nome
  // UNIQUE -> 409. Status sempre ACTIVE.
  async createContractLookup(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'create contract lookup');
    assertRoleAllowed(actorContext.role, SALE_CONTRACT_MANAGE_ROLES, 'create contract lookup');
    const { list, name } = normalizeContractLookupInput(input);
    const model = this.prisma[CONTRACT_LOOKUP_LISTS[list]];

    const max = await model.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (max?._max?.sortOrder ?? -1) + 1;

    let item;
    try {
      item = await model.create({
        data: { id: randomUUID(), name, sortOrder, status: 'ACTIVE' },
        select: { id: true, name: true },
      });
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new HttpError(409, 'A contract lookup with this name already exists', {
          code: 'CONTRACT_LOOKUP_NAME_EXISTS',
          field: 'name',
        });
      }
      throw error;
    }

    return { list, item };
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
