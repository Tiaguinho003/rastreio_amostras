'use client';

import Link from 'next/link';

import type { FinanceiroReceivable } from '../../lib/types';
import { FIN_STATE_CHIP, FIN_STATE_LABEL, dueBR, money } from './financeiro-format';

// Financeiro (Revisao do Pagamento, FN1/FN3): card de um contrato na CASA DO
// PAGAMENTO — o formato do MOBILE (no desktop a mesma lista e tabela, RC-D92).
// Nº + chip de estado, comprador, as tres figuras (valor total, corretagem,
// vencimento), o split da corretagem (vendedor · comprador) e os corretores.
//
// RC-D67: LEITURA PURA. O "Pago" (FN7) morava aqui e morreu — a corretagem sai da
// fila quando o CONTRATO e finalizado, em /contratos.
//
// RC-D92: o ACORDEAO morreu. O que ele escondia era o split da corretagem, uma
// linha — um clique por card pra revelar uma linha e mais informacao escondida do
// que trabalho poupado. Com ele fora, sobra uma unica acao no card (abrir o
// contrato), e ela virou o CARD INTEIRO: o botao [Ver contrato] era a unica coisa
// clicavel de um card que ja parecia clicavel.

type FinanceiroCardProps = {
  item: FinanceiroReceivable;
  // Piscada ao chegar do evento do dashboard (?highlight=<id>).
  isHighlighted?: boolean;
};

export function FinanceiroCard({ item, isHighlighted = false }: FinanceiroCardProps) {
  return (
    <Link
      href={`/contratos?details=${item.id}`}
      className={`fin-card${isHighlighted ? ' is-highlighted' : ''}`}
      data-contract-id={item.id}
    >
      <span className={`fin-card-bar is-${item.paymentState}`} aria-hidden="true" />
      <span className="fin-card-main">
        <span className="fin-card-top">
          <span className="fin-card-number">{item.contractNumber}</span>
          <span className={`fv-chip ${FIN_STATE_CHIP[item.paymentState]}`}>
            {FIN_STATE_LABEL[item.paymentState]}
          </span>
        </span>
        <span className="fin-card-buyer">{item.buyerName ?? '—'}</span>
        <span className="fin-card-figures">
          <span className="fin-fig">
            <span className="fin-fig-label">Valor total</span>
            <span className="fin-fig-value">{money(item.totalValue)}</span>
          </span>
          <span className="fin-fig">
            <span className="fin-fig-label">Corretagem</span>
            <span className="fin-fig-value fin-fig-strong">{money(item.commissionTotal)}</span>
          </span>
          <span className="fin-fig">
            <span className="fin-fig-label">Vencimento</span>
            <span className="fin-fig-value">{dueBR(item.paymentDate)}</span>
          </span>
        </span>
        {/* O conteudo do antigo acordeao, agora sempre a vista — a mesma sublinha
            da coluna "Corretagem" da tabela. */}
        <span className="fin-card-split">
          V {money(item.sellerBrokerageValue)} · C {money(item.buyerBrokerageValue)}
        </span>
        {item.brokers.length > 0 ? (
          <span className="fin-card-brokers">
            {item.brokers.map((b) => (
              <span key={b.brokerId} className="fin-broker">
                <span className="fin-broker-name">{b.name}</span>
              </span>
            ))}
          </span>
        ) : null}
      </span>
      <svg className="fin-card-go" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  );
}
