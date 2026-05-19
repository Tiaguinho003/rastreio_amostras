// Liga B1.1 (Liga F1.B): mapeamento dos motivos de inelegibilidade pra
// participar de uma liga em labels pt-BR. Backend é dono da regra de
// elegibilidade (eligibility.reason) — frontend só traduz.
//
// Reasons retornados pelo backend (GET /samples?eligibleForBlend=true):
// - INVALIDATED: sample.status === 'INVALIDATED'
// - NO_BALANCE: availableSacks === 0
// - null: elegível
//
// F1.4 relaxada em 2026-05-19: amostras REGISTRATION_CONFIRMED também
// são elegíveis (antes só CLASSIFIED). Reason 'NOT_CLASSIFIED' removida.
//
// Usado por:
// - B1.4: tooltip no card inelegível + toast quando selecionado vira inel
// - B2/B3: warnings em forms e detalhe

import type { SampleEligibilityReason } from '../types';

const LABEL_BY_REASON: Record<NonNullable<SampleEligibilityReason>, string> = {
  INVALIDATED: 'Amostra inválida',
  NO_BALANCE: 'Sem saldo disponível',
};

export function mapEligibilityReasonToLabel(reason: SampleEligibilityReason): string | null {
  if (reason === null || reason === undefined) {
    return null;
  }
  return LABEL_BY_REASON[reason] ?? null;
}
