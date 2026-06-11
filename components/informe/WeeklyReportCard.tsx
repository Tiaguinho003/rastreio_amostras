'use client';

import { UserAvatar } from '../UserAvatar';
import type { WeeklyReportSummary } from '../../lib/types';
import { formatWeekLabelFromStrings } from '../../lib/weekly-report';

// Card accordion do RELATORIO SEMANAL do comercial — estrutura rsm-* do
// VisitReportCard (comentario cruzado), com badge "Relatorio" e a linha de
// "cliente" substituida pela semana de referencia (icone calendario).
// Detalhes: resumo, dificuldades e plano da proxima semana.

function formatSentDateTime(value: string): string {
  const date = new Date(value);
  const day = date.toLocaleDateString('pt-BR');
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

interface WeeklyReportCardProps {
  report: WeeklyReportSummary;
  expanded: boolean;
  onToggle: () => void;
  /** Botao "Excluir" no detalhe expandido (admin no /resumo). */
  canDelete?: boolean;
  /** Lixeira sempre visivel no canto do card (pagina do comercial). */
  quickDelete?: boolean;
  onRequestDelete?: (report: WeeklyReportSummary) => void;
}

export function WeeklyReportCard({
  report,
  expanded,
  onToggle,
  canDelete = false,
  quickDelete = false,
  onRequestDelete,
}: WeeklyReportCardProps) {
  return (
    <article
      className={`rsm-card${expanded ? ' is-expanded' : ''}${quickDelete ? ' has-quick-delete' : ''}`}
    >
      {quickDelete && onRequestDelete ? (
        <button
          type="button"
          className="rsm-card-quick-delete"
          aria-label="Excluir relatório"
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
            <p className="rsm-card-when">{formatSentDateTime(report.createdAt)}</p>
          </div>
          <span className="rsm-type-badge is-weekly">Relatório</span>
        </header>

        <div className="rsm-card-client">
          <span className="rsm-client-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <rect x="4" y="5" width="16" height="16" rx="2.2" />
              <path d="M8 3v4" />
              <path d="M16 3v4" />
              <path d="M4 10.5h16" />
            </svg>
          </span>
          <div className="rsm-card-client-text">
            <p className="rsm-client-name">
              {formatWeekLabelFromStrings(report.weekStart, report.weekEnd)}
            </p>
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
              <dt>Resumo da semana</dt>
              <dd>{report.summary}</dd>
            </div>
            {report.difficulties !== null ? (
              <div className="rsm-answer">
                <dt>Dificuldades</dt>
                <dd>{report.difficulties}</dd>
              </div>
            ) : null}
            {report.nextWeekPlan !== null ? (
              <div className="rsm-answer">
                <dt>Plano da próxima semana</dt>
                <dd>{report.nextWeekPlan}</dd>
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
              Excluir relatório
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
