// AP31/DSB-D19: texto do prazo do card de "Avisos", por proximidade (decisão do
// Flavio: "este mês/esta semana conforme os dias antes do faturamento"). `dueInDays`
// = dias de hoje (BRT) até a data de faturamento; `null` = "À definir" (D144, o
// contrato ainda avisa — sem prazo); negativo = o faturamento já passou sem a
// etiqueta de aprovação enviada.
export function formatAvisoDue(dueInDays: number | null): string {
  if (dueInDays === null) return 'Sem data';
  if (dueInDays < 0) return 'Faturamento vencido';
  if (dueInDays === 0) return 'Vence hoje';
  if (dueInDays === 1) return 'Vence amanhã';
  if (dueInDays <= 7) return 'Vence esta semana';
  if (dueInDays <= 30) return 'Vence este mês';
  return `Vence em ${dueInDays} dias`;
}
