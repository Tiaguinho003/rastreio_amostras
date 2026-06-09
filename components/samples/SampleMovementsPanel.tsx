'use client';

import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  ApiError,
  cancelSampleMovement,
  createSampleMovement,
  updateRegistration,
} from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type {
  ActiveBlendDetail,
  SampleMovement,
  SampleMovementType,
  SampleSnapshot,
  SampleStatus,
  SendHistoryItem,
  SessionData,
} from '../../lib/types';

// Mesmo conjunto do backend (src/samples/sample-command-service.js).
// Q.print: QR_PENDING_PRINT/QR_PRINTED removidos como status (impressao
// virou acao pura).
const COMMERCIAL_ALLOWED_STATUSES: readonly SampleStatus[] = [
  'REGISTRATION_CONFIRMED',
  'CLASSIFIED',
];
import { SampleMovementModal } from './SampleMovementModal';

type SampleMovementsPanelProps = {
  session: SessionData;
  sampleId: string;
  sample: SampleSnapshot;
  movements: SampleMovement[];
  // Liga B4 Fase 8 (B3.8): ligas ativas onde este sample e origem — vazio
  // pra liga ou pra amostra sem ligas. Repassado ao modal de venda/perda.
  activeBlends: ActiveBlendDetail[];
  // Itens do historico de envios (laudo PDF + amostra fisica), projetados na
  // detail page. A Movimentacoes unifica venda/perda + envio + laudo numa so
  // timeline. Os modais de envio/cancelamento ficam na detail page, por isso
  // as acoes de editar/cancelar envio vem como callbacks.
  sendItems: SendHistoryItem[];
  canEditSend: boolean;
  onEditSend: (item: Extract<SendHistoryItem, { kind: 'PHYSICAL' }>) => void | Promise<void>;
  onCancelSend: (sendEventId: string) => void;
  onRefresh: () => Promise<void>;
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
  session,
  sampleId,
  sample,
  movements,
  activeBlends,
  sendItems,
  canEditSend,
  onEditSend,
  onCancelSend,
  onRefresh,
}: SampleMovementsPanelProps) {
  const [createType, setCreateType] = useState<SampleMovementType>('SALE');
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelMovement, setCancelMovement] = useState<SampleMovement | null>(null);
  const cancelTrapRef = useFocusTrap(cancelMovement !== null);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stampType, setStampType] = useState<SampleMovementType | null>(null);
  const stampTimeoutRef = useRef<number | null>(null);

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

  const finishStamp = useCallback(async () => {
    setStampType(null);
    setCreateOpen(false);
    await onRefresh();
  }, [onRefresh]);

  function clearFeedback() {
    setError(null);
  }

  const sold = sample.soldSacks ?? 0;
  const lost = sample.lostSacks ?? 0;
  const available = sample.availableSacks ?? 0;
  const commercialAllowed = COMMERCIAL_ALLOWED_STATUSES.includes(sample.status);

  const STATUS_LABEL: Record<string, string> = {
    OPEN: 'Disponivel',
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
  const commercialLabel = STATUS_LABEL[sample.commercialStatus] ?? 'Disponivel';
  const commercialStyle = STATUS_STYLE[sample.commercialStatus] ?? STATUS_STYLE.OPEN;

  return (
    <section className="sdv-commercial">
      {/* Card 1: Resumo */}
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
              <span>Disponiveis</span>
            </div>
            <span className="sdv-com-mini-value">{available}</span>
          </div>
        </div>
        {/* Acoes Venda/Perda no rodape do Resumo, no mesmo padrao
            .sdv-info-actions dos demais conteineres. */}
        <div className="sdv-info-actions">
          <button
            type="button"
            className="sdv-action-card is-loss"
            disabled={!commercialAllowed || available <= 0}
            onClick={() => {
              setCreateType('LOSS');
              setCreateOpen(true);
              clearFeedback();
            }}
          >
            <span className="sdv-action-card-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14" />
                <path d="m5 12 7 7 7-7" />
              </svg>
            </span>
            <span className="sdv-action-card-label">Perda</span>
          </button>
          <button
            type="button"
            className="sdv-action-card is-sale"
            disabled={!commercialAllowed || available <= 0}
            onClick={() => {
              setCreateType('SALE');
              setCreateOpen(true);
              clearFeedback();
            }}
          >
            <span className="sdv-action-card-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            </span>
            <span className="sdv-action-card-label">Venda</span>
          </button>
        </div>
      </div>

      {/* Card 2: Movimentações */}
      <div className="sdv-card sdv-com-movements-card">
        <div className="sdv-card-header">
          <span className="sdv-card-title">Movimentacoes</span>
          <span className="sdv-com-count">{timeline.length} registros</span>
        </div>

        {error ? <p className="sdv-modal-error">{error}</p> : null}

        {hasTimeline ? (
          <div className="sdv-com-movements">
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
                const isCascaded = cascadedFrom !== null;
                return (
                  <div
                    key={movement.id}
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
                              <Link href={`/samples/${cascadedFrom.sampleId}`}>
                                {cascadedFrom.lotNumber ?? cascadedFrom.sampleId.slice(0, 8)}
                              </Link>
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {!isCancelled && !isCascaded ? (
                      <div className="sdv-com-mov-actions">
                        <button
                          type="button"
                          className="sdv-com-mov-act is-danger"
                          onClick={() => {
                            setCancelMovement(movement);
                            setCancelReasonText('');
                            clearFeedback();
                          }}
                          disabled={saving}
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

              // Registro/chegada da amostra — somente leitura, ancora o fim da
              // timeline (evento mais antigo).
              if (entry.type === 'registration') {
                return (
                  <div key="registration" className="sdv-com-mov" style={{ animationDelay }}>
                    <div className="sdv-com-mov-icon is-registration">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 22V4" />
                        <path d="M4 4h13l-2 4 2 4H4" />
                      </svg>
                    </div>
                    <div className="sdv-com-mov-content">
                      <div className="sdv-com-mov-top">
                        <span className="sdv-com-mov-badge is-registration">Registro</span>
                        <span className="sdv-com-mov-name">Chegada da amostra</span>
                      </div>
                      <div className="sdv-com-mov-bottom">
                        <span>{formatMovementDate(entry.sortKey)}</span>
                      </div>
                    </div>
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
                        <span>Amostra fisica</span>
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
                <div key={item.key} className="sdv-com-mov" style={{ animationDelay }}>
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
            <span>Nenhuma movimentacao registrada</span>
          </div>
        )}
      </div>

      <SampleMovementModal
        session={session}
        open={createOpen}
        mode="create"
        saving={saving}
        title={createType === 'SALE' ? 'Registrar venda' : 'Registrar perda'}
        initialMovementType={createType}
        availableSacks={sample.availableSacks ?? 0}
        blend={sample.isBlend ? { sampleId, ownerClientId: sample.ownerClientId ?? null } : null}
        activeBlends={!sample.isBlend ? activeBlends : []}
        onAssignOwner={async (ownerClientId) => {
          // Liga B4 Fase 5b (F3.A): atribui o dono à liga sem dono e recarrega
          // o detalhe — o modal continua aberto e reflete o dono preenchido.
          await updateRegistration(session, sampleId, {
            expectedVersion: sample.version,
            after: { ownerClientId },
            reasonCode: 'DATA_FIX',
            reasonText: 'Atribuicao de dono a liga antes da movimentacao comercial',
          });
          await onRefresh();
        }}
        onClose={() => {
          if (!saving) {
            setCreateOpen(false);
            clearFeedback();
          }
        }}
        stampType={stampType}
        onSubmit={async (data) => {
          setSaving(true);
          clearFeedback();

          try {
            await createSampleMovement(session, sampleId, {
              expectedVersion: sample.version,
              movementType: data.movementType,
              buyerClientId: data.buyerClientId,
              buyerUnitId: data.buyerUnitId,
              quantitySacks: data.quantitySacks,
              movementDate: data.movementDate,
              notes: data.notes,
              lossReasonText: data.lossReasonText,
            });

            setStampType(data.movementType);
            if (stampTimeoutRef.current !== null) {
              window.clearTimeout(stampTimeoutRef.current);
            }
            stampTimeoutRef.current = window.setTimeout(() => {
              stampTimeoutRef.current = null;
              void finishStamp();
            }, 1500);
          } catch (cause) {
            // Liga B4 Fase 5: rede de segurança pro 409 BLEND_HAS_BLOCKED_DESCENDANTS
            // (corrida — uma origem ficou sem saldo entre a pré-validação e o
            // submit). Mensagem pt-BR em vez do texto técnico do backend.
            if (
              cause instanceof ApiError &&
              cause.status === 409 &&
              cause.details !== null &&
              typeof cause.details === 'object' &&
              (cause.details as { code?: string }).code === 'BLEND_HAS_BLOCKED_DESCENDANTS'
            ) {
              setError(
                'Não foi possível concluir: uma origem desta liga foi vendida ou perdida e não tem mais saldo pra cascata. Recarregue a página e confira as origens.'
              );
            } else {
              setError(
                cause instanceof ApiError ? cause.message : 'Falha ao registrar movimentacao'
              );
            }
          } finally {
            setSaving(false);
          }
        }}
      />

      {cancelMovement
        ? createPortal(
            <div className="app-modal-backdrop">
              <section
                ref={cancelTrapRef}
                className="app-modal is-themed sample-detail-compact-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="cancel-mov-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="cancel-mov-title" className="app-modal-title">
                      {sample.isBlend ? 'Cancelar movimentação da liga' : 'Cancelar movimentação'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="app-modal-close"
                    onClick={() => setCancelMovement(null)}
                    disabled={saving}
                    aria-label="Fechar"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </header>

                <div className="app-modal-content">
                  {error ? <p className="sdv-modal-error">{error}</p> : null}

                  {sample.isBlend ? (
                    <div className="sdv-warn-box">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                        <path d="M12 9v4" />
                        <path d="M12 17h.01" />
                      </svg>
                      <div className="sdv-warn-text">
                        <strong>
                          Isto cancela a{' '}
                          {cancelMovement.movementType === 'SALE' ? 'venda' : 'perda'} da liga
                          inteira
                        </strong>
                        A cascata é desfeita em todas as origens — elas voltam ao saldo anterior.
                        Informe o motivo para manter a auditoria consistente.
                      </div>
                    </div>
                  ) : (
                    <p className="sdv-modal-hint">
                      Informe o motivo para manter a auditoria consistente.
                    </p>
                  )}

                  <label className="app-modal-field">
                    <span className="app-modal-label">Motivo do cancelamento</span>
                    <input
                      className="app-modal-input"
                      value={cancelReasonText}
                      disabled={saving}
                      onChange={(event) => setCancelReasonText(event.target.value)}
                      placeholder="Descreva o motivo"
                    />
                  </label>

                  <div className="app-modal-actions">
                    <button
                      type="button"
                      className="app-modal-submit is-danger"
                      disabled={saving || cancelReasonText.trim().length === 0}
                      onClick={async () => {
                        if (!cancelMovement) return;
                        setSaving(true);
                        clearFeedback();
                        try {
                          await cancelSampleMovement(session, sampleId, cancelMovement.id, {
                            expectedVersion: sample.version,
                            reasonText: cancelReasonText.trim(),
                          });
                          setCancelMovement(null);
                          setCancelReasonText('');
                          await onRefresh();
                        } catch (cause) {
                          setError(
                            cause instanceof ApiError
                              ? cause.message
                              : 'Falha ao cancelar movimentacao'
                          );
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      {saving ? 'Cancelando...' : 'Confirmar cancelamento'}
                    </button>
                    <button
                      type="button"
                      className="app-modal-secondary"
                      onClick={() => setCancelMovement(null)}
                      disabled={saving}
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
