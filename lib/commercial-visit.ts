import type { CommercialVisitOutcome, CommercialVisitReason } from './types';

// Opcoes do formulario de visita do COMERCIAL (pagina /informe) e labels
// pt-BR usados tambem nos cards do feed e no /resumo. Os values espelham
// os enums Prisma CommercialVisitReason / CommercialVisitOutcome.

export interface CommercialChoiceOption<TValue extends string> {
  value: TValue;
  label: string;
}

export const COMMERCIAL_VISIT_REASON_OPTIONS: ReadonlyArray<
  CommercialChoiceOption<CommercialVisitReason>
> = [
  { value: 'NEGOTIATION', label: 'Negociação' },
  { value: 'SAMPLE_DELIVERY_OR_PICKUP', label: 'Entrega/coleta de amostra' },
  { value: 'COLLECTION', label: 'Cobrança' },
  { value: 'RELATIONSHIP', label: 'Relacionamento' },
];

export const COMMERCIAL_VISIT_OUTCOME_OPTIONS: ReadonlyArray<
  CommercialChoiceOption<CommercialVisitOutcome>
> = [
  { value: 'DEAL_CLOSED', label: 'Negócio fechado' },
  { value: 'PROPOSAL_IN_PROGRESS', label: 'Proposta em andamento' },
  { value: 'NO_PROGRESS', label: 'Sem avanço' },
  { value: 'NO_INTEREST', label: 'Sem interesse' },
];

export function getCommercialVisitReasonLabel(value: CommercialVisitReason): string {
  const option = COMMERCIAL_VISIT_REASON_OPTIONS.find((candidate) => candidate.value === value);
  return option ? option.label : value;
}

export function getCommercialVisitOutcomeLabel(value: CommercialVisitOutcome): string {
  const option = COMMERCIAL_VISIT_OUTCOME_OPTIONS.find((candidate) => candidate.value === value);
  return option ? option.label : value;
}
