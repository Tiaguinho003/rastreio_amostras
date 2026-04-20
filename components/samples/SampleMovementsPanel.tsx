'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  ApiError,
  cancelSampleMovement,
  createSampleMovement,
  updateSampleMovement,
} from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type {
  SampleMovement,
  SampleMovementType,
  SampleSnapshot,
  SampleStatus,
  SessionData,
} from '../../lib/types';

// Mesmo conjunto do backend (src/samples/sample-command-service.js).
const COMMERCIAL_ALLOWED_STATUSES: readonly SampleStatus[] = [
  'REGISTRATION_CONFIRMED',
  'QR_PENDING_PRINT',
  'QR_PRINTED',
  'CLASSIFICATION_IN_PROGRESS',
  'CLASSIFIED',
];
import { SampleMovementModal } from './SampleMovementModal';

type SampleMovementsPanelProps = {
  session: SessionData;
  sampleId: string;
  sample: SampleSnapshot;
  movements: SampleMovement[];
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
  onRefresh,
}: SampleMovementsPanelProps) {
  const [createType, setCreateType] = useState<SampleMovementType>('SALE');
  const [createOpen, setCreateOpen] = useState(false);
  const [editMovement, setEditMovement] = useState<SampleMovement | null>(null);
  const [cancelMovement, setCancelMovement] = useState<SampleMovement | null>(null);
  const cancelTrapRef = useFocusTrap(cancelMovement !== null);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stampType, setStampType] = useState<SampleMovementType | null>(null);
  const stampTimeoutRef = useRef<number | null>(null);

  const sortedMovements = useMemo(() => {
    const active = movements.filter((m) => m.status === 'ACTIVE');
    const cancelled = movements.filter((m) => m.status === 'CANCELLED');
    return [...active, ...cancelled];
  }, [movements]);

  const hasMovements = sortedMovements.length > 0;

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
  const totalDeclared = sample.declared?.sacks ?? sold + lost + available;
  const total = totalDeclared || 1;
  const soldPct = (sold / total) * 100;
  const lostPct = (lost / total) * 100;
  const availPct = Math.max(0, 100 - soldPct - lostPct);

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
      <div className="sdv-card">
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
        <div className="sdv-com-bar">
          <div
            className="sdv-com-bar-seg is-sold"
            style={{ width: `${soldPct}%`, animationDelay: '0s' }}
          />
          <div
            className="sdv-com-bar-seg is-lost"
            style={{ width: `${lostPct}%`, animationDelay: '0.1s' }}
          />
          <div
            className="sdv-com-bar-seg is-avail"
            style={{ width: `${availPct}%`, animationDelay: '0.2s' }}
          />
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
      </div>

      {/* Card 2: Movimentações */}
      <div className="sdv-card">
        <div className="sdv-card-header">
          <span className="sdv-card-title">Movimentacoes</span>
          <span className="sdv-com-count">{sortedMovements.length} registros</span>
        </div>

        {error ? <p className="sdv-modal-error">{error}</p> : null}

        {hasMovements ? (
          <div className="sdv-com-movements">
            {sortedMovements.map((movement, i) => {
              const isCancelled = movement.status === 'CANCELLED';
              const isSale = movement.movementType === 'SALE';
              const buyerLabel = getMovementBuyerLabel(movement);
              return (
                <div
                  key={movement.id}
                  className={`sdv-com-mov${isCancelled ? ' is-cancelled' : ''}`}
                  style={{ animationDelay: `${i * 0.05}s` }}
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
                    </div>
                  </div>
                  {!isCancelled ? (
                    <div className="sdv-com-mov-actions">
                      <button
                        type="button"
                        className="sdv-com-mov-act"
                        onClick={() => {
                          setEditMovement(movement);
                          clearFeedback();
                        }}
                        disabled={saving}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                        </svg>
                      </button>
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

      {/* Action buttons */}
      <div className="sdv-com-actions">
        <button
          type="button"
          className="sdv-com-action-loss"
          disabled={!commercialAllowed || available <= 0}
          onClick={() => {
            setCreateType('LOSS');
            setCreateOpen(true);
            clearFeedback();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="m5 12 7 7 7-7" />
          </svg>
          Perda
        </button>
        <button
          type="button"
          className="sdv-com-action-sale"
          disabled={!commercialAllowed || available <= 0}
          onClick={() => {
            setCreateType('SALE');
            setCreateOpen(true);
            clearFeedback();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
          Venda
        </button>
      </div>

      <SampleMovementModal
        session={session}
        open={createOpen}
        mode="create"
        saving={saving}
        title={createType === 'SALE' ? 'Registrar venda' : 'Registrar perda'}
        initialMovementType={createType}
        availableSacks={sample.availableSacks ?? 0}
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
              buyerRegistrationId: data.buyerRegistrationId,
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
            setError(cause instanceof ApiError ? cause.message : 'Falha ao registrar movimentacao');
          } finally {
            setSaving(false);
          }
        }}
      />

      <SampleMovementModal
        session={session}
        open={Boolean(editMovement)}
        mode="edit"
        saving={saving}
        title={editMovement?.movementType === 'SALE' ? 'Editar venda' : 'Editar perda'}
        movement={editMovement}
        availableSacks={available}
        onClose={() => {
          if (!saving) {
            setEditMovement(null);
            clearFeedback();
          }
        }}
        onSubmit={async (data) => {
          if (!editMovement) {
            return;
          }

          setSaving(true);
          clearFeedback();

          try {
            const after: Record<string, string | number | null> = {
              quantitySacks: data.quantitySacks,
              movementDate: data.movementDate,
              notes: data.notes,
            };

            if (editMovement.movementType === 'SALE') {
              after.buyerClientId = data.buyerClientId;
              after.buyerRegistrationId = data.buyerRegistrationId;
            } else {
              after.lossReasonText = data.lossReasonText;
            }

            await updateSampleMovement(session, sampleId, editMovement.id, {
              expectedVersion: sample.version,
              after,
              reasonText: data.reasonText ?? '',
            });

            setEditMovement(null);
            await onRefresh();
          } catch (cause) {
            setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar movimentacao');
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
                className="app-modal cdm-modal"
                role="dialog"
                aria-modal="true"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="cdm-header">
                  <h3 className="cdm-header-name">Cancelar movimentacao</h3>
                  <button
                    type="button"
                    className="app-modal-close cdm-close"
                    onClick={() => setCancelMovement(null)}
                    disabled={saving}
                    aria-label="Fechar"
                  >
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>

                <p className="sdv-modal-hint">
                  Informe o motivo para manter a auditoria consistente.
                </p>

                <div className="sdv-edit-fields">
                  <label className="sdv-edit-field">
                    <span className="sdv-edit-label">Motivo do cancelamento</span>
                    <input
                      className="sdv-edit-input"
                      value={cancelReasonText}
                      disabled={saving}
                      onChange={(event) => setCancelReasonText(event.target.value)}
                      placeholder="Descreva o motivo"
                    />
                  </label>
                </div>

                <div className="sdv-edit-actions">
                  <button
                    type="button"
                    className="cdm-manage-link is-danger"
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
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
