import type { EspelhoSide, SaleContract, SaleContractStatus } from './types';

// O tipo mora em types.ts (folha da árvore de imports) e é re-exportado aqui, que é
// onde os consumidores do espelho o buscam.
export type { EspelhoSide };

// RC-D111: rótulo pt-BR do lado, em UM lugar. O ternário
// `side === 'seller' ? 'Vendedor' : 'Comprador'` estava copiado em 4 arquivos, e num
// deles rodava sobre um `side?: string` — qualquer valor inesperado, inclusive
// undefined, saía como "Comprador".
export const ESPELHO_SIDE_LABEL: Record<EspelhoSide, string> = {
  seller: 'Vendedor',
  buyer: 'Comprador',
};

export function espelhoSideLabel(side: EspelhoSide | null | undefined): string {
  return side ? (ESPELHO_SIDE_LABEL[side] ?? '—') : '—';
}

// Espelho de Corretagem: elegibilidade no FRONT. Só contratos congelados (D73/D105)
// com corretagem no lado; o cancelado que respondeu "não cobrar" no washout não emite
// espelho (RC-D89/D91 — antes era a D145, que decidia isso pelo `type`).
//
// 🔴 RC-D111: são DUAS perguntas, e confundi-las é o que fazia a Conferência mandar o
// usuário para um 409 garantido:
//   - `espelhoEligibility`     — "este contrato produz ALGUM espelho?" (o botão)
//   - `espelhoSideEligibility` — "o lado PEDIDO sai?" (o submit), a pergunta do
//     `assertEspelhoEligible`, gate por gate e na mesma ordem
const ESPELHO_ELIGIBLE_STATUSES: SaleContractStatus[] = ['EMITIDO', 'FINALIZADO', 'WASH_OUT'];

type EspelhoEligibilityInput = Pick<
  SaleContract,
  | 'status'
  | 'washoutBillable'
  | 'sellerBrokeragePct'
  | 'buyerBrokeragePct'
  | 'sellerSnapshot'
  | 'buyerSnapshot'
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

// Nome usável no snapshot congelado da parte. Espelha o `snapshotPartyName` do backend
// (mesma ordem de campos, mesmo tratamento de string em branco) — é o que decide o gate
// ESPELHO_NO_PARTY, então divergir aqui é prometer um documento que o servidor recusa.
function partyName(snap: Record<string, unknown> | null): string | null {
  if (!snap) return null;
  for (const key of ['displayName', 'legalName', 'fullName']) {
    const value = snap[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

// RC-D111: a pergunta do `assertEspelhoEligible` — os 4 gates do backend, na ordem.
// Usada pelo submit da Conferência, que antes só checava "algum lado sai" e por isso
// liberava "Gerar espelho" para um lado sem corretagem ou sem parte cadastrada.
export function espelhoSideEligibility(
  contract: EspelhoEligibilityInput,
  side: EspelhoSide
): { eligible: boolean; reason?: string } {
  if (!ESPELHO_ELIGIBLE_STATUSES.includes(contract.status)) {
    return { eligible: false, reason: 'O espelho só sai depois do contrato emitido.' };
  }
  if (contract.status === 'WASH_OUT' && contract.washoutBillable !== true) {
    return { eligible: false, reason: 'Contrato cancelado sem cobrança de corretagem.' };
  }
  if (!espelhoSides(contract).includes(side)) {
    return {
      eligible: false,
      reason: `Não há corretagem no lado ${ESPELHO_SIDE_LABEL[side].toLowerCase()} deste contrato.`,
    };
  }
  // RC-D110: sem destinatário não há cobrança. O papel sairia com o total real e
  // "CLIENTE: —".
  const snap = side === 'seller' ? contract.sellerSnapshot : contract.buyerSnapshot;
  if (!partyName(snap)) {
    return {
      eligible: false,
      reason:
        side === 'seller'
          ? 'O contrato não tem vendedor cadastrado — o espelho sairia sem destinatário.'
          : 'O contrato não tem comprador cadastrado — o espelho sairia sem destinatário.',
    };
  }
  return { eligible: true };
}
