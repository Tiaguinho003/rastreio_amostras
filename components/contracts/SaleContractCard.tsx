'use client';

import type { SaleContract, SaleContractStatus } from '../../lib/types';

// Fechamento (Fase B.3): card de um contrato na pagina "Contratos". As acoes
// dependem do status (maquina do Passo 2). Nomes das partes vem do snapshot.

const STATUS_META: Record<SaleContractStatus, { label: string; variant: string }> = {
  EM_ABERTO: { label: 'Em aberto', variant: 'status-badge-neutral' },
  CONFERIR: { label: 'Conferir', variant: 'status-badge-warning' },
  CONFIRMADO: { label: 'Confirmado', variant: 'status-badge-success' },
  FATURADO: { label: 'Faturado', variant: 'status-badge-muted' },
  PAGO: { label: 'Pago', variant: 'status-badge-muted' },
  WASH_OUT: { label: 'Quebrado', variant: 'status-badge-danger' },
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

type SaleContractCardProps = {
  contract: SaleContract;
  onGerar: () => void;
  onRevisar: () => void;
  onEditar: () => void;
  onConfirmar: () => void;
  onVer: () => void;
};

export function SaleContractCard({
  contract,
  onGerar,
  onRevisar,
  onEditar,
  onConfirmar,
  onVer,
}: SaleContractCardProps) {
  const meta = STATUS_META[contract.status];
  const isTerminalView =
    contract.status === 'CONFIRMADO' ||
    contract.status === 'WASH_OUT' ||
    contract.status === 'FATURADO' ||
    contract.status === 'PAGO';

  return (
    <div className="ctr-card">
      <div className="ctr-card-head">
        <span className="ctr-card-number">{contract.contractNumber}</span>
        <span className={`status-badge ${meta.variant}`}>{meta.label}</span>
      </div>

      <div className="ctr-card-parties">
        <span className="ctr-card-party">{snapshotName(contract.sellerSnapshot)}</span>
        <svg className="ctr-card-arrow" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        <span className="ctr-card-party">{snapshotName(contract.buyerSnapshot)}</span>
      </div>

      <div className="ctr-card-meta">
        <span>{contract.quantitySacks} sc</span>
        <span>{contract.totalValue != null ? BRL.format(contract.totalValue) : '—'}</span>
        <span>{formatContractDate(contract.contractDate)}</span>
      </div>

      {contract.status === 'WASH_OUT' && contract.washoutReason ? (
        <p className="ctr-card-washout">Quebra: {contract.washoutReason}</p>
      ) : null}

      <div className="ctr-card-actions">
        {contract.status === 'EM_ABERTO' ? (
          <button type="button" className="ctr-btn ctr-btn-primary" onClick={onGerar}>
            Gerar documento
          </button>
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
        {isTerminalView ? (
          <button type="button" className="ctr-btn" onClick={onVer}>
            Ver
          </button>
        ) : null}
      </div>
    </div>
  );
}
