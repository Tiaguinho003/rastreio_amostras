// Testes do motor do Informativo Meteorologico.
//
// Mesmo padrao do informativo-mercado.test.js: o layout e puro, entao a
// geometria roda aqui sem navegador, com o measure injetado por um stub
// deterministico. As assertivas importantes sao VERTICAIS (zona segura, folga,
// alturas) e ARITMETICAS (o encaixe do print), que nao dependem da largura real
// da Poppins.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMeteoLayout, PANEL_H, PREVISAO_PAD } from '../lib/informativos/meteo-layout.ts';
import {
  fitContain,
  inset,
  textExtent,
  MIN_GAP,
  SAFE_TOP,
  SAFE_BOT,
  W,
  H,
} from '../lib/informativos/story-layout.ts';
import {
  formatTemperatura,
  formatUmidade,
  formatPluviosidade,
  isBlankNumber,
  maskTemperatura,
  maskUmidade,
  maskPluviosidade,
} from '../lib/informativos/format.ts';

const measure = (text, _weight, size, tracking) =>
  text.length * size * 0.55 + tracking * Math.max(0, text.length - 1);

// O print real do Flavio: a linha de 7 dias recortada do widget do MSN.
const PRINT_REAL = { w: 1023, h: 327 };

const REFERENCE = {
  dataTexto: '16 de julho de 2026',
  temperatura: '15,5',
  umidade: '68',
  maxima: '22,1',
  minima: '13,7',
  pluviosidade: '0,0',
  previsao: PRINT_REAL,
  registroHoras: 24,
};

// Tudo no maior tamanho plausivel: negativos (geada) e 3 digitos.
const FAT = {
  dataTexto: '30 de novembro de 2026',
  temperatura: '-10,5',
  umidade: '100',
  maxima: '-11,9',
  minima: '-12,3',
  pluviosidade: '999,9',
  previsao: { w: 4000, h: 200 },
  registroHoras: 24,
};

const SEM_PRINT = { ...REFERENCE, previsao: null };

const EPS = 1e-9;
const box = { x: 100, y: 200, w: 936, h: 436 };

// ---------------------------------------------------------------------------
// fitContain — aritmetica pura do encaixe
// ---------------------------------------------------------------------------

test('fitContain preserva a proporcao de um print largo', () => {
  const r = fitContain({ w: 1600, h: 400 }, box);
  assert.ok(r);
  // Limitado pela largura: 936 / 1600 = 0,585
  assert.ok(Math.abs(r.w - 936) < EPS, `w=${r.w}`);
  assert.ok(Math.abs(r.h - 234) < EPS, `h=${r.h}`);
  assert.ok(Math.abs(r.w / r.h - 1600 / 400) < EPS, 'proporcao distorcida');
});

test('fitContain preserva a proporcao de um print alto', () => {
  const r = fitContain({ w: 400, h: 1600 }, box);
  assert.ok(r);
  // Limitado pela altura: 436 / 1600 = 0,2725
  assert.ok(Math.abs(r.h - 436) < EPS, `h=${r.h}`);
  assert.ok(Math.abs(r.w - 109) < EPS, `w=${r.w}`);
  assert.ok(Math.abs(r.w / r.h - 400 / 1600) < EPS, 'proporcao distorcida');
});

test('fitContain com a proporcao exata do box preenche sem sobra', () => {
  const r = fitContain({ w: box.w * 2, h: box.h * 2 }, box);
  assert.ok(r);
  assert.ok(Math.abs(r.x - box.x) < EPS);
  assert.ok(Math.abs(r.y - box.y) < EPS);
  assert.ok(Math.abs(r.w - box.w) < EPS);
  assert.ok(Math.abs(r.h - box.h) < EPS);
});

test('fitContain nunca excede o box', () => {
  const casos = [
    { w: 1600, h: 400 },
    { w: 400, h: 1600 },
    { w: 4000, h: 200 },
    { w: 1, h: 5000 },
    { w: 1023, h: 327 },
  ];
  for (const c of casos) {
    const r = fitContain(c, box);
    assert.ok(r, `${c.w}x${c.h} devolveu null`);
    assert.ok(r.w <= box.w + EPS, `${c.w}x${c.h}: w=${r.w} passou de ${box.w}`);
    assert.ok(r.h <= box.h + EPS, `${c.w}x${c.h}: h=${r.h} passou de ${box.h}`);
    assert.ok(r.x >= box.x - EPS && r.y >= box.y - EPS, `${c.w}x${c.h}: origem fora do box`);
    assert.ok(
      r.x + r.w <= box.x + box.w + EPS && r.y + r.h <= box.y + box.h + EPS,
      `${c.w}x${c.h}: extremidade fora do box`
    );
  }
});

test('fitContain centraliza nos dois eixos', () => {
  for (const c of [
    { w: 1600, h: 400 },
    { w: 400, h: 1600 },
  ]) {
    const r = fitContain(c, box);
    const folgaEsq = r.x - box.x;
    const folgaDir = box.x + box.w - (r.x + r.w);
    const folgaTopo = r.y - box.y;
    const folgaBase = box.y + box.h - (r.y + r.h);
    assert.ok(Math.abs(folgaEsq - folgaDir) < EPS, `X descentrado: ${folgaEsq} vs ${folgaDir}`);
    assert.ok(Math.abs(folgaTopo - folgaBase) < EPS, `Y descentrado: ${folgaTopo} vs ${folgaBase}`);
  }
});

test('fitContain AMPLIA print pequeno — sem trava de upscale', () => {
  // Decisao explicita do Flavio: prefere o campo cheio e borrado a uma imagem
  // pequena e nitida. Se alguem "consertar" isso com um cap de escala, quebra
  // aqui de proposito.
  const r = fitContain({ w: 300, h: 100 }, box);
  assert.ok(r);
  assert.ok(r.w > 300, `nao ampliou: w=${r.w}`);
  assert.ok(Math.abs(r.w - 936) < EPS, `deveria encher a largura: w=${r.w}`);
});

test('fitContain devolve null para dimensao degenerada', () => {
  assert.equal(fitContain({ w: 0, h: 0 }, box), null);
  assert.equal(fitContain({ w: 100, h: 0 }, box), null);
  assert.equal(fitContain({ w: 0, h: 100 }, box), null);
  assert.equal(fitContain({ w: NaN, h: 100 }, box), null);
  assert.equal(fitContain({ w: 100, h: Infinity }, box), null);
  assert.equal(fitContain({ w: -10, h: 100 }, box), null);
});

// ---------------------------------------------------------------------------
// buildMeteoLayout — geometria
// ---------------------------------------------------------------------------

test('a peca e 1080x1920', () => {
  const layout = buildMeteoLayout(REFERENCE, measure);
  assert.equal(layout.width, W);
  assert.equal(layout.height, H);
});

test('as alturas das secoes e a folga sao as da especificacao', () => {
  const layout = buildMeteoLayout(REFERENCE, measure);
  assert.deepEqual(layout.sectionHeights, [152, 284, 516]);
  assert.equal(
    layout.sectionHeights.reduce((a, b) => a + b, 0),
    952
  );
  assert.equal(layout.gap, 47);
});

test('a folga nao colapsa nem com os campos no maior tamanho', () => {
  for (const [nome, data] of [
    ['REFERENCE', REFERENCE],
    ['FAT', FAT],
    ['SEM_PRINT', SEM_PRINT],
  ]) {
    const layout = buildMeteoLayout(data, measure);
    assert.ok(layout.gap >= MIN_GAP, `${nome}: gap ${layout.gap} < ${MIN_GAP}`);
  }
});

test('nenhum texto sai da zona segura do story (INF8)', () => {
  // A regra que o .docx original violava: logo em y=50 e rodape em y~1780, os
  // dois invisiveis sob a interface do Instagram.
  for (const [nome, data] of [
    ['REFERENCE', REFERENCE],
    ['FAT', FAT],
    ['SEM_PRINT', SEM_PRINT],
  ]) {
    const layout = buildMeteoLayout(data, measure);
    const textos = layout.ops.filter((op) => op.kind === 'text');
    assert.ok(textos.length > 0);
    for (const op of textos) {
      const { top, bottom } = textExtent(op);
      assert.ok(top >= SAFE_TOP, `${nome}: "${op.text}" comeca em ${top}, acima de ${SAFE_TOP}`);
      assert.ok(
        bottom <= SAFE_BOT,
        `${nome}: "${op.text}" termina em ${bottom}, abaixo de ${SAFE_BOT}`
      );
    }
  }
});

test('as imagens ficam na zona segura', () => {
  const layout = buildMeteoLayout(REFERENCE, measure);
  const imagens = layout.ops.filter((op) => op.kind === 'image');
  // 2 logos (header + rodape) + o print da previsao
  assert.equal(imagens.length, 3);
  for (const op of imagens) {
    assert.ok(op.y >= SAFE_TOP, `imagem ${op.asset} comeca em ${op.y}`);
    assert.ok(op.y + op.h <= SAFE_BOT, `imagem ${op.asset} termina em ${op.y + op.h}`);
  }
});

test('o rodape do meteorologico tambem tem os icones, na zona segura (INF57)', () => {
  // Vem da casca — as duas pecas compartilham o rodape.
  const layout = buildMeteoLayout(REFERENCE, measure);
  const icons = layout.ops.filter((op) => op.kind === 'path');
  assert.equal(icons.length, 3);
  for (const op of icons) {
    assert.ok(op.y >= SAFE_TOP, `icone comeca em ${op.y}`);
    assert.ok(op.y + op.size <= SAFE_BOT, `icone termina em ${op.y + op.size}`);
  }
});

test('o print nunca alcanca o canto arredondado do painel', () => {
  // Esta assertiva e o que substitui um clip() no desenhador: se o print
  // couber DENTRO do painel menos o padding, o canto quadrado da imagem nunca
  // aparece por cima do canto redondo.
  for (const data of [REFERENCE, FAT, { ...REFERENCE, previsao: { w: 300, h: 100 } }]) {
    const layout = buildMeteoLayout(data, measure);
    const painel = layout.ops.find(
      (op) => op.kind === 'rect' && op.radius === 14 && op.h === PANEL_H
    );
    const img = layout.ops.find((op) => op.kind === 'image' && op.asset === 'previsao');
    assert.ok(painel && img);
    const seguro = inset({ x: painel.x, y: painel.y, w: painel.w, h: painel.h }, PREVISAO_PAD);
    assert.ok(img.x >= seguro.x - EPS, `x=${img.x} < ${seguro.x}`);
    assert.ok(img.y >= seguro.y - EPS, `y=${img.y} < ${seguro.y}`);
    assert.ok(img.x + img.w <= seguro.x + seguro.w + EPS, 'passa da direita');
    assert.ok(img.y + img.h <= seguro.y + seguro.h + EPS, 'passa da base');
  }
});

test('sem print o painel continua la e o layout NAO flexiona (P2)', () => {
  const com = buildMeteoLayout(REFERENCE, measure);
  const sem = buildMeteoLayout(SEM_PRINT, measure);

  const imgSem = sem.ops.filter((op) => op.kind === 'image' && op.asset === 'previsao');
  assert.equal(imgSem.length, 0, 'sem print nao deveria emitir a imagem');

  const painelSem = sem.ops.find(
    (op) => op.kind === 'rect' && op.radius === 14 && op.h === PANEL_H
  );
  assert.ok(painelSem, 'o painel branco tem que ser emitido mesmo sem print');

  // O que prova o P2: a peca do dia sem print e a do dia com print tem
  // exatamente a mesma geometria.
  assert.deepEqual(sem.sectionHeights, com.sectionHeights);
  assert.equal(sem.gap, com.gap);
  const painelCom = com.ops.find(
    (op) => op.kind === 'rect' && op.radius === 14 && op.h === PANEL_H
  );
  assert.deepEqual(
    { x: painelSem.x, y: painelSem.y, w: painelSem.w, h: painelSem.h },
    { x: painelCom.x, y: painelCom.y, w: painelCom.w, h: painelCom.h }
  );
});

test('o titulo METEOROLOGICO nao invade o logo do header', () => {
  // NOTA HONESTA: com o measure stub isto documenta o ORCAMENTO de largura, nao
  // prova a metrica real da Poppins. A prova e a conferencia visual — mesma
  // classe da INF8.
  const layout = buildMeteoLayout(REFERENCE, measure);
  const titulo = layout.ops.find((op) => op.kind === 'text' && op.text === 'METEOROLÓGICO');
  const kicker = layout.ops.find((op) => op.kind === 'text' && op.text === 'INFORMATIVO');
  const logo = layout.ops.find((op) => op.kind === 'image' && op.y === 206);
  assert.ok(titulo && kicker && logo);
  assert.equal(titulo.size, 60);

  const larguraTitulo = measure(titulo.text, titulo.weight, titulo.size, titulo.tracking);
  const esquerdaTitulo = titulo.x - larguraTitulo; // align: 'right'
  const direitaLogo = logo.x + logo.w;
  assert.ok(
    esquerdaTitulo >= direitaLogo,
    `o titulo comeca em ${esquerdaTitulo} e o logo termina em ${direitaLogo}`
  );
});

test('o rotulo do registro segue o registroHoras: 24h no dia, 72h na segunda', () => {
  const header = (data) =>
    buildMeteoLayout(data, measure).ops.find(
      (op) => op.kind === 'text' && typeof op.text === 'string' && op.text.startsWith('REGISTRO EM')
    );
  assert.equal(header(REFERENCE).text, 'REGISTRO EM 24h');
  assert.equal(header({ ...REFERENCE, registroHoras: 72 }).text, 'REGISTRO EM 72h');
});

// ---------------------------------------------------------------------------
// Unidades e mascaras (INF19/INF33)
// ---------------------------------------------------------------------------

test('o layout veste a unidade — o usuario digita so o numero (INF19)', () => {
  assert.equal(formatTemperatura('27,4'), '27,4 °C');
  assert.equal(formatUmidade('68'), '68 %');
  assert.equal(formatPluviosidade('12,0'), '12,0 mm');
});

test('campo vazio nao vira unidade orfa', () => {
  assert.equal(formatTemperatura(''), '');
  assert.equal(formatUmidade(''), '');
  assert.equal(formatPluviosidade(''), '');
});

test('temperatura negativa sobrevive a mascara (geada)', () => {
  // O maskDecimalInput do currency.ts come o sinal (onlyDigits). Numa manha de
  // geada no Sul de Minas a peca publicaria "1,5 °C" no lugar de "-1,5 °C".
  assert.equal(maskTemperatura('-15'), '-1,5');
  assert.equal(maskTemperatura('-123'), '-12,3');
  assert.equal(formatTemperatura(maskTemperatura('-15')), '-1,5 °C');
});

test('o sinal em transito nao some nem vira valor', () => {
  // Ao teclar "-" ainda nao ha digito: se a mascara devolvesse "", o sinal
  // sumiria e seria impossivel digitar um negativo.
  assert.equal(maskTemperatura('-'), '-');
  // Mas "-" sozinho e campo VAZIO, nao um numero.
  assert.ok(isBlankNumber('-'));
  assert.ok(isBlankNumber(''));
  assert.ok(!isBlankNumber('0,0'));
  assert.equal(formatTemperatura('-'), '');
});

test('so o sinal INICIAL conta — "3-5" nao e negativo', () => {
  assert.equal(maskTemperatura('35'), '3,5');
  assert.equal(maskTemperatura('3-5'), '3,5');
});

test('as casas por campo saem conforme a INF33', () => {
  assert.equal(maskTemperatura('155'), '15,5');
  assert.equal(maskUmidade('68'), '68');
  assert.equal(maskPluviosidade('120'), '12,0');
});

test('umidade e pluviosidade nao aceitam negativo', () => {
  assert.equal(maskUmidade('-68'), '68');
  assert.equal(maskPluviosidade('-120'), '12,0');
});
