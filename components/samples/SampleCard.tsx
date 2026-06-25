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
import { memo } from 'react';

import { summarizeHarvest } from '../../lib/sample-identification';
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

// Limite de caracteres por dado do card expandido (4 numa unica linha). O
// CSS ja trunca com reticencias (text-overflow) e impede transbordar o
// card; este teto e um reforco pra um valor longo nao empurrar o layout.
// Limites menores que no 2x2 porque cada celula agora ocupa ~1/4 da largura.
// "Local" tem um pouco mais de folga (nome de lugar); padrao/aspecto/catacao
// sao curtos por natureza.
const EXPANDED_STAT_LIMIT = {
  location: 16,
  padrao: 12,
  aspecto: 12,
  catacao: 12,
};

function formatExpandedStat(raw: unknown, max: number): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === '') return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Peneiras (sub-obj `peneiras` da ultima classificacao): ordem VISUAL da ficha
// (P18,P17,P16,MK,P15 na 1a linha; P14..P10 na 2a). So as preenchidas entram no
// card expandido (desktop) — ver `filledPeneiras`.
const PENEIRA_ORDER = [
  'p18',
  'p17',
  'p16',
  'mk',
  'p15',
  'p14',
  'p13',
  'p12',
  'p11',
  'p10',
] as const;
const PENEIRA_LABELS: Record<(typeof PENEIRA_ORDER)[number], string> = {
  p18: 'P18',
  p17: 'P17',
  p16: 'P16',
  mk: 'MK',
  p15: 'P15',
  p14: 'P14',
  p13: 'P13',
  p12: 'P12',
  p11: 'P11',
  p10: 'P10',
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function peneiraValueText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  return text === '' ? null : text;
}

export type SampleCardSelectionMode = 'idle' | 'blend';

export interface SampleCardProps {
  sample: SampleSnapshot;
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

function SampleCardComponent({
  sample,
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
  // Liga: no card so a safra mais nova; "+" sinaliza que ha outras (liga de
  // safras diferentes). Detalhe da amostra mostra todas.
  const harvestSummary = sample.declared.harvest ? summarizeHarvest(sample.declared.harvest) : null;

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
        onClick={handleClick}
        // Inelegivel nao e alternavel: omitir aria-pressed (so aria-disabled),
        // senao "pressed + disabled" juntos confundem o leitor de tela.
        aria-pressed={isIneligible ? undefined : isSelected}
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
            <span className="spv2-card-owner">{sample.declared.owner || '—'}</span>
            <span className="spv2-card-sep" />
            <span className="spv2-card-detail">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
              </svg>
              {availableSacks === null || availableSacks === undefined ? '—' : availableSacks} sacas
            </span>
            {harvestSummary ? (
              <>
                <span className="spv2-card-sep" />
                <span className="spv2-card-detail">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {harvestSummary.newest}
                  {harvestSummary.hasMore ? (
                    <span className="spv2-card-harvest-more"> +</span>
                  ) : null}
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
  // 4 dados principais do card expandido. Local vem do declarado; padrao/
  // aspecto/catacao vem da ultima classificacao (root-level do data). Cada
  // um cai pra "—" quando ausente (amostra ainda nao classificada).
  const classData = sample.latestClassification?.data ?? null;
  const localStat = formatExpandedStat(declared.location, EXPANDED_STAT_LIMIT.location);
  const padraoStat = formatExpandedStat(classData?.padrao, EXPANDED_STAT_LIMIT.padrao);
  const aspectoStat = formatExpandedStat(classData?.aspecto, EXPANDED_STAT_LIMIT.aspecto);
  const catacaoStat = formatExpandedStat(classData?.catacao, EXPANDED_STAT_LIMIT.catacao);

  // Peneiras preenchidas da ultima classificacao (so as que tem valor; pode ser
  // 0..10). Exibidas no card expandido SO no desktop (CSS), numa unica linha.
  const peneirasSource = isPlainRecord(classData?.peneiras) ? classData.peneiras : null;
  const filledPeneiras = peneirasSource
    ? PENEIRA_ORDER.flatMap((key) => {
        const value = peneiraValueText(peneirasSource[key]);
        return value === null ? [] : [{ key, label: PENEIRA_LABELS[key], value }];
      })
    : [];

  return (
    <div className={`spv2-card-wrap ${cardStatus.className}${isExpanded ? ' is-expanded' : ''}`}>
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
            <span className="spv2-card-owner">{sample.declared.owner || '—'}</span>
            <span className="spv2-card-sep" />
            <span className="spv2-card-detail">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
              </svg>
              {availableSacks === null || availableSacks === undefined ? '—' : availableSacks} sacas
            </span>
            {harvestSummary ? (
              <>
                <span className="spv2-card-sep" />
                <span className="spv2-card-detail">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {harvestSummary.newest}
                  {harvestSummary.hasMore ? (
                    <span className="spv2-card-harvest-more"> +</span>
                  ) : null}
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
          {/* Stats + peneiras na MESMA linha. grid-auto-flow:column +
              grid-auto-columns:1fr cria uma coluna igual por campo VISIVEL,
              numa unica linha — 4 stats no mobile, 4 stats + N peneiras no
              desktop (peneiras escondidas no mobile via CSS). Quanto mais
              campos, mais estreitas as colunas: layout e espacamento se
              ajustam sozinhos a quantidade. */}
          <div className="spv2-card-stats-grid">
            <div className={`spv2-card-stat${localStat === null ? ' is-empty' : ''}`}>
              <span className="spv2-card-stat-label">Local</span>
              <span className="spv2-card-stat-value">
                {localStat ?? <span className="spv2-card-stat-value--empty">—</span>}
              </span>
            </div>
            <div className={`spv2-card-stat${padraoStat === null ? ' is-empty' : ''}`}>
              <span className="spv2-card-stat-label">Padrão</span>
              <span className="spv2-card-stat-value">
                {padraoStat ?? <span className="spv2-card-stat-value--empty">—</span>}
              </span>
            </div>
            <div className={`spv2-card-stat${aspectoStat === null ? ' is-empty' : ''}`}>
              <span className="spv2-card-stat-label">Aspecto</span>
              <span className="spv2-card-stat-value">
                {aspectoStat ?? <span className="spv2-card-stat-value--empty">—</span>}
              </span>
            </div>
            <div className={`spv2-card-stat${catacaoStat === null ? ' is-empty' : ''}`}>
              <span className="spv2-card-stat-label">Catação</span>
              <span className="spv2-card-stat-value">
                {catacaoStat ?? <span className="spv2-card-stat-value--empty">—</span>}
              </span>
            </div>
            {/* Peneiras preenchidas: mesmos campos (nome verde + valor) dos
                demais stats, sem titulo. DESKTOP only (CSS esconde no mobile). */}
            {filledPeneiras.map((peneira) => (
              <div key={peneira.key} className="spv2-card-stat spv2-card-stat--peneira">
                <span className="spv2-card-stat-label">{peneira.label}</span>
                <span className="spv2-card-stat-value">{peneira.value}</span>
              </div>
            ))}
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

// Memoizado: a lista re-renderiza a cada tecla na busca / mudanca de estado da
// pagina. Com props estaveis (sample por ref, handlers via useCallback no
// page.tsx, demais primitivos) o card so re-renderiza quando OS SEUS dados
// mudam — nao a cada keystroke. Comparacao rasa padrao do memo basta.
export const SampleCard = memo(SampleCardComponent);
