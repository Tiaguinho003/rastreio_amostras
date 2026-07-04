'use client';

// Tipos e helpers dos filtros da pagina /contratos (modal de filtros avancados).
// Espelha components/clients/ClientsFilterButton.tsx: aqui ficam so os tipos + os
// helpers; o JSX do modal mora na page (app/contratos/page.tsx), reusando as
// classes .samples-filter-*. Filtragem 100% client-side (o `visible` useMemo).

import type { ClientSummary, SaleContractStatus, SaleContractType } from '../../lib/types';

export type ContractPeriodBase = 'contract' | 'invoice' | 'payment';

export type ContractFilters = {
  /** rotulos PT dos status selecionados (multi); mapeados p/ SaleContractStatus. */
  statusLabels: string[];
  /** rotulos PT dos tipos selecionados (multi): 'À vista' | 'Futuro'. */
  typeLabels: string[];
  /** qual data ancora o filtro de periodo. */
  periodBase: ContractPeriodBase;
  periodFrom: string; // 'YYYY-MM-DD' ('' = sem limite inferior)
  periodTo: string; // 'YYYY-MM-DD' ('' = sem limite superior)
  buyerClient: ClientSummary | null;
  sellerClient: ClientSummary | null;
};

export const EMPTY_CONTRACT_FILTERS: ContractFilters = {
  statusLabels: [],
  typeLabels: [],
  periodBase: 'contract',
  periodFrom: '',
  periodTo: '',
  buyerClient: null,
  sellerClient: null,
};

// Status: rotulo PT <-> codigo. A ordem define a ordem dos chips no modal.
export const STATUS_LABELS: { label: string; value: SaleContractStatus }[] = [
  { label: 'Emitido', value: 'EMITIDO' },
  { label: 'Faturado', value: 'FATURADO' },
  { label: 'Pago', value: 'PAGO' },
  { label: 'Washout', value: 'WASH_OUT' },
];
export const LABEL_TO_STATUS: Record<string, SaleContractStatus> = Object.fromEntries(
  STATUS_LABELS.map((s) => [s.label, s.value])
);

// Tipo: rotulo PT <-> codigo.
export const TYPE_LABELS: { label: string; value: SaleContractType }[] = [
  { label: 'À vista', value: 'MERCADO_A_VISTA' },
  { label: 'Futuro', value: 'FUTURO' },
];
export const LABEL_TO_TYPE: Record<string, SaleContractType> = Object.fromEntries(
  TYPE_LABELS.map((t) => [t.label, t.value])
);

// Base do periodo: valor <-> rotulo do <select>.
export const PERIOD_BASE_LABELS: { value: ContractPeriodBase; label: string }[] = [
  { value: 'contract', label: 'Data do contrato' },
  { value: 'invoice', label: 'Data de faturamento' },
  { value: 'payment', label: 'Data de pagamento' },
];

// Conta 1 por GRUPO preenchido (nao por valor). A base sozinha nao conta —
// so quando ha `from` ou `to`.
export function countActiveContractFilters(f: ContractFilters): number {
  let count = 0;
  if (f.statusLabels.length) count += 1;
  if (f.typeLabels.length) count += 1;
  if (f.periodFrom || f.periodTo) count += 1;
  if (f.buyerClient) count += 1;
  if (f.sellerClient) count += 1;
  return count;
}
