import { HttpError } from '../contracts/errors.js';
import { toIsoString } from '../users/user-support.js';

// Fechamento (Fase B.2 -- Passo 1): helpers PUROS (sem I/O) do contrato de
// venda "Mercado a vista". O contrato e CRUD (nao event-sourced); nasce junto
// da venda a vista (D43) na mesma transacao do evento SALE_CREATED. Aqui ficam:
// normalizadores dos campos novos da venda, calculo financeiro, formatacao do
// numero NNNN/AA, snapshots de identidade e o mapeamento de saida (view).

export const SALE_CONTRACT_TYPES = Object.freeze(['MERCADO_A_VISTA', 'FUTURO']);
export const SALE_CONTRACT_STATUSES = Object.freeze([
  'EM_ABERTO',
  'CONFERIR',
  'CONFIRMADO',
  'FATURADO',
  'PAGO',
  'WASH_OUT',
]);

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

// Financeiro (Passo 1, sem agio/desagio -- isso e etapa 2 / D54):
//   total = preco/saca x sacas; corretagem_lado = total x (% / 100).
// Tudo arredondado a 2 casas e devolvido como string "0.00" (Decimal-safe).
export function computeContractMoney({ unitPrice, quantitySacks, sellerPct, buyerPct }) {
  const totalValue = round2(unitPrice * quantitySacks);
  const sellerBrokerageValue = round2(totalValue * (sellerPct / 100));
  const buyerBrokerageValue = round2(totalValue * (buyerPct / 100));
  return {
    totalValue: totalValue.toFixed(2),
    sellerBrokerageValue: sellerBrokerageValue.toFixed(2),
    buyerBrokerageValue: buyerBrokerageValue.toFixed(2),
  };
}

// Numero do contrato NNNN/AA: NNNN com zero-padding a 4 (cresce alem disso),
// AA = 2 ultimos digitos do ano de emissao/criacao (decisao desta sessao).
export function formatContractNumber(seq, year) {
  const yy = String(year % 100).padStart(2, '0');
  return `${String(seq).padStart(4, '0')}/${yy}`;
}

// Snapshot MINIMO de identidade do vendedor no EM_ABERTO (a partir do
// ownerClient ja mapeado da amostra). Etapa 2 enriquece (filial/endereco) e o
// CONFIRMADO congela (D25). buyerSnapshot reusa o binding do comprador.
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

// Monta o "rascunho" do contrato pronto pra create -- EXCETO id/contractSeq/
// contractNumber/movementId, que dependem da transacao (gerador + evento).
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
    status: 'EM_ABERTO',
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
