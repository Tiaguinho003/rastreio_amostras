import test from 'node:test';
import assert from 'node:assert/strict';

import { computeVisitStatsWindows } from '../src/visits/visit-report-service.js';

// Janela do dia BRT corrente como instantes UTC (inicio inclusivo, fim
// exclusivo) — base dos dois contadores do dashboard do prospector.

// Helper: instante UTC equivalente a um horario de parede BRT.
// BRT = UTC-3 (sem horario de verao desde 2019), entao BRT HH:MM = UTC (HH+3):MM.
function brt(year, month, day, hour, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
}

test('dia BRT corrente em horario comum', () => {
  const { todayStartUtc, todayEndUtc } = computeVisitStatsWindows(brt(2026, 6, 11, 14, 30));
  assert.strictEqual(todayStartUtc.toISOString(), '2026-06-11T03:00:00.000Z');
  assert.strictEqual(todayEndUtc.toISOString(), '2026-06-12T03:00:00.000Z');
});

test('madrugada UTC antes das 03:00 ainda pertence ao dia BRT anterior', () => {
  // 2026-06-12 02:59:59 UTC = 2026-06-11 23:59:59 BRT.
  const { todayStartUtc, todayEndUtc } = computeVisitStatsWindows(
    new Date('2026-06-12T02:59:59.000Z')
  );
  assert.strictEqual(todayStartUtc.toISOString(), '2026-06-11T03:00:00.000Z');
  assert.strictEqual(todayEndUtc.toISOString(), '2026-06-12T03:00:00.000Z');
});

test('03:00 UTC exato vira o dia BRT seguinte', () => {
  const { todayStartUtc, todayEndUtc } = computeVisitStatsWindows(
    new Date('2026-06-12T03:00:00.000Z')
  );
  assert.strictEqual(todayStartUtc.toISOString(), '2026-06-12T03:00:00.000Z');
  assert.strictEqual(todayEndUtc.toISOString(), '2026-06-13T03:00:00.000Z');
});

test('virada de mes: 1o de julho BRT abre janela propria', () => {
  const { todayStartUtc, todayEndUtc } = computeVisitStatsWindows(brt(2026, 7, 1, 0, 0));
  assert.strictEqual(todayStartUtc.toISOString(), '2026-07-01T03:00:00.000Z');
  assert.strictEqual(todayEndUtc.toISOString(), '2026-07-02T03:00:00.000Z');
});

test('virada de ano: 31/12 BRT fecha em 1o de janeiro 03:00 UTC', () => {
  const { todayStartUtc, todayEndUtc } = computeVisitStatsWindows(brt(2026, 12, 31, 22, 0));
  assert.strictEqual(todayStartUtc.toISOString(), '2026-12-31T03:00:00.000Z');
  assert.strictEqual(todayEndUtc.toISOString(), '2027-01-01T03:00:00.000Z');
});

test('janela cobre exatamente 24 horas', () => {
  const { todayStartUtc, todayEndUtc } = computeVisitStatsWindows(brt(2026, 6, 30, 23, 59));
  assert.strictEqual((todayEndUtc.getTime() - todayStartUtc.getTime()) / 3600_000, 24);
});
