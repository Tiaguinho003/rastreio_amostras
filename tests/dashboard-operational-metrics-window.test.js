import test from 'node:test';
import assert from 'node:assert/strict';

import { computeOperationalMetricsWindow } from '../src/samples/sample-query-service.js';

// Helper: build a UTC Date representing a specific BRT wall-clock time.
// BRT = UTC-3 (sem horario de verao desde 2019), entao BRT HH:MM = UTC (HH+3):MM.
function brt(year, month, day, hour, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
}

test('reference day is today after 17:30 BRT', () => {
  const now = brt(2026, 4, 20, 18, 0);
  const { bucketDates, windowStartUtc, windowEndUtc } = computeOperationalMetricsWindow(now);
  assert.deepStrictEqual(bucketDates, [
    '2026-04-16',
    '2026-04-17',
    '2026-04-18',
    '2026-04-19',
    '2026-04-20',
  ]);
  // Inicio = 2026-04-16 00:00 BRT = 2026-04-16 03:00 UTC.
  assert.strictEqual(windowStartUtc.toISOString(), '2026-04-16T03:00:00.000Z');
  // Fim = 2026-04-21 00:00 BRT = 2026-04-21 03:00 UTC.
  assert.strictEqual(windowEndUtc.toISOString(), '2026-04-21T03:00:00.000Z');
});

test('reference day is yesterday before 17:30 BRT', () => {
  const now = brt(2026, 4, 20, 10, 0);
  const { bucketDates } = computeOperationalMetricsWindow(now);
  assert.deepStrictEqual(bucketDates, [
    '2026-04-15',
    '2026-04-16',
    '2026-04-17',
    '2026-04-18',
    '2026-04-19',
  ]);
});

test('17:30 BRT exact is inclusive (flips to today)', () => {
  const atCutoff = brt(2026, 4, 20, 17, 30);
  const justBefore = new Date(atCutoff.getTime() - 1);

  const afterResult = computeOperationalMetricsWindow(atCutoff);
  assert.strictEqual(afterResult.bucketDates[4], '2026-04-20');

  const beforeResult = computeOperationalMetricsWindow(justBefore);
  assert.strictEqual(beforeResult.bucketDates[4], '2026-04-19');
});

test('crosses month boundary backwards', () => {
  const now = brt(2026, 5, 1, 18, 0);
  const { bucketDates } = computeOperationalMetricsWindow(now);
  assert.deepStrictEqual(bucketDates, [
    '2026-04-27',
    '2026-04-28',
    '2026-04-29',
    '2026-04-30',
    '2026-05-01',
  ]);
});

test('crosses year boundary backwards', () => {
  const now = brt(2026, 1, 2, 18, 0);
  const { bucketDates } = computeOperationalMetricsWindow(now);
  assert.deepStrictEqual(bucketDates, [
    '2025-12-29',
    '2025-12-30',
    '2025-12-31',
    '2026-01-01',
    '2026-01-02',
  ]);
});

test('window spans exactly 5 days (120 hours)', () => {
  const now = brt(2026, 4, 20, 18, 0);
  const { windowStartUtc, windowEndUtc } = computeOperationalMetricsWindow(now);
  const hours = (windowEndUtc.getTime() - windowStartUtc.getTime()) / 3600_000;
  assert.strictEqual(hours, 120);
});
