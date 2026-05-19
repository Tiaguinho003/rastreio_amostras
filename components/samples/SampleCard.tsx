'use client';

// Liga B1.2 + B1.4: card de sample com 2 modos.
//
// - 'idle' (default): renderiza <Link href="/samples/:id"> — comportamento
//   original (navega pra detalhe ao clicar).
// - 'blend': renderiza <button> que toggla seleção. Card ganha bolinha
//   à esquerda (estados: vazia / preenchida-verde-check / cinza-opaca
//   inelegível). Inelegível: card todo acinzentado, tap dispara
//   onShowIneligibleReason em vez de toggle (Liga F1.B / F1.4).

import Link from 'next/link';

import type { SampleEligibilityReason, SampleSnapshot } from '../../lib/types';

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

export type SampleCardSelectionMode = 'idle' | 'blend';

export interface SampleCardProps {
  sample: SampleSnapshot;
  /** Index na lista — usado pra calcular animationDelay escalonado. */
  index: number;
  /** Callback executado antes de navegar pra `/samples/:id` (preserva snapshot na sessionStorage). */
  onClickCapture?: () => void;
  /** Liga B1.4 — modo selecao. 'idle' default mantem comportamento atual. */
  selectionMode?: SampleCardSelectionMode;
  /** Liga B1.4 — selecionado no modo blend. */
  isSelected?: boolean;
  /** Liga B1.4 — tap em card elegivel no modo blend. */
  onToggleSelect?: (sampleId: string) => void;
  /** Liga B1.4 — tap em card inelegivel no modo blend (mostra tooltip/toast com motivo). */
  onShowIneligibleReason?: (reason: SampleEligibilityReason) => void;
}

export function SampleCard({
  sample,
  index,
  onClickCapture,
  selectionMode = 'idle',
  isSelected = false,
  onToggleSelect,
  onShowIneligibleReason,
}: SampleCardProps) {
  const cardStatus = deriveCardStatus(sample);
  const availableSacks = sample.availableSacks;
  const animationDelay = `${index * 0.04}s`;

  // Liga B1.4: branching idle vs blend.
  if (selectionMode === 'blend') {
    const eligibility = sample.eligibility;
    const isIneligible = eligibility !== undefined && eligibility !== null && !eligibility.eligible;
    const handleClick = () => {
      if (isIneligible) {
        onShowIneligibleReason?.(eligibility?.reason ?? null);
        return;
      }
      onToggleSelect?.(sample.id);
    };

    const cardClassName = [
      'spv2-card',
      cardStatus.className,
      'is-blend-selectable',
      isIneligible ? 'is-ineligible-blend' : '',
      isSelected ? 'is-blend-selected' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const circleClassName = [
      'sample-card-selection-circle',
      isIneligible ? 'is-disabled' : isSelected ? 'is-selected' : 'is-empty',
    ].join(' ');

    return (
      <button
        type="button"
        className={cardClassName}
        style={{ animationDelay }}
        onClick={handleClick}
        aria-pressed={isSelected}
        aria-disabled={isIneligible}
      >
        <span className="spv2-card-bar" />
        <span className={circleClassName} aria-hidden="true">
          {isSelected && !isIneligible ? (
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M5 12l5 5L20 7" />
            </svg>
          ) : null}
        </span>
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
      </button>
    );
  }

  // Modo idle (default) — comportamento original.
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
