'use client';

import { useState } from 'react';

import { SalesAgingModal } from './SalesAgingModal';
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
function AgingDonut({ bands }: { bands: DashboardSalesAvailabilityResponse['bands'] }) {
  const total = bands.over30 + bands.from15to30 + bands.under15;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeWidth = 14;

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
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        className="sales-chart-donut-total"
      >
        {total}
      </text>
    </svg>
  );
}

export function SalesAvailabilityCard({ data }: { data: DashboardSalesAvailabilityResponse }) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="sales-card">
        <h3 className="sales-card-title">Lotes disponiveis</h3>

        <div className="sales-card-body">
          <AgingDonut bands={data.bands} />

          <ul className="sales-chart-legend">
            {SEGMENT_ORDER.map(({ key, color, label }) => (
              <li key={key} className="sales-chart-legend-item">
                <span
                  className="sales-chart-legend-dot"
                  style={{ background: color }}
                  aria-hidden="true"
                />
                <span className="sales-chart-legend-label">{label}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="sales-chart-cta"
            onClick={() => setModalOpen(true)}
            aria-label="Ver distribuicao detalhada por tempo"
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>

      {modalOpen ? <SalesAgingModal data={data} onClose={() => setModalOpen(false)} /> : null}
    </>
  );
}
