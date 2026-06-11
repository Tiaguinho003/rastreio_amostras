import test from 'node:test';
import assert from 'node:assert/strict';

import { computeVisitStatsWindows } from '../src/visits/visit-report-service.js';

// Janelas dos contadores do dashboard do prospector: dia BRT corrente e mes
// BRT corrente como instantes UTC (inicio inclusivo, fim exclusivo).

// Helper: instante UTC equivalente a um horario de parede BRT.
// BRT = UTC-3 (sem horario de verao desde 2019), entao BRT HH:MM = UTC (HH+3):MM.
function brt(year, month, day, hour, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
}

test('dia e mes BRT correntes em horario comum', () => {
  const { todayStartUtc, todayEndUtc, monthStartUtc, monthEndUtc } = computeVisitStatsWindows(
    brt(2026, 6, 11, 14, 30)
  );
  assert.strictEqual(todayStartUtc.toISOString(), '2026-06-11T03:00:00.000Z');
  assert.strictEqual(todayEndUtc.toISOString(), '2026-06-12T03:00:00.000Z');
  assert.strictEqual(monthStartUtc.toISOString(), '2026-06-01T03:00:00.000Z');
  assert.strictEqual(monthEndUtc.toISOString(), '2026-07-01T03:00:00.000Z');
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

test('virada de mes: primeiro dia BRT abre a janela do mes novo', () => {
  const { todayStartUtc, monthStartUtc, monthEndUtc } = computeVisitStatsWindows(
    brt(2026, 7, 1, 0, 0)
  );
  assert.strictEqual(todayStartUtc.toISOString(), '2026-07-01T03:00:00.000Z');
  assert.strictEqual(monthStartUtc.toISOString(), '2026-07-01T03:00:00.000Z');
  assert.strictEqual(monthEndUtc.toISOString(), '2026-08-01T03:00:00.000Z');
});

test('virada de ano: dezembro fecha em 1o de janeiro 03:00 UTC', () => {
  const { monthStartUtc, monthEndUtc } = computeVisitStatsWindows(brt(2026, 12, 31, 22, 0));
  assert.strictEqual(monthStartUtc.toISOString(), '2026-12-01T03:00:00.000Z');
  assert.strictEqual(monthEndUtc.toISOString(), '2027-01-01T03:00:00.000Z');
});

test('dia esta sempre contido no mes (mesmas fronteiras de 03:00 UTC)', () => {
  const { todayStartUtc, todayEndUtc, monthStartUtc, monthEndUtc } = computeVisitStatsWindows(
    brt(2026, 6, 30, 23, 59)
  );
  assert.ok(todayStartUtc.getTime() >= monthStartUtc.getTime());
  assert.ok(todayEndUtc.getTime() <= monthEndUtc.getTime());
});
