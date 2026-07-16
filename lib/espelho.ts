import type { SaleContract, SaleContractStatus } from './types';

export type EspelhoSide = 'seller' | 'buyer';

// Espelho de Corretagem: elegibilidade no FRONT (espelha os gates do backend
// ESPELHO_*). Só contratos congelados (D73/D105) com corretagem no lado; o à-vista
// cancelado por washout não cobra (D145). Fonte única usada pelo card, pelo botão do
// Detalhes e pela detecção de inelegibilidade da Conferência.
const ESPELHO_ELIGIBLE_STATUSES: SaleContractStatus[] = ['EMITIDO', 'FATURADO', 'PAGO', 'WASH_OUT'];

type EspelhoEligibilityInput = Pick<
  SaleContract,
  'status' | 'type' | 'sellerBrokeragePct' | 'buyerBrokeragePct'
>;

// Lados com corretagem > 0 (o espelho é direcionado a quem paga corretagem).
export function espelhoSides(contract: EspelhoEligibilityInput): EspelhoSide[] {
  const sides: EspelhoSide[] = [];
  if ((contract.sellerBrokeragePct ?? 0) > 0) sides.push('seller');
  if ((contract.buyerBrokeragePct ?? 0) > 0) sides.push('buyer');
  return sides;
}

export function espelhoEligibility(contract: EspelhoEligibilityInput): {
  eligible: boolean;
  reason?: string;
} {
  const isSpotWashout = contract.status === 'WASH_OUT' && contract.type === 'MERCADO_A_VISTA';
  if (isSpotWashout) return { eligible: false, reason: 'À vista cancelado' };
  if (!ESPELHO_ELIGIBLE_STATUSES.includes(contract.status)) {
    return { eligible: false, reason: 'Só confirmados' };
  }
  if (espelhoSides(contract).length === 0) return { eligible: false, reason: 'Sem corretagem' };
  return { eligible: true };
}
