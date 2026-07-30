import { HttpError } from '../contracts/errors.js';
import { toIsoString } from '../users/user-support.js';

// Fechamento (Fase B.2 -- Passo 1): helpers PUROS (sem I/O) do contrato de
// venda "Mercado a vista". O contrato e CRUD (nao event-sourced); nasce junto
// da venda a vista (D43) na mesma transacao do evento SALE_CREATED. Aqui ficam:
// normalizadores dos campos novos da venda, calculo financeiro, formatacao do
// numero NNNN/AA, snapshots de identidade e o mapeamento de saida (view).

export const SALE_CONTRACT_TYPES = Object.freeze(['MERCADO_A_VISTA', 'FUTURO']);
// RC-D62 (§6): tres situacoes, nao uma maquina de estados. EMITIDO = em andamento,
// FINALIZADO = alguem marcou que acabou (reversivel, RC-D63), WASH_OUT = cancelado.
export const SALE_CONTRACT_STATUSES = Object.freeze(['EMITIDO', 'FINALIZADO', 'WASH_OUT']);

// Decimal(12,2) cabe ate 9.999.999.999,99. Preco/saca e corretagem sao bem
// menores, mas o teto evita estouro silencioso no banco.
const DECIMAL_12_2_MAX = 9999999999.99;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Arredondamento HALF-UP de verdade em 2 casas (RC-D108). Ate 2026-07-29 isto era
// `Math.round((value + Number.EPSILON) * 100) / 100`, e o empurrao NAO funcionava: o
// Number.EPSILON (2.22e-16) e ABSOLUTO, mas o ulp de um valor da ordem de 1e4 e ~1e-12
// — cinco ordens de grandeza maior. Resultado: o meio-centavo caia para BAIXO.
// Ex.: 700.010,00 x 2,25% = 15.750,225 exato, mas o float da 15750.224999999999, e
// gravava-se 15.750,22 em vez de 15.750,23 — um centavo a menos no banco E no papel.
// Aqui reaproximamos o produto escalado ao decimal exato ANTES do Math.round: o valor
// exato e sempre multiplo de 0,0001 (preco e pct tem 2 casas), entao 15 digitos
// significativos desambiguam com folga. Negativos seguem o mesmo caminho do Math.round
// (meio para +inf) — inalcancaveis no dominio: pct fora de 0..100 e desagio >= preco
// sao recusados na escrita (normalizeBrokeragePct / assertAgioWithinUnitPrice).
function round2(value) {
  if (!Number.isFinite(value)) return value;
  return Math.round(Number((value * 100).toPrecision(15))) / 100;
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

// Preco EFETIVO/saca (D54 — R$ POR SACA): preco cru +/- agio/desagio. Fonte UNICA da
// conta — reusada pelo computeContractMoneyWithAgio (base da comissao), pela view
// (effectiveUnitPrice) e pelo PDF/Conferencia do Espelho (coluna "Preco"). null se
// unitPrice ausente; sem agio devolve o cru (ja e de 2 casas).
export function computeEffectiveUnitPrice(unitPrice, agioType = null, agioValue = null) {
  if (unitPrice == null) return null;
  if (agioType === 'AGIO' && agioValue) {
    return round2(unitPrice + agioValue);
  }
  if (agioType === 'DESAGIO' && agioValue) {
    return round2(unitPrice - agioValue);
  }
  return unitPrice;
}

// Financeiro com agio/desagio (D54 — R$ POR SACA): total = efetivo x sacas;
// corretagem_lado = total x (% / 100). Tudo arredondado a 2 casas e devolvido como
// string "0.00" (Decimal-safe).
export function computeContractMoneyWithAgio({
  unitPrice,
  quantitySacks,
  sellerPct,
  buyerPct,
  agioType = null,
  agioValue = null,
}) {
  const effectiveUnit = computeEffectiveUnitPrice(unitPrice, agioType, agioValue);
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

// Guard de ESCRITA: o DESAGIO nao pode zerar/inverter o preco. Se valor >= preco/saca,
// o preco efetivo fica <= 0 e total + corretagens ficam NEGATIVOS. Chamado onde
// unitPrice e o valor coexistem (emit/criacao + applyAgio). NAO entra no compute
// acima, que tambem serve exibicao (timeline/financeiro) e nao deve lancar.
export function assertAgioWithinUnitPrice(
  unitPrice,
  agioType,
  agioValue,
  fieldName = 'agioDesagio'
) {
  if (
    agioType === 'DESAGIO' &&
    agioValue != null &&
    unitPrice != null &&
    Number(agioValue) >= Number(unitPrice)
  ) {
    throw new HttpError(422, `${fieldName}Value (desagio) must be less than the unit price`, {
      code: 'VALIDATION_ERROR',
      field: `${fieldName}Value`,
    });
  }
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
function buildSellerSnapshot(ownerClient) {
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
// (o snapshot cru NAO vai no payload de saida).
export const RECEIVABLE_VIEW_SELECT = Object.freeze({
  id: true,
  version: true,
  contractSeq: true,
  contractNumber: true,
  contractDate: true,
  paymentDate: true,
  status: true,
  // D147: carrega a modalidade porque o view a exibe. A billabilidade do washout
  // NAO sai mais dela (RC-D89 revogou a D145): quem responde e `washoutBillable`.
  type: true,
  washoutBillable: true,
  buyerSnapshot: true,
  totalValue: true,
  sellerBrokeragePct: true,
  sellerBrokerageValue: true,
  buyerBrokeragePct: true,
  buyerBrokerageValue: true,
});

// F1 (E24/D138): select ENXUTO do feed de "pagamentos de contrato" do card de Eventos
// — id/status, numero, a data PREVISTA e o snapshot do COMPRADOR (nome no chip).
// RC-D62: nao ha mais data real (`paidAt` morreu) — o feed e agenda, nao historico.
export const PAYMENT_EVENT_SELECT = Object.freeze({
  id: true,
  status: true,
  contractNumber: true,
  paymentDate: true,
  buyerSnapshot: true,
});

export const SALE_CONTRACT_VIEW_SELECT = Object.freeze({
  id: true,
  type: true,
  contractSeq: true,
  contractNumber: true,
  status: true,
  washoutReason: true,
  washoutAt: true,
  washoutBillable: true,
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
  requiresApproval: true,
  approvalReminderLeadDays: true,
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
    washoutBillable: row.washoutBillable ?? null,
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
    // Espelho (dedup): preco efetivo/saca (cru +/- agio) pela fonte unica — o PDF e a
    // Conferencia leem daqui em vez de recalcular a coluna "Preco".
    effectiveUnitPrice: computeEffectiveUnitPrice(
      decimalToNumber(row.unitPrice),
      row.agioDesagioType ?? null,
      decimalToNumber(row.agioDesagioValue)
    ),
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
    requiresApproval: row.requiresApproval,
    approvalReminderLeadDays: row.approvalReminderLeadDays ?? null,
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

// 🪦 RC-D65 (2026-07-28): TODO o embarque saiu daqui. Eram 13 pecas — as fotos
// (`SHIPMENT_PHOTO_VIEW_SELECT`, `toShipmentPhotoView`), o contexto do modal
// (`SHIPMENT_CONTEXT_SELECT`, `buildShipmentContext`) e a worklist inteira
// (`SHIPMENT_VIEW_SELECT`, `deriveShipmentState`, `buildShipmentView`, os filtros,
// os cursores e o `shipmentKeysetWhere`). Confirmar embarque + transporte +
// responsavel + fotos era o registro mais caro do app e nenhuma parte dele era
// subproduto de trabalho que ja se faz — so escrituracao, com o agravante de
// TRAVAR o pagamento (portao EMB28). Ver §6 do Contratos-Plano-de-Trabalho.md.

// ============================================================
// A AGENDA do contrato (RC-D68) — o que substituiu o status
// ============================================================

// O contrato deixou de ter fase e passou a ter compromisso. Este derivador responde
// "o que vem a seguir?" a partir de dado que ja existe — as duas datas que o PDF
// imprime (`invoiceDate`/`paymentDate`), o sinal de aprovacao e a existencia de
// etiqueta. Custo de manutencao: zero. Ninguem marca nada pra isto ficar correto.
//
// Precedencia (a primeira que casar vence):
//   cancelado > finalizado > aprovacao > pagamento_vencido > faturamento >
//   pagamento > nenhum
//
// 🔴 So `pagamento_vencido` e atraso (RC-D64), porque `paymentDate` e a unica data
// que uma acao — finalizar — resolve. O faturamento NAO vence: passou o dia, o aviso
// simplesmente para de aparecer. Marcar de vermelho uma data que ninguem pode
// resolver e o defeito que esta reforma existe pra apagar.
//
// Devolve `{ kind, dayKey }` e NAO um rotulo pronto: a frase precisa da data
// formatada em pt-BR e quem sabe formatar e o front. O label dos eventos do
// calendario e a excecao (la o consumidor e um card generico que nada sabe de
// contrato).
export const CONTRACT_AGENDA_KINDS = Object.freeze([
  'cancelado',
  'finalizado',
  'aprovacao',
  'pagamento_vencido',
  'faturamento',
  'pagamento',
  'nenhum',
]);

function dayKeyOf(value) {
  const iso = toIsoString(value);
  return iso ? iso.slice(0, 10) : null;
}

// Janela do lembrete de aprovacao — a MESMA do card de Avisos (AP31): avisa quando
// falta `leadDays` ou menos para o faturamento planejado. Sem data planejada
// ("A definir", D144) avisa SEMPRE, porque nao ha como saber se ja esta em cima.
function approvalWindowOpen(invoiceDayKey, leadDays, todayKey) {
  if (!invoiceDayKey) return true;
  if (!todayKey) return true;
  const limit = new Date(`${todayKey}T00:00:00.000Z`);
  limit.setUTCDate(limit.getUTCDate() + (Number.isInteger(leadDays) ? leadDays : 0));
  return invoiceDayKey <= limit.toISOString().slice(0, 10);
}

export function deriveContractAgenda(
  {
    status,
    requiresApproval = false,
    hasApprovalLabel = false,
    approvalReminderLeadDays = null,
    invoiceDate = null,
    paymentDate = null,
  },
  todayKey
) {
  if (status === 'WASH_OUT') return { kind: 'cancelado', dayKey: null };
  if (status === 'FINALIZADO') return { kind: 'finalizado', dayKey: null };

  const invoiceDayKey = dayKeyOf(invoiceDate);
  const paymentDayKey = dayKeyOf(paymentDate);

  if (
    requiresApproval &&
    !hasApprovalLabel &&
    approvalWindowOpen(invoiceDayKey, approvalReminderLeadDays, todayKey)
  ) {
    return { kind: 'aprovacao', dayKey: invoiceDayKey };
  }
  if (paymentDayKey && todayKey && paymentDayKey < todayKey) {
    return { kind: 'pagamento_vencido', dayKey: paymentDayKey };
  }
  // Sem `todayKey` nao da pra saber o que ja passou — devolve a data mais proxima
  // na ordem do documento (fatura antes de pagamento), que e o comportamento util.
  if (invoiceDayKey && (!todayKey || invoiceDayKey >= todayKey)) {
    return { kind: 'faturamento', dayKey: invoiceDayKey };
  }
  if (paymentDayKey) {
    return { kind: 'pagamento', dayKey: paymentDayKey };
  }
  return { kind: 'nenhum', dayKey: null };
}

// ------------------------------------------------------------
// As cinco fases (RC-D80..D83) — a linha de progressao da lista
// ------------------------------------------------------------

// 🔴 NAO E BARRA DE PROGRESSO — sao CINCO LUZES. Cada ponto acende pelo seu proprio
// criterio, independente dos outros, porque no modelo da §6 nada trava nada: da pra
// FINALIZAR sem ter enviado a aprovacao (RC-D66 matou o portao) e pagar antes do
// faturamento. Logo `● ○ ● ● ●` (buraco no meio) e `● ● ○ ○ ●` (cheio na ponta) sao
// estados LEGITIMOS, nao inconsistencia a corrigir. Quem tentar "consertar" isso
// forcando ordem vai reintroduzir o portao que a §6 derrubou.
export const CONTRACT_PHASE_KEYS = Object.freeze([
  'emissao',
  'aprovacao',
  'embarque',
  'faturamento',
  'pagamento',
]);

// Estados do ponto. `na` = a fase nao existe neste contrato (aprovacao nao marcada);
// o slot fica assim mesmo, porque a linha vive numa TABELA e 5 pontos em toda linha
// e o que mantem as colunas alinhadas entre contratos.
export const CONTRACT_PHASE_STATES = Object.freeze(['feito', 'pendente', 'na']);

// Mesmos ingredientes da agenda (`agendaInputOf`) — de proposito: se a linha e a
// coluna "Situacao" derivassem de fontes diferentes, elas poderiam se contradizer na
// mesma celula. `paymentDate` entra na assinatura e nao e lido: o pagamento marca por
// ACAO (RC-D79), nunca por data.
export function deriveContractPhases(
  { status, requiresApproval = false, hasApprovalLabel = false, invoiceDate = null },
  todayKey
) {
  const invoiceDayKey = dayKeyOf(invoiceDate);
  // RC-D77: embarque e faturamento marcam quando a data PASSA — eles nao deixam
  // rastro, entao aqui o ✓ afirma o que o sistema nao observou (escolha do Flavio,
  // contra a recomendacao). Estritamente passada: no proprio dia a agenda ainda diz
  // "Fatura em 12/08", e um ponto cheio na mesma celula contradiria a frase ao lado.
  // Sem data ("A definir", D144) nao ha o que afirmar: pendente.
  const invoiceDayPassed = Boolean(invoiceDayKey && todayKey && invoiceDayKey < todayKey);
  // RC-D84: finalizar da o contrato inteiro por cumprido — a linha enche. E EFEITO,
  // nao condicao: o portao continua morto (RC-D66), ninguem precisa completar fase
  // nenhuma para poder finalizar.
  // ⚠️ Consequencia aceita: contrato finalizado SEM a etiqueta de aprovacao ter
  // saido passa a mostrar a aprovacao cheia. Como o aviso tambem some ao finalizar
  // (getDashboardAvisos filtra status='EMITIDO'), o fato sai do app. O Flavio viu
  // esse caso no preview e escolheu assim.
  const done = status === 'FINALIZADO';
  return {
    // Washout nao e fase — e o fim. A linha para de valer inteira (a UI esmaece e
    // fecha com ✕), mas os pontos seguem derivados: o que ja tinha acontecido
    // aconteceu.
    cancelado: status === 'WASH_OUT',
    points: [
      // O contrato existe, logo foi emitido. Nao ha caso em que este ponto esteja
      // vazio — e por isso a emissao nunca aparece como pendencia em lugar nenhum.
      { key: 'emissao', state: 'feito' },
      {
        // O `na` sobrevive ao FINALIZADO de proposito: uma fase que nao existe
        // neste contrato nao tem como estar completa. "Todas as fases completas"
        // (RC-D84) e sobre as que se aplicam.
        key: 'aprovacao',
        state: !requiresApproval ? 'na' : hasApprovalLabel || done ? 'feito' : 'pendente',
      },
      // RC-D76/D81: os dois leem o MESMO `invoiceDate`, entao nunca aparecem em
      // estados diferentes. Sao dois pontos por decisao do Flavio (as fases sao
      // distintas mesmo caindo no mesmo dia), com essa consequencia aceita.
      { key: 'embarque', state: invoiceDayPassed || done ? 'feito' : 'pendente' },
      { key: 'faturamento', state: invoiceDayPassed || done ? 'feito' : 'pendente' },
      // RC-D79: "Finalizar" = o pagamento entrou. A data e previsao; o ATRASO dela
      // fica na coluna "Situacao" (RC-D83), nao aqui — a linha nao tem vermelho.
      { key: 'pagamento', state: done ? 'feito' : 'pendente' },
    ],
  };
}

// RC-D85/D86: "Finalizar" so a partir da DATA DE FATURAMENTO — antes dela nao houve
// nota, logo nao houve pagamento a declarar. Inclui o proprio dia ("a partir de").
// RC-D86: sem data planejada ("A definir", D144) tambem nao finaliza — a saida e
// editar o contrato e por a data, que e a acao certa de qualquer forma.
//
// 🔴 Esta e a UNICA trava do "Finalizar". Nao confundir com o portao AP18, que a
// RC-D66 matou: aquele exigia a APROVACAO enviada e travava por causa de OUTRO
// objeto. Este olha so uma data do proprio contrato.
export function finalizeBlockReason({ invoiceDate = null }, todayKey) {
  const invoiceDayKey = dayKeyOf(invoiceDate);
  if (!invoiceDayKey) return 'invoice_date_missing';
  if (todayKey && invoiceDayKey > todayKey) return 'before_invoice_date';
  return null;
}

// ------------------------------------------------------------
// Worklist da Aprovacao (AP25-AP28) — a "casa" na sub-aba
// ------------------------------------------------------------

// Estado derivado (sem enum, AP14/Fase 5): cancelado (WASH_OUT) · enviada (>=1
// etiqueta, nao washout) · a_enviar (marcado e sem etiqueta).
// RC-D66: o portao AP18 MORREU — antes "marcado e nao enviado" era impossivel de
// coexistir com o contrato tendo avancado, porque faturar exigia a etiqueta. Hoje da
// pra FINALIZAR sem ter enviado: o estado passa a descrever, nao a garantir.
// `labelCount` vem do approval_label_log (agregado na query da worklist).
function deriveApprovalState(status, labelCount) {
  if (status === 'WASH_OUT') return 'cancelado';
  if (labelCount >= 1) return 'enviada';
  return 'a_enviar';
}

// Filtros da worklist (AP28). Default 'a_enviar' (o acionavel em cima).
const APPROVAL_WL_FILTERS = Object.freeze(['a_enviar', 'enviada', 'cancelado', 'todos']);

export function normalizeApprovalWlFilter(raw) {
  return typeof raw === 'string' && APPROVAL_WL_FILTERS.includes(raw) ? raw : 'a_enviar';
}

// Linha da worklist (AP26): chip · nº · comprador · data · sacas · "·N×" (AP24). So
// dado NAO-sensivel (a aba e visivel a todos os nao-PROSPECTOR — sem financeiro). Data:
// a_enviar/cancelado -> faturamento planejado (invoiceDate); enviada -> ultimo envio
// (lastSendAt). `sendCount` alimenta o "·N×" (o front so mostra quando > 1). A linha
// vem do $queryRaw (colunas ja em camelCase + buyerName/labelCount/lastSendAt).
export function buildApprovalWorklistView(row, todayKey) {
  const labelCount = Number(row.labelCount ?? 0);
  const state = deriveApprovalState(row.status, labelCount);
  const dateIso = state === 'enviada' ? toIsoString(row.lastSendAt) : toIsoString(row.invoiceDate);
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    state,
    status: row.status,
    buyerName: row.buyerName ?? null,
    quantitySacks: Number(row.quantitySacks ?? 0),
    date: dateIso,
    sendCount: labelCount,
  };
}

// Cursor keyset opaco. {g, key, seq}: g = grupo (0 a_enviar / 1 enviada / 2 cancelado);
// key = invoiceDate 'YYYY-MM-DD' (G0) | lastSendAt ISO COM HORA (G1 — pode haver N
// envios no mesmo dia, precisa da hora) | null (G2); seq = contractSeq (tiebreak
// unico). base64url. (Difere do cursor do embarque: o key do G1 leva hora.)
export function encodeApprovalWlCursor(cursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeApprovalWlCursor(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const okKey =
      p?.key === null || (typeof p?.key === 'string' && !Number.isNaN(new Date(p.key).getTime()));
    if (p && Number.isInteger(p.g) && p.g >= 0 && p.g <= 2 && Number.isInteger(p.seq) && okKey) {
      return { g: p.g, key: p.key, seq: p.seq };
    }
  } catch {
    // cursor malformado -> trata como 1a pagina
  }
  return null;
}

// Revisao do Pagamento (FN1): estado da corretagem a receber, derivado (sem enum) —
// a LENTE do Financeiro. Chip: cancelado (WASH_OUT) · recebida · vencido (paymentDate
// < hoje BRT) · a_vencer (no prazo ou SEM data).
// RC-D67: "recebida" vem do contrato estar FINALIZADO — nao ha marca propria do
// dinheiro. O /financeiro nao tem mais acao nenhuma: quem fecha e quem conduziu o
// contrato, em /contratos. O custo assumido: "a operacao acabou" e "a corretagem
// entrou" nem sempre sao o mesmo dia, e a fila mede o primeiro.
// RC-D64: este e o UNICO atraso do app, porque `paymentDate` e a unica data que uma
// acao (finalizar) resolve. Sem data nunca vira vencido. String-compare de 2
// 'YYYY-MM-DD' == compare cronologico.
function deriveReceivablePaymentState(status, paymentDate, todayKey) {
  if (status === 'WASH_OUT') return 'cancelado';
  if (status === 'FINALIZADO') return 'recebida';
  const iso = toIsoString(paymentDate);
  const dayKey = iso ? iso.slice(0, 10) : null;
  if (dayKey && todayKey && dayKey < todayKey) return 'vencido';
  return 'a_vencer';
}

// Modalidade do contrato (D147): predicados canonicos por `type`. Usados no
// washout (ramifica por `type`, nao pelo vinculo de lote) e onde precisar
// distinguir a vista de futuro. A invariante `type` <-> vinculo de lote (a vista
// tem sample/movement; futuro nao) e garantida pela CHECK chk_sale_contract_type_lote.
export function isFutureContract(contract) {
  return contract?.type === 'FUTURO';
}

export function isSpotContract(contract) {
  return contract?.type === 'MERCADO_A_VISTA';
}

// RC-D89/D91 (revoga a D145, que revisava a D105): o contrato cancelado que NAO
// cobra corretagem sai do Financeiro e bloqueia o Espelho. Ate aqui isso era
// derivado do TIPO (a vista nunca cobrava, Futuro sempre); agora e a RESPOSTA dada
// no washout que decide — a regra acertava a maioria e nao tinha saida para o resto.
//
// 🔴 `!== true` e nao `=== false` de proposito: washout gravado antes desta coluna
// existir (ou por caminho que nao respondeu) NAO cobra. Fail-closed — na duvida o
// sistema nao emite cobranca.
export function isWashoutNotBillable(contract) {
  return contract?.status === 'WASH_OUT' && contract?.washoutBillable !== true;
}

// RC-D105: o FIM do contrato — o instante a partir do qual a retencao do espelho
// guardado corre. DERIVADO, nunca persistido, pelo mesmo motivo da coluna "Situacao"
// (RC-D62): nao existe `finalizedAt` e isso e de proposito — finalizar e REVERSIVEL
// (RC-D63), e reabrir grava a volta para EMITIDO em vez de apagar a ida. Logo:
//
//   FINALIZADO -> a linha MAIS RECENTE do status log com toStatus FINALIZADO;
//   WASH_OUT   -> washoutAt (a unica data de terminal que e coluna), com fallback
//                 no status log para as linhas legadas;
//   EMITIDO    -> null. Nao ha relogio — enquanto o contrato esta vivo o documento
//                 fica. Reabrir um finalizado PARA a contagem, sem gesto nenhum.
//
// 🔴 FINALIZADO sem nenhuma linha no status log devolve null (fail-OPEN de proposito):
// guardar um documento por tempo demais e melhor que apagar um que nao se sabe datar.
export const ESPELHO_SNAPSHOT_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;

function latestStatusLogAt(statusLogs, toStatus) {
  let latest = null;
  for (const row of statusLogs ?? []) {
    if (row?.toStatus !== toStatus) continue;
    const at = row.createdAt ? new Date(row.createdAt) : null;
    if (!at || Number.isNaN(at.getTime())) continue;
    if (!latest || at.getTime() > latest.getTime()) latest = at;
  }
  return latest;
}

export function contractEndedAt(contract, statusLogs = []) {
  if (contract?.status === 'WASH_OUT') {
    const washoutAt = contract.washoutAt ? new Date(contract.washoutAt) : null;
    if (washoutAt && !Number.isNaN(washoutAt.getTime())) return washoutAt;
    return latestStatusLogAt(statusLogs, 'WASH_OUT');
  }
  if (contract?.status === 'FINALIZADO') {
    return latestStatusLogAt(statusLogs, 'FINALIZADO');
  }
  return null;
}

// Quando o snapshot deste contrato expira. null = contrato vivo, sem prazo.
export function espelhoSnapshotExpiresAt(contract, statusLogs = []) {
  const endedAt = contractEndedAt(contract, statusLogs);
  return endedAt ? new Date(endedAt.getTime() + ESPELHO_SNAPSHOT_RETENTION_MS) : null;
}

// 🔴 Este predicado tem que ser usado em TODAS as leituras — na lista E na rota que
// serve o PDF. Retencao so na lista e cosmetica: a URL direta continua entregando o
// documento (licao do EMB31).
export function isEspelhoSnapshotAvailable(row, contract, statusLogs = [], now = new Date()) {
  if (!row?.snapshot) return false;
  const expiresAt = espelhoSnapshotExpiresAt(contract, statusLogs);
  return expiresAt === null || expiresAt.getTime() >= now.getTime();
}

// Elegibilidade do Espelho de Corretagem (D105/D145/S74): status congelado
// (SALE_CONTRACT_STATUSES), NAO spot-washout (D145) e corretagem > 0 no lado pedido.
// Lanca HttpError com o ESPELHO_* certo. Reusada pelo exportEspelhoPdf E pelo
// logEspelhoExport (o endpoint de log tambem valida — nao grava export impossivel).
export function assertEspelhoEligible(contract, side) {
  if (!SALE_CONTRACT_STATUSES.includes(contract.status)) {
    throw new HttpError(409, 'O Espelho de Corretagem não é elegível para este contrato', {
      code: 'ESPELHO_NOT_ELIGIBLE',
    });
  }
  if (isWashoutNotBillable(contract)) {
    throw new HttpError(409, 'Contrato cancelado sem cobrança de corretagem', {
      code: 'ESPELHO_WASHOUT_NOT_BILLABLE',
    });
  }
  const sidePct = side === 'seller' ? contract.sellerBrokeragePct : contract.buyerBrokeragePct;
  if (!(Number(sidePct) > 0)) {
    throw new HttpError(409, 'O Espelho de Corretagem exige corretagem neste lado do contrato', {
      code: 'ESPELHO_NO_BROKERAGE',
    });
  }
}

// Nome da parte a partir do snapshot congelado no contrato. Fonte UNICA no backend
// (o PDF tinha uma copia propria que nao tratava string em branco). Ordem: displayName
// -> legalName -> fullName, que e a ordem com que o buildPartySnapshot os preenche.
// Devolve null quando nao ha nome usavel — inclusive para "" e "   ".
export function snapshotPartyName(snap) {
  if (!snap) return null;
  for (const candidate of [snap.displayName, snap.legalName, snap.fullName]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
  }
  return null;
}

export const ESPELHO_SNAPSHOT_VERSION = 1;

// RC-D103: tudo que o papel do Espelho imprime DO CONTRATO, congelado num objeto.
// O renderizador passa a ler SEMPRE daqui — na geracao nova e na releitura de um
// espelho guardado —, o que torna fresco e guardado um caminho SO. Antes cada celula
// ia buscar o valor na linha do contrato no momento do render, e por isso regerar
// depois de um "Editar"/agio produzia um documento diferente do que foi entregue.
//
// O que NAO entra:
//   - o EMISSOR (nome, CNPJ, banco): e dado da corretora, lido do issuer-config, e um
//     reenvio deve levar a conta ATUAL. O que pode derivar sao os numeros do contrato.
//   - a DATA de geracao: vem de fora (`generatedAt`) — na releitura e o created_at da
//     propria linha de auditoria, que e a data autoritativa do registro.
//   - FORMATACAO: aqui e dado (ISO, number). Quem formata e o renderizador.
//
// `clientName` e a excecao deliberada: resolve-se o nome AQUI porque a regra de
// resolucao (displayName -> legalName -> fullName) pode mudar, e mudar a regra nao
// pode reescrever o nome de um documento que ja foi entregue.
export function buildEspelhoSnapshot(contract, side) {
  const isSeller = side === 'seller';
  const partySnap = isSeller ? contract.sellerSnapshot : contract.buyerSnapshot;
  return {
    v: ESPELHO_SNAPSHOT_VERSION,
    side,
    contractVersion: Number.isInteger(contract.version) ? contract.version : null,
    clientName: snapshotPartyName(partySnap),
    contractNumber: contract.contractNumber ?? null,
    paymentDate: toIsoString(contract.paymentDate),
    effectiveUnitPrice:
      decimalToNumber(contract.effectiveUnitPrice) ??
      computeEffectiveUnitPrice(
        decimalToNumber(contract.unitPrice),
        contract.agioDesagioType ?? null,
        decimalToNumber(contract.agioDesagioValue)
      ),
    quantitySacks: decimalToNumber(contract.quantitySacks),
    agioDesagioType: contract.agioDesagioType ?? null,
    agioDesagioValue: decimalToNumber(contract.agioDesagioValue),
    brokeragePct: decimalToNumber(
      isSeller ? contract.sellerBrokeragePct : contract.buyerBrokeragePct
    ),
    commission: decimalToNumber(
      isSeller ? contract.sellerBrokerageValue : contract.buyerBrokerageValue
    ),
    purchaseNumber: contract.purchaseNumber ?? null,
  };
}

// Financeiro (Fase F): projecao de "corretagem a receber" de UM contrato. Soma a
// corretagem das 2 pontas (commissionTotal). Os corretores sao ATRIBUICAO/metrica
// (D34): lista de nomes, SEM valor por corretor — o sistema NAO divide a corretagem
// entre eles (D136 removeu o rateio ÷N das D79/D129, uma divisao igual ficticia que
// arriscava os registros; a divisao real, quando ha, e externa). `row` = projecao
// RECEIVABLE_VIEW_SELECT; `brokerRows` = os SaleContractBroker (brokerId/nome).
// Revisao do Pagamento (FN1/FN3): + buyerName (do buyerSnapshot) e paymentState
// (derivado com o dia BRT injetado, fonte unica de "hoje"). RC-D67: sem `paidAt` —
// nao ha data real de recebimento, o sinal e o contrato estar FINALIZADO.
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
    status: row.status,
    type: row.type,
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
// RC-D67: 'pago' virou 'recebida' — o chip fala da corretagem que entra, nao do
// contrato que foi pago.
const RECEIVABLE_FILTERS = Object.freeze(['todos', 'a_vencer', 'vencido', 'recebida', 'cancelado']);

export function normalizeReceivableFilter(raw) {
  return typeof raw === 'string' && RECEIVABLE_FILTERS.includes(raw) ? raw : 'todos';
}

// Revisao do Pagamento (FN4): cursor keyset opaco do Financeiro. {g, pd, seq}:
// g = grupo (0 em aberto / 1 recebida / 2 cancelado); pd = 'YYYY-MM-DD'|null (so
// importa em G0, ordenado por paymentDate asc nulls-last); seq = contractSeq (tiebreak
// unico e monotonico). base64url pra viajar como string opaca na querystring.
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

// ===========================================================================
// RC-F6: filtros da lista de /contratos. Ate aqui a pagina baixava ate 200
// contratos com query VAZIA e filtrava/buscava/contava no navegador — acima do
// teto os contratos sumiam sem aviso e a contagem mentia. Estes helpers sao
// puros; o `where` e a paginacao moram no listSaleContracts.
// ===========================================================================

const CONTRACT_PERIOD_BASES = Object.freeze(['contract', 'invoice', 'payment']);
const CONTRACT_PERIOD_FIELD = Object.freeze({
  contract: 'contractDate',
  invoice: 'invoiceDate',
  payment: 'paymentDate',
});
const FILTER_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Status e tipo sao MULTI-selecao na tela. Aceita string, lista, ou string
// separada por virgula (querystring) e devolve sempre lista normalizada. Vazio =
// sem filtro; item invalido = 422 — ignorar em silencio faria um erro de
// digitacao devolver a lista inteira sem ninguem perceber.
export function normalizeEnumFilterList(raw, allowed, fieldName) {
  if (raw === undefined || raw === null || raw === '') return [];
  const values = Array.isArray(raw) ? raw : String(raw).split(',');
  const out = [];
  for (const value of values) {
    const normalized = String(value).trim().toUpperCase();
    if (normalized === '') continue;
    if (!allowed.includes(normalized)) {
      throw new HttpError(422, `${fieldName} is invalid`, {
        code: 'VALIDATION_ERROR',
        field: fieldName,
      });
    }
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}

export function normalizeUuidFilter(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  if (!UUID_REGEX.test(raw)) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return raw;
}

// Periodo = uma BASE (data do contrato / do faturamento / do pagamento) + janela
// inclusiva. A base sozinha nao recorta nada — a tela manda ela sempre, mesmo sem
// datas. Devolve o NOME da coluna ja resolvido pra o service so montar o range.
export function normalizeContractPeriodFilter({ periodBase, periodFrom, periodTo } = {}) {
  const base =
    periodBase === undefined || periodBase === null || periodBase === ''
      ? 'contract'
      : String(periodBase).trim().toLowerCase();
  if (!CONTRACT_PERIOD_BASES.includes(base)) {
    throw new HttpError(422, 'periodBase is invalid', {
      code: 'VALIDATION_ERROR',
      field: 'periodBase',
    });
  }
  const from = normalizeFilterDate(periodFrom, 'periodFrom');
  const to = normalizeFilterDate(periodTo, 'periodTo');
  if (from && to && from.getTime() > to.getTime()) {
    throw new HttpError(422, 'periodFrom must not be after periodTo', {
      code: 'VALIDATION_ERROR',
      field: 'periodFrom',
    });
  }
  return { field: CONTRACT_PERIOD_FIELD[base], from, to };
}

// As datas do contrato sao @db.Date (meia-noite UTC) — ancorar em T00:00:00Z
// mantem a janela alinhada ao dia-calendario, sem off-by-one de fuso.
function normalizeFilterDate(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  if (!FILTER_DATE_REGEX.test(raw)) {
    throw new HttpError(422, `${fieldName} must be a YYYY-MM-DD date`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(422, `${fieldName} is invalid`, {
      code: 'VALIDATION_ERROR',
      field: fieldName,
    });
  }
  return date;
}

// Cursor da lista de contratos. A ordem e `contractSeq desc` — coluna UNICA e
// monotonica —, entao o cursor E o proprio seq: nao ha tupla a esconder, ao
// contrario do cursor de 3 campos do Financeiro (que precisa de base64url).
// Cursor malformado vira 1a pagina, mesmo molde do decodeReceivableCursor.
export function decodeContractSeqCursor(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const seq = Number(raw);
  return Number.isInteger(seq) && seq > 0 ? seq : null;
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
// O dayKey vem da data @db.Date via `.slice(0,10)` (sem conversao de fuso — casa com
// o toDayKey/BRT do dashboard-calendar). `label` = recolhido "pagamento · nº ·
// comprador" (DSB-D10: prefixo do tipo). `state` = previsto/atrasado (cor do chip).
//
// RC-D62/D64: o ramo 'paid' morreu junto com `paidAt` — o calendario e AGENDA, nao
// historico, e so carrega contrato EMITIDO. Mas o ATRASO ficou: `paymentDate` e a
// unica data que uma acao (finalizar) resolve, entao e o unico vermelho do app. Ele
// acende a partir do dia SEGUINTE ao vencimento (vence-hoje ainda e 'previsto').
export function buildPaymentEvent(row, todayKey) {
  const iso = toIsoString(row.paymentDate);
  const dayKey = iso ? iso.slice(0, 10) : null;
  const buyerName = row.buyerSnapshot?.displayName ?? null;
  const overdue = Boolean(todayKey && dayKey && dayKey < todayKey);
  const typeKey = overdue ? 'contract_payment_overdue' : 'contract_payment_due';
  const state = overdue ? 'atrasado' : 'previsto';
  return {
    dayKey,
    event: {
      id: row.id,
      contractId: row.id,
      typeKey,
      state,
      // DSB-D10: prefixo com o nome do tipo — a cor do chip carrega só o estado
      // (previsto/atrasado), então o tipo precisa estar no texto pra diferenciar os
      // eventos (o faturamento tambem leva o prefixo).
      label: buyerName
        ? `pagamento · ${row.contractNumber} · ${buyerName}`
        : `pagamento · ${row.contractNumber}`,
      contractNumber: row.contractNumber,
      buyerName,
      status: row.status,
    },
  };
}

// Agrupa os eventos de pagamento por dayKey ('YYYY-MM-DD') -> Record<dayKey,
// evento[]> (o formato que a prop `events` do EventsCalendarCard consome). Linhas
// sem data valida sao descartadas (defensivo — no filtro as datas sao NOT NULL).
export function bucketPaymentEvents(dueRows, todayKey) {
  const byDay = {};
  for (const row of dueRows) {
    const { dayKey, event } = buildPaymentEvent(row, todayKey);
    if (!dayKey) continue;
    // DSB-D18: o card mostra o mes inteiro (sab/dom incluidos) — o evento
    // agrupa no dia REAL. (O roll de fim de semana do DSB-D7 saiu.)
    if (byDay[dayKey]) byDay[dayKey].push(event);
    else byDay[dayKey] = [event];
  }
  return byDay;
}

// 🪦 RC-D65 (2026-07-28): o evento de EMBARQUE do calendario saiu inteiro
// (`SHIPMENT_EVENT_SELECT`, `buildShipmentEvent`, `bucketShipmentEvents`). Sem
// registro de embarque nao ha o que lembrar nem o que dar por feito.

// ------------------------------------------------------------
// Evento de Faturamento no dashboard (DSB-D11)
// ------------------------------------------------------------

export const INVOICE_EVENT_SELECT = Object.freeze({
  id: true,
  contractNumber: true,
  status: true,
  invoiceDate: true,
  buyerSnapshot: true,
});

// Projeta 1 contrato num evento de faturamento do calendario (1→1, molde do
// pagamento). Dia previsto = invoiceDate; label recolhido = "faturamento · nº ·
// comprador"; id NAMESPACED ('invoice:') pra nao colidir com o pagamento do mesmo dia
// (o card usa key=id).
//
// RC-D64: o faturamento e LEMBRETE PURO — nao tem 'done' (nao ha mais data real) e
// tambem NAO tem 'atrasado'. Atraso so faz sentido onde existe acao que o resolva, e
// nada resolve "faturar": passou o dia, o aviso simplesmente se recolhe. Antes, um
// contrato antigo ficaria vermelho para sempre — que e exatamente o que esta reforma
// existe pra evitar.
export function buildInvoiceEvent(row) {
  const iso = toIsoString(row.invoiceDate);
  const dayKey = iso ? iso.slice(0, 10) : null;
  const buyerName = row.buyerSnapshot?.displayName ?? null;
  const label = buyerName
    ? `faturamento · ${row.contractNumber} · ${buyerName}`
    : `faturamento · ${row.contractNumber}`;
  return {
    dayKey,
    event: {
      id: `invoice:${row.id}`,
      contractId: row.id,
      typeKey: 'contract_invoice',
      state: 'previsto',
      label,
      contractNumber: row.contractNumber,
      buyerName,
      status: row.status,
    },
  };
}

// Agrupa por dayKey -> Record<dayKey, evento[]> (1→1, molde do bucketPaymentEvents).
export function bucketInvoiceEvents(scheduledRows) {
  const byDay = {};
  for (const row of scheduledRows) {
    const { dayKey, event } = buildInvoiceEvent(row);
    if (!dayKey) continue;
    // DSB-D18: agrupa no dia REAL (ver bucketPaymentEvents).
    if (byDay[dayKey]) byDay[dayKey].push(event);
    else byDay[dayKey] = [event];
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

// Teto de itens do card de "Avisos" do dashboard (top N por urgencia —
// invoice_date ASC NULLS LAST). Pendencias de aprovacao raramente passam disso.
export const DASHBOARD_AVISOS_LIMIT = 50;

// AP31/DSB-D19: projeta 1 contrato num item do card de "Avisos" do dashboard (1º
// tipo = 'aprovacao_a_enviar'). `row` vem do $queryRaw (buyerName ja extraido do
// buyer_snapshot). `dueInDays` = dias de hoje (BRT) ate a data de faturamento; `null`
// quando "A definir" (D144, invoice_date NULL). O texto de prazo ("vence esta semana/
// este mes/em N dias") e derivado no front (formatAvisoDue). id NAMESPACED ('aviso:'+id)
// — o card e extensivel por `kind`.
export function buildDashboardAvisoItem(row, todayKey) {
  const invoiceIso = toIsoString(row.invoiceDate);
  const invoiceKey = invoiceIso ? invoiceIso.slice(0, 10) : null;
  const dueInDays = invoiceKey
    ? Math.round(
        (Date.parse(`${invoiceKey}T00:00:00.000Z`) - Date.parse(`${todayKey}T00:00:00.000Z`)) /
          86_400_000
      )
    : null;
  return {
    id: `aviso:${row.id}`,
    kind: 'aprovacao_a_enviar',
    contractId: row.id,
    contractNumber: row.contractNumber,
    buyerName: row.buyerName ?? null,
    dueInDays,
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

// Data PLANEJADA da etapa 2 (faturamento/pagamento). D144: em contrato FUTURO
// (allowOpen=true) o null EXPLICITO e a escolha ativa "A definir" — passa como
// null; undefined segue 422 (campo obrigatorio). Data presente valida formato +
// dia util como sempre.
function normalizePlannedDate(value, fieldName, allowOpen) {
  if (value === null && allowOpen) {
    return null;
  }
  return assertBusinessDate(requireDate(value, fieldName), fieldName);
}

// Datas de ACAO do contrato (faturamento/pagamento/embarque, planejadas ou reais)
// nao podem cair em fim de semana (DSB-D7) — o negocio nao agenda nesses dias e o
// card de Eventos mostra so seg-sex. A data e @db.Date (meia-noite UTC), entao o dia
// da semana e getUTCDay (0=domingo, 6=sabado), SEM deslocar -3h. NAO vale pra
// contractDate (assinatura), que segue livre. Espelha o formato das guardas de
// data-futura (paySaleContract/confirmShipment).
export function assertBusinessDate(dateObj, fieldName) {
  const dow = dateObj.getUTCDay();
  if (dow === 0 || dow === 6) {
    throw new HttpError(422, `${fieldName} must be a business day (no weekends)`, {
      code: 'WEEKEND_DATE',
      field: fieldName,
    });
  }
  return dateObj;
}

// (DSB-D18) O roll de fim de semana `rollWeekendToWeekday` foi REMOVIDO: o
// calendario do dashboard passou a mostrar o mes inteiro (sab/dom incluidos),
// entao os eventos agrupam no dia REAL. A regra de contrato que RECUSA datas
// de acao em fim de semana (assertBusinessDate, 422 WEEKEND_DATE — DSB-D7)
// permanece; evento em sab/dom e so legado/borda.

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
// Exportado tambem pro toggle rapido do Detalhes (AP23).
export function normalizeRequiredBoolean(value, fieldName) {
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

export function normalizeApprovalReminderLeadDays(
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

// 🪦 RC-D62 (2026-07-28): `normalizeActionDate` NAO EXISTE MAIS. Ela normalizava a
// data REAL escolhida no dialogo de faturar/pagar/embarcar — as tres acoes morreram, e
// finalizar nao pergunta data nenhuma (RC-D63: no instante em que perguntamos
// "finalizado quando?", voltamos a escrituracao que a reforma tirou).

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

// RC-D89: a resposta de corretagem do washout. OBRIGATORIA e sem padrao — quem
// cancela responde, o servidor nao adivinha. Aceita so booleano de verdade: um
// `undefined` que virasse `false` seria um "nao cobrar" que ninguem escolheu.
export function normalizeWashoutBillable(value, fieldName = 'washoutBillable') {
  if (typeof value !== 'boolean') {
    throw new HttpError(422, `${fieldName} is required`, {
      code: 'SALE_CONTRACT_WASHOUT_BILLABLE_REQUIRED',
      field: fieldName,
    });
  }
  return value;
}

// Exportado desde a RC-D99: a cascata do Nº compra normaliza pelo MESMO
// validador do emit (normalizeEtapa2Input), senao os dois caminhos de escrita da
// coluna divergiriam no primeiro ajuste de limite.
export function optionalText(value, fieldName, maxLength) {
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

export function normalizeEtapa2Input(input, { allowOpenDates = false } = {}) {
  const agio = normalizeAgio(input ?? {});
  const requiresApproval = normalizeRequiredBoolean(input?.requiresApproval, 'requiresApproval');
  // datas (obrigatorias) — DSB-D7: faturamento/pagamento recusam fim de semana;
  // D144: no FUTURO (allowOpenDates) cada uma pode vir null explicito ("A definir");
  // D142: o cronograma planejado precisa ser coerente (pagamento >= faturamento) —
  // so comparavel quando as DUAS existem.
  const invoiceDate = normalizePlannedDate(input?.invoiceDate, 'invoiceDate', allowOpenDates);
  const paymentDate = normalizePlannedDate(input?.paymentDate, 'paymentDate', allowOpenDates);
  if (invoiceDate && paymentDate && paymentDate.getTime() < invoiceDate.getTime()) {
    throw new HttpError(422, 'paymentDate must be on or after invoiceDate', {
      code: 'VALIDATION_ERROR',
      field: 'paymentDate',
    });
  }
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
    invoiceDate,
    paymentDate,
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

function clientDisplayName(client) {
  if (!client) {
    return null;
  }
  return client.personType === 'PF'
    ? (client.fullName ?? null)
    : (client.legalName ?? client.tradeName ?? null);
}

function buildUnitSnapshot(unit) {
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

// account = ClientBankAccount (banco em texto livre, D141). Snapshots de
// contratos pre-D141 carregam bankId/compeCode congelados; os novos, nao.
export function buildBankSnapshot(account) {
  if (!account) {
    return null;
  }
  return {
    accountId: account.id,
    bankName: account.bankName ?? null,
    agency: account.agency ?? null,
    accountNumber: account.accountNumber ?? null,
    holderName: account.holderName ?? null,
    holderTaxId: account.holderTaxId ?? null,
    pixKey: account.pixKey ?? null,
  };
}

// ============================================================
// Aprovacao do contrato (Fase I — D112-D119). Funcoes PURAS do handler de
// prefill do backend-api. O prefill monta a etiqueta a partir do contrato
// (campos cortados nos limites fisicos + lotes quebrados do Lote de origem,
// D115/D116) — consumido pela worklist de Aprovacoes.
// ============================================================

// Limites FISICOS da etiqueta (espelham os maxChars do ApprovalLabelModal e a
// grade de lotes do print agent). Nao confundir com os caps genericos do
// normalizeCustomLabelLines (label 40 / value 80), que valem por cima.
const APPROVAL_COMPRA_MAX_CHARS = 26;
const APPROVAL_NAME_MAX_CHARS = 52;
const APPROVAL_LOT_MAX_CHARS = 16;
// Teto de EXIBICAO da etiqueta: a grade 4x2 do print agent comporta 8 celulas.
// Havendo mais de 8 lotes de origem, mostra 7 + "+" (o sistema guarda TODOS —
// declaredOriginLot e ilimitado; o cap aqui e so visual).
const APPROVAL_LOT_DISPLAY_MAX = 8;

// Situacoes que aceitam ENVIO de aprovacao (AP21/E4): so EMITIDO. RC-D62: hoje isso
// le como "so contrato em andamento" — enviar aprovacao de contrato ja finalizado ou
// cancelado nao faz sentido. Quem quiser reenviar reabre antes (RC-D63).
export const APPROVAL_ELIGIBLE_STATUSES = Object.freeze(['EMITIDO']);

// Quebra do "Lote de origem" (Sample.declaredOriginLot) nos codigos discretos
// da etiqueta: separadores = espaco, virgula e ponto-e-virgula (sequencias
// colapsam; pedacos vazios caem). O TRACO "-" NAO separa mais (faz parte do
// codigo, ex.: "PA-01" — antes ele quebrava em "PA" + "01"); a barra "/" tambem
// nao. Pedaco >16 chars corta em 16. Exibe no MAXIMO 8 codigos; havendo mais,
// mostra os 7 primeiros + "+" (a grade 4x2 do print agent tem 8 celulas). O
// armazenamento guarda TODOS os lotes — este cap e so de EXIBICAO.
export function splitOriginLotForLabel(text) {
  const pieces = String(text ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((piece) => piece.slice(0, APPROVAL_LOT_MAX_CHARS));
  if (pieces.length > APPROVAL_LOT_DISPLAY_MAX) {
    return [...pieces.slice(0, APPROVAL_LOT_DISPLAY_MAX - 1), '+'];
  }
  return pieces;
}

// Motivos de TRAVA do campo "Lotes de origem" no modal da etiqueta (RC-D100),
// do mais especifico para o mais geral. Os dois do meio existem porque editar
// a origem de uma liga FIXA a derivacao dela pra sempre (blendOriginLotPinned)
// e editar a de um componente PROPAGA pras ligas ancestrais — dois efeitos
// permanentes demais pra sairem de uma tela de impressao. Quem precisa deles
// edita pelo detalhe do lote, que tem o fluxo de confirmacao.
export const APPROVAL_ORIGIN_LOT_LOCK_REASONS = Object.freeze([
  'NO_SAMPLE',
  'BLEND',
  'BLEND_COMPONENT',
  'SAMPLE_STATUS',
]);

// Prefill da etiqueta a partir do contrato (D115): 5 campos + lotes, cortados
// nos limites fisicos. Armazem = SEMPRE o do VENDEDOR (decisao S76); snapshot
// ausente -> campo vazio.
//
// RC-D98: so `compra` e o lote de origem sao EDITAVEIS no modal — os outros 4
// viram leitura. RC-D99/D100: os dois editaveis gravam de volta (contrato e
// cadastro do lote), por isso o prefill precisa carregar o que a escrita exige:
// `contractVersion` e o bloco `originLot`.
//
// 🔴 `originLotText` e o texto CRU e INTEIRO; `lots` e o recorte do PAPEL (16
// chars por codigo, 7 + "+" acima de 8). O modal edita sobre o texto — editar
// sobre `lots` e salvar apagaria em silencio os lotes que o "+" representa.
export function buildApprovalPrefill({
  purchaseNumber,
  contractNumber,
  sellerSnapshot,
  sellerWarehouseSnapshot,
  quantitySacks,
  originLotText,
  contractVersion,
  originLotLockReason = 'NO_SAMPLE',
  sampleId = null,
  sampleVersion = null,
}) {
  const originText =
    typeof originLotText === 'string' && originLotText.trim().length > 0
      ? originLotText.trim()
      : null;
  const lockReason = APPROVAL_ORIGIN_LOT_LOCK_REASONS.includes(originLotLockReason)
    ? originLotLockReason
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
    contractVersion: Number.isInteger(contractVersion) ? contractVersion : 0,
    originLot: {
      editable: lockReason === null,
      lockReason,
      // Alvo da cascata: nulos quando travado (o modal nao tem o que escrever).
      sampleId: lockReason === null ? (sampleId ?? null) : null,
      sampleVersion: lockReason === null && Number.isInteger(sampleVersion) ? sampleVersion : null,
    },
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
  now = new Date(),
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

  // RC-D105/D106: cada espelho entregue carrega o proprio documento (o snapshot), e e
  // daqui que a PRATELEIRA do modal de Detalhes se alimenta — sem endpoint novo, os
  // mesmos itens servem o historico (todos) e a estante (so os disponiveis).
  //   available  = o snapshot existe E a retencao nao venceu;
  //   superseded = ha um espelho MAIS NOVO do mesmo lado (derivado da ordem, jamais
  //                persistido — mesma escolha da coluna "Situacao");
  //   stale      = o contrato mudou DEPOIS deste documento (compara a version
  //                congelada com a atual). E o aviso que faltava: sem ele o operador
  //                reabre um espelho antigo sem saber que os numeros mudaram.
  const espelhoExpiresAt = espelhoSnapshotExpiresAt(contract, statusLogs);
  const espelhoExpired = espelhoExpiresAt !== null && espelhoExpiresAt.getTime() < now.getTime();
  const newestAvailableBySide = new Map();
  for (const row of espelhoLogs) {
    if (row.snapshot && !espelhoExpired) newestAvailableBySide.set(row.side, row.id);
  }
  for (const row of espelhoLogs) {
    const snapshot = row.snapshot ?? null;
    const available = Boolean(snapshot) && !espelhoExpired;
    items.push({
      id: `espelho-${row.id}`,
      kind: 'ESPELHO',
      at: toIsoString(row.createdAt),
      actorUserId: row.actorUserId ?? null,
      actorName: timelineActorName(usersById, row.actorUserId),
      side: row.side,
      logId: row.id,
      available,
      commission: available ? (decimalToNumber(snapshot.commission) ?? null) : null,
      superseded: available && newestAvailableBySide.get(row.side) !== row.id,
      stale:
        available &&
        Number.isInteger(snapshot.contractVersion) &&
        Number.isInteger(contract?.version) &&
        snapshot.contractVersion !== contract.version,
      expiresAt: available ? toIsoString(espelhoExpiresAt) : null,
    });
  }

  // Marco LEGADO (anterior a sale_contract_status_log — D123): o contrato tem a
  // data mas nenhuma linha auditada correspondente -> entra uma linha so-com-data
  // (sem autor). RC-D62: sobrou so o washout — `invoicedAt`/`paidAt` deixaram de
  // existir, e com eles as duas sinteses de faturado/pago.
  const hasStatusLog = (status) => statusLogs.some((row) => row.toStatus === status);
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
