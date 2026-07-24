'use client';

// Gráfico de tendência semanal das visitas — últimas 13 semanas BRT (a atual +
// 12 anteriores, ~90 dias). Alimenta o card "Visitas esta semana" de /relatorios:
// o número grande (visitsThisWeek) fica à esquerda e este gráfico dá o contexto
// da tendência. `data[12]` = semana atual (count == visitsThisWeek); `data[0]` =
// a semana mais antiga. Cada ponto é uma SEMANA (segunda→domingo BRT), já
// zero-preenchida pelo backend (weeklyTrend).
//
// Linha bezier suave (mesmo molde do SalesLineChart de
// ClientCommercialSummaryCard), mais fina, com tracinho vertical por semana +
// rótulo de mês abreviado na base, e tooltip (mouse/toque) com data e contagem.
// viewBox fixo escala por CSS (width:100%); cores em .rsm-trend* no globals.css.

import { useState } from 'react';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Caminho suave por bezier cúbica: cada segmento usa o ponto médio em x como as
// duas alças, o que arredonda os vértices sem overshoot.
function buildLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = (prev.x + curr.x) / 2;
    d += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

// 'YYYY-MM-DD' -> Date UTC (meia-noite) sem depender do fuso local — só p/ ler o
// mês da semana (rótulos de eixo).
function parseWeek(weekStart: string): Date {
  return new Date(`${weekStart}T00:00:00.000Z`);
}

export function VisitsTrendChart({
  data,
  viewBoxWidth = 260,
}: {
  data: { weekStart: string; count: number }[];
  // Largura do viewBox. O default (260) mantém a proporção compacta do card
  // mobile. O card do gráfico no desktop é ~50% mais largo — passa um viewBox
  // MAIS LARGO (ex.: 460) pra ficar mais "deitado" e a ALTURA renderizada não
  // subir junto (o SVG escala pela proporção do viewBox).
  viewBoxWidth?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const W = viewBoxWidth;
  const H = 72;
  const PAD_X = 8;
  const TOP_Y = 6; // topo do plot (headroom p/ o pico da linha)
  const BASE_Y = 50; // linha de base do plot = topo da faixa de eixo
  const TICK_Y = BASE_Y + 4; // fim do tracinho de semana
  const MONTH_Y = 66; // baseline dos rótulos de mês

  // Guarda defensiva: série vazia vira 1 ponto no fundo (a UI já guarda length>0).
  const series = data.length > 0 ? data : [{ weekStart: '', count: 0 }];
  const count = series.length;
  const max = Math.max(1, ...series.map((week) => week.count));
  const plotW = W - PAD_X * 2;
  const plotH = BASE_Y - TOP_Y;
  const toX = (i: number) => (count <= 1 ? W / 2 : PAD_X + (i * plotW) / (count - 1));
  const toY = (v: number) => BASE_Y - (v / max) * plotH;

  const pts = series.map((week, i) => ({ x: toX(i), y: toY(week.count) }));
  const line = buildLinePath(pts);
  const area = `${line} L ${toX(count - 1)} ${BASE_Y} L ${toX(0)} ${BASE_Y} Z`;
  const last = pts[pts.length - 1];
  const total = series.reduce((sum, week) => sum + week.count, 0);

  // Rótulo de mês na 1a semana de cada mês (e sempre na primeira coluna). x
  // clampado p/ não vazar as bordas do viewBox.
  const monthLabels = series
    .map((week, i) => {
      if (!week.weekStart) return null;
      const month = parseWeek(week.weekStart).getUTCMonth();
      const prevMonth =
        i > 0 && series[i - 1].weekStart ? parseWeek(series[i - 1].weekStart).getUTCMonth() : -1;
      if (i !== 0 && month === prevMonth) return null;
      return { i, label: MONTHS[month], x: Math.min(Math.max(toX(i), 10), W - 10) };
    })
    .filter((entry): entry is { i: number; label: string; x: number } => entry !== null);

  const hovered = hover !== null ? series[hover] : null;
  const hoveredDDMM = hovered?.weekStart
    ? `${hovered.weekStart.slice(8, 10)}/${hovered.weekStart.slice(5, 7)}`
    : '';
  // left do tooltip em %, clampado p/ a pílula não sair do card (translateX(-50%)).
  const tooltipLeft = hover !== null ? Math.min(Math.max((toX(hover) / W) * 100, 14), 86) : 0;

  return (
    <div className="rsm-trend">
      <svg
        className="rsm-trend-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Tendência de visitas por semana (últimos 90 dias): ${total} no total, ${series[count - 1].count} na semana atual`}
        onPointerLeave={() => setHover(null)}
      >
        <path className="rsm-trend-area" d={area} />
        <path className="rsm-trend-line" d={line} />
        {/* tracinho vertical por semana */}
        {series.map((week, i) => (
          <line
            key={`tick-${week.weekStart || i}`}
            className="rsm-trend-tick"
            x1={toX(i)}
            y1={BASE_Y}
            x2={toX(i)}
            y2={TICK_Y}
          />
        ))}
        {/* rótulos de mês na base */}
        {monthLabels.map((entry) => (
          <text
            key={`month-${entry.i}`}
            className="rsm-trend-month"
            x={entry.x}
            y={MONTH_Y}
            textAnchor="middle"
          >
            {entry.label}
          </text>
        ))}
        {/* guia + ponto realçado do hover; sem hover, ponto na semana atual */}
        {hover !== null ? (
          <>
            <line
              className="rsm-trend-guide"
              x1={toX(hover)}
              y1={TOP_Y}
              x2={toX(hover)}
              y2={BASE_Y}
            />
            <circle className="rsm-trend-dot" cx={toX(hover)} cy={toY(series[hover].count)} r={3} />
          </>
        ) : (
          <circle className="rsm-trend-dot" cx={last.x} cy={last.y} r={2.6} />
        )}
        {/* faixas de hit invisíveis por semana — pointer events cobrem mouse+toque */}
        {series.map((week, i) => {
          const left = i === 0 ? 0 : (toX(i) + toX(i - 1)) / 2;
          const right = i === count - 1 ? W : (toX(i) + toX(i + 1)) / 2;
          return (
            <rect
              key={`hit-${week.weekStart || i}`}
              x={left}
              y={0}
              width={Math.max(0, right - left)}
              height={H}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
              onPointerDown={() => setHover(i)}
              onPointerMove={() => setHover(i)}
            />
          );
        })}
      </svg>
      {hover !== null && hovered ? (
        <div className="rsm-trend-tooltip" style={{ left: `${tooltipLeft}%` }} role="status">
          Semana de {hoveredDDMM} · {hovered.count} visita{hovered.count === 1 ? '' : 's'}
        </div>
      ) : null}
      <span className="rsm-trend-caption">últimos 90 dias</span>
    </div>
  );
}
