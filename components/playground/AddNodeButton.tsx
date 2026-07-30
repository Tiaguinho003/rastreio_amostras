'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';

// Os "+" do Simulador — UMA peça, três lugares (PG62). Todos com o mesmo
// desenho: quadradinho branco de cantos suaves, sombra e o "+" verde. O que
// muda é o tamanho e o que cada um abre:
//
// - `corner` (PG58): sempre visível, no canto superior direito. Fica dentro de
//   um `Panel` do React Flow, que resolve o posicionamento sobre o canvas.
// - `center` (PG59): só com o canvas VAZIO, no meio da tela. É o convite ao
//   primeiro node e some no instante em que existe um. A PG54 tirou daqui a
//   frase cinza ("arraste um Lote da paleta"); o convite volta como ALVO, não
//   como texto — quem chega na página vazia tem uma coisa para tocar.
// - `stub` (PG62): na ponta do coto de conexão de um node. Abre o menu de
//   compatíveis, não o painel — daí o `aria-haspopup` diferente.
//
// Até a PG61 o do centro era um círculo verde grande e o do canto um círculo
// branco. Viraram a mesma peça porque fazem a mesma pergunta: o usuário não
// deveria ter de aprender dois botões para o mesmo ato.
export function AddNodeButton({
  variant,
  onOpen,
  label = 'Adicionar node',
}: {
  variant: 'corner' | 'center' | 'stub';
  onOpen: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  label?: string;
}) {
  const isStub = variant === 'stub';
  return (
    <button
      type="button"
      // `nodrag`/`nopan`: o coto mora DENTRO do node, e sem isso o mousedown no
      // "+" começaria a arrastar o node em vez de abrir o menu.
      className={`pg-add-node is-${variant}${isStub ? ' nodrag nopan' : ''}`}
      aria-label={label}
      aria-haspopup={isStub ? 'menu' : 'dialog'}
      title={label}
      onClick={onOpen}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
