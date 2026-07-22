'use client';

// Painel de acoes de um lote da lista mobile — o que o `⋯` do card abre.
//
// RD16 M2: substitui os tres botoes (Perda | Enviar | Detalhes) que moravam no
// card expandido, e traz a lista COMPLETA do `⋯` da linha da tabela do desktop
// — inclusive "Imprimir etiqueta" e "Deletar lote", que o mobile nao alcancava.
//
// Por que sheet e nao popover: o `.spv2-card-wrap` tem `overflow: hidden` e
// `content-visibility: auto`; um menu absoluto ancorado dentro do card seria
// recortado. O `.fv-row-menu` do desktop tambem nao serve — nao tem uma linha
// de CSS fora do `@media (min-width: 901px)`. O molde aqui e o `.is-menu` do
// menu da conta (BottomSheet de altura automatica), com os itens do
// `.fv-more-item` do kit.
//
// Gating igual ao do desktop: item AUSENTE quando nao cabe, nunca desabilitado.

import { BottomSheet } from '../BottomSheet';
import type { SampleSnapshot } from '../../lib/types';

export interface SampleCardActionsSheetProps {
  /** Lote alvo. `null` fecha o painel. */
  sample: SampleSnapshot | null;
  /** Rotulo do lote no cabecalho (numero interno ou id curto). */
  lotLabel: string;
  canSend: boolean;
  canLoss: boolean;
  canDelete: boolean;
  onClose: () => void;
  onOpenDetails: (sample: SampleSnapshot) => void;
  onSend: (sample: SampleSnapshot) => void;
  onLoss: (sample: SampleSnapshot) => void;
  onPrintLabel: (sample: SampleSnapshot) => void;
  onDelete: (sample: SampleSnapshot) => void;
}

export function SampleCardActionsSheet({
  sample,
  lotLabel,
  canSend,
  canLoss,
  canDelete,
  onClose,
  onOpenDetails,
  onSend,
  onLoss,
  onPrintLabel,
  onDelete,
}: SampleCardActionsSheetProps) {
  // Toda acao fecha o painel ANTES de disparar: as que abrem outra superficie
  // (envio, perda, etiqueta, drawer) empilhariam sheet sobre sheet, e o arbitro
  // de history do BottomSheet cobra caro por isso.
  const run = (action: (sample: SampleSnapshot) => void) => {
    if (!sample) return;
    const target = sample;
    onClose();
    action(target);
  };

  return (
    <BottomSheet
      open={Boolean(sample)}
      onClose={onClose}
      title={`Lote ${lotLabel}`}
      ariaLabel={`Ações do lote ${lotLabel}`}
      className="is-menu sample-card-actions-sheet"
      dragToDismiss
    >
      <div className="fv-more-menu is-sheet" role="menu">
        <button
          type="button"
          role="menuitem"
          className="fv-more-item"
          onClick={() => run(onOpenDetails)}
        >
          Ver detalhes
        </button>

        {canSend ? (
          <button
            type="button"
            role="menuitem"
            className="fv-more-item"
            onClick={() => run(onSend)}
          >
            Enviar amostra
          </button>
        ) : null}

        {canLoss ? (
          <button
            type="button"
            role="menuitem"
            className="fv-more-item"
            onClick={() => run(onLoss)}
          >
            Registrar perda
          </button>
        ) : null}

        <button
          type="button"
          role="menuitem"
          className="fv-more-item"
          onClick={() => run(onPrintLabel)}
        >
          Imprimir etiqueta
        </button>

        {canDelete ? (
          <button
            type="button"
            role="menuitem"
            className="fv-more-item is-danger"
            onClick={() => run(onDelete)}
          >
            Deletar lote
          </button>
        ) : null}
      </div>
    </BottomSheet>
  );
}
