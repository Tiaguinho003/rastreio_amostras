// Helpers do card de Eventos do dashboard desktop (calendário de 1 semana —
// docs/Dashboard-Visao-Geral.md).
//
// Matemática date-only em BRT no estilo de lib/weekly-report.ts (âncora
// meia-noite UTC), mas com a semana começando no DOMINGO (decisão E12 do
// calendário) — NÃO unificar com computeClientWeekReference, que é
// segunda-based por regra do relatório semanal do comercial.

const SAO_PAULO_UTC_OFFSET_HOURS = 3;

const MONTH_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const MONTH_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

const WEEKDAY_LONG = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

/** Cabeçalho da grade, domingo-first (E12). */
export const CALENDAR_WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export const CALENDAR_WEEK_DAYS = 7;

/** Dia BRT de "agora" como date-only (meia-noite UTC). */
export function getBrtToday(now: Date = new Date()): Date {
  const brtNow = new Date(now.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000);
  return new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate()));
}

/** Domingo da semana do dia dado (date-only) — início da semana exibida (E12). */
export function computeWeekStart(day: Date): Date {
  return addDays(day, -day.getUTCDay());
}

export function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

/** Chave 'YYYY-MM-DD' do mapa de eventos e das comparações de dia. */
export function toDayKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Os 7 dias exibidos a partir do domingo inicial (1 semana). */
export function buildWeek(start: Date): Date[] {
  return Array.from({ length: CALENDAR_WEEK_DAYS }, (_, i) => addDays(start, i));
}

/**
 * Rótulo do período (E15): "6 – 12 de julho" no mesmo mês;
 * "28 de jun – 4 de jul" cruzando mês; ano acrescentado quando o período
 * não é do ano corrente (ou cruza a virada).
 */
export function formatPeriodLabel(start: Date, now: Date = new Date()): string {
  const end = addDays(start, CALENDAR_WEEK_DAYS - 1);
  const currentYear = getBrtToday(now).getUTCFullYear();
  const sameYearAsNow =
    start.getUTCFullYear() === currentYear && end.getUTCFullYear() === currentYear;

  if (
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear()
  ) {
    const base = `${start.getUTCDate()} – ${end.getUTCDate()} de ${MONTH_LONG[start.getUTCMonth()]}`;
    return sameYearAsNow ? base : `${base} de ${start.getUTCFullYear()}`;
  }

  const startLabel = `${start.getUTCDate()} de ${MONTH_SHORT[start.getUTCMonth()]}`;
  const endLabel = `${end.getUTCDate()} de ${MONTH_SHORT[end.getUTCMonth()]}`;
  if (sameYearAsNow) {
    return `${startLabel} – ${endLabel}`;
  }
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${startLabel} – ${endLabel} de ${start.getUTCFullYear()}`;
  }
  return `${startLabel} de ${start.getUTCFullYear()} – ${endLabel} de ${end.getUTCFullYear()}`;
}

/** aria-label do quadrado: "9 de julho, quinta-feira". */
export function formatDayAriaLabel(date: Date): string {
  return `${date.getUTCDate()} de ${MONTH_LONG[date.getUTCMonth()]}, ${WEEKDAY_LONG[date.getUTCDay()]}`;
}

/** Rótulo curto do mês pro 1º dia do mês na grade ("1 ago"). */
export function formatMonthShort(date: Date): string {
  return MONTH_SHORT[date.getUTCMonth()];
}
