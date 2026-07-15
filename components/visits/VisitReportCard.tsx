'use client';

import { UserAvatar } from '../UserAvatar';
import type { VisitReportSummary } from '../../lib/types';
import { getVisitFarmSizeLabel, getVisitInterestDetailLabel } from '../../lib/visit-report';
import {
  getCommercialVisitOutcomeLabel,
  getCommercialVisitReasonLabel,
} from '../../lib/commercial-visit';

// Card accordion de uma VISITA (unificada: prospector + comercial — 2026-07-15).
// Colapsado mostra autor + data + cliente; expandido revela SOMENTE as respostas
// presentes (todos os campos de dominio sao opcionais). A visita nasce vinculada
// a um cliente real. cancelledAt != null => visita CANCELADA (marcada, fica no
// historico). `canDelete`/`quickDelete` mostram "Cancelar" (soft) — so o autor.

function formatVisitDateTime(value: string): string {
  const date = new Date(value);
  const day = date.toLocaleDateString('pt-BR');
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

interface VisitReportCardProps {
  report: VisitReportSummary;
  expanded: boolean;
  onToggle: () => void;
  /** Mostra "Cancelar visita" no detalhe expandido. So o proprio autor cancela. */
  canDelete?: boolean;
  /** Lixeira sempre visivel no canto do card (dashboard do prospector). */
  quickDelete?: boolean;
  /** Etiqueta de tipo opcional no cabecalho. */
  typeBadge?: string;
  onRequestDelete?: (report: VisitReportSummary) => void;
}

export function VisitReportCard({
  report,
  expanded,
  onToggle,
  canDelete = false,
  quickDelete = false,
  typeBadge,
  onRequestDelete,
}: VisitReportCardProps) {
  const isNewClient = report.clientKind === 'NEW';
  const isCancelled = report.cancelledAt !== null;
  // Vinculado mostra o nome canonico do cadastro; o anotado e fallback.
  const clientName = report.client?.displayName ?? report.newClient?.name ?? '—';

  return (
    <article
      className={`rsm-card${expanded ? ' is-expanded' : ''}${
        quickDelete ? ' has-quick-delete' : ''
      }${isCancelled ? ' is-cancelled' : ''}`}
    >
      {quickDelete && onRequestDelete && !isCancelled ? (
        <button
          type="button"
          className="rsm-card-quick-delete"
          aria-label="Cancelar visita"
          onClick={() => onRequestDelete(report)}
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
              fullName: report.user?.fullName ?? report.user?.username ?? '—',
              username: report.user?.username ?? '—',
            }}
          />
          <div className="rsm-card-head-text">
            <p className="rsm-card-user">
              {report.user?.fullName ?? report.user?.username ?? 'Usuário'}
            </p>
            <p className="rsm-card-when">{formatVisitDateTime(report.createdAt)}</p>
          </div>
          {isCancelled ? (
            <span className="rsm-type-badge is-cancelled">Cancelado</span>
          ) : typeBadge ? (
            <span className="rsm-type-badge is-prospect">{typeBadge}</span>
          ) : null}
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
            {report.client ? <p className="rsm-client-meta">Código {report.client.code}</p> : null}
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
            {report.newClient?.city ? (
              <div className="rsm-answer">
                <dt>Cidade/região</dt>
                <dd>{report.newClient.city}</dd>
              </div>
            ) : null}
            {report.newClient?.phone ? (
              <div className="rsm-answer">
                <dt>Telefone</dt>
                <dd>{report.newClient.phone}</dd>
              </div>
            ) : null}
            {report.reason ? (
              <div className="rsm-answer">
                <dt>Motivo da visita</dt>
                <dd>{getCommercialVisitReasonLabel(report.reason)}</dd>
                {report.reasonNotes ? (
                  <dd className="rsm-answer-notes">“{report.reasonNotes}”</dd>
                ) : null}
              </div>
            ) : null}
            {report.outcome ? (
              <div className="rsm-answer">
                <dt>Resultado</dt>
                <dd>{getCommercialVisitOutcomeLabel(report.outcome)}</dd>
                {report.outcomeNotes ? (
                  <dd className="rsm-answer-notes">“{report.outcomeNotes}”</dd>
                ) : null}
              </div>
            ) : null}
            {report.farmSize ? (
              <div className="rsm-answer">
                <dt>Tamanho da fazenda</dt>
                <dd>{getVisitFarmSizeLabel(report.farmSize)}</dd>
                {report.farmSizeNotes ? (
                  <dd className="rsm-answer-notes">“{report.farmSizeNotes}”</dd>
                ) : null}
              </div>
            ) : null}
            {report.interestLevel ? (
              <div className="rsm-answer">
                <dt>Interesse em comercializar</dt>
                <dd>{getVisitInterestDetailLabel(report.interestLevel)}</dd>
                {report.interestNotes ? (
                  <dd className="rsm-answer-notes">“{report.interestNotes}”</dd>
                ) : null}
              </div>
            ) : null}
            {report.sellsCurrently !== null ? (
              <div className="rsm-answer">
                <dt>Já comercializa</dt>
                <dd>
                  {report.sellsCurrently
                    ? report.sellsToWhom
                      ? `Sim — ${report.sellsToWhom}`
                      : 'Sim'
                    : 'Não'}
                </dd>
              </div>
            ) : null}
            {report.generalNotes !== null ? (
              <div className="rsm-answer">
                <dt>Observações gerais</dt>
                <dd>{report.generalNotes}</dd>
              </div>
            ) : null}
          </dl>

          {canDelete && !isCancelled ? (
            <button
              type="button"
              className="rsm-delete-btn"
              tabIndex={expanded ? undefined : -1}
              onClick={(event) => {
                event.stopPropagation();
                onRequestDelete?.(report);
              }}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
              Cancelar visita
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
