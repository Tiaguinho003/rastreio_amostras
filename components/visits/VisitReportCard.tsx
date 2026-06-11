'use client';

import { UserAvatar } from '../UserAvatar';
import type { VisitReportSummary } from '../../lib/types';
import { getVisitFarmSizeLabel, getVisitInterestDetailLabel } from '../../lib/visit-report';

// Card accordion de um informe de visita — extraido da pagina /resumo para
// ser compartilhado com a lista "Ultimos informes" do dashboard do
// prospector. Colapsado mostra cabecalho (autor + data) e cliente; expandido
// revela as respostas e, quando canDelete, o "Excluir informe" (o modal de
// confirmacao fica na superficie que consome o card).

// Acima disso entre o preenchimento (capturedAt, fila offline) e a chegada
// ao servidor (createdAt), o card ganha o marcador "enviado depois".
const OFFLINE_GAP_MS = 5 * 60 * 1000;

function formatVisitDateTime(value: string): string {
  const date = new Date(value);
  const day = date.toLocaleDateString('pt-BR');
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

function wasSentLater(report: VisitReportSummary): boolean {
  if (!report.capturedAt) {
    return false;
  }

  const gap = new Date(report.createdAt).getTime() - new Date(report.capturedAt).getTime();
  return Number.isFinite(gap) && gap > OFFLINE_GAP_MS;
}

interface VisitReportCardProps {
  report: VisitReportSummary;
  expanded: boolean;
  onToggle: () => void;
  /** Mostra o botao "Excluir informe" no detalhe expandido (admin no /resumo). */
  canDelete?: boolean;
  /** Lixeira sempre visivel no canto do card (dashboard do prospector —
      o autor exclui o proprio informe). Irma do botao-toggle no DOM
      (button nao aninha button), posicionada por cima via CSS. */
  quickDelete?: boolean;
  /** Etiqueta de tipo no cabecalho (feed combinado do /resumo usa
      "Prospecção"; o dashboard do prospector nao passa). */
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
  const clientName = isNewClient
    ? (report.newClient?.name ?? '—')
    : (report.client?.displayName ?? '—');
  const clientMeta = isNewClient
    ? [report.newClient?.city, report.newClient?.phone].filter(Boolean).join(' · ')
    : report.client
      ? `Código ${report.client.code}`
      : null;

  return (
    <article
      className={`rsm-card${expanded ? ' is-expanded' : ''}${quickDelete ? ' has-quick-delete' : ''}`}
    >
      {quickDelete && onRequestDelete ? (
        <button
          type="button"
          className="rsm-card-quick-delete"
          aria-label="Excluir informe"
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
            <p className="rsm-card-when">
              {formatVisitDateTime(report.capturedAt ?? report.createdAt)}
              {wasSentLater(report) ? (
                <span
                  className="rsm-offline-tag"
                  title={`Recebido em ${formatVisitDateTime(report.createdAt)}`}
                >
                  enviado depois
                </span>
              ) : null}
            </p>
          </div>
          {typeBadge ? <span className="rsm-type-badge is-prospect">{typeBadge}</span> : null}
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
              <dt>Tamanho da fazenda</dt>
              <dd>{getVisitFarmSizeLabel(report.farmSize)}</dd>
              {report.farmSizeNotes ? (
                <dd className="rsm-answer-notes">“{report.farmSizeNotes}”</dd>
              ) : null}
            </div>
            <div className="rsm-answer">
              <dt>Interesse em comercializar</dt>
              <dd>{getVisitInterestDetailLabel(report.interestLevel)}</dd>
              {report.interestNotes ? (
                <dd className="rsm-answer-notes">“{report.interestNotes}”</dd>
              ) : null}
            </div>
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
            {report.generalNotes !== null ? (
              <div className="rsm-answer">
                <dt>Observações gerais</dt>
                <dd>{report.generalNotes}</dd>
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
              Excluir informe
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
