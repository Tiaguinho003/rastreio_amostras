// Layout do Informativo de Mercado — PURO, sem canvas.
//
// Monta o CORPO da peca de mercado (as 4 secoes) em cima da casca comum do
// story-layout.ts, que emite fundo, header, pilula da data e rodape. Nao toca
// em CanvasRenderingContext2D: quem pinta e o mercado-draw.ts.
//
// Fonte das medidas: docs/Informativos-Plano-de-Trabalho.md §5. Divergencia
// intencional daqui vira decisao INFn no ledger.

import { formatDolar, formatPreco, formatUsc, formatVariacao, type VariacaoDir } from './format.ts';
import {
  BAND_H,
  COLORS,
  distribute,
  GUTTER,
  H,
  M,
  pushBackground,
  pushBand,
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
} from './story-layout.ts';

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

export function buildMercadoLayout(data: MercadoData, measure: MeasureText): Layout {
  const ops: Op[] = [];
  const mid = W / 2;

  pushBackground(ops);
  pushHeader(ops, { kicker: 'INFORMATIVO DE', title: 'MERCADO' });
  pushDatePill(ops, data.dataTexto);

  // ---------- corpo: auto-distribuicao (INF12) ----------
  const sectionHeights = [
    SH + 3 * 76, // resumo
    SH + BAND_H + 96, // fisico
    SH + BAND_H + 2 * 74, // futuro
    SH + BAND_H + 82, // cpr
  ];
  const { top, gap } = distribute(sectionHeights);

  let y = top;

  // --- 1. Resumo do mercado ---
  let cursor = pushSectionHeader(ops, y, 'RESUMO DO MERCADO');
  const variacaoText = formatVariacao(data.variacaoDir, data.variacao);
  const variacaoColor = data.variacaoDir === 'alta' ? COLORS.greenL : COLORS.red;
  const resumoRows: Array<{ label: string; value: string; color: string; arrow: boolean }> = [
    { label: data.bolsaLabel, value: formatUsc(data.bolsa), color: COLORS.brown, arrow: false },
    { label: 'VARIAÇÃO', value: variacaoText, color: variacaoColor, arrow: true },
    { label: 'DÓLAR', value: formatDolar(data.dolar), color: COLORS.brown, arrow: false },
  ];
  resumoRows.forEach((row, i) => {
    const ry = cursor + i * 76;
    pushCell(ops, M, ry, W - M, 76, i % 2 === 0 ? COLORS.canvas : COLORS.white);
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
  cursor = pushSectionHeader(ops, y, 'MERCADO FÍSICO — PREÇO LIVRE');
  cursor = pushBand(ops, cursor, `SAFRA ${data.safra}`);
  pushCell(ops, M, cursor, W - M, 96, COLORS.canvas);
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
  cursor = pushSectionHeader(ops, y, 'MERCADO FUTURO — PREÇO LIVRE');
  pushBand(ops, cursor, data.futuroAnoA, M, mid - GUTTER / 2);
  cursor = pushBand(ops, cursor, data.futuroAnoB, mid + GUTTER / 2, W - M);
  data.futuro.forEach((row, i) => {
    const ry = cursor + i * 74;
    const bg = i % 2 === 0 ? COLORS.canvas : COLORS.white;
    const cols: Array<[number, number, string, string]> = [
      [M, mid - GUTTER / 2, row.mesA, row.precoA],
      [mid + GUTTER / 2, W - M, row.mesB, row.precoB],
    ];
    cols.forEach(([x0, x1, mes, preco]) => {
      pushCell(ops, x0, ry, x1, 74, bg);
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
  cursor = pushSectionHeader(ops, y, 'CPR — MERCADO FUTURO');
  pushBand(ops, cursor, data.cprAnoA, M, mid - GUTTER / 2);
  cursor = pushBand(ops, cursor, data.cprAnoB, mid + GUTTER / 2, W - M);
  const cprCols: Array<[number, number, string]> = [
    [M, mid - GUTTER / 2, data.cprA],
    [mid + GUTTER / 2, W - M, data.cprB],
  ];
  cprCols.forEach(([x0, x1, value]) => {
    pushCell(ops, x0, cursor, x1, 82, COLORS.canvas);
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

  pushFooter(ops);

  return { width: W, height: H, ops, gap, sectionHeights };
}
