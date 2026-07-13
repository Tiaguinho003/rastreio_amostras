'use client';

import { Handle, Position, useStore, type NodeProps } from '@xyflow/react';

// Node Mistura: sem configuração — a proporção vem das sacas dos nodes de
// entrada. Badge de incompleto enquanto tem menos de 2 entradas (regra real
// do createBlend).
export function MisturaNode({ id }: NodeProps) {
  const inputCount = useStore((store) => store.edges.filter((edge) => edge.target === id).length);
  const incomplete = inputCount < 2;

  return (
    <div className={`pg-node pg-node-mistura${incomplete ? ' is-incomplete' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <header className="pg-node-title">Mistura</header>
      <p className={`pg-node-hint${incomplete ? '' : ' is-ok'}`}>
        {incomplete ? 'Conecte pelo menos 2 entradas' : `${inputCount} entradas`}
      </p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
