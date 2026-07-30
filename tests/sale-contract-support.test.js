import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  APPROVAL_ELIGIBLE_STATUSES,
  assertAgioWithinUnitPrice,
  assertBrokersResolved,
  assertBusinessDate,
  assertEspelhoEligible,
  buildApprovalPrefill,
  buildEspelhoSnapshot,
  contractEndedAt,
  espelhoSnapshotExpiresAt,
  isEspelhoSnapshotAvailable,
  ESPELHO_SNAPSHOT_VERSION,
  snapshotPartyName,
  brtTodayDateOnly,
  brtTodayKey,
  buildContractTimeline,
  buildRecentApprovalSendItem,
  buildBankSnapshot,
  buildPaymentEvent,
  buildInvoiceEvent,
  buildDashboardAvisoItem,
  buildReceivableView,
  bucketPaymentEvents,
  bucketInvoiceEvents,
  buildSaleContractDraftFromSale,
  computeContractMoney,
  contractListGroups,
  contractStateWhere,
  CONTRACT_DATE_GROUPS,
  CONTRACT_LIST_STATES,
  CONTRACT_MAX_GROUP,
  decodeGroupCursor,
  deriveContractAgenda,
  encodeGroupCursor,
  finalizeBlockReason,
  groupKeysetWhere,
  computeContractMoneyWithAgio,
  formatContractNumber,
  normalizeContractStateFilter,
  isFutureContract,
  isSpotContract,
  isWashoutNotBillable,
  normalizeBrokeragePct,
  normalizeBrokerIds,
  normalizeContractLookupInput,
  normalizeContractPeriodFilter,
  normalizeEnumFilterList,
  normalizeEtapa2Input,
  normalizeUuidFilter,
  normalizeRequiredAgio,
  normalizeUnitPrice,
  normalizeWashoutReason,
  splitOriginLotForLabel,
  toSaleContractView,
} from '../src/sale-contracts/sale-contract-support.js';

const UUID_1 = '00000000-0000-4000-8000-000000000001';
const UUID_2 = '00000000-0000-4000-8000-000000000002';
const UUID_3 = '00000000-0000-4000-8000-000000000003';
const UUID_4 = '00000000-0000-4000-8000-000000000004';

test('assertAgioWithinUnitPrice: DESAGIO >= unitPrice is rejected; AGIO/valid/no-agio pass', () => {
  // Deságio >= preço/saca invertia o total (negativo) — o guard barra.
  assert.throws(() => assertAgioWithinUnitPrice(800, 'DESAGIO', 800), /less than the unit price/);
  assert.throws(() => assertAgioWithinUnitPrice(800, 'DESAGIO', 900), /less than the unit price/);
  // Deságio abaixo do preço, ágio (qualquer valor) e "sem ágio" passam.
  assert.doesNotThrow(() => assertAgioWithinUnitPrice(800, 'DESAGIO', 799.99));
  assert.doesNotThrow(() => assertAgioWithinUnitPrice(800, 'AGIO', 5000));
  assert.doesNotThrow(() => assertAgioWithinUnitPrice(800, null, null));
});

function validEtapa2() {
  return {
    expectedVersion: 0,
    sellerBankAccountId: UUID_1,
    paymentFormId: UUID_2,
    modalityId: UUID_3,
    packagingId: UUID_4,
    invoiceDate: '2026-07-10',
    paymentDate: '2026-07-20',
    requiresApproval: false,
  };
}

const BROKER_A = '00000000-0000-4000-8000-00000000000a';
const BROKER_B = '00000000-0000-4000-8000-00000000000b';

test('normalizeUnitPrice aceita number e string e exige > 0', () => {
  assert.equal(normalizeUnitPrice(1234.56), 1234.56);
  assert.equal(normalizeUnitPrice('1234,56'), 1234.56);
  assert.equal(normalizeUnitPrice('1234.5'), 1234.5);
  // arredonda a 2 casas
  assert.equal(normalizeUnitPrice(10.005), 10.01);
});

test('normalizeUnitPrice rejeita zero, negativo e lixo', () => {
  assert.throws(() => normalizeUnitPrice(0), /greater than zero/);
  assert.throws(() => normalizeUnitPrice(-5), /greater than zero/);
  assert.throws(() => normalizeUnitPrice('abc'), /valid number/);
  assert.throws(() => normalizeUnitPrice(undefined), /required/);
});

test('normalizeBrokeragePct default 0, faixa 0-100', () => {
  assert.equal(normalizeBrokeragePct(undefined), 0);
  assert.equal(normalizeBrokeragePct(null), 0);
  assert.equal(normalizeBrokeragePct(''), 0);
  assert.equal(normalizeBrokeragePct('2,5'), 2.5);
  assert.equal(normalizeBrokeragePct(100), 100);
  assert.throws(() => normalizeBrokeragePct(101), /between 0 and 100/);
  assert.throws(() => normalizeBrokeragePct(-1), /between 0 and 100/);
});

test('normalizeBrokerIds exige >= 1, dedup e UUID valido', () => {
  assert.deepEqual(normalizeBrokerIds([BROKER_A]), [BROKER_A]);
  assert.deepEqual(normalizeBrokerIds([BROKER_A, BROKER_A, BROKER_B]), [BROKER_A, BROKER_B]);
  assert.throws(() => normalizeBrokerIds([]), /at least one broker/);
  assert.throws(() => normalizeBrokerIds('nope'), /at least one broker/);
  assert.throws(() => normalizeBrokerIds(['not-a-uuid']), /list of broker ids/);
});

test('computeContractMoney: total e corretagens com 2 casas, sem drift', () => {
  const money = computeContractMoney({
    unitPrice: 1234.56,
    quantitySacks: 3,
    sellerPct: 2,
    buyerPct: 1.5,
  });
  assert.equal(money.totalValue, '3703.68');
  assert.equal(money.sellerBrokerageValue, '74.07');
  assert.equal(money.buyerBrokerageValue, '55.56');
});

test('computeContractMoney: corretagem 0 => 0.00', () => {
  const money = computeContractMoney({
    unitPrice: 100,
    quantitySacks: 10,
    sellerPct: 0,
    buyerPct: 0,
  });
  assert.equal(money.totalValue, '1000.00');
  assert.equal(money.sellerBrokerageValue, '0.00');
  assert.equal(money.buyerBrokerageValue, '0.00');
});

// RC-D108: o meio-centavo. Todos os fixtures acima sao redondos (preco inteiro ou
// pct inteiro), e foi exatamente por isso que o bug passou: o round2 antigo usava
// Number.EPSILON (absoluto, 2.22e-16) contra um ulp de ~1e-12 na faixa de valores
// do negocio, e o meio-centavo caia para BAIXO. Cada caso abaixo tem produto exato
// terminando em ,xx5 — o round2 antigo devolvia UM CENTAVO MENOS em todos.
test('computeContractMoney: meio-centavo arredonda para CIMA (RC-D108)', () => {
  const casos = [
    // [preco/sc, sacas, pct, total esperado, comissao esperada, o que o bug dava]
    [700.01, 1000, 2.25, '700010.00', '15750.23', '15750.22'],
    [700.01, 100, 1.5, '70001.00', '1050.02', '1050.01'],
    [700.02, 150, 1.5, '105003.00', '1575.05', '1575.04'],
    [100.03, 1000, 2.25, '100030.00', '2250.68', '2250.67'],
  ];
  for (const [unitPrice, quantitySacks, sellerPct, total, comissao, bug] of casos) {
    const money = computeContractMoney({ unitPrice, quantitySacks, sellerPct, buyerPct: 0 });
    assert.equal(money.totalValue, total, `total de ${unitPrice} x ${quantitySacks}`);
    assert.equal(
      money.sellerBrokerageValue,
      comissao,
      `${unitPrice} x ${quantitySacks} x ${sellerPct}% deve dar ${comissao}, nao ${bug}`
    );
    assert.notEqual(money.sellerBrokerageValue, bug);
  }
});

test('computeContractMoneyWithAgio: meio-centavo com ágio também sobe (RC-D108)', () => {
  // efetivo 700,01 = 650,00 + 50,01; x 1000 = 700.010,00; x 2,25% = 15.750,225
  const money = computeContractMoneyWithAgio({
    unitPrice: 650,
    quantitySacks: 1000,
    sellerPct: 2.25,
    buyerPct: 1.5,
    agioType: 'AGIO',
    agioValue: 50.01,
  });
  assert.equal(money.totalValue, '700010.00');
  assert.equal(money.sellerBrokerageValue, '15750.23');
  assert.equal(money.buyerBrokerageValue, '10500.15');
});

test('formatContractNumber: NNNN/AA com zero-padding', () => {
  assert.equal(formatContractNumber(1, 2026), '0001/26');
  assert.equal(formatContractNumber(42, 2026), '0042/26');
  assert.equal(formatContractNumber(9999, 2027), '9999/27');
  // cresce alem de 4 digitos
  assert.equal(formatContractNumber(12345, 2026), '12345/26');
});

test('assertBrokersResolved: ok quando todos existem e ativos', () => {
  const brokers = [
    { id: BROKER_A, name: 'A', status: 'ACTIVE' },
    { id: BROKER_B, name: 'B', status: 'ACTIVE' },
  ];
  assert.doesNotThrow(() => assertBrokersResolved(brokers, [BROKER_A, BROKER_B]));
});

test('assertBrokersResolved: 422 quando falta ou inativo', () => {
  assert.throws(
    () =>
      assertBrokersResolved([{ id: BROKER_A, name: 'A', status: 'ACTIVE' }], [BROKER_A, BROKER_B]),
    /does not exist/
  );
  assert.throws(
    () => assertBrokersResolved([{ id: BROKER_A, name: 'A', status: 'INACTIVE' }], [BROKER_A]),
    /inactive/
  );
});

test('buildSaleContractDraftFromSale: monta o rascunho EMITIDO', () => {
  const sample = {
    id: 'sample-1',
    ownerClientId: 'seller-1',
    ownerClient: {
      id: 'seller-1',
      personType: 'PJ',
      legalName: 'Fazenda X',
      cnpj: '12345678000199',
    },
  };
  const buyerBinding = {
    buyerClientId: 'buyer-1',
    buyerClient: { id: 'buyer-1', personType: 'PJ', legalName: 'Comprador Y' },
  };
  const draft = buildSaleContractDraftFromSale({
    sample,
    buyerBinding,
    unitPrice: 100,
    sellerPct: 2,
    buyerPct: 0,
    quantitySacks: 10,
    contractDate: '2026-06-26',
  });
  assert.equal(draft.type, 'MERCADO_A_VISTA');
  assert.equal(draft.status, 'EMITIDO');
  assert.equal(draft.sampleId, 'sample-1');
  assert.equal(draft.sellerClientId, 'seller-1');
  assert.equal(draft.buyerClientId, 'buyer-1');
  assert.equal(draft.quantitySacks, 10);
  assert.equal(draft.unitPrice, '100.00');
  assert.equal(draft.totalValue, '1000.00');
  assert.equal(draft.sellerBrokeragePct, '2.00');
  assert.equal(draft.sellerBrokerageValue, '20.00');
  assert.equal(draft.buyerBrokeragePct, '0.00');
  assert.equal(draft.version, 0);
  assert.equal(draft.sellerSnapshot.legalName, 'Fazenda X');
  assert.equal(draft.buyerSnapshot.legalName, 'Comprador Y');
  assert.ok(draft.contractDate instanceof Date);
});

test('toSaleContractView: Decimals viram number, datas viram ISO', () => {
  const view = toSaleContractView({
    id: 'c1',
    type: 'MERCADO_A_VISTA',
    contractSeq: 1,
    contractNumber: '0001/26',
    status: 'EMITIDO',
    contractDate: new Date('2026-06-26T00:00:00.000Z'),
    quantitySacks: 10,
    unitPrice: { toNumber: () => 100 },
    totalValue: { toNumber: () => 1000 },
    sellerBrokeragePct: { toNumber: () => 2 },
    sellerBrokerageValue: { toNumber: () => 20 },
    buyerBrokeragePct: { toNumber: () => 0 },
    buyerBrokerageValue: { toNumber: () => 0 },
    weightKg: null,
    agioDesagioValue: null,
    version: 0,
    createdAt: new Date('2026-06-26T12:00:00.000Z'),
  });
  assert.equal(view.unitPrice, 100);
  assert.equal(view.totalValue, 1000);
  assert.equal(view.sellerBrokeragePct, 2);
  assert.equal(view.weightKg, null);
  assert.equal(view.contractDate, '2026-06-26T00:00:00.000Z');
  assert.equal(view.createdAt, '2026-06-26T12:00:00.000Z');
});

test('computeContractMoneyWithAgio: ágio soma, deságio subtrai (por saca)', () => {
  const agio = computeContractMoneyWithAgio({
    unitPrice: 100,
    quantitySacks: 10,
    sellerPct: 2,
    buyerPct: 0,
    agioType: 'AGIO',
    agioValue: 5,
  });
  // efetivo 105 x 10 = 1050; corretagem vend 2% = 21
  assert.equal(agio.totalValue, '1050.00');
  assert.equal(agio.sellerBrokerageValue, '21.00');

  const desagio = computeContractMoneyWithAgio({
    unitPrice: 100,
    quantitySacks: 10,
    sellerPct: 0,
    buyerPct: 0,
    agioType: 'DESAGIO',
    agioValue: 5,
  });
  assert.equal(desagio.totalValue, '950.00');

  // sem ágio = igual a computeContractMoney
  const none = computeContractMoneyWithAgio({
    unitPrice: 100,
    quantitySacks: 10,
    sellerPct: 0,
    buyerPct: 0,
  });
  assert.equal(none.totalValue, '1000.00');
  assert.equal(
    computeContractMoney({ unitPrice: 100, quantitySacks: 10, sellerPct: 0, buyerPct: 0 })
      .totalValue,
    '1000.00'
  );
});

test('normalizeEtapa2Input: válido passa, datas viram Date, opcionais null', () => {
  const out = normalizeEtapa2Input(validEtapa2());
  assert.equal(out.sellerBankAccountId, UUID_1);
  assert.equal(out.paymentFormId, UUID_2);
  assert.ok(out.invoiceDate instanceof Date);
  assert.ok(out.paymentDate instanceof Date);
  assert.equal(out.purchaseNumber, null);
  assert.equal(out.weightKg, null);
  assert.equal(out.agioDesagioType, null);
  assert.equal(out.agioDesagioValue, null);
  assert.equal(out.requiresApproval, false);
  assert.equal(out.approvalReminderLeadDays, null);
});

test('normalizeEtapa2Input: obrigatórios faltando lançam 422', () => {
  assert.throws(
    () => normalizeEtapa2Input({ ...validEtapa2(), sellerBankAccountId: undefined }),
    /sellerBankAccountId/
  );
  assert.throws(
    () => normalizeEtapa2Input({ ...validEtapa2(), paymentFormId: undefined }),
    /paymentFormId/
  );
  assert.throws(
    () => normalizeEtapa2Input({ ...validEtapa2(), invoiceDate: undefined }),
    /invoiceDate/
  );
  assert.throws(
    () => normalizeEtapa2Input({ ...validEtapa2(), invoiceDate: '10/07/2026' }),
    /invoiceDate/
  );
});

test('normalizeEtapa2Input: paymentDate >= invoiceDate (D142)', () => {
  // pagamento antes do faturamento planejado -> 422 no campo paymentDate
  assert.throws(
    () =>
      normalizeEtapa2Input({
        ...validEtapa2(),
        invoiceDate: '2026-07-20',
        paymentDate: '2026-07-10',
      }),
    (error) => error.status === 422 && error.details?.field === 'paymentDate'
  );
  // mesmo dia e valido
  const sameDay = normalizeEtapa2Input({
    ...validEtapa2(),
    invoiceDate: '2026-07-10',
    paymentDate: '2026-07-10',
  });
  assert.equal(sameDay.paymentDate.getTime(), sameDay.invoiceDate.getTime());
});

test('normalizeEtapa2Input: datas "À definir" (D144) — null explícito só com allowOpenDates', () => {
  // Default (à vista): null segue 422 no campo.
  assert.throws(
    () => normalizeEtapa2Input({ ...validEtapa2(), invoiceDate: null }),
    (error) => error.status === 422 && error.details?.field === 'invoiceDate'
  );
  assert.throws(
    () => normalizeEtapa2Input({ ...validEtapa2(), paymentDate: null }),
    (error) => error.status === 422 && error.details?.field === 'paymentDate'
  );

  // FUTURO (flag): null explícito passa — cada data independente, e ambas.
  const openInvoice = normalizeEtapa2Input(
    { ...validEtapa2(), invoiceDate: null },
    { allowOpenDates: true }
  );
  assert.equal(openInvoice.invoiceDate, null);
  assert.ok(openInvoice.paymentDate instanceof Date);
  const openBoth = normalizeEtapa2Input(
    { ...validEtapa2(), invoiceDate: null, paymentDate: null },
    { allowOpenDates: true }
  );
  assert.equal(openBoth.invoiceDate, null);
  assert.equal(openBoth.paymentDate, null);

  // undefined NÃO é "À definir" (campo obrigatório) — 422 mesmo com a flag.
  assert.throws(
    () =>
      normalizeEtapa2Input({ ...validEtapa2(), invoiceDate: undefined }, { allowOpenDates: true }),
    (error) => error.status === 422 && error.details?.field === 'invoiceDate'
  );

  // Fim de semana continua barrado quando a data está presente sob a flag.
  assert.throws(
    () =>
      normalizeEtapa2Input(
        { ...validEtapa2(), invoiceDate: null, paymentDate: '2026-07-12' },
        { allowOpenDates: true }
      ),
    (error) => error.details?.code === 'WEEKEND_DATE' && error.details?.field === 'paymentDate'
  );

  // D142 é pulada com uma das datas "À definir"...
  const skewed = normalizeEtapa2Input(
    { ...validEtapa2(), invoiceDate: null, paymentDate: '2026-07-10' },
    { allowOpenDates: true }
  );
  assert.equal(skewed.invoiceDate, null);
  // ...mas segue ativa com as duas presentes.
  assert.throws(
    () =>
      normalizeEtapa2Input(
        { ...validEtapa2(), invoiceDate: '2026-07-20', paymentDate: '2026-07-10' },
        { allowOpenDates: true }
      ),
    (error) => error.status === 422 && error.details?.field === 'paymentDate'
  );
});

test('normalizeEtapa2Input: ágio exige valor > 0 e tipo válido', () => {
  const out = normalizeEtapa2Input({
    ...validEtapa2(),
    agioDesagioType: 'agio',
    agioDesagioValue: '3,5',
  });
  assert.equal(out.agioDesagioType, 'AGIO');
  assert.equal(out.agioDesagioValue, 3.5);
  assert.throws(
    () => normalizeEtapa2Input({ ...validEtapa2(), agioDesagioType: 'X', agioDesagioValue: 1 }),
    /AGIO or DESAGIO/
  );
  assert.throws(
    () => normalizeEtapa2Input({ ...validEtapa2(), agioDesagioType: 'AGIO', agioDesagioValue: 0 }),
    /greater than zero/
  );
});

test('normalizeEtapa2Input: aprovação obrigatória + lembrete 1..365 (default 30)', () => {
  // AP3: escolher é obrigatório (booleano).
  assert.throws(
    () => normalizeEtapa2Input({ ...validEtapa2(), requiresApproval: undefined }),
    /requiresApproval/
  );
  // "Não": o lembrete é ignorado e gravado null (mesmo que venha valor).
  const nao = normalizeEtapa2Input({
    ...validEtapa2(),
    requiresApproval: false,
    approvalReminderLeadDays: 45,
  });
  assert.equal(nao.requiresApproval, false);
  assert.equal(nao.approvalReminderLeadDays, null);
  // "Sim" sem valor: default 30.
  const simDefault = normalizeEtapa2Input({ ...validEtapa2(), requiresApproval: true });
  assert.equal(simDefault.requiresApproval, true);
  assert.equal(simDefault.approvalReminderLeadDays, 30);
  // "Sim" com valor válido no intervalo.
  const sim = normalizeEtapa2Input({
    ...validEtapa2(),
    requiresApproval: true,
    approvalReminderLeadDays: 45,
  });
  assert.equal(sim.approvalReminderLeadDays, 45);
  // Fora de 1..365 → 422.
  assert.throws(
    () =>
      normalizeEtapa2Input({
        ...validEtapa2(),
        requiresApproval: true,
        approvalReminderLeadDays: 0,
      }),
    /between 1 and 365/
  );
  assert.throws(
    () =>
      normalizeEtapa2Input({
        ...validEtapa2(),
        requiresApproval: true,
        approvalReminderLeadDays: 366,
      }),
    /between 1 and 365/
  );
});

test('normalizeRequiredAgio: aceita o par (case-insensitive) e EXIGE o tipo', () => {
  const out = normalizeRequiredAgio({ agioDesagioType: 'desagio', agioDesagioValue: '2,5' });
  assert.equal(out.agioDesagioType, 'DESAGIO');
  assert.equal(out.agioDesagioValue, 2.5);
  // par vazio (sem tipo) agora é erro — diferente do normalizeAgio (opcional).
  assert.throws(() => normalizeRequiredAgio({}), /agioDesagioType is required/);
  assert.throws(
    () => normalizeRequiredAgio({ agioDesagioType: 'AGIO', agioDesagioValue: 0 }),
    /greater than zero/
  );
});

test('normalizeContractLookupInput: valida a lista e exige o nome (trim)', () => {
  assert.deepEqual(normalizeContractLookupInput({ list: 'paymentForm', name: '  À vista  ' }), {
    list: 'paymentForm',
    name: 'À vista',
  });
  // lista inválida / ausente
  assert.throws(
    () => normalizeContractLookupInput({ list: 'x', name: 'A' }),
    /paymentForm, modality or packaging/
  );
  assert.throws(
    () => normalizeContractLookupInput({ name: 'A' }),
    /paymentForm, modality or packaging/
  );
  // nome vazio (só espaços)
  assert.throws(
    () => normalizeContractLookupInput({ list: 'modality', name: '   ' }),
    /name is required/
  );
});

test('normalizeWashoutReason: exige texto, faz trim e limita a 500', () => {
  assert.equal(normalizeWashoutReason('  Comprador desistiu  '), 'Comprador desistiu');
  assert.throws(() => normalizeWashoutReason(''), /required/);
  assert.throws(() => normalizeWashoutReason('   '), /required/);
  assert.throws(() => normalizeWashoutReason(undefined), /required/);
  assert.throws(() => normalizeWashoutReason('x'.repeat(501)), /at most 500/);
});

function receivableRow(overrides = {}) {
  return {
    id: 'c1',
    version: 3,
    contractNumber: '0007/26',
    contractDate: new Date('2026-06-26T00:00:00.000Z'),
    paymentDate: new Date('2026-07-25T00:00:00.000Z'),
    status: 'EMITIDO',
    totalValue: 10000,
    sellerBrokeragePct: 0.6,
    sellerBrokerageValue: 60,
    buyerBrokeragePct: 0.4,
    buyerBrokerageValue: 40,
    ...overrides,
  };
}

test('buildReceivableView (D136): commissionTotal + corretores (só nomes, SEM cota/rateio)', () => {
  const view = buildReceivableView(receivableRow(), [
    { brokerId: 'b1', brokerNameSnapshot: 'Ana' },
    { brokerId: 'b2', brokerNameSnapshot: 'Bia' },
  ]);
  assert.equal(view.commissionTotal, 100); // 60 + 40
  assert.equal(view.totalValue, 10000);
  assert.equal(view.version, 3); // D137: version na projeção (p/ o Pago no Financeiro)
  assert.equal(view.paymentDate, '2026-07-25T00:00:00.000Z'); // S86: data de pagamento na projecao
  // D136: corretores = atribuicao (id + nome), SEM valor por corretor; sem brokerCount.
  assert.deepEqual(view.brokers, [
    { brokerId: 'b1', name: 'Ana' },
    { brokerId: 'b2', name: 'Bia' },
  ]);
  assert.equal(view.brokerCount, undefined);
  assert.equal(view.brokers[0].share, undefined);
});

test('buildReceivableView (D136): commissionTotal com round2; corretor sem cota', () => {
  const view = buildReceivableView(
    receivableRow({ sellerBrokerageValue: 3.33, buyerBrokerageValue: 3.34 }),
    [{ brokerId: 'b1', brokerNameSnapshot: 'Ana' }]
  );
  assert.equal(view.commissionTotal, 6.67); // 3.33 + 3.34
  assert.deepEqual(view.brokers, [{ brokerId: 'b1', name: 'Ana' }]);
});

// ---------------------------------------------------------------------------
// Aprovacao do contrato (Fase I, D112-D119): quebra do lote de origem (D116),
// prefill da etiqueta (D115) e item reduzido do seletor (D113).

test('splitOriginLotForLabel separa por espaco, virgula e ponto-e-virgula (colapsa sequencias)', () => {
  assert.deepEqual(splitOriginLotForLabel('111 222,333 ; 444'), ['111', '222', '333', '444']);
});

test('splitOriginLotForLabel NAO separa por traco nem barra (compoem o codigo, ex.: PA-01)', () => {
  assert.deepEqual(splitOriginLotForLabel('PA-01 PB-07'), ['PA-01', 'PB-07']);
  assert.deepEqual(splitOriginLotForLabel('AB 12/3-CD'), ['AB', '12/3-CD']);
});

test('splitOriginLotForLabel corta pedaco em 16 chars e exibe no maximo 8 (7 + "+")', () => {
  assert.deepEqual(splitOriginLotForLabel('A'.repeat(20)), ['A'.repeat(16)]);

  // Exatamente 8: mostra os 8.
  const eight = Array.from({ length: 8 }, (_, i) => `L${i + 1}`).join(' ');
  assert.deepEqual(splitOriginLotForLabel(eight), ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8']);

  // Mais de 8: mostra os 7 primeiros + "+".
  const many = Array.from({ length: 20 }, (_, i) => `L${i + 1}`).join(' ');
  const result = splitOriginLotForLabel(many);
  assert.equal(result.length, 8);
  assert.equal(result[0], 'L1');
  assert.equal(result[6], 'L7');
  assert.equal(result[7], '+');
});

test('splitOriginLotForLabel: null/vazio/so separadores viram []', () => {
  assert.deepEqual(splitOriginLotForLabel(null), []);
  assert.deepEqual(splitOriginLotForLabel(''), []);
  assert.deepEqual(splitOriginLotForLabel(' ,; ; '), []);
});

test('buildApprovalPrefill corta compra em 26 e produtor/armazem em 52', () => {
  const prefill = buildApprovalPrefill({
    purchaseNumber: 'C'.repeat(40),
    contractNumber: '0001/26',
    sellerSnapshot: { displayName: 'P'.repeat(60) },
    sellerWarehouseSnapshot: { displayName: 'W'.repeat(60) },
    quantitySacks: 150,
    originLotText: '111 222',
  });
  assert.equal(prefill.fields.compra, 'C'.repeat(26));
  assert.equal(prefill.fields.fechamento, '0001/26');
  assert.equal(prefill.fields.produtor, 'P'.repeat(52));
  assert.equal(prefill.fields.armazem, 'W'.repeat(52));
  assert.equal(prefill.fields.sacas, '150');
  assert.deepEqual(prefill.lots, ['111', '222']);
  assert.equal(prefill.originLotText, '111 222');
});

test('buildApprovalPrefill: compra/armazem ausentes viram vazio; sem originLot lots [] e texto null', () => {
  const prefill = buildApprovalPrefill({
    purchaseNumber: null,
    contractNumber: '0002/26',
    sellerSnapshot: { displayName: 'Vendedor' },
    sellerWarehouseSnapshot: null,
    quantitySacks: 10,
    originLotText: null,
  });
  assert.equal(prefill.fields.compra, '');
  assert.equal(prefill.fields.armazem, '');
  assert.equal(prefill.fields.produtor, 'Vendedor');
  assert.deepEqual(prefill.lots, []);
  assert.equal(prefill.originLotText, null);
});

test('APPROVAL_ELIGIBLE_STATUSES = so EMITIDO (portao AP21)', () => {
  assert.deepEqual([...APPROVAL_ELIGIBLE_STATUSES], ['EMITIDO']);
});

// RC-D99/D100: o prefill carrega o que as duas CASCATAS precisam pra escrever —
// a version do contrato e, pro lote, se a edicao e permitida e onde ela cai.

test('buildApprovalPrefill: lote comum editavel carrega o alvo da cascata (RC-D100)', () => {
  const prefill = buildApprovalPrefill({
    purchaseNumber: 'CP-9',
    contractNumber: '0003/26',
    sellerSnapshot: { displayName: 'Vendedor' },
    sellerWarehouseSnapshot: { displayName: 'Armazem' },
    quantitySacks: 10,
    originLotText: 'PA-01 PA-02',
    contractVersion: 7,
    originLotLockReason: null,
    sampleId: '11111111-1111-4111-8111-111111111111',
    sampleVersion: 3,
  });
  assert.equal(prefill.contractVersion, 7);
  assert.equal(prefill.originLot.editable, true);
  assert.equal(prefill.originLot.lockReason, null);
  assert.equal(prefill.originLot.sampleId, '11111111-1111-4111-8111-111111111111');
  assert.equal(prefill.originLot.sampleVersion, 3);
});

test('buildApprovalPrefill: travado zera o ALVO — o modal nao tem onde escrever', () => {
  // Vale pros 4 motivos; o alvo some junto com a permissao pra que um bug de UI
  // nao consiga montar uma chamada de escrita a partir de um campo travado.
  for (const lockReason of ['NO_SAMPLE', 'BLEND', 'BLEND_COMPONENT', 'SAMPLE_STATUS']) {
    const prefill = buildApprovalPrefill({
      purchaseNumber: null,
      contractNumber: '0004/26',
      sellerSnapshot: { displayName: 'Vendedor' },
      sellerWarehouseSnapshot: null,
      quantitySacks: 10,
      originLotText: 'PA-01',
      contractVersion: 2,
      originLotLockReason: lockReason,
      sampleId: '22222222-2222-4222-8222-222222222222',
      sampleVersion: 5,
    });
    assert.equal(prefill.originLot.editable, false, lockReason);
    assert.equal(prefill.originLot.lockReason, lockReason);
    assert.equal(prefill.originLot.sampleId, null, lockReason);
    assert.equal(prefill.originLot.sampleVersion, null, lockReason);
    // O texto continua vindo: travado ainda EXIBE o que vai pro papel.
    assert.equal(prefill.originLotText, 'PA-01', lockReason);
  }
});

test('buildApprovalPrefill: lots e o RECORTE do papel, originLotText e o dado inteiro', () => {
  // A razao de o modal editar sobre o texto e nao sobre os chips: com 12
  // codigos, `lots` perde 5 deles atras de um "+" que nao e lote nenhum.
  const twelve = Array.from({ length: 12 }, (_, i) => `L${i + 1}`).join(' ');
  const prefill = buildApprovalPrefill({
    purchaseNumber: null,
    contractNumber: '0005/26',
    sellerSnapshot: { displayName: 'Vendedor' },
    sellerWarehouseSnapshot: null,
    quantitySacks: 10,
    originLotText: twelve,
    contractVersion: 1,
    originLotLockReason: null,
    sampleId: '33333333-3333-4333-8333-333333333333',
    sampleVersion: 1,
  });
  assert.deepEqual(prefill.lots, ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', '+']);
  assert.equal(prefill.originLotText, twelve);
  assert.equal(prefill.originLotText.split(/[\s,;]+/).length, 12);
});

// ---------------------------------------------------------------------------
// Fase J (D125): buildContractTimeline — agregacao pura do timeline do modal
// de Detalhes (criacao/edicoes, agio, aprovacoes, marcos, espelhos + legados).

test('buildContractTimeline: ordena DESC e separa criacao (export mais antigo) de edicoes', () => {
  const items = buildContractTimeline({
    contract: {},
    exports: [
      { id: 'e2', generatedAt: '2026-07-02T10:00:00Z', generatedByUserId: 'u1' },
      { id: 'e1', generatedAt: '2026-07-01T10:00:00Z', generatedByUserId: 'u1' },
    ],
    usersById: { u1: { id: 'u1', fullName: 'Flavio O', username: 'flavio' } },
  });
  assert.deepEqual(
    items.map((item) => item.kind),
    ['EDICAO', 'CRIACAO']
  );
  assert.equal(items[1].id, 'export-e1');
  assert.equal(items[0].actorName, 'Flavio O');
});

// RC-D63: a marca terminal VAI e VOLTA — o log acumula as duas linhas, e e por isso
// que "quem finalizou e quando" nao virou coluna do contrato (na 2a passada, coluna
// seria mentira).
test('buildContractTimeline: finalizar->reabrir->finalizar acumula 3 marcos auditados', () => {
  const items = buildContractTimeline({
    contract: { washoutAt: null, washoutReason: null },
    statusLogs: [
      {
        id: 's1',
        toStatus: 'FINALIZADO',
        reason: null,
        actorUserId: 'u1',
        createdAt: '2026-07-10T12:00:00Z',
      },
      {
        id: 's2',
        toStatus: 'EMITIDO',
        reason: null,
        actorUserId: 'u1',
        createdAt: '2026-07-11T12:00:00Z',
      },
      {
        id: 's3',
        toStatus: 'FINALIZADO',
        reason: null,
        actorUserId: 'u1',
        createdAt: '2026-07-12T12:00:00Z',
      },
    ],
    usersById: { u1: { id: 'u1', fullName: null, username: 'italo' } },
  });
  // Desc por data; nenhum legado; nome cai pro username.
  assert.deepEqual(
    items.map((item) => item.toStatus),
    ['FINALIZADO', 'EMITIDO', 'FINALIZADO']
  );
  assert.ok(items.every((item) => item.legacy === false));
  assert.ok(items.every((item) => item.actorName === 'italo'));
});

test('buildContractTimeline: agio/aprovacao/espelho mapeiam campos e washout legado carrega o motivo', () => {
  const items = buildContractTimeline({
    contract: { washoutAt: '2026-07-30T00:00:00Z', washoutReason: 'Negocio desfeito' },
    agioLogs: [
      {
        id: 'a1',
        appliedAt: '2026-07-05T10:00:00Z',
        appliedByUserId: 'u1',
        agioDesagioType: 'AGIO',
        agioDesagioValue: { toNumber: () => 5 },
      },
    ],
    approvalLogs: [{ id: 'p1', createdAt: '2026-07-06T10:00:00Z', actorUserId: 'u2' }],
    espelhoLogs: [
      { id: 'x1', createdAt: '2026-07-07T10:00:00Z', actorUserId: 'u9', side: 'seller' },
    ],
    usersById: { u1: { fullName: 'Flavio' }, u2: { fullName: 'Italo' } },
  });

  const agio = items.find((item) => item.kind === 'AGIO');
  assert.equal(agio.agioDesagioType, 'AGIO');
  assert.equal(agio.agioDesagioValue, 5);
  assert.equal(agio.actorName, 'Flavio');

  const aprovacao = items.find((item) => item.kind === 'APROVACAO');
  assert.equal(aprovacao.actorName, 'Italo');

  const espelho = items.find((item) => item.kind === 'ESPELHO');
  assert.equal(espelho.side, 'seller');
  assert.equal(espelho.actorName, null); // u9 nao resolvido -> null

  const washout = items.find((item) => item.kind === 'STATUS');
  assert.equal(washout.toStatus, 'WASH_OUT');
  assert.equal(washout.legacy, true);
  assert.equal(washout.reason, 'Negocio desfeito');
});

// RC-D105: o relogio da retencao. Nao ha `finalizedAt` (finalizar e REVERSIVEL,
// RC-D63), entao o fim do contrato e derivado do status log / washoutAt.
test('contractEndedAt: FINALIZADO pelo log, WASH_OUT pela coluna, EMITIDO sem relógio', () => {
  const logs = [
    { toStatus: 'FINALIZADO', createdAt: '2026-07-01T10:00:00Z' },
    { toStatus: 'EMITIDO', createdAt: '2026-07-05T10:00:00Z' },
    { toStatus: 'FINALIZADO', createdAt: '2026-07-10T10:00:00Z' },
  ];
  // Finalizado -> a linha MAIS RECENTE (finalizou, reabriu, finalizou de novo).
  assert.equal(
    contractEndedAt({ status: 'FINALIZADO' }, logs).toISOString(),
    '2026-07-10T10:00:00.000Z'
  );
  // 🔴 Reaberto: o contrato voltou a estar vivo, o relogio PARA — apesar de haver
  // duas linhas de FINALIZADO no historico.
  assert.equal(contractEndedAt({ status: 'EMITIDO' }, logs), null);
  // Washout: a coluna manda (unica data de terminal que e coluna).
  assert.equal(
    contractEndedAt({ status: 'WASH_OUT', washoutAt: '2026-06-01T00:00:00Z' }, []).toISOString(),
    '2026-06-01T00:00:00.000Z'
  );
  // Washout legado sem a coluna: cai no log.
  assert.equal(
    contractEndedAt({ status: 'WASH_OUT', washoutAt: null }, [
      { toStatus: 'WASH_OUT', createdAt: '2026-05-02T00:00:00Z' },
    ]).toISOString(),
    '2026-05-02T00:00:00.000Z'
  );
  // 🔴 FINALIZADO sem NENHUMA linha de log -> null (fail-OPEN de proposito: guardar
  // demais e melhor que apagar um documento que nao se sabe datar).
  assert.equal(contractEndedAt({ status: 'FINALIZADO' }, []), null);
});

test('espelhoSnapshotExpiresAt / isEspelhoSnapshotAvailable: 15 dias após o fim', () => {
  const logs = [{ toStatus: 'FINALIZADO', createdAt: '2026-07-10T00:00:00Z' }];
  const contract = { status: 'FINALIZADO' };
  assert.equal(
    espelhoSnapshotExpiresAt(contract, logs).toISOString(),
    '2026-07-25T00:00:00.000Z' // 10/07 + 15 dias
  );
  // Contrato vivo = sem prazo.
  assert.equal(espelhoSnapshotExpiresAt({ status: 'EMITIDO' }, logs), null);

  const row = { snapshot: { v: 1 } };
  const dentro = new Date('2026-07-24T23:59:00Z');
  const fora = new Date('2026-07-25T00:00:01Z');
  assert.equal(isEspelhoSnapshotAvailable(row, contract, logs, dentro), true);
  assert.equal(isEspelhoSnapshotAvailable(row, contract, logs, fora), false);
  // Snapshot ja purgado (ou linha anterior a migration) nunca esta disponivel.
  assert.equal(isEspelhoSnapshotAvailable({ snapshot: null }, contract, logs, dentro), false);
  // Contrato vivo: disponivel mesmo anos depois da entrega.
  assert.equal(
    isEspelhoSnapshotAvailable(row, { status: 'EMITIDO' }, logs, new Date('2030-01-01T00:00:00Z')),
    true
  );
});

// RC-D106: os itens ESPELHO do timeline sao a PRATELEIRA. available/superseded/stale
// sao derivados aqui — nenhum deles e coluna.
test('buildContractTimeline: espelho guardado traz available/superseded/stale (RC-D106)', () => {
  const espelhoLogs = [
    {
      id: 'x1',
      createdAt: '2026-07-01T10:00:00Z',
      actorUserId: null,
      side: 'seller',
      snapshot: { v: 1, commission: 20, contractVersion: 3 },
    },
    {
      id: 'x2',
      createdAt: '2026-07-02T10:00:00Z',
      actorUserId: null,
      side: 'seller',
      snapshot: { v: 1, commission: 30, contractVersion: 5 },
    },
    {
      id: 'x3',
      createdAt: '2026-07-03T10:00:00Z',
      actorUserId: null,
      side: 'buyer',
      // Linha ANTERIOR a migration do snapshot: o export aconteceu, o documento nao.
      snapshot: null,
    },
  ];
  const items = buildContractTimeline({
    contract: { status: 'EMITIDO', version: 5 },
    espelhoLogs,
    now: new Date('2026-07-10T00:00:00Z'),
  });
  const byLog = Object.fromEntries(
    items.filter((item) => item.kind === 'ESPELHO').map((item) => [item.logId, item])
  );

  // O mais novo do lado vendedor: disponivel, corrente, e casa com a version atual.
  assert.equal(byLog.x2.available, true);
  assert.equal(byLog.x2.commission, 30);
  assert.equal(byLog.x2.superseded, false);
  assert.equal(byLog.x2.stale, false);
  // O anterior do MESMO lado: disponivel, mas substituido — e stale, porque o
  // contrato mudou (version 3 congelada contra 5 atual).
  assert.equal(byLog.x1.available, true);
  assert.equal(byLog.x1.superseded, true);
  assert.equal(byLog.x1.stale, true);
  // Sem snapshot: a LINHA fica (o fato auditado nao expira), o documento nao.
  assert.equal(byLog.x3.available, false);
  assert.equal(byLog.x3.commission, null);
  assert.equal(byLog.x3.superseded, false);
  // Contrato vivo: sem prazo.
  assert.equal(byLog.x2.expiresAt, null);
});

test('buildContractTimeline: retenção vencida derruba TODOS os espelhos do contrato', () => {
  const espelhoLogs = [
    {
      id: 'x1',
      createdAt: '2026-07-01T10:00:00Z',
      actorUserId: null,
      side: 'seller',
      snapshot: { v: 1, commission: 20, contractVersion: 1 },
    },
  ];
  const base = {
    espelhoLogs,
    statusLogs: [
      { id: 's1', toStatus: 'FINALIZADO', createdAt: '2026-07-02T00:00:00Z', actorUserId: null },
    ],
    contract: { status: 'FINALIZADO', version: 1 },
  };
  // 14 dias depois de finalizar: ainda na estante, com a data de validade a mostra.
  const dentro = buildContractTimeline({ ...base, now: new Date('2026-07-16T00:00:00Z') });
  const vivo = dentro.find((item) => item.kind === 'ESPELHO');
  assert.equal(vivo.available, true);
  assert.equal(vivo.expiresAt, '2026-07-17T00:00:00.000Z');
  // 16 dias depois: fora da estante — mas a linha do historico continua.
  const depois = buildContractTimeline({ ...base, now: new Date('2026-07-18T00:00:00Z') });
  const morto = depois.find((item) => item.kind === 'ESPELHO');
  assert.equal(morto.available, false);
  assert.equal(morto.commission, null);
  assert.ok(
    depois.some((item) => item.kind === 'ESPELHO'),
    'a linha auditada NAO desaparece'
  );
});

// F1 (E21-E27/D138): eventos de pagamento do card de Eventos. RC-D62/D64: o
// calendario e AGENDA — o ramo "realizado" (paidAt) morreu, mas o ATRASO ficou,
// porque paymentDate e a unica data que uma acao (finalizar) resolve.
test('buildPaymentEvent (D138): usa paymentDate; dayKey sem conversao de fuso', () => {
  const row = {
    id: 'c1',
    version: 2,
    status: 'EMITIDO',
    contractNumber: '0007/26',
    paymentDate: new Date('2026-07-10T00:00:00.000Z'),
    buyerSnapshot: { displayName: 'Comprador X' },
    sellerSnapshot: { displayName: 'Vendedor Y' },
  };
  const due = buildPaymentEvent(row, '2026-07-10'); // vence hoje -> ainda "a vencer"
  assert.equal(due.dayKey, '2026-07-10'); // do paymentDate, sem conversao de fuso
  assert.equal(due.event.typeKey, 'contract_payment_due');
  assert.equal(due.event.id, 'c1');
  assert.equal(due.event.contractId, 'c1');
  assert.equal(due.event.status, 'EMITIDO');
  assert.equal(due.event.buyerName, 'Comprador X');
  // check-up: version/sellerName saíram do evento (só sellerSnapshot do blob importava).
  // DSB-D10: rótulo com prefixo do tipo + `state` (cor do chip = estado).
  assert.equal(due.event.label, 'pagamento · 0007/26 · Comprador X');
  assert.equal(due.event.state, 'previsto');
});

// E29 (Revisao do Pagamento): agendado vencido -> "atrasado" (dot vermelho) a partir
// do dia SEGUINTE ao vencimento. RC-D64: e o UNICO vermelho que sobrou.
test('buildPaymentEvent (E29): vencido vira overdue no dia seguinte; vence-hoje segue due', () => {
  const row = {
    id: 'c9',
    version: 1,
    status: 'EMITIDO',
    contractNumber: '0009/26',
    paymentDate: new Date('2026-07-10T00:00:00.000Z'),
    buyerSnapshot: { displayName: 'Z' },
    sellerSnapshot: null,
  };
  // dia do vencimento: ainda due
  assert.equal(buildPaymentEvent(row, '2026-07-10').event.typeKey, 'contract_payment_due');
  assert.equal(buildPaymentEvent(row, '2026-07-10').event.state, 'previsto');
  // dia seguinte: overdue
  assert.equal(buildPaymentEvent(row, '2026-07-11').event.typeKey, 'contract_payment_overdue');
  assert.equal(buildPaymentEvent(row, '2026-07-11').event.state, 'atrasado');
  // dias depois: segue overdue
  assert.equal(buildPaymentEvent(row, '2026-08-01').event.typeKey, 'contract_payment_overdue');
  // sem todayKey (retrocompat): nao classifica atraso
  assert.equal(buildPaymentEvent(row).event.typeKey, 'contract_payment_due');
});

// Helper BRT: "hoje" ancorado no dia-calendario BRT (offset fixo -3h), nao no UTC.
test('brtTodayKey/brtTodayDateOnly: ancora no dia BRT (borda 21h-24h BRT)', () => {
  // 2026-07-10T02:00:00Z = 2026-07-09 23:00 BRT -> o dia BRT ainda e 09 (UTC ja e 10).
  const lateNight = new Date('2026-07-10T02:00:00.000Z');
  assert.equal(brtTodayKey(lateNight), '2026-07-09');
  assert.equal(brtTodayDateOnly(lateNight).toISOString(), '2026-07-09T00:00:00.000Z');
  // 2026-07-10T12:00:00Z = 2026-07-10 09:00 BRT -> dia BRT = 10.
  const midday = new Date('2026-07-10T12:00:00.000Z');
  assert.equal(brtTodayKey(midday), '2026-07-10');
  assert.equal(brtTodayDateOnly(midday).getTime(), new Date('2026-07-10T00:00:00.000Z').getTime());
});

test('buildPaymentEvent (D138): sem comprador -> label = so o numero', () => {
  const row = {
    id: 'c2',
    version: 1,
    status: 'EMITIDO',
    contractNumber: '0008/26',
    paymentDate: new Date('2026-07-12T00:00:00.000Z'),
    buyerSnapshot: null,
    sellerSnapshot: null,
  };
  const { event } = buildPaymentEvent(row);
  assert.equal(event.label, 'pagamento · 0008/26');
  assert.equal(event.state, 'previsto');
  assert.equal(event.buyerName, null);
});

test('bucketPaymentEvents (D138): agrupa por dayKey (do paymentDate)', () => {
  const due = [
    {
      id: 'a',
      version: 1,
      status: 'EMITIDO',
      contractNumber: '1/26',
      paymentDate: new Date('2026-07-10T00:00:00.000Z'),
      buyerSnapshot: { displayName: 'A' },
      sellerSnapshot: null,
    },
    {
      id: 'b',
      version: 1,
      status: 'EMITIDO',
      contractNumber: '2/26',
      paymentDate: new Date('2026-07-10T00:00:00.000Z'),
      buyerSnapshot: null,
      sellerSnapshot: null,
    },
  ];
  const map = bucketPaymentEvents(due, '2026-07-10'); // vence-hoje -> a,b seguem "due"
  assert.equal(map['2026-07-10'].length, 2);
  assert.equal(map['2026-07-10'][0].id, 'a');
  assert.equal(map['2026-07-10'][0].typeKey, 'contract_payment_due');
  assert.equal(map['2026-07-10'][1].label, 'pagamento · 2/26'); // sem comprador -> prefixo + numero
});

test('buildRecentApprovalSendItem (AP16): id namespaced, kind APPROVAL, nº+comprador, amostra nula', () => {
  const item = buildRecentApprovalSendItem(
    { id: 'log-1', saleContractId: 'c1', createdAt: new Date('2026-07-09T10:00:00.000Z') },
    { id: 'c1', contractNumber: '0007/26', buyerSnapshot: { displayName: 'Comprador X' } }
  );
  assert.equal(item.id, 'approval:log-1'); // namespaced -> nao colide com event_id de amostra
  assert.equal(item.kind, 'APPROVAL');
  assert.equal(item.contractNumber, '0007/26');
  assert.equal(item.buyer, 'Comprador X');
  assert.equal(item.at, '2026-07-09T10:00:00.000Z');
  assert.equal(item.sampleId, null);
  assert.equal(item.internalLotNumber, null);
  assert.equal(item.isBlend, false);
  assert.equal(item.cancelled, false);
  // Contrato nao resolvido (defensivo) -> nº/comprador null.
  const semContrato = buildRecentApprovalSendItem(
    { id: 'log-2', saleContractId: 'c2', createdAt: new Date('2026-07-09T09:00:00.000Z') },
    null
  );
  assert.equal(semContrato.contractNumber, null);
  assert.equal(semContrato.buyer, null);
});

// ── DSB-D7: datas de ação recusam fim de semana + roll no calendário ──

test('assertBusinessDate: rejeita sábado/domingo (422 WEEKEND_DATE), passa em dia útil', () => {
  // 2026-07-11 = sábado, 2026-07-12 = domingo, 2026-07-10 = sexta.
  for (const weekend of ['2026-07-11', '2026-07-12']) {
    assert.throws(
      () => assertBusinessDate(new Date(`${weekend}T00:00:00.000Z`), 'invoiceDate'),
      (err) => err.status === 422 && err.details?.code === 'WEEKEND_DATE'
    );
  }
  // Dia útil passa e devolve a própria Date.
  const friday = new Date('2026-07-10T00:00:00.000Z');
  assert.equal(assertBusinessDate(friday, 'invoiceDate'), friday);
});

test('normalizeEtapa2Input: faturamento/pagamento em fim de semana são rejeitados', () => {
  assert.throws(
    () => normalizeEtapa2Input({ ...validEtapa2(), invoiceDate: '2026-07-11' }),
    (err) => err.details?.code === 'WEEKEND_DATE' && err.details?.field === 'invoiceDate'
  );
  assert.throws(
    () => normalizeEtapa2Input({ ...validEtapa2(), paymentDate: '2026-07-12' }),
    (err) => err.details?.code === 'WEEKEND_DATE' && err.details?.field === 'paymentDate'
  );
  // Dia útil não lança.
  assert.doesNotThrow(() => normalizeEtapa2Input(validEtapa2()));
});

// DSB-D18: o roll de fim de semana saiu (o calendário mostra o mês inteiro) —
// evento de sáb/dom agrupa no dia REAL.
test('bucketPaymentEvents: evento de fim de semana fica no dia real (DSB-D18)', () => {
  const sat = [
    {
      id: 'x',
      version: 1,
      status: 'EMITIDO',
      contractNumber: '9/26',
      paymentDate: new Date('2026-07-11T00:00:00.000Z'), // sábado
      buyerSnapshot: { displayName: 'X' },
      sellerSnapshot: null,
    },
  ];
  const map = bucketPaymentEvents(sat, '2026-07-01');
  // Sem roll: aparece no próprio sábado (11), nada na sexta (10).
  assert.equal(map['2026-07-10'], undefined);
  assert.equal(map['2026-07-11'].length, 1);
  assert.equal(map['2026-07-11'][0].typeKey, 'contract_payment_due');
});

// Faturamento (DSB-D11): agendado = invoiceDate/EMITIDO. RC-D64: LEMBRETE PURO —
// nenhuma acao o resolve, entao nunca fica vermelho e nao tem marco "realizado";
// passou o dia, o aviso se recolhe sozinho (o feed so busca a janela visivel).
test('buildInvoiceEvent (DSB-D11/RC-D64): usa invoiceDate, sempre previsto, id namespaced', () => {
  const row = {
    id: 'k1',
    status: 'EMITIDO',
    contractNumber: '0011/26',
    invoiceDate: new Date('2026-07-10T00:00:00.000Z'),
    buyerSnapshot: { displayName: 'Comprador K' },
  };
  const sched = buildInvoiceEvent(row);
  assert.equal(sched.dayKey, '2026-07-10'); // do invoiceDate, sem conversao de fuso
  assert.equal(sched.event.typeKey, 'contract_invoice');
  assert.equal(sched.event.state, 'previsto');
  assert.equal(sched.event.id, 'invoice:k1'); // namespaced (nao colide com pagamento)
  assert.equal(sched.event.contractId, 'k1');
  assert.equal(sched.event.label, 'faturamento · 0011/26 · Comprador K');
});

test('buildInvoiceEvent (DSB-D11): sem comprador -> label = faturamento · numero', () => {
  const row = {
    id: 'k2',
    status: 'EMITIDO',
    contractNumber: '0012/26',
    invoiceDate: new Date('2026-07-13T00:00:00.000Z'),
    buyerSnapshot: null,
  };
  const { event } = buildInvoiceEvent(row);
  assert.equal(event.label, 'faturamento · 0012/26');
  assert.equal(event.buyerName, null);
});

test('bucketInvoiceEvents (DSB-D11/D18): agrupa por dayKey REAL (fim de semana inclusive)', () => {
  const scheduled = [
    {
      id: 'a',
      status: 'EMITIDO',
      contractNumber: '1/26',
      invoiceDate: new Date('2026-07-12T00:00:00.000Z'), // domingo — fica no domingo (DSB-D18)
      buyerSnapshot: { displayName: 'A' },
    },
  ];
  const map = bucketInvoiceEvents(scheduled);
  assert.equal(map['2026-07-12'].length, 1); // no dia REAL (domingo)
  assert.equal(map['2026-07-12'][0].state, 'previsto');
  assert.ok(map['2026-07-12'][0].id.startsWith('invoice:'));
});

// DSB-D18: um agendado VENCIDO cuja data real cai num FIM DE SEMANA vira overdue
// (sobre a data real) e fica NO PRÓPRIO dia — o calendário mensal mostra sáb/dom.
test('bucketPaymentEvents (DSB-D18): agendado vencido no fim de semana -> overdue no dia real', () => {
  const due = [
    {
      id: 'w',
      version: 1,
      status: 'EMITIDO',
      contractNumber: '9/26',
      paymentDate: new Date('2026-07-11T00:00:00.000Z'), // sábado, no passado
      buyerSnapshot: { displayName: 'W' },
      sellerSnapshot: null,
    },
  ];
  const map = bucketPaymentEvents(due, '2026-07-20'); // hoje depois -> vencido
  assert.equal(map['2026-07-10'], undefined); // nada na sexta (sem roll)
  assert.equal(map['2026-07-11'].length, 1); // no próprio sábado
  assert.equal(map['2026-07-11'][0].typeKey, 'contract_payment_overdue');
  assert.equal(map['2026-07-11'][0].state, 'atrasado');
});

// D141: banco em texto livre — o snapshot congela bankName direto da conta,
// sem bankId/compeCode (snapshots pre-D141 seguem com os campos antigos).
test('buildBankSnapshot (D141): bankName plano, sem bankId/compeCode', () => {
  const snap = buildBankSnapshot({
    id: UUID_1,
    bankName: 'BANCO DO BRASIL',
    agency: '0001',
    accountNumber: '12345-6',
    holderName: 'Vendedor X',
    holderTaxId: '12345678000199',
    pixKey: 'chave@pix',
  });
  assert.deepEqual(snap, {
    accountId: UUID_1,
    bankName: 'BANCO DO BRASIL',
    agency: '0001',
    accountNumber: '12345-6',
    holderName: 'Vendedor X',
    holderTaxId: '12345678000199',
    pixKey: 'chave@pix',
  });
  assert.equal(buildBankSnapshot(null), null);
});

// RC-D89 (revoga a D145): quem decide se o cancelado cobra é a RESPOSTA dada no
// washout, não mais o `type`. Os três casos que importam são true / false / null —
// o `null` é o washout que aconteceu antes desta coluna existir (ou por um caminho
// que não perguntou) e ele NÃO cobra: fail-closed, o sistema não inventa cobrança.
test('isWashoutNotBillable: segue a resposta do washout, não o tipo (RC-D89)', () => {
  assert.equal(isWashoutNotBillable({ status: 'WASH_OUT', washoutBillable: true }), false);
  assert.equal(isWashoutNotBillable({ status: 'WASH_OUT', washoutBillable: false }), true);
  assert.equal(isWashoutNotBillable({ status: 'WASH_OUT', washoutBillable: null }), true);
  assert.equal(isWashoutNotBillable({ status: 'WASH_OUT' }), true);
  // O `type` deixou de pesar: à vista que respondeu "cobrar" cobra, Futuro que
  // respondeu "não cobrar" não cobra — o inverso exato do que a D145 fazia.
  assert.equal(
    isWashoutNotBillable({ status: 'WASH_OUT', type: 'MERCADO_A_VISTA', washoutBillable: true }),
    false
  );
  assert.equal(
    isWashoutNotBillable({ status: 'WASH_OUT', type: 'FUTURO', washoutBillable: false }),
    true
  );
  // Fora do WASH_OUT a pergunta não existe — contrato vivo nunca é "não cobrável".
  assert.equal(isWashoutNotBillable({ status: 'FINALIZADO', washoutBillable: null }), false);
  assert.equal(isWashoutNotBillable({ status: 'EMITIDO', washoutBillable: false }), false);
  assert.equal(isWashoutNotBillable(null), false);
});

test('assertEspelhoEligible: valida os 4 gates ESPELHO_* (D105/RC-D91/S74/RC-D110)', () => {
  const base = {
    status: 'EMITIDO',
    type: 'FUTURO',
    sellerBrokeragePct: 2,
    buyerBrokeragePct: 0,
    sellerSnapshot: { displayName: 'Fazenda Boa Vista' },
    buyerSnapshot: { displayName: 'Exportadora XY' },
  };
  // Lado com corretagem → elegível (não lança).
  assert.doesNotThrow(() => assertEspelhoEligible(base, 'seller'));
  // Lado SEM corretagem → ESPELHO_NO_BROKERAGE.
  assert.throws(
    () => assertEspelhoEligible(base, 'buyer'),
    (err) => err.status === 409 && err.details?.code === 'ESPELHO_NO_BROKERAGE'
  );
  // RC-D91: o Espelho é o documento com que se cobra, então ele segue a resposta.
  // Cancelado que respondeu "não cobrar" → ESPELHO_WASHOUT_NOT_BILLABLE...
  assert.throws(
    () =>
      assertEspelhoEligible(
        { ...base, status: 'WASH_OUT', type: 'MERCADO_A_VISTA', washoutBillable: false },
        'seller'
      ),
    (err) => err.status === 409 && err.details?.code === 'ESPELHO_WASHOUT_NOT_BILLABLE'
  );
  // ...e o washout sem resposta gravada também não emite (fail-closed).
  assert.throws(
    () => assertEspelhoEligible({ ...base, status: 'WASH_OUT', washoutBillable: null }, 'seller'),
    (err) => err.status === 409 && err.details?.code === 'ESPELHO_WASHOUT_NOT_BILLABLE'
  );
  // ...mas o à vista que respondeu "cobrar" EMITE — negar o documento deixaria a
  // cobrança sem papel. Sob a D145 este era justamente o caso bloqueado.
  assert.doesNotThrow(() =>
    assertEspelhoEligible(
      { ...base, status: 'WASH_OUT', type: 'MERCADO_A_VISTA', washoutBillable: true },
      'seller'
    )
  );
  // Status fora do conjunto congelado → ESPELHO_NOT_ELIGIBLE.
  assert.throws(
    () => assertEspelhoEligible({ ...base, status: 'RASCUNHO' }, 'seller'),
    (err) => err.status === 409 && err.details?.code === 'ESPELHO_NOT_ELIGIBLE'
  );
});

// 🔴 RC-D110: com corretagem > 0 e o snapshot da parte vazio, o papel saía com o TOTAL
// real e "CLIENTE: —" — uma cobrança sem destinatário, entregue e auditada como
// documento válido. O gate é do LADO pedido: o outro lado estar cadastrado não salva.
test('assertEspelhoEligible: sem parte no lado pedido → ESPELHO_NO_PARTY (RC-D110)', () => {
  const base = {
    status: 'EMITIDO',
    type: 'FUTURO',
    sellerBrokeragePct: 2,
    buyerBrokeragePct: 2,
    sellerSnapshot: { displayName: 'Fazenda Boa Vista' },
    buyerSnapshot: { displayName: 'Exportadora XY' },
  };
  const noParty = (err) => err.status === 409 && err.details?.code === 'ESPELHO_NO_PARTY';

  assert.throws(() => assertEspelhoEligible({ ...base, buyerSnapshot: null }, 'buyer'), noParty);
  assert.throws(() => assertEspelhoEligible({ ...base, sellerSnapshot: null }, 'seller'), noParty);
  // Snapshot que EXISTE mas não tem nome usável conta como ausente — é o caso real
  // (buildPartySnapshot devolve o objeto com os campos vazios), e é justamente o que a
  // cópia do PDF não tratava.
  assert.throws(() => assertEspelhoEligible({ ...base, buyerSnapshot: {} }, 'buyer'), noParty);
  assert.throws(
    () => assertEspelhoEligible({ ...base, buyerSnapshot: { displayName: '   ' } }, 'buyer'),
    noParty
  );
  // O lado cadastrado segue saindo, mesmo com o outro vazio.
  assert.doesNotThrow(() => assertEspelhoEligible({ ...base, buyerSnapshot: null }, 'seller'));
  // O gate é o ÚLTIMO: sem corretagem no lado, a recusa é a de corretagem.
  assert.throws(
    () => assertEspelhoEligible({ ...base, buyerBrokeragePct: 0, buyerSnapshot: null }, 'buyer'),
    (err) => err.details?.code === 'ESPELHO_NO_BROKERAGE'
  );
});

test('snapshotPartyName: displayName > legalName > fullName, em branco = null', () => {
  assert.equal(snapshotPartyName({ displayName: 'A', legalName: 'B', fullName: 'C' }), 'A');
  assert.equal(snapshotPartyName({ legalName: 'B', fullName: 'C' }), 'B');
  assert.equal(snapshotPartyName({ fullName: 'C' }), 'C');
  assert.equal(snapshotPartyName(null), null);
  assert.equal(snapshotPartyName({}), null);
  // O motivo de existir uma fonte única: a cópia do PDF não tratava branco e
  // imprimia "CLIENTE:  " num documento de cobrança.
  assert.equal(snapshotPartyName({ displayName: '   ' }), null);
  assert.equal(snapshotPartyName({ displayName: '   ', legalName: 'B' }), 'B');
  assert.equal(snapshotPartyName({ displayName: '  A  ' }), 'A');
});

// RC-D103: ESTE é o teste que trava os números do papel. `pdf-lib` não extrai texto,
// então não há como asseverar os glifos do PDF; como o renderizador passou a ler SÓ
// deste objeto, asseverar o objeto é asseverar o documento.
test('buildEspelhoSnapshot: congela o que o papel imprime, por lado (RC-D103)', () => {
  const contract = {
    version: 7,
    contractNumber: '0042/26',
    sellerSnapshot: { displayName: 'Vendedor X' },
    buyerSnapshot: { legalName: 'Comprador Y LTDA' },
    paymentDate: new Date('2026-08-15T00:00:00.000Z'),
    unitPrice: 100,
    effectiveUnitPrice: 150,
    quantitySacks: 10,
    agioDesagioType: 'AGIO',
    agioDesagioValue: 50,
    sellerBrokeragePct: 2,
    sellerBrokerageValue: 30,
    buyerBrokeragePct: 1.5,
    buyerBrokerageValue: 22.5,
    purchaseNumber: 'PA-01',
  };

  assert.deepEqual(buildEspelhoSnapshot(contract, 'seller'), {
    v: ESPELHO_SNAPSHOT_VERSION,
    side: 'seller',
    contractVersion: 7,
    clientName: 'Vendedor X',
    contractNumber: '0042/26',
    paymentDate: '2026-08-15T00:00:00.000Z',
    effectiveUnitPrice: 150,
    quantitySacks: 10,
    agioDesagioType: 'AGIO',
    agioDesagioValue: 50,
    brokeragePct: 2,
    commission: 30,
    purchaseNumber: 'PA-01',
  });

  // O lado troca exatamente 4 campos: quem é o cliente, o pct, a comissão e o rótulo.
  const buyer = buildEspelhoSnapshot(contract, 'buyer');
  assert.equal(buyer.side, 'buyer');
  assert.equal(buyer.clientName, 'Comprador Y LTDA');
  assert.equal(buyer.brokeragePct, 1.5);
  assert.equal(buyer.commission, 22.5);
  // ...e nada mais: o preço, as sacas e o ágio são do CONTRATO, não do lado.
  assert.equal(buyer.effectiveUnitPrice, 150);
  assert.equal(buyer.quantitySacks, 10);
  assert.equal(buyer.agioDesagioValue, 50);
});

test('buildEspelhoSnapshot: sem ágio, sem pagamento, sem parte — nada quebra', () => {
  const snapshot = buildEspelhoSnapshot(
    {
      version: 1,
      contractNumber: '0001/26',
      sellerSnapshot: null,
      buyerSnapshot: null,
      paymentDate: null,
      unitPrice: 200,
      quantitySacks: 5,
      agioDesagioType: null,
      agioDesagioValue: null,
      sellerBrokeragePct: 1,
      sellerBrokerageValue: 10,
      purchaseNumber: null,
    },
    'seller'
  );
  assert.equal(snapshot.clientName, null);
  assert.equal(snapshot.paymentDate, null);
  assert.equal(snapshot.agioDesagioType, null);
  assert.equal(snapshot.purchaseNumber, null);
  // Sem effectiveUnitPrice na view (contrato cru), cai no helper canônico: sem ágio
  // o efetivo É o preço cru.
  assert.equal(snapshot.effectiveUnitPrice, 200);
});

test('buildEspelhoSnapshot: sem effectiveUnitPrice na view, deriva com o ágio', () => {
  const snapshot = buildEspelhoSnapshot(
    {
      version: 1,
      unitPrice: 100,
      quantitySacks: 10,
      agioDesagioType: 'DESAGIO',
      agioDesagioValue: 25,
      sellerBrokeragePct: 2,
      sellerBrokerageValue: 15,
    },
    'seller'
  );
  assert.equal(snapshot.effectiveUnitPrice, 75);
});

// D147: predicados canônicos por `type` — o washout ramifica por eles (predicado
// único, alinhado ao Financeiro/Espelho); a invariante type<->vínculo de lote é
// garantida pela CHECK chk_sale_contract_type_lote.
test('isFutureContract / isSpotContract: distinguem a modalidade por type (D147)', () => {
  assert.equal(isFutureContract({ type: 'FUTURO' }), true);
  assert.equal(isFutureContract({ type: 'MERCADO_A_VISTA' }), false);
  assert.equal(isFutureContract(null), false);
  assert.equal(isFutureContract({}), false);
  assert.equal(isSpotContract({ type: 'MERCADO_A_VISTA' }), true);
  assert.equal(isSpotContract({ type: 'FUTURO' }), false);
  assert.equal(isSpotContract(null), false);
  // Mutuamente exclusivos em qualquer contrato válido.
  for (const type of ['FUTURO', 'MERCADO_A_VISTA']) {
    assert.notEqual(isFutureContract({ type }), isSpotContract({ type }));
  }
});

// AP31/DSB-D19: item do card de Avisos — dueInDays (com data, "À definir", vencido)
// + id namespaced + kind extensível.
test('buildDashboardAvisoItem: dueInDays por proximidade; "À definir" = null', () => {
  const withDate = buildDashboardAvisoItem(
    {
      id: 'c1',
      contractNumber: '1001/26',
      buyerName: 'Comprador X',
      invoiceDate: new Date('2026-07-20T00:00:00.000Z'),
    },
    '2026-07-15'
  );
  assert.equal(withDate.id, 'aviso:c1');
  assert.equal(withDate.kind, 'aprovacao_a_enviar');
  assert.equal(withDate.contractId, 'c1');
  assert.equal(withDate.contractNumber, '1001/26');
  assert.equal(withDate.buyerName, 'Comprador X');
  assert.equal(withDate.dueInDays, 5); // 20 − 15

  // "À definir" (D144): invoiceDate null → dueInDays null (ainda avisa, sem prazo).
  const noDate = buildDashboardAvisoItem(
    { id: 'c2', contractNumber: '1002/26', buyerName: null, invoiceDate: null },
    '2026-07-15'
  );
  assert.equal(noDate.dueInDays, null);
  assert.equal(noDate.buyerName, null);

  // Faturamento já passou sem etiqueta → dueInDays negativo.
  const past = buildDashboardAvisoItem(
    {
      id: 'c3',
      contractNumber: '1003/26',
      buyerName: 'Y',
      invoiceDate: new Date('2026-07-10T00:00:00.000Z'),
    },
    '2026-07-15'
  );
  assert.equal(past.dueInDays, -5);
});

// ===========================================================================
// RC-F6: filtros da lista de /contratos (agora servidor-side).
// ===========================================================================

const STATUSES = ['EMITIDO', 'FINALIZADO', 'WASH_OUT'];

test('normalizeEnumFilterList: aceita lista, string e csv; vazio = sem filtro', () => {
  assert.deepEqual(normalizeEnumFilterList(undefined, STATUSES, 'status'), []);
  assert.deepEqual(normalizeEnumFilterList(null, STATUSES, 'status'), []);
  assert.deepEqual(normalizeEnumFilterList('', STATUSES, 'status'), []);

  // Multi-selecao viaja como csv na querystring; um valor so viaja cru.
  assert.deepEqual(normalizeEnumFilterList('FINALIZADO', STATUSES, 'status'), ['FINALIZADO']);
  assert.deepEqual(normalizeEnumFilterList('EMITIDO,FINALIZADO', STATUSES, 'status'), [
    'EMITIDO',
    'FINALIZADO',
  ]);
  assert.deepEqual(normalizeEnumFilterList(['EMITIDO', 'FINALIZADO'], STATUSES, 'status'), [
    'EMITIDO',
    'FINALIZADO',
  ]);

  // Normaliza caixa/espaco e nao repete.
  assert.deepEqual(normalizeEnumFilterList(' finalizado , FINALIZADO ', STATUSES, 'status'), [
    'FINALIZADO',
  ]);
  // Itens vazios do csv sao ignorados (trailing comma nao vira erro).
  assert.deepEqual(normalizeEnumFilterList('FINALIZADO,', STATUSES, 'status'), ['FINALIZADO']);
});

test('normalizeEnumFilterList: item invalido e 422, nao silencio', () => {
  // Ignorar em silencio faria um erro de digitacao devolver a lista INTEIRA.
  assert.throws(
    () => normalizeEnumFilterList('QUITADO', STATUSES, 'status'),
    (err) => {
      assert.equal(err.status, 422);
      assert.equal(err.details?.field, 'status');
      return true;
    }
  );
  assert.throws(() => normalizeEnumFilterList('FINALIZADO,QUITADO', STATUSES, 'status'), /invalid/);
});

test('normalizeUuidFilter: vazio = sem filtro, malformado = 422', () => {
  assert.equal(normalizeUuidFilter(undefined, 'buyerClientId'), null);
  assert.equal(normalizeUuidFilter('', 'buyerClientId'), null);
  assert.equal(normalizeUuidFilter(` ${UUID_1} `, 'buyerClientId'), UUID_1);
  assert.throws(
    () => normalizeUuidFilter('nao-e-uuid', 'buyerClientId'),
    (err) => {
      assert.equal(err.status, 422);
      assert.equal(err.details?.field, 'buyerClientId');
      return true;
    }
  );
});

test('normalizeContractPeriodFilter: base escolhe a COLUNA; janela ancorada em UTC', () => {
  // Sem base -> data do contrato. Sem janela -> nao recorta nada.
  assert.deepEqual(normalizeContractPeriodFilter({}), {
    field: 'contractDate',
    from: null,
    to: null,
  });
  assert.equal(normalizeContractPeriodFilter({ periodBase: 'invoice' }).field, 'invoiceDate');
  assert.equal(normalizeContractPeriodFilter({ periodBase: 'payment' }).field, 'paymentDate');

  const range = normalizeContractPeriodFilter({
    periodBase: 'payment',
    periodFrom: '2026-08-01',
    periodTo: '2026-08-31',
  });
  // @db.Date e meia-noite UTC: ancorar em T00:00:00Z evita off-by-one de fuso.
  assert.equal(range.from.toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(range.to.toISOString(), '2026-08-31T00:00:00.000Z');

  // Uma ponta so e valido (aberto do outro lado).
  assert.equal(normalizeContractPeriodFilter({ periodFrom: '2026-08-01' }).to, null);
  assert.equal(normalizeContractPeriodFilter({ periodTo: '2026-08-01' }).from, null);
});

test('normalizeContractPeriodFilter: base/data invalida e janela invertida sao 422', () => {
  assert.throws(
    () => normalizeContractPeriodFilter({ periodBase: 'embarque' }),
    (err) => {
      assert.equal(err.status, 422);
      assert.equal(err.details?.field, 'periodBase');
      return true;
    }
  );
  assert.throws(() => normalizeContractPeriodFilter({ periodFrom: '01/08/2026' }), /YYYY-MM-DD/);
  assert.throws(
    () => normalizeContractPeriodFilter({ periodFrom: '2026-08-31', periodTo: '2026-08-01' }),
    (err) => {
      assert.equal(err.status, 422);
      assert.equal(err.details?.field, 'periodFrom');
      return true;
    }
  );
});

// ── RC-D68: deriveContractAgenda — o proximo compromisso do contrato ─────────
// O coracao da reforma: a coluna "Situacao" deixa de ser rotulo de fase e passa a
// dizer o que este contrato ainda vai pedir. Tudo derivado; nada mantido a mao.

const agendaRow = (over = {}) => ({
  status: 'EMITIDO',
  requiresApproval: false,
  hasApprovalLabel: false,
  approvalReminderLeadDays: null,
  invoiceDate: null,
  paymentDate: null,
  ...over,
});

test('deriveContractAgenda: terminais vencem tudo e nao tem data', () => {
  assert.deepEqual(deriveContractAgenda(agendaRow({ status: 'WASH_OUT' }), '2026-07-10'), {
    kind: 'cancelado',
    dayKey: null,
  });
  // Mesmo com pagamento vencido: quem cancelou/finalizou nao tem mais compromisso.
  assert.deepEqual(
    deriveContractAgenda(
      agendaRow({
        status: 'FINALIZADO',
        paymentDate: new Date('2026-07-01T00:00:00.000Z'),
        requiresApproval: true,
      }),
      '2026-07-10'
    ),
    { kind: 'finalizado', dayKey: null }
  );
});

test('deriveContractAgenda: aprovacao a enviar vence pagamento vencido e faturamento', () => {
  const row = agendaRow({
    requiresApproval: true,
    hasApprovalLabel: false,
    approvalReminderLeadDays: 30,
    invoiceDate: new Date('2026-07-20T00:00:00.000Z'),
    paymentDate: new Date('2026-07-01T00:00:00.000Z'), // ja vencido
  });
  assert.deepEqual(deriveContractAgenda(row, '2026-07-10'), {
    kind: 'aprovacao',
    dayKey: '2026-07-20',
  });
});

test('deriveContractAgenda: a etiqueta gerada tira o aviso de aprovacao (AP31)', () => {
  // Mesmo contrato do teste acima, agora COM etiqueta: o aviso some sozinho e o
  // proximo compromisso passa a ser o pagamento vencido.
  const row = agendaRow({
    requiresApproval: true,
    hasApprovalLabel: true,
    approvalReminderLeadDays: 30,
    invoiceDate: new Date('2026-07-20T00:00:00.000Z'),
    paymentDate: new Date('2026-07-01T00:00:00.000Z'),
  });
  assert.deepEqual(deriveContractAgenda(row, '2026-07-10'), {
    kind: 'pagamento_vencido',
    dayKey: '2026-07-01',
  });
});

test('deriveContractAgenda: fora da janela de lead o aviso de aprovacao ainda nao abre', () => {
  const row = agendaRow({
    requiresApproval: true,
    approvalReminderLeadDays: 5,
    invoiceDate: new Date('2026-08-30T00:00:00.000Z'), // longe demais
  });
  assert.deepEqual(deriveContractAgenda(row, '2026-07-10'), {
    kind: 'faturamento',
    dayKey: '2026-08-30',
  });
  // Dentro da janela (lead 60 dias), o aviso abre.
  assert.equal(
    deriveContractAgenda({ ...row, approvalReminderLeadDays: 60 }, '2026-07-10').kind,
    'aprovacao'
  );
});

test('deriveContractAgenda: "a definir" (D144) SEMPRE avisa a aprovacao (sem janela)', () => {
  const row = agendaRow({ requiresApproval: true, approvalReminderLeadDays: 0, invoiceDate: null });
  assert.deepEqual(deriveContractAgenda(row, '2026-07-10'), { kind: 'aprovacao', dayKey: null });
});

test('deriveContractAgenda (RC-D64): so o pagamento vence; o faturamento e lembrete puro', () => {
  // Faturamento no passado NAO vira vermelho — nao ha acao que o resolva. Ele
  // simplesmente sai da frente e o proximo compromisso e o pagamento.
  const row = agendaRow({
    invoiceDate: new Date('2026-07-01T00:00:00.000Z'), // passou
    paymentDate: new Date('2026-07-25T00:00:00.000Z'), // a vencer
  });
  assert.deepEqual(deriveContractAgenda(row, '2026-07-10'), {
    kind: 'pagamento',
    dayKey: '2026-07-25',
  });
  // O pagamento no passado, sim, acende.
  assert.deepEqual(
    deriveContractAgenda(
      { ...row, paymentDate: new Date('2026-07-05T00:00:00.000Z') },
      '2026-07-10'
    ),
    { kind: 'pagamento_vencido', dayKey: '2026-07-05' }
  );
});

test('deriveContractAgenda: faturamento hoje ainda conta; pagamento so depois dele', () => {
  const row = agendaRow({
    invoiceDate: new Date('2026-07-10T00:00:00.000Z'), // hoje
    paymentDate: new Date('2026-07-25T00:00:00.000Z'),
  });
  assert.deepEqual(deriveContractAgenda(row, '2026-07-10'), {
    kind: 'faturamento',
    dayKey: '2026-07-10',
  });
});

test('deriveContractAgenda: sem data nenhuma -> nenhum compromisso', () => {
  assert.deepEqual(deriveContractAgenda(agendaRow(), '2026-07-10'), {
    kind: 'nenhum',
    dayKey: null,
  });
});

// ── RC-D117: os quatro estados da lista, os grupos e o cursor ────────────────
// 🔴 A PARTICAO e o que faz os quatro cartoes de KPI somarem o total (RC-D118).
// Nao ha como afirmar isso sobre um objeto Prisma, entao o que se testa aqui e a
// forma dos grupos (chaves, ordem, recorte pelo filtro) — a exaustividade em si e
// verificada contra o banco na integracao.

const brtToday = new Date('2026-07-10T00:00:00.000Z');

test('contractStateWhere: os quatro estados existem e recortam por status + data', () => {
  const state = contractStateWhere(brtToday);
  assert.deepEqual(Object.keys(state).sort(), [...CONTRACT_LIST_STATES].sort());
  // Os dois vivos partem o MESMO status pelo pagamento: atraso = venceu; aberto =
  // vence hoje ou depois, OU nao tem data ("A definir", D144). Nao ha terceiro
  // caso, e e por isso que `aberto = EMITIDO - atraso` no service e exato.
  assert.deepEqual(state.atraso.AND[0], { status: 'EMITIDO' });
  assert.deepEqual(state.atraso.AND[1], { paymentDate: { lt: brtToday } });
  assert.deepEqual(state.aberto.AND[0], { status: 'EMITIDO' });
  assert.deepEqual(state.aberto.AND[1], {
    OR: [{ paymentDate: { gte: brtToday } }, { paymentDate: null }],
  });
  // Os terminais nao olham data nenhuma. 🔴 `cancelado` e TODO washout — o
  // /financeiro filtra por `washoutBillable`, e essa divergencia e deliberada.
  assert.deepEqual(state.finalizado, { status: 'FINALIZADO' });
  assert.deepEqual(state.cancelado, { status: 'WASH_OUT' });
});

test('contractListGroups: sem filtro sao os 4, na ordem de urgencia', () => {
  const groups = contractListGroups({ brtToday });
  assert.deepEqual(
    groups.map((g) => g.key),
    ['atraso', 'aberto', 'finalizado', 'cancelado']
  );
  // O indice do grupo E a posicao: o cursor viaja com ele, entao trocar a ordem
  // sem trocar o `g` faria a paginacao pular contratos.
  assert.deepEqual(
    groups.map((g) => g.g),
    [0, 1, 2, 3]
  );
  assert.equal(groups[groups.length - 1].g, CONTRACT_MAX_GROUP);
});

test('contractListGroups: os dois vivos ordenam por vencimento; os terminais, por seq desc', () => {
  const groups = contractListGroups({ brtToday });
  // Os dois vivos compartilham a MESMA expressao de ordem — e o que autoriza um
  // `groupKeysetWhere` unico para ambos (`CONTRACT_DATE_GROUPS`).
  assert.deepEqual(groups[0].orderBy, groups[1].orderBy);
  assert.deepEqual(groups[0].orderBy, [
    { paymentDate: { sort: 'asc', nulls: 'last' } },
    { contractSeq: 'asc' },
  ]);
  assert.deepEqual([...CONTRACT_DATE_GROUPS], [groups[0].g, groups[1].g]);
  // Arquivo se le do mais novo.
  assert.deepEqual(groups[2].orderBy, [{ contractSeq: 'desc' }]);
  assert.deepEqual(groups[3].orderBy, [{ contractSeq: 'desc' }]);
});

test('contractListGroups: o filtro escolhe os grupos (um eixo so, RC-D118)', () => {
  assert.deepEqual(
    contractListGroups({ brtToday, states: ['atraso'] }).map((g) => g.key),
    ['atraso']
  );
  // Multi mantem a ordem de URGENCIA, nao a ordem em que o usuario marcou.
  assert.deepEqual(
    contractListGroups({ brtToday, states: ['cancelado', 'aberto'] }).map((g) => g.key),
    ['aberto', 'cancelado']
  );
  // Vazio = sem filtro, nao "nenhum".
  assert.equal(contractListGroups({ brtToday, states: [] }).length, 4);
});

test('normalizeContractStateFilter: csv, lista, dedup; invalido e 422', () => {
  assert.deepEqual(normalizeContractStateFilter('atraso,aberto'), ['atraso', 'aberto']);
  assert.deepEqual(normalizeContractStateFilter(['ATRASO', ' atraso ']), ['atraso']);
  assert.deepEqual(normalizeContractStateFilter(undefined), []);
  assert.deepEqual(normalizeContractStateFilter(''), []);
  // Ignorar em silencio devolveria a lista inteira sem ninguem perceber.
  assert.throws(
    () => normalizeContractStateFilter('quitado'),
    (err) => err.status === 422 && err.details?.field === 'state'
  );
});

test('decodeGroupCursor: round-trip e teto de grupo por pagina', () => {
  const cursor = { g: 3, pd: '2026-07-10', seq: 42 };
  assert.deepEqual(decodeGroupCursor(encodeGroupCursor(cursor), { maxGroup: 3 }), cursor);
  // 🔴 O teto e por PAGINA: o cursor do g3 de /contratos nao pode ser aceito pelo
  // /financeiro, que so tem 3 grupos — cursor de outra lista vira 1a pagina.
  assert.equal(decodeGroupCursor(encodeGroupCursor(cursor), { maxGroup: 2 }), null);
  assert.deepEqual(
    decodeGroupCursor(encodeGroupCursor({ g: 0, pd: null, seq: 7 }), { maxGroup: 3 }),
    { g: 0, pd: null, seq: 7 }
  );
  // Malformado nao explode: cai na 1a pagina.
  assert.equal(decodeGroupCursor('nao-e-base64url-de-json', { maxGroup: 3 }), null);
  assert.equal(decodeGroupCursor('', { maxGroup: 3 }), null);
  assert.equal(decodeGroupCursor(undefined, { maxGroup: 3 }), null);
  assert.equal(
    decodeGroupCursor(encodeGroupCursor({ g: 0, pd: '10/07/2026', seq: 1 }), { maxGroup: 3 }),
    null
  );
  assert.equal(
    decodeGroupCursor(encodeGroupCursor({ g: -1, pd: null, seq: 1 }), { maxGroup: 3 }),
    null
  );
});

test('groupKeysetWhere: o /financeiro (default dateGroups=[0]) segue intacto', () => {
  // O helper ganhou um 2o chamador quando /contratos passou a ordenar por
  // urgencia. Se ele quebrar, quebra a CARTEIRA tambem — por isso o default
  // continua sendo exatamente o que o Financeiro precisava.
  const pd = new Date('2026-07-10T00:00:00.000Z');
  assert.deepEqual(groupKeysetWhere({ g: 0, pd: '2026-07-10', seq: 5 }), {
    OR: [
      { paymentDate: { gt: pd } },
      { paymentDate: null },
      { AND: [{ paymentDate: pd }, { contractSeq: { gt: 5 } }] },
    ],
  });
  // Cauda dos nulos (nulls-last): dali pra frente so o seq avanca.
  assert.deepEqual(groupKeysetWhere({ g: 0, pd: null, seq: 5 }), {
    AND: [{ paymentDate: null }, { contractSeq: { gt: 5 } }],
  });
  // Arquivo (seq desc): "depois" = seq menor.
  assert.deepEqual(groupKeysetWhere({ g: 1, pd: null, seq: 5 }), { contractSeq: { lt: 5 } });
  assert.deepEqual(groupKeysetWhere({ g: 2, pd: '2026-07-10', seq: 5 }), {
    contractSeq: { lt: 5 },
  });
});

test('groupKeysetWhere: em /contratos o g1 TAMBEM e por data', () => {
  // Sem isto o grupo "aberto" pagina como arquivo e o keyset compara a coluna
  // errada — a rolagem repetiria e pularia contratos no meio do grupo.
  const opts = { dateGroups: CONTRACT_DATE_GROUPS };
  const pd = new Date('2026-08-20T00:00:00.000Z');
  assert.deepEqual(groupKeysetWhere({ g: 1, pd: '2026-08-20', seq: 9 }, opts), {
    OR: [
      { paymentDate: { gt: pd } },
      { paymentDate: null },
      { AND: [{ paymentDate: pd }, { contractSeq: { gt: 9 } }] },
    ],
  });
  // E os terminais seguem sendo arquivo.
  assert.deepEqual(groupKeysetWhere({ g: 2, pd: null, seq: 9 }, opts), {
    contractSeq: { lt: 9 },
  });
  assert.deepEqual(groupKeysetWhere({ g: 3, pd: null, seq: 9 }, opts), {
    contractSeq: { lt: 9 },
  });
});

// ── RC-D85/D86: finalizeBlockReason — a unica trava do "Finalizar" ───────────
// 🔴 Nao confundir com o portao AP18 (RC-D66): aquele exigia a APROVACAO enviada e
// travava por causa de outro objeto. Este olha uma data do proprio contrato.

test('finalizeBlockReason: antes do faturamento trava; a partir dele libera', () => {
  const row = { invoiceDate: '2026-07-12T00:00:00.000Z' };
  assert.equal(finalizeBlockReason(row, '2026-07-11'), 'before_invoice_date');
  // "A PARTIR de" inclui o proprio dia — e o dia em que a nota acompanha a carga.
  assert.equal(finalizeBlockReason(row, '2026-07-12'), null);
  assert.equal(finalizeBlockReason(row, '2026-07-13'), null);
});

test('finalizeBlockReason (RC-D86): sem data planejada nao finaliza', () => {
  assert.equal(finalizeBlockReason({ invoiceDate: null }, '2026-07-12'), 'invoice_date_missing');
});

test('finalizeBlockReason: no dia do faturamento ja libera, e a agenda ainda cobra ele', () => {
  // As duas regras leem a mesma data com corte diferente, de proposito: no dia 12 o
  // "Finalizar" JA esta liberado ("a partir de", RC-D85) e a agenda ainda diz
  // "faturamento" — porque a nota nao foi observada, so planejada. As duas coisas
  // convivem no mesmo cartao: a frase cobra, o menu permite.
  const row = agendaRow({ invoiceDate: '2026-07-12T00:00:00.000Z' });
  assert.equal(finalizeBlockReason(row, '2026-07-12'), null);
  assert.deepEqual(deriveContractAgenda(row, '2026-07-12'), {
    kind: 'faturamento',
    dayKey: '2026-07-12',
  });
  // Finalizado, o compromisso desaparece — nao ha mais o que cobrar.
  assert.equal(
    deriveContractAgenda({ ...row, status: 'FINALIZADO' }, '2026-07-12').kind,
    'finalizado'
  );
});

// ── RC-D111: o front pergunta a MESMA coisa que o backend ────────────────────
// A Conferência habilita "Gerar espelho" pela `espelhoSideEligibility`; o servidor
// decide pelo `assertEspelhoEligible`. Se as duas divergirem, o operador ou clica num
// botão que responde 409, ou vê um botão apagado num espelho que sairia. Antes o front
// só perguntava "algum lado sai" — e não conhecia o gate da parte.
test('espelhoSideEligibility: paridade com assertEspelhoEligible, gate a gate', async () => {
  const { espelhoSideEligibility } = await import('../lib/espelho.ts');
  const withName = { displayName: 'Fazenda Boa Vista' };
  const contracts = [];
  for (const status of ['RASCUNHO', 'EMITIDO', 'FINALIZADO', 'WASH_OUT']) {
    for (const washoutBillable of [true, false, null]) {
      for (const sellerBrokeragePct of [0, 2]) {
        for (const buyerBrokeragePct of [0, 1.5]) {
          for (const sellerSnapshot of [withName, null, {}]) {
            contracts.push({
              status,
              washoutBillable,
              sellerBrokeragePct,
              buyerBrokeragePct,
              sellerSnapshot,
              buyerSnapshot: withName,
            });
          }
        }
      }
    }
  }
  let allowed = 0;
  for (const contract of contracts) {
    for (const side of ['seller', 'buyer']) {
      let backendOk = true;
      try {
        assertEspelhoEligible(contract, side);
      } catch {
        backendOk = false;
      }
      const frontOk = espelhoSideEligibility(contract, side).eligible;
      assert.equal(
        frontOk,
        backendOk,
        `divergiu em ${side} de ${JSON.stringify(contract)}: front=${frontOk} back=${backendOk}`
      );
      if (backendOk) allowed += 1;
    }
  }
  // Sanidade da varredura: a paridade seria trivial se nada passasse.
  assert.ok(allowed > 0, 'a varredura não cobriu nenhum caso elegível');
  assert.ok(allowed < contracts.length * 2, 'a varredura não cobriu nenhum caso recusado');
});
