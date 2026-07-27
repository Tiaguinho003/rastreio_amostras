'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

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

// Node Resultado (PG18, reescrito na PG53): quando a estimativa fecha, o node
// NÃO mostra número nenhum — só um check discreto no canto. A ficha inteira
// mora no painel lateral (PG52); repetir um resumo aqui criava duas fontes pra
// mesma verdade, em tamanhos diferentes, e a de cima era a menos útil.
//
// Erro segue NO node de propósito: é sobre o desenho do fluxo, que é
// justamente o que está na tela, e some sozinho quando o usuário corrige.
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

  return (
    <div className="pg-node pg-node-resultado is-ready">
      <Handle type="target" position={Position.Left} />
      {/* O check é um botão de verdade, não enfeite: o node inteiro abre a
          ficha no clique (`onNodeClick` do canvas), mas teclado e leitor de
          tela precisam de um alvo focável — e é este. */}
      <button
        type="button"
        className="pg-result-check nodrag"
        aria-label="Ver ficha estimada"
        onClick={() => openDrawer(id)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </button>
      <header className="pg-node-title">
        Resultado <span className="pg-node-badge">estimativa</span>
      </header>
    </div>
  );
}
