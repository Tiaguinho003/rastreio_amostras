'use client';

import type { FinanceiroReceivable } from '../../lib/types';

// Financeiro (Fase F, D128 = ADMIN-only): card de um fechamento na pagina
// "Financeiro". Recolhido = nº + valor total + corretagem total + os corretores
// com a cota de cada um (D84; rateio com resto no 1º — D129). Expandido =
// detalhe da corretagem: reparticao vendedor/comprador (% + R$) (D85).
// Esqueleto/animacao espelham o `ctr-card` (controlado: isExpanded/onToggle no pai).

const STATUS_LABEL: Record<string, string> = {
  EMITIDO: 'Emitido',
  FATURADO: 'Faturado',
  PAGO: 'Pago',
  WASH_OUT: 'Washout',
};
const STATUS_COLOR: Record<string, string> = {
  EMITIDO: '#eab308', // amarelo
  FATURADO: '#0d9488',
  PAGO: '#15803d',
  WASH_OUT: '#dc2626', // vermelho (D105: aparece no Financeiro, corretagem mantida)
};
// Texto do selo: igual à barra, exceto o Emitido (amarelo vivo sumiria no fundo
// claro → usa um amarelo escuro legível).
const STATUS_TEXT_COLOR: Record<string, string> = {
  EMITIDO: '#a16207',
  FATURADO: '#0d9488',
  PAGO: '#15803d',
  WASH_OUT: '#dc2626',
};
const STATUS_TINT: Record<string, string> = {
  EMITIDO: '#fef9c3', // amarelo claro
  FATURADO: '#ccfbf1',
  PAGO: '#dcfce7',
  WASH_OUT: '#fee2e2',
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
};

export function FinanceiroCard({ item, isExpanded, onToggle }: FinanceiroCardProps) {
  const color = STATUS_COLOR[item.status] ?? '#16a34a';
  const textColor = STATUS_TEXT_COLOR[item.status] ?? color;
  const tint = STATUS_TINT[item.status] ?? '#dcfce7';
  const label = STATUS_LABEL[item.status] ?? item.status;

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
              <span className="fin-fig-label">Pagamento</span>
              <span className="fin-fig-value">{dateBR(item.paymentDate)}</span>
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
