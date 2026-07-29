import type { FinanceiroPaymentState } from '../../lib/types';

// Formatacao e rotulos do Financeiro, compartilhados pela TABELA do desktop
// (FinanceiroPanel) e pelo CARD do mobile (FinanceiroCard) — os dois mostram os
// mesmos numeros, e duas copias divergiriam no primeiro ajuste.

export const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function money(value: number | null | undefined): string {
  return value != null ? BRL.format(value) : '—';
}

// Data curta pt-BR a partir do ISO (UTC, como as colunas @db.Date do contrato).
export function dateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function percent(value: number | null | undefined): string {
  return value != null ? `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '—';
}

// D144: data nula e um ESTADO do contrato ("ainda nao combinada"), nao um vazio.
export function dueBR(iso: string | null | undefined): string {
  return iso ? dateBR(iso) : 'À definir';
}

export const FIN_STATE_LABEL: Record<FinanceiroPaymentState, string> = {
  a_vencer: 'A vencer',
  vencido: 'Vencido',
  recebida: 'Recebida',
  cancelado: 'Cancelado',
};

// RC-D92: o chip do estado passou a ser o `.fv-chip` do kit. Antes eram hex
// inline copiados dos dots do calendario; a coerencia evento↔pagina continua
// pela FAMILIA da cor (ambar/vermelho/verde/cinza), agora nos tokens FV.
export const FIN_STATE_CHIP: Record<FinanceiroPaymentState, string> = {
  a_vencer: 'fv-chip-amber',
  vencido: 'fv-chip-red',
  recebida: 'fv-chip-green',
  cancelado: 'fv-chip-gray',
};
