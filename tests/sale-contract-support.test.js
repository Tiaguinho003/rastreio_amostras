import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  APPROVAL_ELIGIBLE_STATUSES,
  assertBrokersResolved,
  buildApprovalPrefill,
  buildContractTimeline,
  buildReceivableView,
  buildSaleContractDraftFromSale,
  computeContractMoney,
  computeContractMoneyWithAgio,
  formatContractNumber,
  normalizeBrokeragePct,
  normalizeBrokerIds,
  normalizeContractLookupInput,
  normalizeEtapa2Input,
  normalizeRequiredAgio,
  normalizeUnitPrice,
  normalizeWashoutReason,
  splitOriginLotForLabel,
  toApprovalContractOption,
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
    contractNumber: '0007/26',
    contractDate: new Date('2026-06-26T00:00:00.000Z'),
    status: 'EMITIDO',
    totalValue: 10000,
    sellerBrokeragePct: 0.6,
    sellerBrokerageValue: 60,
    buyerBrokeragePct: 0.4,
    buyerBrokerageValue: 40,
    ...overrides,
  };
}

test('buildReceivableView: commissionTotal + cota igual por corretor (divisao exata)', () => {
  const view = buildReceivableView(receivableRow(), [
    { brokerId: 'b1', brokerNameSnapshot: 'Ana' },
    { brokerId: 'b2', brokerNameSnapshot: 'Bia' },
  ]);
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
});

test('buildReceivableView (D129): resto de centavos no 1º corretor — a soma bate com o total', () => {
  const view = buildReceivableView(
    receivableRow({ status: 'PAGO', sellerBrokerageValue: 60, buyerBrokerageValue: 40 }),
    [
      { brokerId: 'b1', brokerNameSnapshot: 'Ana' },
      { brokerId: 'b2', brokerNameSnapshot: 'Bia' },
      { brokerId: 'b3', brokerNameSnapshot: 'Cau' },
    ]
  );
  assert.equal(view.commissionTotal, 100);
  assert.equal(view.brokerCount, 3);
  // 100 / 3 = 33,33... → base 33,33; o 1º absorve o resto (33,34).
  assert.deepEqual(
    view.brokers.map((b) => b.share),
    [33.34, 33.33, 33.33]
  );
  const soma = view.brokers.reduce((sum, b) => sum + b.share, 0);
  assert.equal(Math.round(soma * 100) / 100, view.commissionTotal);
});

test('buildReceivableView: 1 corretor recebe o total; soma com round2', () => {
  const view = buildReceivableView(
    receivableRow({ sellerBrokerageValue: 3.33, buyerBrokerageValue: 3.34 }),
    [{ brokerId: 'b1', brokerNameSnapshot: 'Ana' }]
  );
  assert.equal(view.commissionTotal, 6.67); // 3.33 + 3.34
  assert.equal(view.brokerCount, 1);
  assert.equal(view.brokers[0].share, 6.67);
});

// ---------------------------------------------------------------------------
// Aprovacao do contrato (Fase I, D112-D119): quebra do lote de origem (D116),
// prefill da etiqueta (D115) e item reduzido do seletor (D113).

test('splitOriginLotForLabel separa por traco, espaco, virgula e ponto-e-virgula (colapsa sequencias)', () => {
  assert.deepEqual(splitOriginLotForLabel('111- 222,333 ; 444'), ['111', '222', '333', '444']);
});

test('splitOriginLotForLabel NAO separa por barra (composicao do lote)', () => {
  assert.deepEqual(splitOriginLotForLabel('AB 12/3-CD'), ['AB', '12/3', 'CD']);
});

test('splitOriginLotForLabel corta pedaco em 16 chars e limita a 16 pedacos', () => {
  assert.deepEqual(splitOriginLotForLabel('A'.repeat(20)), ['A'.repeat(16)]);

  const many = Array.from({ length: 20 }, (_, i) => `L${i + 1}`).join(' ');
  const result = splitOriginLotForLabel(many);
  assert.equal(result.length, 16);
  assert.equal(result[0], 'L1');
  assert.equal(result[15], 'L16');
});

test('splitOriginLotForLabel: null/vazio/so separadores viram []', () => {
  assert.deepEqual(splitOriginLotForLabel(null), []);
  assert.deepEqual(splitOriginLotForLabel(''), []);
  assert.deepEqual(splitOriginLotForLabel(' -,; - '), []);
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

test('toApprovalContractOption expoe SO os campos do allowlist (trava anti-vazamento)', () => {
  const option = toApprovalContractOption({
    id: 'id-1',
    contractNumber: '0003/26',
    contractDate: new Date('2026-07-01T00:00:00Z'),
    quantitySacks: 200,
    status: 'EMITIDO',
    buyerSnapshot: { displayName: 'Comprador X', cnpj: 'nunca-sair' },
    unitPrice: '2500.00',
    totalValue: '500000.00',
    sellerSnapshot: { displayName: 'nunca-sair' },
  });
  assert.deepEqual(Object.keys(option).sort(), [
    'buyerName',
    'contractDate',
    'contractNumber',
    'id',
    'quantitySacks',
    'status',
  ]);
  assert.equal(option.buyerName, 'Comprador X');
});

test('toApprovalContractOption: buyerSnapshot nulo vira buyerName null', () => {
  const option = toApprovalContractOption({
    id: 'id-2',
    contractNumber: '0004/26',
    contractDate: new Date('2026-07-02T00:00:00Z'),
    quantitySacks: 50,
    status: 'PAGO',
    buyerSnapshot: null,
  });
  assert.equal(option.buyerName, null);
});

test('APPROVAL_ELIGIBLE_STATUSES = EMITIDO/FATURADO/PAGO (WASH_OUT fora)', () => {
  assert.deepEqual([...APPROVAL_ELIGIBLE_STATUSES], ['EMITIDO', 'FATURADO', 'PAGO']);
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

test('buildContractTimeline: marcos legados entram SO quando nao ha StatusLog correspondente', () => {
  const contract = {
    invoicedAt: '2026-07-10T00:00:00Z',
    paidAt: '2026-07-20T00:00:00Z',
    washoutAt: null,
    washoutReason: null,
  };
  const semLog = buildContractTimeline({ contract });
  assert.deepEqual(
    semLog.map((item) => [item.kind, item.toStatus, item.legacy, item.actorName]),
    [
      ['STATUS', 'PAGO', true, null],
      ['STATUS', 'FATURADO', true, null],
    ]
  );

  const comLog = buildContractTimeline({
    contract,
    statusLogs: [
      {
        id: 's1',
        toStatus: 'FATURADO',
        reason: null,
        actorUserId: 'u1',
        createdAt: '2026-07-10T12:00:00Z',
      },
      {
        id: 's2',
        toStatus: 'PAGO',
        reason: null,
        actorUserId: 'u1',
        createdAt: '2026-07-20T12:00:00Z',
      },
    ],
    usersById: { u1: { id: 'u1', fullName: null, username: 'italo' } },
  });
  // Nada duplica: 2 marcos auditados, zero legados; nome cai pro username.
  assert.equal(comLog.length, 2);
  assert.ok(comLog.every((item) => item.legacy === false));
  assert.ok(comLog.every((item) => item.actorName === 'italo'));
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
