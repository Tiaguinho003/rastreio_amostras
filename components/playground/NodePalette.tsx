'use client';

import { useState } from 'react';

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

// Paleta lateral colapsável (PG26): arrasta pro canvas (dataTransfer) ou
// clica para adicionar no centro. Cores de acento por tipo (PG34).
export function NodePalette({ onAdd }: { onAdd: (type: PgNodeType) => void }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`pg-palette${collapsed ? ' is-collapsed' : ''}`}>
      <button
        type="button"
        className="pg-palette-toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
      >
        Nodes
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
        </svg>
      </button>
      {collapsed ? null : (
        <ul>
          {PALETTE.map((item) => (
            <li key={item.type}>
              <button
                type="button"
                className={`pg-palette-item pg-accent-${item.type}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/pg-node', item.type);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => onAdd(item.type)}
              >
                <span className="pg-palette-label">{NODE_LABELS[item.type]}</span>
                <span className="pg-palette-hint">{item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
