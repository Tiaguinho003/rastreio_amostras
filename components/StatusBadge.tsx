'use client';

import type { SampleStatus } from '../lib/types';

const HIDDEN_STATUS_BADGE = new Set<SampleStatus>([
  'PHYSICAL_RECEIVED',
  'REGISTRATION_IN_PROGRESS',
]);

const STATUS_LABEL: Record<SampleStatus, string> = {
  PHYSICAL_RECEIVED: '',
  REGISTRATION_IN_PROGRESS: '',
  REGISTRATION_CONFIRMED: 'Impressao pendente',
  QR_PENDING_PRINT: 'Impressao pendente',
  QR_PRINTED: 'Classificacao pendente',
  CLASSIFICATION_IN_PROGRESS: 'Classificacao em andamento',
  CLASSIFIED: 'Classificada',
  INVALIDATED: 'Invalidada',
};

const STATUS_STYLE: Record<SampleStatus, string> = {
  PHYSICAL_RECEIVED: 'status-badge-neutral',
  REGISTRATION_IN_PROGRESS: 'status-badge-neutral',
  REGISTRATION_CONFIRMED: 'status-badge-print-pending',
  QR_PENDING_PRINT: 'status-badge-print-pending',
  QR_PRINTED: 'status-badge-warning',
  CLASSIFICATION_IN_PROGRESS: 'status-badge-classification-progress',
  CLASSIFIED: 'status-badge-success',
  INVALIDATED: 'status-badge-danger',
};

export function StatusBadge({ status }: { status: SampleStatus }) {
  if (HIDDEN_STATUS_BADGE.has(status)) {
    return null;
  }

  return <span className={`status-badge ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}
