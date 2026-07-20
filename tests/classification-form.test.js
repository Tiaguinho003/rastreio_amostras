import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_CLASSIFICATION_FORM,
  buildClassificationDataPayload,
  hasAnyExtractedValue,
  mapExtractionToForm,
  validateClassificationForm,
} from '../lib/classification-form.ts';

// Shape ANINHADO real que a extracao da IA retorna (espelha
// src/samples/fixtures/extraction-example.json e raw.classificacao).
const NESTED = {
  padrao: 'L4 P3',
  aspecto: 'GC',
  certif: null,
  peneiras: {
    p18: null,
    p17: '38',
    p16: null,
    mk: '8',
    p15: null,
    p14: null,
    p13: null,
    p12: null,
    p11: null,
    p10: null,
  },
  fundos: [
    { peneira: '13', percentual: '3' },
    { peneira: null, percentual: null },
  ],
  catacao: '33',
  defeitos: { imp: '0,1', pva: null, broca: '1', gpi: null, ap: null, defeito: null },
  observacoes: 'otelita',
  bebida: null,
};

// Regressao do bug critico: antes, mapExtractionToForm lia chaves flat num
// objeto aninhado -> peneiras/fundos/defeitos NUNCA pre-preenchiam.

test('mapExtractionToForm: peneiras aninhadas chegam ao form', () => {
  const m = mapExtractionToForm(NESTED);
  assert.equal(m.peneiraP17, '38');
  assert.equal(m.peneiraMk, '8');
  // celulas vazias (null) nao geram chave no form
  assert.equal('peneiraP18' in m, false);
});

test('mapExtractionToForm: fundos aninhados chegam ao form', () => {
  const m = mapExtractionToForm(NESTED);
  assert.equal(m.fundo1Peneira, '13');
  assert.equal(m.fundo1Percent, '3');
  assert.equal('fundo2Peneira' in m, false);
});

test('mapExtractionToForm: defeitos aninhados chegam ao form (imp incluso)', () => {
  const m = mapExtractionToForm(NESTED);
  // imp era 'impureza' no map antigo e nunca casava
  assert.equal(m.imp, '0,1');
  assert.equal(m.broca, '1');
  assert.equal('pva' in m, false);
});

test('mapExtractionToForm: campos de nivel raiz continuam funcionando', () => {
  const m = mapExtractionToForm(NESTED);
  assert.equal(m.padrao, 'L4 P3');
  assert.equal(m.aspecto, 'GC');
  assert.equal(m.catacao, '33');
  assert.equal(m.observacoes, 'otelita');
  // certif/bebida null nao geram chave
  assert.equal('certif' in m, false);
});

test('mapExtractionToForm: grupos ausentes/null nao quebram', () => {
  const m = mapExtractionToForm({
    padrao: 'X',
    aspecto: null,
    certif: null,
    peneiras: null,
    fundos: null,
    catacao: null,
    defeitos: null,
    observacoes: null,
    bebida: null,
  });
  assert.equal(m.padrao, 'X');
  assert.equal('peneiraP17' in m, false);
  assert.equal('imp' in m, false);
  assert.equal('fundo1Peneira' in m, false);
});

// CL37 (auditoria 2026-07-13): buildClassificationDataPayload e
// validateClassificationForm nao tinham NENHUM teste — o contrato
// form -> payload (coercao numerica, agrupamento null) e a validacao
// 0-100 ficavam descobertos.

test('buildClassificationDataPayload: form vazio gera payload todo null', () => {
  const p = buildClassificationDataPayload(EMPTY_CLASSIFICATION_FORM);
  assert.equal(p.padrao, null);
  assert.equal(p.bebida, null);
  assert.equal(p.peneiras, null);
  assert.equal(p.fundos, null);
  assert.equal(p.defeitos, null);
  // dataClassificacao NAO e gerada no cliente (CL29) — backend carimba.
  assert.equal('dataClassificacao' in p, false);
});

test('buildClassificationDataPayload: coercao numerica (virgula -> ponto) e trim', () => {
  const p = buildClassificationDataPayload({
    ...EMPTY_CLASSIFICATION_FORM,
    padrao: '  L4-P3  ',
    catacao: '0,5',
    peneiraP17: '38,5',
    peneiraMk: '8',
    fundo1Peneira: '13',
    fundo1Percent: '3',
    imp: ' 0,1 ',
  });
  assert.equal(p.padrao, 'L4-P3');
  // catacao e texto no payload (string|null) — vai cru trimado.
  assert.equal(p.catacao, '0,5');
  assert.equal(p.peneiras?.p17, 38.5);
  assert.equal(p.peneiras?.mk, 8);
  // peneiras nao preenchidas ficam null dentro do grupo.
  assert.equal(p.peneiras?.p18, null);
  // fundos: sempre tupla de 2 quando algum campo preenchido.
  assert.equal(p.fundos?.length, 2);
  assert.deepEqual(p.fundos?.[0], { peneira: '13', percentual: 3 });
  assert.deepEqual(p.fundos?.[1], { peneira: null, percentual: null });
  assert.equal(p.defeitos?.imp, '0,1');
  assert.equal(p.defeitos?.defeito, null);
});

test('validateClassificationForm: aceita vazio, decimais com virgula e limites 0/100', () => {
  assert.equal(validateClassificationForm(EMPTY_CLASSIFICATION_FORM), null);
  assert.equal(
    validateClassificationForm({
      ...EMPTY_CLASSIFICATION_FORM,
      peneiraP17: '38,5',
      fundo1Percent: '0',
      fundo2Percent: '100',
    }),
    null
  );
});

test('validateClassificationForm: barra nao-numerico e fora da faixa 0-100 nos campos numericos', () => {
  assert.notEqual(
    validateClassificationForm({ ...EMPTY_CLASSIFICATION_FORM, peneiraP17: 'abc' }),
    null
  );
  assert.notEqual(
    validateClassificationForm({ ...EMPTY_CLASSIFICATION_FORM, peneiraP17: '250' }),
    null
  );
  assert.notEqual(
    validateClassificationForm({ ...EMPTY_CLASSIFICATION_FORM, fundo1Percent: '-1' }),
    null
  );
});

test('hasAnyExtractedValue: detecta extracao 100% vazia vs parcial', () => {
  // EXT (rodada 1): Flow A com nada extraido cai no aviso de ilegivel em vez
  // de abrir o review em branco sem explicacao.
  assert.equal(hasAnyExtractedValue({}), false);
  assert.equal(
    hasAnyExtractedValue({
      padrao: null,
      aspecto: null,
      certif: null,
      peneiras: { p18: null, p17: null },
      fundos: [
        { peneira: null, percentual: null },
        { peneira: null, percentual: null },
      ],
      catacao: null,
      defeitos: { imp: null },
      observacoes: null,
      bebida: null,
    }),
    false
  );
  assert.equal(hasAnyExtractedValue({ peneiras: { p17: '38' } }), true);
  assert.equal(hasAnyExtractedValue({ fundos: [{ peneira: '13', percentual: null }] }), true);
});
