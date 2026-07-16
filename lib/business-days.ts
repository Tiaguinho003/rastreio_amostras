// Dia útil vs. fim de semana (DSB-D7). O negócio não agenda faturamento /
// embarque / pagamento em sábado ou domingo, então as datas de ação do contrato
// recusam fim de semana e o card de Eventos mostra só seg–sex.
//
// As datas do contrato são @db.Date (meia-noite UTC), então o dia da semana é
// lido em UTC (getUTCDay: 0=domingo … 6=sábado) — sem deslocar −3h (o offset BRT
// só vale pra comparação com "hoje", não pra classificar uma data pura).

// Mensagem canônica de erro (pt-BR) reusada nos modais do contrato.
export const WEEKEND_DATE_MESSAGE = 'Data indisponível: escolha um dia útil.';

// true se a Date (interpretada em UTC) cai em sábado ou domingo. Interno agora
// (só isWeekendIso o usa) — o card de Eventos passou a inlinar o mesmo check.
function isWeekendDate(date: Date): boolean {
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

// Hoje em BRT (America/Sao_Paulo), 'YYYY-MM-DD'. O fuso do device não desloca o
// "hoje" (evita off-by-one) — bate com o guard do backend (brtTodayDateOnly).
export function todayInputValueBRT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// Recua uma data 'YYYY-MM-DD' até o dia útil mais recente <= ela (sáb/dom → sex).
// Default do seletor de embarque: abrir num fim de semana não vira beco (o fds
// segue bloqueado, mas o campo já nasce num dia válido). Malformado = devolve igual.
export function lastBusinessDayIso(iso: string): string {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso;
  }
  const date = new Date(`${iso}T00:00:00Z`);
  while (isWeekendDate(date)) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}
