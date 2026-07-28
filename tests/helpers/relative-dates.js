// Datas ANCORADAS em hoje, para testes cuja asserta e sobre FUTURO ou PASSADO —
// nao sobre a data em si.
//
// Por que existe: uma data absoluta proxima (`paymentDate: '2026-07-20'`) num
// teste que afirma "previsto/agendado" passa ate o dia chegar e quebra sozinha
// depois, sem nada no codigo mudar. Ja aconteceu duas vezes neste repo — a
// primeira virou este helper (era closure local no teste de embarque), a segunda
// derrubou o feed de pagamento em 2026-07-21.
//
// Regra de bolso: se o teste afirma um ESTADO derivado do relogio
// (previsto/atrasado/realizado, "vence em N dias", janelas de retencao), use
// daqui. Se a data e so um dado que vai e volta, uma data fixa serve.

// Dia util a `offset` dias de hoje (UTC, meia-noite). Fim de semana ROLA PARA
// TRAS, espelhando o feed do dashboard (DSB-D7).
//
// 🔴 Offsets no mesmo teste precisam de gap >= 4: o roll-back desloca ate 2
// dias, entao -10 e -8 COLIDEM na mesma sexta quando "hoje" UTC cai na segunda —
// e dois eventos no mesmo balde do dia quebram um `[0]`.
export function bizDay(offset) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

// Dia corrido a `offset` dias de hoje (UTC, meia-noite) — sem roll de fim de
// semana. Use quando o codigo sob teste nao rola o fim de semana.
export function calendarDay(offset) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

// `YYYY-MM-DD` de um Date — a chave dos feeds agrupados por dia.
export function dayKey(date) {
  return date.toISOString().slice(0, 10);
}
