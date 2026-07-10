import { HttpError } from '../contracts/errors.js';
import { toIsoString } from '../users/user-support.js';

// Fechamento (Fase B.2 -- Passo 1): helpers PUROS (sem I/O) do contrato de
// venda "Mercado a vista". O contrato e CRUD (nao event-sourced); nasce junto
// da venda a vista (D43) na mesma transacao do evento SALE_CREATED. Aqui ficam:
// normalizadores dos campos novos da venda, calculo financeiro, formatacao do
// numero NNNN/AA, snapshots de identidade e o mapeamento de saida (view).

export const SALE_CONTRACT_TYPES = Object.freeze(['MERCADO_A_VISTA', 'FUTURO']);
export const SALE_CONTRACT_STATUSES = Object.freeze(['EMITIDO', 'FATURADO', 'PAGO', 'WASH_OUT']);

// Decimal(12,2) cabe ate 9.999.999.999,99. Preco/saca e corretagem sao bem
// menores, mas o teto evita estouro silencioso no banco.
const DECIMAL_12_2_MAX = 9999999999.99;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Aceita number ou string ("1234,56" ou "1234.56"); devolve number finito.
function parseDecimalInput(value, fieldName) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new HttpError(422, `${fieldName} must be a finite number`, {
        code: 'VALIDATION_ERROR',
        field: fieldName,
      });
    }
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
    if (normalized === '' || !/^\d+(\.\d+)?$/.test(normalized)) {
      throw new HttpError(422, `${fieldName} must be a valid number`, {
        code: 'VALIDATION_ERROR',
        field: fieldName,
      });
    }
    return Number(normalized);
  }
  throw new HttpError(422, `${fieldName} is required`, {
    code: 'VALIDATION_ERROR',
    field: fieldName,
  });
}

// Preco por saca: obrigatorio, > 0, arredondado a 2 casas (D43).
export function normalizeUnitPrice(value, fieldName = 'unitPrice') {
  const parsed = round2(parseDecimalInput(value, fieldName));
  if (parsed <= 0) {
    throw new HttpError(422, `${fieldName} must be greater than zero`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  if (parsed > DECIMAL_12_2_MAX) {
    throw new HttpError(422, `${fieldName} is too large`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return parsed;
}

// Corretagem em %: opcional (default 0), faixa 0-100, 2 casas (D44 -- so %,
// vendedor e comprador separados).
export function normalizeBrokeragePct(value, fieldName = 'brokeragePct') {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  const parsed = round2(parseDecimalInput(value, fieldName));
  if (parsed < 0 || parsed > 100) {
    throw new HttpError(422, `${fieldName} must be between 0 and 100`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return parsed;
}

// Corretores: array de UUIDs, >= 1, sem repetidos (D34). A existencia/atividade
// dos corretores e checada na transacao (assertBrokersResolved).
export function normalizeBrokerIds(value, fieldName = 'brokerIds') {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(422, `${fieldName} must have at least one broker`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  const seen = new Set();
  for (const raw of value) {
    if (typeof raw !== 'string' || !UUID_REGEX.test(raw.trim())) {
      throw new HttpError(422, `${fieldName} must be a list of broker ids`, {
        code: 'VALIDATION_ERROR',
        field: fieldName,
      });
    }
    seen.add(raw.trim());
  }
  return [...seen];
}

// Confere, dentro da transacao, que todos os corretores pedidos existem e estao
// ativos. `brokers` = linhas {id, name, status} carregadas via tx.
export function assertBrokersResolved(brokers, requestedIds, fieldName = 'brokerIds') {
  const byId = new Map((brokers ?? []).map((broker) => [broker.id, broker]));
  for (const id of requestedIds) {
    const broker = byId.get(id);
    if (!broker) {
      throw new HttpError(422, `${fieldName} contains a broker that does not exist`, {
        code: 'BROKER_NOT_FOUND',
        field: fieldName,
      });
    }
    if (broker.status && broker.status !== 'ACTIVE') {
      throw new HttpError(422, `${fieldName} contains an inactive broker`, {
        code: 'BROKER_INACTIVE',
        field: fieldName,
      });
    }
  }
}

// Financeiro com agio/desagio (D54 — R$ POR SACA): preco efetivo/saca = preco
// +/- agio; total = efetivo x sacas; corretagem_lado = total x (% / 100). Tudo
// arredondado a 2 casas e devolvido como string "0.00" (Decimal-safe).
export function computeContractMoneyWithAgio({
  unitPrice,
  quantitySacks,
  sellerPct,
  buyerPct,
  agioType = null,
  agioValue = null,
}) {
  let effectiveUnit = unitPrice;
  if (agioType === 'AGIO' && agioValue) {
    effectiveUnit = round2(unitPrice + agioValue);
  } else if (agioType === 'DESAGIO' && agioValue) {
    effectiveUnit = round2(unitPrice - agioValue);
  }
  const totalValue = round2(effectiveUnit * quantitySacks);
  const sellerBrokerageValue = round2(totalValue * (sellerPct / 100));
  const buyerBrokerageValue = round2(totalValue * (buyerPct / 100));
  return {
    totalValue: totalValue.toFixed(2),
    sellerBrokerageValue: sellerBrokerageValue.toFixed(2),
    buyerBrokerageValue: buyerBrokerageValue.toFixed(2),
  };
}

// Passo 1 (criacao da venda) — sem agio/desagio; delega a variante com agio.
export function computeContractMoney({ unitPrice, quantitySacks, sellerPct, buyerPct }) {
  return computeContractMoneyWithAgio({ unitPrice, quantitySacks, sellerPct, buyerPct });
}

// Numero do contrato NNNN/AA: NNNN com zero-padding a 4 (cresce alem disso),
// AA = 2 ultimos digitos do ano de emissao/criacao (decisao desta sessao).
export function formatContractNumber(seq, year) {
  const yy = String(year % 100).padStart(2, '0');
  return `${String(seq).padStart(4, '0')}/${yy}`;
}

// Snapshot MINIMO de identidade do vendedor (a partir do ownerClient ja mapeado
// da amostra). Na criacao atomica o emitData sobrescreve com o snapshot completo
// (filial/endereco) e o EMITIDO congela (D25). buyerSnapshot reusa o binding.
export function buildSellerSnapshot(ownerClient) {
  if (!ownerClient) {
    return null;
  }
  return {
    clientId: ownerClient.id ?? null,
    personType: ownerClient.personType ?? null,
    displayName: ownerClient.displayName ?? ownerClient.fullName ?? ownerClient.legalName ?? null,
    fullName: ownerClient.fullName ?? null,
    legalName: ownerClient.legalName ?? null,
    tradeName: ownerClient.tradeName ?? null,
    cpf: ownerClient.cpf ?? null,
    cnpj: ownerClient.cnpj ?? null,
  };
}

// Monta a BASE do contrato à vista (fase 1) -- EXCETO id/contractSeq/
// contractNumber/movementId (dependem da transacao) e EXCETO os campos da
// etapa 2, que vem do `emitData` mesclado em createSaleContractInTx (o contrato
// nasce EMITIDO numa so operacao — D97). Os totais aqui sao SEM agio; o emitData
// os sobrescreve com os totais finais.
export function buildSaleContractDraftFromSale({
  sample,
  buyerBinding,
  unitPrice,
  sellerPct,
  buyerPct,
  quantitySacks,
  contractDate,
}) {
  const money = computeContractMoney({ unitPrice, quantitySacks, sellerPct, buyerPct });
  return {
    type: 'MERCADO_A_VISTA',
    status: 'EMITIDO',
    contractDate: new Date(contractDate),
    sampleId: sample.id,
    sellerClientId: sample.ownerClientId ?? null,
    sellerSnapshot: buildSellerSnapshot(sample.ownerClient),
    buyerClientId: buyerBinding?.buyerClientId ?? null,
    buyerSnapshot: buyerBinding?.buyerClient ?? null,
    quantitySacks,
    unitPrice: unitPrice.toFixed(2),
    totalValue: money.totalValue,
    sellerBrokeragePct: sellerPct.toFixed(2),
    sellerBrokerageValue: money.sellerBrokerageValue,
    buyerBrokeragePct: buyerPct.toFixed(2),
    buyerBrokerageValue: money.buyerBrokerageValue,
    version: 0,
  };
}

function decimalToNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value?.toNumber === 'function') {
    return value.toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Financeiro (D128): select ENXUTO do listBrokerReceivables — so o que o
// buildReceivableView projeta. O SALE_CONTRACT_VIEW_SELECT completo carrega 5
// snapshots JSON por linha que o Financeiro nao usa (a lista cresce sem limite;
// os snapshots dominariam o payload do banco). Revisao do Pagamento (FN3): traz
// UM dos 5 snapshots (buyerSnapshot) so pra derivar o nome do comprador na view
// (o snapshot cru NAO vai no payload de saida) + paidAt (exibir "pago em").
export const RECEIVABLE_VIEW_SELECT = Object.freeze({
  id: true,
  version: true,
  contractSeq: true,
  contractNumber: true,
  contractDate: true,
  paymentDate: true,
  paidAt: true,
  status: true,
  buyerSnapshot: true,
  totalValue: true,
  sellerBrokeragePct: true,
  sellerBrokerageValue: true,
  buyerBrokeragePct: true,
  buyerBrokerageValue: true,
});

// F1 (E24/D138): select ENXUTO do feed de "pagamentos de contrato" do card de
// Eventos — id/version/status (p/ o atalho "Pago"), numero, as 2 datas de pagamento
// e os snapshots das partes (comprador/vendedor, p/ os nomes no acordeao E25).
export const PAYMENT_EVENT_SELECT = Object.freeze({
  id: true,
  version: true,
  status: true,
  contractNumber: true,
  paymentDate: true,
  paidAt: true,
  buyerSnapshot: true,
  sellerSnapshot: true,
});

export const SALE_CONTRACT_VIEW_SELECT = Object.freeze({
  id: true,
  type: true,
  contractSeq: true,
  contractNumber: true,
  status: true,
  washoutReason: true,
  washoutAt: true,
  contractDate: true,
  purchaseNumber: true,
  sampleId: true,
  movementId: true,
  sellerClientId: true,
  sellerUnitId: true,
  sellerSnapshot: true,
  buyerClientId: true,
  buyerUnitId: true,
  buyerSnapshot: true,
  buyerWarehouseClientId: true,
  buyerWarehouseSnapshot: true,
  sellerWarehouseClientId: true,
  sellerWarehouseSnapshot: true,
  sellerBankAccountId: true,
  sellerBankSnapshot: true,
  quantitySacks: true,
  unitPrice: true,
  agioDesagioType: true,
  agioDesagioValue: true,
  totalValue: true,
  weightKg: true,
  sellerBrokeragePct: true,
  sellerBrokerageValue: true,
  buyerBrokeragePct: true,
  buyerBrokerageValue: true,
  paymentCondition: true,
  paymentFormId: true,
  paymentFormText: true,
  modalityId: true,
  modalityText: true,
  packagingId: true,
  packagingText: true,
  invoiceDate: true,
  paymentDate: true,
  invoicedAt: true,
  paidAt: true,
  observations: true,
  description: true,
  requiresApproval: true,
  approvalReminderLeadDays: true,
  // Embarque (EMB21/EMB22): sinal herdado da modalidade + data real do embarque.
  requiresShipment: true,
  shippedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
});

export function toSaleContractView(row) {
  return {
    id: row.id,
    type: row.type,
    contractSeq: row.contractSeq,
    contractNumber: row.contractNumber,
    status: row.status,
    washoutReason: row.washoutReason ?? null,
    washoutAt: toIsoString(row.washoutAt),
    contractDate: toIsoString(row.contractDate),
    purchaseNumber: row.purchaseNumber ?? null,
    sampleId: row.sampleId ?? null,
    movementId: row.movementId ?? null,
    sellerClientId: row.sellerClientId ?? null,
    sellerUnitId: row.sellerUnitId ?? null,
    sellerSnapshot: row.sellerSnapshot ?? null,
    buyerClientId: row.buyerClientId ?? null,
    buyerUnitId: row.buyerUnitId ?? null,
    buyerSnapshot: row.buyerSnapshot ?? null,
    buyerWarehouseClientId: row.buyerWarehouseClientId ?? null,
    buyerWarehouseSnapshot: row.buyerWarehouseSnapshot ?? null,
    sellerWarehouseClientId: row.sellerWarehouseClientId ?? null,
    sellerWarehouseSnapshot: row.sellerWarehouseSnapshot ?? null,
    sellerBankAccountId: row.sellerBankAccountId ?? null,
    sellerBankSnapshot: row.sellerBankSnapshot ?? null,
    quantitySacks: row.quantitySacks,
    unitPrice: decimalToNumber(row.unitPrice),
    agioDesagioType: row.agioDesagioType ?? null,
    agioDesagioValue: decimalToNumber(row.agioDesagioValue),
    totalValue: decimalToNumber(row.totalValue),
    weightKg: decimalToNumber(row.weightKg),
    sellerBrokeragePct: decimalToNumber(row.sellerBrokeragePct),
    sellerBrokerageValue: decimalToNumber(row.sellerBrokerageValue),
    buyerBrokeragePct: decimalToNumber(row.buyerBrokeragePct),
    buyerBrokerageValue: decimalToNumber(row.buyerBrokerageValue),
    paymentCondition: row.paymentCondition ?? null,
    paymentFormId: row.paymentFormId ?? null,
    paymentFormText: row.paymentFormText ?? null,
    modalityId: row.modalityId ?? null,
    modalityText: row.modalityText ?? null,
    packagingId: row.packagingId ?? null,
    packagingText: row.packagingText ?? null,
    invoiceDate: toIsoString(row.invoiceDate),
    paymentDate: toIsoString(row.paymentDate),
    invoicedAt: toIsoString(row.invoicedAt),
    paidAt: toIsoString(row.paidAt),
    observations: row.observations ?? null,
    description: row.description ?? null,
    requiresApproval: row.requiresApproval,
    approvalReminderLeadDays: row.approvalReminderLeadDays ?? null,
    requiresShipment: row.requiresShipment,
    shippedAt: toIsoString(row.shippedAt),
    version: row.version,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

export function toSaleContractBrokerView(row) {
  return {
    id: row.id,
    brokerId: row.brokerId,
    brokerNameSnapshot: row.brokerNameSnapshot,
  };
}

// ============================================================
// Embarque (EMB25/EMB27) — fotos da confirmacao + contexto
// ============================================================

// A view NAO expoe storagePath/checksum (internos); o download e por rota-proxy
// autenticada via id (molde do anexo de cliente).
export const SHIPMENT_PHOTO_VIEW_SELECT = Object.freeze({
  id: true,
  saleContractId: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
});

export function toShipmentPhotoView(photo) {
  return {
    id: photo.id,
    contractId: photo.saleContractId,
    fileName: photo.fileName ?? null,
    mimeType: photo.mimeType ?? null,
    sizeBytes: photo.sizeBytes ?? null,
    createdAt: toIsoString(photo.createdAt),
  };
}

// Colunas do resumo do embarque (modal de confirmacao + secao "Embarque" do
// Detalhes). So dado NAO-sensivel (EMB25): sem preco/corretagem.
export const SHIPMENT_CONTEXT_SELECT = Object.freeze({
  id: true,
  contractNumber: true,
  status: true,
  quantitySacks: true,
  invoiceDate: true,
  requiresShipment: true,
  shippedAt: true,
  buyerSnapshot: true,
  sellerWarehouseSnapshot: true,
});

export function buildShipmentContext(row) {
  return {
    contractId: row.id,
    contractNumber: row.contractNumber,
    status: row.status,
    quantitySacks: row.quantitySacks,
    invoiceDate: toIsoString(row.invoiceDate),
    requiresShipment: row.requiresShipment,
    shippedAt: toIsoString(row.shippedAt),
    buyerName: row.buyerSnapshot?.displayName ?? null,
    sellerWarehouse: row.sellerWarehouseSnapshot?.displayName ?? null,
  };
}

// ------------------------------------------------------------
// Worklist do Embarque (EMB23-EMB25) — a "casa" na sub-aba
// ------------------------------------------------------------

// Select ENXUTO da worklist (so nao-sensivel — EMB25): sem preco/corretagem. Traz
// contractSeq (tiebreak do cursor) + os 2 snapshots (nome do comprador + armazem).
export const SHIPMENT_VIEW_SELECT = Object.freeze({
  id: true,
  contractSeq: true,
  contractNumber: true,
  status: true,
  invoiceDate: true,
  shippedAt: true,
  quantitySacks: true,
  buyerSnapshot: true,
  sellerWarehouseSnapshot: true,
});

// Estado derivado (sem enum, EMB23): cancelado (WASH_OUT) · embarcado (shippedAt) ·
// atrasado (nao embarcado + invoiceDate < hoje BRT) · a_embarcar (senao). O atraso
// so acende a partir do dia SEGUINTE a invoiceDate (o proprio dia ainda e a_embarcar).
export function deriveShipmentState(status, invoiceDate, shippedAt, todayKey) {
  if (status === 'WASH_OUT') return 'cancelado';
  if (shippedAt) return 'embarcado';
  const iso = toIsoString(invoiceDate);
  const dayKey = iso ? iso.slice(0, 10) : null;
  if (dayKey && todayKey && dayKey < todayKey) return 'atrasado';
  return 'a_embarcar';
}

// Linha da worklist (EMB25): chip · nº · comprador · data · sacas · armazem do
// vendedor. So dado NAO-sensivel (a aba e visivel a todos os nao-PROSPECTOR).
export function buildShipmentView(row, todayKey) {
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    state: deriveShipmentState(row.status, row.invoiceDate, row.shippedAt, todayKey),
    status: row.status,
    buyerName: row.buyerSnapshot?.displayName ?? null,
    sellerWarehouse: row.sellerWarehouseSnapshot?.displayName ?? null,
    quantitySacks: row.quantitySacks,
    invoiceDate: toIsoString(row.invoiceDate),
    shippedAt: toIsoString(row.shippedAt),
  };
}

// Filtros da worklist (EMB25). Default 'todos'.
export const SHIPMENT_FILTERS = Object.freeze([
  'todos',
  'a_embarcar',
  'atrasado',
  'embarcado',
  'cancelado',
]);

export function normalizeShipmentFilter(raw) {
  return typeof raw === 'string' && SHIPMENT_FILTERS.includes(raw) ? raw : 'todos';
}

// Cursor keyset opaco da worklist. {g, key, seq}: g = grupo (0 nao-embarcado /
// 1 embarcado / 2 cancelado); key = 'YYYY-MM-DD'|null (invoiceDate em G0 / shippedAt
// em G1; null em G2); seq = contractSeq (tiebreak unico). base64url.
export function encodeShipmentCursor(cursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeShipmentCursor(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const okKey =
      p?.key === null || (typeof p?.key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.key));
    if (p && Number.isInteger(p.g) && p.g >= 0 && p.g <= 2 && Number.isInteger(p.seq) && okKey) {
      return { g: p.g, key: p.key, seq: p.seq };
    }
  } catch {
    // cursor malformado -> trata como 1a pagina
  }
  return null;
}

// Fragmento Prisma "estritamente DEPOIS do cursor, DENTRO do grupo cursor.g".
// G0 (nao-embarcado), ordem (invoiceDate asc nulls-last, contractSeq asc). G1
// (embarcado), ordem (shippedAt desc, contractSeq desc). G2 (cancelado), seq desc.
export function shipmentKeysetWhere(cursor) {
  if (cursor.g === 0) {
    const seqGt = { contractSeq: { gt: cursor.seq } };
    if (cursor.key === null) {
      return { AND: [{ invoiceDate: null }, seqGt] };
    }
    const d = new Date(`${cursor.key}T00:00:00.000Z`);
    return {
      OR: [{ invoiceDate: { gt: d } }, { invoiceDate: null }, { AND: [{ invoiceDate: d }, seqGt] }],
    };
  }
  if (cursor.g === 1) {
    const d = new Date(`${cursor.key}T00:00:00.000Z`);
    return {
      OR: [
        { shippedAt: { lt: d } },
        { AND: [{ shippedAt: d }, { contractSeq: { lt: cursor.seq } }] },
      ],
    };
  }
  return { contractSeq: { lt: cursor.seq } };
}

// Revisao do Pagamento (FN1): estado de pagamento derivado (sem enum) — a LENTE do
// Financeiro. Chip: cancelado (WASH_OUT) · pago (PAGO) · vencido (nao pago +
// paymentDate < hoje BRT) · a_vencer (nao pago, no prazo ou SEM data). `paymentDate`
// = Date @db.Date (ou null); `todayKey` = 'YYYY-MM-DD' BRT (brtTodayKey). Sem data
// nunca vira vencido. String-compare de 2 'YYYY-MM-DD' == compare cronologico.
export function deriveReceivablePaymentState(status, paymentDate, todayKey) {
  if (status === 'WASH_OUT') return 'cancelado';
  if (status === 'PAGO') return 'pago';
  const iso = toIsoString(paymentDate);
  const dayKey = iso ? iso.slice(0, 10) : null;
  if (dayKey && todayKey && dayKey < todayKey) return 'vencido';
  return 'a_vencer';
}

// Financeiro (Fase F): projecao de "corretagem a receber" de UM contrato. Soma a
// corretagem das 2 pontas (commissionTotal). Os corretores sao ATRIBUICAO/metrica
// (D34): lista de nomes, SEM valor por corretor — o sistema NAO divide a corretagem
// entre eles (D136 removeu o rateio ÷N das D79/D129, uma divisao igual ficticia que
// arriscava os registros; a divisao real, quando ha, e externa). `row` = projecao
// RECEIVABLE_VIEW_SELECT; `brokerRows` = os SaleContractBroker (brokerId/nome).
// Revisao do Pagamento (FN1/FN3): + buyerName (do buyerSnapshot), paidAt e
// paymentState (derivado com o dia BRT injetado, fonte unica de "hoje").
export function buildReceivableView(row, brokerRows, todayKey) {
  const sellerValue = decimalToNumber(row.sellerBrokerageValue) ?? 0;
  const buyerValue = decimalToNumber(row.buyerBrokerageValue) ?? 0;
  const commissionTotal = round2(sellerValue + buyerValue);

  return {
    id: row.id,
    version: row.version,
    contractNumber: row.contractNumber,
    contractDate: toIsoString(row.contractDate),
    paymentDate: toIsoString(row.paymentDate),
    paidAt: toIsoString(row.paidAt),
    status: row.status,
    paymentState: deriveReceivablePaymentState(row.status, row.paymentDate, todayKey),
    buyerName: row.buyerSnapshot?.displayName ?? null,
    totalValue: decimalToNumber(row.totalValue),
    commissionTotal,
    sellerBrokeragePct: decimalToNumber(row.sellerBrokeragePct),
    sellerBrokerageValue: sellerValue,
    buyerBrokeragePct: decimalToNumber(row.buyerBrokeragePct),
    buyerBrokerageValue: buyerValue,
    brokers: brokerRows.map((b) => ({
      brokerId: b.brokerId,
      name: b.brokerNameSnapshot,
    })),
  };
}

// Revisao do Pagamento (FN4/FN5): filtro do Financeiro. Default 'todos'.
export const RECEIVABLE_FILTERS = Object.freeze([
  'todos',
  'a_vencer',
  'vencido',
  'pago',
  'cancelado',
]);

export function normalizeReceivableFilter(raw) {
  return typeof raw === 'string' && RECEIVABLE_FILTERS.includes(raw) ? raw : 'todos';
}

// Revisao do Pagamento (FN4): cursor keyset opaco do Financeiro. {g, pd, seq}:
// g = grupo (0 nao-pago / 1 pago / 2 cancelado); pd = 'YYYY-MM-DD'|null (so importa
// em G0, ordenado por paymentDate asc nulls-last); seq = contractSeq (tiebreak unico
// e monotonico). base64url pra viajar como string opaca na querystring.
export function encodeReceivableCursor(cursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeReceivableCursor(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const okPd = p?.pd === null || (typeof p?.pd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.pd));
    if (p && Number.isInteger(p.g) && p.g >= 0 && p.g <= 2 && Number.isInteger(p.seq) && okPd) {
      return { g: p.g, pd: p.pd, seq: p.seq };
    }
  } catch {
    // cursor malformado -> trata como 1a pagina
  }
  return null;
}

// Fragmento Prisma "estritamente DEPOIS do cursor, DENTRO do grupo cursor.g".
// G0 (nao-pago), ordem (paymentDate asc nulls-last, contractSeq asc): avanca pela
// data e, na cauda dos nulos, so por seq. G1/G2 (arquivo), ordem contractSeq desc:
// "depois" = seq menor.
export function receivableKeysetWhere(cursor) {
  if (cursor.g === 0) {
    const seqGt = { contractSeq: { gt: cursor.seq } };
    if (cursor.pd === null) {
      return { AND: [{ paymentDate: null }, seqGt] };
    }
    const pdDate = new Date(`${cursor.pd}T00:00:00.000Z`);
    return {
      OR: [
        { paymentDate: { gt: pdDate } },
        { paymentDate: null },
        { AND: [{ paymentDate: pdDate }, seqGt] },
      ],
    };
  }
  return { contractSeq: { lt: cursor.seq } };
}

// "Hoje" no fuso BRT (America/Sao_Paulo — sem DST desde 2019, offset fixo −3h),
// ancorado como Date meia-noite-UTC do dia-CALENDARIO BRT. As datas do contrato sao
// @db.Date (meia-noite UTC); comparar contra este ancora mantem o corte de
// "vencido"/"pago no futuro" alinhado ao dia BRT, sem off-by-one entre 21h–24h BRT
// (quando o UTC ja virou o dia seguinte). Molde do getBrtToday do
// lib/dashboard-calendar.ts (frontend), que o backend nao importa. `now` injetavel
// (teste). Reusado pelo feed de pagamento, pelo Financeiro e pelo guard do "Pagar".
export function brtTodayDateOnly(now = new Date()) {
  const brt = new Date(now.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()));
}

export function brtTodayKey(now = new Date()) {
  return brtTodayDateOnly(now).toISOString().slice(0, 10);
}

// F1 (E21-E27/D138): projeta 1 contrato num evento de pagamento do card de Eventos.
// kind 'due' = agendado (no paymentDate); 'paid' = realizado (no paidAt). O dayKey
// vem da data @db.Date via `.slice(0,10)` (sem conversao de fuso — casa com o
// toDayKey/BRT do dashboard-calendar). `label` = o rotulo recolhido "nº · comprador".
// E29 (Revisao do Pagamento): um agendado cujo dia ja passou (dayKey < todayKey, dia
// BRT) vira "atrasado" (dot vermelho) a partir do dia SEGUINTE ao vencimento (vence-
// hoje ainda e 'due'); o realizado nunca fica atrasado. `todayKey` opcional: sem ele,
// nao classifica atraso (mantem 'due') — retrocompat com chamadas antigas.
export function buildPaymentEvent(row, kind, todayKey) {
  const iso = toIsoString(kind === 'paid' ? row.paidAt : row.paymentDate);
  const dayKey = iso ? iso.slice(0, 10) : null;
  const buyerName = row.buyerSnapshot?.displayName ?? null;
  const sellerName = row.sellerSnapshot?.displayName ?? null;
  let typeKey;
  if (kind === 'paid') {
    typeKey = 'contract_payment_paid';
  } else if (todayKey && dayKey && dayKey < todayKey) {
    typeKey = 'contract_payment_overdue';
  } else {
    typeKey = 'contract_payment_due';
  }
  return {
    dayKey,
    event: {
      id: row.id,
      contractId: row.id,
      typeKey,
      label: buyerName ? `${row.contractNumber} · ${buyerName}` : row.contractNumber,
      contractNumber: row.contractNumber,
      buyerName,
      sellerName,
      status: row.status,
      version: row.version,
    },
  };
}

// Agrupa os eventos de pagamento por dayKey ('YYYY-MM-DD') -> Record<dayKey,
// evento[]> (o formato que a prop `events` do EventsCalendarCard consome). Linhas
// sem data valida sao descartadas (defensivo — no filtro as datas sao NOT NULL).
export function bucketPaymentEvents(dueRows, paidRows, todayKey) {
  const byDay = {};
  const add = (rows, kind) => {
    for (const row of rows) {
      const { dayKey, event } = buildPaymentEvent(row, kind, todayKey);
      if (!dayKey) continue;
      if (byDay[dayKey]) byDay[dayKey].push(event);
      else byDay[dayKey] = [event];
    }
  };
  add(dueRows, 'due');
  add(paidRows, 'paid');
  return byDay;
}

// ------------------------------------------------------------
// Evento de Embarque no dashboard (EMB10/EMB17/EMB24) — companheiro
// ------------------------------------------------------------

export const SHIPMENT_EVENT_SELECT = Object.freeze({
  id: true,
  contractNumber: true,
  status: true,
  invoiceDate: true,
  shippedAt: true,
  buyerSnapshot: true,
});

// Projeta 1 contrato num evento de embarque do calendario (1→1, molde do pagamento).
// kind 'scheduled' -> dia previsto = invoiceDate; typeKey contract_shipment (azul) ou
// contract_shipment_overdue (vermelho) se o dia ja passou (dayKey < todayKey, EMB24).
// kind 'done' -> dia real = shippedAt; typeKey contract_shipment_done (azul-escuro,
// EMB17). label recolhido = "embarque · nº · comprador" (EMB11/EMB26). id NAMESPACED
// ('shipment:') pra nao colidir com pagamento/aprovacao do mesmo dia (card usa key=id).
export function buildShipmentEvent(row, kind, todayKey) {
  const iso = toIsoString(kind === 'done' ? row.shippedAt : row.invoiceDate);
  const dayKey = iso ? iso.slice(0, 10) : null;
  const buyerName = row.buyerSnapshot?.displayName ?? null;
  let typeKey;
  if (kind === 'done') {
    typeKey = 'contract_shipment_done';
  } else if (todayKey && dayKey && dayKey < todayKey) {
    typeKey = 'contract_shipment_overdue';
  } else {
    typeKey = 'contract_shipment';
  }
  const label = buyerName
    ? `embarque · ${row.contractNumber} · ${buyerName}`
    : `embarque · ${row.contractNumber}`;
  return {
    dayKey,
    event: {
      id: `shipment:${row.id}`,
      contractId: row.id,
      typeKey,
      label,
      contractNumber: row.contractNumber,
      buyerName,
      status: row.status,
    },
  };
}

// Agrupa por dayKey -> Record<dayKey, evento[]> (1→1, molde do bucketPaymentEvents).
export function bucketShipmentEvents(scheduledRows, doneRows, todayKey) {
  const byDay = {};
  const add = (rows, kind) => {
    for (const row of rows) {
      const { dayKey, event } = buildShipmentEvent(row, kind, todayKey);
      if (!dayKey) continue;
      if (byDay[dayKey]) byDay[dayKey].push(event);
      else byDay[dayKey] = [event];
    }
  };
  add(scheduledRows, 'scheduled');
  add(doneRows, 'done');
  return byDay;
}

// F2 (reforma AP6/AP14): select do feed do "lembrete de aprovacao" — pendentes que
// precisam de aprovacao (requiresApproval + EMITIDO, sem etiqueta). Alem dos nomes das
// partes (acordeao), carrega invoiceDate + o lead pra calcular o inicio do lembrete.
export const APPROVAL_REMINDER_SELECT = Object.freeze({
  id: true,
  contractNumber: true,
  invoiceDate: true,
  approvalReminderLeadDays: true,
  buyerSnapshot: true,
  sellerSnapshot: true,
});

// Aritmetica de dia em UTC (date-only, sem DST) — espelho do addDays do
// lib/dashboard-calendar.ts (frontend), que o backend nao tem. Usado no fan-out.
function addDaysUtc(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function dayKeyFromDate(date) {
  return date.toISOString().slice(0, 10);
}

// F2 (AP6/AP7/AP15): projeta 1 contrato pendente num evento de "lembrete de aprovacao".
// id NAMESPACED ('reminder:'+contractId) pra NAO colidir com o contract_payment_due do
// MESMO contrato/dia (o card usa key={event.id}). label recolhido = "a enviar · nº ·
// comprador" (AP15). contractId separado alimenta "Gerar aprovacao" / "Ver contrato".
export function buildApprovalReminderEvent(row) {
  const buyerName = row.buyerSnapshot?.displayName ?? null;
  const sellerName = row.sellerSnapshot?.displayName ?? null;
  const label = buyerName
    ? `a enviar · ${row.contractNumber} · ${buyerName}`
    : `a enviar · ${row.contractNumber}`;
  return {
    id: `reminder:${row.id}`,
    contractId: row.id,
    typeKey: 'contract_approval_due',
    label,
    contractNumber: row.contractNumber,
    buyerName,
    sellerName,
    status: 'EMITIDO',
  };
}

// F2 (AP6): fan-out 1→N (o bucketPaymentEvents e 1→1, nao serve). O lembrete aparece em
// CADA dia de [max(from, hoje, invoiceDate−lead), to] — "so de hoje pra frente" (nao
// pinta passado; navegar pra tras nao mostra nada) + so a partir de invoiceDate−lead.
// dayKeys 'YYYY-MM-DD' comparam como string (= cronologico). Retorna Record<dayKey, ev[]>.
export function bucketApprovalReminders(rows, { fromKey, toKey, todayKey }) {
  const byDay = {};
  const lowerFloor = fromKey > todayKey ? fromKey : todayKey; // max(from, hoje)
  for (const row of rows) {
    if (!row.invoiceDate) continue;
    const lead = row.approvalReminderLeadDays ?? 0;
    const reminderStartKey = dayKeyFromDate(addDaysUtc(new Date(row.invoiceDate), -lead));
    const lowerKey = lowerFloor > reminderStartKey ? lowerFloor : reminderStartKey;
    if (lowerKey > toKey) continue; // lembrete comeca depois da janela visivel / no passado
    const event = buildApprovalReminderEvent(row);
    let cursor = new Date(`${lowerKey}T00:00:00.000Z`);
    const end = new Date(`${toKey}T00:00:00.000Z`);
    while (cursor.getTime() <= end.getTime()) {
      const key = dayKeyFromDate(cursor);
      if (byDay[key]) byDay[key].push(event);
      else byDay[key] = [event];
      cursor = addDaysUtc(cursor, 1);
    }
  }
  return byDay;
}

// AP16: projeta 1 linha do approval_label_log num item do feed "Ultimos envios" do
// dashboard (kind 'APPROVAL'). id NAMESPACED ('approval:'+id) pra nao colidir com os
// event_id dos envios de amostra. Campos de amostra nulos (aprovacao nao tem lote);
// nº + comprador vem do contrato (join manual pelo saleContractId).
export function buildRecentApprovalSendItem(log, contract) {
  return {
    id: `approval:${log.id}`,
    sampleId: null,
    internalLotNumber: null,
    isBlend: false,
    kind: 'APPROVAL',
    recipient: null,
    cancelled: false,
    at: toIsoString(log.createdAt),
    contractNumber: contract?.contractNumber ?? null,
    buyer: contract?.buyerSnapshot?.displayName ?? null,
  };
}

// ===========================================================================
// Etapa 2 (Fase B.2 Passo 2): validacao dos campos da "Gerar documento" +
// snapshots das partes/banco/armazens. A RESOLUCAO no banco (entidades existem,
// filial pertence ao cliente, banco pertence ao vendedor, PF exige filial) fica
// no service (precisa de prisma). Aqui so o que e puro.
// ===========================================================================

const DECIMAL_10_2_MAX = 99999999.99;

function requireUuid(value, fieldName) {
  if (typeof value !== 'string' || !UUID_REGEX.test(value.trim())) {
    throw new HttpError(422, `${fieldName} is required`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return value.trim();
}

function optionalUuid(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return requireUuid(value, fieldName);
}

// Valida e devolve a STRING YYYY-MM-DD (sem converter pra Date). Util quando a
// mesma data alimenta uma coluna @db.Date (new Date) e o sync do movimento
// (normalizeMovementDate, que quer a string).
function requireDateString(value, fieldName) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new HttpError(422, `${fieldName} must be a date (YYYY-MM-DD)`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return value.trim();
}

function requireDate(value, fieldName) {
  return new Date(requireDateString(value, fieldName));
}

// Sacas do contrato (Int > 0). O saldo do lote (não exceder o disponível) é
// garantido pelo updateSampleMovement ao sincronizar a venda.
function normalizeSacks(value, fieldName = 'quantitySacks') {
  if (!Number.isInteger(value) || value <= 0) {
    throw new HttpError(422, `${fieldName} must be a positive integer`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  if (value > 100_000_000) {
    throw new HttpError(422, `${fieldName} is too large`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return value;
}

// Sinal de aprovacao (reforma AP1/AP3): obrigatorio escolher na criacao/edicao.
function normalizeRequiredBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new HttpError(422, `${fieldName} must be a boolean`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return value;
}

// Lembrete de aprovacao (AP6): so vale quando requiresApproval. Inteiro de 1 a 365
// dias (default 30 quando ausente). Quando nao precisa, ignora o valor e grava null.
const APPROVAL_REMINDER_LEAD_DAYS_DEFAULT = 30;
const APPROVAL_REMINDER_LEAD_DAYS_MIN = 1;
const APPROVAL_REMINDER_LEAD_DAYS_MAX = 365;

function normalizeApprovalReminderLeadDays(
  value,
  requiresApproval,
  fieldName = 'approvalReminderLeadDays'
) {
  if (!requiresApproval) {
    return null;
  }
  if (value === undefined || value === null) {
    return APPROVAL_REMINDER_LEAD_DAYS_DEFAULT;
  }
  if (
    !Number.isInteger(value) ||
    value < APPROVAL_REMINDER_LEAD_DAYS_MIN ||
    value > APPROVAL_REMINDER_LEAD_DAYS_MAX
  ) {
    throw new HttpError(
      422,
      `${fieldName} must be an integer between ${APPROVAL_REMINDER_LEAD_DAYS_MIN} and ${APPROVAL_REMINDER_LEAD_DAYS_MAX}`,
      { code: 'VALIDATION_ERROR', field: fieldName }
    );
  }
  return value;
}

// Data REAL do marco (faturamento/pagamento) escolhida no dialogo. Obrigatoria;
// mesmo formato YYYY-MM-DD das demais datas do contrato (@db.Date).
export function normalizeActionDate(value, fieldName = 'date') {
  return requireDate(value, fieldName);
}

// Motivo da quebra manual (P17). Obrigatorio; espelha o limite do reasonText do
// cancelamento da venda (normalizeRequiredText(..., 500)) ao qual ele e repassado.
export function normalizeWashoutReason(value, fieldName = 'reason') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(422, `${fieldName} is required`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  const trimmed = value.trim();
  if (trimmed.length > 500) {
    throw new HttpError(422, `${fieldName} must have at most 500 characters`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return trimmed;
}

function optionalText(value, fieldName, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new HttpError(422, `${fieldName} must be a string`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (maxLength && trimmed.length > maxLength) {
    throw new HttpError(422, `${fieldName} must have at most ${maxLength} characters`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return trimmed;
}

function optionalWeight(value, fieldName = 'weightKg') {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = round2(parseDecimalInput(value, fieldName));
  if (parsed < 0 || parsed > DECIMAL_10_2_MAX) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return parsed;
}

// Agio/desagio (par opcional): se vier o tipo, o valor e obrigatorio (> 0, R$
// por saca). Sem tipo => sem ajuste. (A UX "botoes no card" e da B.3 — P21.)
function normalizeAgio(input, fieldName = 'agioDesagio') {
  const rawType = input?.agioDesagioType;
  if (rawType === undefined || rawType === null || rawType === '') {
    return { agioDesagioType: null, agioDesagioValue: null };
  }
  const type = String(rawType).trim().toUpperCase();
  if (type !== 'AGIO' && type !== 'DESAGIO') {
    throw new HttpError(422, `${fieldName}Type must be AGIO or DESAGIO`, {
      code: 'VALIDATION_ERROR',
      field: `${fieldName}Type`,
    });
  }
  const value = round2(parseDecimalInput(input?.agioDesagioValue, `${fieldName}Value`));
  if (value <= 0) {
    throw new HttpError(422, `${fieldName}Value must be greater than zero`, {
      code: 'VALIDATION_ERROR',
      field: `${fieldName}Value`,
    });
  }
  return { agioDesagioType: type, agioDesagioValue: value };
}

// Como normalizeAgio, mas EXIGE o par (tipo + valor > 0). Usado na aplicacao de
// agio/desagio pos-EMITIDO pelos botoes do card (D87): "nenhum" nao faz
// sentido — o usuario escolheu Agio ou Desagio. Reaplicar substitui (D88).
export function normalizeRequiredAgio(input, fieldName = 'agioDesagio') {
  const normalized = normalizeAgio(input, fieldName);
  if (normalized.agioDesagioType === null) {
    throw new HttpError(422, `${fieldName}Type is required`, {
      code: 'VALIDATION_ERROR',
      field: `${fieldName}Type`,
    });
  }
  return normalized;
}

// Listas cadastraveis do contrato (Forma/Modalidade/Embalagem, D20/D53). Mapeia a
// chave logica -> nome do modelo Prisma. Usado pelo "+ Adicionar" inline (D91).
export const CONTRACT_LOOKUP_LISTS = {
  paymentForm: 'contractPaymentForm',
  modality: 'contractModality',
  packaging: 'contractPackaging',
};

const CONTRACT_LOOKUP_NAME_MAX = 120;

// Valida o input do "+ Adicionar" inline: list ∈ chaves + name nao-vazio (trim,
// <= 120). Unicidade fica no UNIQUE do banco (-> 409 no service).
export function normalizeContractLookupInput(input) {
  const list = input?.list;
  if (
    typeof list !== 'string' ||
    !Object.prototype.hasOwnProperty.call(CONTRACT_LOOKUP_LISTS, list)
  ) {
    throw new HttpError(422, 'list must be paymentForm, modality or packaging', {
      code: 'VALIDATION_ERROR',
      field: 'list',
    });
  }
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (name === '') {
    throw new HttpError(422, 'name is required', { code: 'VALIDATION_ERROR', field: 'name' });
  }
  if (name.length > CONTRACT_LOOKUP_NAME_MAX) {
    throw new HttpError(422, `name must be at most ${CONTRACT_LOOKUP_NAME_MAX} characters`, {
      code: 'VALIDATION_ERROR',
      field: 'name',
    });
  }
  return { list, name };
}

// Fase 1 (venda) editavel no "Editar" do contrato emitido. OPCIONAL: presente so
// quando o usuario edita os campos da venda; ausente no wizard create->emit (o
// create ja os fixou). Quando vem, TODOS os campos sao exigidos (o form preenche
// todos). brokerIds e resolvido no service (assertBrokersResolved). O comprador
// NAO entra aqui — ele ja e editavel via buyerClientId/buyerUnitId da etapa 2.
function normalizeSaleFields(raw) {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'object') {
    throw new HttpError(422, 'saleFields must be an object', {
      code: 'VALIDATION_ERROR',
      field: 'saleFields',
    });
  }
  return {
    quantitySacks: normalizeSacks(raw.quantitySacks, 'saleFields.quantitySacks'),
    unitPrice: normalizeUnitPrice(raw.unitPrice, 'saleFields.unitPrice'),
    sellerBrokeragePct: normalizeBrokeragePct(
      raw.sellerBrokeragePct,
      'saleFields.sellerBrokeragePct'
    ),
    buyerBrokeragePct: normalizeBrokeragePct(raw.buyerBrokeragePct, 'saleFields.buyerBrokeragePct'),
    contractDate: requireDateString(raw.contractDate, 'saleFields.contractDate'),
    brokerIds: normalizeBrokerIds(raw.brokerIds, 'saleFields.brokerIds'),
  };
}

export function normalizeEtapa2Input(input) {
  const agio = normalizeAgio(input ?? {});
  const requiresApproval = normalizeRequiredBoolean(input?.requiresApproval, 'requiresApproval');
  return {
    // fase 1 (venda) editavel — null quando nao se esta editando a venda
    saleFields: normalizeSaleFields(input?.saleFields),
    // partes / banco / armazens (ids; resolucao + ownership no service)
    sellerClientId: optionalUuid(input?.sellerClientId, 'sellerClientId'),
    buyerClientId: optionalUuid(input?.buyerClientId, 'buyerClientId'),
    sellerUnitId: optionalUuid(input?.sellerUnitId, 'sellerUnitId'),
    buyerUnitId: optionalUuid(input?.buyerUnitId, 'buyerUnitId'),
    sellerBankAccountId: requireUuid(input?.sellerBankAccountId, 'sellerBankAccountId'),
    buyerWarehouseClientId: optionalUuid(input?.buyerWarehouseClientId, 'buyerWarehouseClientId'),
    sellerWarehouseClientId: optionalUuid(
      input?.sellerWarehouseClientId,
      'sellerWarehouseClientId'
    ),
    // listas (obrigatorias)
    paymentFormId: requireUuid(input?.paymentFormId, 'paymentFormId'),
    modalityId: requireUuid(input?.modalityId, 'modalityId'),
    packagingId: requireUuid(input?.packagingId, 'packagingId'),
    // datas (obrigatorias)
    invoiceDate: requireDate(input?.invoiceDate, 'invoiceDate'),
    paymentDate: requireDate(input?.paymentDate, 'paymentDate'),
    // opcionais
    purchaseNumber: optionalText(input?.purchaseNumber, 'purchaseNumber', 120),
    paymentCondition: optionalText(input?.paymentCondition, 'paymentCondition', 2000),
    observations: optionalText(input?.observations, 'observations', 5000),
    description: optionalText(input?.description, 'description', 5000),
    weightKg: optionalWeight(input?.weightKg),
    agioDesagioType: agio.agioDesagioType,
    agioDesagioValue: agio.agioDesagioValue,
    // Aprovacao (reforma AP1/AP6): sinal obrigatorio + lembrete (null quando "Nao").
    requiresApproval,
    approvalReminderLeadDays: normalizeApprovalReminderLeadDays(
      input?.approvalReminderLeadDays,
      requiresApproval
    ),
  };
}

// Fase 1 da CRIACAO do contrato FUTURO (sem lote): termos comerciais +
// comprador. O VENDEDOR nao entra aqui — vem no emit (junto do banco, filiais,
// etc.), como no a vista. Mesmos normalizadores da venda a vista; sacas LIVRES
// (so > 0, sem saldo de lote nem trava de liga).
export function normalizeFutureSaleContractInput(input) {
  return {
    buyerClientId: requireUuid(input?.buyerClientId, 'buyerClientId'),
    quantitySacks: normalizeSacks(input?.quantitySacks, 'quantitySacks'),
    unitPrice: normalizeUnitPrice(input?.unitPrice, 'unitPrice'),
    sellerBrokeragePct: normalizeBrokeragePct(input?.sellerBrokeragePct, 'sellerBrokeragePct'),
    buyerBrokeragePct: normalizeBrokeragePct(input?.buyerBrokeragePct, 'buyerBrokeragePct'),
    contractDate: requireDateString(input?.contractDate, 'contractDate'),
    brokerIds: normalizeBrokerIds(input?.brokerIds, 'brokerIds'),
  };
}

export function clientDisplayName(client) {
  if (!client) {
    return null;
  }
  return client.personType === 'PF'
    ? (client.fullName ?? null)
    : (client.legalName ?? client.tradeName ?? null);
}

export function buildUnitSnapshot(unit) {
  if (!unit) {
    return null;
  }
  return {
    unitId: unit.id,
    name: unit.name ?? null,
    cnpj: unit.cnpj ?? null,
    legalName: unit.legalName ?? null,
    tradeName: unit.tradeName ?? null,
    registrationNumber: unit.registrationNumber ?? null,
    addressLine: unit.addressLine ?? null,
    district: unit.district ?? null,
    city: unit.city ?? null,
    state: unit.state ?? null,
    postalCode: unit.postalCode ?? null,
    complement: unit.complement ?? null,
  };
}

// Snapshot de uma PARTE (vendedor/comprador) a partir do registro RAW do
// cliente + filial opcional. Etapa 2 grava isto e o EMITIDO congela (D25).
export function buildPartySnapshot(client, unit = null) {
  if (!client) {
    return null;
  }
  return {
    clientId: client.id,
    code: client.code ?? null,
    personType: client.personType ?? null,
    displayName: clientDisplayName(client),
    fullName: client.fullName ?? null,
    legalName: client.legalName ?? null,
    tradeName: client.tradeName ?? null,
    cpf: client.cpf ?? null,
    cnpj: client.cnpj ?? null,
    registrationNumber: client.registrationNumber ?? null,
    addressLine: client.addressLine ?? null,
    district: client.district ?? null,
    city: client.city ?? null,
    state: client.state ?? null,
    postalCode: client.postalCode ?? null,
    complement: client.complement ?? null,
    unit: buildUnitSnapshot(unit),
  };
}

export function buildWarehouseSnapshot(client) {
  if (!client) {
    return null;
  }
  return {
    clientId: client.id,
    code: client.code ?? null,
    personType: client.personType ?? null,
    displayName: clientDisplayName(client),
    cpf: client.cpf ?? null,
    cnpj: client.cnpj ?? null,
    registrationNumber: client.registrationNumber ?? null,
    addressLine: client.addressLine ?? null,
    district: client.district ?? null,
    city: client.city ?? null,
    state: client.state ?? null,
    postalCode: client.postalCode ?? null,
  };
}

// account = ClientBankAccount com o bank incluido ({ ...account, bank }).
export function buildBankSnapshot(account) {
  if (!account) {
    return null;
  }
  return {
    accountId: account.id,
    bankId: account.bankId ?? null,
    bankName: account.bank?.name ?? null,
    compeCode: account.bank?.compeCode ?? null,
    agency: account.agency ?? null,
    accountNumber: account.accountNumber ?? null,
    holderName: account.holderName ?? null,
    holderTaxId: account.holderTaxId ?? null,
    pixKey: account.pixKey ?? null,
  };
}

// ============================================================
// Aprovacao do contrato (Fase I — D112-D119). Funcoes PURAS dos handlers
// approval-labels do backend-api (seletor reduzido + prefill). Vivem aqui
// por serem a "regra unica pras 2 portas" (D115): card do contrato e
// seletor do /samples passam pelo mesmo prefill/quebra.
// ============================================================

// Limites FISICOS da etiqueta (espelham os maxChars do ApprovalLabelModal e a
// grade de lotes do print agent). Nao confundir com os caps genericos do
// normalizeCustomLabelLines (label 40 / value 80), que valem por cima.
const APPROVAL_COMPRA_MAX_CHARS = 26;
const APPROVAL_NAME_MAX_CHARS = 52;
const APPROVAL_LOT_MAX_CHARS = 16;
const APPROVAL_MAX_LOTS = 16;

// Status que aceitam ENVIO de aprovacao (D112). WASH_OUT fica FORA — negocio
// quebrado nao manda amostra de aprovacao (difere do Espelho, que inclui
// WASH_OUT por conta da D105; NAO copiar a lista de la).
export const APPROVAL_ELIGIBLE_STATUSES = Object.freeze(['EMITIDO', 'FATURADO', 'PAGO']);

// Quebra do "Lote de origem" (Sample.declaredOriginLot, texto livre <=100)
// nos campos discretos da etiqueta (D116): separadores = traco, espaco,
// virgula e ponto-e-virgula (sequencias colapsam; pedacos vazios caem);
// barra "/" NAO separa (pode ser composicao do lote). Pedaco >16 chars corta
// em 16; maximo 16 pedacos (teto fisico da etiqueta).
export function splitOriginLotForLabel(text) {
  return String(text ?? '')
    .split(/[-\s,;]+/)
    .filter(Boolean)
    .map((piece) => piece.slice(0, APPROVAL_LOT_MAX_CHARS))
    .slice(0, APPROVAL_MAX_LOTS);
}

// Prefill da etiqueta a partir do contrato (D115): 5 campos + lotes, todos
// EDITAVEIS no modal, cortados nos limites fisicos. Armazem = SEMPRE o do
// VENDEDOR (decisao S76); snapshot ausente -> campo vazio. originLotText =
// o texto original do lote de origem, exibido como referencia read-only da
// quebra (null quando nao ha — Futuro sem amostra, liga, campo vazio).
export function buildApprovalPrefill({
  purchaseNumber,
  contractNumber,
  sellerSnapshot,
  sellerWarehouseSnapshot,
  quantitySacks,
  originLotText,
}) {
  const originText =
    typeof originLotText === 'string' && originLotText.trim().length > 0
      ? originLotText.trim()
      : null;
  return {
    fields: {
      compra: String(purchaseNumber ?? '').slice(0, APPROVAL_COMPRA_MAX_CHARS),
      fechamento: String(contractNumber ?? ''),
      produtor: String(sellerSnapshot?.displayName ?? '').slice(0, APPROVAL_NAME_MAX_CHARS),
      armazem: String(sellerWarehouseSnapshot?.displayName ?? '').slice(0, APPROVAL_NAME_MAX_CHARS),
      sacas: quantitySacks === null || quantitySacks === undefined ? '' : String(quantitySacks),
    },
    lots: splitOriginLotForLabel(originText),
    originLotText: originText,
  };
}

// Item REDUZIDO do seletor de contratos (D113): allowlist EXPLICITA — nunca
// valores financeiros (preco/total/corretagem/agio) nem snapshots crus (PII).
// buyerName = so o displayName extraido do snapshot do comprador.
export function toApprovalContractOption(row) {
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    contractDate: toIsoString(row.contractDate),
    quantitySacks: row.quantitySacks,
    status: row.status,
    buyerName: row.buyerSnapshot?.displayName ?? null,
  };
}

// ============================================================
// Timeline do modal de Detalhes (Fase J — D125). Agrega as auditorias do
// contrato numa lista unica em ordem DECRESCENTE. Funcao PURA
// (unit-testavel); o service busca as linhas e resolve os nomes dos atores
// (as satelites nao tem @relation com User — join manual via app_user).
// ============================================================

function timelineActorName(usersById, actorUserId) {
  if (!actorUserId) return null;
  const user = usersById?.[actorUserId] ?? null;
  return user?.fullName ?? user?.username ?? null;
}

export function buildContractTimeline({
  contract,
  exports: exportRows = [],
  agioLogs = [],
  approvalLogs = [],
  statusLogs = [],
  espelhoLogs = [],
  usersById = {},
}) {
  const items = [];

  // Criacao + edicoes: SaleContractExport (1 linha por (re)emissao). A mais
  // ANTIGA e a criacao; as demais sao edicoes ("Editar" re-emite — D66/D97).
  const orderedExports = [...exportRows].sort(
    (a, b) => new Date(a.generatedAt) - new Date(b.generatedAt)
  );
  orderedExports.forEach((row, index) => {
    items.push({
      id: `export-${row.id}`,
      kind: index === 0 ? 'CRIACAO' : 'EDICAO',
      at: toIsoString(row.generatedAt),
      actorUserId: row.generatedByUserId ?? null,
      actorName: timelineActorName(usersById, row.generatedByUserId),
    });
  });

  for (const row of agioLogs) {
    items.push({
      id: `agio-${row.id}`,
      kind: 'AGIO',
      at: toIsoString(row.appliedAt),
      actorUserId: row.appliedByUserId ?? null,
      actorName: timelineActorName(usersById, row.appliedByUserId),
      agioDesagioType: row.agioDesagioType,
      agioDesagioValue: decimalToNumber(row.agioDesagioValue),
    });
  }

  // Aprovacoes: linha D118/D119 — "ha X tempo" + quem + "Aprovacao enviada"
  // (sem payload/drill-down; avulsas ficam de fora pelo filtro por contrato).
  for (const row of approvalLogs) {
    items.push({
      id: `aprovacao-${row.id}`,
      kind: 'APROVACAO',
      at: toIsoString(row.createdAt),
      actorUserId: row.actorUserId ?? null,
      actorName: timelineActorName(usersById, row.actorUserId),
    });
  }

  for (const row of statusLogs) {
    items.push({
      id: `status-${row.id}`,
      kind: 'STATUS',
      at: toIsoString(row.createdAt),
      actorUserId: row.actorUserId ?? null,
      actorName: timelineActorName(usersById, row.actorUserId),
      toStatus: row.toStatus,
      reason: row.reason ?? null,
      legacy: false,
    });
  }

  for (const row of espelhoLogs) {
    items.push({
      id: `espelho-${row.id}`,
      kind: 'ESPELHO',
      at: toIsoString(row.createdAt),
      actorUserId: row.actorUserId ?? null,
      actorName: timelineActorName(usersById, row.actorUserId),
      side: row.side,
    });
  }

  // Marcos LEGADOS (anteriores a sale_contract_status_log — D123): o contrato
  // tem a data mas nenhuma linha auditada correspondente -> entra uma linha
  // so-com-data (sem autor).
  const hasStatusLog = (status) => statusLogs.some((row) => row.toStatus === status);
  if (contract?.invoicedAt && !hasStatusLog('FATURADO')) {
    items.push({
      id: 'legacy-faturado',
      kind: 'STATUS',
      at: toIsoString(contract.invoicedAt),
      actorUserId: null,
      actorName: null,
      toStatus: 'FATURADO',
      reason: null,
      legacy: true,
    });
  }
  if (contract?.paidAt && !hasStatusLog('PAGO')) {
    items.push({
      id: 'legacy-pago',
      kind: 'STATUS',
      at: toIsoString(contract.paidAt),
      actorUserId: null,
      actorName: null,
      toStatus: 'PAGO',
      reason: null,
      legacy: true,
    });
  }
  if (contract?.washoutAt && !hasStatusLog('WASH_OUT')) {
    items.push({
      id: 'legacy-washout',
      kind: 'STATUS',
      at: toIsoString(contract.washoutAt),
      actorUserId: null,
      actorName: null,
      toStatus: 'WASH_OUT',
      reason: contract.washoutReason ?? null,
      legacy: true,
    });
  }

  // Mais recente primeiro; empate desempata por id (estavel entre chamadas).
  return items.sort((a, b) => {
    const diff = new Date(b.at) - new Date(a.at);
    if (diff !== 0) return diff;
    return a.id < b.id ? 1 : -1;
  });
}
