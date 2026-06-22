/**
 * Config visual dos itens de "Ultimas atividades" do dashboard
 * (desktop + futuro mobile). Centralizado pra que ambas as
 * plataformas compartilhem labels/cores e pra que a adicao de um
 * novo tipo de evento seja um unico ponto de mudanca no client.
 *
 * NAO movemos pro server pq:
 *  - tipos sao estaticos hoje (4 tipos, mudam raro)
 *  - label/cor sao puramente apresentacao (i18n cabe aqui)
 *  - evita round-trip de metadata constante
 */

import type { DashboardRecentActivityType } from './types';

export interface DashboardActivityConfig {
  label: string;
  /** Cor do texto e tom dominante (badge / icone). */
  color: string;
  /** Background da badge (tom claro do mesmo matiz). */
  bg: string;
}

// Cor PADRAO de cada acao (canonica): consumida tanto pelo icone do
// mobile (`RecentActivityListMobile`, glifo + circulo do mesmo tom) quanto
// pelo rotulo do desktop (`RecentActivityList`, pill `.dd-activity-event`).
// Verde/ambar/vermelho sao os MESMOS tons semanticos do grafico de "Lotes
// disponiveis" (`SalesAvailabilityCard`) — coerencia no dashboard:
// venda=verde, envio=ambar, perda=vermelho; registro=azul (informativo);
// cancelamentos=cinza (neutro).
export const EVENT_CONFIG: Record<DashboardRecentActivityType, DashboardActivityConfig> = {
  REGISTRATION_CONFIRMED: {
    label: 'Registrada',
    color: '#3a6ea3',
    bg: 'rgba(58, 110, 163, 0.12)',
  },
  SALE_CREATED: {
    label: 'Vendida',
    color: '#27ae60',
    bg: 'rgba(39, 174, 96, 0.14)',
  },
  LOSS_RECORDED: {
    label: 'Perda',
    color: '#c0392b',
    bg: 'rgba(192, 57, 43, 0.12)',
  },
  SALE_CANCELLED: {
    label: 'Venda cancelada',
    color: '#6b7280',
    bg: 'rgba(107, 114, 128, 0.14)',
  },
  LOSS_CANCELLED: {
    label: 'Perda cancelada',
    color: '#6b7280',
    bg: 'rgba(107, 114, 128, 0.14)',
  },
  PHYSICAL_SAMPLE_SENT: {
    label: 'Enviada',
    color: '#e5a100',
    bg: 'rgba(229, 161, 0, 0.15)',
  },
};

/** Config neutra usada quando o backend devolve um type que o client ainda nao conhece. */
const FALLBACK_CONFIG: DashboardActivityConfig = {
  label: 'Atividade',
  color: '#6b7280',
  bg: 'rgba(107, 114, 128, 0.12)',
};

/**
 * Resolve config visual pra um event type. Retorna fallback neutro
 * cinza pra types desconhecidos — preserva a UI quando o backend
 * adiciona tipo novo antes do client conhecer.
 */
export function getEventConfig(type: DashboardRecentActivityType): DashboardActivityConfig {
  return EVENT_CONFIG[type] ?? FALLBACK_CONFIG;
}

/**
 * Container do detalhe da amostra pra onde o card de atividade leva (via
 * `?focus=`): movimentacoes (vendas/perdas/cancelamentos/envios — todos na
 * timeline de Movimentacoes) ou informacoes (registro).
 */
export function getActivityFocus(
  type: DashboardRecentActivityType
): 'movimentacoes' | 'informacoes' {
  return type === 'REGISTRATION_CONFIRMED' ? 'informacoes' : 'movimentacoes';
}

/**
 * `true` para eventos que sao o CANCELAMENTO de uma movimentacao (venda/perda)
 * — rotulos longos ("Venda cancelada"/"Perda cancelada") que pedem card mais
 * alto + pill com quebra, e o mesmo esmaecimento dos envios cancelados. O
 * cancelamento de ENVIO nao entra aqui: ele nao e um type proprio, apenas
 * esmaece o card "Enviada" via o campo `cancelled`.
 */
export function isCancellationType(type: DashboardRecentActivityType): boolean {
  return type === 'SALE_CANCELLED' || type === 'LOSS_CANCELLED';
}

/**
 * Formata o intervalo entre `iso` e `now` (ms epoch) num label
 * relativo em pt-BR ("agora", "ha N min", "ha N h", "ha N dia(s)",
 * "ha N sem", "ha N mes(es)"). Recebe `now` explicito pra que o
 * componente possa atualizar timestamps via setInterval sem
 * acoplar a `Date.now()`.
 */
export function formatRelativeTime(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 0) return 'agora';
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `ha ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `ha ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `ha ${d} ${d === 1 ? 'dia' : 'dias'}`;
  if (d < 30) {
    const w = Math.floor(d / 7);
    return `ha ${w} sem`;
  }
  const mo = Math.floor(d / 30);
  return `ha ${mo} ${mo === 1 ? 'mes' : 'meses'}`;
}
