import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SAMPLES_INITIAL,
  samplesListReducer,
  type SamplesListAction,
  type SamplesListState,
} from '../lib/samples/samples-list-reducer.ts';
import type { SampleSnapshot } from '../lib/types.ts';

// LOT-T1 (revisão geral): regressão do reducer da lista de /samples — as
// correções B1–B5 da revisão faseada vivem neste estado. Roda no test:unit
// via --experimental-strip-types (o guard de token do load-more fica na
// página, fora do reducer).

function sample(id: string): SampleSnapshot {
  return { id } as SampleSnapshot;
}

function reduce(state: SamplesListState, ...actions: SamplesListAction[]) {
  return actions.reduce(samplesListReducer, state);
}

test('fetch-initial reseta TUDO pro estado inicial (reset limpo)', () => {
  const dirty: SamplesListState = {
    items: [sample('a')],
    total: 42,
    nextCursor: { lotInt: 10, id: 'a' },
    status: 'error',
    error: 'boom',
  };

  const state = reduce(dirty, { type: 'fetch-initial' });

  assert.deepEqual(state, SAMPLES_INITIAL);
  assert.equal(state.status, 'loading-initial');
});

test('success-initial substitui a lista e grava o total numérico', () => {
  const state = reduce(
    SAMPLES_INITIAL,
    { type: 'fetch-initial' },
    {
      type: 'success-initial',
      items: [sample('a'), sample('b')],
      total: 35,
      nextCursor: { lotInt: 5, id: 'b' },
    }
  );

  assert.equal(state.status, 'idle');
  assert.equal(state.total, 35);
  assert.deepEqual(
    state.items.map((item) => item.id),
    ['a', 'b']
  );
  assert.deepEqual(state.nextCursor, { lotInt: 5, id: 'b' });
  assert.equal(state.error, null);
});

test('success-more APPENDA preservando o total da carga inicial', () => {
  const state = reduce(
    SAMPLES_INITIAL,
    { type: 'success-initial', items: [sample('a')], total: 3, nextCursor: { lotInt: 9, id: 'a' } },
    { type: 'fetch-more' },
    { type: 'success-more', items: [sample('b'), sample('c')], nextCursor: null }
  );

  assert.equal(state.status, 'idle');
  assert.deepEqual(
    state.items.map((item) => item.id),
    ['a', 'b', 'c']
  );
  // D1 da revisão faseada: o load-more não recomputa COUNT — o total fica.
  assert.equal(state.total, 3);
  // nextCursor null = fim da lista (sentinela some).
  assert.equal(state.nextCursor, null);
});

test('fetch-more marca loading-more sem perder itens e limpa erro anterior', () => {
  const loaded = reduce(SAMPLES_INITIAL, {
    type: 'success-initial',
    items: [sample('a')],
    total: 1,
    nextCursor: { lotInt: 1, id: 'a' },
  });

  const state = reduce(loaded, { type: 'error', message: 'x' }, { type: 'fetch-more' });

  assert.equal(state.status, 'loading-more');
  assert.equal(state.error, null);
  assert.deepEqual(
    state.items.map((item) => item.id),
    ['a']
  );
});

test('error preserva itens/total/cursor (a UI decide como mostrar)', () => {
  const loaded = reduce(SAMPLES_INITIAL, {
    type: 'success-initial',
    items: [sample('a')],
    total: 1,
    nextCursor: { lotInt: 1, id: 'a' },
  });

  const state = reduce(loaded, { type: 'error', message: 'Não foi possível carregar mais lotes.' });

  assert.equal(state.status, 'error');
  assert.equal(state.error, 'Não foi possível carregar mais lotes.');
  assert.deepEqual(
    state.items.map((item) => item.id),
    ['a']
  );
  assert.deepEqual(state.nextCursor, { lotInt: 1, id: 'a' });
});

test('ação desconhecida devolve o mesmo estado (referência intacta)', () => {
  const state = reduce(SAMPLES_INITIAL, {
    type: 'success-initial',
    items: [],
    total: 0,
    nextCursor: null,
  });
  const next = samplesListReducer(state, { type: 'nope' } as unknown as SamplesListAction);
  assert.equal(next, state);
});
