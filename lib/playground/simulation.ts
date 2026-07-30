import type { SampleSnapshot } from '../types';
import type { LigaEstimate, PlaygroundEngine } from './engine';
// Import COM extensão .ts: é um import de VALOR entre módulos de lib/ e o
// runner de teste (node --experimental-strip-types) não resolve extensionless.
import { isActive, resolveComposition } from './graph.ts';
import type { PgGraphEdge, PgGraphNode } from './types';

// Execução da simulação (puro, testável): para cada node Resultado do canvas,
// resolve a composição (graph.ts) e estima (engine.ts). O teto de saldo é
// checado POR NODE de lote (PG8/PG10) — cada contribuição individual respeita
// o saldo físico, como na liga real (overcommit ENTRE ligas é permitido, por
// isso o agregado da cascata não é limitado).

export type SimulationOutcome =
  | { kind: 'estimate'; estimate: LigaEstimate }
  | {
      kind: 'error';
      reason: 'NO_MIX' | 'MIX_NEEDS_TWO_INPUTS' | 'UNCONFIGURED_LOT';
      nodeId: string;
    }
  | {
      kind: 'error';
      reason: 'LOT_OVER_BALANCE';
      nodeId: string;
      lotNumber: string;
      available: number;
    };

/** BFS reverso a partir do Resultado: todos os nodes Lote que o alimentam. */
function collectFeedingLotNodes(
  nodes: PgGraphNode[],
  edges: PgGraphEdge[],
  resultNodeId: string
): PgGraphNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const stack = [resultNodeId];
  const seen = new Set<string>();
  const lots: PgGraphNode[] = [];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) {
      if (edge.target !== current) continue;
      const source = byId.get(edge.source);
      // PG65: origem desativada não alimenta nada — e por isso não pode ser
      // cobrada pelo teto de saldo. Sem isto, um lote desativado acima do saldo
      // travaria uma estimativa da qual ele nem participa.
      if (!isActive(source) || !source) continue;
      if (source.type === 'lote') lots.push(source);
      else if (source.type === 'mistura') stack.push(source.id);
    }
  }
  return lots;
}

function resolveOutcome(
  nodes: PgGraphNode[],
  edges: PgGraphEdge[],
  resultNodeId: string,
  lotsById: ReadonlyMap<string, SampleSnapshot>,
  engine: PlaygroundEngine
): SimulationOutcome {
  for (const lotNode of collectFeedingLotNodes(nodes, edges, resultNodeId)) {
    const sampleId = lotNode.data?.sampleId ?? null;
    const sacks = lotNode.data?.sacks ?? null;
    if (!sampleId || typeof sacks !== 'number') continue; // vira UNCONFIGURED_LOT no resolve
    const sample = lotsById.get(sampleId);
    if (!sample) continue;
    const available = sample.availableSacks ?? 0;
    if (sacks > available) {
      return {
        kind: 'error',
        reason: 'LOT_OVER_BALANCE',
        nodeId: lotNode.id,
        lotNumber: sample.internalLotNumber ?? '—',
        available,
      };
    }
  }
  const composition = resolveComposition(nodes, edges, resultNodeId, lotsById);
  if (!composition.ok) {
    return { kind: 'error', reason: composition.reason, nodeId: composition.nodeId };
  }
  return { kind: 'estimate', estimate: engine.estimateBlend(composition.components) };
}

export function runSimulation(
  nodes: PgGraphNode[],
  edges: PgGraphEdge[],
  lotsById: ReadonlyMap<string, SampleSnapshot>,
  engine: PlaygroundEngine
): Map<string, SimulationOutcome> {
  const outcomes = new Map<string, SimulationOutcome>();
  for (const node of nodes) {
    // PG65: Resultado desativado não calcula. Sai do Map inteiro, e não como
    // erro — o node desativado não tem nada de errado, ele está fora da conta.
    if (node.type !== 'resultado' || !isActive(node)) continue;
    outcomes.set(node.id, resolveOutcome(nodes, edges, node.id, lotsById, engine));
  }
  return outcomes;
}
