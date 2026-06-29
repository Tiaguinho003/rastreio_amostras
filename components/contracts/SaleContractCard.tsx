'use client';

import type { SaleContract, SaleContractStatus, SaleContractType } from '../../lib/types';

// Fechamento (Fase B.3): card de um contrato na pagina "Contratos". Versao
// recolhida (basico) + expandida (dropdown estilo Lotes): barra colorida por
// status na lateral + acoes e detalhes ao expandir. As acoes dependem do status
// (maquina do Passo 2). Nomes das partes vem do snapshot.

const STATUS_META: Record<SaleContractStatus, { label: string; variant: string }> = {
  EM_ABERTO: { label: 'Em aberto', variant: 'status-badge-neutral' },
  CONFERIR: { label: 'Conferir', variant: 'status-badge-warning' },
  CONFIRMADO: { label: 'Confirmado', variant: 'status-badge-success' },
  FATURADO: { label: 'Faturado', variant: 'status-badge-muted' },
  PAGO: { label: 'Pago', variant: 'status-badge-muted' },
  WASH_OUT: { label: 'Quebrado', variant: 'status-badge-danger' },
};

// Cor da barra lateral por status (decisao: distintas por status).
const STATUS_BAR_COLOR: Record<SaleContractStatus, string> = {
  EM_ABERTO: '#3b82f6', // azul
  CONFERIR: '#eab308', // amarelo
  CONFIRMADO: '#16a34a', // verde
  FATURADO: '#0d9488', // azul-petroleo (teal)
  PAGO: '#15803d', // verde-escuro
  WASH_OUT: '#dc2626', // vermelho
};

// Fundo (tint claro) do selo de status — combina com a cor do texto/barra.
const STATUS_TINT: Record<SaleContractStatus, string> = {
  EM_ABERTO: '#dbeafe',
  CONFERIR: '#fef9c3',
  CONFIRMADO: '#dcfce7',
  FATURADO: '#ccfbf1',
  PAGO: '#dcfce7',
  WASH_OUT: '#fee2e2',
};

const TYPE_LABEL: Record<SaleContractType, string> = {
  MERCADO_A_VISTA: 'À vista',
  FUTURO: 'Futuro',
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function snapshotName(snap: Record<string, unknown> | null): string {
  if (!snap) return '—';
  const value = (snap.displayName ?? snap.legalName ?? snap.fullName) as string | undefined;
  return value && value.trim() ? value : '—';
}

function formatContractDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function money(value: number | null): string {
  return value != null ? BRL.format(value) : '—';
}

type SaleContractCardProps = {
  contract: SaleContract;
  isExpanded: boolean;
  onToggle: () => void;
  onGerar: () => void;
  onCancelar: () => void;
  onRevisar: () => void;
  onEditar: () => void;
  onConfirmar: () => void;
  onFaturar: () => void;
  onPagar: () => void;
  onReverter: () => void;
  onQuebrar: () => void;
  onVer: () => void;
  onBaixarPdf: () => void;
};

export function SaleContractCard({
  contract,
  isExpanded,
  onToggle,
  onGerar,
  onCancelar,
  onRevisar,
  onEditar,
  onConfirmar,
  onFaturar,
  onPagar,
  onReverter,
  onQuebrar,
  onVer,
  onBaixarPdf,
}: SaleContractCardProps) {
  const meta = STATUS_META[contract.status];
  const isTerminalView =
    contract.status === 'CONFIRMADO' ||
    contract.status === 'WASH_OUT' ||
    contract.status === 'FATURADO' ||
    contract.status === 'PAGO';

  return (
    <div className={`ctr-card${isExpanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="ctr-card-head-btn"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <span
          className="ctr-card-bar"
          style={{ background: STATUS_BAR_COLOR[contract.status] }}
          aria-hidden="true"
        />
        <span className="ctr-card-head-main">
          <span className="ctr-card-top">
            <span className="ctr-card-number">{contract.contractNumber}</span>
            <span
              className="ctr-card-status"
              style={{
                color: STATUS_BAR_COLOR[contract.status],
                background: STATUS_TINT[contract.status],
              }}
            >
              {meta.label}
            </span>
          </span>
          <span className="ctr-card-parties">
            <span className="ctr-card-party">{snapshotName(contract.sellerSnapshot)}</span>
            <svg className="ctr-card-arrow" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <span className="ctr-card-party">{snapshotName(contract.buyerSnapshot)}</span>
          </span>
        </span>
        <span className="ctr-card-head-right">
          <span className="ctr-card-type">{TYPE_LABEL[contract.type] ?? contract.type}</span>
          <svg className="ctr-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      <div className="ctr-card-expanded" aria-hidden={!isExpanded}>
        <div className="ctr-card-expanded-inner">
          <div className="ctr-card-essential">
            <span className="ctr-card-stat">
              <span className="ctr-card-stat-label">Sacas</span>
              <span className="ctr-card-stat-value">{contract.quantitySacks} sc</span>
            </span>
            <span className="ctr-card-stat">
              <span className="ctr-card-stat-label">Data</span>
              <span className="ctr-card-stat-value">
                {formatContractDate(contract.contractDate)}
              </span>
            </span>
            <span className="ctr-card-stat">
              <span className="ctr-card-stat-label">Total</span>
              <span className="ctr-card-stat-value">{money(contract.totalValue)}</span>
            </span>
            <span className="ctr-card-stat">
              <span className="ctr-card-stat-label">Preço/saca</span>
              <span className="ctr-card-stat-value">{money(contract.unitPrice)}</span>
            </span>
            <span className="ctr-card-stat">
              <span className="ctr-card-stat-label">Faturamento</span>
              <span className="ctr-card-stat-value">
                {formatContractDate(contract.invoiceDate)}
              </span>
            </span>
            <span className="ctr-card-stat">
              <span className="ctr-card-stat-label">Pagamento</span>
              <span className="ctr-card-stat-value">
                {formatContractDate(contract.paymentDate)}
              </span>
            </span>
          </div>

          {contract.status === 'WASH_OUT' && contract.washoutReason ? (
            <p className="ctr-card-washout">Quebra: {contract.washoutReason}</p>
          ) : null}

          <div className="ctr-card-actions">
            {contract.status === 'EM_ABERTO' ? (
              <>
                <button type="button" className="ctr-btn ctr-btn-primary" onClick={onGerar}>
                  Emitir
                </button>
                <button type="button" className="ctr-btn ctr-btn-danger" onClick={onCancelar}>
                  Cancelar
                </button>
              </>
            ) : null}
            {contract.status === 'CONFERIR' ? (
              <>
                <button type="button" className="ctr-btn" onClick={onRevisar}>
                  Revisar
                </button>
                <button type="button" className="ctr-btn" onClick={onEditar}>
                  Editar
                </button>
                <button type="button" className="ctr-btn ctr-btn-primary" onClick={onConfirmar}>
                  Confirmar
                </button>
              </>
            ) : null}
            {contract.status === 'CONFIRMADO' ? (
              <>
                <button type="button" className="ctr-btn ctr-btn-primary" onClick={onFaturar}>
                  Faturar
                </button>
                <button type="button" className="ctr-btn" onClick={onPagar}>
                  Pagar
                </button>
              </>
            ) : null}
            {contract.status === 'FATURADO' ? (
              <>
                <button type="button" className="ctr-btn ctr-btn-primary" onClick={onPagar}>
                  Pagar
                </button>
                <button type="button" className="ctr-btn" onClick={onReverter}>
                  Desfazer faturamento
                </button>
              </>
            ) : null}
            {contract.status === 'PAGO' ? (
              <button type="button" className="ctr-btn" onClick={onReverter}>
                Desfazer pagamento
              </button>
            ) : null}
            {isTerminalView ? (
              <button type="button" className="ctr-btn" onClick={onVer}>
                Ver
              </button>
            ) : null}
            {contract.status !== 'EM_ABERTO' ? (
              <button type="button" className="ctr-btn" onClick={onBaixarPdf}>
                Baixar PDF
              </button>
            ) : null}
            {contract.status === 'CONFERIR' ||
            contract.status === 'CONFIRMADO' ||
            contract.status === 'FATURADO' ||
            contract.status === 'PAGO' ? (
              <button type="button" className="ctr-btn ctr-btn-danger" onClick={onQuebrar}>
                Quebrar
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
