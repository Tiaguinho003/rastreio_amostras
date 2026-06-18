'use client';

// Tipos e helpers compartilhados dos filtros de clientes. O botao/painel de
// filtro (componente ClientsFilterButton) foi REMOVIDO — a pagina /clients usa
// um filtro inline proprio (reaproveitando as classes .samples-filter-*). Aqui
// ficam so o type ClientFilters + EMPTY_CLIENT_FILTERS + countActiveClientFilters,
// ainda importados por app/clients/page.tsx.

export type ClientFilters = {
  /** id do responsavel comercial; '' = qualquer */
  commercialUserId: string;
  status: '' | 'ACTIVE' | 'INACTIVE';
  personType: '' | 'PF' | 'PJ';
  /** papel operacional; mapeado pra isBuyer/isSeller/isWarehouse no fetch */
  role: '' | 'buyer' | 'seller' | 'warehouse';
  completeness: '' | 'complete' | 'incomplete';
};

export const EMPTY_CLIENT_FILTERS: ClientFilters = {
  commercialUserId: '',
  status: '',
  personType: '',
  role: '',
  completeness: '',
};

export function countActiveClientFilters(filters: ClientFilters): number {
  let count = 0;
  if (filters.commercialUserId) count += 1;
  if (filters.status) count += 1;
  if (filters.personType) count += 1;
  if (filters.role) count += 1;
  if (filters.completeness) count += 1;
  return count;
}
