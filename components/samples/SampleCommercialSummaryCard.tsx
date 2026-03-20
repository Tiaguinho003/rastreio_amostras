'use client';

import { CommercialStatusBadge } from '../CommercialStatusBadge';
import type { SampleSnapshot } from '../../lib/types';

type SampleCommercialSummaryCardProps = {
  sample: SampleSnapshot;
  updating?: boolean;
  onMarkLost: () => void;
};

export function SampleCommercialSummaryCard({
  sample,
  updating = false,
  onMarkLost
}: SampleCommercialSummaryCardProps) {
  const availableSacks = sample.availableSacks ?? 0;

  return (
    <section className="panel stack sample-commercial-summary-card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Resumo comercial</h3>
          <p className="sample-commercial-summary-copy">
            O status comercial agora e calculado automaticamente pelas movimentacoes ativas da amostra.
          </p>
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

      <div className="row">
        <button
          type="button"
          className="secondary"
          onClick={onMarkLost}
          disabled={updating || sample.status !== 'CLASSIFIED' || availableSacks <= 0}
        >
          {updating ? 'Registrando perda...' : 'Marcar saldo restante como perdido'}
        </button>
      </div>
    </section>
  );
}
