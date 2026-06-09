import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveBlendHarvest, deriveBlendOwner } from '../src/samples/blend-harvest.js';

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

// --- deriveBlendOwner ---

test('deriveBlendOwner: todas origens do mesmo dono -> herda', () => {
  assert.deepEqual(
    deriveBlendOwner([
      { ownerClientId: 'c1', declaredOwner: 'Joao' },
      { ownerClientId: 'c1', declaredOwner: 'Joao' },
    ]),
    { ownerClientId: 'c1', declaredOwner: 'Joao' }
  );
});

test('deriveBlendOwner: donos divergentes -> sem dono', () => {
  assert.deepEqual(
    deriveBlendOwner([
      { ownerClientId: 'c1', declaredOwner: 'Joao' },
      { ownerClientId: 'c2', declaredOwner: 'Maria' },
    ]),
    { ownerClientId: null, declaredOwner: null }
  );
});

test('deriveBlendOwner: alguma origem sem dono -> sem dono', () => {
  assert.deepEqual(
    deriveBlendOwner([
      { ownerClientId: 'c1', declaredOwner: 'Joao' },
      { ownerClientId: null, declaredOwner: null },
    ]),
    { ownerClientId: null, declaredOwner: null }
  );
});

test('deriveBlendOwner: nome vem do snapshot da 1a origem', () => {
  assert.deepEqual(
    deriveBlendOwner([
      { ownerClientId: 'c1', declaredOwner: 'Joao Silva' },
      { ownerClientId: 'c1', declaredOwner: 'Joao' },
    ]),
    { ownerClientId: 'c1', declaredOwner: 'Joao Silva' }
  );
});

test('deriveBlendOwner: array vazio -> sem dono', () => {
  assert.deepEqual(deriveBlendOwner([]), { ownerClientId: null, declaredOwner: null });
});
