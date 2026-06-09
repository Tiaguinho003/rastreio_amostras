import test from 'node:test';
import assert from 'node:assert/strict';

import { planBlendBackfill } from '../src/samples/blend-backfill.js';

// Helper: monta { ligas, componentsByBlendId, currentStateBySampleId } a partir
// de specs enxutos (preenche os defaults que o nucleo espera).
function makeInput({ ligas, components, state }) {
  const ligaList = ligas.map((l) => ({
    sampleId: l.sampleId,
    version: l.version ?? 1,
    status: l.status ?? 'CLASSIFIED',
    commercialStatus: l.commercialStatus ?? 'OPEN',
    internalLotNumber: l.internalLotNumber ?? l.sampleId,
    declaredHarvest: l.declaredHarvest ?? null,
    ownerClientId: l.ownerClientId ?? null,
    declaredOwner: l.declaredOwner ?? null,
  }));
  const componentsByBlendId = new Map(
    Object.entries(components).map(([blendId, origins]) => [
      blendId,
      origins.map((o) => ({
        originId: o.originId,
        declaredHarvest: o.declaredHarvest ?? null,
        ownerClientId: o.ownerClientId ?? null,
        declaredOwner: o.declaredOwner ?? null,
      })),
    ])
  );
  const currentStateBySampleId = new Map(
    Object.entries(state).map(([id, s]) => [
      id,
      {
        harvest: s.harvest ?? null,
        ownerClientId: s.ownerClientId ?? null,
        declaredOwner: s.declaredOwner ?? null,
      },
    ])
  );
  return { ligas: ligaList, componentsByBlendId, currentStateBySampleId };
}

// 1
test('owner unanime: liga sem dono herda o dono unanime das origens', () => {
  const { diffs } = planBlendBackfill(
    makeInput({
      ligas: [
        { sampleId: 'L', ownerClientId: null, declaredOwner: null, declaredHarvest: '24/25' },
      ],
      components: {
        L: [
          {
            originId: 'a1',
            ownerClientId: 'c1',
            declaredOwner: 'Cafe Sul',
            declaredHarvest: '24/25',
          },
          {
            originId: 'a2',
            ownerClientId: 'c1',
            declaredOwner: 'Cafe Sul',
            declaredHarvest: '24/25',
          },
        ],
      },
      state: {
        L: { harvest: '24/25', ownerClientId: null, declaredOwner: null },
        a1: { harvest: '24/25', ownerClientId: 'c1', declaredOwner: 'Cafe Sul' },
        a2: { harvest: '24/25', ownerClientId: 'c1', declaredOwner: 'Cafe Sul' },
      },
    })
  );
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].sampleId, 'L');
  assert.equal(diffs[0].after.ownerClientId, 'c1');
  assert.equal(diffs[0].after.declared.owner, 'Cafe Sul');
  assert.equal('harvest' in diffs[0].after.declared, false);
});

// 2
test('owner divergente: liga perde o dono (null)', () => {
  const { diffs } = planBlendBackfill(
    makeInput({
      ligas: [
        { sampleId: 'L', ownerClientId: 'c1', declaredOwner: 'Cafe Sul', declaredHarvest: '24/25' },
      ],
      components: {
        L: [
          { originId: 'a1', ownerClientId: 'c1', declaredHarvest: '24/25' },
          { originId: 'a2', ownerClientId: 'c2', declaredHarvest: '24/25' },
        ],
      },
      state: {
        L: { harvest: '24/25', ownerClientId: 'c1', declaredOwner: 'Cafe Sul' },
        a1: { ownerClientId: 'c1', harvest: '24/25' },
        a2: { ownerClientId: 'c2', harvest: '24/25' },
      },
    })
  );
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].before.ownerClientId, 'c1');
  assert.equal(diffs[0].after.ownerClientId, null);
  assert.equal(diffs[0].after.declared.owner, null);
});

// 3
test('harvest: dedup de safras concatenadas das origens (sem triplicar)', () => {
  const { diffs } = planBlendBackfill(
    makeInput({
      ligas: [{ sampleId: 'L', declaredHarvest: '24/25' }],
      components: {
        L: [
          { originId: 'a1', declaredHarvest: '24/25' },
          { originId: 'a2', declaredHarvest: '24/25, 25/26' },
        ],
      },
      state: {
        L: { harvest: '24/25' },
        a1: { harvest: '24/25' },
        a2: { harvest: '24/25, 25/26' },
      },
    })
  );
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].after.declared.harvest, '24/25, 25/26');
});

// 4
test('liga-de-liga: filho recalculado antes do pai; pai usa o valor novo do filho', () => {
  const { diffs } = planBlendBackfill(
    makeInput({
      ligas: [
        { sampleId: 'C', ownerClientId: null, declaredHarvest: '24/25' },
        { sampleId: 'P', ownerClientId: null, declaredHarvest: '24/25' },
      ],
      components: {
        C: [
          {
            originId: 'a1',
            ownerClientId: 'c1',
            declaredOwner: 'Cafe Sul',
            declaredHarvest: '24/25',
          },
          {
            originId: 'a2',
            ownerClientId: 'c1',
            declaredOwner: 'Cafe Sul',
            declaredHarvest: '24/25',
          },
        ],
        // O componente carrega o valor STALE de C (null) — o nucleo deve preferir
        // o valor RECALCULADO de C via state map.
        P: [
          { originId: 'C', ownerClientId: null, declaredHarvest: '24/25' },
          {
            originId: 'x1',
            ownerClientId: 'c1',
            declaredOwner: 'Cafe Sul',
            declaredHarvest: '24/25',
          },
        ],
      },
      state: {
        C: { harvest: '24/25', ownerClientId: null },
        P: { harvest: '24/25', ownerClientId: null },
        a1: { harvest: '24/25', ownerClientId: 'c1', declaredOwner: 'Cafe Sul' },
        a2: { harvest: '24/25', ownerClientId: 'c1', declaredOwner: 'Cafe Sul' },
        x1: { harvest: '24/25', ownerClientId: 'c1', declaredOwner: 'Cafe Sul' },
      },
    })
  );
  assert.equal(diffs.length, 2);
  assert.equal(diffs[0].sampleId, 'C');
  assert.equal(diffs[1].sampleId, 'P');
  assert.equal(diffs[0].after.ownerClientId, 'c1');
  assert.equal(diffs[1].after.ownerClientId, 'c1');
});

// 5
test('no-op: liga ja correta nao gera diff', () => {
  const { diffs } = planBlendBackfill(
    makeInput({
      ligas: [
        { sampleId: 'L', ownerClientId: 'c1', declaredOwner: 'Cafe Sul', declaredHarvest: '24/25' },
      ],
      components: {
        L: [
          {
            originId: 'a1',
            ownerClientId: 'c1',
            declaredOwner: 'Cafe Sul',
            declaredHarvest: '24/25',
          },
          {
            originId: 'a2',
            ownerClientId: 'c1',
            declaredOwner: 'Cafe Sul',
            declaredHarvest: '24/25',
          },
        ],
      },
      state: {
        L: { harvest: '24/25', ownerClientId: 'c1', declaredOwner: 'Cafe Sul' },
        a1: { harvest: '24/25', ownerClientId: 'c1' },
        a2: { harvest: '24/25', ownerClientId: 'c1' },
      },
    })
  );
  assert.equal(diffs.length, 0);
});

// 6
test('safra + owner mudam juntos: um diff com os dois campos', () => {
  const { diffs } = planBlendBackfill(
    makeInput({
      ligas: [{ sampleId: 'L', ownerClientId: null, declaredHarvest: '24/25' }],
      components: {
        L: [
          {
            originId: 'a1',
            ownerClientId: 'c1',
            declaredOwner: 'Cafe Sul',
            declaredHarvest: '24/25',
          },
          {
            originId: 'a2',
            ownerClientId: 'c1',
            declaredOwner: 'Cafe Sul',
            declaredHarvest: '25/26',
          },
        ],
      },
      state: {
        L: { harvest: '24/25', ownerClientId: null },
        a1: { harvest: '24/25', ownerClientId: 'c1', declaredOwner: 'Cafe Sul' },
        a2: { harvest: '25/26', ownerClientId: 'c1', declaredOwner: 'Cafe Sul' },
      },
    })
  );
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].after.declared.harvest, '24/25, 25/26');
  assert.equal(diffs[0].after.ownerClientId, 'c1');
  assert.equal(diffs[0].after.declared.owner, 'Cafe Sul');
});

// 7
test('so os campos que mudam entram no after (harvest-only, sem ownerClientId)', () => {
  const { diffs } = planBlendBackfill(
    makeInput({
      ligas: [
        { sampleId: 'L', ownerClientId: 'c1', declaredOwner: 'Cafe Sul', declaredHarvest: '24/25' },
      ],
      components: {
        L: [
          {
            originId: 'a1',
            ownerClientId: 'c1',
            declaredOwner: 'Cafe Sul',
            declaredHarvest: '25/26',
          },
          {
            originId: 'a2',
            ownerClientId: 'c1',
            declaredOwner: 'Cafe Sul',
            declaredHarvest: '25/26',
          },
        ],
      },
      state: {
        L: { harvest: '24/25', ownerClientId: 'c1', declaredOwner: 'Cafe Sul' },
        a1: { harvest: '25/26', ownerClientId: 'c1' },
        a2: { harvest: '25/26', ownerClientId: 'c1' },
      },
    })
  );
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].after.declared.harvest, '25/26');
  assert.equal('ownerClientId' in diffs[0].after, false);
  assert.equal('owner' in diffs[0].after.declared, false);
});

// 8
test('ciclo entre ligas: ambas vao para skipped (CYCLE), sem loop infinito', () => {
  const { diffs, skipped } = planBlendBackfill(
    makeInput({
      ligas: [
        { sampleId: 'A', declaredHarvest: '24/25' },
        { sampleId: 'B', declaredHarvest: '24/25' },
      ],
      components: {
        A: [{ originId: 'B', declaredHarvest: '24/25' }],
        B: [{ originId: 'A', declaredHarvest: '24/25' }],
      },
      state: { A: { harvest: '24/25' }, B: { harvest: '24/25' } },
    })
  );
  assert.equal(diffs.length, 0);
  assert.equal(skipped.length, 2);
  assert.ok(skipped.every((s) => s.reason === 'CYCLE'));
});

// 9
test('profundidade acima de MAX_BLEND_DEPTH vai para skipped (DEPTH_EXCEEDED)', () => {
  const ligas = [];
  const components = {};
  const state = { base: { harvest: '24/25' } };
  let prev = 'base';
  for (let i = 0; i <= 10; i++) {
    const id = `L${i}`;
    ligas.push({ sampleId: id, declaredHarvest: '24/25' });
    components[id] = [{ originId: prev, declaredHarvest: '24/25' }];
    state[id] = { harvest: '24/25' };
    prev = id;
  }
  const { skipped } = planBlendBackfill(makeInput({ ligas, components, state }));
  assert.ok(skipped.some((s) => s.sampleId === 'L10' && s.reason === 'DEPTH_EXCEEDED'));
  assert.equal(
    skipped.some((s) => s.sampleId === 'L9' && s.reason === 'DEPTH_EXCEEDED'),
    false
  );
});

// 10
test('owner comparado por id: nome diferente mas id igual nao gera diff', () => {
  const { diffs } = planBlendBackfill(
    makeInput({
      ligas: [
        {
          sampleId: 'L',
          ownerClientId: 'c1',
          declaredOwner: 'Nome Antigo',
          declaredHarvest: '24/25',
        },
      ],
      components: {
        L: [
          {
            originId: 'a1',
            ownerClientId: 'c1',
            declaredOwner: 'Nome Novo',
            declaredHarvest: '24/25',
          },
          {
            originId: 'a2',
            ownerClientId: 'c1',
            declaredOwner: 'Nome Novo',
            declaredHarvest: '24/25',
          },
        ],
      },
      state: {
        L: { harvest: '24/25', ownerClientId: 'c1', declaredOwner: 'Nome Antigo' },
        a1: { harvest: '24/25', ownerClientId: 'c1', declaredOwner: 'Nome Novo' },
        a2: { harvest: '24/25', ownerClientId: 'c1', declaredOwner: 'Nome Novo' },
      },
    })
  );
  assert.equal(diffs.length, 0);
});
