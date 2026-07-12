// Dia útil vs. fim de semana (DSB-D7). O negócio não agenda faturamento /
// embarque / pagamento em sábado ou domingo, então as datas de ação do contrato
// recusam fim de semana e o card de Eventos mostra só seg–sex.
//
// As datas do contrato são @db.Date (meia-noite UTC), então o dia da semana é
// lido em UTC (getUTCDay: 0=domingo … 6=sábado) — sem deslocar −3h (o offset BRT
// só vale pra comparação com "hoje", não pra classificar uma data pura).

// Mensagem canônica de erro (pt-BR) reusada nos modais do contrato.
export const WEEKEND_DATE_MESSAGE = 'Data indisponível: escolha um dia útil.';

// true se a Date (interpretada em UTC) cai em sábado ou domingo.
export function isWeekendDate(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

// true se a string 'YYYY-MM-DD' cai em fim de semana. Vazio/malformado = false
// (a validação de formato/obrigatoriedade é feita à parte).
export function isWeekendIso(iso: string): boolean {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return false;
  }
  return isWeekendDate(new Date(`${iso}T00:00:00Z`));
}
