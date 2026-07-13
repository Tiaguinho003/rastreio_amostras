// Helpers do card de Eventos do dashboard desktop (calendário de 1 semana —
// docs/Dashboard-Visao-Geral.md).
//
// Matemática date-only em BRT no estilo de lib/weekly-report.ts (âncora
// meia-noite UTC). DSB-D7: o card renderiza só DIAS ÚTEIS (seg–sex), mas a
// JANELA de busca continua ancorada no domingo (dom–sáb, 7 dias) — assim os
// eventos de fim de semana (legado/borda) são buscados e o backend os "rola" pro
// dia útil vizinho (ver rollWeekendToWeekday em sale-contracts). Por isso
// computeWeekStart/buildWeek/CALENDAR_WEEK_DAYS seguem de 7 dias domingo-first;
// buildBusinessDays filtra pro que é exibido.

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

/** Cabeçalho da grade — só dias úteis, seg–sex (DSB-D7). */
export const CALENDAR_WEEKDAY_INITIALS = ['S', 'T', 'Q', 'Q', 'S'];

/** Dias da JANELA de busca (dom–sáb). O card renderiza só os 5 úteis. */
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

/** Os 7 dias da janela a partir do domingo inicial (dom–sáb). */
export function buildWeek(start: Date): Date[] {
  return Array.from({ length: CALENDAR_WEEK_DAYS }, (_, i) => addDays(start, i));
}

/** Os 5 dias ÚTEIS (seg–sex) exibidos no card — os fins de semana da janela
 *  ficam de fora do render (DSB-D7); seus eventos são rolados pelo backend.
 *  Fim de semana (getUTCDay 0=dom/6=sáb) é inlinado — em vez de importar
 *  isWeekendDate de ./business-days — pra este módulo não ter import RELATIVO de
 *  runtime e assim rodar no test:unit via --experimental-strip-types (DSB-H8). */
export function buildBusinessDays(start: Date): Date[] {
  return buildWeek(start).filter((day) => {
    const dow = day.getUTCDay();
    return dow !== 0 && dow !== 6;
  });
}

/**
 * Rótulo do período (E15), agora sobre os DIAS ÚTEIS (DSB-D7): "7 – 11 de julho"
 * no mesmo mês; "30 de jun – 4 de jul" cruzando mês; ano acrescentado quando o
 * período não é do ano corrente (ou cruza a virada). `start` é o domingo da
 * janela; o rótulo cobre segunda (start+1) até sexta (start+5).
 */
export function formatPeriodLabel(start: Date, now: Date = new Date()): string {
  const first = addDays(start, 1); // segunda
  const last = addDays(start, CALENDAR_WEEK_DAYS - 2); // sexta (start + 5)
  const currentYear = getBrtToday(now).getUTCFullYear();
  const sameYearAsNow =
    first.getUTCFullYear() === currentYear && last.getUTCFullYear() === currentYear;

  if (
    first.getUTCMonth() === last.getUTCMonth() &&
    first.getUTCFullYear() === last.getUTCFullYear()
  ) {
    const base = `${first.getUTCDate()} – ${last.getUTCDate()} de ${MONTH_LONG[first.getUTCMonth()]}`;
    return sameYearAsNow ? base : `${base} de ${first.getUTCFullYear()}`;
  }

  const startLabel = `${first.getUTCDate()} de ${MONTH_SHORT[first.getUTCMonth()]}`;
  const endLabel = `${last.getUTCDate()} de ${MONTH_SHORT[last.getUTCMonth()]}`;
  if (sameYearAsNow) {
    return `${startLabel} – ${endLabel}`;
  }
  if (first.getUTCFullYear() === last.getUTCFullYear()) {
    return `${startLabel} – ${endLabel} de ${first.getUTCFullYear()}`;
  }
  return `${startLabel} de ${first.getUTCFullYear()} – ${endLabel} de ${last.getUTCFullYear()}`;
}

/** aria-label do quadrado: "9 de julho, quinta-feira". */
export function formatDayAriaLabel(date: Date): string {
  return `${date.getUTCDate()} de ${MONTH_LONG[date.getUTCMonth()]}, ${WEEKDAY_LONG[date.getUTCDay()]}`;
}

/** Rótulo curto do mês pro 1º dia do mês na grade ("1 ago"). */
export function formatMonthShort(date: Date): string {
  return MONTH_SHORT[date.getUTCMonth()];
}
