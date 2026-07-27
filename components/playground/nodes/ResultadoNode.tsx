'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

import {
  PENEIRA_KEYS,
  type EstimateFieldValue,
  type PeneiraKey,
} from '../../../lib/playground/engine';
import type { SimulationOutcome } from '../../../lib/playground/simulation';
import { usePlaygroundResults } from '../results-context';

function errorMessage(outcome: Extract<SimulationOutcome, { kind: 'error' }>): string {
  switch (outcome.reason) {
    case 'NO_MIX':
      return 'Conecte uma Mistura na entrada';
    case 'MIX_NEEDS_TWO_INPUTS':
      return 'A mistura precisa de pelo menos 2 entradas';
    case 'UNCONFIGURED_LOT':
      return 'Há lote sem configurar no fluxo';
    case 'LOT_OVER_BALANCE':
      return `Lote ${outcome.lotNumber}: acima do saldo (máx. ${outcome.available} sc)`;
  }
}

/** Peneira de maior participação — o destaque do resumo (PG18). */
function topPeneira(peneiras: Record<PeneiraKey, EstimateFieldValue>): string | null {
  let bestKey: PeneiraKey | null = null;
  let bestValue = -1;
  for (const key of PENEIRA_KEYS) {
    const field = peneiras[key];
    if (field.kind === 'value' && field.value > bestValue) {
      bestValue = field.value;
      bestKey = key;
    }
  }
  if (!bestKey) return null;
  return `${bestKey.toUpperCase()} ${String(bestValue).replace('.', ',')}%`;
}

// Node Resultado (PG18): resumo da estimativa no canvas + "Ver ficha" que abre
// o drawer lateral. Antes da execução (PG14) fica como casca incompleta.
export function ResultadoNode({ id }: NodeProps) {
  const { outcomes, openDrawer } = usePlaygroundResults();
  const outcome = outcomes?.get(id) ?? null;

  if (!outcome) {
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

  if (outcome.kind === 'error') {
    return (
      <div className="pg-node pg-node-resultado has-error">
        <Handle type="target" position={Position.Left} />
        <header className="pg-node-title">
          Resultado <span className="pg-node-badge">estimativa</span>
        </header>
        <p className="pg-node-error" role="alert">
          {errorMessage(outcome)}
        </p>
      </div>
    );
  }

  const { estimate } = outcome;
  const highlight = topPeneira(estimate.peneiras);

  return (
    <div className="pg-node pg-node-resultado">
      <Handle type="target" position={Position.Left} />
      <header className="pg-node-title">
        Resultado <span className="pg-node-badge">estimativa</span>
      </header>
      <div className="pg-result-summary">
        <strong>{estimate.totalSacks} sacas</strong>
        <span>safra {estimate.harvest ?? '—'}</span>
        <span>{estimate.ownerLabel ?? 'Sem dono'}</span>
        <span>
          {estimate.composition.length} {estimate.composition.length === 1 ? 'lote' : 'lotes'}
          {highlight ? ` · ${highlight}` : ''}
        </span>
      </div>
      <button type="button" className="pg-result-open nodrag" onClick={() => openDrawer(id)}>
        Ver ficha completa →
      </button>
    </div>
  );
}
