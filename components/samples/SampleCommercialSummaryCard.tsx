'use client';

import { CommercialStatusBadge } from '../CommercialStatusBadge';
import type { CommercialStatus, SampleSnapshot } from '../../lib/types';

type SampleCommercialSummaryCardProps = {
  sample: SampleSnapshot;
};

function getCommercialStatusTone(status: CommercialStatus): string {
  if (status === 'OPEN') return 'open';
  if (status === 'PARTIALLY_SOLD') return 'partial';
  if (status === 'SOLD') return 'sold';
  return 'lost';
}

export function SampleCommercialSummaryCard({
  sample
}: SampleCommercialSummaryCardProps) {
  const availableSacks = sample.availableSacks ?? 0;
  const tone = getCommercialStatusTone(sample.commercialStatus);

  return (
    <section className={`panel stack sample-commercial-summary-card is-commercial-${tone}`}>
      <div className="sample-commercial-summary-head">
        <div className="sample-commercial-summary-copy">
          <h3 style={{ margin: 0 }}>Resumo comercial</h3>
        </div>
        <CommercialStatusBadge status={sample.commercialStatus} />
      </div>

      <div className="sample-commercial-summary-grid">
        <div className="sample-commercial-summary-item is-sold">
          <span>Vendidas</span>
          <strong>{sample.soldSacks ?? 0}</strong>
        </div>
        <div className="sample-commercial-summary-item is-lost">
          <span>Perdidas</span>
          <strong>{sample.lostSacks ?? 0}</strong>
        </div>
        <div className="sample-commercial-summary-item is-available">
          <span>Sacas disponivel</span>
          <strong>{availableSacks}</strong>
        </div>
      </div>
    </section>
  );
}
