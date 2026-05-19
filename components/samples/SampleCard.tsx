'use client';

// Liga B1.2: card de sample reusável extraído de app/samples/page.tsx.
// Refator puro nesta fase — sem mudança visual ou comportamental.
// B1.4 vai estender com props de modo seleção (bolinha, isSelected,
// onToggleSelect, onShowIneligibleReason).

import Link from 'next/link';

import type { SampleSnapshot } from '../../lib/types';

type CardStatusKind = 'open' | 'sold' | 'lost' | 'invalidated';

interface CardStatus {
  kind: CardStatusKind;
  label: string;
  className: string;
}

function deriveCardStatus(sample: SampleSnapshot): CardStatus {
  if (sample.status === 'INVALIDATED') {
    return { kind: 'invalidated', label: 'Invalidada', className: 'is-card-invalid' };
  }
  if (sample.commercialStatus === 'SOLD') {
    return { kind: 'sold', label: 'Vendido', className: 'is-card-sold' };
  }
  if (sample.commercialStatus === 'LOST') {
    return { kind: 'lost', label: 'Perdido', className: 'is-card-lost' };
  }
  return { kind: 'open', label: 'Em aberto', className: 'is-card-open' };
}

export interface SampleCardProps {
  sample: SampleSnapshot;
  /** Index na lista — usado pra calcular animationDelay escalonado. */
  index: number;
  /** Callback executado antes de navegar pra `/samples/:id` (preserva snapshot na sessionStorage). */
  onClickCapture?: () => void;
}

export function SampleCard({ sample, index, onClickCapture }: SampleCardProps) {
  const cardStatus = deriveCardStatus(sample);
  const availableSacks = sample.availableSacks;
  const animationDelay = `${index * 0.04}s`;

  return (
    <Link
      href={`/samples/${sample.id}`}
      className={`spv2-card ${cardStatus.className}`}
      style={{ animationDelay }}
      onClick={onClickCapture}
    >
      <span className="spv2-card-bar" />
      <div className="spv2-card-content">
        <div className="spv2-card-top">
          <span className="spv2-card-code">{sample.internalLotNumber ?? sample.id}</span>
          <span className="spv2-card-badge">{cardStatus.label}</span>
        </div>
        <div className="spv2-card-bottom">
          <span className="spv2-card-owner">{sample.declared.owner || 'Nao informado'}</span>
          <span className="spv2-card-sep" />
          <span className="spv2-card-detail">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
            </svg>
            {availableSacks === null || availableSacks === undefined ? '—' : availableSacks} sacas
          </span>
        </div>
      </div>
      <svg className="spv2-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  );
}
