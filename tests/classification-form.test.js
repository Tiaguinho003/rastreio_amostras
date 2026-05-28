import test from 'node:test';
import assert from 'node:assert/strict';

import { mapExtractionToForm } from '../lib/classification-form.ts';

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
