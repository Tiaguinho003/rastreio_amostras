import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { assertRoleAllowed, USER_ROLES } from '../auth/roles.js';
import { HttpError } from '../contracts/errors.js';
import { assertAuthenticatedActor, readLimitQuery } from '../users/user-support.js';
import {
  assertBrokersResolved,
  buildBankSnapshot,
  buildContractTimeline,
  buildPartySnapshot,
  buildReceivableView,
  decodeReceivableCursor,
  encodeReceivableCursor,
  normalizeReceivableFilter,
  receivableKeysetWhere,
  buildShipmentView,
  bucketShipmentEvents,
  decodeShipmentCursor,
  encodeShipmentCursor,
  normalizeShipmentFilter,
  shipmentKeysetWhere,
  SHIPMENT_EVENT_SELECT,
  SHIPMENT_VIEW_SELECT,
  buildApprovalWorklistView,
  decodeApprovalWlCursor,
  encodeApprovalWlCursor,
  normalizeApprovalWlFilter,
  buildRecentApprovalSendItem,
  brtTodayDateOnly,
  brtTodayKey,
  bucketPaymentEvents,
  bucketInvoiceEvents,
  buildWarehouseSnapshot,
  assertAgioWithinUnitPrice,
  computeContractMoneyWithAgio,
  CONTRACT_LOOKUP_LISTS,
  formatContractNumber,
  normalizeActionDate,
  normalizeApprovalReminderLeadDays,
  normalizeContractLookupInput,
  normalizeEtapa2Input,
  normalizeFutureSaleContractInput,
  normalizeRequiredAgio,
  normalizeRequiredBoolean,
  normalizeWashoutReason,
  PAYMENT_EVENT_SELECT,
  INVOICE_EVENT_SELECT,
  RECEIVABLE_VIEW_SELECT,
  SALE_CONTRACT_STATUSES,
  SALE_CONTRACT_TYPES,
  SALE_CONTRACT_VIEW_SELECT,
  toSaleContractBrokerView,
  toSaleContractView,
} from './sale-contract-support.js';

// Criar valores nas listas cadastraveis inline (createContractLookup) e
// ADMIN-only (D94). NAO confundir com a gestao do contrato em si — criar,
// editar/emitir, faturar/pagar, ágio e washout usam SALE_CONTRACT_ACCESS_ROLES
// (ADMIN + COMMERCIAL, escopo aberto — D140). A CRIACAO nasce EMITIDO numa so
// operacao (D97): a vista via createSpotSaleContract (delega ao
// createSampleMovement na tx do evento); Futuro via createFutureSaleContract
// (CRUD direto).
const CONTRACT_LOOKUP_MANAGE_ROLES = [USER_ROLES.ADMIN];

// Financeiro (Fase F): a pagina de recebiveis e ADMIN + COMMERCIAL (D135 reabre;
// revisa a D128 que a deixou ADMIN-only). ESCOPO ABERTO (2026-07-13, own-only
// revogado — D110/D135 superadas): ADMIN e COMMERCIAL veem TODOS os fechamentos,
// com os co-corretores visiveis e o total = a corretagem total (sem rateio ÷N, D136).
const FINANCEIRO_ROLES = [USER_ROLES.ADMIN, USER_ROLES.COMMERCIAL];

// Acesso/gestao dos contratos por ADMIN + COMMERCIAL. ESCOPO ABERTO (2026-07-13,
// own-only revogado — D110/D135 superadas): ADMIN e COMMERCIAL veem e GERENCIAM
// TODOS os contratos (a posse por Broker deixou de restringir). O gate de papel
// (assertRoleAllowed) no topo de cada metodo e a unica autorizacao.
const SALE_CONTRACT_ACCESS_ROLES = [USER_ROLES.ADMIN, USER_ROLES.COMMERCIAL];

// Mesma chave do gerador do numero em src/events/prisma-event-store.js (NNNN
// global, compartilhado a vista + Futuro). pg_advisory_xact_lock serializa a
// alocacao do contract_seq na criacao do contrato Futuro (sem movimento).
const SALE_CONTRACT_SEQ_LOCK_KEY = 831202606;

const SALE_CONTRACT_LIST_LIMIT_DEFAULT = 200;
const SALE_CONTRACT_LIST_LIMIT_MAX = 500;

// AP16: teto dos envios de aprovacao recentes no feed "Ultimos envios" (mesmo 40 do
// DASHBOARD_RECENT_SENDS_LIMIT do samples query-service). DSB-D5: cada lista tem seu
// proprio top-40 — o handler NAO mescla nem corta, devolve { sampleItems, approvalItems }.
const RECENT_APPROVAL_SENDS_LIMIT = 40;

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

  async listSaleContracts(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'list sale contracts');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'list sale contracts');

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

  // Financeiro (Fase F): lista a corretagem A RECEBER por fechamento. Relatorio
  // DERIVADO (sem persistencia): TODOS os contratos congelados (EMITIDO/FATURADO/
  // PAGO), inclusive os SEM corretagem (P24/D92 — e o unico lugar onde o total do
  // contrato aparece) E os em WASH_OUT do FUTURO (D105 refinada pela D145: o
  // corretor recebe a comissao no washout so no FUTURO; o fisico cancelado
  // nao paga e sai do Financeiro). SEM rateio ÷N (D136 removeu a "cota por
  // corretor"): o valor por fechamento = a corretagem TOTAL (vendedor + comprador);
  // os co-corretores sao listados so como atribuicao. ACESSO (escopo aberto
  // 2026-07-13, own-only revogado): ADMIN e COMMERCIAL veem TODOS os fechamentos, com
  // os co-corretores visiveis e o total = a corretagem total. Select enxuto
  // (RECEIVABLE_VIEW_SELECT, sem snapshots). Sem `@relation` contrato<->broker: os
  // corretores vem num batch separado (agrupado em JS).
  async listBrokerReceivables(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'list broker receivables');
    assertRoleAllowed(actor.role, FINANCEIRO_ROLES, 'list broker receivables');

    const todayKey = brtTodayKey();
    const brtToday = brtTodayDateOnly();

    const limit = readLimitQuery(input?.limit, {
      fallback: FINANCEIRO_LIST_LIMIT_DEFAULT,
      max: FINANCEIRO_LIST_LIMIT_MAX,
    });
    const cursor = decodeReceivableCursor(input?.cursor);
    const search = typeof input?.search === 'string' ? input.search.trim() : '';
    const filter = normalizeReceivableFilter(input?.filter);

    // Revisao do Pagamento (FN5): filterWhere = busca (escopo por corretor removido —
    // own-only revogado), SEM status — cada grupo poe o proprio status. Busca = nº do
    // contrato OU corretor OU comprador; corretor e comprador vem de pre-batch de ids
    // (o comprador via ILIKE no buyer_snapshot, case-insensitive como os demais).
    const andClauses = [];
    if (search.length >= 1) {
      const [brokerMatches, buyerMatchIds] = await Promise.all([
        this.prisma.saleContractBroker.findMany({
          where: { brokerNameSnapshot: { contains: search, mode: 'insensitive' } },
          select: { saleContractId: true },
        }),
        this._searchBuyerContractIds(search),
      ]);
      const brokerMatchIds = [...new Set(brokerMatches.map((b) => b.saleContractId))];
      andClauses.push({
        OR: [
          { contractNumber: { contains: search, mode: 'insensitive' } },
          { id: { in: brokerMatchIds } },
          { id: { in: buyerMatchIds } },
        ],
      });
    }
    const filterWhere = andClauses.length ? { AND: andClauses } : {};

    // FN4 (fila de trabalho): G0 nao-pago por vencimento (asc, nulos ao fim -> vencido
    // no topo -> a vencer -> sem data); G1 pago e G2 cancelado no arquivo (seq desc). O
    // filtro FN5 escolhe quais grupos e refina o G0 (vencido = < hoje; a vencer = >=
    // hoje ou sem data). O corte vencido/a-vencer cai da ordenacao por paymentDate.
    const G0_ORDER = [{ paymentDate: { sort: 'asc', nulls: 'last' } }, { contractSeq: 'asc' }];
    const ARCHIVE_ORDER = [{ contractSeq: 'desc' }];
    const UNPAID = { status: { in: ['EMITIDO', 'FATURADO'] } };
    // D145 (revisa D105): washout so paga corretagem no FUTURO. O fisico (a vista)
    // cancelado por washout nao gera cobranca — sai do Financeiro (lista + total).
    const WASHOUT_BILLABLE = { status: 'WASH_OUT', type: 'FUTURO' };
    let groups;
    if (filter === 'vencido') {
      groups = [
        { g: 0, where: { AND: [UNPAID, { paymentDate: { lt: brtToday } }] }, orderBy: G0_ORDER },
      ];
    } else if (filter === 'a_vencer') {
      groups = [
        {
          g: 0,
          where: {
            AND: [UNPAID, { OR: [{ paymentDate: { gte: brtToday } }, { paymentDate: null }] }],
          },
          orderBy: G0_ORDER,
        },
      ];
    } else if (filter === 'pago') {
      groups = [{ g: 1, where: { status: 'PAGO' }, orderBy: ARCHIVE_ORDER }];
    } else if (filter === 'cancelado') {
      groups = [{ g: 2, where: WASHOUT_BILLABLE, orderBy: ARCHIVE_ORDER }];
    } else {
      groups = [
        { g: 0, where: UNPAID, orderBy: G0_ORDER },
        { g: 1, where: { status: 'PAGO' }, orderBy: ARCHIVE_ORDER },
        { g: 2, where: WASHOUT_BILLABLE, orderBy: ARCHIVE_ORDER },
      ];
    }

    // O cursor so vale se o grupo dele esta ativo (troca de filtro reseta o cursor no
    // front; guarda defensiva contra cursor de outro filtro).
    const effectiveCursor = cursor && groups.some((gr) => gr.g === cursor.g) ? cursor : null;
    const startG = effectiveCursor ? effectiveCursor.g : groups[0].g;

    // Spill: varre os grupos a partir do grupo do cursor; so o grupo retomado aplica o
    // keyset (os seguintes comecam do zero — tudo neles vem depois). take=limit+1
    // detecta a proxima pagina. Em geral 1 query; ate 3 no "Todos".
    const pageEntries = [];
    for (const group of groups) {
      if (group.g < startG) continue;
      const need = limit + 1 - pageEntries.length;
      if (need <= 0) break;
      const afterWhere =
        group.g === startG && effectiveCursor ? [receivableKeysetWhere(effectiveCursor)] : [];
      const rows = await this.prisma.saleContract.findMany({
        where: { AND: [filterWhere, group.where, ...afterWhere] },
        orderBy: group.orderBy,
        take: need,
        select: RECEIVABLE_VIEW_SELECT,
      });
      for (const row of rows) pageEntries.push({ row, g: group.g });
      if (rows.length === need) break;
    }

    // Cabecalho (FN6): corretagem total ("Total a receber") + vencidos ("N vencidos ·
    // R$ X"). Ambos por filterWhere (busca), INDEPENDENTES do filtro FN5 ativo e do
    // cursor — o cabecalho e um resumo estavel de todos os fechamentos (D136 — sem rateio ÷N).
    const [sums, overdue] = await Promise.all([
      this.prisma.saleContract.aggregate({
        // D145: washout so entra no total quando FUTURO (o fisico cancelado nao cobra).
        where: {
          AND: [
            filterWhere,
            { OR: [{ status: { in: ['EMITIDO', 'FATURADO', 'PAGO'] } }, WASHOUT_BILLABLE] },
          ],
        },
        _sum: { sellerBrokerageValue: true, buyerBrokerageValue: true },
      }),
      this.prisma.saleContract.aggregate({
        where: { AND: [filterWhere, UNPAID, { paymentDate: { lt: brtToday } }] },
        _count: { _all: true },
        _sum: { sellerBrokerageValue: true, buyerBrokerageValue: true },
      }),
    ]);
    const round2 = (n) => Math.round(n * 100) / 100;
    const totalCommission = round2(
      Number(sums._sum.sellerBrokerageValue ?? 0) + Number(sums._sum.buyerBrokerageValue ?? 0)
    );
    const overdueCount = overdue._count._all;
    const overdueCommission = round2(
      Number(overdue._sum.sellerBrokerageValue ?? 0) + Number(overdue._sum.buyerBrokerageValue ?? 0)
    );

    const hasMore = pageEntries.length > limit;
    const page = hasMore ? pageEntries.slice(0, limit) : pageEntries;
    if (page.length === 0) {
      return { items: [], nextCursor: null, totalCommission, overdueCount, overdueCommission };
    }
    const last = page[page.length - 1];
    const nextCursor = hasMore
      ? encodeReceivableCursor({
          g: last.g,
          pd: last.row.paymentDate ? last.row.paymentDate.toISOString().slice(0, 10) : null,
          seq: last.row.contractSeq,
        })
      : null;

    // Corretores num batch (sem @relation): agrupa por saleContractId; ordem
    // createdAt asc (estavel) — atribuicao/metrica, sem valor por corretor (D136).
    const brokerRows = await this.prisma.saleContractBroker.findMany({
      where: { saleContractId: { in: page.map((e) => e.row.id) } },
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
      items: page.map((e) =>
        buildReceivableView(e.row, brokersByContract.get(e.row.id) ?? [], todayKey)
      ),
      nextCursor,
      totalCommission,
      overdueCount,
      overdueCommission,
    };
  }

  // Revisao do Pagamento (FN5): ids dos contratos cujo COMPRADOR casa com a busca.
  // buyer_snapshot e JSON -> ILIKE no ->>'displayName' (case-insensitive como as
  // buscas de nº/corretor; o filtro JSON tipado do Prisma seria case-sensitive).
  // Escapa % _ \ pra tratar como literais e faz bind por template tag (sem injecao).
  // Pre-batch id-only, molde do pre-batch de corretor.
  async _searchBuyerContractIds(search) {
    const esc = search.replace(/[\\%_]/g, (c) => `\\${c}`);
    const like = `%${esc}%`;
    const rows = await this.prisma.$queryRaw`
      SELECT id FROM sale_contract WHERE buyer_snapshot->>'displayName' ILIKE ${like}
    `;
    return [...new Set(rows.map((r) => r.id))];
  }

  // Embarque (EMB23-EMB25): a worklist da sub-aba. Auth-only (todos nao-PROSPECTOR,
  // EMB7/EMB16 — SEM escopo por corretor, SEM dado sensivel). Keyset particionado por
  // grupo (molde do listBrokerReceivables): G0 nao-embarcado por invoiceDate ASC (mais
  // antigo/atrasado no topo, EMB25), G1 embarcado por shippedAt DESC, G2 cancelado por
  // contractSeq DESC. Filtros escolhem/refinam grupos; contador "N atrasados" (EMB24)
  // e estavel (independe de filtro/cursor). So contratos requiresShipment.
  async listShipmentContracts(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list shipment contracts');

    const todayKey = brtTodayKey();
    const brtToday = brtTodayDateOnly();

    const limit = readLimitQuery(input?.limit, {
      fallback: FINANCEIRO_LIST_LIMIT_DEFAULT,
      max: FINANCEIRO_LIST_LIMIT_MAX,
    });
    const cursor = decodeShipmentCursor(input?.cursor);
    const search = typeof input?.search === 'string' ? input.search.trim() : '';
    const filter = normalizeShipmentFilter(input?.filter);

    // Base = so contratos que embarcam. Busca = nº OU comprador (sem corretor — a
    // aba nao expoe dado sensivel). O comprador via ILIKE no buyer_snapshot.
    const andClauses = [{ requiresShipment: true }];
    if (search.length >= 1) {
      const buyerMatchIds = await this._searchBuyerContractIds(search);
      andClauses.push({
        OR: [
          { contractNumber: { contains: search, mode: 'insensitive' } },
          { id: { in: buyerMatchIds } },
        ],
      });
    }
    const filterWhere = { AND: andClauses };

    const G0_ORDER = [{ invoiceDate: { sort: 'asc', nulls: 'last' } }, { contractSeq: 'asc' }];
    const SHIPPED_ORDER = [{ shippedAt: 'desc' }, { contractSeq: 'desc' }];
    const CANCELLED_ORDER = [{ contractSeq: 'desc' }];
    // G0 = nao embarcado. Sem invoiceDate ("A definir" no FUTURO — D144, revisa
    // a exclusao da EMB22): ENTRA na fila, sempre a_embarcar (nunca atrasado),
    // no fim do G0 (nulls-last) em ordem de emissao (contractSeq).
    const UNSHIPPED = {
      status: { in: ['EMITIDO', 'FATURADO'] },
      shippedAt: null,
    };
    const SHIPPED = { shippedAt: { not: null }, status: { in: ['EMITIDO', 'FATURADO', 'PAGO'] } };
    const CANCELLED = { status: 'WASH_OUT' };

    let groups;
    if (filter === 'atrasado') {
      groups = [
        { g: 0, where: { AND: [UNSHIPPED, { invoiceDate: { lt: brtToday } }] }, orderBy: G0_ORDER },
      ];
    } else if (filter === 'a_embarcar') {
      groups = [
        {
          g: 0,
          // "A definir" (invoiceDate null) conta como a_embarcar (D144).
          where: {
            AND: [UNSHIPPED, { OR: [{ invoiceDate: { gte: brtToday } }, { invoiceDate: null }] }],
          },
          orderBy: G0_ORDER,
        },
      ];
    } else if (filter === 'embarcado') {
      groups = [{ g: 1, where: SHIPPED, orderBy: SHIPPED_ORDER }];
    } else if (filter === 'cancelado') {
      groups = [{ g: 2, where: CANCELLED, orderBy: CANCELLED_ORDER }];
    } else {
      groups = [
        { g: 0, where: UNSHIPPED, orderBy: G0_ORDER },
        { g: 1, where: SHIPPED, orderBy: SHIPPED_ORDER },
        { g: 2, where: CANCELLED, orderBy: CANCELLED_ORDER },
      ];
    }

    const effectiveCursor = cursor && groups.some((gr) => gr.g === cursor.g) ? cursor : null;
    const startG = effectiveCursor ? effectiveCursor.g : groups[0].g;

    const pageEntries = [];
    for (const group of groups) {
      if (group.g < startG) continue;
      const need = limit + 1 - pageEntries.length;
      if (need <= 0) break;
      const afterWhere =
        group.g === startG && effectiveCursor ? [shipmentKeysetWhere(effectiveCursor)] : [];
      const rows = await this.prisma.saleContract.findMany({
        where: { AND: [filterWhere, group.where, ...afterWhere] },
        orderBy: group.orderBy,
        take: need,
        select: SHIPMENT_VIEW_SELECT,
      });
      for (const row of rows) pageEntries.push({ row, g: group.g });
      if (rows.length === need) break;
    }

    // Contador "N atrasados" (EMB24): estavel, independe de filtro/cursor.
    const overdue = await this.prisma.saleContract.aggregate({
      where: { AND: [filterWhere, UNSHIPPED, { invoiceDate: { lt: brtToday } }] },
      _count: { _all: true },
    });
    const overdueCount = overdue._count._all;

    const hasMore = pageEntries.length > limit;
    const page = hasMore ? pageEntries.slice(0, limit) : pageEntries;
    if (page.length === 0) {
      return { items: [], nextCursor: null, overdueCount };
    }
    const last = page[page.length - 1];
    const cursorKey = (g, row) => {
      if (g === 0) return row.invoiceDate ? row.invoiceDate.toISOString().slice(0, 10) : null;
      if (g === 1) return row.shippedAt ? row.shippedAt.toISOString().slice(0, 10) : null;
      return null;
    };
    const nextCursor = hasMore
      ? encodeShipmentCursor({
          g: last.g,
          key: cursorKey(last.g, last.row),
          seq: last.row.contractSeq,
        })
      : null;

    return {
      items: page.map((e) => buildShipmentView(e.row, todayKey)),
      nextCursor,
      overdueCount,
    };
  }

  // Aprovacao (AP25-AP28): a worklist da sub-aba. Auth-only (todos nao-PROSPECTOR,
  // AP10/AP30 — SEM escopo por corretor, SEM dado sensivel). O estado depende de um
  // AGREGADO (contagem no approval_label_log), entao — ao contrario do embarque (typed
  // findMany) — usa $queryRaw: G0 a_enviar (marcado+EMITIDO+SEM etiqueta, anti-join
  // NOT EXISTS) por invoiceDate ASC (fila, AP28); G1 enviada (>=1 etiqueta, nao washout)
  // por ultimo envio DESC, com count => "·N×" (AP24); G2 cancelado (WASH_OUT) por
  // contractSeq DESC. Cursor {g,key,seq} (o key do G1 leva HORA). So requiresApproval.
  async listApprovalContracts(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list approval contracts');

    const todayKey = brtTodayKey();
    const limit = readLimitQuery(input?.limit, {
      fallback: FINANCEIRO_LIST_LIMIT_DEFAULT,
      max: FINANCEIRO_LIST_LIMIT_MAX,
    });
    const cursor = decodeApprovalWlCursor(input?.cursor);
    const search = typeof input?.search === 'string' ? input.search.trim() : '';
    const filter = normalizeApprovalWlFilter(input?.filter);

    // Busca = nº OU comprador (sem corretor — a aba nao expoe dado sensivel), ILIKE
    // no contract_number e no buyer_snapshot. Reusada em todos os grupos + no contador.
    const esc = search.replace(/[\\%_]/g, (c) => `\\${c}`);
    const like = `%${esc}%`;
    const searchFrag =
      search.length >= 1
        ? Prisma.sql`AND (sc.contract_number ILIKE ${like} OR sc.buyer_snapshot->>'displayName' ILIKE ${like})`
        : Prisma.empty;

    // Grupos ativos por filtro (default 'a_enviar' = so G0). 'todos' = G0+G1+G2.
    let groups;
    if (filter === 'a_enviar') groups = [0];
    else if (filter === 'enviada') groups = [1];
    else if (filter === 'cancelado') groups = [2];
    else groups = [0, 1, 2];

    const effectiveCursor = cursor && groups.includes(cursor.g) ? cursor : null;
    const startG = effectiveCursor ? effectiveCursor.g : groups[0];

    // Fragmento "estritamente DEPOIS do cursor" no grupo cursor.g (mesma ordem do
    // ORDER BY). Passa 'YYYY-MM-DD'::date / ISO::timestamptz (string + cast) pra
    // evitar ambiguidade de fuso Date<->coluna.
    const cursorFragFor = (g) => {
      if (!effectiveCursor || effectiveCursor.g !== g) return Prisma.empty;
      const { key, seq } = effectiveCursor;
      if (g === 0) {
        if (key === null) {
          return Prisma.sql`AND sc.invoice_date IS NULL AND sc.contract_seq > ${seq}`;
        }
        return Prisma.sql`AND (sc.invoice_date > ${key}::date OR sc.invoice_date IS NULL OR (sc.invoice_date = ${key}::date AND sc.contract_seq > ${seq}))`;
      }
      if (g === 1) {
        return Prisma.sql`AND (agg.last_send_at < ${key}::timestamptz OR (agg.last_send_at = ${key}::timestamptz AND sc.contract_seq < ${seq}))`;
      }
      return Prisma.sql`AND sc.contract_seq < ${seq}`;
    };

    const queryFor = (g, need) => {
      if (g === 0) {
        return this.prisma.$queryRaw`
          SELECT sc.id,
                 sc.contract_number AS "contractNumber",
                 sc.buyer_snapshot->>'displayName' AS "buyerName",
                 sc.invoice_date AS "invoiceDate",
                 sc.quantity_sacks AS "quantitySacks",
                 sc.status,
                 sc.contract_seq AS "contractSeq",
                 0::int AS "labelCount",
                 NULL::timestamptz AS "lastSendAt"
          FROM sale_contract sc
          WHERE sc.requires_approval = true
            AND sc.status = 'EMITIDO'
            AND NOT EXISTS (SELECT 1 FROM approval_label_log a WHERE a.sale_contract_id = sc.id)
            ${searchFrag}
            ${cursorFragFor(0)}
          ORDER BY sc.invoice_date ASC NULLS LAST, sc.contract_seq ASC
          LIMIT ${need}
        `;
      }
      if (g === 1) {
        return this.prisma.$queryRaw`
          SELECT sc.id,
                 sc.contract_number AS "contractNumber",
                 sc.buyer_snapshot->>'displayName' AS "buyerName",
                 sc.invoice_date AS "invoiceDate",
                 sc.quantity_sacks AS "quantitySacks",
                 sc.status,
                 sc.contract_seq AS "contractSeq",
                 agg.label_count::int AS "labelCount",
                 agg.last_send_at AS "lastSendAt"
          FROM sale_contract sc
          JOIN (
            SELECT sale_contract_id, count(*) AS label_count, max(created_at) AS last_send_at
            FROM approval_label_log
            WHERE sale_contract_id IS NOT NULL
            GROUP BY sale_contract_id
          ) agg ON agg.sale_contract_id = sc.id
          WHERE sc.requires_approval = true
            AND sc.status <> 'WASH_OUT'
            ${searchFrag}
            ${cursorFragFor(1)}
          ORDER BY agg.last_send_at DESC, sc.contract_seq DESC
          LIMIT ${need}
        `;
      }
      return this.prisma.$queryRaw`
        SELECT sc.id,
               sc.contract_number AS "contractNumber",
               sc.buyer_snapshot->>'displayName' AS "buyerName",
               sc.invoice_date AS "invoiceDate",
               sc.quantity_sacks AS "quantitySacks",
               sc.status,
               sc.contract_seq AS "contractSeq",
               0::int AS "labelCount",
               NULL::timestamptz AS "lastSendAt"
        FROM sale_contract sc
        WHERE sc.requires_approval = true
          AND sc.status = 'WASH_OUT'
          ${searchFrag}
          ${cursorFragFor(2)}
        ORDER BY sc.contract_seq DESC
        LIMIT ${need}
      `;
    };

    const pageEntries = [];
    for (const g of groups) {
      if (g < startG) continue;
      const need = limit + 1 - pageEntries.length;
      if (need <= 0) break;
      const rows = await queryFor(g, need);
      for (const row of rows) pageEntries.push({ row, g });
      if (rows.length === need) break;
    }

    // Contador "N a enviar" (estavel; independe de filtro/cursor, so da busca — igual
    // ao "N atrasados" do embarque).
    const pendingRows = await this.prisma.$queryRaw`
      SELECT count(*)::int AS n
      FROM sale_contract sc
      WHERE sc.requires_approval = true
        AND sc.status = 'EMITIDO'
        AND NOT EXISTS (SELECT 1 FROM approval_label_log a WHERE a.sale_contract_id = sc.id)
        ${searchFrag}
    `;
    const pendingCount = Number(pendingRows[0]?.n ?? 0);

    const hasMore = pageEntries.length > limit;
    const page = hasMore ? pageEntries.slice(0, limit) : pageEntries;
    if (page.length === 0) {
      return { items: [], nextCursor: null, pendingCount };
    }
    const last = page[page.length - 1];
    const cursorKey = (g, row) => {
      if (g === 0) return row.invoiceDate ? row.invoiceDate.toISOString().slice(0, 10) : null;
      if (g === 1) return row.lastSendAt ? row.lastSendAt.toISOString() : null;
      return null;
    };
    const nextCursor = hasMore
      ? encodeApprovalWlCursor({
          g: last.g,
          key: cursorKey(last.g, last.row),
          seq: Number(last.row.contractSeq),
        })
      : null;

    return {
      items: page.map((e) => buildApprovalWorklistView(e.row, todayKey)),
      nextCursor,
      pendingCount,
    };
  }

  // F1 (E21-E27/D138): eventos de "pagamento de contrato" do card de Eventos do
  // dashboard. Agendado = NAO pagos (EMITIDO/FATURADO) no paymentDate; realizado =
  // PAGO no paidAt; WASH_OUT fora. Escopo aberto (own-only revogado): ADMIN e
  // COMMERCIAL veem todos; demais papeis nem chegam (gate FINANCEIRO_ROLES). Janela
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

    // Escopo aberto (2026-07-13, own-only revogado): ADMIN e COMMERCIAL veem os
    // eventos de pagamento de TODOS os contratos (o feed nao filtra por corretor).
    const scope = {};

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

    // E29: "hoje" BRT reclassifica os agendados vencidos (dot vermelho).
    return bucketPaymentEvents(dueRows, paidRows, brtTodayKey());
  }

  // Embarque (EMB8/EMB9/EMB24): evento do card de Eventos — companheiro da worklist.
  // Agendado = requiresShipment + EMITIDO/FATURADO + NAO embarcado, no dia previsto
  // (invoiceDate; vira vermelho se o dia passar, EMB24); realizado = embarcado
  // (shippedAt), no dia real (verde/realizado — cor por ESTADO, DSB-D10). Visibilidade: TODOS os nao-PROSPECTOR
  // (EMB7 — auth-only, sem escopo por corretor; PROSPECTOR barrado no allowlist central).
  // Janela [from, to] = 'YYYY-MM-DD'. Retorna Record<'YYYY-MM-DD', evento[]>.
  async getDashboardShipmentEvents(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list dashboard shipment events');

    const dayKeyRe = /^\d{4}-\d{2}-\d{2}$/;
    const from = typeof input?.from === 'string' && dayKeyRe.test(input.from) ? input.from : null;
    const to = typeof input?.to === 'string' && dayKeyRe.test(input.to) ? input.to : null;
    if (!from || !to) {
      return {};
    }

    const gte = new Date(`${from}T00:00:00.000Z`);
    const lte = new Date(`${to}T00:00:00.000Z`);

    const [scheduledRows, doneRows] = await Promise.all([
      this.prisma.saleContract.findMany({
        where: {
          requiresShipment: true,
          status: { in: ['EMITIDO', 'FATURADO'] },
          shippedAt: null,
          invoiceDate: { gte, lte },
        },
        select: SHIPMENT_EVENT_SELECT,
      }),
      this.prisma.saleContract.findMany({
        where: {
          requiresShipment: true,
          status: { in: ['EMITIDO', 'FATURADO', 'PAGO'] },
          shippedAt: { gte, lte },
        },
        select: SHIPMENT_EVENT_SELECT,
      }),
    ]);

    return bucketShipmentEvents(scheduledRows, doneRows, brtTodayKey());
  }

  // Faturamento (DSB-D11): evento do card de Eventos — irmao do embarque. Agendado =
  // EMITIDO no dia previsto (invoiceDate; vira vermelho se o dia passar); realizado =
  // FATURADO/PAGO no dia REAL do faturamento (invoicedAt). Visibilidade: TODOS os
  // nao-PROSPECTOR (auth-only, sem escopo por corretor — mesmo do embarque; o chip so
  // navega pra aba Contratos p/ quem a tem). Janela [from, to] = 'YYYY-MM-DD'.
  async getDashboardInvoiceEvents(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list dashboard invoice events');

    const dayKeyRe = /^\d{4}-\d{2}-\d{2}$/;
    const from = typeof input?.from === 'string' && dayKeyRe.test(input.from) ? input.from : null;
    const to = typeof input?.to === 'string' && dayKeyRe.test(input.to) ? input.to : null;
    if (!from || !to) {
      return {};
    }

    const gte = new Date(`${from}T00:00:00.000Z`);
    const lte = new Date(`${to}T00:00:00.000Z`);

    const [scheduledRows, doneRows] = await Promise.all([
      this.prisma.saleContract.findMany({
        where: { status: 'EMITIDO', invoiceDate: { gte, lte } },
        select: INVOICE_EVENT_SELECT,
      }),
      this.prisma.saleContract.findMany({
        where: { status: { in: ['FATURADO', 'PAGO'] }, invoicedAt: { gte, lte } },
        select: INVOICE_EVENT_SELECT,
      }),
    ]);

    return bucketInvoiceEvents(scheduledRows, doneRows, brtTodayKey());
  }

  // AP16: envios de aprovacao recentes p/ o card "Aprovacoes enviadas" (DSB-D14:
  // mora na aba Aprovacoes de /embarques; nasceu no dashboard). Ordena por
  // createdAt desc; exclui avulsas historicas (saleContractId NULL). Join manual do
  // contrato (nº + comprador) — SaleContract nao tem @relation.
  async getRecentApprovalSends() {
    const logs = await this.prisma.approvalLabelLog.findMany({
      where: { saleContractId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: RECENT_APPROVAL_SENDS_LIMIT,
      select: { id: true, saleContractId: true, createdAt: true },
    });
    if (logs.length === 0) {
      return [];
    }
    const contractIds = [...new Set(logs.map((l) => l.saleContractId))];
    const contracts = await this.prisma.saleContract.findMany({
      where: { id: { in: contractIds } },
      select: { id: true, contractNumber: true, buyerSnapshot: true },
    });
    const byId = new Map(contracts.map((c) => [c.id, c]));
    return logs.map((log) =>
      buildRecentApprovalSendItem(log, byId.get(log.saleContractId) ?? null)
    );
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
    // D144: so o FUTURO pode nascer com datas planejadas "A definir" (null).
    const etapa2 = normalizeEtapa2Input(input ?? {}, { allowOpenDates: true });
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

    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);

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

    // D144: normaliza DEPOIS de carregar o contrato — so o FUTURO aceita datas
    // planejadas "A definir" (null), e a permissao deriva do type persistido
    // (nao do payload). Efeito colateral aceito: 404/409 precedem o 422 de payload.
    const etapa2 = normalizeEtapa2Input(input ?? {}, {
      allowOpenDates: contract.type === 'FUTURO',
    });

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

    // Corretores (Editar fase 1): resolve ANTES dos syncs cross-aggregate (D143)
    // — o assertBrokersResolved pode lancar 422, e depois dos syncs a unica
    // falha aceitavel e o proprio conflito de versao. Troca dentro da tx.
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

    // D48: contrato a vista (tem sampleId) -> mantem o dono da amostra coerente
    // com o vendedor do contrato. Feito ANTES do update do contrato — passo
    // cross-aggregate NAO-atomico por decisao (D143): a janela e minuscula (a
    // version foi checada logo acima) e os 2 syncs sao idempotentes — num 409
    // de concorrencia, o retry do Editar converge sem efeito duplicado.
    // No-op se ja coerente.
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

    // Deságio não pode inverter o preço (total/corretagem negativos).
    assertAgioWithinUnitPrice(Number(contract.unitPrice), agioDesagioType, agioDesagioValue);

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
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const invoicedAt = normalizeActionDate(input?.date, 'date');

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, version: true, requiresApproval: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    if (contract.status !== 'EMITIDO') {
      throw new HttpError(409, `Sale contract is ${contract.status} and cannot be invoiced`, {
        code: 'SALE_CONTRACT_NOT_INVOICEABLE',
      });
    }
    // Portão AP18: um contrato marcado "Sim" não passa de EMITIDO -> FATURADO sem
    // >=1 aprovação enviada (approval_label_log). É o remédio do "esquecer de enviar"
    // — vira contrato travado no faturar (visível em "a enviar", recuperável), não
    // dado ruim silencioso. Pagar HERDA (E3: não fatura sem enviar => não paga sem
    // enviar). Count fora da tx é seguro — o log é append-only (sem race nociva).
    if (contract.requiresApproval) {
      const labelCount = await this.prisma.approvalLabelLog.count({
        where: { saleContractId: contractId },
      });
      if (labelCount === 0) {
        throw new HttpError(422, 'Approval must be sent before invoicing', {
          code: 'CONTRACT_APPROVAL_REQUIRED',
        });
      }
    }
    if (contract.version !== expectedVersion) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }
    // Não se fatura no futuro — a data REAL do faturamento não passa de hoje (BRT),
    // consistente com pagar (E30) e embarcar. DEPOIS dos guards de status/versão.
    if (invoicedAt.getTime() > brtTodayDateOnly().getTime()) {
      throw new HttpError(422, 'Invoice date must not be in the future', {
        code: 'VALIDATION_ERROR',
        field: 'date',
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

  // AP23: toggle rapido Sim/Nao do requiresApproval no Detalhes (sem abrir o "Editar"
  // inteiro). So ADMIN/COMMERCIAL (AP9; COMMERCIAL nos dele). Travas AP20: so muda em
  // EMITIDO (faturado+/washout congelam — 409 NOT_EDITABLE); Sim->Nao so ANTES do 1o
  // envio (apos enviar trava em "Sim" — 409 LOCKED). Grava o lead PADRAO (30) ao ligar
  // / null ao desligar (lead custom fica no "Editar"). Bumpa version (muda o contrato).
  async setSaleContractApprovalFlag(contractId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'set approval flag');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'set approval flag');
    this._requireContractId(contractId);
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const requiresApproval = normalizeRequiredBoolean(input?.requiresApproval, 'requiresApproval');

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, version: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    // AP20: o sinal so muda enquanto EMITIDO; faturado/pago/washout congelam a decisao.
    if (contract.status !== 'EMITIDO') {
      throw new HttpError(409, `Sale contract is ${contract.status}; approval flag is frozen`, {
        code: 'APPROVAL_FLAG_NOT_EDITABLE',
      });
    }
    if (contract.version !== expectedVersion) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }
    // AP20: desmarcar (Sim->Nao) so ANTES do 1o envio — depois trava em "Sim" (ja foi
    // aprovado, nao da pra fingir que nao precisava). Marcar (->Sim) e sempre livre.
    if (!requiresApproval) {
      const labelCount = await this.prisma.approvalLabelLog.count({
        where: { saleContractId: contractId },
      });
      if (labelCount > 0) {
        throw new HttpError(409, 'Approval already sent; flag is locked to "Sim"', {
          code: 'APPROVAL_FLAG_LOCKED',
        });
      }
    }

    const approvalReminderLeadDays = normalizeApprovalReminderLeadDays(undefined, requiresApproval);
    const updated = await this.prisma.saleContract.updateMany({
      where: { id: contractId, version: expectedVersion, status: 'EMITIDO' },
      data: { requiresApproval, approvalReminderLeadDays, version: { increment: 1 } },
    });
    if (updated.count === 0) {
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
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const paidAt = normalizeActionDate(input?.date, 'date');

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, version: true, requiresShipment: true, shippedAt: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    if (contract.status !== 'FATURADO') {
      throw new HttpError(409, `Sale contract is ${contract.status} and cannot be paid`, {
        code: 'SALE_CONTRACT_NOT_PAYABLE',
      });
    }
    // Portao do embarque (EMB28): nao se paga sem embarcar. Junto dos guards de status
    // (contrato ja FATURADO), se exige embarque e ainda nao embarcou, 422 — o front abre
    // o modal de confirmacao (unica acao), confirma e segue direto pro pagamento. Fecha o
    // buraco "pago sem registro de embarque" (o atraso some no PAGO — EMB9).
    if (contract.requiresShipment && !contract.shippedAt) {
      throw new HttpError(422, 'Shipment must be confirmed before payment', {
        code: 'CONTRACT_SHIPMENT_REQUIRED',
      });
    }
    if (contract.version !== expectedVersion) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }
    // E30 (Revisao do Pagamento): nao se paga no futuro — a data do pagamento nao passa
    // de hoje (BRT). Regra de negocio DEPOIS dos guards de status/versao, pra um
    // contrato invalido dar o erro de estado (nao o de data). paidAt e @db.Date
    // (meia-noite UTC); comparar contra o ancora BRT deixa "pagar hoje" passar (igual).
    if (paidAt.getTime() > brtTodayDateOnly().getTime()) {
      throw new HttpError(422, 'Payment date must not be in the future', {
        code: 'VALIDATION_ERROR',
        field: 'date',
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
  // URL) — papel, elegibilidade e side ja foram validados la.
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
  // @relation). Mesmo gate de papel do getSaleContract (o timeline vive no modal
  // de Detalhes do /contratos).
  async getSaleContractTimeline(contractId, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'get sale contract timeline');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'get sale contract timeline');
    this._requireContractId(contractId);

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

  async _requireLookup(model, id, field, extraSelect = {}) {
    const row = await this.prisma[model].findUnique({
      where: { id },
      select: { id: true, name: true, status: true, ...extraSelect },
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
    // Embarque (EMB21): a modalidade carrega a flag "embarca?" — o contrato herda
    // por snapshot (extraSelect so aqui; os outros 2 lookups nao tem a coluna).
    const modality = await this._requireLookup(
      'contractModality',
      etapa2.modalityId,
      'modalityId',
      {
        requiresShipment: true,
      }
    );
    const packaging = await this._requireLookup(
      'contractPackaging',
      etapa2.packagingId,
      'packagingId'
    );

    // Deságio não pode inverter o preço (total/corretagem negativos).
    assertAgioWithinUnitPrice(unitPrice, etapa2.agioDesagioType, etapa2.agioDesagioValue);

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
      // Embarque (EMB21/EMB22): o sinal NAO e escolha do usuario — herda da
      // modalidade (flag semeada: Retirar/Posto=true, Disponivel=false) e CONGELA
      // por snapshot aqui. Editar a modalidade depois nao altera contratos antigos.
      // shippedAt nasce nulo (preenchido so na confirmacao do embarque, EMB27).
      requiresShipment: modality.requiresShipment ?? false,
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
  // Embalagem) a partir do dropdown do modal. ADMIN-only (P26/D94); append no fim
  // (sortOrder = max+1); nome UNIQUE -> 409. Status sempre ACTIVE.
  async createContractLookup(input, actorContext) {
    assertAuthenticatedActor(actorContext, 'create contract lookup');
    assertRoleAllowed(actorContext.role, CONTRACT_LOOKUP_MANAGE_ROLES, 'create contract lookup');
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
