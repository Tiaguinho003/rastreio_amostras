'use client';

import type { SampleStatus } from '../lib/types';

// Statuses legados (PHYSICAL_RECEIVED, REGISTRATION_IN_PROGRESS após Fase Q
// registro; CLASSIFICATION_IN_PROGRESS após Fase Q.cls.1) ainda existem no
// enum Postgres mas nenhum sample novo entra neles. Escondemos o badge pra
// não vazar artefato técnico na UI. Drop dos enum values fica pra migration
// final da Fase Q.
// Q.print: QR_PENDING_PRINT/QR_PRINTED removidos — sample fica em RC ate
// a classificacao e a etiqueta vira informacao auxiliar via PrintJob.
const HIDDEN_STATUS_BADGE = new Set<SampleStatus>([
  'PHYSICAL_RECEIVED',
  'REGISTRATION_IN_PROGRESS',
  'CLASSIFICATION_IN_PROGRESS',
]);

const STATUS_LABEL: Record<SampleStatus, string> = {
  PHYSICAL_RECEIVED: '',
  REGISTRATION_IN_PROGRESS: '',
  REGISTRATION_CONFIRMED: 'Aguardando classificacao',
  CLASSIFICATION_IN_PROGRESS: '',
  CLASSIFIED: 'Classificada',
  INVALIDATED: 'Invalidada',
};

const STATUS_STYLE: Record<SampleStatus, string> = {
  PHYSICAL_RECEIVED: 'status-badge-neutral',
  REGISTRATION_IN_PROGRESS: 'status-badge-neutral',
  REGISTRATION_CONFIRMED: 'status-badge-warning',
  CLASSIFICATION_IN_PROGRESS: 'status-badge-neutral',
  CLASSIFIED: 'status-badge-success',
  INVALIDATED: 'status-badge-danger',
};

export function StatusBadge({ status }: { status: SampleStatus }) {
  if (HIDDEN_STATUS_BADGE.has(status)) {
    return null;
  }

  return <span className={`status-badge ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}
