'use client';

import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';

export type AlvoNodeData = {
  peneiraAlvo: string;
  peneiraTolerancia: string;
  catacaoAlvo: string;
  catacaoTolerancia: string;
  sacasMinimas: string;
};

// Node Especificação-alvo (PG19/PG20): formulário de alvos pontual+tolerância
// + sacas mínimas. No protótipo é CASCA — os valores ficam no node mas a busca
// de combinações (por semelhança, Q-T2) só chega na F4.
export function AlvoNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const typed = data as AlvoNodeData;

  const bind = (key: keyof AlvoNodeData, ariaLabel: string) => ({
    value: typed[key] ?? '',
    'aria-label': ariaLabel,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      updateNodeData(id, { [key]: event.target.value }),
  });

  return (
    <div className="pg-node pg-node-alvo">
      <header className="pg-node-title">
        Especificação-alvo <span className="pg-node-badge">fluxo inverso</span>
      </header>
      <div className="pg-node-form nodrag nopan">
        <label>
          <span>p16 (%)</span>
          <input inputMode="decimal" placeholder="38" {...bind('peneiraAlvo', 'Alvo de p16')} />
          <span>±</span>
          <input
            inputMode="decimal"
            placeholder="10"
            {...bind('peneiraTolerancia', 'Tolerância de p16')}
          />
        </label>
        <label>
          <span>Catação</span>
          <input
            inputMode="decimal"
            placeholder="0,5"
            {...bind('catacaoAlvo', 'Alvo de catação')}
          />
          <span>±</span>
          <input
            inputMode="decimal"
            placeholder="0,2"
            {...bind('catacaoTolerancia', 'Tolerância de catação')}
          />
        </label>
        <label>
          <span>Sacas mín.</span>
          <input inputMode="numeric" placeholder="300" {...bind('sacasMinimas', 'Sacas mínimas')} />
        </label>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
