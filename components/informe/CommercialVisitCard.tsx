'use client';

import { UserAvatar } from '../UserAvatar';
import {
  getCommercialVisitOutcomeLabel,
  getCommercialVisitReasonLabel,
} from '../../lib/commercial-visit';
import type { CommercialVisitSummary } from '../../lib/types';
import type { VisitLinkAction } from '../visits/VisitReportCard';

// Card accordion da VISITA do comercial — twin do VisitReportCard (manter
// estrutura/classes rsm-* em sincronia). Badge "Visita" no cabecalho; detalhes:
// cidade/telefone (cliente novo) + motivo, resultado e observacoes.
// CURADORIA do vinculo (so /resumo, via showLinkStatus/canLinkClient): IGUAL ao
// prospector, POReM restrita a clientKind=NEW — EXISTING e born-linked pelo
// lookup do form comercial e NAO e curavel (so mostra "Codigo X").

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
  /** /resumo: badge "Aguardando vinculo" + linha do vinculo no detalhe. So
      clientKind=NEW e curavel (EXISTING e born-linked pelo lookup). */
  showLinkStatus?: boolean;
  /** ADM/Cadastro no /resumo: acoes de vinculo no detalhe (so NEW). */
  canLinkClient?: boolean;
  onLinkAction?: (visit: CommercialVisitSummary, action: VisitLinkAction) => void;
  onRequestDelete?: (visit: CommercialVisitSummary) => void;
}

export function CommercialVisitCard({
  visit,
  expanded,
  onToggle,
  canDelete = false,
  quickDelete = false,
  showLinkStatus = false,
  canLinkClient = false,
  onLinkAction,
  onRequestDelete,
}: CommercialVisitCardProps) {
  const isNewClient = visit.clientKind === 'NEW';
  const isLinked = visit.client !== null;
  // Vinculado mostra o nome canonico do cadastro; cliente novo o anotado.
  const clientName = isNewClient
    ? (visit.newClient?.name ?? '—')
    : (visit.client?.displayName ?? '—');

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
            {/* Abaixo do nome: vinculado mostra o codigo; aguardando vinculo
                mostra o badge AQUI (saiu de inline com o nome). Cidade/regiao +
                telefone foram pra versao estendida. So NEW fica "aguardando"
                (EXISTING e sempre vinculado pelo lookup). */}
            {isLinked ? (
              <p className="rsm-client-meta">Código {visit.client?.code}</p>
            ) : showLinkStatus ? (
              <span className="rsm-client-tag is-pending-link rsm-client-pending">
                Aguardando vínculo
              </span>
            ) : null}
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
            {/* Cidade/regiao + telefone do cliente novo: na versao estendida
                (padrao dt/dd), igual ao card do prospector. */}
            {visit.newClient?.city ? (
              <div className="rsm-answer">
                <dt>Cidade/região</dt>
                <dd>{visit.newClient.city}</dd>
              </div>
            ) : null}
            {visit.newClient?.phone ? (
              <div className="rsm-answer">
                <dt>Telefone</dt>
                <dd>{visit.newClient.phone}</dd>
              </div>
            ) : null}
            <div className="rsm-answer">
              <dt>Motivo da visita</dt>
              <dd>{getCommercialVisitReasonLabel(visit.reason)}</dd>
              {visit.reasonNotes ? (
                <dd className="rsm-answer-notes">“{visit.reasonNotes}”</dd>
              ) : null}
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
            {/* Detalhe do vinculo CURADO — so quando o ADM/Cadastro vinculou uma
                visita de cliente NOVO (EXISTING born-linked nao entra aqui). */}
            {showLinkStatus && isLinked && isNewClient ? (
              <div className="rsm-answer">
                <dt>Cliente vinculado</dt>
                <dd>
                  {visit.client?.displayName ?? '—'} · Código {visit.client?.code}
                </dd>
                {visit.newClient?.name ? (
                  <dd className="rsm-answer-notes">Anotado na visita: {visit.newClient.name}</dd>
                ) : null}
                {visit.linkedBy && visit.linkedAt ? (
                  <dd className="rsm-answer-notes">
                    Vinculado por {visit.linkedBy.fullName} em {formatVisitDateTime(visit.linkedAt)}
                  </dd>
                ) : null}
              </div>
            ) : null}
          </dl>

          {/* Acoes de curadoria — SO clientKind=NEW (EXISTING nao se mexe). */}
          {canLinkClient && onLinkAction && isNewClient ? (
            <div className="rsm-link-actions">
              <button
                type="button"
                className="rsm-link-btn"
                tabIndex={expanded ? undefined : -1}
                onClick={(event) => {
                  event.stopPropagation();
                  onLinkAction(visit, 'link');
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
                    onLinkAction(visit, 'unlink');
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
