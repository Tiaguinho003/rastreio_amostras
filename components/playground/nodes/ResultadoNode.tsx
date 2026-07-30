'use client';

import type { NodeProps } from '@xyflow/react';

import type { SimulationOutcome } from '../../../lib/playground/simulation';
import { usePlaygroundResults } from '../results-context';
import { NodeShell } from './NodeShell';

// Uma ficha: a folha com as linhas do laudo estimado.
const ResultadoIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </svg>
);

function errorMessage(outcome: Extract<SimulationOutcome, { kind: 'error' }>): string {
  switch (outcome.reason) {
    case 'NO_MIX':
      return 'Conecte uma Mistura na entrada';
    case 'MIX_NEEDS_TWO_INPUTS':
      return 'A mistura precisa de pelo menos 2 entradas';
    // Os dois abaixo deixaram de ser alcançáveis pela tela na PG60 (o node de
    // Lote nasce escolhido e o confirmar barra valor acima do saldo). Ficam
    // porque os módulos puros ainda os produzem e são testados.
    case 'UNCONFIGURED_LOT':
      return 'Há lote sem configurar no fluxo';
    case 'LOT_OVER_BALANCE':
      return `Lote ${outcome.lotNumber}: acima do saldo (máx. ${outcome.available} sc)`;
  }
}

// Node Resultado (PG18 → PG53 → PG61): não mostra número nenhum — só um check no
// canto do quadrado quando a estimativa fecha; clicar no node abre a ficha
// (`onNodeClick` do canvas). Repetir um resumo aqui criaria duas fontes para a
// mesma verdade, em tamanhos diferentes, e a de cima era a menos útil.
//
// O ERRO segue no node de propósito: é sobre o desenho do fluxo, que é
// justamente o que está na tela, e some sozinho quando o usuário corrige. O que
// mudou na PG61 é o LUGAR — embaixo do nome, porque o quadrado só tem o ícone.
export function ResultadoNode({ id }: NodeProps) {
  const { outcomes, openDrawer } = usePlaygroundResults();
  const outcome = outcomes?.get(id) ?? null;

  if (!outcome) {
    return <NodeShell id={id} icon={ResultadoIcon} name="Resultado" variant="incomplete" target />;
  }

  if (outcome.kind === 'error') {
    return (
      <NodeShell id={id} icon={ResultadoIcon} name="Resultado" variant="error" target>
        <p className="pg-node-error" role="alert">
          {errorMessage(outcome)}
        </p>
      </NodeShell>
    );
  }

  return (
    <NodeShell
      id={id}
      icon={ResultadoIcon}
      name="Resultado"
      variant="ready"
      target
      corner={
        // O check é um botão de verdade, não enfeite: o node inteiro abre a
        // ficha no clique, mas teclado e leitor de tela precisam de um alvo
        // focável — e é este.
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
      }
    />
  );
}
