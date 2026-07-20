'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import type { SampleMovement, SampleSnapshot, SendHistoryItem } from '../../lib/types';

// Painel comercial do detalhe da amostra: SO LEITURA. A venda passou a ser feita
// exclusivamente pela pagina Contratos (criando o contrato a vista); a perda sera
// realocada depois. Aqui ficam apenas os dados (Vendido/Perdido/Disponivel) e a
// timeline de movimentacoes/envios/laudos como historico — sem acoes de venda/perda.

type SampleMovementsPanelProps = {
  sample: SampleSnapshot;
  movements: SampleMovement[];
  // Itens do historico de envios (laudo PDF + amostra fisica), projetados na
  // detail page. A Movimentacoes unifica movimentos + envio + laudo numa so
  // timeline. Os modais de envio/cancelamento ficam na detail page, por isso
  // as acoes de editar/cancelar envio vem como callbacks.
  sendItems: SendHistoryItem[];
  canEditSend: boolean;
  onEditSend: (item: Extract<SendHistoryItem, { kind: 'PHYSICAL' }>) => void | Promise<void>;
  onCancelSend: (sendEventId: string) => void;
  // Lote editavel: edicao da data de chegada pelo item "Registro" da timeline.
  // O modal/salvamento vivem na detail page (como os de envio), por callback.
  canEditRegistrationDate: boolean;
  onEditRegistrationDate: () => void;
  // Overlay (F2): o link "via cascata da liga" troca o lote aberto no overlay
  // em vez de navegar; o href segue valido como deep-link.
  onOpenSample?: (sampleId: string) => void;
};

function formatMovementDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return value;
}

function getMovementBuyerLabel(movement: SampleMovement): string | null {
  if (movement.movementType !== 'SALE') {
    return null;
  }
  const client = movement.buyerClient;
  if (!client) {
    return null;
  }
  return client.displayName ?? client.fullName ?? client.tradeName ?? null;
}

export function SampleMovementsPanel({
  sample,
  movements,
  sendItems,
  canEditSend,
  onEditSend,
  onCancelSend,
  canEditRegistrationDate,
  onEditRegistrationDate,
  onOpenSample,
}: SampleMovementsPanelProps) {
  // Timeline unificada de Movimentacoes: registro/chegada (sortKey =
  // sample.createdAt) + venda/perda (sortKey = createdAt) + envio de amostra /
  // criacao de laudo (sortKey = occurredAt), ordenada por data — mais recente
  // primeiro. O registro e o evento mais antigo, entao ancora o fim da lista.
  type TimelineEntry =
    | { type: 'movement'; sortKey: string; movement: SampleMovement }
    | { type: 'send'; sortKey: string; item: SendHistoryItem }
    | { type: 'registration'; sortKey: string };

  const timeline = useMemo<TimelineEntry[]>(() => {
    const movEntries: TimelineEntry[] = movements.map((m) => ({
      type: 'movement',
      sortKey: m.createdAt,
      movement: m,
    }));
    const sendEntries: TimelineEntry[] = sendItems.map((it) => ({
      type: 'send',
      sortKey: it.occurredAt,
      item: it,
    }));
    const entries: TimelineEntry[] = [...movEntries, ...sendEntries];
    if (sample.createdAt) {
      entries.push({ type: 'registration', sortKey: sample.createdAt });
    }
    return entries.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
  }, [movements, sendItems, sample.createdAt]);

  const hasTimeline = timeline.length > 0;

  const sold = sample.soldSacks ?? 0;
  const lost = sample.lostSacks ?? 0;
  const available = sample.availableSacks ?? 0;

  const STATUS_LABEL: Record<string, string> = {
    OPEN: 'Disponível',
    PARTIALLY_SOLD: 'Parcial',
    SOLD: 'Vendido',
    LOST: 'Perdido',
  };
  const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
    OPEN: { color: '#2980B9', bg: '#EFF6FF', border: '#BFDBFE' },
    PARTIALLY_SOLD: { color: '#E67E22', bg: '#FFF7ED', border: '#FDE68A' },
    SOLD: { color: '#27AE60', bg: '#F0FDF4', border: '#BBF7D0' },
    LOST: { color: '#C0392B', bg: '#FEF2F2', border: '#FECACA' },
  };
  const commercialLabel = STATUS_LABEL[sample.commercialStatus] ?? 'Disponível';
  const commercialStyle = STATUS_STYLE[sample.commercialStatus] ?? STATUS_STYLE.OPEN;

  return (
    <section className="sdv-commercial">
      {/* Card unico: Resumo comercial. Minicards no topo, divisoria fina, e a
          timeline de Movimentacoes embaixo (mesma secao, sem subtitulo/contador). */}
      <div className="sdv-card sdv-com-summary">
        <div className="sdv-card-header">
          <span className="sdv-card-title">Resumo comercial</span>
          <span
            className="sdv-com-status"
            style={{
              color: commercialStyle.color,
              background: commercialStyle.bg,
              borderColor: commercialStyle.border,
            }}
          >
            {commercialLabel}
          </span>
        </div>
        <div className="sdv-com-minis">
          <div className="sdv-com-mini is-sold">
            <div className="sdv-com-mini-label">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
              <span>Vendidas</span>
            </div>
            <span className="sdv-com-mini-value">{sold}</span>
          </div>
          <div className="sdv-com-mini is-lost">
            <div className="sdv-com-mini-label">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14" />
                <path d="m5 12 7 7 7-7" />
              </svg>
              <span>Perdidas</span>
            </div>
            <span className="sdv-com-mini-value">{lost}</span>
          </div>
          <div className="sdv-com-mini is-avail">
            <div className="sdv-com-mini-label">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
              </svg>
              <span>Disponíveis</span>
            </div>
            <span className="sdv-com-mini-value">{available}</span>
          </div>
        </div>

        {/* Movimentacoes: separadas dos minis so por uma divisoria fina (CSS).
            O id ancora o deep-link ?focus=movimentacoes (scrollIntoView na page). */}
        <div id="sdv-movimentacoes" className="sdv-com-movements-section">
          {hasTimeline ? (
            <div className="sdv-com-movements" role="list" aria-label="Histórico do lote">
              {timeline.map((entry, i) => {
                const animationDelay = `${i * 0.05}s`;

                if (entry.type === 'movement') {
                  const movement = entry.movement;
                  const isCancelled = movement.status === 'CANCELLED';
                  const isSale = movement.movementType === 'SALE';
                  const buyerLabel = getMovementBuyerLabel(movement);
                  // Liga B3.6: movimento criado pela cascata de uma liga —
                  // read-only aqui (cancelar/editar so pela liga raiz).
                  const cascadedFrom = movement.cascadedFrom ?? null;
                  return (
                    <div
                      key={movement.id}
                      role="listitem"
                      className={`sdv-com-mov${isCancelled ? ' is-cancelled' : ''}`}
                      style={{ animationDelay }}
                    >
                      <div className={`sdv-com-mov-icon ${isSale ? 'is-sale' : 'is-loss'}`}>
                        {isSale ? (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 19V5" />
                            <path d="m5 12 7-7 7 7" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 5v14" />
                            <path d="m5 12 7 7 7-7" />
                          </svg>
                        )}
                      </div>
                      <div className="sdv-com-mov-content">
                        <div className="sdv-com-mov-top">
                          <span className="sdv-com-mov-qty">{movement.quantitySacks} sacas</span>
                          <span className={`sdv-com-mov-badge ${isSale ? 'is-sale' : 'is-loss'}`}>
                            {isSale ? 'Venda' : 'Perda'}
                          </span>
                          {isCancelled ? (
                            <span className="sdv-com-mov-badge is-cancelled">Cancelada</span>
                          ) : null}
                        </div>
                        <div className="sdv-com-mov-bottom">
                          <span>{formatMovementDate(movement.movementDate)}</span>
                          {buyerLabel ? (
                            <>
                              <span className="sdv-com-mov-sep" />
                              <span>→ {buyerLabel}</span>
                            </>
                          ) : null}
                          {!isSale && movement.lossReasonText ? (
                            <>
                              <span className="sdv-com-mov-sep" />
                              <span className="sdv-com-mov-reason">{movement.lossReasonText}</span>
                            </>
                          ) : null}
                          {!isCancelled && cascadedFrom ? (
                            <>
                              <span className="sdv-com-mov-sep" />
                              <span className="sdv-com-mov-cascaded-hint">
                                Via cascata da liga{' '}
                                <Link
                                  href={`/samples?lote=${cascadedFrom.sampleId}`}
                                  onClick={
                                    onOpenSample
                                      ? (event) => {
                                          event.preventDefault();
                                          onOpenSample(cascadedFrom.sampleId);
                                        }
                                      : undefined
                                  }
                                >
                                  {cascadedFrom.lotNumber ?? cascadedFrom.sampleId.slice(0, 8)}
                                </Link>
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                }

                // Registro/chegada da amostra — somente leitura, ancora o fim da
                // timeline (evento mais antigo).
                if (entry.type === 'registration') {
                  return (
                    <div
                      key="registration"
                      role="listitem"
                      className="sdv-com-mov"
                      style={{ animationDelay }}
                    >
                      <div className="sdv-com-mov-icon is-registration">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 22V4" />
                          <path d="M4 4h13l-2 4 2 4H4" />
                        </svg>
                      </div>
                      <div className="sdv-com-mov-content">
                        <div className="sdv-com-mov-top">
                          <span className="sdv-com-mov-badge is-registration">Registro</span>
                          <span className="sdv-com-mov-name">Chegada do lote</span>
                        </div>
                        <div className="sdv-com-mov-bottom">
                          <span>{formatMovementDate(entry.sortKey)}</span>
                        </div>
                      </div>
                      {canEditRegistrationDate ? (
                        <div className="sdv-com-mov-actions">
                          <button
                            type="button"
                            className="sdv-com-mov-act"
                            onClick={onEditRegistrationDate}
                            aria-label="Editar data de chegada"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                            </svg>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                }

                const item = entry.item;

                // Envio de amostra fisica — editavel/cancelavel (callbacks da
                // detail page) quando ativo e o status permite enviar.
                if (item.kind === 'PHYSICAL') {
                  const cancelled = item.cancelled;
                  return (
                    <div
                      key={item.key}
                      role="listitem"
                      className={`sdv-com-mov${cancelled ? ' is-cancelled' : ''}`}
                      style={{ animationDelay }}
                    >
                      <div className="sdv-com-mov-icon is-send">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="m22 2-7 20-4-9-9-4 20-7z" />
                          <path d="M22 2 11 13" />
                        </svg>
                      </div>
                      <div className="sdv-com-mov-content">
                        <div className="sdv-com-mov-top">
                          <span className="sdv-com-mov-badge is-send">Envio</span>
                          <span className="sdv-com-mov-name">{item.recipientName}</span>
                          {cancelled ? (
                            <span className="sdv-com-mov-badge is-cancelled">Cancelado</span>
                          ) : null}
                        </div>
                        <div className="sdv-com-mov-bottom">
                          <span>Lote físico</span>
                          <span className="sdv-com-mov-sep" />
                          <span>{formatMovementDate(item.sentDate)}</span>
                        </div>
                      </div>
                      {!cancelled && canEditSend ? (
                        <div className="sdv-com-mov-actions">
                          <button
                            type="button"
                            className="sdv-com-mov-act"
                            onClick={() => onEditSend(item)}
                            aria-label="Editar envio"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="sdv-com-mov-act is-danger"
                            onClick={() => onCancelSend(item.sendEventId)}
                            aria-label="Cancelar envio"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            </svg>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                }

                // Criacao de laudo PDF (REPORT) — somente leitura.
                return (
                  <div
                    key={item.key}
                    role="listitem"
                    className="sdv-com-mov"
                    style={{ animationDelay }}
                  >
                    <div className="sdv-com-mov-icon is-report">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 4.8h7l3 3V19.2H7z" />
                        <path d="M14 4.8v3h3" />
                        <path d="M9 12h6" />
                        <path d="M9 15h6" />
                      </svg>
                    </div>
                    <div className="sdv-com-mov-content">
                      <div className="sdv-com-mov-top">
                        <span className="sdv-com-mov-badge is-report">Laudo</span>
                        <span className="sdv-com-mov-name">
                          {item.recipientName && item.recipientName !== '-'
                            ? item.recipientName
                            : 'Laudo PDF'}
                        </span>
                      </div>
                      <div className="sdv-com-mov-bottom">
                        <span>{item.dateLabel}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="sdv-com-empty">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
              </svg>
              <span>Nenhuma movimentação registrada</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
