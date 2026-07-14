'use client';

import Link from 'next/link';

import type { ApprovalReceivable, ApprovalState } from '../../lib/types';

// Aprovação (AP26): card de um contrato na worklist. Só dado NÃO-sensível — chip de
// estado (+ "·N×" na enviada, AP24) + nº + comprador + data + sacas. Ações: [Gerar]
// em contrato EMITIDO (a enviar, ou enviada = reenvio) — todos os não-PROSPECTOR — +
// [Ver contrato] só ADMIN/COMMERCIAL (D110). Reusa o layout .emb-card (mesma linha da
// worklist do Embarque); a cor do chip é inline (por estado).

const STATE_LABEL: Record<ApprovalState, string> = {
  a_enviar: 'A enviar',
  enviada: 'Enviada',
  cancelado: 'Cancelado',
};
// Cores: a enviar = laranja (#f97316, a mesma do dot do lembrete no dashboard, AP15);
// enviada = verde (feito dentro do sistema); cancelado = cinza.
const STATE_TEXT_COLOR: Record<ApprovalState, string> = {
  a_enviar: '#c2410c',
  enviada: '#15803d',
  cancelado: '#6b7280',
};
const STATE_TINT: Record<ApprovalState, string> = {
  a_enviar: '#ffedd5',
  enviada: '#dcfce7',
  cancelado: '#f3f4f6',
};
const STATE_BAR: Record<ApprovalState, string> = {
  a_enviar: '#f97316',
  enviada: '#16a34a',
  cancelado: '#9ca3af',
};

// Data curta pt-BR. As colunas @db.Date (previsto/cancelado = invoiceDate) são UTC;
// a data de ENVIO (enviada = lastSendAt) é um instante timestamptz → formata em BRT
// pra não deslocar o dia perto da meia-noite (evita off-by-one no fim da noite).
function dateBR(iso: string | null | undefined, timeZone = 'UTC'): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone });
}

type AprovacaoCardProps = {
  item: ApprovalReceivable;
  onGerar?: () => void;
  canViewContract?: boolean;
  // Piscada ao chegar do evento do dashboard (?highlight=<id>).
  isHighlighted?: boolean;
};

export function AprovacaoCard({
  item,
  onGerar,
  canViewContract = false,
  isHighlighted = false,
}: AprovacaoCardProps) {
  const isSent = item.state === 'enviada';
  // AP24: "Enviada · N×" só quando houve mais de um envio (destaca o caso interessante
  // — possível recusa — sem poluir o comum de 1 envio).
  const chipLabel =
    isSent && item.sendCount > 1
      ? `${STATE_LABEL.enviada} · ${item.sendCount}×`
      : STATE_LABEL[item.state];
  // [Gerar] só em EMITIDO (a enviar; ou enviada ainda EMITIDO = reenvio). Faturado/
  // pago/cancelado não geram (elegibilidade EMITIDO-only, AP21).
  const canGerar = item.status === 'EMITIDO' && Boolean(onGerar);

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
              {chipLabel}
            </span>
          </div>
          <span className="emb-card-buyer">{item.buyerName ?? '—'}</span>
          <div className="emb-card-figures">
            <span className="emb-fig">
              <span className="emb-fig-label">{isSent ? 'Enviada em' : 'Previsto'}</span>
              <span className="emb-fig-value">
                {isSent
                  ? dateBR(item.date, 'America/Sao_Paulo')
                  : item.date
                    ? `~${dateBR(item.date)}`
                    : 'À definir'}
              </span>
            </span>
            <span className="emb-fig">
              <span className="emb-fig-label">Sacas</span>
              <span className="emb-fig-value">{item.quantitySacks}</span>
            </span>
          </div>
        </div>
      </div>
      {canGerar || canViewContract ? (
        <div className="emb-card-actions">
          {canViewContract ? (
            <Link href={`/contratos?details=${item.id}`} className="fin-btn">
              Ver contrato
            </Link>
          ) : null}
          {canGerar ? (
            <button type="button" className="fin-btn fin-btn-primary" onClick={onGerar}>
              Gerar
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
