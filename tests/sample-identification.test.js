import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compareIdentification,
  normalizeHarvest,
  normalizeLot,
  normalizeSacks,
} from '../lib/sample-identification.ts';

// --- normalizeLot ---

test('normalizeLot: retorna null para null', () => {
  assert.equal(normalizeLot(null), null);
});

test('normalizeLot: retorna null para undefined', () => {
  assert.equal(normalizeLot(undefined), null);
});

test('normalizeLot: retorna null para string vazia', () => {
  assert.equal(normalizeLot(''), null);
});

test('normalizeLot: retorna null para string de espacos', () => {
  assert.equal(normalizeLot('   '), null);
});

test('normalizeLot: converte lowercase para uppercase', () => {
  assert.equal(normalizeLot('abc-123'), 'ABC-123');
});

test('normalizeLot: faz trim das bordas', () => {
  assert.equal(normalizeLot('  LOT-42  '), 'LOT-42');
});

test('normalizeLot: colapsa espacos internos duplicados', () => {
  assert.equal(normalizeLot('lot    42   alpha'), 'LOT 42 ALPHA');
});

test('normalizeLot: passa lote valido intacto', () => {
  assert.equal(normalizeLot('L-12345'), 'L-12345');
});

// --- normalizeSacks ---

test('normalizeSacks: string "12" retorna 12', () => {
  assert.equal(normalizeSacks('12'), 12);
});

test('normalizeSacks: numero 12 retorna 12', () => {
  assert.equal(normalizeSacks(12), 12);
});

test('normalizeSacks: "12 sacas" retorna 12', () => {
  assert.equal(normalizeSacks('12 sacas'), 12);
});

test('normalizeSacks: string vazia retorna null', () => {
  assert.equal(normalizeSacks(''), null);
});

test('normalizeSacks: null retorna null', () => {
  assert.equal(normalizeSacks(null), null);
});

test('normalizeSacks: undefined retorna null', () => {
  assert.equal(normalizeSacks(undefined), null);
});

test('normalizeSacks: "abc" (sem digitos) retorna null', () => {
  assert.equal(normalizeSacks('abc'), null);
});

test('normalizeSacks: numero decimal arredonda', () => {
  assert.equal(normalizeSacks(12.7), 13);
});

test('normalizeSacks: string com virgula decimal ("12,4") arredonda', () => {
  assert.equal(normalizeSacks('12,4'), 12);
});

test('normalizeSacks: string com ponto decimal ("12.7") arredonda', () => {
  assert.equal(normalizeSacks('12.7'), 13);
});

test('normalizeSacks: numero nao finito (NaN) retorna null', () => {
  assert.equal(normalizeSacks(Number.NaN), null);
});

test('normalizeSacks: string "  24  " retorna 24', () => {
  assert.equal(normalizeSacks('  24  '), 24);
});

// --- normalizeHarvest ---

test('normalizeHarvest: "23/24" mantem canonico', () => {
  assert.equal(normalizeHarvest('23/24'), '23/24');
});

test('normalizeHarvest: "23-24" vira "23/24"', () => {
  assert.equal(normalizeHarvest('23-24'), '23/24');
});

test('normalizeHarvest: "2023/2024" vira "23/24"', () => {
  assert.equal(normalizeHarvest('2023/2024'), '23/24');
});

test('normalizeHarvest: "23_24" vira "23/24"', () => {
  assert.equal(normalizeHarvest('23_24'), '23/24');
});

test('normalizeHarvest: "  23 / 24  " vira "23/24"', () => {
  assert.equal(normalizeHarvest('  23 / 24  '), '23/24');
});

test('normalizeHarvest: "2023" (nao matcha) devolve string limpa', () => {
  assert.equal(normalizeHarvest('2023'), '2023');
});

test('normalizeHarvest: string vazia retorna null', () => {
  assert.equal(normalizeHarvest(''), null);
});

test('normalizeHarvest: null retorna null', () => {
  assert.equal(normalizeHarvest(null), null);
});

test('normalizeHarvest: undefined retorna null', () => {
  assert.equal(normalizeHarvest(undefined), null);
});

test('normalizeHarvest: espacos em volta viram null', () => {
  assert.equal(normalizeHarvest('   '), null);
});

test('normalizeHarvest: "23.24" vira "23/24" (ponto como separador)', () => {
  assert.equal(normalizeHarvest('23.24'), '23/24');
});

test('normalizeHarvest: "23\\\\24" vira "23/24" (backslash como separador)', () => {
  assert.equal(normalizeHarvest('23\\24'), '23/24');
});

test('normalizeHarvest: "2023/24" vira "23/24" (mistura de 4 e 2 digitos)', () => {
  assert.equal(normalizeHarvest('2023/24'), '23/24');
});

test('normalizeHarvest: "23/2024" vira "23/24"', () => {
  assert.equal(normalizeHarvest('23/2024'), '23/24');
});

// --- compareIdentification ---

test('compareIdentification: tudo bate -> lista vazia', () => {
  const result = compareIdentification(
    { lote: 'L-42', sacas: '30', safra: '23/24' },
    { internalLotNumber: 'L-42', declaredSacks: 30, declaredHarvest: '23/24' }
  );
  assert.deepEqual(result, []);
});

test('compareIdentification: extraido tudo null -> lista vazia (OCR nao falha bloqueia)', () => {
  const result = compareIdentification(
    { lote: null, sacas: null, safra: null },
    { internalLotNumber: 'L-42', declaredSacks: 30, declaredHarvest: '23/24' }
  );
  assert.deepEqual(result, []);
});

test('compareIdentification: extraido tudo vazio -> lista vazia', () => {
  const result = compareIdentification(
    { lote: '', sacas: '', safra: '' },
    { internalLotNumber: 'L-42', declaredSacks: 30, declaredHarvest: '23/24' }
  );
  assert.deepEqual(result, []);
});

test('compareIdentification: sacas diferentes -> uma divergencia em sacks', () => {
  const result = compareIdentification(
    { lote: 'L-42', sacas: '29', safra: '23/24' },
    { internalLotNumber: 'L-42', declaredSacks: 30, declaredHarvest: '23/24' }
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].field, 'sacks');
  assert.equal(result[0].extracted, '29');
  assert.equal(result[0].stored, 30);
});

test('compareIdentification: safra em formatos diferentes mas mesma semantica -> nenhuma divergencia', () => {
  const result = compareIdentification(
    { lote: 'L-42', sacas: '30', safra: '23/24' },
    { internalLotNumber: 'L-42', declaredSacks: 30, declaredHarvest: '2023/2024' }
  );
  assert.deepEqual(result, []);
});

test('compareIdentification: safra realmente diferente -> divergencia em harvest', () => {
  const result = compareIdentification(
    { lote: 'L-42', sacas: '30', safra: '23/24' },
    { internalLotNumber: 'L-42', declaredSacks: 30, declaredHarvest: '22/23' }
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].field, 'harvest');
  assert.equal(result[0].extracted, '23/24');
  assert.equal(result[0].stored, '22/23');
});

test('compareIdentification: combinacao lote bate, sacas e safra divergem -> 2 divergencias', () => {
  const result = compareIdentification(
    { lote: 'L-42', sacas: '29', safra: '22/23' },
    { internalLotNumber: 'l-42', declaredSacks: 30, declaredHarvest: '23/24' }
  );
  assert.equal(result.length, 2);
  const fields = result.map((d) => d.field).sort();
  assert.deepEqual(fields, ['harvest', 'sacks']);
});

test('compareIdentification: lote com case/espacos diferentes mas mesmo valor -> nenhuma divergencia', () => {
  const result = compareIdentification(
    { lote: '  lot  42  ', sacas: null, safra: null },
    { internalLotNumber: 'LOT 42', declaredSacks: 30, declaredHarvest: '23/24' }
  );
  assert.deepEqual(result, []);
});

test('compareIdentification: extraido tem valor e cadastrado e null -> divergencia', () => {
  const result = compareIdentification(
    { lote: 'L-42', sacas: null, safra: null },
    { internalLotNumber: null, declaredSacks: null, declaredHarvest: null }
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].field, 'lot');
  assert.equal(result[0].extracted, 'L-42');
  assert.equal(result[0].stored, null);
});

test('compareIdentification: apenas sacas extraido, bate com cadastrado -> nenhuma divergencia', () => {
  const result = compareIdentification(
    { lote: null, sacas: '30 sacas', safra: null },
    { internalLotNumber: 'L-42', declaredSacks: 30, declaredHarvest: '23/24' }
  );
  assert.deepEqual(result, []);
});
