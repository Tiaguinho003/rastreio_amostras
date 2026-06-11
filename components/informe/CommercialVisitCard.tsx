'use client';

import { UserAvatar } from '../UserAvatar';
import {
  getCommercialVisitOutcomeLabel,
  getCommercialVisitReasonLabel,
} from '../../lib/commercial-visit';
import type { CommercialVisitSummary } from '../../lib/types';

// Card accordion da VISITA do comercial — copy-adapt do VisitReportCard
// (comentario cruzado: manter estrutura/classes rsm-* em sincronia).
// Badge de tipo "Visita" no cabecalho; detalhes: motivo, resultado (+
// observacao) e observacoes gerais.

function formatVisitDateTime(value: string): string {
  const date = new Date(value);
  const day = date.toLocaleDateString('pt-BR');
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

interface CommercialVisitCardProps {
  visit: CommercialVisitSummary;
  expanded: boolean;
  onToggle: () => void;
  /** Botao "Excluir" no detalhe expandido (admin no /resumo). */
  canDelete?: boolean;
  /** Lixeira sempre visivel no canto do card (pagina do comercial — o
      autor exclui o proprio). Irma do botao-toggle no DOM. */
  quickDelete?: boolean;
  onRequestDelete?: (visit: CommercialVisitSummary) => void;
}

export function CommercialVisitCard({
  visit,
  expanded,
  onToggle,
  canDelete = false,
  quickDelete = false,
  onRequestDelete,
}: CommercialVisitCardProps) {
  const isNewClient = visit.clientKind === 'NEW';
  const clientName = isNewClient
    ? (visit.newClient?.name ?? '—')
    : (visit.client?.displayName ?? '—');
  const clientMeta = isNewClient
    ? [visit.newClient?.city, visit.newClient?.phone].filter(Boolean).join(' · ')
    : visit.client
      ? `Código ${visit.client.code}`
      : null;

  return (
    <article
      className={`rsm-card${expanded ? ' is-expanded' : ''}${quickDelete ? ' has-quick-delete' : ''}`}
    >
      {quickDelete && onRequestDelete ? (
        <button
          type="button"
          className="rsm-card-quick-delete"
          aria-label="Excluir visita"
          onClick={() => onRequestDelete(visit)}
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      ) : null}
      <button type="button" className="rsm-card-toggle" aria-expanded={expanded} onClick={onToggle}>
        <header className="rsm-card-head">
          <UserAvatar
            size="sm"
            user={{
              fullName: visit.user?.fullName ?? visit.user?.username ?? '—',
              username: visit.user?.username ?? '—',
            }}
          />
          <div className="rsm-card-head-text">
            <p className="rsm-card-user">
              {visit.user?.fullName ?? visit.user?.username ?? 'Usuário'}
            </p>
            <p className="rsm-card-when">{formatVisitDateTime(visit.createdAt)}</p>
          </div>
          <span className="rsm-type-badge is-visit">Visita</span>
        </header>

        <div className="rsm-card-client">
          <span className={`rsm-client-icon${isNewClient ? ' is-new' : ''}`} aria-hidden="true">
            {isNewClient ? (
              <svg viewBox="0 0 24 24" focusable="false">
                <circle cx="10" cy="8" r="4" />
                <path d="M3 21c0-3.9 3.1-7 7-7 1.2 0 2.4 0.3 3.4 0.9" />
                <path d="M18 14v6" />
                <path d="M15 17h6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" focusable="false">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
              </svg>
            )}
          </span>
          <div className="rsm-card-client-text">
            <p className="rsm-client-name">
              {clientName}
              {isNewClient ? <span className="rsm-client-tag">Cliente novo</span> : null}
            </p>
            {clientMeta ? <p className="rsm-client-meta">{clientMeta}</p> : null}
          </div>
          <span className="rsm-card-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </div>
      </button>

      <div className="rsm-card-details">
        <div className="rsm-card-details-inner">
          <dl className="rsm-answers">
            <div className="rsm-answer">
              <dt>Motivo da visita</dt>
              <dd>{getCommercialVisitReasonLabel(visit.reason)}</dd>
            </div>
            <div className="rsm-answer">
              <dt>Resultado da negociação</dt>
              <dd>{getCommercialVisitOutcomeLabel(visit.outcome)}</dd>
              {visit.outcomeNotes ? (
                <dd className="rsm-answer-notes">“{visit.outcomeNotes}”</dd>
              ) : null}
            </div>
            {visit.generalNotes !== null ? (
              <div className="rsm-answer">
                <dt>Observações gerais</dt>
                <dd>{visit.generalNotes}</dd>
              </div>
            ) : null}
          </dl>

          {canDelete ? (
            <button
              type="button"
              className="rsm-delete-btn"
              tabIndex={expanded ? undefined : -1}
              onClick={(event) => {
                event.stopPropagation();
                onRequestDelete?.(visit);
              }}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
              Excluir visita
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
