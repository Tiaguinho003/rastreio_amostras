'use client';

// Tipos e helpers dos filtros da pagina /contratos. Espelha
// components/clients/ClientsFilterButton.tsx: aqui ficam so os tipos + os helpers;
// o JSX do painel mora no ContratosPanel, no kit .fv-filter-sheet.
// RC-F6: a filtragem e do SERVIDOR — estes valores viram querystring do
// listSaleContracts, nao mais um `visible` useMemo sobre o array baixado.

import type {
  ClientSummary,
  ContractPeriodBase,
  SaleContractStatus,
  SaleContractType,
} from '../../lib/types';

export type { ContractPeriodBase };

// RC-F6: os multi guardam o CODIGO, nao o rotulo PT. Antes eram `statusLabels`/
// `typeLabels` porque a filtragem era em memoria e o mapa rotulo->codigo vivia
// aqui; agora estes valores viram querystring direto.
export type ContractFilters = {
  statuses: SaleContractStatus[];
  types: SaleContractType[];
  /** qual data ancora o filtro de periodo. */
  periodBase: ContractPeriodBase;
  periodFrom: string; // 'YYYY-MM-DD' ('' = sem limite inferior)
  periodTo: string; // 'YYYY-MM-DD' ('' = sem limite superior)
  buyerClient: ClientSummary | null;
  sellerClient: ClientSummary | null;
};

export const EMPTY_CONTRACT_FILTERS: ContractFilters = {
  statuses: [],
  types: [],
  periodBase: 'contract',
  periodFrom: '',
  periodTo: '',
  buyerClient: null,
  sellerClient: null,
};

// Situacao: codigo + rotulo PT. A ordem define a ordem das opcoes no painel.
// RC-D62: tres situacoes. "Em andamento" e o EMITIDO — quem quiser so a fila de
// trabalho filtra por ela (RC-D68: o finalizado FICA na lista por padrao).
export const STATUS_LABELS: { label: string; value: SaleContractStatus }[] = [
  { label: 'Em andamento', value: 'EMITIDO' },
  { label: 'Finalizado', value: 'FINALIZADO' },
  { label: 'Cancelado', value: 'WASH_OUT' },
];

// Tipo: codigo + rotulo PT.
export const TYPE_LABELS: { label: string; value: SaleContractType }[] = [
  { label: 'À vista', value: 'MERCADO_A_VISTA' },
  { label: 'Futuro', value: 'FUTURO' },
];

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
  if (f.statuses.length) count += 1;
  if (f.types.length) count += 1;
  if (f.periodFrom || f.periodTo) count += 1;
  if (f.buyerClient) count += 1;
  if (f.sellerClient) count += 1;
  return count;
}
