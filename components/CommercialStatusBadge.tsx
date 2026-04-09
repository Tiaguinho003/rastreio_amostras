'use client';

import type { CommercialStatus } from '../lib/types';

const COMMERCIAL_STATUS_LABEL: Record<CommercialStatus, string> = {
  OPEN: 'Em aberto',
  PARTIALLY_SOLD: 'Venda parcial',
  SOLD: 'Vendido',
  LOST: 'Perdido',
};

const COMMERCIAL_STATUS_STYLE: Record<CommercialStatus, string> = {
  OPEN: 'commercial-status-badge-open',
  PARTIALLY_SOLD: 'commercial-status-badge-partially-sold',
  SOLD: 'commercial-status-badge-sold',
  LOST: 'commercial-status-badge-lost',
};

export function CommercialStatusBadge({ status }: { status: CommercialStatus }) {
  return (
    <span className={`commercial-status-badge ${COMMERCIAL_STATUS_STYLE[status]}`}>
      {COMMERCIAL_STATUS_LABEL[status]}
    </span>
  );
}
