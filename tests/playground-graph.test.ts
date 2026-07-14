import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveComposition, validateConnection } from '../lib/playground/graph.ts';
import { mockLotIndex } from '../lib/playground/mock-lots.ts';
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

test('validateConnection aceita os pares válidos do catálogo', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 10),
    node('m1', 'mistura'),
    node('m2', 'mistura'),
    node('r1', 'resultado'),
  ];
  assert.deepEqual(validateConnection(nodes, [], edge('l1', 'm1')), { ok: true });
  assert.deepEqual(validateConnection(nodes, [], edge('m1', 'm2')), { ok: true });
  assert.deepEqual(validateConnection(nodes, [], edge('m1', 'r1')), { ok: true });
});

test('validateConnection rejeita pares inválidos e self-connect', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 10),
    lote('l2', 'mock-5661', 5),
    node('m1', 'mistura'),
    node('r1', 'resultado'),
  ];
  assert.deepEqual(validateConnection(nodes, [], edge('l1', 'r1')), {
    ok: false,
    reason: 'INVALID_PAIR',
  });
  assert.deepEqual(validateConnection(nodes, [], edge('r1', 'l1')), {
    ok: false,
    reason: 'INVALID_PAIR',
  });
  assert.deepEqual(validateConnection(nodes, [], edge('l1', 'l2')), {
    ok: false,
    reason: 'INVALID_PAIR',
  });
  assert.deepEqual(validateConnection(nodes, [], edge('m1', 'm1')), {
    ok: false,
    reason: 'SELF',
  });
});

test('validateConnection rejeita edge duplicada e entrada ocupada', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 10),
    node('m1', 'mistura'),
    node('m2', 'mistura'),
    node('r1', 'resultado'),
  ];
  assert.deepEqual(validateConnection(nodes, [edge('l1', 'm1')], edge('l1', 'm1')), {
    ok: false,
    reason: 'DUPLICATE_EDGE',
  });
  // Resultado aceita UMA entrada: a segunda mistura é recusada.
  assert.deepEqual(validateConnection(nodes, [edge('m1', 'r1')], edge('m2', 'r1')), {
    ok: false,
    reason: 'INPUT_OCCUPIED',
  });
});

test('validateConnection bloqueia o mesmo lote 2x na MESMA mistura (PG16)', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 10),
    lote('l2', 'mock-5658', 5), // outro node, MESMO lote real
    lote('l3', 'mock-5661', 5),
    node('m1', 'mistura'),
    node('m2', 'mistura'),
  ];
  const edges = [edge('l1', 'm1')];
  assert.deepEqual(validateConnection(nodes, edges, edge('l2', 'm1')), {
    ok: false,
    reason: 'DUPLICATE_LOT_IN_MIX',
  });
  // Lote diferente na mesma mistura: ok.
  assert.deepEqual(validateConnection(nodes, edges, edge('l3', 'm1')), { ok: true });
  // MESMO lote em mistura DIFERENTE do canvas: ok (N ligas ativas).
  assert.deepEqual(validateConnection(nodes, edges, edge('l2', 'm2')), { ok: true });
});

test('validateConnection bloqueia ciclo entre misturas', () => {
  const nodes: PgGraphNode[] = [
    node('m1', 'mistura'),
    node('m2', 'mistura'),
    node('m3', 'mistura'),
  ];
  const edges = [edge('m1', 'm2'), edge('m2', 'm3')];
  assert.deepEqual(validateConnection(nodes, edges, edge('m3', 'm1')), {
    ok: false,
    reason: 'CYCLE',
  });
  assert.deepEqual(validateConnection(nodes, edges, edge('m1', 'm3')), { ok: true });
});

test('resolveComposition monta a composição de uma mistura simples', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 30),
    lote('l2', 'mock-5661', 10),
    node('m1', 'mistura'),
    node('r1', 'resultado'),
  ];
  const edges = [edge('l1', 'm1'), edge('l2', 'm1'), edge('m1', 'r1')];
  const result = resolveComposition(nodes, edges, 'r1', mockLotIndex);
  assert.equal(result.ok, true);
  if (result.ok) {
    const bySample = new Map(result.components.map((c) => [c.sample.id, c.sacks]));
    assert.equal(bySample.get('mock-5658'), 30);
    assert.equal(bySample.get('mock-5661'), 10);
    assert.equal(result.components.length, 2);
  }
});

test('resolveComposition achata cascata (PG13) e agrega o mesmo lote entre ramos', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 10),
    lote('l2', 'mock-5661', 5),
    lote('l3', 'mock-5658', 5), // mesmo lote em OUTRA mistura (permitido)
    node('m1', 'mistura'),
    node('m2', 'mistura'),
    node('r1', 'resultado'),
  ];
  const edges = [
    edge('l1', 'm1'),
    edge('l2', 'm1'),
    edge('m1', 'm2'), // resultado INTEIRO da m1 entra na m2
    edge('l3', 'm2'),
    edge('m2', 'r1'),
  ];
  const result = resolveComposition(nodes, edges, 'r1', mockLotIndex);
  assert.equal(result.ok, true);
  if (result.ok) {
    const bySample = new Map(result.components.map((c) => [c.sample.id, c.sacks]));
    assert.equal(bySample.get('mock-5658'), 15); // 10 (via m1) + 5 (direto na m2)
    assert.equal(bySample.get('mock-5661'), 5);
  }
});

test('resolveComposition falha com mistura de 1 entrada (inclusive aninhada)', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 10),
    lote('l2', 'mock-5661', 5),
    node('m1', 'mistura'),
    node('m2', 'mistura'),
    node('r1', 'resultado'),
  ];
  const direct = resolveComposition(
    nodes,
    [edge('l1', 'm1'), edge('m1', 'r1')],
    'r1',
    mockLotIndex
  );
  assert.deepEqual(direct, { ok: false, reason: 'MIX_NEEDS_TWO_INPUTS', nodeId: 'm1' });

  const nested = resolveComposition(
    nodes,
    [edge('l1', 'm1'), edge('m1', 'm2'), edge('l2', 'm2'), edge('m2', 'r1')],
    'r1',
    mockLotIndex
  );
  assert.deepEqual(nested, { ok: false, reason: 'MIX_NEEDS_TWO_INPUTS', nodeId: 'm1' });
});

test('resolveComposition falha com lote não configurado ou desconhecido', () => {
  const nodes: PgGraphNode[] = [
    lote('l1', 'mock-5658', 10),
    lote('l2', null, null),
    lote('l3', 'inexistente', 5),
    node('m1', 'mistura'),
    node('r1', 'resultado'),
  ];
  const unconfigured = resolveComposition(
    nodes,
    [edge('l1', 'm1'), edge('l2', 'm1'), edge('m1', 'r1')],
    'r1',
    mockLotIndex
  );
  assert.deepEqual(unconfigured, { ok: false, reason: 'UNCONFIGURED_LOT', nodeId: 'l2' });

  const unknown = resolveComposition(
    nodes,
    [edge('l1', 'm1'), edge('l3', 'm1'), edge('m1', 'r1')],
    'r1',
    mockLotIndex
  );
  assert.deepEqual(unknown, { ok: false, reason: 'UNCONFIGURED_LOT', nodeId: 'l3' });
});

test('resolveComposition falha sem mistura conectada ao resultado', () => {
  const nodes: PgGraphNode[] = [node('r1', 'resultado')];
  assert.deepEqual(resolveComposition(nodes, [], 'r1', mockLotIndex), {
    ok: false,
    reason: 'NO_MIX',
    nodeId: 'r1',
  });
});
