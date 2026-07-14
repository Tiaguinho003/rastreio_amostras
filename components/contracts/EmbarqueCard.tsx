'use client';

import Link from 'next/link';

import type { ShipmentReceivable, ShipmentState } from '../../lib/types';

// Embarque (EMB25): card de um contrato na worklist. Só dado NÃO-sensível — chip de
// estado + nº + comprador + data (prevista/embarcado) + sacas + armazém do vendedor.
// Ações: [Confirmar embarque] em a_embarcar/atrasado (todos não-PROSPECTOR) + [Ver
// contrato] só ADMIN/COMMERCIAL (D110). Sem preço/corretagem (a aba é aberta).

const STATE_LABEL: Record<ShipmentState, string> = {
  a_embarcar: 'A embarcar',
  atrasado: 'Atrasado',
  embarcado: 'Embarcado',
  cancelado: 'Cancelado',
};
// Cores = as dos dots do calendário (EMB10/EMB17/EMB24): azul embarque, vermelho
// atraso, azul-escuro embarcado, cinza cancelado.
const STATE_TEXT_COLOR: Record<ShipmentState, string> = {
  a_embarcar: '#1d4ed8',
  atrasado: '#dc2626',
  embarcado: '#1e40af',
  cancelado: '#6b7280',
};
const STATE_TINT: Record<ShipmentState, string> = {
  a_embarcar: '#dbeafe',
  atrasado: '#fee2e2',
  embarcado: '#e0e7ff',
  cancelado: '#f3f4f6',
};
const STATE_BAR: Record<ShipmentState, string> = {
  a_embarcar: '#2563eb',
  atrasado: '#dc2626',
  embarcado: '#1e40af',
  cancelado: '#9ca3af',
};

// Data curta pt-BR a partir do ISO (UTC, como as colunas @db.Date do contrato).
function dateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

type EmbarqueCardProps = {
  item: ShipmentReceivable;
  onConfirm?: () => void;
  canViewContract?: boolean;
  // Piscada ao chegar do evento do dashboard (?highlight=<id>).
  isHighlighted?: boolean;
};

export function EmbarqueCard({
  item,
  onConfirm,
  canViewContract = false,
  isHighlighted = false,
}: EmbarqueCardProps) {
  const isShipped = item.state === 'embarcado';
  const canConfirm =
    (item.state === 'a_embarcar' || item.state === 'atrasado') && Boolean(onConfirm);

  return (
    <div className={`emb-card${isHighlighted ? ' is-highlighted' : ''}`} data-contract-id={item.id}>
      <div className="emb-card-head">
        <span
          className="emb-card-bar"
          style={{ background: STATE_BAR[item.state] }}
          aria-hidden="true"
        />
        <div className="emb-card-main">
          <div className="emb-card-top">
            <span className="emb-card-number">{item.contractNumber}</span>
            <span
              className="emb-card-status"
              style={{ color: STATE_TEXT_COLOR[item.state], background: STATE_TINT[item.state] }}
            >
              {STATE_LABEL[item.state]}
            </span>
          </div>
          <span className="emb-card-buyer">{item.buyerName ?? '—'}</span>
          <div className="emb-card-figures">
            <span className="emb-fig">
              <span className="emb-fig-label">{isShipped ? 'Embarcado em' : 'Previsto'}</span>
              <span className="emb-fig-value">
                {isShipped
                  ? dateBR(item.shippedAt)
                  : item.invoiceDate
                    ? dateBR(item.invoiceDate)
                    : 'À definir'}
              </span>
            </span>
            <span className="emb-fig">
              <span className="emb-fig-label">Sacas</span>
              <span className="emb-fig-value">{item.quantitySacks}</span>
            </span>
            <span className="emb-fig">
              <span className="emb-fig-label">Armazém</span>
              <span className="emb-fig-value">{item.sellerWarehouse ?? '—'}</span>
            </span>
          </div>
        </div>
      </div>
      {canConfirm || canViewContract ? (
        <div className="emb-card-actions">
          {canViewContract ? (
            <Link href={`/contratos?details=${item.id}`} className="fin-btn">
              Ver contrato
            </Link>
          ) : null}
          {canConfirm ? (
            <button type="button" className="fin-btn fin-btn-primary" onClick={onConfirm}>
              Confirmar embarque
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
