// Helpers do relatorio semanal do comercial.
//
// computeClientWeekReference e o ESPELHO client-side (apenas exibicao) da
// computeWeekReference canonica do servidor em
// src/visits/commercial-forms-service.js — manter a matematica em sincronia.
// O servidor sempre recomputa a semana no envio; o label do formulario e
// display-only.

const SAO_PAULO_UTC_OFFSET_HOURS = 3;

export interface WeekReference {
  /** Segunda da semana BRT (date-only, meia-noite UTC). */
  weekStart: Date;
  /** Domingo da semana BRT (date-only, meia-noite UTC). */
  weekEndDate: Date;
}

export function computeClientWeekReference(now = new Date()): WeekReference {
  const brtNow = new Date(now.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000);
  const year = brtNow.getUTCFullYear();
  const month = brtNow.getUTCMonth();
  const day = brtNow.getUTCDate();
  // getUTCDay: 0=domingo, 1=segunda, ..., 6=sabado
  const weekday = brtNow.getUTCDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;

  return {
    weekStart: new Date(Date.UTC(year, month, day - daysFromMonday)),
    weekEndDate: new Date(Date.UTC(year, month, day - daysFromMonday + 6)),
  };
}

// "09/06" a partir de uma data date-only (meia-noite UTC) SEM passar por
// fuso local do aparelho.
function formatDayMonthUtc(value: Date): string {
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

// Mesmo formato a partir das strings 'YYYY-MM-DD' vindas da API.
function formatDayMonthFromDateOnly(value: string): string {
  const [, month, day] = value.split('-');
  return `${day}/${month}`;
}

/** "Semana de 09/06 a 15/06" a partir das datas date-only. */
export function formatWeekLabel(weekStart: Date, weekEndDate: Date): string {
  return `Semana de ${formatDayMonthUtc(weekStart)} a ${formatDayMonthUtc(weekEndDate)}`;
}

/** Mesmo label a partir das strings 'YYYY-MM-DD' do WeeklyReportSummary. */
export function formatWeekLabelFromStrings(weekStart: string, weekEnd: string): string {
  return `Semana de ${formatDayMonthFromDateOnly(weekStart)} a ${formatDayMonthFromDateOnly(weekEnd)}`;
}
