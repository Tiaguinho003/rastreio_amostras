'use client';

// Liga B3.2 + B3.3: linha clickavel que representa OUTRA amostra
// relacionada a esta (origem de liga, ou liga ativa que usa essa
// amostra como origem). Reusa o pattern visual .sdv-commercial-list-row
// ja consagrado em /clients/[id] — barra lateral colorida por status +
// grid lote/meta/meta/meta + animacao escalonada.
//
// - Quando a amostra apontada e uma liga (isBlend), renderiza <BlendBadge>
//   ao lado do lote (visual consistente com B3.1).
// - owner/harvest aceitam null → fallback "—".
// - status: usado pra colorir a barra lateral. SOLD/LOST viriam de
//   commercialStatus (nao temos aqui), entao mapeamos so via
//   SampleStatus: INVALIDATED → invalid; outros → open.

import Link from 'next/link';

import type { SampleStatus } from '../../lib/types';
import { BlendBadge } from './BlendBadge';

interface RelatedSampleRowProps {
  href: string;
  lot: string;
  isBlend?: boolean;
  owner?: string | null;
  harvest?: string | null;
  contribution: number;
  status?: SampleStatus | null;
  animationDelay?: string;
}

function deriveStatusClass(status: SampleStatus | null | undefined): string {
  if (status === 'INVALIDATED') return 'is-card-invalid';
  // SOLD / LOST viria de commercialStatus, nao do enum SampleStatus.
  // Pra MVP, REGISTRATION_CONFIRMED e CLASSIFIED ficam em "open" (ativos).
  return 'is-card-open';
}

export function RelatedSampleRow({
  href,
  lot,
  isBlend = false,
  owner,
  harvest,
  contribution,
  status,
  animationDelay,
}: RelatedSampleRowProps) {
  const statusClass = deriveStatusClass(status);
  return (
    <Link
      href={href}
      className={`sdv-commercial-list-row ${statusClass}`}
      style={animationDelay ? { animationDelay } : undefined}
    >
      <span className="sdv-commercial-list-bar" aria-hidden="true" />
      <span className="sdv-commercial-list-lot">
        {lot}
        {isBlend ? <BlendBadge size="sm" /> : null}
      </span>
      <span className="sdv-commercial-list-meta">{owner?.trim() ? owner : '—'}</span>
      <span className="sdv-commercial-list-meta">{harvest?.trim() ? harvest : '—'}</span>
      <span className="sdv-commercial-list-meta">{contribution} sc</span>
    </Link>
  );
}
