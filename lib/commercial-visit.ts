import type { CommercialVisitOutcome, CommercialVisitReason } from './types';

// Opcoes do formulario de visita do COMERCIAL (pagina /informe) e labels
// pt-BR usados tambem nos cards do feed e no /resumo. Os values espelham os
// enums Prisma CommercialVisitReason / CommercialVisitOutcome — EXCETO os
// reasons descontinuados (ver COLLECTION abaixo): as opcoes selecionaveis
// sao um subconjunto do enum.

export interface CommercialChoiceOption<TValue extends string> {
  value: TValue;
  label: string;
}

// Labels pt-BR de TODOS os reasons, inclusive os LEGADOS nao mais
// selecionaveis (COLLECTION/"Cobrança" foi removida do formulario) — para
// que visitas ja registradas com esse motivo continuem exibindo o rotulo
// correto nos cards/resumo. Os selecionaveis ficam em
// COMMERCIAL_VISIT_REASON_OPTIONS.
const COMMERCIAL_VISIT_REASON_LABELS: Record<CommercialVisitReason, string> = {
  NEGOTIATION: 'Negociação',
  SAMPLE_DELIVERY_OR_PICKUP: 'Entrega/coleta de amostra',
  COLLECTION: 'Cobrança',
  RELATIONSHIP: 'Relacionamento',
};

// Reasons SELECIONAVEIS no formulario (subconjunto do enum — sem COLLECTION).
export const COMMERCIAL_VISIT_REASON_OPTIONS: ReadonlyArray<
  CommercialChoiceOption<CommercialVisitReason>
> = [
  { value: 'NEGOTIATION', label: COMMERCIAL_VISIT_REASON_LABELS.NEGOTIATION },
  {
    value: 'SAMPLE_DELIVERY_OR_PICKUP',
    label: COMMERCIAL_VISIT_REASON_LABELS.SAMPLE_DELIVERY_OR_PICKUP,
  },
  { value: 'RELATIONSHIP', label: COMMERCIAL_VISIT_REASON_LABELS.RELATIONSHIP },
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
  return COMMERCIAL_VISIT_REASON_LABELS[value] ?? value;
}

export function getCommercialVisitOutcomeLabel(value: CommercialVisitOutcome): string {
  const option = COMMERCIAL_VISIT_OUTCOME_OPTIONS.find((candidate) => candidate.value === value);
  return option ? option.label : value;
}
