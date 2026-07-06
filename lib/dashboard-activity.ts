/**
 * Formata o intervalo entre `iso` e `now` (ms epoch) num label
 * relativo em pt-BR ("agora", "há N min", "há N h", "há N dia(s)",
 * "há N sem", "há N mês(es)"). Recebe `now` explicito pra que o
 * componente possa atualizar timestamps via setInterval sem
 * acoplar a `Date.now()`. Acentos corrigidos na Fase J (D125).
 * Nasceu no card "Últimas atividades" do dashboard (removido);
 * hoje serve o timeline do modal de Detalhes do contrato.
 */
export function formatRelativeTime(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 0) return 'agora';
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  if (d < 30) {
    const w = Math.floor(d / 7);
    return `há ${w} sem`;
  }
  const mo = Math.floor(d / 30);
  return `há ${mo} ${mo === 1 ? 'mês' : 'meses'}`;
}
