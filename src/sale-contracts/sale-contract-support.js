import { HttpError } from '../contracts/errors.js';
import { toIsoString } from '../users/user-support.js';

// Fechamento (Fase B.2 -- Passo 1): helpers PUROS (sem I/O) do contrato de
// venda "Mercado a vista". O contrato e CRUD (nao event-sourced); nasce junto
// da venda a vista (D43) na mesma transacao do evento SALE_CREATED. Aqui ficam:
// normalizadores dos campos novos da venda, calculo financeiro, formatacao do
// numero NNNN/AA, snapshots de identidade e o mapeamento de saida (view).

export const SALE_CONTRACT_TYPES = Object.freeze(['MERCADO_A_VISTA', 'FUTURO']);
export const SALE_CONTRACT_STATUSES = Object.freeze(['EMITIDO', 'FATURADO', 'PAGO', 'WASH_OUT']);

// Desfazer um passo no ciclo LINEAR EMITIDO -> FATURADO -> PAGO (corrige erro de
// clique). Como o pagamento só ocorre APÓS o faturamento (D106), o ciclo é linear
// e o destino é determinístico:
//   FATURADO -> EMITIDO  (limpa invoicedAt)
//   PAGO     -> FATURADO (limpa paidAt; invoicedAt preservado)
// Retorna null para status fora do ciclo (chamador devolve 409).
export function resolveRevertTarget(status) {
  if (status === 'FATURADO') {
    return 'EMITIDO';
  }
  if (status === 'PAGO') {
    return 'FATURADO';
  }
  return null;
}

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

// Financeiro (Fase F): projecao de "corretagem a receber" de UM contrato. Soma a
// corretagem das 2 pontas (commissionTotal) e divide IGUAL entre os corretores
// (cota = total / N, D79; nao ha coluna de cota). Projeta por papel (D82/D86):
// ADMIN ve a quebra por corretor (brokers + cota); COMMERCIAL ve so a propria
// cota (myShare). `row` = projecao SALE_CONTRACT_VIEW_SELECT; `brokerRows` = os
// SaleContractBroker do contrato (id/brokerId/brokerNameSnapshot).
export function buildReceivableView(row, brokerRows, { isAdmin } = {}) {
  const sellerValue = decimalToNumber(row.sellerBrokerageValue) ?? 0;
  const buyerValue = decimalToNumber(row.buyerBrokerageValue) ?? 0;
  const commissionTotal = round2(sellerValue + buyerValue);
  const brokerCount = brokerRows.length || 1;
  const share = round2(commissionTotal / brokerCount);

  const base = {
    id: row.id,
    contractNumber: row.contractNumber,
    contractDate: toIsoString(row.contractDate),
    status: row.status,
    totalValue: decimalToNumber(row.totalValue),
    commissionTotal,
    sellerBrokeragePct: decimalToNumber(row.sellerBrokeragePct),
    sellerBrokerageValue: sellerValue,
    buyerBrokeragePct: decimalToNumber(row.buyerBrokeragePct),
    buyerBrokerageValue: buyerValue,
    brokerCount,
  };

  if (isAdmin) {
    return {
      ...base,
      brokers: brokerRows.map((b) => ({
        brokerId: b.brokerId,
        name: b.brokerNameSnapshot,
        share,
      })),
    };
  }
  return { ...base, myShare: share };
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
