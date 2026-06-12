'use client';

import { UserAvatar } from '../UserAvatar';
import type { VisitReportSummary } from '../../lib/types';
import { getVisitFarmSizeLabel, getVisitInterestDetailLabel } from '../../lib/visit-report';

// Card accordion de um informe de visita — extraido da pagina /resumo para
// ser compartilhado com a lista "Ultimos informes" do dashboard do
// prospector. Colapsado mostra cabecalho (autor + data) e cliente; expandido
// revela as respostas e, quando canDelete, o "Excluir informe" (o modal de
// confirmacao fica na superficie que consome o card).
// Nome do cliente por PRESENCA de dados: vinculado (client setado pela
// curadoria ou born-linked) mostra o nome canonico do cadastro; sem vinculo
// mostra o nome anotado pelo prospector. As props showLinkStatus/
// canLinkClient (so o /resumo passa) ligam o badge "Aguardando vinculo" e
// as acoes de curadoria — o dashboard do prospector fica sem nada disso.

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

/** Acao de curadoria disparada pelos botoes do detalhe expandido. O cadastro
    de cliente novo nao e uma acao do card: o estado vazio do lookup no modal
    de vinculo ja oferece "Cadastrar e vincular" inline. */
export type VisitLinkAction = 'link' | 'unlink';

interface VisitReportCardProps {
  report: VisitReportSummary;
  expanded: boolean;
  onToggle: () => void;
  /** Mostra o botao "Excluir informe" no detalhe expandido. So o autor
      exclui o proprio informe (vale tambem no /resumo — nem ADM nem Cadastro
      excluem informe alheio). */
  canDelete?: boolean;
  /** Lixeira sempre visivel no canto do card (dashboard do prospector —
      o autor exclui o proprio informe). Irma do botao-toggle no DOM
      (button nao aninha button), posicionada por cima via CSS. */
  quickDelete?: boolean;
  /** Etiqueta de tipo no cabecalho (feed combinado do /resumo usa
      "Prospecção"; o dashboard do prospector nao passa). */
  typeBadge?: string;
  /** /resumo: badge "Aguardando vínculo" + linha do vinculo no detalhe. */
  showLinkStatus?: boolean;
  /** ADM/Cadastro no /resumo: acoes de vinculo no detalhe expandido. */
  canLinkClient?: boolean;
  onLinkAction?: (report: VisitReportSummary, action: VisitLinkAction) => void;
  onRequestDelete?: (report: VisitReportSummary) => void;
}

export function VisitReportCard({
  report,
  expanded,
  onToggle,
  canDelete = false,
  quickDelete = false,
  typeBadge,
  showLinkStatus = false,
  canLinkClient = false,
  onLinkAction,
  onRequestDelete,
}: VisitReportCardProps) {
  const isNewClient = report.clientKind === 'NEW';
  const isLinked = report.client !== null;
  // Vinculado mostra o nome canonico do cadastro; sem vinculo, o anotado.
  const clientName = report.client?.displayName ?? report.newClient?.name ?? '—';
  const clientMeta = isLinked
    ? `Código ${report.client?.code}`
    : [report.newClient?.city, report.newClient?.phone].filter(Boolean).join(' · ');

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
              {showLinkStatus && !isLinked ? (
                <span className="rsm-client-tag is-pending-link">Aguardando vínculo</span>
              ) : null}
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
            {showLinkStatus && isLinked ? (
              <div className="rsm-answer">
                <dt>Cliente vinculado</dt>
                <dd>
                  {report.client?.displayName ?? '—'} · Código {report.client?.code}
                </dd>
                {report.newClient?.name ? (
                  <dd className="rsm-answer-notes">Anotado na visita: {report.newClient.name}</dd>
                ) : null}
                {report.linkedBy && report.linkedAt ? (
                  <dd className="rsm-answer-notes">
                    Vinculado por {report.linkedBy.fullName} em{' '}
                    {formatVisitDateTime(report.linkedAt)}
                  </dd>
                ) : null}
              </div>
            ) : null}
          </dl>

          {canLinkClient && onLinkAction ? (
            <div className="rsm-link-actions">
              <button
                type="button"
                className="rsm-link-btn"
                tabIndex={expanded ? undefined : -1}
                onClick={(event) => {
                  event.stopPropagation();
                  onLinkAction(report, 'link');
                }}
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                  <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                </svg>
                {isLinked ? 'Alterar vínculo' : 'Vincular cliente'}
              </button>
              {isLinked ? (
                <button
                  type="button"
                  className="rsm-link-btn is-remove"
                  tabIndex={expanded ? undefined : -1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onLinkAction(report, 'unlink');
                  }}
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                    <path d="m3 3 18 18" />
                  </svg>
                  Remover vínculo
                </button>
              ) : null}
            </div>
          ) : null}

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
