'use client';

import Link from 'next/link';

import type { DashboardSalesAvailabilityResponse } from '../lib/types';

type AgingKey = 'over30' | 'from15to30' | 'under15';

const AGING_BANDS: Array<{ key: AgingKey; label: string }> = [
  { key: 'over30', label: '+30 dias' },
  { key: 'from15to30', label: '+15 dias' },
  { key: 'under15', label: '-15 dias' },
];

export function SalesAvailabilityCard({ data }: { data: DashboardSalesAvailabilityResponse }) {
  return (
    <div className="sales-card">
      <div className="sales-total">
        <span className="sales-total-kicker">Disponiveis pra venda</span>
        <strong className="sales-total-number">{data.total}</strong>
        <span className="sales-total-label">amostras</span>
      </div>

      <div className="sales-aging">
        {AGING_BANDS.map(({ key, label }) => (
          <Link
            key={key}
            href={`/samples?aging=${key}`}
            className={`sales-aging-card sales-aging-card--${key}`}
            aria-label={`${data.bands[key]} amostras ${label}`}
          >
            <strong className="sales-aging-count">{data.bands[key]}</strong>
            <span className="sales-aging-label">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
