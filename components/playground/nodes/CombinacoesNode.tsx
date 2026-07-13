'use client';

import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';

export type CombinacoesNodeData = { maxLots: number };

// Node Combinações (PG21): saída do fluxo inverso. No protótipo é CASCA — a
// busca por semelhança (Q-T2) chega na F4; executar mostra o placeholder.
export function CombinacoesNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const typed = data as CombinacoesNodeData;

  return (
    <div className="pg-node pg-node-combinacoes">
      <Handle type="target" position={Position.Left} />
      <header className="pg-node-title">
        Combinações <span className="pg-node-badge">fluxo inverso</span>
      </header>
      <label className="pg-node-sacks nodrag nopan">
        <span>máx. lotes</span>
        <select
          value={typed.maxLots ?? 3}
          aria-label="Máximo de lotes por combinação"
          onChange={(event) => updateNodeData(id, { maxLots: Number(event.target.value) })}
        >
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </label>
      <p className="pg-node-hint">Busca de combinações em breve</p>
    </div>
  );
}
