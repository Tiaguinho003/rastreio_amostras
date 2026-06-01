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
import { BlendBadge } from './BlendBadge';

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
  /** Modo idle: card expandido (mostra painel com infos principais). */
  isExpanded?: boolean;
  /** Modo idle: toggla expansao do card. */
  onToggleExpand?: (sampleId: string) => void;
}

export function SampleCard({
  sample,
  index,
  onClickCapture,
  selectionMode = 'idle',
  isSelected = false,
  onToggleSelect,
  onShowIneligibleReason,
  isExpanded = false,
  onToggleExpand,
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
            {sample.isBlend ? <BlendBadge size="sm" /> : null}
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
            {sample.declared.harvest ? (
              <>
                <span className="spv2-card-sep" />
                <span className="spv2-card-detail">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {sample.declared.harvest}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </button>
    );
  }

  // Modo idle (default) — tap expande painel com infos principais.
  // Navegacao pra detalhe so via botao "Ver detalhes" dentro do painel.
  const handleHeaderClick = () => {
    onToggleExpand?.(sample.id);
  };

  const declared = sample.declared;

  return (
    <div
      className={`spv2-card-wrap ${cardStatus.className}${isExpanded ? ' is-expanded' : ''}`}
      style={{ animationDelay }}
    >
      <button
        type="button"
        className="spv2-card"
        onClick={handleHeaderClick}
        aria-expanded={isExpanded}
        aria-controls={`spv2-card-expanded-${sample.id}`}
      >
        <span className="spv2-card-bar" />
        <div className="spv2-card-content">
          <div className="spv2-card-top">
            <span className="spv2-card-code">{sample.internalLotNumber ?? sample.id}</span>
            {sample.isBlend ? <BlendBadge size="sm" /> : null}
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
            {sample.declared.harvest ? (
              <>
                <span className="spv2-card-sep" />
                <span className="spv2-card-detail">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {sample.declared.harvest}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <svg className="spv2-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>

      <div
        id={`spv2-card-expanded-${sample.id}`}
        className="spv2-card-expanded"
        aria-hidden={!isExpanded}
      >
        <div className="spv2-card-expanded-inner">
          <div className="spv2-card-stats-grid">
            <div className="spv2-card-stat">
              <span className="spv2-card-stat-label">Local</span>
              <span className="spv2-card-stat-value">
                {declared.location || <span className="spv2-card-stat-value--empty">—</span>}
              </span>
            </div>
          </div>

          <Link
            href={`/samples/${sample.id}`}
            className="spv2-card-detail-btn"
            onClick={onClickCapture}
            tabIndex={isExpanded ? 0 : -1}
          >
            <span>Ver detalhes</span>
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
