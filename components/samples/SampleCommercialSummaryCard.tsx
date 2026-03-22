'use client';

import { CommercialStatusBadge } from '../CommercialStatusBadge';
import type { SampleSnapshot } from '../../lib/types';

type SampleCommercialSummaryCardProps = {
  sample: SampleSnapshot;
};

export function SampleCommercialSummaryCard({
  sample
}: SampleCommercialSummaryCardProps) {
  const availableSacks = sample.availableSacks ?? 0;

  return (
    <section className="panel stack sample-commercial-summary-card">
      <div className="sample-commercial-summary-head">
        <div className="sample-commercial-summary-copy">
          <h3 style={{ margin: 0 }}>Resumo comercial</h3>
        </div>
        <CommercialStatusBadge status={sample.commercialStatus} />
      </div>

      <div className="sample-commercial-summary-grid">
        <div className="sample-commercial-summary-item">
          <span>Vendidas</span>
          <strong>{sample.soldSacks ?? 0}</strong>
        </div>
        <div className="sample-commercial-summary-item">
          <span>Perdidas</span>
          <strong>{sample.lostSacks ?? 0}</strong>
        </div>
        <div className="sample-commercial-summary-item">
          <span>Saldo disponivel</span>
          <strong>{availableSacks}</strong>
        </div>
      </div>
    </section>
  );
}
