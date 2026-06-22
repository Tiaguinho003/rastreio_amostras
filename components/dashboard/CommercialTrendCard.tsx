'use client';

import type { DashboardCommercialTimeseriesResponse } from '../../lib/types';

// Cores canonicas do dashboard (mesmas do donut e das atividades):
// venda = verde, perda = vermelho.
const SALES_COLOR = '#27ae60';
const LOSS_COLOR = '#c0392b';

const WEEKDAY_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

// Rotulo do eixo X a partir de 'YYYY-MM-DD' (dia util BRT). Usa Date.UTC pra
// nao deslocar o dia da semana por fuso.
function axisLabel(dateStr: string): { weekday: string; day: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { weekday: WEEKDAY_PT[dow] ?? '', day: String(d) };
}

// viewBox: o X estica pra largura toda (preserveAspectRatio="none"); os pontos
// ficam centrados em 7 colunas iguais pra casar com os rotulos do eixo (grid de
// 7 colunas embaixo).
const VB_W = 300;
const VB_H = 100;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 92;

function xAt(i: number): number {
  return ((i + 0.5) / 7) * VB_W;
}

function buildLine(values: number[], max: number): string {
  return values
    .map((v, i) => {
      const y = PLOT_BOTTOM - (max > 0 ? v / max : 0) * (PLOT_BOTTOM - PLOT_TOP);
      return `${xAt(i).toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function CommercialTrendCard({
  data,
}: {
  data: DashboardCommercialTimeseriesResponse | null;
}) {
  if (data === null) {
    return (
      <div className="dd-trend-card is-skeleton" aria-hidden="true">
        <div className="dd-trend-header">
          <span className="dd-card-label-placeholder" style={{ width: 120, height: 16 }} />
        </div>
        <div className="dd-trend-chart-wrap" />
      </div>
    );
  }

  const { points } = data;
  const sales = points.map((p) => p.salesSacks);
  const losses = points.map((p) => p.lossSacks);
  const totalSales = sales.reduce((acc, v) => acc + v, 0);
  const totalLoss = losses.reduce((acc, v) => acc + v, 0);
  const max = Math.max(0, ...sales, ...losses);
  const isEmpty = totalSales === 0 && totalLoss === 0;

  return (
    <div className="dd-trend-card">
      <div className="dd-trend-header">
        <h3 className="dd-trend-title">Vendas e perdas</h3>
        <span className="dd-trend-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M3 16.5 9 10.5 13 14 20 7" />
            <path d="M15 7 20 7 20 12" />
          </svg>
        </span>
      </div>

      {isEmpty ? (
        <div className="dd-trend-chart-wrap is-empty">
          <p className="dd-trend-empty">Sem vendas ou perdas nos últimos 7 dias úteis.</p>
        </div>
      ) : (
        <>
          <div className="dd-trend-chart-wrap">
            <svg
              className="dd-trend-chart"
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`Vendas e perdas por dia util, em sacas, nos ultimos 7 dias uteis. Total vendido ${totalSales} sacas; total perdido ${totalLoss} sacas.`}
            >
              <polyline
                className="dd-trend-line"
                points={buildLine(sales, max)}
                fill="none"
                stroke={SALES_COLOR}
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                className="dd-trend-line"
                points={buildLine(losses, max)}
                fill="none"
                stroke={LOSS_COLOR}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="dd-trend-axis" aria-hidden="true">
            {points.map((p) => {
              const { weekday, day } = axisLabel(p.date);
              return (
                <span key={p.date} className="dd-trend-axis-tick">
                  <span className="dd-trend-axis-wd">{weekday}</span>
                  <span className="dd-trend-axis-day">{day}</span>
                </span>
              );
            })}
          </div>
        </>
      )}

      <ul className="sales-chart-legend dd-trend-legend">
        <li className="sales-chart-legend-item">
          <span
            className="sales-chart-legend-dot"
            style={{ background: SALES_COLOR }}
            aria-hidden="true"
          />
          <span className="sales-chart-legend-label">Vendas</span>
          <span className="sales-chart-legend-count">{totalSales}</span>
        </li>
        <li className="sales-chart-legend-item">
          <span
            className="sales-chart-legend-dot"
            style={{ background: LOSS_COLOR }}
            aria-hidden="true"
          />
          <span className="sales-chart-legend-label">Perdas</span>
          <span className="sales-chart-legend-count">{totalLoss}</span>
        </li>
      </ul>
    </div>
  );
}
