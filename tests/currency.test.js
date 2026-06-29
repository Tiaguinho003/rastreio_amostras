import test from 'node:test';
import assert from 'node:assert/strict';

import {
  maskCurrencyInput,
  parseCurrencyInput,
  formatCurrencyValue,
  parseDecimalBr,
} from '../lib/currency.ts';

test('maskCurrencyInput acumula digitos como centavos', () => {
  assert.equal(maskCurrencyInput(''), '');
  assert.equal(maskCurrencyInput('1'), '0,01');
  assert.equal(maskCurrencyInput('12'), '0,12');
  assert.equal(maskCurrencyInput('125'), '1,25');
  assert.equal(maskCurrencyInput('125000'), '1.250,00');
  // ignora qualquer caractere nao-digito ja presente no input
  assert.equal(maskCurrencyInput('1.250,00'), '1.250,00');
  assert.equal(maskCurrencyInput('R$ 12,50'), '12,50');
});

test('maskCurrencyInput zera e limita o tamanho', () => {
  assert.equal(maskCurrencyInput('000'), '0,00');
  // cap em 13 digitos (99.999.999.999,99)
  assert.equal(maskCurrencyInput('9'.repeat(20)), '99.999.999.999,99');
});

test('parseCurrencyInput inverte a mascara', () => {
  assert.equal(parseCurrencyInput(''), null);
  assert.equal(parseCurrencyInput('0,00'), 0);
  assert.equal(parseCurrencyInput('1,25'), 1.25);
  assert.equal(parseCurrencyInput('12,50'), 12.5);
  assert.equal(parseCurrencyInput('1.250,00'), 1250);
});

test('maskCurrencyInput + parseCurrencyInput fazem round-trip', () => {
  for (const digits of ['1', '125', '125000', '9999999']) {
    assert.equal(parseCurrencyInput(maskCurrencyInput(digits)), Number(digits) / 100);
  }
});

test('formatCurrencyValue formata numero (reais) p/ pre-preencher', () => {
  assert.equal(formatCurrencyValue(null), '');
  assert.equal(formatCurrencyValue(undefined), '');
  assert.equal(formatCurrencyValue(''), '');
  assert.equal(formatCurrencyValue(1250), '1.250,00');
  assert.equal(formatCurrencyValue(5), '5,00');
  // Decimal vem como string da API
  assert.equal(formatCurrencyValue('5.5'), '5,50');
  assert.equal(formatCurrencyValue('abc'), '');
});

test('formatCurrencyValue + parseCurrencyInput round-trip', () => {
  assert.equal(parseCurrencyInput(formatCurrencyValue(1250)), 1250);
  assert.equal(parseCurrencyInput(formatCurrencyValue(5.5)), 5.5);
});

test('parseDecimalBr trata texto livre em formato BR', () => {
  // virgula = decimal, ponto = milhar
  assert.equal(parseDecimalBr('1.234,56'), 1234.56);
  assert.equal(parseDecimalBr('1250,00'), 1250);
  assert.equal(parseDecimalBr('12,5'), 12.5);
  // so digitos
  assert.equal(parseDecimalBr('60'), 60);
  assert.equal(parseDecimalBr('100'), 100);
  // ponto sozinho: 1-2 digitos = decimal; 3+ = milhar
  assert.equal(parseDecimalBr('1.5'), 1.5);
  assert.equal(parseDecimalBr('10.25'), 10.25);
  assert.equal(parseDecimalBr('1.250'), 1250);
  assert.equal(parseDecimalBr('1.234.567'), 1234567);
});

test('parseDecimalBr rejeita vazio/invalido', () => {
  assert.equal(parseDecimalBr(''), null);
  assert.equal(parseDecimalBr('   '), null);
  assert.equal(parseDecimalBr('abc'), null);
  assert.equal(parseDecimalBr('1,2,3'), null);
});
