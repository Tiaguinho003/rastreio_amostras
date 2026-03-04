'use client';

import type { SampleStatus } from '../lib/types';

const STATUS_LABEL: Record<SampleStatus, string> = {
  PHYSICAL_RECEIVED: 'Recebida',
  REGISTRATION_IN_PROGRESS: 'Registro em andamento',
  REGISTRATION_CONFIRMED: 'Registro confirmado',
  QR_PENDING_PRINT: 'QR pendente',
  QR_PRINTED: 'QR impresso',
  CLASSIFICATION_IN_PROGRESS: 'Classificacao em andamento',
  CLASSIFIED: 'Classificada',
  INVALIDATED: 'Invalidada'
};

const STATUS_STYLE: Record<SampleStatus, string> = {
  PHYSICAL_RECEIVED: 'status-badge-neutral',
  REGISTRATION_IN_PROGRESS: 'status-badge-neutral',
  REGISTRATION_CONFIRMED: 'status-badge-neutral',
  QR_PENDING_PRINT: 'status-badge-neutral',
  QR_PRINTED: 'status-badge-muted',
  CLASSIFICATION_IN_PROGRESS: 'status-badge-warning',
  CLASSIFIED: 'status-badge-success',
  INVALIDATED: 'status-badge-danger'
};

export function StatusBadge({ status }: { status: SampleStatus }) {
  return <span className={`status-badge ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}
