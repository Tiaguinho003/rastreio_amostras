'use client';

import { useEffect } from 'react';

import type { PgNodeType } from '../../lib/playground/types';
import { NODE_LABELS } from './NodePaletteSheet';

export type ConnectMenuState = {
  sourceId: string;
  options: PgNodeType[];
  /** O que o menu está perguntando — muda entre os três caminhos que o abrem. */
  title: string;
  /**
   * Só no modo "inserir entre" (PG64): a ligação que MORRE e o destino que
   * reata do outro lado do node novo. Ausente = o node novo só recebe uma
   * ligação vinda de `sourceId`.
   */
  insert?: { edgeId: string; targetId: string };
  /** Posição do menu relativa ao host do canvas. */
  screen: { x: number; y: number };
  /** Posição (em coordenadas do flow) onde o node novo nasce. */
  flow: { x: number; y: number };
};

// Menu de compatíveis (PG26). Três caminhos abrem ele hoje, e todos terminam
// igual — um node novo, já ligado: soltar uma conexão no vazio, o "+" do coto
// (PG62) e o "+" da barra da linha (PG64). O que muda é a pergunta no topo.
export function ConnectMenu({
  state,
  onPick,
  onClose,
}: {
  state: ConnectMenuState;
  onPick: (type: PgNodeType) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="pg-connect-menu"
      role="menu"
      aria-label={state.title}
      style={{ left: state.screen.x, top: state.screen.y }}
    >
      <p>{state.title}</p>
      {state.options.map((type) => (
        <button
          key={type}
          type="button"
          role="menuitem"
          className={`pg-accent-${type}`}
          onClick={() => onPick(type)}
        >
          {NODE_LABELS[type]}
        </button>
      ))}
    </div>
  );
}
