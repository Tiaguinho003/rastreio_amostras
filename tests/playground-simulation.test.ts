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

// ── Node desativado (PG65) ─────────────────────────────────────────────────
//
// A regra é uma só: uma edge cuja ORIGEM está desativada não existe para o
// cálculo, e um Resultado desativado não produz estimativa. Os testes abaixo
// cobrem cada tipo caindo por essa mesma regra.

function off(node: PgGraphNode): PgGraphNode {
  return { ...node, data: { ...node.data, disabled: true } };
}

test('runSimulation ignora o lote desativado na composição (PG65)', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 30),
    lote('l2', 'mock-5661', 10),
    off(lote('l3', 'mock-5667', 3)),
    node('m1', 'mistura'),
    node('r1', 'resultado'),
  ];
  const edges = [edge('l1', 'm1'), edge('l2', 'm1'), edge('l3', 'm1'), edge('m1', 'r1')];
  const outcome = runSimulation(nodes, edges, mockLotIndex, playgroundEngine).get('r1');

  assert.equal(outcome?.kind, 'estimate');
  if (outcome?.kind === 'estimate') {
    // 30 + 10, sem as 3 do lote desativado.
    assert.equal(outcome.estimate.totalSacks, 40);
  }
});

test('runSimulation conta só as entradas ATIVAS da mistura (PG65)', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 30),
    off(lote('l2', 'mock-5661', 10)),
    off(lote('l3', 'mock-5667', 3)),
    node('m1', 'mistura'),
    node('r1', 'resultado'),
  ];
  const edges = [edge('l1', 'm1'), edge('l2', 'm1'), edge('l3', 'm1'), edge('m1', 'r1')];
  const outcome = runSimulation(nodes, edges, mockLotIndex, playgroundEngine).get('r1');

  // Três entradas no desenho, uma ativa — a mistura fica incompleta.
  assert.deepEqual(outcome, { kind: 'error', reason: 'MIX_NEEDS_TWO_INPUTS', nodeId: 'm1' });
});

test('runSimulation trata mistura desativada como ausente (PG65)', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 30),
    lote('l2', 'mock-5661', 10),
    off(node('m1', 'mistura')),
    node('r1', 'resultado'),
  ];
  const edges = [edge('l1', 'm1'), edge('l2', 'm1'), edge('m1', 'r1')];
  const outcome = runSimulation(nodes, edges, mockLotIndex, playgroundEngine).get('r1');

  assert.deepEqual(outcome, { kind: 'error', reason: 'NO_MIX', nodeId: 'r1' });
});

test('runSimulation não produz outcome para Resultado desativado (PG65)', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 30),
    lote('l2', 'mock-5661', 10),
    node('m1', 'mistura'),
    off(node('r1', 'resultado')),
  ];
  const edges = [edge('l1', 'm1'), edge('l2', 'm1'), edge('m1', 'r1')];
  const outcomes = runSimulation(nodes, edges, mockLotIndex, playgroundEngine);

  // Fora do Map, e não como erro: node desativado não tem nada de errado.
  assert.equal(outcomes.has('r1'), false);
  assert.equal(outcomes.size, 0);
});

test('lote desativado acima do saldo não trava a estimativa (PG65)', () => {
  // mock-5667 tem 3 sacas disponíveis; o node pede 5 — mas está desativado.
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 30),
    lote('l2', 'mock-5661', 10),
    off(lote('l3', 'mock-5667', 5)),
    node('m1', 'mistura'),
    node('r1', 'resultado'),
  ];
  const edges = [edge('l1', 'm1'), edge('l2', 'm1'), edge('l3', 'm1'), edge('m1', 'r1')];
  const outcome = runSimulation(nodes, edges, mockLotIndex, playgroundEngine).get('r1');

  assert.equal(outcome?.kind, 'estimate');
});
