'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { ApiError, getClient } from '../../lib/api-client';
import type {
  ClientSummary,
  SampleMovement,
  SampleSnapshot,
  SendHistoryItem,
  SessionData,
} from '../../lib/types';
import { ClientLookupField } from '../clients/ClientLookupField';

// Painel comercial do detalhe da amostra: SO LEITURA. A venda passou a ser feita
// exclusivamente pela pagina Contratos (criando o contrato a vista); a perda sera
// realocada depois. Aqui ficam apenas os dados (Vendido/Perdido/Disponivel) e a
// timeline de movimentacoes/envios/laudos como historico — sem acoes de venda/perda.
//
// Excecao (ajuste pos-F3): a EDICAO do envio fisico e pequena demais pra um
// painel lateral — virou um dropdown inline logo abaixo do card de movimentacao
// (dois campos + Salvar). O cancelamento continua central (destrutivo) e o envio
// NOVO continua no fluxo da lista.

type PhysicalSendItem = Extract<SendHistoryItem, { kind: 'PHYSICAL' }>;

type SampleMovementsPanelProps = {
  session: SessionData;
  sample: SampleSnapshot;
  movements: SampleMovement[];
  // Itens do historico de envios (laudo PDF + amostra fisica), projetados na
  // detail page. A Movimentacoes unifica movimentos + envio + laudo numa so
  // timeline. O cancelamento de envio (modal central) fica na detail page, por
  // isso vem como callback.
  sendItems: SendHistoryItem[];
  canEditSend: boolean;
  /** Envio com o editor inline aberto — o host guarda o estado (entra no detailBusy). */
  editingSendEventId: string | null;
  /** Abre/fecha o editor inline do envio (o mesmo botao alterna). */
  onToggleSendEdit: (sendEventId: string) => void;
  /** Salva a edicao; lanca em caso de falha (o editor inline mostra a mensagem). */
  onSubmitSendEdit: (
    sendEventId: string,
    input: { recipientClientId: string | null; sentDate: string }
  ) => Promise<void>;
  onCancelSend: (sendEventId: string) => void;
  // Lote editavel: edicao da data de chegada pelo item "Registro" da timeline —
  // tambem em dropdown inline (um campo so). O salvamento vive na detail page.
  canEditRegistrationDate: boolean;
  /** Data de chegada atual (YYYY-MM-DD) — prefill do editor inline. */
  registrationDate: string;
  editingRegistrationDate: boolean;
  onToggleRegistrationDateEdit: () => void;
  /** Salva a data; lanca em caso de falha (o editor inline mostra a mensagem). */
  onSubmitRegistrationDate: (receivedDate: string) => Promise<void>;
  // Overlay (F2): o link "via cascata da liga" troca o lote aberto no overlay
  // em vez de navegar; o href segue valido como deep-link.
  onOpenSample?: (sampleId: string) => void;
  // FV (RD15): o detalhe virou 3 abas — o resumo (minis) fica em "Visao geral"
  // e a timeline em "Movimentacoes". `both` mantem o cartao unico de antes.
  section?: 'summary' | 'timeline' | 'both';
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

// Editor inline do envio fisico: dois campos (destinatario + data) abertos
// abaixo do card, no lugar do painel lateral. O prefill do destinatario precisa
// do ClientSummary completo (o historico so guarda id + nome).
function SendEditInline({
  session,
  item,
  onCancel,
  onSubmit,
}: {
  session: SessionData;
  item: PhysicalSendItem;
  onCancel: () => void;
  onSubmit: (
    sendEventId: string,
    input: { recipientClientId: string | null; sentDate: string }
  ) => Promise<void>;
}) {
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [sentDate, setSentDate] = useState(item.sentDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipientClientId = item.recipientClientId;
  useEffect(() => {
    let cancelled = false;
    if (!recipientClientId) {
      setClient(null);
      return;
    }
    void (async () => {
      try {
        const response = await getClient(session, recipientClientId);
        if (!cancelled) setClient(response.client);
      } catch {
        if (!cancelled) setClient(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipientClientId, session]);

  async function handleSubmit() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(item.sendEventId, {
        recipientClientId: client?.id ?? null,
        sentDate,
      });
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Falha ao atualizar envio. Tente novamente.'
      );
      setSaving(false);
    }
  }

  return (
    <form
      className="sdv-com-mov-edit"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="sdv-com-mov-edit-fields">
        <div className="app-modal-field">
          <ClientLookupField
            session={session}
            label="Destinatário"
            kind="any"
            compact
            maxResults={10}
            selectedClient={client}
            onSelectClient={(next) => setClient(next)}
            disabled={saving}
            placeholder="Busque por nome, documento ou código"
          />
        </div>
        <label className="app-modal-field">
          <span className="app-modal-label">Data de envio</span>
          <input
            type="date"
            className="app-modal-input"
            value={sentDate}
            onChange={(event) => setSentDate(event.target.value)}
            disabled={saving}
          />
        </label>
      </div>

      {error ? <p className="sdv-modal-error">{error}</p> : null}

      <div className="sdv-com-mov-edit-actions">
        <button type="button" className="fv-btn fv-btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="fv-btn fv-btn-primary" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

// Editor inline da data de chegada: um campo so — o mesmo dropdown do envio,
// com metade dos campos. Substituiu o painel lateral "Editar data de chegada".
function RegistrationDateEditInline({
  initialDate,
  onCancel,
  onSubmit,
}: {
  initialDate: string;
  onCancel: () => void;
  onSubmit: (receivedDate: string) => Promise<void>;
}) {
  const [receivedDate, setReceivedDate] = useState(initialDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (saving) return;
    if (!receivedDate) {
      setError('Informe a data de chegada');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(receivedDate);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Falha ao salvar a data de chegada. Tente novamente.'
      );
      setSaving(false);
    }
  }

  return (
    <form
      className="sdv-com-mov-edit"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="sdv-com-mov-edit-fields">
        <label className="app-modal-field">
          <span className="app-modal-label">Data de chegada</span>
          <input
            type="date"
            className="app-modal-input"
            value={receivedDate}
            max={new Date().toLocaleDateString('en-CA')}
            onChange={(event) => {
              setReceivedDate(event.target.value);
              setError(null);
            }}
            disabled={saving}
          />
        </label>
      </div>

      {error ? <p className="sdv-modal-error">{error}</p> : null}

      <div className="sdv-com-mov-edit-actions">
        <button type="button" className="fv-btn fv-btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="fv-btn fv-btn-primary" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

export function SampleMovementsPanel({
  session,
  sample,
  movements,
  sendItems,
  canEditSend,
  editingSendEventId,
  onToggleSendEdit,
  onSubmitSendEdit,
  onCancelSend,
  canEditRegistrationDate,
  registrationDate,
  editingRegistrationDate,
  onToggleRegistrationDateEdit,
  onSubmitRegistrationDate,
  onOpenSample,
  section = 'both',
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
  // FV: os tons inline deram lugar aos chips pastel do kit.
  const STATUS_CHIP: Record<string, string> = {
    OPEN: 'fv-chip-blue',
    PARTIALLY_SOLD: 'fv-chip-amber',
    SOLD: 'fv-chip-green',
    LOST: 'fv-chip-red',
  };
  const commercialLabel = STATUS_LABEL[sample.commercialStatus] ?? 'Disponível';
  const commercialChip = STATUS_CHIP[sample.commercialStatus] ?? 'fv-chip-blue';

  const showSummary = section !== 'timeline';
  const showTimeline = section !== 'summary';

  return (
    <section className="sdv-commercial">
      {/* Card unico: Resumo comercial. Minicards no topo, divisoria fina, e a
          timeline de Movimentacoes embaixo (mesma secao, sem subtitulo/contador).
          FV: as duas metades podem ser pedidas em separado (abas do detalhe). */}
      <div className="sdv-card sdv-com-summary">
        <div className="sdv-card-header">
          <span className="sdv-card-title">
            {showSummary ? 'Resumo comercial' : 'Movimentações'}
          </span>
          {/* O chip so acompanha o RESUMO: na aba Movimentacoes ele repetiria
              o chip de status que ja esta no hero. */}
          {showSummary ? (
            <span className={`fv-chip ${commercialChip}`}>{commercialLabel}</span>
          ) : null}
        </div>
        {showSummary ? (
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
        ) : null}

        {/* Movimentacoes: separadas dos minis so por uma divisoria fina (CSS).
            O id ancora o deep-link ?focus=movimentacoes. */}
        {showTimeline ? (
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
                                <span className="sdv-com-mov-reason">
                                  {movement.lossReasonText}
                                </span>
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
                      <div key="registration" role="listitem" className="sdv-com-mov-group">
                        <div
                          className={`sdv-com-mov${editingRegistrationDate ? ' is-editing' : ''}`}
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
                                className={`sdv-com-mov-act${editingRegistrationDate ? ' is-active' : ''}`}
                                onClick={onToggleRegistrationDateEdit}
                                aria-label={
                                  editingRegistrationDate
                                    ? 'Fechar edição da data de chegada'
                                    : 'Editar data de chegada'
                                }
                                aria-expanded={editingRegistrationDate}
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                                </svg>
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {canEditRegistrationDate && editingRegistrationDate ? (
                          <RegistrationDateEditInline
                            initialDate={registrationDate}
                            onCancel={onToggleRegistrationDateEdit}
                            onSubmit={onSubmitRegistrationDate}
                          />
                        ) : null}
                      </div>
                    );
                  }

                  const item = entry.item;

                  // Envio de amostra fisica — editavel (dropdown inline logo
                  // abaixo do card) e cancelavel (modal central, callback da
                  // detail page) quando ativo e o status permite enviar.
                  if (item.kind === 'PHYSICAL') {
                    const cancelled = item.cancelled;
                    const editing = editingSendEventId === item.sendEventId;
                    return (
                      <div key={item.key} role="listitem" className="sdv-com-mov-group">
                        <div
                          className={`sdv-com-mov${cancelled ? ' is-cancelled' : ''}${editing ? ' is-editing' : ''}`}
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
                                className={`sdv-com-mov-act${editing ? ' is-active' : ''}`}
                                onClick={() => onToggleSendEdit(item.sendEventId)}
                                aria-label={editing ? 'Fechar edição do envio' : 'Editar envio'}
                                aria-expanded={editing}
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
                        {editing ? (
                          <SendEditInline
                            session={session}
                            item={item}
                            onCancel={() => onToggleSendEdit(item.sendEventId)}
                            onSubmit={onSubmitSendEdit}
                          />
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
        ) : null}
      </div>
    </section>
  );
}
