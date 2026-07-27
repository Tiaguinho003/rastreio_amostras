import assert from 'node:assert/strict';
import test from 'node:test';

import type { ClassificationDataPayload } from '../lib/classification-form.ts';
import { DEFEITO_UNITS, playgroundEngine } from '../lib/playground/engine.ts';
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

/** As 10 chaves de peneira em branco — o payload real exige todas. */
function peneiras(overrides: Record<string, number> = {}) {
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
    ...overrides,
  };
}

/** As 6 chaves de defeito em branco. */
function defeitos(overrides: Record<string, string> = {}) {
  return { imp: null, pva: null, broca: null, gpi: null, ap: null, defeito: null, ...overrides };
}

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

test('soma sacas e calcula composição ordenada por peso', () => {
  const estimate = playgroundEngine.estimateBlend([
    component({ id: 'a', lot: '100' }, 40),
    component({ id: 'b', lot: '200' }, 60),
  ]);
  assert.equal(estimate.totalSacks, 100);
  assert.deepEqual(
    estimate.composition.map((part) => [part.lotNumber, part.sacks, part.proportion]),
    [
      ['200', 60, 0.6],
      ['100', 40, 0.4],
    ]
  );
});

test('deriva safra por união distinta ordenada (regra real)', () => {
  const estimate = playgroundEngine.estimateBlend([
    component({ id: 'a', lot: '100', harvest: '24/25' }, 10),
    component({ id: 'b', lot: '200', harvest: '24/25, 25/26' }, 10),
    component({ id: 'c', lot: '300', harvest: null }, 10),
  ]);
  assert.equal(estimate.harvest, '24/25, 25/26');

  const empty = playgroundEngine.estimateBlend([
    component({ id: 'a', lot: '100', harvest: null }, 10),
  ]);
  assert.equal(empty.harvest, null);
});

test('deriva dono por unanimidade de ownerClientId (regra real)', () => {
  const unanimous = playgroundEngine.estimateBlend([
    component({ id: 'a', lot: '100', ownerId: 'c1', ownerName: 'João Silva' }, 10),
    component({ id: 'b', lot: '200', ownerId: 'c1', ownerName: 'João Silva' }, 10),
  ]);
  assert.equal(unanimous.ownerLabel, 'João Silva');

  const divergent = playgroundEngine.estimateBlend([
    component({ id: 'a', lot: '100', ownerId: 'c1', ownerName: 'João Silva' }, 10),
    component({ id: 'b', lot: '200', ownerId: 'c2', ownerName: 'Maria Santos' }, 10),
  ]);
  assert.equal(divergent.ownerLabel, null);

  const missing = playgroundEngine.estimateBlend([
    component({ id: 'a', lot: '100', ownerId: null }, 10),
    component({ id: 'b', lot: '200', ownerId: 'c1', ownerName: 'João Silva' }, 10),
  ]);
  assert.equal(missing.ownerLabel, null);
});

test('PG41: branco vale ZERO com peso cheio — nada de renormalizar', () => {
  const estimate = playgroundEngine.estimateBlend([
    component({ id: 'a', lot: '100', data: { peneiras: peneiras({ p16: 40 }) } }, 250),
    component({ id: 'b', lot: '200', data: { peneiras: peneiras() } }, 250),
  ]);
  // O lote B contribui metade da massa sem nada em P16: (40*250 + 0*250)/500.
  // A regra antiga (PG17, revogada) renormalizava e devolvia 40 — afirmando
  // que a liga era tão rica quanto o lote puro.
  assert.deepEqual(estimate.peneiras.p16, { kind: 'value', value: 20, excluded: [] });
});

test('PG42: campo que NINGUÉM declarou vira vazio, não zero', () => {
  const estimate = playgroundEngine.estimateBlend([
    component({ id: 'a', lot: '100', data: { peneiras: peneiras({ p17: 50 }) } }, 10),
    component({ id: 'b', lot: '200', data: null }, 10),
  ]);
  assert.deepEqual(estimate.peneiras.p16, { kind: 'empty', excluded: [] });
  assert.deepEqual(estimate.catacao, { kind: 'empty', excluded: [] });
  assert.deepEqual(estimate.defeitos.gpi, { kind: 'empty', excluded: [] });
  // O que foi declarado continua saindo normalmente.
  assert.equal(estimate.peneiras.p17.kind, 'value');
});

test('PG40/PG11: catação e defeitos saem como NÚMERO (texto pt-BR e sufixo %)', () => {
  const estimate = playgroundEngine.estimateBlend([
    component(
      { id: 'a', lot: '100', data: { catacao: '0,5', defeitos: defeitos({ pva: '8' }) } },
      250
    ),
    component(
      { id: 'b', lot: '200', data: { catacao: '1,5', defeitos: defeitos({ pva: '12%' }) } },
      250
    ),
  ]);
  assert.deepEqual(estimate.catacao, { kind: 'value', value: 1, excluded: [] });
  assert.deepEqual(estimate.defeitos.pva, { kind: 'value', value: 10, excluded: [] });
});

test('PG45: texto não numérico tira SÓ aquele componente, e é nomeado', () => {
  const estimate = playgroundEngine.estimateBlend([
    component({ id: 'a', lot: '100', data: { defeitos: defeitos({ imp: '0,5' }) } }, 250),
    component({ id: 'b', lot: '200', data: { defeitos: defeitos({ imp: '8-9' }) } }, 250),
  ]);
  // O peso de B sai do denominador (renormaliza entre quem tem número) — é o
  // oposto do branco, que entra como 0. A regra antiga derrubava o campo
  // INTEIRO para composição por causa de um componente.
  assert.deepEqual(estimate.defeitos.imp, {
    kind: 'value',
    value: 0.5,
    excluded: [{ lotNumber: '200', raw: '8-9' }],
  });

  const allUnreadable = playgroundEngine.estimateBlend([
    component({ id: 'a', lot: '100', data: { catacao: '<1' } }, 10),
    component({ id: 'b', lot: '200', data: { catacao: '1/2' } }, 10),
  ]);
  assert.deepEqual(allUnreadable.catacao, {
    kind: 'empty',
    excluded: [
      { lotNumber: '100', raw: '<1' },
      { lotNumber: '200', raw: '1/2' },
    ],
  });
});

test('PG44: fundos combinam por RÓTULO; rótulo ausente é branco (zero)', () => {
  const estimate = playgroundEngine.estimateBlend([
    component(
      {
        id: 'a',
        lot: '100',
        data: {
          fundos: [
            { peneira: '13', percentual: 6 },
            { peneira: null, percentual: null },
          ],
        },
      },
      250
    ),
    component(
      {
        id: 'b',
        lot: '200',
        data: {
          fundos: [
            { peneira: '12', percentual: 4 },
            { peneira: '13', percentual: 5 },
          ],
        },
      },
      250
    ),
  ]);
  // Ordem das peneiras: do maior para o menor.
  assert.deepEqual(
    estimate.fundos.map((fundo) => fundo.peneira),
    ['13', '12']
  );
  // Fundo 13: os dois declaram → (6*250 + 5*250)/500.
  assert.deepEqual(estimate.fundos[0].value, { kind: 'value', value: 5.5, excluded: [] });
  // Fundo 12: só B declara; A não tem esse rótulo, o que é branco = 0.
  assert.deepEqual(estimate.fundos[1].value, { kind: 'value', value: 2, excluded: [] });

  const semFundos = playgroundEngine.estimateBlend([component({ id: 'a', lot: '100' }, 10)]);
  assert.deepEqual(semFundos.fundos, []);
});

test('PG43: defeito é contagem — mesma média, unidade sem %', () => {
  const estimate = playgroundEngine.estimateBlend([
    component({ id: 'a', lot: '100', data: { defeitos: defeitos({ defeito: '4' }) } }, 250),
    component({ id: 'b', lot: '200', data: { defeitos: defeitos({ defeito: '5' }) } }, 250),
  ]);
  assert.deepEqual(estimate.defeitos.defeito, { kind: 'value', value: 4.5, excluded: [] });
  assert.equal(DEFEITO_UNITS.defeito, '');
  assert.equal(DEFEITO_UNITS.pva, '%');
});

test('caso-âncora: os lotes reais 6228 e 6241, 250 + 250 sc', () => {
  // Fichas copiadas do banco em 2026-07-27 — são os dois lotes que o usuário
  // classificou para fechar as PG39–PG45. Se este teste quebrar, a mudança
  // contraria uma conta já validada com ele.
  const estimate = playgroundEngine.estimateBlend([
    component(
      {
        id: 'a',
        lot: '6228',
        ownerId: 'produtor-teste',
        ownerName: 'Produtor Teste',
        harvest: '26/27',
        data: {
          peneiras: peneiras({ p17: 76, mk: 9 }),
          fundos: [
            { peneira: '13', percentual: 6 },
            { peneira: null, percentual: null },
          ],
          catacao: '28',
          defeitos: defeitos({ imp: '0,5', pva: '8', broca: '2' }),
        },
      },
      250
    ),
    component(
      {
        id: 'b',
        lot: '6241',
        ownerId: 'produtor-teste',
        ownerName: 'Produtor Teste',
        harvest: '26/27',
        data: {
          peneiras: peneiras({ p17: 19, mk: 8 }),
          fundos: [
            { peneira: '13', percentual: 5 },
            { peneira: null, percentual: null },
          ],
          catacao: '26',
          defeitos: defeitos({ imp: '0,3', pva: '12', broca: '3' }),
        },
      },
      250
    ),
  ]);

  assert.equal(estimate.totalSacks, 500);
  assert.equal(estimate.harvest, '26/27');
  assert.equal(estimate.ownerLabel, 'Produtor Teste');
  assert.deepEqual(estimate.peneiras.p17, { kind: 'value', value: 47.5, excluded: [] });
  assert.deepEqual(estimate.peneiras.mk, { kind: 'value', value: 8.5, excluded: [] });
  assert.deepEqual(estimate.peneiras.p16, { kind: 'empty', excluded: [] });
  assert.deepEqual(estimate.fundos, [
    { peneira: '13', value: { kind: 'value', value: 5.5, excluded: [] } },
  ]);
  assert.deepEqual(estimate.catacao, { kind: 'value', value: 27, excluded: [] });
  assert.deepEqual(estimate.defeitos.imp, { kind: 'value', value: 0.4, excluded: [] });
  assert.deepEqual(estimate.defeitos.pva, { kind: 'value', value: 10, excluded: [] });
  assert.deepEqual(estimate.defeitos.broca, { kind: 'value', value: 2.5, excluded: [] });
  assert.deepEqual(estimate.defeitos.gpi, { kind: 'empty', excluded: [] });
  assert.deepEqual(estimate.defeitos.ap, { kind: 'empty', excluded: [] });
  assert.deepEqual(estimate.defeitos.defeito, { kind: 'empty', excluded: [] });
});
