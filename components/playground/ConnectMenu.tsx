'use client';

import { useEffect } from 'react';

import type { PgNodeType } from '../../lib/playground/types';
import { NODE_LABELS } from './NodePaletteSheet';

export type ConnectMenuState = {
  sourceId: string;
  options: PgNodeType[];
  /** Posição do menu relativa ao host do canvas. */
  screen: { x: number; y: number };
  /** Posição (em coordenadas do flow) onde o node novo nasce. */
  flow: { x: number; y: number };
};

// Menu de compatíveis (PG26): soltar uma conexão no vazio abre este menu no
// ponto — escolher cria o node já conectado ao node de origem.
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
      aria-label="Conectar a um node novo"
      style={{ left: state.screen.x, top: state.screen.y }}
    >
      <p>Conectar a…</p>
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
