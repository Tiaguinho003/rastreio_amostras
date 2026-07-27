import type { VisitFarmSize, VisitInterestLevel } from './types';

// Opcoes do formulario de VISITA (pagina /relatorios + sheet do dashboard do
// prospector — o mesmo formulario) e os labels pt-BR usados no card do feed.
// Os values espelham os enums Prisma VisitFarmSize / VisitInterestLevel.

export interface VisitChoiceOption<TValue extends string> {
  value: TValue;
  label: string;
  description: string;
}

export const VISIT_FARM_SIZE_OPTIONS: ReadonlyArray<VisitChoiceOption<VisitFarmSize>> = [
  { value: 'SMALL', label: 'Pequeno', description: 'Até 20 hectares' },
  { value: 'MEDIUM', label: 'Médio', description: '20 a 100 hectares' },
  { value: 'LARGE', label: 'Grande', description: 'Acima de 100 hectares' },
];

export const VISIT_INTEREST_OPTIONS: ReadonlyArray<VisitChoiceOption<VisitInterestLevel>> = [
  { value: 'NONE', label: 'Sem interesse', description: 'Não pretende comercializar' },
  { value: 'LOW', label: 'Baixo', description: 'Só conhecendo' },
  { value: 'MEDIUM', label: 'Médio', description: 'Aberto a propostas' },
  { value: 'HIGH', label: 'Alto', description: 'Quer negociar' },
];

export function getVisitFarmSizeLabel(value: VisitFarmSize): string {
  const option = VISIT_FARM_SIZE_OPTIONS.find((candidate) => candidate.value === value);
  return option ? `${option.label} · ${option.description.toLowerCase()}` : value;
}

// Label com contexto ("Baixo · só conhecendo") — o card do feed usa este. NONE
// fica so com o label; a descricao seria redundante. _(A variante curta,
// `getVisitInterestLabel`, saiu em 2026-07-27: era do card do prospector, que a
// unificacao de 2026-07-15 fundiu no card unico.)_
export function getVisitInterestDetailLabel(value: VisitInterestLevel): string {
  const option = VISIT_INTEREST_OPTIONS.find((candidate) => candidate.value === value);
  if (!option) {
    return value;
  }

  return option.value === 'NONE'
    ? option.label
    : `${option.label} · ${option.description.toLowerCase()}`;
}
