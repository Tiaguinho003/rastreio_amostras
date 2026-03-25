'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  ApiError,
  cancelSampleMovement,
  createSampleMovement,
  updateSampleMovement
} from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type {
  SampleMovement,
  SampleMovementType,
  SampleSnapshot,
  SessionData
} from '../../lib/types';
import { SampleCommercialSummaryCard } from './SampleCommercialSummaryCard';
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
  onRefresh
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

  return (
    <section className="sample-commercial-stack">
      <SampleCommercialSummaryCard sample={sample} />

      <section className="panel stack sample-movement-panel-card">
        <div className="sample-movement-panel-head">
          <div className="sample-movement-panel-copy">
            <h3 style={{ margin: 0 }}>Movimentacoes comerciais</h3>
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="sample-movement-panel-body">
          {hasMovements ? (
            <div className="sample-movement-list">
              {sortedMovements.map((movement) => {
                const isCancelled = movement.status === 'CANCELLED';
                const isSale = movement.movementType === 'SALE';
                const buyerLabel = getMovementBuyerLabel(movement);

                return (
                  <article
                    key={movement.id}
                    className={`sample-movement-card${isCancelled ? ' is-cancelled' : ''}`}
                  >
                    <div className="sample-movement-card-head">
                      <div className="sample-movement-card-type-row">
                        <span className={`sample-movement-card-type-badge${isSale ? ' is-sale' : ' is-loss'}`}>
                          {isSale ? 'Venda' : 'Perda'}
                        </span>
                        {isCancelled ? (
                          <span className="sample-movement-card-cancelled-badge">Cancelada</span>
                        ) : null}
                        <span className="sample-movement-card-date">{formatMovementDate(movement.movementDate)}</span>
                      </div>
                      <div className="sample-movement-card-right">
                        <strong className="sample-movement-card-qty">
                          {movement.quantitySacks} {movement.quantitySacks === 1 ? 'saca' : 'sacas'}
                        </strong>
                        {!isCancelled ? (
                          <div className="sample-movement-card-actions">
                            <button
                              type="button"
                              className="secondary sample-movement-card-action-btn"
                              onClick={() => {
                                setEditMovement(movement);
                                clearFeedback();
                              }}
                              disabled={saving}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="secondary sample-movement-card-action-btn is-danger"
                              onClick={() => {
                                setCancelMovement(movement);
                                setCancelReasonText('');
                                clearFeedback();
                              }}
                              disabled={saving}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {(buyerLabel || (!isSale && movement.lossReasonText) || movement.notes) ? (
                      <div className="sample-movement-card-body">
                        {buyerLabel ? (
                          <span className="sample-movement-card-meta">{buyerLabel}</span>
                        ) : null}
                        {!isSale && movement.lossReasonText ? (
                          <span className="sample-movement-card-meta">{movement.lossReasonText}</span>
                        ) : null}
                        {movement.notes ? (
                          <span className="sample-movement-card-meta">{movement.notes}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="sample-movement-empty">
              Nenhuma movimentacao registrada. Use as acoes abaixo para registrar uma venda ou uma perda nesta amostra.
            </p>
          )}

        </div>

        <div className="sample-movement-register-actions">
          <button
            type="button"
            className="sample-movement-register-btn is-loss"
            disabled={sample.status !== 'CLASSIFIED'}
            title={sample.status !== 'CLASSIFIED' ? 'A amostra precisa estar classificada para registrar movimentacoes' : 'Registrar perda'}
            onClick={() => {
              setCreateType('LOSS');
              setCreateOpen(true);
              clearFeedback();
            }}
          >
            Perda
          </button>
          <button
            type="button"
            className="sample-movement-register-btn is-sale"
            disabled={sample.status !== 'CLASSIFIED'}
            title={sample.status !== 'CLASSIFIED' ? 'A amostra precisa estar classificada para registrar movimentacoes' : 'Registrar venda'}
            onClick={() => {
              setCreateType('SALE');
              setCreateOpen(true);
              clearFeedback();
            }}
          >
            Venda
          </button>
        </div>
      </section>

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
              lossReasonText: data.lossReasonText
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
              notes: data.notes
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
              reasonText: data.reasonText ?? ''
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

      {cancelMovement ? createPortal(
        <div className="app-modal-backdrop" onClick={() => !saving && setCancelMovement(null)}>
          <section
            ref={cancelTrapRef}
            className="app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-movement-cancel-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="sample-movement-cancel-title" className="app-modal-title">
                  Cancelar movimentacao
                </h3>
                <p className="app-modal-description">
                  Informe o motivo do cancelamento para manter a auditoria comercial consistente.
                </p>
              </div>
              <button type="button" className="app-modal-close" onClick={() => setCancelMovement(null)} disabled={saving} aria-label="Fechar">
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="app-modal-content">
              <label className="app-modal-field">
                <span className="app-modal-label">Motivo do cancelamento</span>
                <textarea
                  className="app-modal-input"
                  rows={3}
                  value={cancelReasonText}
                  disabled={saving}
                  onChange={(event) => setCancelReasonText(event.target.value)}
                />
              </label>

              <div className="app-modal-actions">
                <button
                  type="button"
                  className="app-modal-submit"
                  disabled={saving || cancelReasonText.trim().length === 0}
                  onClick={async () => {
                    if (!cancelMovement) {
                      return;
                    }

                    setSaving(true);
                    clearFeedback();

                    try {
                      await cancelSampleMovement(session, sampleId, cancelMovement.id, {
                        expectedVersion: sample.version,
                        reasonText: cancelReasonText.trim()
                      });
                      setCancelMovement(null);
                      setCancelReasonText('');
                      await onRefresh();
                    } catch (cause) {
                      setError(cause instanceof ApiError ? cause.message : 'Falha ao cancelar movimentacao');
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
                <button type="button" className="app-modal-secondary" onClick={() => setCancelMovement(null)} disabled={saving}>
                  Voltar
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body
      ) : null}
    </section>
  );
}
