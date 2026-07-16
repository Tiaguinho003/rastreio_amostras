// Testes do motor do Informativo de Mercado.
//
// O mercado-layout.ts e puro de proposito: nao toca no canvas, entao a
// geometria (a parte com regra) roda aqui sem navegador. O measure e injetado
// com um stub deterministico — as assertivas importantes sao VERTICAIS (zona
// segura, folga, alturas), que nao dependem da largura real do texto.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMercadoLayout,
  textExtent,
  COLORS,
  MIN_GAP,
  SAFE_TOP,
  SAFE_BOT,
  W,
  H,
} from '../lib/informativos/mercado-layout.ts';
import {
  formatUsc,
  formatDolar,
  formatPreco,
  formatVariacao,
  maskSafraInput,
  maskBolsa,
  maskDolar,
  maskPreco,
  maskUpperInput,
  MAX_LEN,
} from '../lib/informativos/format.ts';
import { formatDateExtensoLocal, formatDateIsoLocal } from '../lib/date-br.ts';

// Stub: largura proporcional ao numero de caracteres. Deterministico e
// suficiente — nenhuma assertiva daqui depende da metrica real da Poppins.
const measure = (text, _weight, size, tracking) =>
  text.length * size * 0.55 + tracking * Math.max(0, text.length - 1);

const REFERENCE = {
  dataTexto: '25 de março de 2026',
  bolsaLabel: 'BOLSA NY — MAI/26',
  bolsa: '292,65',
  variacaoDir: 'baixa',
  variacao: '20',
  dolar: '5,2303',
  safra: '25/26',
  fisicoPreco: '1.960,00',
  futuroAnoA: '2026',
  futuroAnoB: '2027',
  futuro: [
    { mesA: 'AGO', precoA: '1.690,00', mesB: 'AGO', precoB: '1.620,00' },
    { mesA: 'SET', precoA: '1.605,00', mesB: 'SET', precoB: '1.555,00' },
  ],
  cprAnoA: '2026',
  cprAnoB: '2027',
  cprA: '1.545,00',
  cprB: '1.245,00',
};

// Caso "gordo": todo texto livre no limite de caracteres (INF37).
const FAT = {
  ...REFERENCE,
  bolsaLabel: 'X'.repeat(MAX_LEN.bolsaLabel),
  bolsa: '99.999,99',
  dolar: '99,9999',
  variacao: '9.999',
  fisicoPreco: '99.999,00',
  futuro: [
    {
      mesA: 'X'.repeat(MAX_LEN.mes),
      precoA: '99.999,00',
      mesB: 'X'.repeat(MAX_LEN.mes),
      precoB: '99.999,00',
    },
    {
      mesA: 'X'.repeat(MAX_LEN.mes),
      precoA: '99.999,00',
      mesB: 'X'.repeat(MAX_LEN.mes),
      precoB: '99.999,00',
    },
  ],
  cprA: '99.999,00',
  cprB: '99.999,00',
};

test('canvas tem as dimensoes do story', () => {
  const layout = buildMercadoLayout(REFERENCE, measure);
  assert.equal(layout.width, 1080);
  assert.equal(layout.height, 1920);
  assert.equal(W, 1080);
  assert.equal(H, 1920);
});

test('as 4 secoes tem as alturas naturais da spec (§5)', () => {
  const { sectionHeights } = buildMercadoLayout(REFERENCE, measure);
  // resumo 56+3*76 | fisico 56+46+96 | futuro 56+46+2*74 | cpr 56+46+82
  assert.deepEqual(sectionHeights, [284, 198, 250, 184]);
  assert.equal(
    sectionHeights.reduce((a, b) => a + b, 0),
    916
  );
});

test('a folga entre secoes nao colapsa — conteudo de referencia', () => {
  const { gap } = buildMercadoLayout(REFERENCE, measure);
  assert.ok(gap >= MIN_GAP, `gap ${gap} abaixo do limiar ${MIN_GAP}`);
  assert.ok(Math.abs(gap - 130 / 3) < 0.01, `gap esperado ~43,3 e veio ${gap}`);
});

test('a folga nao colapsa nem com todo texto livre no limite', () => {
  const { gap } = buildMercadoLayout(FAT, measure);
  assert.ok(gap >= MIN_GAP, `gap ${gap} abaixo do limiar ${MIN_GAP}`);
});

// A regra INF8 — e exatamente o que o layout do .docx violava: logo em y=50
// (sob a foto de perfil) e rodape em y~1780 (sob a barra de resposta).
test('nenhum texto cai fora da zona segura do story (INF8)', () => {
  for (const data of [REFERENCE, FAT]) {
    const { ops } = buildMercadoLayout(data, measure);
    const texts = ops.filter((op) => op.kind === 'text');
    assert.ok(texts.length > 0);
    for (const op of texts) {
      const { top, bottom } = textExtent(op);
      assert.ok(
        top >= SAFE_TOP,
        `"${op.text}" comeca em ${top}, acima da zona segura (${SAFE_TOP})`
      );
      assert.ok(
        bottom <= SAFE_BOT,
        `"${op.text}" termina em ${bottom}, abaixo da zona segura (${SAFE_BOT})`
      );
    }
  }
});

test('o logo tambem fica dentro da zona segura', () => {
  const { ops } = buildMercadoLayout(REFERENCE, measure);
  const images = ops.filter((op) => op.kind === 'image');
  assert.equal(images.length, 2); // header + rodape
  for (const op of images) {
    assert.ok(op.y >= SAFE_TOP, `logo comeca em ${op.y}`);
    assert.ok(op.y + op.h <= SAFE_BOT, `logo termina em ${op.y + op.h}`);
  }
});

test('as faixas verdes sangram ate as bordas', () => {
  const { ops } = buildMercadoLayout(REFERENCE, measure);
  const bleeds = ops.filter(
    (op) => op.kind === 'rect' && op.fill === COLORS.green && op.x === 0 && op.w === 1080
  );
  // header (y=0) e rodape (ate y=1920)
  assert.ok(bleeds.some((op) => op.y === 0));
  assert.ok(bleeds.some((op) => op.y + op.h === 1920));
});

test('a data sai em caixa alta na pilula', () => {
  const { ops } = buildMercadoLayout(REFERENCE, measure);
  const pill = ops.find((op) => op.kind === 'text' && op.text.includes('MARÇO'));
  assert.ok(pill, 'pilula da data nao encontrada');
  assert.equal(pill.text, '25 DE MARÇO DE 2026');
});

// --- INF20/INF40: a direcao e a fonte unica da seta, do sinal e da cor ---

test('variacao de baixa: seta pra baixo, menos e vermelho no valor E na seta', () => {
  const { ops } = buildMercadoLayout({ ...REFERENCE, variacaoDir: 'baixa' }, measure);
  const tri = ops.find((op) => op.kind === 'triangle');
  assert.ok(tri);
  assert.equal(tri.down, true);
  assert.equal(tri.fill, COLORS.red);

  const value = ops.find((op) => op.kind === 'text' && op.text === '-20 pts');
  assert.ok(value, 'valor "-20 pts" nao encontrado');
  assert.equal(value.fill, COLORS.red);
});

test('variacao de alta: seta pra cima, mais e verde no valor E na seta', () => {
  const { ops } = buildMercadoLayout({ ...REFERENCE, variacaoDir: 'alta' }, measure);
  const tri = ops.find((op) => op.kind === 'triangle');
  assert.ok(tri);
  assert.equal(tri.down, false);
  assert.equal(tri.fill, COLORS.greenL);

  const value = ops.find((op) => op.kind === 'text' && op.text === '+20 pts');
  assert.ok(value, 'valor "+20 pts" nao encontrado');
  assert.equal(value.fill, COLORS.greenL);
});

test('a seta fica a esquerda do valor, fora da celula do rotulo', () => {
  const { ops } = buildMercadoLayout(REFERENCE, measure);
  const tri = ops.find((op) => op.kind === 'triangle');
  const value = ops.find((op) => op.kind === 'text' && op.text === '-20 pts');
  assert.ok(tri.cx < value.x, 'seta deveria estar a esquerda do valor');
  assert.ok(tri.cx > 540, 'seta invadiu a metade esquerda da linha');
});

// --- INF19: o usuario digita so o numero; o sistema veste a unidade ---

test('as unidades sao vestidas pelo layout, nunca digitadas', () => {
  assert.equal(formatUsc('292,65'), '292,65 Usc/lp');
  assert.equal(formatDolar('5,2303'), '5,2303 R$/US$');
  assert.equal(formatPreco('1.960,00'), 'R$ 1.960,00');
  assert.equal(formatVariacao('baixa', '20'), '-20 pts');
  assert.equal(formatVariacao('alta', '20'), '+20 pts');
});

test('campo vazio nao vira unidade orfa', () => {
  assert.equal(formatUsc(''), '');
  assert.equal(formatDolar(''), '');
  assert.equal(formatPreco(''), '');
  assert.equal(formatVariacao('alta', ''), '');
});

// A classe de erro do .docx original: "R$ 1690,00" + um ",00" solto colado por
// duas caixas de texto sobrepostas, publicado como "R$ 1690,00,00".
test('a mascara torna impossivel o R$ 1690,00,00 do docx original', () => {
  assert.equal(formatPreco(maskPreco('169000')), 'R$ 1.690,00');
  assert.equal(formatPreco(maskPreco('R$ 1.690,00')), 'R$ 1.690,00');

  // O ponto do teste: por mais lixo que entre, o que SAI e sempre uma moeda
  // bem-formada — exatamente uma virgula, com 2 casas. O "1690,00,00" do docx
  // nao tem como se formar, porque virgulas e pontos digitados sao descartados
  // e a formatacao e reconstruida do zero a partir dos digitos.
  const BEM_FORMADO = /^R\$ \d{1,3}(\.\d{3})*,\d{2}$/;
  for (const lixo of ['1690,00,00', 'R$ 1.690,00', '1.6.9.0,,00', '169000', 'abc169000xyz']) {
    const saida = formatPreco(maskPreco(lixo));
    assert.match(saida, BEM_FORMADO, `"${lixo}" produziu "${saida}"`);
  }

  // E os digitos preservam a ordem: o ",00" solto vira magnitude, nao sintaxe.
  assert.equal(formatPreco(maskPreco('1690,00,00')), 'R$ 169.000,00');
});

test('cada campo tem as suas casas decimais (INF33)', () => {
  assert.equal(maskBolsa('29265'), '292,65'); // 2 casas
  assert.equal(maskDolar('52303'), '5,2303'); // 4 casas — o motivo de generalizar a mascara
  assert.equal(maskPreco('196000'), '1.960,00'); // 2 casas
});

test('mascara da safra: 2526 -> 25/26 (INF39)', () => {
  assert.equal(maskSafraInput('2526'), '25/26');
  assert.equal(maskSafraInput('25'), '25');
  assert.equal(maskSafraInput('2'), '2');
  assert.equal(maskSafraInput(''), '');
  assert.equal(maskSafraInput('25/26'), '25/26');
  assert.equal(maskSafraInput('252699'), '25/26'); // cap em 4 digitos
});

test('texto livre sobe pra caixa alta e respeita o limite (INF18/INF37)', () => {
  assert.equal(maskUpperInput('Bolsa NY - mai/26', MAX_LEN.bolsaLabel), 'BOLSA NY - MAI/26');
  assert.equal(maskUpperInput('ago', MAX_LEN.mes), 'AGO');
  assert.equal(maskUpperInput('X'.repeat(80), MAX_LEN.bolsaLabel).length, MAX_LEN.bolsaLabel);
});

// --- INF17: data local, nunca UTC ---

test('data por extenso usa o relogio local', () => {
  // 1o de janeiro de 2026, 21h local — em UTC ja seria dia 2. O informativo
  // tem que dizer 1 de janeiro.
  const date = new Date(2026, 0, 1, 21, 30);
  assert.equal(formatDateExtensoLocal(date), '1 de janeiro de 2026');
  assert.equal(formatDateIsoLocal(date), '2026-01-01');
});

test('data ISO do nome do arquivo tem zero a esquerda', () => {
  assert.equal(formatDateIsoLocal(new Date(2026, 6, 5)), '2026-07-05');
  assert.equal(formatDateIsoLocal(new Date(2026, 11, 31)), '2026-12-31');
});
