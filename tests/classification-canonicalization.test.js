import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalizeAspecto,
  canonicalizeBebida,
  canonicalizeCertif,
  canonicalizeHarvest,
  canonicalizePadrao,
} from '../src/samples/classification-canonicalization.js';

// F3.13: testes dos canonicalizers de campos texto livre da classificacao.

test('canonicalizePadrao normaliza o par L/P para "L<n>-P<n>" (hifen unico)', () => {
  // Toda variacao de separador interno colapsa pro mesmo canonico.
  assert.equal(canonicalizePadrao('L3 P3'), 'L3-P3');
  assert.equal(canonicalizePadrao('L-3 P-3'), 'L3-P3');
  assert.equal(canonicalizePadrao('L3-P3'), 'L3-P3');
  assert.equal(canonicalizePadrao('L.3 P.3'), 'L3-P3');
  assert.equal(canonicalizePadrao('L 3 P 3'), 'L3-P3');
  assert.equal(canonicalizePadrao('L3P3'), 'L3-P3');
  assert.equal(canonicalizePadrao('l3 p3'), 'L3-P3');
  assert.equal(canonicalizePadrao('  L4   P3  '), 'L4-P3');
});

test('canonicalizePadrao cola a letra final no segundo termo (nunca separa)', () => {
  assert.equal(canonicalizePadrao('L3 P3B'), 'L3-P3B');
  assert.equal(canonicalizePadrao('L3 P3 B'), 'L3-P3B'); // ja separado -> recola
  assert.equal(canonicalizePadrao('L10 P5A'), 'L10-P5A');
});

test('canonicalizePadrao nao forca formato em termo unico / texto livre', () => {
  assert.equal(canonicalizePadrao('L3'), 'L3');
  assert.equal(canonicalizePadrao('especial'), 'ESPECIAL');
  assert.equal(canonicalizePadrao('P3B'), 'P3B'); // sem L -> fallback
});

test('canonicalizePadrao retorna null para vazios', () => {
  assert.equal(canonicalizePadrao(null), null);
  assert.equal(canonicalizePadrao(''), null);
  assert.equal(canonicalizePadrao('   '), null);
});

test('canonicalizeAspecto remove pontos e espacos, uppercase', () => {
  assert.equal(canonicalizeAspecto('GC'), 'GC');
  assert.equal(canonicalizeAspecto('G.C.'), 'GC');
  assert.equal(canonicalizeAspecto('G C'), 'GC');
  assert.equal(canonicalizeAspecto('gc'), 'GC');
  assert.equal(canonicalizeAspecto('  g . c .  '), 'GC');
  assert.equal(canonicalizeAspecto(null), null);
  assert.equal(canonicalizeAspecto(''), null);
});

test('canonicalizeBebida uppercase + colapsa espacos', () => {
  assert.equal(canonicalizeBebida('dura'), 'DURA');
  assert.equal(canonicalizeBebida('Mole'), 'MOLE');
  assert.equal(canonicalizeBebida('  riada  '), 'RIADA');
  assert.equal(canonicalizeBebida('mole  riada'), 'MOLE RIADA');
  assert.equal(canonicalizeBebida(null), null);
  assert.equal(canonicalizeBebida(''), null);
});

test('canonicalizeCertif uppercase, sem pontos, espacos unicos', () => {
  assert.equal(canonicalizeCertif('utz'), 'UTZ');
  assert.equal(canonicalizeCertif('U.T.Z.'), 'UTZ');
  assert.equal(canonicalizeCertif('Rainforest Alliance'), 'RAINFOREST ALLIANCE');
  assert.equal(canonicalizeCertif('  4c  '), '4C');
  assert.equal(canonicalizeCertif(null), null);
});

test('canonicalizeHarvest normaliza formatos de safra', () => {
  assert.equal(canonicalizeHarvest('26/27'), '26/27');
  assert.equal(canonicalizeHarvest('26-27'), '26/27');
  assert.equal(canonicalizeHarvest('2026/2027'), '26/27');
  assert.equal(canonicalizeHarvest('2026-2027'), '26/27');
  assert.equal(canonicalizeHarvest('26.27'), '26/27');
  assert.equal(canonicalizeHarvest(' 26 / 27 '), '26/27');
  assert.equal(canonicalizeHarvest('MISTA'), 'MISTA'); // nao-numerico — preserva limpo
  // Fase 3: nao-safra preservado em vez de manglado (antes "5.5" -> "5/5").
  assert.equal(canonicalizeHarvest('5.5'), '5.5');
  assert.equal(canonicalizeHarvest('8-9'), '8-9');
  assert.equal(canonicalizeHarvest(null), null);
  assert.equal(canonicalizeHarvest(''), null);
});
