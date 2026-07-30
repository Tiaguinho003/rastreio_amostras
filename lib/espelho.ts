import type {
  EspelhoSide,
  SaleContract,
  SaleContractStatus,
  SaleContractTimelineItem,
} from './types';

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

/** Um espelho ENTREGUE que ainda se pode reabrir: o item da timeline com `logId` e
 *  `side` já estreitados, que é o que o leitor do documento guardado exige. */
export type DeliveredEspelho = SaleContractTimelineItem & {
  logId: string;
  side: EspelhoSide;
};

// RC-D124: o espelho MAIS RECENTE de cada lado que ainda se pode abrir — é o que a aba
// Espelho mostra, um bloco por lado.
//
// 🔴 Não é "o primeiro item ESPELHO de cada lado". São três filtros, e cada um tira uma
// coisa diferente:
//   - `available`  — o snapshot existe E a retenção não venceu (RC-D105). Sem ele a aba
//     tentaria abrir um documento que o servidor já apagou (410).
//   - `superseded` — há um mais novo do MESMO lado (derivado da ordem, RC-D104). Sem ele
//     um lado que gerou duas vezes mostraria o antigo se a ordem chegasse invertida.
//   - `logId`/`side` — os marcos legados de espelho vêm sem os dois, e sem eles não há
//     como reler nem em que bloco pôr.
// Quem lista TODOS os exports, inclusive os substituídos e os já expirados, é o Histórico
// (RC-D128) — o fato auditado não expira, o documento sim.
export function latestEspelhoBySide(
  items: readonly SaleContractTimelineItem[] | null | undefined
): Partial<Record<EspelhoSide, DeliveredEspelho>> {
  const found: Partial<Record<EspelhoSide, DeliveredEspelho>> = {};
  for (const item of items ?? []) {
    if (item.kind !== 'ESPELHO') continue;
    if (!item.available || item.superseded) continue;
    if (!item.logId || !item.side) continue;
    // A timeline já vem decrescente; o primeiro de cada lado é o mais recente.
    if (!found[item.side]) found[item.side] = item as DeliveredEspelho;
  }
  return found;
}
