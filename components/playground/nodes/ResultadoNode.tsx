'use client';

import type { NodeProps } from '@xyflow/react';

import type { SimulationOutcome } from '../../../lib/playground/simulation';
import { usePlaygroundResults } from '../results-context';
import { NodeShell } from './NodeShell';
import { NODE_ICONS } from './icons';

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
export function ResultadoNode({ id, data }: NodeProps) {
  const { outcomes, openDrawer } = usePlaygroundResults();
  const outcome = outcomes?.get(id) ?? null;
  // PG65: desativado, ele some do `Map` de outcomes — e o `!outcome` abaixo o
  // pegaria como "incompleto". O `disabled` do `NodeShell` vence os estados,
  // então o caminho é o mesmo dos outros dois: passar a bandeira e sair.
  const disabled = Boolean(data?.disabled);

  if (!outcome) {
    return (
      <NodeShell
        id={id}
        icon={NODE_ICONS.resultado}
        name="Resultado"
        variant="incomplete"
        disabled={disabled}
        target
      />
    );
  }

  if (outcome.kind === 'error') {
    return (
      <NodeShell
        id={id}
        icon={NODE_ICONS.resultado}
        name="Resultado"
        variant="error"
        disabled={disabled}
        target
      >
        <p className="pg-node-error" role="alert">
          {errorMessage(outcome)}
        </p>
      </NodeShell>
    );
  }

  return (
    <NodeShell
      id={id}
      icon={NODE_ICONS.resultado}
      name="Resultado"
      variant="ready"
      disabled={disabled}
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
