import test from 'node:test';
import assert from 'node:assert/strict';

import {
  reconcileSelection,
  toggleSelection,
  type BlendSelection,
} from '../lib/samples/blend-selection.ts';
import type { SampleSnapshot } from '../lib/types.ts';

// Bug corrigido em 2026-07-07: a seleção do modo Liga guardava só ids e todo
// consumo filtrava a lista visível — selecionar, buscar e selecionar mais
// criava a liga APENAS com os visíveis na busca. Agora a seleção guarda o
// snapshot (Map) e reconcileSelection preserva quem está fora dos filtros.

function sample(id: string, overrides: Partial<SampleSnapshot> = {}): SampleSnapshot {
  return {
    id,
    internalLotNumber: `9${id}`,
    availableSacks: 10,
    ...overrides,
  } as SampleSnapshot;
}

function selectionOf(...samples: SampleSnapshot[]): BlendSelection {
  return new Map(samples.map((s) => [s.id, s]));
}

test('reconcile mantém selecionados fora da resposta (busca filtrou)', () => {
  const kept = sample('a');
  const visible = sample('b');
  const { selection, removed, changed } = reconcileSelection(selectionOf(kept, visible), [
    sample('b', { availableSacks: 7 }),
  ]);

  assert.equal(removed.length, 0);
  assert.equal(changed, true);
  assert.equal(selection.size, 2);
  assert.equal(selection.get('a'), kept); // fora da resposta: intocado
  assert.equal(selection.get('b')?.availableSacks, 7); // presente: atualizado
});

test('reconcile remove selecionado que virou inelegível e reporta lote+motivo', () => {
  const { selection, removed } = reconcileSelection(selectionOf(sample('a'), sample('b')), [
    sample('a', { eligibility: { eligible: false, reason: 'NO_BALANCE' } }),
    sample('b', { eligibility: { eligible: true, reason: null } }),
  ]);

  assert.equal(selection.size, 1);
  assert.equal(selection.has('b'), true);
  assert.deepEqual(removed, [{ id: 'a', lot: '9a', reason: 'NO_BALANCE' }]);
});

test('reconcile com seleção vazia devolve o mesmo Map sem mudança', () => {
  const empty: BlendSelection = new Map();
  const result = reconcileSelection(empty, [sample('a')]);

  assert.equal(result.selection, empty);
  assert.equal(result.changed, false);
  assert.equal(result.removed.length, 0);
});

test('reconcile preserva a ordem de seleção do usuário', () => {
  const result = reconcileSelection(selectionOf(sample('c'), sample('a'), sample('b')), [
    sample('a', { availableSacks: 3 }),
  ]);

  assert.deepEqual(Array.from(result.selection.keys()), ['c', 'a', 'b']);
});

test('toggle adiciona o snapshot inteiro e remove no segundo toque', () => {
  const item = sample('a');
  const afterAdd = toggleSelection(new Map(), item);
  assert.equal(afterAdd.get('a'), item);

  const afterRemove = toggleSelection(afterAdd, item);
  assert.equal(afterRemove.size, 0);
  // Imutável: o Map original não muda.
  assert.equal(afterAdd.size, 1);
});
