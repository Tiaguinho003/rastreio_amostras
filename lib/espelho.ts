import type { SaleContract, SaleContractStatus } from './types';

export type EspelhoSide = 'seller' | 'buyer';

// Espelho de Corretagem: elegibilidade no FRONT (espelha os gates do backend
// ESPELHO_*). Só contratos congelados (D73/D105) com corretagem no lado; o cancelado
// que respondeu "não cobrar" no washout não emite espelho (RC-D89/D91 — antes era a
// D145, que decidia isso pelo `type`). Fonte única usada pelo card, pelo botão do
// Detalhes e pela detecção de inelegibilidade da Conferência.
const ESPELHO_ELIGIBLE_STATUSES: SaleContractStatus[] = ['EMITIDO', 'FINALIZADO', 'WASH_OUT'];

type EspelhoEligibilityInput = Pick<
  SaleContract,
  'status' | 'washoutBillable' | 'sellerBrokeragePct' | 'buyerBrokeragePct'
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
  // `!== true` (não `=== false`): washout sem resposta gravada não cobra. Fail-closed,
  // igual ao `isWashoutNotBillable` do backend — os dois têm que concordar.
  const notBillable = contract.status === 'WASH_OUT' && contract.washoutBillable !== true;
  if (notBillable) return { eligible: false, reason: 'Cancelado sem corretagem' };
  if (!ESPELHO_ELIGIBLE_STATUSES.includes(contract.status)) {
    return { eligible: false, reason: 'Só confirmados' };
  }
  if (espelhoSides(contract).length === 0) return { eligible: false, reason: 'Sem corretagem' };
  return { eligible: true };
}
