// Helpers do card de Eventos do dashboard desktop (calendário MENSAL —
// docs/Dashboard-Visao-Geral.md).
//
// Matemática date-only em BRT no estilo de lib/weekly-report.ts (âncora
// meia-noite UTC). DSB-D18: o card renderiza o MÊS inteiro (grade 7×N
// domingo-first, incluindo fins de semana e as pontas dos meses vizinhos);
// a janela de busca cobre a grade inteira (28–42 dias). O roll de fim de
// semana do backend (DSB-D7) saiu junto — eventos aparecem no dia REAL.
//
// GOTCHA (DSB-H8): este módulo NÃO pode ter import relativo de RUNTIME —
// ele roda no test:unit via --experimental-strip-types (só type-only é
// stripped). Qualquer check de fim de semana fica inlinado (getUTCDay 0/6).

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

/** Cabeçalho da grade — semana completa domingo-first (DSB-D18). */
export const CALENDAR_WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Dia BRT de "agora" como date-only (meia-noite UTC). */
export function getBrtToday(now: Date = new Date()): Date {
  const brtNow = new Date(now.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 3600_000);
  return new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

/** Domingo da semana do dia dado (date-only) — âncora das linhas da grade. */
export function computeWeekStart(day: Date): Date {
  return addDays(day, -day.getUTCDay());
}

/** Dia 1 do mês do dia dado (date-only) — âncora da visão mensal. */
export function computeMonthStart(day: Date): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
}

/** Dia 1 do mês deslocado `delta` meses (navegação ◀ ▶). */
export function addMonths(monthStart: Date, delta: number): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + delta, 1));
}

/** Chave 'YYYY-MM-DD' do mapa de eventos e das comparações de dia. */
export function toDayKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Grade do MÊS (DSB-D18): do domingo da semana do dia 1 até o sábado da
 * semana do último dia — sempre múltiplo de 7 células (28/35/42). As pontas
 * pertencem aos meses vizinhos (o card as esmaece via comparação de mês).
 */
export function buildMonthGrid(monthStart: Date): Date[] {
  const gridStart = computeWeekStart(monthStart);
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
  const gridEnd = addDays(computeWeekStart(monthEnd), 6);
  const total = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1;
  return Array.from({ length: total }, (_, i) => addDays(gridStart, i));
}

/** Rótulo do mês exibido no header: "julho de 2026" (sempre com o ano). */
export function formatMonthLabel(monthStart: Date): string {
  return `${MONTH_LONG[monthStart.getUTCMonth()]} de ${monthStart.getUTCFullYear()}`;
}

/** aria-label do quadrado: "9 de julho, quinta-feira". */
export function formatDayAriaLabel(date: Date): string {
  return `${date.getUTCDate()} de ${MONTH_LONG[date.getUTCMonth()]}, ${WEEKDAY_LONG[date.getUTCDay()]}`;
}

/** Rótulo curto do mês pro 1º dia do mês na grade ("1 ago"). */
export function formatMonthShort(date: Date): string {
  return MONTH_SHORT[date.getUTCMonth()];
}
