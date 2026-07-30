import test from 'node:test';
import assert from 'node:assert/strict';

// As duas perguntas que a ABA Espelho (RC-D124) faz e que dá para responder sem tela:
// "qual documento cada lado mostra?" (`latestEspelhoBySide`) e "este lado sai?"
// (`espelhoSideEligibility`, os 4 gates do `assertEspelhoEligible`).
// `--experimental-strip-types` deixa este teste .js importar o .ts direto.
const { latestEspelhoBySide, espelhoSideEligibility, espelhoSides } =
  await import('../lib/espelho.ts');

// ── latestEspelhoBySide ──────────────────────────────────────────────────────
// Item de timeline de um espelho ENTREGUE. Os defaults são o caso bom: existe,
// não venceu, não foi substituído.
const espelho = (over = {}) => ({
  id: over.id ?? `tl-${over.logId ?? 'x'}`,
  kind: 'ESPELHO',
  at: '2026-07-28T12:00:00.000Z',
  actorUserId: null,
  actorName: 'Flavio',
  side: 'seller',
  logId: 'log-1',
  available: true,
  superseded: false,
  ...over,
});

test('latestEspelhoBySide: um lado entregue devolve aquele lado só', () => {
  const found = latestEspelhoBySide([espelho({ side: 'seller', logId: 'log-a' })]);
  assert.equal(found.seller?.logId, 'log-a');
  assert.equal(found.buyer, undefined);
});

test('latestEspelhoBySide: dois lados devolvem um bloco de cada', () => {
  const found = latestEspelhoBySide([
    espelho({ side: 'buyer', logId: 'log-b' }),
    espelho({ side: 'seller', logId: 'log-a' }),
  ]);
  assert.equal(found.seller?.logId, 'log-a');
  assert.equal(found.buyer?.logId, 'log-b');
});

test('latestEspelhoBySide: SUPERSEDED nao entra — o lado fica com o mais novo', () => {
  // A timeline vem decrescente: o não-substituído é o primeiro. Mas a garantia
  // aqui é o filtro, não a ordem — por isso o antigo vem ANTES na lista.
  const found = latestEspelhoBySide([
    espelho({ side: 'seller', logId: 'log-velho', superseded: true }),
    espelho({ side: 'seller', logId: 'log-novo' }),
  ]);
  assert.equal(found.seller?.logId, 'log-novo');
});

test('latestEspelhoBySide: expirado (available false) nao entra', () => {
  // RC-D105: a linha do histórico FICA depois de o documento sair; abrir, não.
  const found = latestEspelhoBySide([
    espelho({ side: 'seller', logId: 'log-a', available: false }),
  ]);
  assert.deepEqual(found, {});
});

test('latestEspelhoBySide: marco legado (sem side/logId) nao entra', () => {
  const found = latestEspelhoBySide([
    { id: 'tl-legado', kind: 'ESPELHO', at: '2025-01-02T00:00:00.000Z', legacy: true },
    espelho({ side: 'seller', logId: 'log-a' }),
  ]);
  assert.equal(found.seller?.logId, 'log-a');
  assert.equal(Object.keys(found).length, 1);
});

test('latestEspelhoBySide: itens que nao sao ESPELHO passam batido', () => {
  const found = latestEspelhoBySide([
    { id: 'tl-1', kind: 'STATUS', at: '2026-07-29T00:00:00.000Z', toStatus: 'FINALIZADO' },
    { id: 'tl-2', kind: 'AGIO', at: '2026-07-28T00:00:00.000Z' },
  ]);
  assert.deepEqual(found, {});
});

test('latestEspelhoBySide: timeline vazia ou nula devolve mapa vazio', () => {
  assert.deepEqual(latestEspelhoBySide([]), {});
  assert.deepEqual(latestEspelhoBySide(null), {});
  assert.deepEqual(latestEspelhoBySide(undefined), {});
});

test('latestEspelhoBySide: com dois vivos do mesmo lado fica o PRIMEIRO (timeline desc)', () => {
  const found = latestEspelhoBySide([
    espelho({ side: 'seller', logId: 'log-recente', at: '2026-07-29T00:00:00.000Z' }),
    espelho({ side: 'seller', logId: 'log-antigo', at: '2026-07-20T00:00:00.000Z' }),
  ]);
  assert.equal(found.seller?.logId, 'log-recente');
});

// ── espelhoSideEligibility ───────────────────────────────────────────────────
// RC-D111: é ela que decide o "Gerar espelho" de CADA bloco. Errar aqui manda o
// operador para um 409 garantido — ou esconde um espelho que sairia.
const contrato = (over = {}) => ({
  status: 'EMITIDO',
  washoutBillable: null,
  sellerBrokeragePct: 1,
  buyerBrokeragePct: 1,
  sellerSnapshot: { displayName: 'Fazenda Santa Rita' },
  buyerSnapshot: { displayName: 'Exportadora XY' },
  ...over,
});

test('espelhoSideEligibility: contrato completo libera os dois lados', () => {
  assert.equal(espelhoSideEligibility(contrato(), 'seller').eligible, true);
  assert.equal(espelhoSideEligibility(contrato(), 'buyer').eligible, true);
});

test('espelhoSideEligibility: washout SEM cobranca nao emite (fail-closed)', () => {
  // `!== true`, não `=== false`: washout sem resposta gravada também não cobra —
  // é o mesmo fail-closed do `isWashoutNotBillable` no backend.
  for (const billable of [false, null, undefined]) {
    const check = espelhoSideEligibility(
      contrato({ status: 'WASH_OUT', washoutBillable: billable }),
      'seller'
    );
    assert.equal(check.eligible, false, `washoutBillable=${billable}`);
    assert.match(check.reason, /sem cobran/i);
  }
});

test('espelhoSideEligibility: washout COM cobranca emite', () => {
  const check = espelhoSideEligibility(
    contrato({ status: 'WASH_OUT', washoutBillable: true }),
    'seller'
  );
  assert.equal(check.eligible, true);
});

test('espelhoSideEligibility: lado sem corretagem nao sai, o outro sai', () => {
  const row = contrato({ sellerBrokeragePct: 0 });
  const seller = espelhoSideEligibility(row, 'seller');
  assert.equal(seller.eligible, false);
  assert.match(seller.reason, /corretagem no lado vendedor/i);
  assert.equal(espelhoSideEligibility(row, 'buyer').eligible, true);
});

test('espelhoSideEligibility: sem parte cadastrada o papel sairia sem destinatario', () => {
  // RC-D110: o gate existe porque o PDF sairia com o total real e "CLIENTE: —".
  const semNome = espelhoSideEligibility(contrato({ buyerSnapshot: {} }), 'buyer');
  assert.equal(semNome.eligible, false);
  assert.match(semNome.reason, /comprador cadastrado/i);

  const semSnap = espelhoSideEligibility(contrato({ sellerSnapshot: null }), 'seller');
  assert.equal(semSnap.eligible, false);
  assert.match(semSnap.reason, /vendedor cadastrado/i);
});

test('espelhoSideEligibility: nome em branco conta como sem parte', () => {
  const check = espelhoSideEligibility(
    contrato({ sellerSnapshot: { displayName: '   ' } }),
    'seller'
  );
  assert.equal(check.eligible, false);
});

test('espelhoSideEligibility: a ordem dos gates — situacao vem ANTES da corretagem', () => {
  // Um washout sem cobrança E sem corretagem no lado tem que responder pela
  // SITUAÇÃO. Se a ordem invertesse, o motivo na tela seria o secundário.
  const check = espelhoSideEligibility(
    contrato({ status: 'WASH_OUT', washoutBillable: false, sellerBrokeragePct: 0 }),
    'seller'
  );
  assert.match(check.reason, /sem cobran/i);
});

test('espelhoSides: só os lados com corretagem > 0 viram bloco', () => {
  assert.deepEqual(espelhoSides(contrato()), ['seller', 'buyer']);
  assert.deepEqual(espelhoSides(contrato({ sellerBrokeragePct: 0 })), ['buyer']);
  assert.deepEqual(espelhoSides(contrato({ buyerBrokeragePct: null })), ['seller']);
  assert.deepEqual(espelhoSides(contrato({ sellerBrokeragePct: 0, buyerBrokeragePct: 0 })), []);
});
