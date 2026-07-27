'use client';

import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';

import type { SampleSnapshot } from '../../../lib/types';
import { LotSearchField } from '../LotSearchField';

// O snapshot do lote mora no PRÓPRIO node desde a troca pela busca real: o
// canvas não mantém mais um índice à parte (era o `mockLotIndex`), e o
// `lotsById` que os módulos puros recebem é derivado dos nodes a cada
// simulação. Um dono só para o dado.
export type LoteNodeData = {
  sampleId: string | null;
  sacks: number | null;
  sample: SampleSnapshot | null;
};

// Node Lote (PG29/PG30): recém-criado mostra a busca embutida; configurado
// fica MÍNIMO (número + input de sacas), com dono/saldo/safra no hover e o
// saldo revelado na mensagem de erro quando o input estoura o teto (PG8/PG10).
export function LoteNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const typed = data as LoteNodeData;
  const sample = typed.sample;

  if (!sample) {
    return (
      <div className="pg-node pg-node-lote is-incomplete">
        <header className="pg-node-title">Lote</header>
        <LotSearchField
          onPick={(picked) =>
            updateNodeData(id, {
              sampleId: picked.id,
              sample: picked,
              // Default = saldo físico total, como a liga real (F2.1).
              sacks: picked.availableSacks ?? null,
            })
          }
        />
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  const available = sample.availableSacks ?? 0;
  const overCap = typed.sacks !== null && typed.sacks > available;
  const missing = typed.sacks === null || typed.sacks < 1;

  return (
    <div className={`pg-node pg-node-lote${overCap || missing ? ' has-error' : ''}`}>
      <header className="pg-node-title">
        Lote {sample.internalLotNumber}
        {sample.isBlend ? <span className="pg-node-badge">liga</span> : null}
      </header>
      <label className="pg-node-sacks nodrag nopan">
        <span>sacas</span>
        <input
          value={typed.sacks ?? ''}
          inputMode="numeric"
          aria-label={`Sacas do lote ${sample.internalLotNumber}`}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D+/g, '');
            updateNodeData(id, { sacks: digits ? Number(digits) : null });
          }}
        />
      </label>
      {overCap ? (
        <p className="pg-node-error" role="alert">
          Máx. {available} sc disponíveis
        </p>
      ) : missing ? (
        <p className="pg-node-error" role="alert">
          Informe as sacas
        </p>
      ) : null}
      <div className="pg-node-tooltip" role="tooltip">
        <span>{sample.declared.owner ?? 'Sem dono'}</span>
        <span>disp. {available} sc</span>
        <span>safra {sample.declared.harvest ?? '—'}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
