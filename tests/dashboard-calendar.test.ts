import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CALENDAR_WEEKDAY_INITIALS,
  addDays,
  addMonths,
  buildMonthGrid,
  computeMonthStart,
  computeWeekStart,
  formatDayAriaLabel,
  formatMonthLabel,
  formatMonthShort,
  getBrtToday,
  toDayKey,
} from '../lib/dashboard-calendar.ts';

// DSB-H8 (destravado no check-up): a matemática do card de Eventos não tinha
// teste (o `node --test` só passou a rodar .ts no test:unit). DSB-D18: o card
// virou MENSAL — a grade cobre o mês inteiro em semanas completas domingo-first.
// Tudo é date-only e recebe `now` injetável → determinístico.
// Âncora: 2026-07-05 é DOMINGO; 2026-07-01 é QUARTA.

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

test('computeMonthStart/addMonths: dia 1 do mês + navegação com virada de ano', () => {
  assert.equal(toDayKey(computeMonthStart(utc(2026, 6, 14))), '2026-07-01');
  assert.equal(toDayKey(computeMonthStart(utc(2026, 6, 1))), '2026-07-01'); // dia 1 -> ele mesmo
  assert.equal(toDayKey(addMonths(utc(2026, 6, 1), 1)), '2026-08-01');
  assert.equal(toDayKey(addMonths(utc(2026, 11, 1), 1)), '2027-01-01'); // dez -> jan
  assert.equal(toDayKey(addMonths(utc(2026, 0, 1), -1)), '2025-12-01'); // jan -> dez
});

test('buildMonthGrid: julho/2026 = 5 semanas (35 células), domingo a sábado', () => {
  const grid = buildMonthGrid(utc(2026, 6, 1)); // 01/07/2026 é quarta
  assert.equal(grid.length, 35);
  assert.equal(toDayKey(grid[0]), '2026-06-28'); // domingo da semana do dia 1
  assert.equal(toDayKey(grid[34]), '2026-08-01'); // sábado da semana do dia 31
  assert.equal(grid[0].getUTCDay(), 0);
  assert.equal(grid[34].getUTCDay(), 6);
  // Pontas pertencem aos meses vizinhos (o card as esmaece por comparação de mês).
  assert.notEqual(grid[0].getUTCMonth(), 6);
  assert.notEqual(grid[34].getUTCMonth(), 6);
});

test('buildMonthGrid: fev/2026 alinhado (dia 1 é domingo, 28 dias) = 4 semanas', () => {
  const grid = buildMonthGrid(utc(2026, 1, 1)); // 01/02/2026 é domingo
  assert.equal(grid.length, 28);
  assert.equal(toDayKey(grid[0]), '2026-02-01');
  assert.equal(toDayKey(grid[27]), '2026-02-28');
});

test('buildMonthGrid: agosto/2026 = 6 semanas (42 células)', () => {
  const grid = buildMonthGrid(utc(2026, 7, 1)); // 01/08/2026 é sábado; 31 dias
  assert.equal(grid.length, 42);
  assert.equal(toDayKey(grid[0]), '2026-07-26'); // domingo antes do dia 1
  assert.equal(toDayKey(grid[41]), '2026-09-05'); // sábado após o dia 31
});

test('buildMonthGrid: sempre múltiplo de 7, começa domingo e termina sábado', () => {
  for (let month = 0; month < 12; month += 1) {
    const grid = buildMonthGrid(utc(2026, month, 1));
    assert.equal(grid.length % 7, 0);
    assert.equal(grid[0].getUTCDay(), 0);
    assert.equal(grid[grid.length - 1].getUTCDay(), 6);
  }
  assert.equal(CALENDAR_WEEKDAY_INITIALS.length, 7); // cabeçalho bate com as colunas
});

test('formatMonthLabel: nome do mês + ano (sempre)', () => {
  assert.equal(formatMonthLabel(utc(2026, 6, 1)), 'julho de 2026');
  assert.equal(formatMonthLabel(utc(2025, 11, 1)), 'dezembro de 2025');
});

test('formatDayAriaLabel / formatMonthShort', () => {
  assert.equal(formatDayAriaLabel(utc(2026, 6, 9)), '9 de julho, quinta-feira');
  assert.equal(formatMonthShort(utc(2026, 7, 1)), 'ago');
});
