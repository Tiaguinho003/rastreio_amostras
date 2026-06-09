import test from 'node:test';
import assert from 'node:assert/strict';

import { HttpError } from '../src/contracts/errors.js';
import { normalizeReportedHarvest } from '../src/reports/export-fields.js';

const is422 = (error) => error instanceof HttpError && error.status === 422;

// --- safra unica ---

test('normalizeReportedHarvest: safra unica sem escolha retorna null', () => {
  assert.equal(normalizeReportedHarvest(null, '24/25'), null);
  assert.equal(normalizeReportedHarvest(undefined, '24/25'), null);
});

test('normalizeReportedHarvest: safra unica com escolha valida retorna a escolha', () => {
  assert.equal(normalizeReportedHarvest('24/25', '24/25'), '24/25');
});

test('normalizeReportedHarvest: safra unica com escolha invalida lanca 422', () => {
  assert.throws(() => normalizeReportedHarvest('25/26', '24/25'), is422);
});

// --- safra multipla (liga): anti-vazamento ---

test('normalizeReportedHarvest: safra multipla SEM escolha lanca 422 (anti-vazamento)', () => {
  assert.throws(() => normalizeReportedHarvest(null, '24/25, 25/26'), is422);
});

test('normalizeReportedHarvest: safra multipla com escolha valida retorna a escolha', () => {
  assert.equal(normalizeReportedHarvest('25/26', '24/25, 25/26'), '25/26');
});

test('normalizeReportedHarvest: safra multipla com escolha fora do conjunto lanca 422', () => {
  assert.throws(() => normalizeReportedHarvest('99/00', '24/25, 25/26'), is422);
});

test('normalizeReportedHarvest: tolera virgula sem espaco', () => {
  assert.equal(normalizeReportedHarvest('25/26', '24/25,25/26'), '25/26');
});

// --- sem safra ---

test('normalizeReportedHarvest: sem safra declarada retorna null', () => {
  assert.equal(normalizeReportedHarvest(null, null), null);
});
