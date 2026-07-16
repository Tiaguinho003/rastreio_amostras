// Casca comum dos Informativos — PURA, sem canvas.
//
// Tudo que nao depende do TIPO da peca vive aqui: a geometria do story, a
// paleta, o vocabulario de operacoes de desenho, os emissores compartilhados
// (fundo, header, pilula da data, rodape, barra de secao, faixa, celula) e a
// auto-distribuicao vertical. Cada tipo (mercado-layout.ts, meteo-layout.ts)
// monta o proprio corpo em cima disto.
//
// A separacao layout-puro / draw existe para que a geometria seja testavel sem
// navegador — ver tests/informativo-mercado.test.js e informativo-meteorologico.
//
// Fonte das medidas: docs/Informativos-Plano-de-Trabalho.md §5. Divergencia
// intencional daqui vira decisao INFn no ledger.

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

export const HB = 466; // base da faixa do header
export const FB = 1618; // topo da faixa do rodape
export const SH = 56; // altura da barra de titulo de secao
export const BAND_H = 46; // altura da faixa de safra/ano
export const GUTTER = 4; // sulco entre as duas colunas de ano

// Proporcao do lockup branco (public/logo-safras-branco.png, area util 833x265).
export const LOGO_RATIO = 833 / 265;

// Faixa vertical util do corpo, entre a pilula da data e o rodape.
export const BODY_TOP = HB + 80; // 546
export const BODY_BOTTOM = FB - 26; // 1592

// Limiar de folga entre secoes: abaixo disso o conteudo nao cabe no story.
export const MIN_GAP = 16;

export type Align = 'left' | 'center' | 'right';
export type Baseline = 'top' | 'middle';

/** Assets que o desenhador sabe resolver. O layout so referencia pela chave —
 * quem carrega a imagem e o story-draw.ts. */
export type AssetKey = 'logo' | 'previsao';

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
  asset: AssetKey;
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

/** Largura do texto ja renderizado, incluindo o tracking. Injetada porque so o
 * canvas sabe medir a Poppins; os testes passam um stub deterministico. */
export type MeasureText = (text: string, weight: number, size: number, tracking: number) => number;

export interface Layout {
  width: number;
  height: number;
  ops: Op[];
  /** Folga calculada entre as secoes — o teste garante que nao colapsa. */
  gap: number;
  /** Alturas naturais das secoes, na ordem. */
  sectionHeights: number[];
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Emissores compartilhados
//
// A ORDEM dos pushes importa duas vezes: e o z-order do desenho e e o que os
// .find() dos testes assumem. Nao reordenar sem olhar os testes.
// ---------------------------------------------------------------------------

export interface StoryHeaderSpec {
  /** Linha fina de cima: 'INFORMATIVO DE' (mercado) | 'INFORMATIVO' (meteo). */
  kicker: string;
  /** A palavra grande: 'MERCADO' | 'METEOROLÓGICO'. */
  title: string;
  /** 86 no mercado; o meteo cai para 60 — METEOROLÓGICO nao cabe a 86. */
  titleSize?: number;
  /** Topo do titulo. O default fecha o bloco em 342, alinhado a base do logo. */
  titleY?: number;
  titleTracking?: number;
}

export function pushBackground(ops: Op[]): void {
  ops.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, fill: COLORS.white });
}

/** Header H3: lockup grande a esquerda, titulo alinhado a direita. */
export function pushHeader(ops: Op[], spec: StoryHeaderSpec): void {
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
    text: spec.kicker,
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
    y: spec.titleY ?? 256,
    text: spec.title,
    weight: 700,
    size: spec.titleSize ?? 86,
    fill: COLORS.white,
    align: 'right',
    baseline: 'top',
    tracking: spec.titleTracking ?? 2,
  });
}

/** Pilula da data, montada a cavaleiro na borda da faixa do header. */
export function pushDatePill(ops: Op[], dataTexto: string): void {
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
    x: W / 2,
    y: HB,
    text: dataTexto.toUpperCase(),
    weight: 600,
    size: 30,
    fill: COLORS.green,
    align: 'center',
    baseline: 'middle',
    tracking: 2,
  });
}

/** Rodape: sangra ate a base; o texto fica dentro da zona segura. */
export function pushFooter(ops: Op[]): void {
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
}

/** Barra marrom de titulo de secao. Devolve o y logo abaixo dela. */
export function pushSectionHeader(ops: Op[], y: number, title: string): number {
  ops.push({ kind: 'rect', x: M, y, w: W - 2 * M, h: SH, radius: 14, fill: COLORS.brown });
  ops.push({
    kind: 'text',
    x: W / 2,
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

/** Faixa verde de safra/ano. Devolve o y logo abaixo dela. */
export function pushBand(ops: Op[], y: number, text: string, x0 = M, x1 = W - M): number {
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

/** Celula de tabela. Cantos QUADRADOS: o unico raio do corpo e o da barra. */
export function pushCell(
  ops: Op[],
  x0: number,
  y: number,
  x1: number,
  h: number,
  fill: string
): void {
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

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

/** Auto-distribuicao vertical do corpo (INF12): as secoes tem altura natural e
 * a sobra vira folga igual entre elas. */
export function distribute(sectionHeights: number[]): {
  top: number;
  bottom: number;
  total: number;
  gap: number;
} {
  const total = sectionHeights.reduce((a, b) => a + b, 0);
  const gap =
    sectionHeights.length < 2 ? 0 : (BODY_BOTTOM - BODY_TOP - total) / (sectionHeights.length - 1);
  return { top: BODY_TOP, bottom: BODY_BOTTOM, total, gap };
}

/**
 * Maior retangulo com a proporcao de `natural` que cabe em `box`, centrado.
 *
 * AMPLIA quando `natural` e menor que o box: decisao explicita do usuario —
 * prefere o campo cheio e borrado a uma imagem pequena e nitida. Nao colocar
 * trava de upscale aqui (ha teste cercando isso).
 *
 * Dimensao degenerada ou nao-finita (SVG sem tamanho intrinseco, decode meia
 * boca) devolve null, para nao propagar NaN ate um drawImage invalido.
 */
export function fitContain(natural: Size, box: Rect): Rect | null {
  if (!Number.isFinite(natural.w) || !Number.isFinite(natural.h)) return null;
  if (!(natural.w > 0) || !(natural.h > 0)) return null;
  const scale = Math.min(box.w / natural.w, box.h / natural.h);
  const w = natural.w * scale;
  const h = natural.h * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** Encolhe um retangulo por `pad` em cada lado. */
export function inset(r: Rect, pad: number): Rect {
  return { x: r.x + pad, y: r.y + pad, w: r.w - 2 * pad, h: r.h - 2 * pad };
}

/** Extensao vertical de um texto, para checar a zona segura. */
export function textExtent(op: TextOp): { top: number; bottom: number } {
  return op.baseline === 'top'
    ? { top: op.y, bottom: op.y + op.size }
    : { top: op.y - op.size / 2, bottom: op.y + op.size / 2 };
}
