import assert from 'node:assert/strict';
import test from 'node:test';

import { playgroundEngine } from '../lib/playground/engine.ts';
import { mockLotIndex } from '../lib/playground/mock-lots.ts';
import { runSimulation } from '../lib/playground/simulation.ts';
import type { PgGraphEdge, PgGraphNode } from '../lib/playground/types.ts';

function lote(id: string, sampleId: string | null, sacks: number | null): PgGraphNode {
  return { id, type: 'lote', data: { sampleId, sacks } };
}

function node(id: string, type: PgGraphNode['type']): PgGraphNode {
  return { id, type };
}

function edge(source: string, target: string): PgGraphEdge {
  return { source, target };
}

test('runSimulation estima cada node Resultado do canvas', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 30),
    lote('l2', 'mock-5661', 10),
    node('m1', 'mistura'),
    node('r1', 'resultado'),
    node('r2', 'resultado'), // segundo resultado, desconectado
  ];
  const edges = [edge('l1', 'm1'), edge('l2', 'm1'), edge('m1', 'r1')];
  const outcomes = runSimulation(nodes, edges, mockLotIndex, playgroundEngine);

  const first = outcomes.get('r1');
  assert.equal(first?.kind, 'estimate');
  if (first?.kind === 'estimate') {
    assert.equal(first.estimate.totalSacks, 40);
  }
  assert.deepEqual(outcomes.get('r2'), { kind: 'error', reason: 'NO_MIX', nodeId: 'r2' });
});

test('runSimulation barra contribuição acima do saldo físico (PG8/PG10)', () => {
  // mock-5667 tem 3 sacas disponíveis (10 declaradas − 7 vendidas).
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5667', 5),
    lote('l2', 'mock-5658', 10),
    node('m1', 'mistura'),
    node('r1', 'resultado'),
  ];
  const edges = [edge('l1', 'm1'), edge('l2', 'm1'), edge('m1', 'r1')];
  const outcomes = runSimulation(nodes, edges, mockLotIndex, playgroundEngine);
  assert.deepEqual(outcomes.get('r1'), {
    kind: 'error',
    reason: 'LOT_OVER_BALANCE',
    nodeId: 'l1',
    lotNumber: '5667',
    available: 3,
  });
});

test('runSimulation propaga erros de composição do grafo', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 10),
    node('m1', 'mistura'),
    node('r1', 'resultado'),
  ];
  const edges = [edge('l1', 'm1'), edge('m1', 'r1')];
  const outcomes = runSimulation(nodes, edges, mockLotIndex, playgroundEngine);
  assert.deepEqual(outcomes.get('r1'), {
    kind: 'error',
    reason: 'MIX_NEEDS_TWO_INPUTS',
    nodeId: 'm1',
  });
});
