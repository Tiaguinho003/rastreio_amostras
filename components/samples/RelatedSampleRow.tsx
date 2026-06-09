'use client';

// Liga B3.2 + B3.3: card clickavel que representa OUTRA amostra relacionada a
// esta (origem de liga na "Composicao da liga", ou liga ativa que usa essa
// amostra como origem). Reusa o chrome do card da /samples (`.spv2-card` —
// barra lateral colorida por status + chevron a direita) PROPOSITALMENTE, pra
// ficar identico ao card da lista. Diferencas (variante `.sdv-blend-card`):
// conteudo numa unica linha, sem o badge de status comercial e sem versao
// expandida (cards estaticos).
//
// - Quando a amostra apontada e uma liga (isBlend), renderiza <BlendBadge>
//   ao lado do lote.
// - owner/harvest aceitam null → fallback "—".
// - status: usado pra colorir a barra lateral (is-card-open / is-card-invalid).

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
  // REGISTRATION_CONFIRMED e CLASSIFIED ficam em "open" (ativos).
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
      className={`spv2-card sdv-blend-card ${statusClass}`}
      style={animationDelay ? { animationDelay } : undefined}
    >
      <span className="spv2-card-bar" aria-hidden="true" />
      <div className="spv2-card-content">
        <span className="sdv-blend-card-lot">
          <span className="sdv-blend-card-lot-text">{lot}</span>
          {isBlend ? <BlendBadge size="sm" /> : null}
        </span>
        <span className="spv2-card-sep" aria-hidden="true" />
        <span className="sdv-blend-card-owner">{owner?.trim() ? owner : '—'}</span>
        <span className="spv2-card-sep" aria-hidden="true" />
        <span className="spv2-card-detail">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          {harvest?.trim() ? harvest : '—'}
        </span>
        <span className="spv2-card-sep" aria-hidden="true" />
        <span className="spv2-card-detail">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
          </svg>
          {contribution} sc
        </span>
      </div>
      <svg className="spv2-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  );
}
