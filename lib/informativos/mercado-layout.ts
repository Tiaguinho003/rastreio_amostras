// Layout do Informativo de Mercado — PURO, sem canvas.
//
// Traduz os dados do formulario na lista de operacoes de desenho ja
// posicionadas. Nao toca em CanvasRenderingContext2D: quem pinta e o
// mercado-draw.ts. Essa separacao existe para que a geometria (a parte com
// regra) seja testavel sem navegador — ver tests/informativo-mercado.test.js.
//
// Fonte das medidas: docs/Informativos-Plano-de-Trabalho.md §5. Divergencia
// intencional daqui vira decisao INFn no ledger.

import { formatDolar, formatPreco, formatUsc, formatVariacao, type VariacaoDir } from './format.ts';

export const W = 1080;
export const H = 1920;
export const M = 60;

// Zona segura do story (INF8): o Instagram cobre o topo (foto/@/hora) e a base
// (barra "Enviar mensagem"). Nenhum conteudo LEGIVEL pode cair fora daqui. As
// faixas verdes sangram ate as bordas de proposito — fundo coberto nao faz mal,
// texto coberto faz.
export const SAFE_TOP = 180;
export const SAFE_BOT = 1760;

export const COLORS = {
  green: '#0E520B',
  greenL: '#186D14', // variacao de alta (INF27)
  brown: '#383223',
  white: '#FFFFFF',
  canvas: '#F4F6F5',
  border: '#DDE2DC',
  red: '#C2341D', // variacao de baixa
  muted: '#7C8A79',
  soft: '#9DC9A0',
  footerText: '#DCE8DA',
} as const;

const HB = 466; // base da faixa do header
const FB = 1618; // topo da faixa do rodape
const SH = 56; // altura da barra de titulo de secao
const BAND_H = 46; // altura da faixa de safra/ano
const GUTTER = 4; // sulco entre as duas colunas de ano

// Proporcao do lockup branco (public/logo-safras-branco.png, area util 833x265).
const LOGO_RATIO = 833 / 265;

// Limiar de folga entre secoes: abaixo disso o conteudo nao cabe no story.
export const MIN_GAP = 16;

export type Align = 'left' | 'center' | 'right';
export type Baseline = 'top' | 'middle';

export interface RectOp {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

export interface TextOp {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  weight: number;
  size: number;
  fill: string;
  align: Align;
  baseline: Baseline;
  tracking: number;
}

export interface ImageOp {
  kind: 'image';
  asset: 'logo';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TriangleOp {
  kind: 'triangle';
  cx: number;
  cy: number;
  size: number;
  down: boolean;
  fill: string;
}

export type Op = RectOp | TextOp | ImageOp | TriangleOp;

export interface FuturoRow {
  mesA: string;
  precoA: string;
  mesB: string;
  precoB: string;
}

export interface MercadoData {
  /** Data local de hoje (INF17) — ja formatada por formatDateExtensoLocal. */
  dataTexto: string;
  bolsaLabel: string;
  bolsa: string;
  variacaoDir: VariacaoDir;
  variacao: string;
  dolar: string;
  safra: string;
  fisicoPreco: string;
  futuroAnoA: string;
  futuroAnoB: string;
  futuro: [FuturoRow, FuturoRow];
  cprAnoA: string;
  cprAnoB: string;
  cprA: string;
  cprB: string;
}

/** Largura do texto ja renderizado, incluindo o tracking. Injetada porque so o
 * canvas sabe medir a Poppins; os testes passam um stub deterministico. */
export type MeasureText = (text: string, weight: number, size: number, tracking: number) => number;

export interface Layout {
  width: number;
  height: number;
  ops: Op[];
  /** Folga calculada entre as secoes — o teste garante que nao colapsa. */
  gap: number;
  /** Alturas naturais das 4 secoes, na ordem. */
  sectionHeights: number[];
}

export function buildMercadoLayout(data: MercadoData, measure: MeasureText): Layout {
  const ops: Op[] = [];
  const mid = W / 2;

  // ---------- fundo ----------
  ops.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, fill: COLORS.white });

  // ---------- header (H3: logo grande a esquerda, titulo a direita) ----------
  ops.push({ kind: 'rect', x: 0, y: 0, w: W, h: HB, fill: COLORS.green });
  const logoH = 122;
  ops.push({
    kind: 'image',
    asset: 'logo',
    x: M + 4,
    y: 206,
    w: logoH * LOGO_RATIO,
    h: logoH,
  });
  ops.push({
    kind: 'text',
    x: W - M - 4,
    y: 214,
    text: 'INFORMATIVO DE',
    weight: 500,
    size: 32,
    fill: COLORS.soft,
    align: 'right',
    baseline: 'top',
    tracking: 6,
  });
  ops.push({
    kind: 'text',
    x: W - M - 4,
    y: 256,
    text: 'MERCADO',
    weight: 700,
    size: 86,
    fill: COLORS.white,
    align: 'right',
    baseline: 'top',
    tracking: 2,
  });

  // ---------- pilula da data, montada na borda da faixa ----------
  const pillW = 520;
  ops.push({
    kind: 'rect',
    x: (W - pillW) / 2,
    y: HB - 38,
    w: pillW,
    h: 76,
    radius: 38,
    fill: COLORS.white,
    stroke: COLORS.green,
    strokeWidth: 4,
  });
  ops.push({
    kind: 'text',
    x: mid,
    y: HB,
    text: data.dataTexto.toUpperCase(),
    weight: 600,
    size: 30,
    fill: COLORS.green,
    align: 'center',
    baseline: 'middle',
    tracking: 2,
  });

  // ---------- corpo: auto-distribuicao (INF12) ----------
  const sectionHeights = [
    SH + 3 * 76, // resumo
    SH + BAND_H + 96, // fisico
    SH + BAND_H + 2 * 74, // futuro
    SH + BAND_H + 82, // cpr
  ];
  const top = HB + 80;
  const bottom = FB - 26;
  const total = sectionHeights.reduce((a, b) => a + b, 0);
  const gap = (bottom - top - total) / (sectionHeights.length - 1);

  function sectionHeader(y: number, title: string): number {
    ops.push({ kind: 'rect', x: M, y, w: W - 2 * M, h: SH, radius: 14, fill: COLORS.brown });
    ops.push({
      kind: 'text',
      x: mid,
      y: y + SH / 2,
      text: title,
      weight: 600,
      size: 30,
      fill: COLORS.white,
      align: 'center',
      baseline: 'middle',
      tracking: 2.5,
    });
    return y + SH;
  }

  function band(y: number, text: string, x0 = M, x1 = W - M): number {
    ops.push({ kind: 'rect', x: x0, y, w: x1 - x0, h: BAND_H, fill: COLORS.green });
    ops.push({
      kind: 'text',
      x: (x0 + x1) / 2,
      y: y + BAND_H / 2,
      text,
      weight: 600,
      size: 28,
      fill: COLORS.white,
      align: 'center',
      baseline: 'middle',
      tracking: 2,
    });
    return y + BAND_H;
  }

  function cell(x0: number, y: number, x1: number, h: number, fill: string) {
    ops.push({
      kind: 'rect',
      x: x0,
      y,
      w: x1 - x0,
      h,
      fill,
      stroke: COLORS.border,
      strokeWidth: 1,
    });
  }

  let y = top;

  // --- 1. Resumo do mercado ---
  let cursor = sectionHeader(y, 'RESUMO DO MERCADO');
  const variacaoText = formatVariacao(data.variacaoDir, data.variacao);
  const variacaoColor = data.variacaoDir === 'alta' ? COLORS.greenL : COLORS.red;
  const resumoRows: Array<{ label: string; value: string; color: string; arrow: boolean }> = [
    { label: data.bolsaLabel, value: formatUsc(data.bolsa), color: COLORS.brown, arrow: false },
    { label: 'VARIAÇÃO', value: variacaoText, color: variacaoColor, arrow: true },
    { label: 'DÓLAR', value: formatDolar(data.dolar), color: COLORS.brown, arrow: false },
  ];
  resumoRows.forEach((row, i) => {
    const ry = cursor + i * 76;
    cell(M, ry, W - M, 76, i % 2 === 0 ? COLORS.canvas : COLORS.white);
    ops.push({
      kind: 'text',
      x: M + 32,
      y: ry + 38,
      text: row.label,
      weight: 600,
      size: 29,
      fill: COLORS.brown,
      align: 'left',
      baseline: 'middle',
      tracking: 0,
    });
    ops.push({
      kind: 'text',
      x: W - M - 32,
      y: ry + 38,
      text: row.value,
      weight: 700,
      size: 36,
      fill: row.color,
      align: 'right',
      baseline: 'middle',
      tracking: 0,
    });
    if (row.arrow) {
      // A seta e poligono, nao caractere (INF10): a Poppins nao tem ▲▼, e como
      // texto cairia num fallback de fonte diferente em cada maquina.
      const valueW = measure(row.value, 700, 36, 0);
      ops.push({
        kind: 'triangle',
        cx: W - M - 32 - valueW - 28,
        cy: ry + 38,
        size: 24,
        down: data.variacaoDir === 'baixa',
        fill: variacaoColor,
      });
    }
  });
  y += sectionHeights[0] + gap;

  // --- 2. Mercado fisico ---
  cursor = sectionHeader(y, 'MERCADO FÍSICO — PREÇO LIVRE');
  cursor = band(cursor, `SAFRA ${data.safra}`);
  cell(M, cursor, W - M, 96, COLORS.canvas);
  ops.push({
    kind: 'text',
    x: M + 32,
    y: cursor + 48,
    text: 'CAFÉ TIPO 6/7',
    weight: 600,
    size: 31,
    fill: COLORS.brown,
    align: 'left',
    baseline: 'middle',
    tracking: 0,
  });
  ops.push({
    kind: 'text',
    x: W - M - 32,
    y: cursor + 48,
    text: formatPreco(data.fisicoPreco),
    weight: 700,
    size: 52,
    fill: COLORS.green,
    align: 'right',
    baseline: 'middle',
    tracking: 0,
  });
  y += sectionHeights[1] + gap;

  // --- 3. Mercado futuro ---
  cursor = sectionHeader(y, 'MERCADO FUTURO — PREÇO LIVRE');
  band(cursor, data.futuroAnoA, M, mid - GUTTER / 2);
  cursor = band(cursor, data.futuroAnoB, mid + GUTTER / 2, W - M);
  data.futuro.forEach((row, i) => {
    const ry = cursor + i * 74;
    const bg = i % 2 === 0 ? COLORS.canvas : COLORS.white;
    const cols: Array<[number, number, string, string]> = [
      [M, mid - GUTTER / 2, row.mesA, row.precoA],
      [mid + GUTTER / 2, W - M, row.mesB, row.precoB],
    ];
    cols.forEach(([x0, x1, mes, preco]) => {
      cell(x0, ry, x1, 74, bg);
      ops.push({
        kind: 'text',
        x: x0 + 28,
        y: ry + 37,
        text: mes,
        weight: 600,
        size: 27,
        fill: COLORS.muted,
        align: 'left',
        baseline: 'middle',
        tracking: 0,
      });
      ops.push({
        kind: 'text',
        x: x1 - 28,
        y: ry + 37,
        text: formatPreco(preco),
        weight: 700,
        size: 34,
        fill: COLORS.brown,
        align: 'right',
        baseline: 'middle',
        tracking: 0,
      });
    });
  });
  y += sectionHeights[2] + gap;

  // --- 4. CPR (secao separada do futuro — INF24) ---
  cursor = sectionHeader(y, 'CPR — MERCADO FUTURO');
  band(cursor, data.cprAnoA, M, mid - GUTTER / 2);
  cursor = band(cursor, data.cprAnoB, mid + GUTTER / 2, W - M);
  const cprCols: Array<[number, number, string]> = [
    [M, mid - GUTTER / 2, data.cprA],
    [mid + GUTTER / 2, W - M, data.cprB],
  ];
  cprCols.forEach(([x0, x1, value]) => {
    cell(x0, cursor, x1, 82, COLORS.canvas);
    ops.push({
      kind: 'text',
      x: (x0 + x1) / 2,
      y: cursor + 41,
      text: formatPreco(value),
      weight: 700,
      size: 42,
      fill: COLORS.brown,
      align: 'center',
      baseline: 'middle',
      tracking: 0,
    });
  });

  // ---------- rodape (sangra ate a base; texto dentro da zona segura) ----------
  ops.push({ kind: 'rect', x: 0, y: FB, w: W, h: H - FB, fill: COLORS.green });
  ['@safrasnegocios', 'atendimento@safrasnegocios.com', '(35) 3531-3488'].forEach((line, i) => {
    ops.push({
      kind: 'text',
      x: M + 8,
      y: FB + 52 + i * 38,
      text: line,
      weight: 400,
      size: 25,
      fill: COLORS.footerText,
      align: 'left',
      baseline: 'middle',
      tracking: 0,
    });
  });
  const footLogoH = 72;
  ops.push({
    kind: 'image',
    asset: 'logo',
    x: W - M - 8 - footLogoH * LOGO_RATIO,
    y: FB + 62,
    w: footLogoH * LOGO_RATIO,
    h: footLogoH,
  });

  return { width: W, height: H, ops, gap, sectionHeights };
}

/** Extensao vertical de um texto, para checar a zona segura. */
export function textExtent(op: TextOp): { top: number; bottom: number } {
  return op.baseline === 'top'
    ? { top: op.y, bottom: op.y + op.size }
    : { top: op.y - op.size / 2, bottom: op.y + op.size / 2 };
}
