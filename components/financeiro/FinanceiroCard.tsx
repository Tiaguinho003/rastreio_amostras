'use client';

import type { FinanceiroReceivable } from '../../lib/types';

// Financeiro (Fase F): card de um fechamento na pagina "Financeiro". Recolhido =
// nº + valor total + corretagem (ADMIN: total; COMMERCIAL: a propria cota) +
// (ADMIN) os corretores com a cota de cada um (D84/D86). Expandido = detalhe da
// corretagem: reparticao vendedor/comprador (% + R$) (D85). Esqueleto/animacao
// espelham o `ctr-card` (controlado: isExpanded/onToggle no pai).

const STATUS_LABEL: Record<string, string> = {
  EMITIDO: 'Emitido',
  FATURADO: 'Faturado',
  PAGO: 'Pago',
};
const STATUS_COLOR: Record<string, string> = {
  EMITIDO: '#16a34a',
  FATURADO: '#0d9488',
  PAGO: '#15803d',
};
const STATUS_TINT: Record<string, string> = {
  EMITIDO: '#dcfce7',
  FATURADO: '#ccfbf1',
  PAGO: '#dcfce7',
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function money(value: number | null | undefined): string {
  return value != null ? BRL.format(value) : '—';
}

function percent(value: number | null | undefined): string {
  return value != null ? `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '—';
}

type FinanceiroCardProps = {
  item: FinanceiroReceivable;
  mode: 'admin' | 'commercial';
  isExpanded: boolean;
  onToggle: () => void;
};

export function FinanceiroCard({ item, mode, isExpanded, onToggle }: FinanceiroCardProps) {
  const isAdmin = mode === 'admin';
  const color = STATUS_COLOR[item.status] ?? '#16a34a';
  const tint = STATUS_TINT[item.status] ?? '#dcfce7';
  const label = STATUS_LABEL[item.status] ?? item.status;
  const corretagem = isAdmin ? item.commissionTotal : (item.myShare ?? 0);

  return (
    <div className={`fin-card${isExpanded ? ' is-expanded' : ''}`}>
      <button type="button" className="fin-card-head" onClick={onToggle} aria-expanded={isExpanded}>
        <span className="fin-card-bar" style={{ background: color }} aria-hidden="true" />
        <span className="fin-card-main">
          <span className="fin-card-top">
            <span className="fin-card-number">{item.contractNumber}</span>
            <span className="fin-card-status" style={{ color, background: tint }}>
              {label}
            </span>
          </span>
          <span className="fin-card-figures">
            <span className="fin-fig">
              <span className="fin-fig-label">Valor total</span>
              <span className="fin-fig-value">{money(item.totalValue)}</span>
            </span>
            <span className="fin-fig">
              <span className="fin-fig-label">{isAdmin ? 'Corretagem' : 'Sua cota'}</span>
              <span className="fin-fig-value fin-fig-strong">{money(corretagem)}</span>
            </span>
          </span>
          {isAdmin && item.brokers && item.brokers.length > 0 ? (
            <span className="fin-card-brokers">
              {item.brokers.map((b) => (
                <span key={b.brokerId} className="fin-broker">
                  <span className="fin-broker-name">{b.name}</span>
                  <span className="fin-broker-share">{money(b.share)}</span>
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
