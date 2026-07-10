'use client';

import Link from 'next/link';

import type { FinanceiroPaymentState, FinanceiroReceivable } from '../../lib/types';

// Financeiro (Revisao do Pagamento, FN1/FN3): card de um contrato na CASA DO
// PAGAMENTO. Recolhido = chip de estado (a vencer/vencido/pago/cancelado) + nº +
// comprador + vencimento (ou "pago em") + valor total + corretagem + corretores.
// Acoes: [Pago] so em FATURADO (FN7) + [Ver contrato] sempre. Expandido = detalhe da
// corretagem (vendedor/comprador, % + R$). Controlado (isExpanded/onToggle no pai).

const STATE_LABEL: Record<FinanceiroPaymentState, string> = {
  a_vencer: 'A vencer',
  vencido: 'Vencido',
  pago: 'Pago',
  cancelado: 'Cancelado',
};
// Cores = as dos dots do calendario (coerencia evento↔pagina). O texto do "a vencer"
// usa ambar escuro (o vivo sumiria no fundo claro do selo).
const STATE_COLOR: Record<FinanceiroPaymentState, string> = {
  a_vencer: '#eab308',
  vencido: '#dc2626',
  pago: '#15803d',
  cancelado: '#9ca3af',
};
const STATE_TEXT_COLOR: Record<FinanceiroPaymentState, string> = {
  a_vencer: '#a16207',
  vencido: '#dc2626',
  pago: '#15803d',
  cancelado: '#6b7280',
};
const STATE_TINT: Record<FinanceiroPaymentState, string> = {
  a_vencer: '#fef9c3',
  vencido: '#fee2e2',
  pago: '#dcfce7',
  cancelado: '#f3f4f6',
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function money(value: number | null | undefined): string {
  return value != null ? BRL.format(value) : '—';
}

// Data curta pt-BR a partir do ISO (UTC, como as colunas @db.Date do contrato).
function dateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function percent(value: number | null | undefined): string {
  return value != null ? `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '—';
}

type FinanceiroCardProps = {
  item: FinanceiroReceivable;
  isExpanded: boolean;
  onToggle: () => void;
  // FN7: o registro do pagamento (FATURADO → PAGO) mora aqui no Financeiro.
  canManage?: boolean;
  onPagar?: () => void;
};

export function FinanceiroCard({
  item,
  isExpanded,
  onToggle,
  canManage = false,
  onPagar,
}: FinanceiroCardProps) {
  const color = STATE_COLOR[item.paymentState];
  const textColor = STATE_TEXT_COLOR[item.paymentState];
  const tint = STATE_TINT[item.paymentState];
  const label = STATE_LABEL[item.paymentState];
  const isPaid = item.paymentState === 'pago';
  const canPay = item.status === 'FATURADO' && canManage && Boolean(onPagar);

  return (
    <div className={`fin-card${isExpanded ? ' is-expanded' : ''}`}>
      <button type="button" className="fin-card-head" onClick={onToggle} aria-expanded={isExpanded}>
        <span className="fin-card-bar" style={{ background: color }} aria-hidden="true" />
        <span className="fin-card-main">
          <span className="fin-card-top">
            <span className="fin-card-number">{item.contractNumber}</span>
            <span className="fin-card-status" style={{ color: textColor, background: tint }}>
              {label}
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
              <span className="fin-fig-label">{isPaid ? 'Pago em' : 'Vencimento'}</span>
              <span className="fin-fig-value">
                {dateBR(isPaid ? item.paidAt : item.paymentDate)}
              </span>
            </span>
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
        <svg className="fin-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div className="fin-card-actions">
        <Link href={`/contratos?details=${item.id}`} className="fin-btn">
          Ver contrato
        </Link>
        {canPay ? (
          <button type="button" className="fin-btn fin-btn-primary" onClick={onPagar}>
            Pago
          </button>
        ) : null}
      </div>

      <div className="fin-card-expanded" aria-hidden={!isExpanded}>
        <div className="fin-card-expanded-inner">
          <p className="fin-section-title">Detalhe da corretagem</p>
          <div className="fin-detail">
            <span className="fin-detail-row">
              <span className="fin-detail-label">Vendedor</span>
              <span className="fin-detail-value">
                {percent(item.sellerBrokeragePct)} · {money(item.sellerBrokerageValue)}
              </span>
            </span>
            <span className="fin-detail-row">
              <span className="fin-detail-label">Comprador</span>
              <span className="fin-detail-value">
                {percent(item.buyerBrokeragePct)} · {money(item.buyerBrokerageValue)}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
