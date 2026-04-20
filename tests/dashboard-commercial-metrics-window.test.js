import test from 'node:test';
import assert from 'node:assert/strict';

import { computeCommercialMetricsWindow } from '../src/samples/sample-query-service.js';

// Helper: build a UTC Date representing a specific BRT wall-clock time.
// BRT = UTC-3 (sem horario de verao desde 2019), entao BRT HH:MM = UTC (HH+3):MM.
function brt(year, month, day, hour, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
}

test('reference week is current week after Friday 17:30 BRT', () => {
  // Sexta 2026-04-24 18:00 BRT (apos cutoff).
  const now = brt(2026, 4, 24, 18, 0);
  const { bucketDates, windowStartUtc, windowEndUtc } = computeCommercialMetricsWindow(now);
  // 4 segundas: 2026-03-30, 2026-04-06, 2026-04-13, 2026-04-20.
  assert.deepStrictEqual(bucketDates, ['2026-03-30', '2026-04-06', '2026-04-13', '2026-04-20']);
  // Inicio = 2026-03-30 00:00 BRT = 2026-03-30 03:00 UTC.
  assert.strictEqual(windowStartUtc.toISOString(), '2026-03-30T03:00:00.000Z');
  // Fim = 2026-04-27 00:00 BRT = 2026-04-27 03:00 UTC (proxima segunda).
  assert.strictEqual(windowEndUtc.toISOString(), '2026-04-27T03:00:00.000Z');
});

test('reference week is previous week before Friday 17:30 BRT', () => {
  // Quarta 2026-04-22 10:00 BRT (antes do cutoff da sexta corrente).
  const now = brt(2026, 4, 22, 10, 0);
  const { bucketDates } = computeCommercialMetricsWindow(now);
  // Ref week = semana anterior (segunda 2026-04-13).
  assert.deepStrictEqual(bucketDates, ['2026-03-23', '2026-03-30', '2026-04-06', '2026-04-13']);
});

test('Friday 17:30 BRT exact is inclusive (flips to current week)', () => {
  const atCutoff = brt(2026, 4, 24, 17, 30);
  const justBefore = new Date(atCutoff.getTime() - 1);

  const afterResult = computeCommercialMetricsWindow(atCutoff);
  assert.strictEqual(afterResult.bucketDates[3], '2026-04-20');

  const beforeResult = computeCommercialMetricsWindow(justBefore);
  assert.strictEqual(beforeResult.bucketDates[3], '2026-04-13');
});

test('Monday before Friday cutoff uses previous week', () => {
  // Segunda 2026-04-20 09:00 BRT -> ref = semana anterior (2026-04-13).
  const now = brt(2026, 4, 20, 9, 0);
  const { bucketDates } = computeCommercialMetricsWindow(now);
  assert.strictEqual(bucketDates[3], '2026-04-13');
});

test('Sunday uses previous week (after Friday cutoff of that week)', () => {
  // Domingo 2026-04-26 12:00 BRT -> semana corrente comeca em 2026-04-20,
  // ja passou sexta 17:30 -> ref = 2026-04-20.
  const now = brt(2026, 4, 26, 12, 0);
  const { bucketDates } = computeCommercialMetricsWindow(now);
  assert.strictEqual(bucketDates[3], '2026-04-20');
});

test('crosses month boundary backwards', () => {
  // Sexta 2026-05-01 20:00 BRT (apos cutoff). Segunda da semana = 2026-04-27.
  const now = brt(2026, 5, 1, 20, 0);
  const { bucketDates } = computeCommercialMetricsWindow(now);
  assert.deepStrictEqual(bucketDates, ['2026-04-06', '2026-04-13', '2026-04-20', '2026-04-27']);
});

test('crosses year boundary backwards', () => {
  // Sexta 2026-01-02 20:00 BRT. Segunda da semana = 2025-12-29 (semana ISO cruza ano).
  const now = brt(2026, 1, 2, 20, 0);
  const { bucketDates } = computeCommercialMetricsWindow(now);
  assert.deepStrictEqual(bucketDates, ['2025-12-08', '2025-12-15', '2025-12-22', '2025-12-29']);
});

test('window spans exactly 4 weeks (672 hours)', () => {
  const now = brt(2026, 4, 24, 18, 0);
  const { windowStartUtc, windowEndUtc } = computeCommercialMetricsWindow(now);
  const hours = (windowEndUtc.getTime() - windowStartUtc.getTime()) / 3600_000;
  assert.strictEqual(hours, 4 * 7 * 24);
});

test('bucketDates are always Mondays', () => {
  const samples = [
    brt(2026, 4, 24, 18, 0), // Friday after cutoff
    brt(2026, 4, 22, 10, 0), // Wednesday before cutoff
    brt(2026, 5, 1, 20, 0), // Month crossing
    brt(2026, 1, 2, 20, 0), // Year crossing
  ];
  for (const now of samples) {
    const { bucketDates } = computeCommercialMetricsWindow(now);
    for (const date of bucketDates) {
      const [y, m, d] = date.split('-').map(Number);
      const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      assert.strictEqual(weekday, 1, `${date} nao e segunda-feira`);
    }
  }
});
