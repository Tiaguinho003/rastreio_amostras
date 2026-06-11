import test from 'node:test';
import assert from 'node:assert/strict';

import { computeWeekReference } from '../src/visits/commercial-forms-service.js';
import { computeClientWeekReference } from '../lib/weekly-report.ts';

// Semana de referencia do relatorio semanal do comercial: segunda 00:00
// BRT (inclusive) ate a proxima segunda (exclusive), como DATEs date-only.
// Tambem valida a PARIDADE do espelho client-side (lib/weekly-report.ts).

// Helper: instante UTC equivalente a um horario de parede BRT.
// BRT = UTC-3 (sem horario de verao desde 2019), entao BRT HH:MM = UTC (HH+3):MM.
function brt(year, month, day, hour, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
}

function dateOnly(value) {
  return value.toISOString().slice(0, 10);
}

test('quarta-feira comum cai na semana que comeca na segunda anterior', () => {
  // 2026-06-10 e quarta; a semana e 08/06 (seg) a 14/06 (dom).
  const { weekStart, weekEndDate, weekEndExclusive } = computeWeekReference(brt(2026, 6, 10, 14));
  assert.equal(dateOnly(weekStart), '2026-06-08');
  assert.equal(dateOnly(weekEndDate), '2026-06-14');
  assert.equal(dateOnly(weekEndExclusive), '2026-06-15');
});

test('domingo 23:59 BRT ainda pertence a semana corrente', () => {
  // 2026-06-14 23:59 BRT = 2026-06-15T02:59Z.
  const { weekStart } = computeWeekReference(new Date('2026-06-15T02:59:59.000Z'));
  assert.equal(dateOnly(weekStart), '2026-06-08');
});

test('segunda 00:00 BRT exata abre a semana nova', () => {
  // 2026-06-15 00:00 BRT = 2026-06-15T03:00Z.
  const { weekStart, weekEndDate } = computeWeekReference(new Date('2026-06-15T03:00:00.000Z'));
  assert.equal(dateOnly(weekStart), '2026-06-15');
  assert.equal(dateOnly(weekEndDate), '2026-06-21');
});

test('semana cruzando virada de mes', () => {
  // 2026-07-01 e quarta; semana 29/06 a 05/07.
  const { weekStart, weekEndDate } = computeWeekReference(brt(2026, 7, 1, 9));
  assert.equal(dateOnly(weekStart), '2026-06-29');
  assert.equal(dateOnly(weekEndDate), '2026-07-05');
});

test('semana cruzando virada de ano', () => {
  // 2026-01-02 e sexta; semana 29/12/2025 a 04/01/2026.
  const { weekStart, weekEndDate } = computeWeekReference(brt(2026, 1, 2, 16));
  assert.equal(dateOnly(weekStart), '2025-12-29');
  assert.equal(dateOnly(weekEndDate), '2026-01-04');
});

test('janela cobre exatamente 7 dias', () => {
  const { weekStart, weekEndExclusive } = computeWeekReference(brt(2026, 6, 11, 8));
  assert.equal((weekEndExclusive.getTime() - weekStart.getTime()) / (24 * 3600_000), 7);
});

test('espelho client-side (lib/weekly-report) e identico ao do servidor', () => {
  const instants = [
    brt(2026, 6, 10, 14),
    new Date('2026-06-15T02:59:59.000Z'),
    new Date('2026-06-15T03:00:00.000Z'),
    brt(2026, 7, 1, 9),
    brt(2026, 1, 2, 16),
    brt(2026, 12, 31, 22),
  ];

  for (const now of instants) {
    const server = computeWeekReference(now);
    const client = computeClientWeekReference(now);
    assert.equal(dateOnly(client.weekStart), dateOnly(server.weekStart), now.toISOString());
    assert.equal(dateOnly(client.weekEndDate), dateOnly(server.weekEndDate), now.toISOString());
  }
});
