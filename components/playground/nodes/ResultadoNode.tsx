'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

// Node Resultado (PG18): resumo da estimativa + acesso ao drawer com a ficha
// completa. Nesta fase é casca — a execução (pill + motor stub) liga no C5.
export function ResultadoNode(_props: NodeProps) {
  return (
    <div className="pg-node pg-node-resultado is-incomplete">
      <Handle type="target" position={Position.Left} />
      <header className="pg-node-title">
        Resultado <span className="pg-node-badge">estimativa</span>
      </header>
      <p className="pg-node-hint">Conecte uma mistura e execute o fluxo</p>
    </div>
  );
}
