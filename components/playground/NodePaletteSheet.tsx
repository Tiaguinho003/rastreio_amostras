'use client';

import { BottomSheet } from '../BottomSheet';
import type { PgNodeType } from '../../lib/playground/types';

export const NODE_LABELS: Record<PgNodeType, string> = {
  lote: 'Lote',
  mistura: 'Mistura',
  resultado: 'Resultado',
};

const PALETTE: Array<{ type: PgNodeType; hint: string }> = [
  { type: 'lote', hint: 'Fonte: um lote real' },
  { type: 'mistura', hint: 'Combina 2+ entradas' },
  { type: 'resultado', hint: 'Estimativa da liga' },
];

// Painel de nodes (PG58). Era a paleta DOCADA na esquerda do canvas, de onde se
// arrastava o node até o ponto de soltar (PG26). Virou o painel lateral direito
// do kit — `BottomSheet` + `.fv-panel-sheet.side-sheet` —, aberto pelo "+" do
// canto superior direito ou pelo "+" central do canvas vazio.
//
// O backdrop é o bloqueante padrão do `.side-sheet`, e é ele que mata o
// arraste: o node nasceria sobre um backdrop que intercepta o drop. Nenhuma
// exceção nova, então — as duas que existem (o peek da lista e a ficha deste
// mesmo Simulador) valem porque o que está atrás precisa seguir clicável, e
// aqui o gesto acaba no instante em que o node é escolhido.
//
// Os cartões são o `.fv-choice` do kit, não peça própria: rótulo + linha de
// apoio e o afundar sem troca de cor já eram exatamente o que a paleta fazia à
// mão. O que sobrou de próprio é o acento por tipo (`.pg-accent-*`, PG34), que
// amarra o cartão à cor do node no canvas.
export function NodePaletteSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (type: PgNodeType) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={null}
      ariaLabel="Adicionar node"
      closeVariant="edge-back"
      className="fv-panel-sheet side-sheet pg-nodes-sheet"
    >
      {/* Mesma razão da ficha: o `.fv-panel-sheet` não usa o slot de `title` do
          BottomSheet, então o título mora no corpo. */}
      <h3 className="pg-panel-title">Adicionar node</h3>
      <div className="fv-choice-group pg-nodes-picker" role="group" aria-label="Tipos de node">
        {PALETTE.map((item) => (
          <button
            key={item.type}
            type="button"
            className={`fv-choice pg-accent-${item.type}`}
            onClick={() => onPick(item.type)}
          >
            <span className="fv-choice-label">{NODE_LABELS[item.type]}</span>
            <span className="fv-choice-hint">{item.hint}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
