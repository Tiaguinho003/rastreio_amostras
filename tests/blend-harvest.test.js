import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveBlendHarvest } from '../src/samples/blend-harvest.js';

// --- casos basicos ---

test('deriveBlendHarvest: origens com a mesma safra dedupam para uma', () => {
  assert.equal(deriveBlendHarvest(['24/25', '24/25']), '24/25');
});

test('deriveBlendHarvest: origens com safras distintas concatenam ordenado', () => {
  assert.equal(deriveBlendHarvest(['24/25', '25/26']), '24/25, 25/26');
});

test('deriveBlendHarvest: ordena lexicograficamente independente da entrada', () => {
  assert.equal(deriveBlendHarvest(['25/26', '24/25']), '24/25, 25/26');
});

// --- correcao do bug de liga-em-liga (origem ja concatenada) ---

test('deriveBlendHarvest: faz split de origem-liga concatenada e dedupa (sem duplicata)', () => {
  // Antes do split, ['24/25, 25/26', '24/25'] gerava '24/25, 24/25, 25/26'.
  assert.equal(deriveBlendHarvest(['24/25, 25/26', '24/25']), '24/25, 25/26');
});

test('deriveBlendHarvest: combina duas origens-liga concatenadas sem duplicar', () => {
  assert.equal(deriveBlendHarvest(['24/25, 25/26', '23/24, 24/25']), '23/24, 24/25, 25/26');
});

test('deriveBlendHarvest: tolera virgula sem espaco', () => {
  assert.equal(deriveBlendHarvest(['24/25,25/26']), '24/25, 25/26');
});

// --- nulos / vazios ---

test('deriveBlendHarvest: ignora null e undefined', () => {
  assert.equal(deriveBlendHarvest([null, '24/25', undefined]), '24/25');
});

test('deriveBlendHarvest: array vazio retorna null', () => {
  assert.equal(deriveBlendHarvest([]), null);
});

test('deriveBlendHarvest: so nulos retorna null', () => {
  assert.equal(deriveBlendHarvest([null, null]), null);
});

test('deriveBlendHarvest: strings vazias/espacos sao ignoradas', () => {
  assert.equal(deriveBlendHarvest(['', '  ', '24/25']), '24/25');
});
