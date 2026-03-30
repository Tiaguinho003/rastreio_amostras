'use client';

import Link from 'next/link';

import type { DashboardSalesAvailabilityResponse } from '../lib/types';

type SalesAvailabilityData = DashboardSalesAvailabilityResponse;

const BAND_COLORS = {
  over30: '#C0392B',
  from15to30: '#E5A100',
  under15: '#27AE60'
} as const;

const BAND_LABELS = {
  over30: '+30',
  from15to30: '+15',
  under15: '-15'
} as const;

function StackedBar({ bands, total }: { bands: SalesAvailabilityData['bands']; total: number }) {
  if (total === 0) {
    return <div className="sales-bar-empty" />;
  }

  const segments = [
    { key: 'over30' as const, value: bands.over30 },
    { key: 'from15to30' as const, value: bands.from15to30 },
    { key: 'under15' as const, value: bands.under15 }
  ].filter((s) => s.value > 0);

  return (
    <div className="sales-bar">
      {segments.map((segment) => (
        <div
          key={segment.key}
          className="sales-bar-segment"
          style={{
            flex: segment.value,
            background: BAND_COLORS[segment.key]
          }}
        />
      ))}
    </div>
  );
}

export function SalesAvailabilityCard({ data }: { data: SalesAvailabilityData }) {
  const bandEntries = [
    { key: 'over30' as const, value: data.bands.over30 },
    { key: 'from15to30' as const, value: data.bands.from15to30 },
    { key: 'under15' as const, value: data.bands.under15 }
  ];

  return (
    <div className="sales-card">
      <div className="sales-card-hero">
        <div className="sales-card-hero-left">
          <span className="sales-card-kicker">Disponiveis para venda</span>
          <div className="sales-card-hero-number">
            <strong className="sales-card-total">{data.total}</strong>
            <span className="sales-card-total-label">amostras</span>
          </div>
        </div>
        {data.classifiedToday > 0 ? (
          <span className="sales-card-today-badge">+{data.classifiedToday} hoje</span>
        ) : null}
      </div>

      <div className="sales-card-bar-section">
        <span className="sales-card-bar-label">Distribuicao por tempo</span>
        <StackedBar bands={data.bands} total={data.total} />
      </div>

      <div className="sales-card-legend">
        {bandEntries.map((entry) => (
          <Link
            key={entry.key}
            href={`/samples?aging=${entry.key}`}
            className="sales-card-legend-card"
            style={{ borderColor: BAND_COLORS[entry.key] }}
          >
            <span className="sales-card-legend-title" style={{ color: BAND_COLORS[entry.key] }}>
              {BAND_LABELS[entry.key]}
            </span>
            <strong className="sales-card-legend-count">
              {entry.value}
            </strong>
          </Link>
        ))}
      </div>

      {data.bands.over30 > 0 ? (
        <div className="sales-card-alert">
          <span className="sales-card-alert-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          </span>
          <span className="sales-card-alert-text">
            {data.bands.over30} {data.bands.over30 === 1 ? 'amostra parada' : 'amostras paradas'} ha mais de 30 dias
          </span>
        </div>
      ) : null}
    </div>
  );
}
