'use client';

import type { ClientCommercialSummaryResponse, ClientMonthlySalesPoint } from '../../lib/types';

// Rodada 3 FV: o Resumo comercial do detalhe do cliente virou GRAFICO DE
// LINHAS (sacas vendidas/compradas por mes, 6 meses, serie monthlySales do
// backend) + cards numericos (Em aberto / Vendido / Comprado). O donut e os
// minicards ccs-* morreram junto com o CSS .sales-*. Perdido saiu da UI
// (lostCount segue na API). "Comprado" (card e linha) so entra quando o
// cliente e comprador. Sem tooltip/interacao — card de apresentacao.

// Cores herdadas dos antigos cards comerciais (start dos gradientes).
const COLOR_OPEN = '#4a73b8';
const COLOR_SOLD = '#4a8a5e';
const COLOR_BOUGHT = '#7a5836';

const MONTH_LABELS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

// key = 'YYYY-MM' (contrato do backend).
function monthLabel(key: string): string {
  const monthIndex = Number(key.slice(5, 7)) - 1;
  return MONTH_LABELS[monthIndex] ?? '—';
}

// Curva suave passando pelos pontos: cubic bezier com controles horizontais
// no meio de cada segmento — tangente horizontal nos pontos, sem overshoot
// vertical (mesmo espirito do grafico da referencia, sem lib).
function buildLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const controlX = (prev.x + curr.x) / 2;
    d += ` C ${controlX} ${prev.y}, ${controlX} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

function SalesLineChart({
  series,
  isBuyer,
}: {
  series: ClientMonthlySalesPoint[];
  isBuyer: boolean;
}) {
  const WIDTH = 320;
  const HEIGHT = 132;
  const PAD_LEFT = 34;
  const PAD_RIGHT = 10;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 22;
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const count = series.length;
  const rawMax = Math.max(
    1,
    ...series.map((point) => Math.max(point.soldSacks, isBuyer ? point.boughtSacks : 0))
  );
  // Teto "redondo" divisivel por 4 → gridline do meio fica inteira.
  const axisMax = Math.max(4, Math.ceil(rawMax / 4) * 4);

  const toX = (index: number) => PAD_LEFT + (count <= 1 ? 0 : (index * plotWidth) / (count - 1));
  const toY = (value: number) => PAD_TOP + plotHeight - (value / axisMax) * plotHeight;

  const soldPath = buildLinePath(
    series.map((point, i) => ({ x: toX(i), y: toY(point.soldSacks) }))
  );
  const soldArea = `${soldPath} L ${toX(count - 1)} ${PAD_TOP + plotHeight} L ${toX(0)} ${PAD_TOP + plotHeight} Z`;
  const boughtPath = isBuyer
    ? buildLinePath(series.map((point, i) => ({ x: toX(i), y: toY(point.boughtSacks) })))
    : '';

  const gridValues = [0, axisMax / 2, axisMax];
  const ariaLabel = `Sacas por mês nos últimos 6 meses: ${series
    .map(
      (point) =>
        `${monthLabel(point.month)} ${point.soldSacks} vendidas${
          isBuyer ? `, ${point.boughtSacks} compradas` : ''
        }`
    )
    .join('; ')}`;

  return (
    <svg
      className="fv-cd-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={ariaLabel}
    >
      {gridValues.map((value) => (
        <g key={value}>
          <line
            className="fv-cd-chart-grid"
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
            y1={toY(value)}
            y2={toY(value)}
          />
          <text className="fv-cd-chart-ytick" x={PAD_LEFT - 6} y={toY(value)}>
            {value.toLocaleString('pt-BR')}
          </text>
        </g>
      ))}
      <path className="fv-cd-chart-area" d={soldArea} />
      <path className="fv-cd-chart-line is-sold" d={soldPath} />
      {isBuyer ? <path className="fv-cd-chart-line is-bought" d={boughtPath} /> : null}
      {series.map((point, index) => (
        <text key={point.month} className="fv-cd-chart-xtick" x={toX(index)} y={HEIGHT - 6}>
          {monthLabel(point.month)}
        </text>
      ))}
    </svg>
  );
}

export function ClientCommercialSummaryCard({
  summary,
  isBuyer,
}: {
  summary: ClientCommercialSummaryResponse | null;
  isBuyer: boolean;
}) {
  if (!summary) {
    return <div className="fv-cd-chart-skeleton" aria-hidden="true" />;
  }

  const series = summary.monthlySales ?? [];
  const hasMovement = series.some(
    (point) => point.soldSacks > 0 || (isBuyer && point.boughtSacks > 0)
  );

  return (
    <>
      <div className="sdv-card fv-cd-chart-card">
        <div className="fv-cd-chart-head">
          <h3 className="fv-cd-chart-title">Resumo comercial</h3>
          <span className="fv-cd-chart-period">Últimos 6 meses</span>
        </div>
        <div className="fv-cd-chart-legend" aria-hidden="true">
          <span className="fv-cd-chart-legend-item">
            <span className="fv-cd-chart-legend-dot" style={{ background: COLOR_SOLD }} />
            Vendas
          </span>
          {isBuyer ? (
            <span className="fv-cd-chart-legend-item">
              <span className="fv-cd-chart-legend-dot" style={{ background: COLOR_BOUGHT }} />
              Compras
            </span>
          ) : null}
        </div>
        {hasMovement ? (
          <SalesLineChart series={series} isBuyer={isBuyer} />
        ) : (
          <p className="fv-cd-chart-empty">Sem movimentações nos últimos 6 meses.</p>
        )}
      </div>

      <div className="fv-cd-stats">
        <div className="fv-cd-stat">
          <span className="fv-cd-stat-label">
            <span
              className="fv-cd-stat-dot"
              style={{ background: COLOR_OPEN }}
              aria-hidden="true"
            />
            Em aberto
          </span>
          <span className="fv-cd-stat-value">{summary.openCount}</span>
        </div>
        <div className="fv-cd-stat">
          <span className="fv-cd-stat-label">
            <span
              className="fv-cd-stat-dot"
              style={{ background: COLOR_SOLD }}
              aria-hidden="true"
            />
            Vendido
          </span>
          <span className="fv-cd-stat-value">{summary.soldCount}</span>
        </div>
        {isBuyer ? (
          <div className="fv-cd-stat">
            <span className="fv-cd-stat-label">
              <span
                className="fv-cd-stat-dot"
                style={{ background: COLOR_BOUGHT }}
                aria-hidden="true"
              />
              Comprado
            </span>
            <span className="fv-cd-stat-value">{summary.boughtCount}</span>
          </div>
        ) : null}
      </div>
    </>
  );
}
