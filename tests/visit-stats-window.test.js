import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeVisitStatsWindows,
  computeVisitTrendWindows,
  computeVisitWeekWindows,
} from '../src/visits/visit-report-service.js';

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

// Janelas de SEMANA BRT (segunda 00:00 BRT = 03:00Z) — base dos cards "esta
// semana" / "semana passada" de /relatorios. Semana de referencia: a que abre
// na segunda 2026-07-20 (this=07-20 03:00Z, next=07-27 03:00Z, prev=07-13 03:00Z).

test('semana BRT em dia comum (quarta) aponta pra segunda da semana', () => {
  const { prevWeekStartUtc, thisWeekStartUtc, nextWeekStartUtc } = computeVisitWeekWindows(
    brt(2026, 7, 22, 14, 30)
  );
  assert.strictEqual(thisWeekStartUtc.toISOString(), '2026-07-20T03:00:00.000Z');
  assert.strictEqual(nextWeekStartUtc.toISOString(), '2026-07-27T03:00:00.000Z');
  assert.strictEqual(prevWeekStartUtc.toISOString(), '2026-07-13T03:00:00.000Z');
});

test('domingo pertence a semana da segunda anterior (nao abre semana nova)', () => {
  // 2026-07-26 e domingo — ainda dentro da semana que abriu em 20/07.
  const { thisWeekStartUtc, nextWeekStartUtc } = computeVisitWeekWindows(brt(2026, 7, 26, 10, 0));
  assert.strictEqual(thisWeekStartUtc.toISOString(), '2026-07-20T03:00:00.000Z');
  assert.strictEqual(nextWeekStartUtc.toISOString(), '2026-07-27T03:00:00.000Z');
});

test('segunda 00:00 BRT (03:00Z) e o inicio inclusivo da propria semana', () => {
  const { thisWeekStartUtc } = computeVisitWeekWindows(new Date('2026-07-20T03:00:00.000Z'));
  assert.strictEqual(thisWeekStartUtc.toISOString(), '2026-07-20T03:00:00.000Z');
});

test('02:59Z de segunda ainda e domingo BRT → pertence a semana anterior', () => {
  // 2026-07-20 02:59:59 UTC = 2026-07-19 23:59:59 BRT (domingo).
  const { thisWeekStartUtc, nextWeekStartUtc } = computeVisitWeekWindows(
    new Date('2026-07-20T02:59:59.000Z')
  );
  assert.strictEqual(thisWeekStartUtc.toISOString(), '2026-07-13T03:00:00.000Z');
  assert.strictEqual(nextWeekStartUtc.toISOString(), '2026-07-20T03:00:00.000Z');
});

test('semana que cruza a virada de mes (agosto → julho no prev)', () => {
  // 2026-08-05 e quarta; a semana abriu na segunda 03/08; a anterior em 27/07.
  const { prevWeekStartUtc, thisWeekStartUtc, nextWeekStartUtc } = computeVisitWeekWindows(
    brt(2026, 8, 5, 10, 0)
  );
  assert.strictEqual(prevWeekStartUtc.toISOString(), '2026-07-27T03:00:00.000Z');
  assert.strictEqual(thisWeekStartUtc.toISOString(), '2026-08-03T03:00:00.000Z');
  assert.strictEqual(nextWeekStartUtc.toISOString(), '2026-08-10T03:00:00.000Z');
});

test('as duas janelas de semana sao contiguas e de 7 dias', () => {
  const { prevWeekStartUtc, thisWeekStartUtc, nextWeekStartUtc } = computeVisitWeekWindows(
    brt(2026, 7, 22, 14, 30)
  );
  assert.strictEqual((nextWeekStartUtc.getTime() - thisWeekStartUtc.getTime()) / 86_400_000, 7);
  assert.strictEqual((thisWeekStartUtc.getTime() - prevWeekStartUtc.getTime()) / 86_400_000, 7);
});

// Janela de 13 semanas BRT (atual + 12 anteriores, ~90 dias) da tendencia do
// card. weekStarts = segundas 'YYYY-MM-DD'; [12] = a semana de `now` (o count
// dela == visitsThisWeek); janela [startUtc, endUtc) alinhada a segunda.

test('tendencia: 13 semanas BRT terminando na semana corrente', () => {
  const { startUtc, endUtc, weekStarts } = computeVisitTrendWindows(brt(2026, 7, 22, 14, 30));
  assert.strictEqual(weekStarts.length, 13);
  assert.strictEqual(weekStarts[0], '2026-04-27'); // segunda 12 semanas atras
  assert.strictEqual(weekStarts[12], '2026-07-20'); // segunda da semana de hoje
  assert.strictEqual(startUtc.toISOString(), '2026-04-27T03:00:00.000Z');
  assert.strictEqual(endUtc.toISOString(), '2026-07-27T03:00:00.000Z'); // proxima segunda (exclusivo)
  // A janela cobre exatamente 13 semanas (91 dias).
  assert.strictEqual((endUtc.getTime() - startUtc.getTime()) / 86_400_000, 91);
});

test('tendencia: weekStarts sao segundas consecutivas (delta 7 dias)', () => {
  const { weekStarts } = computeVisitTrendWindows(brt(2026, 7, 22, 14, 30));
  for (let i = 1; i < weekStarts.length; i += 1) {
    const prev = new Date(`${weekStarts[i - 1]}T00:00:00.000Z`).getTime();
    const curr = new Date(`${weekStarts[i]}T00:00:00.000Z`).getTime();
    assert.strictEqual((curr - prev) / 86_400_000, 7, `semana ${i}`);
  }
});

test('tendencia: domingo BRT pertence a semana da segunda anterior', () => {
  // 2026-07-26 e domingo BRT (semana 20-26/07): a semana corrente segue a de 20/07.
  const { weekStarts } = computeVisitTrendWindows(brt(2026, 7, 26, 10, 0));
  assert.strictEqual(weekStarts[12], '2026-07-20');
});

test('tendencia: virada de ano (semana corrente cruza dez/jan)', () => {
  // 2026-01-01 e quinta; a segunda dessa semana e 2025-12-29.
  const { startUtc, endUtc, weekStarts } = computeVisitTrendWindows(brt(2026, 1, 1, 12, 0));
  assert.strictEqual(weekStarts.length, 13);
  assert.strictEqual(weekStarts[12], '2025-12-29');
  assert.strictEqual(startUtc.toISOString(), '2025-10-06T03:00:00.000Z'); // 12 semanas antes
  assert.strictEqual(endUtc.toISOString(), '2026-01-05T03:00:00.000Z'); // proxima segunda
});
