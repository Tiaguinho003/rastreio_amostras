import test from 'node:test';
import assert from 'node:assert/strict';

// RC-D114: a barra de TEMPO do card de /contratos e a frase ao lado dela. As duas
// sao puras e vivem no front (`lib/contract-timeline.ts`) — o servidor manda os
// ingredientes, e derivar aqui evita um campo que envelheceria a meia-noite dentro
// de um payload cacheado. `--experimental-strip-types` deixa este teste .js importar
// o .ts direto (mesmo molde do teste de paridade do espelho).
const { contractTimeProgress, contractCountdownLabel, dayDiff } =
  await import('../lib/contract-timeline.ts');

const TODAY = '2026-07-10';
const row = (over = {}) => ({
  contractDate: '2026-07-01T00:00:00.000Z',
  paymentDate: '2026-07-21T00:00:00.000Z',
  status: 'EMITIDO',
  ...over,
});

// ── contractTimeProgress ─────────────────────────────────────────────────────

test('contractTimeProgress: no meio do caminho a fracao e o tempo corrido', () => {
  // 01/07 -> 21/07 sao 20 dias; hoje e 10/07, ou 9 dias corridos.
  const { pct, tone } = contractTimeProgress(row(), TODAY);
  assert.equal(tone, 'running');
  assert.equal(pct, 9 / 20);
});

test('contractTimeProgress: os terminais enchem a barra, com tons DIFERENTES', () => {
  // RC-D84: finalizar significa que o contrato inteiro aconteceu.
  assert.deepEqual(contractTimeProgress(row({ status: 'FINALIZADO' }), TODAY), {
    pct: 1,
    tone: 'done',
  });
  // 🔴 RC-D115: washout e LARANJA, nao vermelho — o vermelho ficou reservado ao
  // atraso, o unico estado que pede acao hoje.
  assert.deepEqual(contractTimeProgress(row({ status: 'WASH_OUT' }), TODAY), {
    pct: 1,
    tone: 'cancelled',
  });
  // E os terminais vencem a data: um contrato finalizado depois do vencimento nao
  // e "atrasado" — ele acabou.
  assert.equal(
    contractTimeProgress(
      { ...row({ status: 'FINALIZADO' }), paymentDate: '2026-06-01T00:00:00.000Z' },
      TODAY
    ).tone,
    'done'
  );
});

test('contractTimeProgress: passou do pagamento = cheia e vermelha', () => {
  assert.deepEqual(contractTimeProgress(row({ paymentDate: '2026-07-09T00:00:00.000Z' }), TODAY), {
    pct: 1,
    tone: 'late',
  });
  // No PROPRIO dia ainda nao atrasou — o corte e estritamente depois, igual ao do
  // servidor (`paymentDate < brtToday`).
  assert.notEqual(
    contractTimeProgress(row({ paymentDate: TODAY + 'T00:00:00.000Z' }), TODAY).tone,
    'late'
  );
});

test('contractTimeProgress: sem prazo NAO desenha trilho', () => {
  // "A definir" (D144) e um estado legitimo do contrato Futuro. Trilho vazio
  // inventaria um prazo que ele nao tem.
  assert.deepEqual(contractTimeProgress(row({ paymentDate: null }), TODAY), {
    pct: null,
    tone: 'running',
  });
  // Sem data de contrato nao ha de onde medir.
  assert.equal(contractTimeProgress(row({ contractDate: null }), TODAY).pct, null);
});

test('contractTimeProgress: span nulo ou invertido nao divide por zero', () => {
  const mesmoDia = '2026-07-21T00:00:00.000Z';
  assert.equal(
    contractTimeProgress(row({ contractDate: mesmoDia, paymentDate: mesmoDia }), TODAY).pct,
    null
  );
  // Contrato depois do pagamento (dado torto): sem fracao, so a frase.
  assert.equal(
    contractTimeProgress(
      row({ contractDate: '2026-08-01T00:00:00.000Z', paymentDate: '2026-07-21T00:00:00.000Z' }),
      TODAY
    ).pct,
    null
  );
});

test('contractTimeProgress: a fracao e travada em 0..1', () => {
  // Hoje ANTES da emissao (contrato lancado com data futura): 0, nao negativo.
  assert.equal(contractTimeProgress(row(), '2026-06-15').pct, 0);
  // Hoje no dia do pagamento: cheia, e sem passar de 1.
  assert.equal(contractTimeProgress(row(), '2026-07-21').pct, 1);
});

// ── contractCountdownLabel ───────────────────────────────────────────────────

test('contractCountdownLabel: os terminais e a aprovacao nao contam dias', () => {
  assert.equal(contractCountdownLabel({ kind: 'cancelado', dayKey: null }, TODAY), 'Cancelado');
  assert.equal(contractCountdownLabel({ kind: 'finalizado', dayKey: null }, TODAY), 'Concluído');
  // A aprovacao e ACAO, nao prazo: o `dayKey` dela e a data de FATURAMENTO, e
  // "aprovacao em 3 dias" leria como se ela vencesse.
  assert.equal(
    contractCountdownLabel({ kind: 'aprovacao', dayKey: '2026-07-13' }, TODAY),
    'Aprovação a enviar'
  );
  assert.equal(
    contractCountdownLabel({ kind: 'nenhum', dayKey: null }, TODAY),
    'Sem prazo definido'
  );
});

test('contractCountdownLabel: faturamento e pagamento contam pra frente', () => {
  assert.equal(
    contractCountdownLabel({ kind: 'faturamento', dayKey: '2026-07-13' }, TODAY),
    'Fatura em 3 dias'
  );
  assert.equal(
    contractCountdownLabel({ kind: 'pagamento', dayKey: '2026-07-22' }, TODAY),
    'Paga em 12 dias'
  );
  // Singular.
  assert.equal(
    contractCountdownLabel({ kind: 'faturamento', dayKey: '2026-07-11' }, TODAY),
    'Fatura em 1 dia'
  );
  assert.equal(
    contractCountdownLabel({ kind: 'pagamento', dayKey: '2026-07-11' }, TODAY),
    'Paga em 1 dia'
  );
  // HOJE nao e "em 0 dias".
  assert.equal(
    contractCountdownLabel({ kind: 'faturamento', dayKey: TODAY }, TODAY),
    'Fatura hoje'
  );
  assert.equal(contractCountdownLabel({ kind: 'pagamento', dayKey: TODAY }, TODAY), 'Paga hoje');
});

test('contractCountdownLabel: o vencido conta pra tras', () => {
  assert.equal(
    contractCountdownLabel({ kind: 'pagamento_vencido', dayKey: '2026-07-06' }, TODAY),
    'Venceu há 4 dias'
  );
  assert.equal(
    contractCountdownLabel({ kind: 'pagamento_vencido', dayKey: '2026-07-09' }, TODAY),
    'Venceu há 1 dia'
  );
});

test('contractCountdownLabel: sem data, o compromisso de data nao inventa contagem', () => {
  // A agenda so devolve `faturamento`/`pagamento` com dayKey; a guarda existe pra o
  // payload legado (contrato sem agenda) nao imprimir "em NaN dias".
  assert.equal(
    contractCountdownLabel({ kind: 'faturamento', dayKey: null }, TODAY),
    'Sem prazo definido'
  );
  assert.equal(
    contractCountdownLabel({ kind: 'pagamento_vencido', dayKey: null }, TODAY),
    'Pagamento vencido'
  );
});

test('dayDiff: dias inteiros, com sinal, atravessando mes e ano', () => {
  assert.equal(dayDiff('2026-07-10', '2026-07-13'), 3);
  assert.equal(dayDiff('2026-07-13', '2026-07-10'), -3);
  assert.equal(dayDiff('2026-07-31', '2026-08-01'), 1);
  assert.equal(dayDiff('2026-12-31', '2027-01-01'), 1);
  assert.equal(dayDiff('2026-07-10', '2026-07-10'), 0);
});
