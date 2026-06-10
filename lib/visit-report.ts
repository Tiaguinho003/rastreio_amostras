import type { VisitFarmSize, VisitInterestLevel } from './types';

// Opcoes do formulario de visita (pagina /informe) e labels pt-BR usados
// tambem na listagem admin (/resumo). Os values espelham os enums Prisma
// VisitFarmSize / VisitInterestLevel.

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

export function getVisitInterestLabel(value: VisitInterestLevel): string {
  const option = VISIT_INTEREST_OPTIONS.find((candidate) => candidate.value === value);
  return option ? option.label : value;
}

// Versao com contexto pro /resumo ("Baixo · só conhecendo"). NONE fica so
// com o label — a descricao seria redundante.
export function getVisitInterestDetailLabel(value: VisitInterestLevel): string {
  const option = VISIT_INTEREST_OPTIONS.find((candidate) => candidate.value === value);
  if (!option) {
    return value;
  }

  return option.value === 'NONE'
    ? option.label
    : `${option.label} · ${option.description.toLowerCase()}`;
}
