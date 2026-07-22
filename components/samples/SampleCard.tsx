'use client';

// Card de um lote na lista mobile. Dois modos:
//
// - 'idle' (default): tap abre o lote (?lote=, o mesmo que a LINHA da tabela do
//   desktop faz). O `⋯` na borda direita abre o painel de acoes.
// - 'blend': vira <button> que toggla selecao. Ganha bolinha a esquerda
//   (vazia / verde-com-check / cinza-opaca inelegivel). Inelegivel: card todo
//   acinzentado, tap dispara onShowIneligibleReason em vez de toggle.
//
// RD16 M2: a EXPANSAO morreu. O card abria um painel com Local/Padrao/Aspecto/
// Catacao + peneiras e tres acoes (Perda | Enviar | Detalhes), e so por ele se
// chegava ao detalhe. Duas coisas condenaram o desenho: as peneiras nunca
// apareciam no mobile (CSS as escondia; no desktop o card nem monta) e o
// caminho pro lote custava dois toques onde a tabela do desktop custa um. O que
// o painel dava de acao rapida agora esta no `⋯` — mesma lista do `⋯` da linha.
//
// Rodada 2 do M2: o card virou a LINHA da tabela em formato estreito. Saiu a
// barra de status lateral (4px com glow, na paleta antiga — "Em aberto" era
// AZUL aqui e verde na tabela) e sairam os dois icones da linha de baixo; o
// status passa a ser lido num lugar so, o `.fv-chip`, e os dados se separam
// por ponto medio. `.spv2-card-bar` e `.spv2-card-sep` seguem no CSS: quem
// ainda os renderiza e o RelatedSampleRow e o SaleContractLotPickerModal.

import { memo } from 'react';

import { ownerDisplayValue, sampleStatusDisplay } from '../../lib/sample-display';
import type { SampleEligibilityReason, SampleSnapshot } from '../../lib/types';
import { BlendBadge } from './BlendBadge';
import { HarvestDisplay } from './HarvestDisplay';

export type SampleCardSelectionMode = 'idle' | 'blend';

export interface SampleCardProps {
  sample: SampleSnapshot;
  /** Executado antes de abrir o lote (preserva o snapshot na sessionStorage). */
  onClickCapture?: () => void;
  /** Liga B1.4 — modo selecao. 'idle' default mantem comportamento atual. */
  selectionMode?: SampleCardSelectionMode;
  /** Liga B1.4 — selecionado no modo blend. */
  isSelected?: boolean;
  /** Liga B1.4 — tap em card elegivel no modo blend. Recebe o snapshot inteiro:
   *  a selecao da liga guarda o item (nao so o id) pra sobreviver a busca. */
  onToggleSelect?: (sample: SampleSnapshot) => void;
  /** Liga B1.4 — tap em card inelegivel no modo blend (mostra o motivo). */
  onShowIneligibleReason?: (reason: SampleEligibilityReason) => void;
  /** Tap no card: abre o OVERLAY do lote na propria lista (?lote=). */
  onOpenDetails?: (sampleId: string) => void;
  /** `⋯`: abre o painel de acoes do lote. */
  onOpenActions?: (sample: SampleSnapshot) => void;
}

function SampleCardComponent({
  sample,
  onClickCapture,
  selectionMode = 'idle',
  isSelected = false,
  onToggleSelect,
  onShowIneligibleReason,
  onOpenDetails,
  onOpenActions,
}: SampleCardProps) {
  const cardStatus = sampleStatusDisplay(sample);
  const availableSacks = sample.availableSacks;
  // Liga: no card a safra multipla vira o badge "Mix" (HarvestDisplay,
  // showMixSafras=false); o detalhe da amostra mostra o Mix + as safras.
  const hasHarvest = Boolean(sample.declared.harvest?.trim());
  const lotCode = sample.internalLotNumber ?? sample.id;

  // Miolo do card — identico nos dois modos, por isso mora numa variavel.
  const content = (
    <div className="spv2-card-content">
      <div className="spv2-card-top">
        <span className="spv2-card-code">{lotCode}</span>
        {sample.isBlend ? <BlendBadge size="sm" /> : null}
        {/* `is-sm`: a pastilha do kit, um ponto menor — na celula do lote ela
            divide espaco com o numero e o badge de liga. */}
        <span className={`fv-chip is-sm ${cardStatus.chip}`}>{cardStatus.label}</span>
      </div>
      <div className="spv2-card-bottom">
        <span className="spv2-card-owner">{ownerDisplayValue(sample) || '—'}</span>
        <span className="spv2-card-dot" aria-hidden="true">
          ·
        </span>
        <span className="spv2-card-detail">
          {availableSacks === null || availableSacks === undefined ? '—' : availableSacks} sacas
        </span>
        {hasHarvest ? (
          <>
            <span className="spv2-card-dot" aria-hidden="true">
              ·
            </span>
            <span className="spv2-card-detail">
              <HarvestDisplay harvest={sample.declared.harvest} showMixSafras={false} />
            </span>
          </>
        ) : null}
      </div>
    </div>
  );

  // Liga B1.4: branching idle vs blend.
  if (selectionMode === 'blend') {
    const eligibility = sample.eligibility;
    const isIneligible = eligibility !== undefined && eligibility !== null && !eligibility.eligible;
    const handleClick = () => {
      if (isIneligible) {
        onShowIneligibleReason?.(eligibility?.reason ?? null);
        return;
      }
      onToggleSelect?.(sample);
    };

    const cardClassName = [
      'spv2-card',
      cardStatus.modifier,
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
        <span className={circleClassName} aria-hidden="true">
          {isSelected && !isIneligible ? (
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M5 12l5 5L20 7" />
            </svg>
          ) : null}
        </span>
        {content}
      </button>
    );
  }

  // Modo idle. O `⋯` e IRMAO do card, nunca filho: botao dentro de botao e HTML
  // invalido, e ancorar um popover dentro do wrap tambem nao serve — ele tem
  // `overflow: hidden` e `content-visibility`, que recortariam o menu. Dai o
  // painel de acoes ser um sheet, aberto pela pagina.
  return (
    <div className={`spv2-card-wrap ${cardStatus.modifier}`}>
      <button
        type="button"
        className="spv2-card"
        onClick={() => {
          onClickCapture?.();
          onOpenDetails?.(sample.id);
        }}
      >
        {content}
      </button>

      {onOpenActions ? (
        <button
          type="button"
          className="spv2-card-dots"
          aria-haspopup="dialog"
          aria-label={`Ações do lote ${lotCode}`}
          onClick={() => onOpenActions(sample)}
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

// Memoizado: a lista re-renderiza a cada tecla na busca / mudanca de estado da
// pagina. Com props estaveis (sample por ref, handlers via useCallback no
// page.tsx, demais primitivos) o card so re-renderiza quando OS SEUS dados
// mudam — nao a cada keystroke. Comparacao rasa padrao do memo basta.
export const SampleCard = memo(SampleCardComponent);
