'use client';

import type { SampleStatus } from '../lib/types';

// Q.final: enum reduzido a 3 valores. RC -> CLASSIFIED no fluxo principal,
// INVALIDATED como branch terminal. Sem mais statuses fantasmas.
const STATUS_LABEL: Record<SampleStatus, string> = {
  REGISTRATION_CONFIRMED: 'Aguardando classificacao',
  CLASSIFIED: 'Classificada',
  INVALIDATED: 'Invalidada',
};

const STATUS_STYLE: Record<SampleStatus, string> = {
  REGISTRATION_CONFIRMED: 'status-badge-warning',
  CLASSIFIED: 'status-badge-success',
  INVALIDATED: 'status-badge-danger',
};

export function StatusBadge({ status }: { status: SampleStatus }) {
  return <span className={`status-badge ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}
