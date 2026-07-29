import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { assertRoleAllowed, NON_PROSPECTOR_ROLES } from '../auth/roles.js';
import { buildClientDisplayName } from '../clients/client-support.js';
import { HttpError } from '../contracts/errors.js';
import { assertAuthenticatedActor, readLimitQuery } from '../users/user-support.js';
import {
  assertBrokersResolved,
  buildBankSnapshot,
  buildContractTimeline,
  buildPartySnapshot,
  buildReceivableView,
  decodeContractSeqCursor,
  decodeReceivableCursor,
  encodeReceivableCursor,
  normalizeContractPeriodFilter,
  normalizeEnumFilterList,
  normalizeReceivableFilter,
  normalizeUuidFilter,
  receivableKeysetWhere,
  deriveContractAgenda,
  deriveContractPhases,
  finalizeBlockReason,
  buildApprovalWorklistView,
  decodeApprovalWlCursor,
  encodeApprovalWlCursor,
  normalizeApprovalWlFilter,
  buildRecentApprovalSendItem,
  brtTodayDateOnly,
  brtTodayKey,
  bucketPaymentEvents,
  bucketInvoiceEvents,
  buildDashboardAvisoItem,
  DASHBOARD_AVISOS_LIMIT,
  buildWarehouseSnapshot,
  assertAgioWithinUnitPrice,
  computeContractMoneyWithAgio,
  CONTRACT_LOOKUP_LISTS,
  formatContractNumber,
  isFutureContract,
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

// ACESSO UNIFICADO (2026-07-15): todo papel nao-PROSPECTOR acessa e opera os
// contratos. Gestao (SALE_CONTRACT_ACCESS_ROLES) e a criacao de valores das listas
// cadastraveis inline (CONTRACT_LOOKUP_MANAGE_ROLES, createContractLookup) passaram
// de ADMIN/ADMIN+COMMERCIAL para o conjunto canonico NON_PROSPECTOR_ROLES.
// Espelhado no front (lib/roles.ts). O gate de papel (assertRoleAllowed) no topo de
// cada metodo e a unica autorizacao; o escopo segue ABERTO (own-only revogado, D140
// — sem filtro por Broker). Contexto preservado: a CRIACAO nasce EMITIDO numa so
// operacao (D97 — a vista via createSpotSaleContract/createSampleMovement; Futuro
// via createFutureSaleContract, CRUD direto); o Financeiro mostra TODOS os
// fechamentos com co-corretores e total sem rateio (D136).
//
// RC-D3/RC-D5 (2026-07-27): o FINANCEIRO sai do conjunto unificado e vira ADMIN —
// e a carteira consolidada, agora em pagina propria (/financeiro). A constante se
// PARTE EM DUAS porque tinha dois consumidores com publicos diferentes: a carteira
// (listBrokerReceivables) e o feed de pagamento do calendario do dashboard
// (getDashboardPaymentEvents), que continua para todo nao-PROSPECTOR. Apertar as
// duas juntas tiraria o pagamento do calendario de 4 dos 5 papeis.
//
// RC-D4: o gate e de ROTA, nao de campo — o detalhe do contrato segue devolvendo
// valores e corretagem para todos. /users segue ADMIN (fora deste dominio).
const CONTRACT_LOOKUP_MANAGE_ROLES = NON_PROSPECTOR_ROLES;
const FINANCEIRO_ROLES = ['ADMIN'];
const PAYMENT_FEED_ROLES = NON_PROSPECTOR_ROLES;
const SALE_CONTRACT_ACCESS_ROLES = NON_PROSPECTOR_ROLES;

// Mesma chave do gerador do numero em src/events/prisma-event-store.js (NNNN
// global, compartilhado a vista + Futuro). pg_advisory_xact_lock serializa a
// alocacao do contract_seq na criacao do contrato Futuro (sem movimento).
const SALE_CONTRACT_SEQ_LOCK_KEY = 831202606;

// RC-F6: a lista pagina por cursor (contractSeq) com scroll infinito no front —
// o teto caiu de 200/500 pra uma pagina de verdade (molde do FINANCEIRO_LIST_*).
const SALE_CONTRACT_LIST_LIMIT_DEFAULT = 30;
const SALE_CONTRACT_LIST_LIMIT_MAX = 60;

// AP16: teto dos envios de aprovacao recentes no feed "Ultimos envios" (mesmo 40 do
// DASHBOARD_RECENT_SENDS_LIMIT do samples query-service). DSB-D5: cada lista tem seu
// proprio top-40 — o handler NAO mescla nem corta, devolve { sampleItems, approvalItems }.
const RECENT_APPROVAL_SENDS_LIMIT = 40;

// Financeiro (S86): pagina por cursor (contractSeq) com scroll infinito no front.
const FINANCEIRO_LIST_LIMIT_DEFAULT = 30;
const FINANCEIRO_LIST_LIMIT_MAX = 60;

// RC-D68: os ingredientes da agenda. Tudo mora na linha do contrato menos "ja saiu
// etiqueta?", que vem de fora (batch na lista, count no detalhe).
function agendaInputOf(row, hasApprovalLabel) {
  return {
    status: row.status,
    requiresApproval: row.requiresApproval,
    hasApprovalLabel,
    approvalReminderLeadDays: row.approvalReminderLeadDays,
    invoiceDate: row.invoiceDate,
    paymentDate: row.paymentDate,
  };
}

export class SaleContractService {
  // commandService + queryService sao opcionais (usados so no D48 — sincronizar
  // o vendedor do contrato com o Sample.ownerClientId via updateRegistration).
  constructor({ prisma, commandService = null, queryService = null }) {
    this.prisma = prisma;
    this.commandService = commandService;
    this.queryService = queryService;
  }

  // RC-F6: a lista de /contratos virou servidor-side. Ate aqui o front chamava com
  // query VAZIA e resolvia tudo em memoria — acima do teto de 200 os contratos
  // sumiam sem aviso, a contagem exibida era a do array baixado e `?details=<id>`
  // de um contrato fora da pagina morria calado. Agora busca, filtros e paginacao
  // (keyset por contractSeq) vivem aqui.
  async listSaleContracts(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'list sale contracts');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'list sale contracts');

    const search = typeof input?.search === 'string' ? input.search.trim() : '';
    const statuses = normalizeEnumFilterList(input?.status, SALE_CONTRACT_STATUSES, 'status');
    const types = normalizeEnumFilterList(input?.type, SALE_CONTRACT_TYPES, 'type');
    const buyerClientId = normalizeUuidFilter(input?.buyerClientId, 'buyerClientId');
    const sellerClientId = normalizeUuidFilter(input?.sellerClientId, 'sellerClientId');
    const period = normalizeContractPeriodFilter(input);
    const limit = readLimitQuery(input?.limit, {
      fallback: SALE_CONTRACT_LIST_LIMIT_DEFAULT,
      max: SALE_CONTRACT_LIST_LIMIT_MAX,
    });
    const cursor = decodeContractSeqCursor(input?.cursor);

    // Filtros como lista AND (evita a chave OR da busca colidir com a do periodo).
    // filterClauses (sem cursor) alimenta o count do total; pageWhere acrescenta o
    // cursor — molde do listUsers.
    const filterClauses = [];
    if (statuses.length) filterClauses.push({ status: { in: statuses } });
    if (types.length) filterClauses.push({ type: { in: types } });
    if (buyerClientId) filterClauses.push({ buyerClientId });
    if (sellerClientId) filterClauses.push({ sellerClientId });
    if (period.from || period.to) {
      const range = {};
      if (period.from) range.gte = period.from;
      if (period.to) range.lte = period.to;
      filterClauses.push({ [period.field]: range });
    }
    if (search.length >= 1) {
      // As partes moram em JSON (seller_snapshot/buyer_snapshot) — ILIKE no `->>` e
      // o mesmo molde do Financeiro. Ate a RC-F6 o servidor buscava nº do contrato +
      // nº da compra e o navegador buscava nº + nomes das partes: campos DIFERENTES
      // nos dois lados. Agora e a uniao dos quatro, num lugar so.
      const partyMatchIds = await this._searchPartyContractIds(search);
      filterClauses.push({
        OR: [
          { contractNumber: { contains: search, mode: 'insensitive' } },
          { purchaseNumber: { contains: search, mode: 'insensitive' } },
          { id: { in: partyMatchIds } },
        ],
      });
    }

    const filterWhere = filterClauses.length ? { AND: filterClauses } : {};
    const pageWhere = cursor
      ? { AND: [...filterClauses, { contractSeq: { lt: cursor } }] }
      : filterWhere;

    // take = limit + 1 detecta a proxima pagina sem um count extra por rolagem.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.saleContract.findMany({
        where: pageWhere,
        orderBy: [{ contractSeq: 'desc' }],
        take: limit + 1,
        select: SALE_CONTRACT_VIEW_SELECT,
      }),
      this.prisma.saleContract.count({ where: filterWhere }),
    ]);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: await this._withAgenda(pageRows),
      nextCursor: hasMore ? String(pageRows[pageRows.length - 1].contractSeq) : null,
      total,
    };
  }

  // RC-D68: a coluna "Situacao" da lista mostra o PROXIMO COMPROMISSO, nao um rotulo
  // de fase — e o compromisso e derivado de dado que o contrato ja carrega. So um
  // ingrediente nao mora na linha: "ja saiu etiqueta de aprovacao?". Vem num batch
  // por pagina (<=30 ids), molde dos corretores do Financeiro; nao da pra ser join
  // porque SaleContract nao tem @relation com approval_label_log (FKs so no SQL).
  async _withAgenda(rows) {
    const todayKey = brtTodayKey();
    // So contrato marcado precisa da consulta — os demais nunca caem no ramo da
    // aprovacao, e numa pagina sem nenhum marcado a query nao acontece.
    const needing = rows.filter((row) => row.requiresApproval).map((row) => row.id);
    let labeled = new Set();
    if (needing.length) {
      const logs = await this.prisma.approvalLabelLog.groupBy({
        by: ['saleContractId'],
        where: { saleContractId: { in: needing } },
      });
      labeled = new Set(logs.map((log) => log.saleContractId));
    }
    // RC-D80: a linha de fases sai DAQUI e nao de uma consulta propria — ela usa
    // exatamente os mesmos ingredientes da agenda, entao nao custa nem uma query a
    // mais. E, derivando do mesmo lugar, a linha e o texto ao lado dela nao tem como
    // se contradizer na mesma celula.
    return rows.map((row) => {
      const input = agendaInputOf(row, labeled.has(row.id));
      return {
        ...toSaleContractView(row),
        agenda: deriveContractAgenda(input, todayKey),
        phases: deriveContractPhases(input, todayKey),
      };
    });
  }

  // A mesma agenda para UM contrato (o Detalhes). Deriva do mesmo lugar que a lista
  // de proposito: se a linha diz "aprovacao a enviar" e o detalhe dissesse outra
  // coisa, o usuario nao teria como saber qual das duas acreditar.
  async _agendaFor(row) {
    const hasApprovalLabel = row.requiresApproval
      ? (await this.prisma.approvalLabelLog.count({ where: { saleContractId: row.id } })) > 0
      : false;
    return deriveContractAgenda(agendaInputOf(row, hasApprovalLabel), brtTodayKey());
  }

  // RC-F6: ids dos contratos cujo vendedor OU comprador casa com a busca. Os nomes
  // moram no snapshot JSON, entao vai por $queryRaw com ILIKE no `->>'displayName'`
  // (mesmo escape de \ % _ do _searchBuyerContractIds do Financeiro).
  async _searchPartyContractIds(search) {
    const esc = search.replace(/[\\%_]/g, (c) => `\\${c}`);
    const like = `%${esc}%`;
    const rows = await this.prisma.$queryRaw`
      SELECT id FROM sale_contract
      WHERE seller_snapshot->>'displayName' ILIKE ${like}
         OR buyer_snapshot->>'displayName' ILIKE ${like}
    `;
    return [...new Set(rows.map((r) => r.id))];
  }

  // Financeiro (Fase F): lista a corretagem A RECEBER por fechamento. Relatorio
  // DERIVADO (sem persistencia): TODOS os contratos congelados (EMITIDO/
  // FINALIZADO), inclusive os SEM corretagem (P24/D92 — e o unico lugar onde o total do
  // contrato aparece) E os em WASH_OUT do FUTURO (D105 refinada pela D145: o
  // corretor recebe a comissao no washout so no FUTURO; o fisico cancelado
  // nao paga e sai do Financeiro). SEM rateio ÷N (D136 removeu a "cota por
  // corretor"): o valor por fechamento = a corretagem TOTAL (vendedor + comprador);
  // os co-corretores sao listados so como atribuicao. ACESSO (escopo aberto
  // 2026-07-13, own-only revogado): RC-D3 fecha a carteira no ADMIN — dentro dela
  // o escopo segue ABERTO (TODOS os fechamentos, co-corretores visiveis, total =
  // a corretagem total), so quem entra e que mudou. Select enxuto
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

    // FN4 (fila de trabalho): G0 a receber por vencimento (asc, nulos ao fim -> vencido
    // no topo -> a vencer -> sem data); G1 recebida e G2 cancelado no arquivo (seq
    // desc). O filtro FN5 escolhe quais grupos e refina o G0 (vencido = < hoje; a vencer
    // = >= hoje ou sem data). O corte vencido/a-vencer cai da ordenacao por paymentDate.
    //
    // RC-D67: o /financeiro nao tem mais acao propria — a corretagem sai da fila quando
    // o CONTRATO e finalizado, em /contratos. "Recebida" = FINALIZADO (era o PAGO que
    // se marcava aqui); "a receber" = o contrato ainda em andamento.
    const G0_ORDER = [{ paymentDate: { sort: 'asc', nulls: 'last' } }, { contractSeq: 'asc' }];
    const ARCHIVE_ORDER = [{ contractSeq: 'desc' }];
    const UNPAID = { status: { in: ['EMITIDO'] } };
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
    } else if (filter === 'recebida') {
      groups = [{ g: 1, where: { status: 'FINALIZADO' }, orderBy: ARCHIVE_ORDER }];
    } else if (filter === 'cancelado') {
      groups = [{ g: 2, where: WASHOUT_BILLABLE, orderBy: ARCHIVE_ORDER }];
    } else {
      groups = [
        { g: 0, where: UNPAID, orderBy: G0_ORDER },
        { g: 1, where: { status: 'FINALIZADO' }, orderBy: ARCHIVE_ORDER },
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
            { OR: [{ status: { in: ['EMITIDO', 'FINALIZADO'] } }, WASHOUT_BILLABLE] },
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

  // 🪦 listShipmentContracts (EMB23-EMB25) — a worklist de embarque morreu com o
  // embarque inteiro (RC-D65 §6): confirmacao, fotos, transporte e responsavel eram
  // escrituracao pura, e o portao EMB28 travava o pagamento em cima dela.

  // Aprovacao (AP25-AP28): a worklist da sub-aba. Auth-only (todos nao-PROSPECTOR,
  // AP10/AP30 — SEM escopo por corretor, SEM dado sensivel). O estado depende de um
  // AGREGADO (contagem no approval_label_log), entao — ao contrario do embarque (typed
  // findMany) — usa $queryRaw: G0 a_enviar (marcado+EMITIDO+SEM etiqueta, anti-join
  // NOT EXISTS) por invoiceDate ASC (fila, AP28); G1 enviada (>=1 etiqueta, nao washout)
  // por ultimo envio DESC, com count => "·N×" (AP24); G2 cancelado (WASH_OUT + FUTURO,
  // AP33 — alinha ao Financeiro/D145: a vista washout sai) por contractSeq DESC. Cursor
  // {g,key,seq} (o key do G1 leva HORA). So requiresApproval.
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
          AND sc.type = 'FUTURO'
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
  // dashboard. RC-D62/D68: o calendario carrega SO o contrato em andamento — o
  // finalizado e o cancelado nao tem nada a lembrar, e o marco "realizado" (o
  // paidAt) deixou de existir. Sobra o compromisso no paymentDate, que continua
  // virando vermelho quando o dia passa (RC-D64: o atraso e SO do pagamento).
  // Escopo aberto (own-only revogado; ACESSO UNIFICADO 2026-07-15): todo
  // nao-PROSPECTOR ve todos; so o PROSPECTOR nem chega (gate PAYMENT_FEED_ROLES —
  // RC-D5: o calendario NAO seguiu a carteira pro ADMIN-only). Janela [from, to] =
  // 'YYYY-MM-DD' (a quinzena visivel do card). Retorna Record<'YYYY-MM-DD',
  // evento[]> (o formato da prop `events` do card).
  async getDashboardPaymentEvents(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'list dashboard payment events');
    assertRoleAllowed(actor.role, PAYMENT_FEED_ROLES, 'list dashboard payment events');

    const dayKeyRe = /^\d{4}-\d{2}-\d{2}$/;
    const from = typeof input?.from === 'string' && dayKeyRe.test(input.from) ? input.from : null;
    const to = typeof input?.to === 'string' && dayKeyRe.test(input.to) ? input.to : null;
    if (!from || !to) {
      return {};
    }

    // Escopo aberto (own-only revogado; ACESSO UNIFICADO 2026-07-15): todo nao-PROSPECTOR ve os
    // eventos de pagamento de TODOS os contratos (o feed nao filtra por corretor).
    const scope = {};

    // paymentDate e @db.Date (midnight UTC); a janela 'YYYY-MM-DD' vira Date UTC —
    // inclui os dois extremos.
    const gte = new Date(`${from}T00:00:00.000Z`);
    const lte = new Date(`${to}T00:00:00.000Z`);

    const dueRows = await this.prisma.saleContract.findMany({
      where: { ...scope, status: 'EMITIDO', paymentDate: { gte, lte } },
      select: PAYMENT_EVENT_SELECT,
    });

    // E29: "hoje" BRT reclassifica os agendados vencidos (dot vermelho).
    return bucketPaymentEvents(dueRows, brtTodayKey());
  }

  // 🪦 getDashboardShipmentEvents (EMB8/EMB9/EMB24) — junto com o resto do embarque
  // (RC-D65 §6). Os tres eventos de embarque sumiram do calendario.

  // Faturamento (DSB-D11): evento do card de Eventos. RC-D64: o faturamento e
  // LEMBRETE PURO — nao existe acao que o resolva, entao ele nunca fica vermelho e
  // nao tem marco "realizado"; passou o dia, o aviso se recolhe sozinho. Visibilidade:
  // TODOS os nao-PROSPECTOR (auth-only, sem escopo por corretor; o chip so navega pra
  // aba Contratos p/ quem a tem). Janela [from, to] = 'YYYY-MM-DD'.
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

    const scheduledRows = await this.prisma.saleContract.findMany({
      where: { status: 'EMITIDO', invoiceDate: { gte, lte } },
      select: INVOICE_EVENT_SELECT,
    });

    return bucketInvoiceEvents(scheduledRows);
  }

  // AP31/DSB-D19: card de "Avisos" do dashboard — 1º tipo = "aprovacao a enviar".
  // BINARIO (nao o fan-out do lembrete antigo, DSB-D9): o contrato pendente aparece
  // uma vez e SOME quando a etiqueta e gerada. Predicado = worklist G0 + janela de
  // lead-time (invoice_date <= hoje + approval_reminder_lead_days). "A definir" (D144,
  // invoice_date NULL) SEMPRE avisa (sem janela). Auth-only (todos nao-PROSPECTOR;
  // barrado no allowlist central). Hits idx_sale_contract_requires_approval_status_invoice.
  async getDashboardAvisos(_input, actorContext) {
    assertAuthenticatedActor(actorContext, 'list dashboard avisos');
    const todayKey = brtTodayKey();
    const rows = await this.prisma.$queryRaw`
      SELECT sc.id,
             sc.contract_number AS "contractNumber",
             sc.buyer_snapshot->>'displayName' AS "buyerName",
             sc.invoice_date AS "invoiceDate"
      FROM sale_contract sc
      WHERE sc.requires_approval = true
        AND sc.status = 'EMITIDO'
        AND NOT EXISTS (SELECT 1 FROM approval_label_log a WHERE a.sale_contract_id = sc.id)
        AND (
          sc.invoice_date IS NULL
          OR sc.invoice_date <=
             (${todayKey}::date + (COALESCE(sc.approval_reminder_lead_days, 0) || ' days')::interval)
        )
      ORDER BY sc.invoice_date ASC NULLS LAST, sc.contract_seq ASC
      LIMIT ${DASHBOARD_AVISOS_LIMIT}
    `;
    return { items: rows.map((row) => buildDashboardAvisoItem(row, todayKey)) };
  }

  // AP16: envios de aprovacao recentes. SEM CONSUMIDOR desde a RC-D26 — o card
  // "Aprovacoes enviadas" (DSB-D14) morreu junto com a aba Aprovacoes, e a rota
  // HTTP saiu com ele. O metodo fica (coberto por teste de integracao) porque o
  // dado — "o que ja foi enviado" — e candidato natural da fase Aprovacao na RC-F2.
  // Ordena por createdAt desc; exclui avulsas historicas (saleContractId NULL).
  // Join manual do contrato (nº + comprador) — SaleContract nao tem @relation.
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
    // RC-D37: a mesma consulta traz o DONO ATUAL do lote — e ele, nao o vendedor
    // gravado, que sera emitido no "Editar"; a tela precisa mostrar o que vai sair.
    // RC-D72: e o NUMERO do lote, que o "Editar" mostra no campo travado. O
    // contrato guarda so o sampleId; sem isto a tela dizia "Lote" e nao dizia
    // qual.
    let sampleIsBlend = null;
    let sampleOwner = null;
    let sampleLotNumber = null;
    if (row.sampleId) {
      const sample = await this.prisma.sample.findUnique({
        where: { id: row.sampleId },
        select: {
          isBlend: true,
          internalLotNumber: true,
          ownerClientId: true,
          // `displayName` nao e coluna — o nome sai do buildClientDisplayName
          // sobre personType + fullName/tradeName/legalName.
          ownerClient: {
            select: {
              id: true,
              personType: true,
              fullName: true,
              tradeName: true,
              legalName: true,
            },
          },
        },
      });
      sampleIsBlend = sample?.isBlend ?? null;
      sampleLotNumber = sample?.internalLotNumber ?? null;
      sampleOwner = sample?.ownerClientId
        ? {
            clientId: sample.ownerClientId,
            displayName: sample.ownerClient ? buildClientDisplayName(sample.ownerClient) : null,
          }
        : null;
    }

    return {
      contract: {
        ...toSaleContractView(row),
        agenda: await this._agendaFor(row),
        brokers: brokers.map(toSaleContractBrokerView),
        sampleIsBlend,
        sampleLotNumber,
        sampleOwner,
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
    this._rejectSellerInPayload(etapa2);

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
    // RC-D37: o vendedor E o dono do lote. O `sellerClientId` do payload NAO e
    // lido — trocar o vendedor se faz no cadastro do lote, nao aqui (revoga a
    // D48, que sincronizava o dono a partir do contrato). Sem dono, o lote nao
    // vende (RC-D39) — e o picker ja nao o lista.
    const sellerClientId = sample.ownerClientId;
    if (!sellerClientId) {
      throw new HttpError(422, 'Sample has no owner and cannot be sold', {
        code: 'SAMPLE_WITHOUT_OWNER',
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

    const result = await this.commandService.createSampleMovement(
      {
        sampleId,
        expectedVersion: sample.version,
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

    // RC-D37: contrato COM lote tem o vendedor derivado do dono do lote (o
    // payload nao e lido); o FUTURO, sem lote, segue com vendedor editavel.
    if (contract.sampleId) this._rejectSellerInPayload(etapa2);
    const sellerClientId = contract.sampleId
      ? await this._requireSampleOwner(contract.sampleId)
      : (etapa2.sellerClientId ?? contract.sellerClientId);
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

    // AP32: o "Editar" NAO altera o sinal de aprovacao — requiresApproval e um latch
    // de mao unica, mudado SO na criacao e pelo botao "Solicitar aprovacao"
    // (setSaleContractApprovalFlag). Preserva o do banco (nao regrava do payload —
    // era o furo que zerava o portao AP18). O lead segue editavel, mas coerente com o
    // sinal preservado: null quando o contrato e "Nao".
    delete data.requiresApproval;
    if (!contract.requiresApproval) {
      data.approvalReminderLeadDays = null;
    }

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

    // Venda do lote coerente com o contrato à vista, via SALE_UPDATED
    // (append-only): comprador (P20) + sacas/data (Editar fase 1). So a vista
    // (tem movementId). O vendedor NAO viaja mais nesta cascata — desde a
    // RC-D37 ele vem do lote, entao nao ha o que devolver para ele.
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

  // 🪦 invoiceSaleContract — "Faturar" (EMITIDO -> FATURADO) e o portao AP18 morreram
  // na RC-D62/D66 (§6). Faturar era escrituracao pura: ninguem precisava dela pra
  // fazer o proprio trabalho, entao era o marco que mais ia faltar — e ele travava o
  // pagamento e mentia no calendario quando faltava. A aprovacao continua importando,
  // mas como AVISO que se resolve sozinho ao gerar a etiqueta, sem travar nada.

  // AP32: "Solicitar aprovacao" — latch de MAO UNICA do requiresApproval no Detalhes
  // (sem abrir o "Editar"). So ADMIN/COMMERCIAL (AP9; COMMERCIAL nos dele). Nao->Sim so;
  // Sim->Nao e IMPOSSIVEL (409 LOCKED, incondicional — endurece a AP20, que so travava
  // apos o 1o envio). So muda enquanto EMITIDO (faturado+/washout congelam — 409
  // NOT_EDITABLE). Idempotente em ja-"Sim" (no-op, double-click safe, NAO re-seta o
  // lead). Ao ligar grava o lead PADRAO (30); o lead custom fica no "Editar". Bumpa
  // version (muda o contrato).
  async setSaleContractApprovalFlag(contractId, input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'set approval flag');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'set approval flag');
    this._requireContractId(contractId);
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);
    const requiresApproval = normalizeRequiredBoolean(input?.requiresApproval, 'requiresApproval');

    // AP32: o latch so LIGA. Desmarcar (Sim->Nao) nunca — nem antes do 1o envio (uma
    // etiqueta enviada nao pode ser "desrequisitada" pra furar o portao do faturar).
    if (!requiresApproval) {
      throw new HttpError(409, 'Approval flag is one-way and cannot be unset', {
        code: 'APPROVAL_FLAG_LOCKED',
      });
    }

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, version: true, requiresApproval: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    // AP20/AP32: o sinal so muda enquanto EMITIDO; faturado/pago/washout congelam.
    if (contract.status !== 'EMITIDO') {
      throw new HttpError(409, `Sale contract is ${contract.status}; approval flag is frozen`, {
        code: 'APPROVAL_FLAG_NOT_EDITABLE',
      });
    }
    // AP32: idempotente — ja marcado nao re-grava (double-click safe; preserva um lead
    // custom posto pelo "Editar"). Sem checar version: nao ha o que mudar.
    if (contract.requiresApproval) {
      return this.getSaleContract(contractId, actorContext);
    }
    if (contract.version !== expectedVersion) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    // Nao->Sim: liga com o lead PADRAO (30). O lead custom fica no "Editar".
    const approvalReminderLeadDays = normalizeApprovalReminderLeadDays(undefined, true);
    const updated = await this.prisma.saleContract.updateMany({
      where: { id: contractId, version: expectedVersion, status: 'EMITIDO' },
      data: { requiresApproval: true, approvalReminderLeadDays, version: { increment: 1 } },
    });
    if (updated.count === 0) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    return this.getSaleContract(contractId, actorContext);
  }

  // 🪦 paySaleContract — "Pagar" (FATURADO -> PAGO) e o portao EMB28 morreram na
  // RC-D62/D65 (§6). O lugar do pagamento no dia a dia agora e a AGENDA: o
  // paymentDate avisa, vence e fica vermelho (RC-D64) ate alguem finalizar.

  // "Finalizar" — EMITIDO -> FINALIZADO (RC-D62). O UNICO marco que sobrou, e ele
  // NAO afirma um fato do mundo ("foi pago em tal dia"): afirma que este contrato
  // nao pede mais nada de ninguem. Por isso nao tem data (RC-D63) — data seria
  // registro, e registro que as vezes falta apodrece; aqui o esquecimento so deixa
  // uma linha a mais na fila. Bumpa version.
  async finalizeSaleContract(contractId, input, actorContext) {
    return this._flipContractStatus(contractId, input, actorContext, {
      op: 'finalize sale contract',
      from: 'EMITIDO',
      to: 'FINALIZADO',
      conflictCode: 'SALE_CONTRACT_NOT_FINALIZABLE',
      conflictMessage: 'cannot be finalized',
      // RC-D85/D86: a UI ja esconde o botao com o motivo escrito, mas botao
      // escondido nao e trava — quem chama a API direto tem que bater aqui.
      guard: (contract) => {
        const block = finalizeBlockReason(contract, brtTodayKey());
        if (block === 'invoice_date_missing') {
          throw new HttpError(409, 'Sale contract has no invoice date', {
            code: 'SALE_CONTRACT_INVOICE_DATE_MISSING',
          });
        }
        if (block === 'before_invoice_date') {
          throw new HttpError(409, 'Sale contract invoice date has not arrived', {
            code: 'SALE_CONTRACT_BEFORE_INVOICE_DATE',
          });
        }
      },
    });
  }

  // "Reabrir" — FINALIZADO -> EMITIDO (RC-D63). Rompe a D122 de proposito: la o
  // marco era fato auditado e voltar atras seria reescrever a historia; aqui e
  // sinalizador de conveniencia, e um toque errado nao pode ser definitivo. Nao
  // apaga nada — o status log ganha a segunda linha, e o historico mostra as duas.
  async reopenSaleContract(contractId, input, actorContext) {
    return this._flipContractStatus(contractId, input, actorContext, {
      op: 'reopen sale contract',
      from: 'FINALIZADO',
      to: 'EMITIDO',
      conflictCode: 'SALE_CONTRACT_NOT_REOPENABLE',
      conflictMessage: 'cannot be reopened',
    });
  }

  // O motor das duas: guard de papel/estado, concorrencia otimista por version e o
  // par update+log na MESMA tx (D123 — quem e quando saem do log, nao de coluna
  // propria; e como a transicao volta, coluna seria mentira na segunda passada).
  async _flipContractStatus(
    contractId,
    input,
    actorContext,
    { op, from, to, conflictCode, conflictMessage, guard = null }
  ) {
    const actor = assertAuthenticatedActor(actorContext, op);
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, op);
    this._requireContractId(contractId);
    const expectedVersion = this._requireExpectedVersion(input?.expectedVersion);

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      // `invoiceDate` entra pelo guard do Finalizar (RC-D85); o Reabrir ignora.
      select: { id: true, status: true, version: true, invoiceDate: true },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    if (contract.status !== from) {
      throw new HttpError(409, `Sale contract is ${contract.status} and ${conflictMessage}`, {
        code: conflictCode,
      });
    }
    // Depois do status e antes da version: o motivo mais util primeiro. Um contrato
    // ja FINALIZADO tem que dizer "nao e finalizavel", nao "falta a data".
    if (guard) guard(contract);
    if (contract.version !== expectedVersion) {
      throw new HttpError(409, 'Sale contract was modified concurrently', {
        code: 'SALE_CONTRACT_VERSION_CONFLICT',
        field: 'expectedVersion',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.saleContract.updateMany({
        where: { id: contractId, version: expectedVersion, status: from },
        data: { status: to, version: { increment: 1 } },
      });
      if (updated.count > 0) {
        await tx.saleContractStatusLog.create({
          data: this._statusLogData(contractId, to, actor),
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

  // Quebra MANUAL (P17): EMITIDO/FINALIZADO -> WASH_OUT, cancelando
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
      select: {
        id: true,
        status: true,
        version: true,
        type: true,
        sampleId: true,
        movementId: true,
      },
    });
    if (!contract) {
      throw new HttpError(404, 'Sale contract not found', { code: 'SALE_CONTRACT_NOT_FOUND' });
    }
    if (!['EMITIDO', 'FINALIZADO'].includes(contract.status)) {
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

    // Futuro (D147): ramifica por `type` (predicado unico, alinhado ao
    // Financeiro/Espelho — antes ramificava pelo vinculo de lote). Futuro nao
    // tem lote — nao ha venda a cancelar nem sacas a devolver — marca WASH_OUT +
    // motivo/data direto no contrato. A invariante type<->vinculo (CHECK
    // chk_sale_contract_type_lote) garante que a vista sempre tem sample/movement.
    if (isFutureContract(contract)) {
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
  // (StatusLog; o legado so-com-data sobrou no washout) e espelhos (EspelhoLog), com os nomes dos
  // atores resolvidos via app_user (join manual — as satelites nao tem
  // @relation). Mesmo gate de papel do getSaleContract (o timeline vive no modal
  // de Detalhes do /contratos).
  async getSaleContractTimeline(contractId, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'get sale contract timeline');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'get sale contract timeline');
    this._requireContractId(contractId);

    const contract = await this.prisma.saleContract.findUnique({
      where: { id: contractId },
      select: { id: true, washoutAt: true, washoutReason: true },
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

  // RC-D27/D28: monta o CONTRATO QUE SERIA EMITIDO, sem gravar nada. E o que a
  // confirmacao pelo documento renderiza: o usuario ve o PDF de verdade — mesmo
  // `_resolveEmitData`, mesmo `renderContractPdf` da emissao — antes de decidir.
  //
  // Cobre os tres modos, pela mesma porta da criacao:
  //   { type: 'MERCADO_A_VISTA', sampleId, ...body }  -> a vista
  //   { type: 'FUTURO', ...body }                     -> futuro
  //   { contractId, ...body }                         -> editar (re-emissao)
  //
  // O numero e PROVISORIO: a alocacao real vive na transacao sob advisory lock
  // (formatContractNumber a partir do MAX(contract_seq)), e por isso nao pode
  // acontecer aqui. Mesma leitura sem lock do getNextContractNumber.
  async previewSaleContract(input, actorContext) {
    const actor = assertAuthenticatedActor(actorContext, 'preview sale contract');
    assertRoleAllowed(actor.role, SALE_CONTRACT_ACCESS_ROLES, 'preview sale contract');

    const contractId = input?.contractId ?? null;
    const contract = contractId
      ? (await this.getSaleContract(contractId, actorContext)).contract
      : null;

    // "Editar" so aceita datas abertas se o contrato JA e FUTURO (D144); na
    // criacao, o proprio type do payload manda.
    const isFuturo = contract ? contract.type === 'FUTURO' : input?.type === 'FUTURO';
    const etapa2 = normalizeEtapa2Input(input ?? {}, { allowOpenDates: isFuturo });

    // Fase 1: na criacao vem inteira no payload; no "Editar" so quando o usuario
    // mexeu nela (saleFields), senao herda do contrato — espelho exato do que o
    // emitSaleContract faz.
    let fase1;
    if (contract) {
      const sf = etapa2.saleFields;
      fase1 = {
        buyerClientId: etapa2.buyerClientId ?? contract.buyerClientId,
        quantitySacks: sf ? sf.quantitySacks : contract.quantitySacks,
        unitPrice: sf ? sf.unitPrice : Number(contract.unitPrice),
        sellerBrokeragePct: sf ? sf.sellerBrokeragePct : Number(contract.sellerBrokeragePct),
        buyerBrokeragePct: sf ? sf.buyerBrokeragePct : Number(contract.buyerBrokeragePct),
        contractDate: sf ? sf.contractDate : contract.contractDate,
      };
    } else {
      fase1 = normalizeFutureSaleContractInput(input ?? {});
    }

    // RC-D37: com lote, o vendedor E o dono do lote — mesma regra do
    // createSpotSaleContract/emitSaleContract. A previa TEM que seguir a regra da
    // emissao: e o documento que o usuario confirma (RC-D27/D28), e divergir aqui
    // faria emitir um vendedor diferente do que ele aprovou.
    const previewSampleId = contract?.sampleId ?? input?.sampleId ?? null;
    if (previewSampleId) this._rejectSellerInPayload(etapa2);
    let sellerClientId = previewSampleId
      ? await this._requireSampleOwner(previewSampleId)
      : (etapa2.sellerClientId ?? contract?.sellerClientId ?? null);
    if (!sellerClientId) {
      throw new HttpError(422, 'sellerClientId is required to preview the contract', {
        code: 'VALIDATION_ERROR',
        field: 'sellerClientId',
      });
    }

    const { data } = await this._resolveEmitData({
      sellerClientId,
      buyerClientId: fase1.buyerClientId,
      quantitySacks: fase1.quantitySacks,
      unitPrice: fase1.unitPrice,
      sellerBrokeragePct: fase1.sellerBrokeragePct,
      buyerBrokeragePct: fase1.buyerBrokeragePct,
      etapa2,
    });

    // Numero: no "Editar" o contrato ja tem o dele; na criacao e o proximo da
    // sequencia, sem lock.
    let contractNumber = contract?.contractNumber ?? null;
    let provisionalNumber = false;
    if (!contractNumber) {
      const { contractNumber: peeked } = await this.getNextContractNumber(actorContext);
      contractNumber = peeked;
      provisionalNumber = true;
    }

    // O renderizador le 25 campos; o `_resolveEmitData` produz os 18 de etapa 2 e
    // os 7 restantes sao a fase 1 + o numero (effectiveUnitPrice tem fallback
    // proprio no PDF, que recalcula do unitPrice + agio).
    return {
      contract: {
        ...data,
        contractNumber,
        contractDate: fase1.contractDate,
        quantitySacks: fase1.quantitySacks,
        unitPrice: fase1.unitPrice,
        sellerBrokeragePct: fase1.sellerBrokeragePct,
        buyerBrokeragePct: fase1.buyerBrokeragePct,
      },
      provisionalNumber,
      sampleId: input?.sampleId ?? contract?.sampleId ?? null,
    };
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
    const modality = await this._requireLookup('contractModality', etapa2.modalityId, 'modalityId');
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
    };

    return { data };
  }

  // RC-D40: contrato COM lote nao le o `sellerClientId` do payload (RC-D37) —
  // entao manda-lo e erro do chamador, nao dado a descartar em silencio. Um campo
  // aceito-e-ignorado mente sobre o que faz: quem chamasse a API acreditaria ter
  // trocado o vendedor. O FUTURO (sem lote) segue exigindo o campo.
  _rejectSellerInPayload(etapa2) {
    if (etapa2.sellerClientId) {
      throw new HttpError(
        422,
        'sellerClientId is derived from the lot owner and must not be sent',
        {
          code: 'SELLER_DERIVED_FROM_SAMPLE',
          field: 'sellerClientId',
        }
      );
    }
  }

  // RC-D37: o dono do lote e a FONTE do vendedor do contrato a vista. Le direto
  // pelo prisma (nao pelo queryService) porque o "Editar" e a previa rodam em
  // contextos onde os services de amostra podem nao estar montados.
  async _requireSampleOwner(sampleId) {
    const sample = await this.prisma.sample.findUnique({
      where: { id: sampleId },
      select: { ownerClientId: true },
    });
    if (!sample) {
      throw new HttpError(404, `Sample ${sampleId} not found`, { code: 'SAMPLE_NOT_FOUND' });
    }
    if (!sample.ownerClientId) {
      throw new HttpError(422, 'Sample has no owner and cannot be sold', {
        code: 'SAMPLE_WITHOUT_OWNER',
        field: 'sellerClientId',
      });
    }
    return sample.ownerClientId;
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
}
