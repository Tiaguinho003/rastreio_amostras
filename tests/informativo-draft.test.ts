// Testes do estado do preenchimento dos Informativos.
//
// Molde: tests/samples-list-reducer.test.ts. O reducer e puro, entao o toggle
// do meteo e o destaque por secao rodam aqui sem React.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInformativoDraft,
  informativoDraftReducer as reduce,
  isDraftDirty,
  missingMercado,
  missingMeteo,
  toMercadoData,
  toMeteoData,
  type InformativoDraft,
} from '../lib/informativos/informativo-draft.ts';
import { EMPTY_SLOW_FIELDS, type SlowFields } from '../lib/informativos/slow-fields-store.ts';

const SLOW: SlowFields = {
  bolsaLabel: 'BOLSA NY - SET/26',
  safra: '25/26',
  futuroAnoA: '2026',
  futuroAnoB: '2027',
  cprAnoA: '2026',
  cprAnoB: '2027',
  mesA1: 'SET',
  mesB1: 'MAR',
  mesA2: 'DEZ',
  mesB2: 'MAI',
};

/** Draft com o Mercado inteiro preenchido. */
function cheio(): InformativoDraft {
  const base = createInformativoDraft(SLOW);
  return reduce(base, {
    type: 'patch-mercado',
    patch: {
      bolsa: '292,65',
      variacaoDir: 'alta',
      variacao: '20',
      dolar: '5,2303',
      fisicoPreco: '1.960,00',
      precoA1: '1.990,00',
      precoB1: '2.050,00',
      precoA2: '2.010,00',
      precoB2: '2.080,00',
      cprA: '1.900,00',
      cprB: '1.950,00',
    },
  });
}

const METEO_CHEIO = {
  temperatura: '15,5',
  umidade: '68',
  maxima: '22,1',
  minima: '13,7',
  pluviosidade: '0,0',
};

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

test('o draft nasce com o meteorologico incluido e nada submetido', () => {
  const d = createInformativoDraft(null);
  assert.equal(d.incluiMeteo, true);
  assert.deepEqual(d.slow, EMPTY_SLOW_FIELDS);
  assert.deepEqual(d.submitted, { mercado: false, meteo: false });
});

test('os campos lentos entram pre-preenchidos, os do dia nao (INF36)', () => {
  const d = createInformativoDraft(SLOW);
  assert.equal(d.slow.bolsaLabel, 'BOLSA NY - SET/26');
  // O que impede publicar o valor de ontem por distracao.
  assert.equal(d.mercado.bolsa, '');
  assert.equal(d.mercado.dolar, '');
  assert.equal(d.mercado.variacaoDir, null);
  assert.equal(d.meteo.temperatura, '');
});

// ---------------------------------------------------------------------------
// Meteo opcional
// ---------------------------------------------------------------------------

test('desligar o meteorologico tira ele da geracao', () => {
  const d = reduce(cheio(), { type: 'set-inclui-meteo', inclui: false });
  assert.equal(d.incluiMeteo, false);
});

test('religar o meteorologico volta a inclui-lo', () => {
  let d = reduce(cheio(), { type: 'set-inclui-meteo', inclui: false });
  assert.equal(d.incluiMeteo, false);
  d = reduce(d, { type: 'set-inclui-meteo', inclui: true });
  assert.equal(d.incluiMeteo, true);
});

test('alternar o meteorologico nao perde o que foi digitado', () => {
  // Sem maquina de fases, nada e desmontado — o toggle so vira a flag.
  let d = reduce(cheio(), { type: 'patch-meteo', patch: METEO_CHEIO });
  d = reduce(d, { type: 'set-inclui-meteo', inclui: false });
  d = reduce(d, { type: 'set-inclui-meteo', inclui: true });

  assert.equal(d.mercado.bolsa, '292,65');
  assert.equal(d.mercado.variacaoDir, 'alta');
  assert.equal(d.slow.mesA1, 'SET');
  assert.equal(d.meteo.temperatura, '15,5');
  assert.equal(d.meteo.pluviosidade, '0,0');
});

// ---------------------------------------------------------------------------
// INF28 escopada por secao
// ---------------------------------------------------------------------------

test('marcar uma secao como submetida nao liga o destaque da outra', () => {
  // A INF28 passa a valer dentro da secao tentada: quem so tentou baixar o
  // mercado nao pode ver os campos do meteorologico em vermelho.
  const d = reduce(createInformativoDraft(null), { type: 'mark-submitted', secao: 'mercado' });
  assert.equal(d.submitted.mercado, true);
  assert.equal(d.submitted.meteo, false);
});

// ---------------------------------------------------------------------------
// missing
// ---------------------------------------------------------------------------

test('missingMercado lista os 21 controles quando tudo esta em branco', () => {
  assert.equal(missingMercado(createInformativoDraft(null)).size, 21);
});

test('missingMercado fica vazio com tudo preenchido', () => {
  assert.equal(missingMercado(cheio()).size, 0);
});

test('missingMercado pega a direcao da variacao nao escolhida', () => {
  const d = reduce(cheio(), { type: 'patch-mercado', patch: { variacaoDir: null } });
  assert.deepEqual([...missingMercado(d)], ['variacaoDir']);
});

test('missingMeteo cobra o print da previsao', () => {
  assert.ok(missingMeteo(METEO_CHEIO, false).has('previsao'));
  assert.equal(missingMeteo(METEO_CHEIO, true).size, 0);
});

test('missingMeteo lista os 5 campos + o print quando tudo esta em branco', () => {
  const vazio = { temperatura: '', umidade: '', maxima: '', minima: '', pluviosidade: '' };
  assert.equal(missingMeteo(vazio, false).size, 6);
});

test('so o sinal digitado ainda conta como campo vazio', () => {
  // "-" e o sinal em transito, antes do primeiro digito — nao e um valor.
  const m = missingMeteo({ ...METEO_CHEIO, minima: '-' }, true);
  assert.deepEqual([...m], ['minima']);
});

test('zero e um valor, nao um campo vazio', () => {
  // 0,0 mm de chuva e a informacao mais comum da peca em julho.
  assert.equal(missingMeteo({ ...METEO_CHEIO, pluviosidade: '0,0' }, true).size, 0);
});

test('temperatura negativa e um valor (geada)', () => {
  assert.equal(missingMeteo({ ...METEO_CHEIO, minima: '-1,5' }, true).size, 0);
});

// ---------------------------------------------------------------------------
// dirty
// ---------------------------------------------------------------------------

test('draft novo nao esta sujo, nem com os campos lentos pre-preenchidos', () => {
  // Os lentos vem da ultima geracao: fechar sem digitar nada nao perde nada.
  assert.equal(isDraftDirty(createInformativoDraft(SLOW)), false);
});

test('qualquer valor do dia suja o draft', () => {
  assert.equal(
    isDraftDirty(
      reduce(createInformativoDraft(SLOW), { type: 'patch-mercado', patch: { bolsa: '1' } })
    ),
    true
  );
  assert.equal(
    isDraftDirty(
      reduce(createInformativoDraft(SLOW), { type: 'patch-meteo', patch: { temperatura: '1' } })
    ),
    true
  );
});

test('so escolher a direcao da variacao ja suja o draft', () => {
  const d = reduce(createInformativoDraft(null), {
    type: 'patch-mercado',
    patch: { variacaoDir: 'alta' },
  });
  assert.equal(isDraftDirty(d), true);
});

// ---------------------------------------------------------------------------
// Projecao para os motores de layout
// ---------------------------------------------------------------------------

test('toMercadoData monta o shape que o layout espera', () => {
  const data = toMercadoData(cheio(), '16 de julho de 2026');
  assert.equal(data.dataTexto, '16 de julho de 2026');
  assert.equal(data.bolsaLabel, 'BOLSA NY - SET/26');
  assert.equal(data.variacaoDir, 'alta');
  assert.equal(data.futuro.length, 2);
  assert.deepEqual(data.futuro[0], {
    mesA: 'SET',
    precoA: '1.990,00',
    mesB: 'MAR',
    precoB: '2.050,00',
  });
});

test('toMercadoData sem direcao escolhida nao quebra o layout', () => {
  const d = reduce(cheio(), { type: 'patch-mercado', patch: { variacaoDir: null } });
  assert.equal(toMercadoData(d, 'x').variacaoDir, 'baixa');
});

test('toMeteoData carrega o TAMANHO do print, nao a imagem', () => {
  const data = toMeteoData(METEO_CHEIO, '16 de julho de 2026', { w: 1023, h: 327 });
  assert.deepEqual(data.previsao, { w: 1023, h: 327 });
  assert.equal(data.temperatura, '15,5');
  assert.equal(toMeteoData(METEO_CHEIO, 'x', null).previsao, null);
});
