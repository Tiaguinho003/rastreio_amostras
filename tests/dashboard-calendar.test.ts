import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CALENDAR_WEEK_DAYS,
  CALENDAR_WEEKDAY_INITIALS,
  addDays,
  buildBusinessDays,
  buildWeek,
  computeWeekStart,
  formatDayAriaLabel,
  formatMonthShort,
  formatPeriodLabel,
  getBrtToday,
  toDayKey,
} from '../lib/dashboard-calendar.ts';

// DSB-H8 (destravado no check-up): a matemática de semana/dayKey/BRT do card de
// Eventos não tinha teste (o `node --test` só passou a rodar .ts no test:unit). Tudo
// é date-only e recebe `now` injetável → determinístico, sem depender do relógio real.
// Âncora: 2026-07-05 é DOMINGO (logo 07-06 seg … 07-10 sex … 07-11 sáb).

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

test('getBrtToday: âncora no dia BRT (offset -3h), date-only meia-noite UTC', () => {
  // 2026-07-10T02:00Z = 2026-07-09 23:00 BRT -> o dia BRT ainda é 09.
  assert.equal(toDayKey(getBrtToday(new Date('2026-07-10T02:00:00.000Z'))), '2026-07-09');
  // 2026-07-10T12:00Z = 2026-07-10 09:00 BRT -> dia BRT = 10.
  assert.equal(toDayKey(getBrtToday(new Date('2026-07-10T12:00:00.000Z'))), '2026-07-10');
  assert.equal(
    getBrtToday(new Date('2026-07-10T12:00:00.000Z')).toISOString(),
    '2026-07-10T00:00:00.000Z'
  );
});

test('toDayKey/addDays: chave YYYY-MM-DD + aritmética UTC (cruza mês e ano)', () => {
  assert.equal(toDayKey(utc(2026, 6, 5)), '2026-07-05'); // mês 6 = julho
  assert.equal(toDayKey(addDays(utc(2026, 6, 31), 1)), '2026-08-01');
  assert.equal(toDayKey(addDays(utc(2026, 0, 1), -1)), '2025-12-31');
});

test('computeWeekStart: volta pro domingo da semana', () => {
  assert.equal(toDayKey(computeWeekStart(utc(2026, 6, 5))), '2026-07-05'); // domingo -> ele mesmo
  assert.equal(toDayKey(computeWeekStart(utc(2026, 6, 8))), '2026-07-05'); // quarta
  assert.equal(toDayKey(computeWeekStart(utc(2026, 6, 11))), '2026-07-05'); // sábado
  assert.equal(toDayKey(computeWeekStart(utc(2026, 6, 12))), '2026-07-12'); // próximo domingo
});

test('buildWeek: 7 dias dom–sáb a partir do domingo', () => {
  const week = buildWeek(utc(2026, 6, 5));
  assert.equal(week.length, CALENDAR_WEEK_DAYS);
  assert.deepEqual(week.map(toDayKey), [
    '2026-07-05',
    '2026-07-06',
    '2026-07-07',
    '2026-07-08',
    '2026-07-09',
    '2026-07-10',
    '2026-07-11',
  ]);
});

test('buildBusinessDays: só os 5 úteis (seg–sex); fins de semana fora', () => {
  const days = buildBusinessDays(utc(2026, 6, 5));
  assert.deepEqual(days.map(toDayKey), [
    '2026-07-06',
    '2026-07-07',
    '2026-07-08',
    '2026-07-09',
    '2026-07-10',
  ]);
  assert.equal(CALENDAR_WEEKDAY_INITIALS.length, 5); // rótulos batem com as células
});

test('formatPeriodLabel: mesmo mês, ano corrente -> sem ano', () => {
  const now = new Date('2026-07-08T12:00:00.000Z');
  assert.equal(formatPeriodLabel(utc(2026, 6, 5), now), '6 – 10 de julho');
});

test('formatPeriodLabel: cruza mês, ano corrente', () => {
  const now = new Date('2026-06-30T12:00:00.000Z');
  // domingo 28/06 -> seg 29/06 … sex 03/07.
  assert.equal(formatPeriodLabel(utc(2026, 5, 28), now), '29 de jun – 3 de jul');
});

test('formatPeriodLabel: ano != corrente acrescenta o ano (mesmo mês)', () => {
  const now = new Date('2026-07-08T12:00:00.000Z'); // corrente = 2026
  assert.equal(formatPeriodLabel(utc(2025, 6, 5), now), '6 – 10 de julho de 2025');
});

test('formatPeriodLabel: cruza o ano (dez -> jan)', () => {
  const now = new Date('2026-12-30T12:00:00.000Z');
  // first = seg 28/12/2026, last = sex 01/01/2027.
  assert.equal(formatPeriodLabel(utc(2026, 11, 27), now), '28 de dez de 2026 – 1 de jan de 2027');
});

test('formatDayAriaLabel / formatMonthShort', () => {
  assert.equal(formatDayAriaLabel(utc(2026, 6, 9)), '9 de julho, quinta-feira');
  assert.equal(formatMonthShort(utc(2026, 7, 1)), 'ago');
});
