import assert from 'node:assert/strict';
import test from 'node:test';

import type { ClassificationDataPayload } from '../lib/classification-form.ts';
import { stubEngine } from '../lib/playground/engine.ts';
import type { BlendComponentInput } from '../lib/playground/types.ts';
import type { SampleSnapshot } from '../lib/types.ts';

type SampleSeed = {
  id: string;
  lot: string;
  ownerId?: string | null;
  ownerName?: string | null;
  harvest?: string | null;
  data?: Partial<ClassificationDataPayload> | null;
};

const EMPTY_DATA: ClassificationDataPayload = {
  dataClassificacao: null,
  padrao: null,
  aspecto: null,
  certif: null,
  catacao: null,
  observacoes: null,
  bebida: null,
  peneiras: null,
  fundos: null,
  defeitos: null,
};

function sample(seed: SampleSeed): SampleSnapshot {
  return {
    id: seed.id,
    internalLotNumber: seed.lot,
    classificationType: 'BICA',
    status: 'CLASSIFIED',
    commercialStatus: 'OPEN',
    version: 1,
    lastEventSequence: 1,
    ownerClientId: seed.ownerId ?? null,
    isBlend: false,
    declared: {
      owner: seed.ownerName ?? null,
      sacks: 100,
      harvest: seed.harvest ?? null,
      originLot: null,
      location: null,
    },
    soldSacks: 0,
    lostSacks: 0,
    availableSacks: 100,
    latestClassification: {
      version: 1,
      data: seed.data === null ? null : { ...EMPTY_DATA, ...(seed.data ?? {}) },
    },
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

function component(seed: SampleSeed, sacks: number): BlendComponentInput {
  return { sample: sample(seed), sacks };
}

test('stubEngine soma sacas e calcula composição ordenada por peso', () => {
  const estimate = stubEngine.estimateBlend([
    component({ id: 'a', lot: '100' }, 40),
    component({ id: 'b', lot: '200' }, 60),
  ]);
  assert.equal(estimate.totalSacks, 100);
  assert.equal(estimate.isStub, true);
  assert.deepEqual(
    estimate.composition.map((part) => [part.lotNumber, part.sacks, part.proportion]),
    [
      ['200', 60, 0.6],
      ['100', 40, 0.4],
    ]
  );
});

test('stubEngine deriva safra por união distinta ordenada (regra real)', () => {
  const estimate = stubEngine.estimateBlend([
    component({ id: 'a', lot: '100', harvest: '24/25' }, 10),
    component({ id: 'b', lot: '200', harvest: '24/25, 25/26' }, 10),
    component({ id: 'c', lot: '300', harvest: null }, 10),
  ]);
  assert.equal(estimate.harvest, '24/25, 25/26');

  const empty = stubEngine.estimateBlend([component({ id: 'a', lot: '100', harvest: null }, 10)]);
  assert.equal(empty.harvest, null);
});

test('stubEngine deriva dono por unanimidade de ownerClientId (regra real)', () => {
  const unanimous = stubEngine.estimateBlend([
    component({ id: 'a', lot: '100', ownerId: 'c1', ownerName: 'João Silva' }, 10),
    component({ id: 'b', lot: '200', ownerId: 'c1', ownerName: 'João Silva' }, 10),
  ]);
  assert.equal(unanimous.ownerLabel, 'João Silva');

  const divergent = stubEngine.estimateBlend([
    component({ id: 'a', lot: '100', ownerId: 'c1', ownerName: 'João Silva' }, 10),
    component({ id: 'b', lot: '200', ownerId: 'c2', ownerName: 'Maria Santos' }, 10),
  ]);
  assert.equal(divergent.ownerLabel, null);

  const missing = stubEngine.estimateBlend([
    component({ id: 'a', lot: '100', ownerId: null }, 10),
    component({ id: 'b', lot: '200', ownerId: 'c1', ownerName: 'João Silva' }, 10),
  ]);
  assert.equal(missing.ownerLabel, null);
});

test('stubEngine faz média ponderada de peneiras ignorando nulls (marca parcial)', () => {
  const full = stubEngine.estimateBlend([
    component({ id: 'a', lot: '100', data: { peneiras: { ...peneiras(), p16: 40 } } }, 30),
    component({ id: 'b', lot: '200', data: { peneiras: { ...peneiras(), p16: 20 } } }, 10),
  ]);
  assert.deepEqual(full.peneiras.p16, { kind: 'value', value: 35, partial: false });

  const partial = stubEngine.estimateBlend([
    component({ id: 'a', lot: '100', data: { peneiras: { ...peneiras(), p16: 40 } } }, 30),
    component({ id: 'b', lot: '200', data: { peneiras: { ...peneiras(), p16: 20 } } }, 10),
    component({ id: 'c', lot: '300', data: { peneiras: peneiras() } }, 60),
  ]);
  // Pesos renormalizados entre quem TEM o campo: (40*30 + 20*10) / 40 = 35.
  assert.deepEqual(partial.peneiras.p16, { kind: 'value', value: 35, partial: true });

  const empty = stubEngine.estimateBlend([
    component({ id: 'a', lot: '100', data: { peneiras: peneiras() } }, 10),
  ]);
  assert.deepEqual(empty.peneiras.p16, { kind: 'empty' });

  function peneiras() {
    return {
      p18: null,
      p17: null,
      p16: null,
      p15: null,
      p14: null,
      p13: null,
      p12: null,
      p11: null,
      p10: null,
      mk: null,
    };
  }
});

test('stubEngine exibe catação e defeitos como composição por componente', () => {
  const estimate = stubEngine.estimateBlend([
    component({ id: 'a', lot: '100', data: { catacao: '0,5' } }, 75),
    component({ id: 'b', lot: '200', data: { catacao: null } }, 25),
  ]);
  assert.deepEqual(estimate.catacao, {
    kind: 'composition',
    parts: [
      { lotNumber: '100', raw: '0,5', proportion: 0.75 },
      { lotNumber: '200', raw: null, proportion: 0.25 },
    ],
  });

  const allNull = stubEngine.estimateBlend([
    component({ id: 'a', lot: '100', data: {} }, 10),
    component({ id: 'b', lot: '200', data: null }, 10),
  ]);
  assert.deepEqual(allNull.catacao, { kind: 'empty' });
  assert.deepEqual(allNull.defeitos.imp, { kind: 'empty' });

  const defeitos = stubEngine.estimateBlend([
    component(
      {
        id: 'a',
        lot: '100',
        data: {
          defeitos: { imp: '8-9', pva: null, broca: null, gpi: null, ap: null, defeito: null },
        },
      },
      10
    ),
    component({ id: 'b', lot: '200', data: {} }, 10),
  ]);
  assert.equal(defeitos.defeitos.imp.kind, 'composition');
});
