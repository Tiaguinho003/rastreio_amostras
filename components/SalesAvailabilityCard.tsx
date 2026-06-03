'use client';

import Link from 'next/link';

import type { DashboardSalesAvailabilityResponse } from '../lib/types';

type AgingKey = 'over30' | 'from15to30' | 'under15';

const SEGMENT_ORDER: Array<{ key: AgingKey; color: string; label: string }> = [
  { key: 'over30', color: '#c0392b', label: '+30 dias' },
  { key: 'from15to30', color: '#e5a100', label: '+15 dias' },
  { key: 'under15', color: '#27ae60', label: '-15 dias' },
];

// Donut em SVG (sem libs). Cada segmento e um <circle> com
// stroke-dasharray proporcional ao percentual da band; o stroke-dashoffset
// negativo desloca o inicio do segmento acumulando o que ja foi desenhado.
function AgingDonut({
  bands,
  total,
}: {
  bands: DashboardSalesAvailabilityResponse['bands'];
  total: number;
}) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeWidth = 11;

  let accumulated = 0;
  const segments = SEGMENT_ORDER.map(({ key, color }) => {
    const value = bands[key];
    const fraction = total > 0 ? value / total : 0;
    const dash = fraction * circumference;
    const offset = -accumulated;
    accumulated += dash;
    return { key, color, dash, offset };
  });

  return (
    <svg
      className="sales-chart-donut"
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Distribuicao por tempo: ${bands.over30} mais de 30 dias, ${bands.from15to30} entre 15 e 30 dias, ${bands.under15} menos de 15 dias`}
    >
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="rgba(255, 255, 255, 0.18)"
        strokeWidth={strokeWidth}
      />
      {total > 0
        ? segments.map(({ key, color, dash, offset }) =>
            dash > 0 ? (
              <circle
                key={key}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                transform="rotate(-90 50 50)"
              />
            ) : null
          )
        : null}
      {/* Total grande + label "lotes" menor. Ambos com y=44 pra que o
          conjunto (total no topo + label embaixo via dy) fique
          visualmente centralizado no donut (sem o numero parecer
          subido e a label puxar pra baixo). */}
      <text
        x="50"
        y="44"
        textAnchor="middle"
        dominantBaseline="central"
        className="sales-chart-donut-total"
      >
        {total}
      </text>
      <text
        x="50"
        y="44"
        dy="1.9em"
        textAnchor="middle"
        dominantBaseline="central"
        className="sales-chart-donut-label"
      >
        lotes
      </text>
    </svg>
  );
}

export function SalesAvailabilityCard({ data }: { data: DashboardSalesAvailabilityResponse }) {
  const total = data.bands.over30 + data.bands.from15to30 + data.bands.under15;

  return (
    <div className="sales-card">
      <div className="sales-card-header">
        <h3 className="sales-card-title">Lotes disponíveis</h3>
        <span className="sales-card-chart-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M3 16.5 9 10.5 13 14 20 7" />
            <path d="M15 7 20 7 20 12" />
          </svg>
        </span>
      </div>

      <div className="sales-card-body">
        <AgingDonut bands={data.bands} total={total} />

        <ul className="sales-chart-legend">
          {SEGMENT_ORDER.map(({ key, color, label }) => (
            <li key={key} className="sales-chart-legend-item">
              <span
                className="sales-chart-legend-dot"
                style={{ background: color }}
                aria-hidden="true"
              />
              <span className="sales-chart-legend-label">{label}</span>
              <span className="sales-chart-legend-count">{data.bands[key]}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Unica acao do card: leva pra lista de amostras disponiveis (em aberto). */}
      <Link href="/samples?displayStatus=OPEN" className="sales-card-detail-button">
        Ver disponíveis
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Link>
    </div>
  );
}
