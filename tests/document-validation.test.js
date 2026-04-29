import test from 'node:test';
import assert from 'node:assert/strict';

import { digitsOnly, isValidCnpjChecksum, isValidCpfChecksum } from '../lib/document-validation.ts';

test('isValidCpfChecksum aceita CPFs validos', () => {
  // CPFs reais conhecidos (apenas pra teste — nao sao de pessoas)
  assert.equal(isValidCpfChecksum('01617970832'), true);
  assert.equal(isValidCpfChecksum('12345678909'), true);
  assert.equal(isValidCpfChecksum('11144477735'), true);
  assert.equal(isValidCpfChecksum('39053344705'), true);
});

test('isValidCpfChecksum rejeita CPFs invalidos', () => {
  assert.equal(isValidCpfChecksum('11111111111'), false); // sequencia homogenea
  assert.equal(isValidCpfChecksum('12345678900'), false); // DV errado
  assert.equal(isValidCpfChecksum('016179708'), false); // length curto
  assert.equal(isValidCpfChecksum('016179708320'), false); // length longo
  assert.equal(isValidCpfChecksum(''), false);
});

test('isValidCnpjChecksum aceita CNPJs validos', () => {
  assert.equal(isValidCnpjChecksum('03936815000175'), true); // Atlantica
  assert.equal(isValidCnpjChecksum('45236791011550'), true); // COOPERCITRUS
  assert.equal(isValidCnpjChecksum('08963419000150'), true); // COFCO
});

test('isValidCnpjChecksum rejeita CNPJs invalidos', () => {
  assert.equal(isValidCnpjChecksum('00000000000000'), false); // sequencia
  assert.equal(isValidCnpjChecksum('11111111111111'), false); // sequencia
  assert.equal(isValidCnpjChecksum('11222333000144'), false); // DV errado
  assert.equal(isValidCnpjChecksum('0393681500017'), false); // length 13
  assert.equal(isValidCnpjChecksum(''), false);
});

test('digitsOnly remove formatacao', () => {
  assert.equal(digitsOnly('016.179.708-32'), '01617970832');
  assert.equal(digitsOnly('03.936.815/0001-75'), '03936815000175');
  assert.equal(digitsOnly(''), '');
  assert.equal(digitsOnly('abc 123 def'), '123');
});
