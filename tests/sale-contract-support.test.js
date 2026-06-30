import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertBrokersResolved,
  buildReceivableView,
  buildSaleContractDraftFromSale,
  computeContractMoney,
  computeContractMoneyWithAgio,
  formatContractNumber,
  normalizeBrokeragePct,
  normalizeBrokerIds,
  normalizeEtapa2Input,
  normalizeRequiredAgio,
  normalizeUnitPrice,
  normalizeWashoutReason,
  resolveRevertTarget,
  toSaleContractView,
} from '../src/sale-contracts/sale-contract-support.js';

const UUID_1 = '00000000-0000-4000-8000-000000000001';
const UUID_2 = '00000000-0000-4000-8000-000000000002';
const UUID_3 = '00000000-0000-4000-8000-000000000003';
const UUID_4 = '00000000-0000-4000-8000-000000000004';

function validEtapa2() {
  return {
    expectedVersion: 0,
    sellerBankAccountId: UUID_1,
    paymentFormId: UUID_2,
    modalityId: UUID_3,
    packagingId: UUID_4,
    invoiceDate: '2026-07-10',
    paymentDate: '2026-07-20',
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

test('buildSaleContractDraftFromSale: monta o rascunho EM_ABERTO', () => {
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
  assert.equal(draft.status, 'EM_ABERTO');
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
    status: 'EM_ABERTO',
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

test('resolveRevertTarget: FATURADO sempre volta a CONFIRMADO', () => {
  assert.equal(resolveRevertTarget('FATURADO', true), 'CONFIRMADO');
  assert.equal(resolveRevertTarget('FATURADO', false), 'CONFIRMADO');
});

test('resolveRevertTarget: PAGO volta a FATURADO se houve faturamento, senao a CONFIRMADO', () => {
  assert.equal(resolveRevertTarget('PAGO', true), 'FATURADO');
  assert.equal(resolveRevertTarget('PAGO', false), 'CONFIRMADO');
});

test('resolveRevertTarget: status fora do ciclo retorna null', () => {
  for (const status of ['EM_ABERTO', 'CONFERIR', 'CONFIRMADO', 'WASH_OUT']) {
    assert.equal(resolveRevertTarget(status, true), null);
    assert.equal(resolveRevertTarget(status, false), null);
  }
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
    contractNumber: '0007/26',
    contractDate: new Date('2026-06-26T00:00:00.000Z'),
    status: 'CONFIRMADO',
    totalValue: 10000,
    sellerBrokeragePct: 0.6,
    sellerBrokerageValue: 60,
    buyerBrokeragePct: 0.4,
    buyerBrokerageValue: 40,
    ...overrides,
  };
}

test('buildReceivableView (ADMIN): commissionTotal + cota igual por corretor', () => {
  const view = buildReceivableView(
    receivableRow(),
    [
      { brokerId: 'b1', brokerNameSnapshot: 'Ana' },
      { brokerId: 'b2', brokerNameSnapshot: 'Bia' },
    ],
    { isAdmin: true }
  );
  assert.equal(view.commissionTotal, 100); // 60 + 40
  assert.equal(view.brokerCount, 2);
  assert.equal(view.totalValue, 10000);
  assert.deepEqual(
    view.brokers.map((b) => [b.name, b.share]),
    [
      ['Ana', 50],
      ['Bia', 50],
    ]
  );
  assert.equal(view.myShare, undefined);
});

test('buildReceivableView (COMMERCIAL): so a propria cota, sem a lista de corretores', () => {
  const view = buildReceivableView(
    receivableRow({ status: 'PAGO', sellerBrokerageValue: 150, buyerBrokerageValue: 150 }),
    [
      { brokerId: 'b1', brokerNameSnapshot: 'Ana' },
      { brokerId: 'b2', brokerNameSnapshot: 'Bia' },
      { brokerId: 'b3', brokerNameSnapshot: 'Cau' },
    ],
    { isAdmin: false }
  );
  assert.equal(view.commissionTotal, 300);
  assert.equal(view.brokerCount, 3);
  assert.equal(view.myShare, 100); // 300 / 3
  assert.equal(view.brokers, undefined);
});

test('buildReceivableView: 1 corretor recebe o total; soma com round2', () => {
  const view = buildReceivableView(
    receivableRow({ sellerBrokerageValue: 3.33, buyerBrokerageValue: 3.34 }),
    [{ brokerId: 'b1', brokerNameSnapshot: 'Ana' }],
    { isAdmin: true }
  );
  assert.equal(view.commissionTotal, 6.67); // 3.33 + 3.34
  assert.equal(view.brokerCount, 1);
  assert.equal(view.brokers[0].share, 6.67);
});
