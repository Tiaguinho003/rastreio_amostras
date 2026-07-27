// Layout do Informativo Meteorologico — PURO, sem canvas.
//
// Monta o CORPO da peca (3 secoes) em cima da casca comum do story-layout.ts.
// Irma do mercado-layout.ts: mesma casca, mesma anatomia de tabela, corpo
// proprio.
//
// Fonte das medidas: docs/Informativos-Plano-de-Trabalho.md §5.

import { formatPluviosidade, formatTemperatura, formatUmidade } from './format.ts';
import {
  COLORS,
  distribute,
  fitContain,
  H,
  inset,
  M,
  pushBackground,
  pushCell,
  pushDatePill,
  pushFooter,
  pushHeader,
  pushSectionHeader,
  SH,
  W,
  type Layout,
  type MeasureText,
  type Op,
  type Rect,
  type Size,
} from './story-layout.ts';

/** Altura do painel branco que recebe o print da previsao. Fixa: o layout NAO
 * flexiona com a proporcao da imagem (P2 — o leitor acha o dado no mesmo lugar
 * todo dia). A sobra fica invisivel porque o print tem fundo branco. */
export const PANEL_H = 460;

/**
 * Respiro entre a borda do painel e o print.
 *
 * Tambem e o que dispensa um clip() no desenhador: num canto de raio R, um
 * ponto a (p,p) do vertice so fica dentro do arco se p >= R(1 - 1/raiz(2)),
 * que para R=14 da ~4,1px. Com 12 sobra folga de 3x, entao o canto quadrado da
 * imagem nunca aparece por cima do canto arredondado do painel.
 */
export const PREVISAO_PAD = 12;

/** Mesmo raio da barra de titulo de secao. As celulas das tabelas sao
 * QUADRADAS — nao ha "raio de celula" para copiar. */
export const PREVISAO_RADIUS = 14;

const ROW_H = 76;

export interface MeteoData {
  /** Data local de hoje (INF17) — ja formatada por formatDateExtensoLocal. */
  dataTexto: string;
  temperatura: string;
  umidade: string;
  maxima: string;
  minima: string;
  pluviosidade: string;
  /**
   * Dimensoes NATURAIS do print colado, ou null se ainda nao ha print.
   *
   * E o tamanho, nao o HTMLImageElement, de proposito: o encaixe e aritmetica
   * e roda em node, sem canvas. O layout ja e dono da geometria de imagem (o
   * logo tem LOGO_RATIO e o layout deriva a largura), entao isto e a regra da
   * casa, nao uma excecao.
   */
  previsao: Size | null;
  /**
   * 24 ou 72 — o rotulo "REGISTRO EM {h}h". 72h na segunda-feira (fecha o fim
   * de semana), 24h nos demais dias. Vem de `registroEmHoras(hoje)`. E DADO
   * (nao literal) pra manter o layout puro/deterministico nos testes.
   */
  registroHoras: 24 | 72;
}

/** Retangulo do painel branco da previsao, dado o topo da secao. */
function panelRect(y: number): Rect {
  return { x: M, y, w: W - 2 * M, h: PANEL_H };
}

function pushLinha(ops: Op[], y: number, label: string, value: string, bg: string): number {
  pushCell(ops, M, y, W - M, ROW_H, bg);
  ops.push({
    kind: 'text',
    x: M + 32,
    y: y + ROW_H / 2,
    text: label,
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
    y: y + ROW_H / 2,
    text: value,
    weight: 700,
    size: 36,
    fill: COLORS.brown,
    align: 'right',
    baseline: 'middle',
    tracking: 0,
  });
  return y + ROW_H;
}

export function buildMeteoLayout(data: MeteoData, _measure: MeasureText): Layout {
  const ops: Op[] = [];

  pushBackground(ops);
  // METEOROLOGICO nao cabe a 86px: pediria ~538px e so ha ~568 a direita do
  // logo, sem folga. A 60px o bloco fecha em 342, na mesma base otica do
  // MERCADO.
  pushHeader(ops, {
    kicker: 'INFORMATIVO',
    title: 'METEOROLÓGICO',
    titleSize: 60,
    titleY: 282,
  });
  pushDatePill(ops, data.dataTexto);

  // ---------- corpo: auto-distribuicao (INF12) ----------
  const sectionHeights = [
    2 * ROW_H, // agora — sem barra de titulo, como no original
    SH + 3 * ROW_H, // registro em 24h
    SH + PANEL_H, // previsao do tempo
  ];
  const { top, gap } = distribute(sectionHeights);

  let y = top;

  // --- 1. Agora (sem barra de titulo) ---
  let cursor = pushLinha(ops, y, 'TEMPERATURA', formatTemperatura(data.temperatura), COLORS.canvas);
  pushLinha(ops, cursor, 'UMIDADE RELATIVA DO AR', formatUmidade(data.umidade), COLORS.white);
  y += sectionHeights[0] + gap;

  // --- 2. Registro em 24h / 72h (segunda) ---
  cursor = pushSectionHeader(ops, y, `REGISTRO EM ${data.registroHoras}h`);
  cursor = pushLinha(ops, cursor, 'MÁXIMA', formatTemperatura(data.maxima), COLORS.canvas);
  cursor = pushLinha(ops, cursor, 'MÍNIMA', formatTemperatura(data.minima), COLORS.white);
  pushLinha(ops, cursor, 'PLUVIOSIDADE', formatPluviosidade(data.pluviosidade), COLORS.canvas);
  y += sectionHeights[1] + gap;

  // --- 3. Previsao do tempo (o print colado) ---
  cursor = pushSectionHeader(ops, y, 'PREVISÃO DO TEMPO');
  const panel = panelRect(cursor);
  ops.push({
    kind: 'rect',
    x: panel.x,
    y: panel.y,
    w: panel.w,
    h: panel.h,
    radius: PREVISAO_RADIUS,
    fill: COLORS.white,
    stroke: COLORS.border,
    strokeWidth: 1,
  });
  // O painel e emitido SEMPRE, com ou sem print: e ele que segura a altura e
  // faz o layout nao flexionar (P2).
  if (data.previsao) {
    const fit = fitContain(data.previsao, inset(panel, PREVISAO_PAD));
    if (fit) {
      ops.push({ kind: 'image', asset: 'previsao', x: fit.x, y: fit.y, w: fit.w, h: fit.h });
    }
  }

  pushFooter(ops);

  return { width: W, height: H, ops, gap, sectionHeights };
}
