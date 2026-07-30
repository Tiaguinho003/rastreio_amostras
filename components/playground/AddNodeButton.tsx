'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';

// Os dois gatilhos do painel de nodes. A mesma peça em dois lugares porque a
// pergunta é a mesma; o que muda é quando cada um serve:
//
// - `corner` (PG58): sempre visível, no canto superior direito. Fica dentro de
//   um `Panel` do React Flow, que resolve o posicionamento sobre o canvas.
// - `center` (PG59): só com o canvas VAZIO, no meio da tela. É o convite ao
//   primeiro node e some no instante em que existe um. A PG54 tirou daqui a
//   frase cinza ("arraste um Lote da paleta"); o convite volta como ALVO, não
//   como texto — quem chega na página vazia tem uma coisa para tocar.
export function AddNodeButton({
  variant,
  onOpen,
}: {
  variant: 'corner' | 'center';
  onOpen: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className={`pg-add-node is-${variant}`}
      aria-label="Adicionar node"
      aria-haspopup="dialog"
      title="Adicionar node"
      onClick={onOpen}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
