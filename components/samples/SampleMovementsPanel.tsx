'use client';

import { useState } from 'react';

import {
  ApiError,
  cancelSampleMovement,
  createSampleMovement,
  updateSampleMovement
} from '../../lib/api-client';
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

export function SampleMovementsPanel({
  session,
  sampleId,
  sample,
  movements: _movements,
  onRefresh
}: SampleMovementsPanelProps) {
  const [createType, setCreateType] = useState<SampleMovementType>('SALE');
  const [createOpen, setCreateOpen] = useState(false);
  const [editMovement, setEditMovement] = useState<SampleMovement | null>(null);
  const [cancelMovement, setCancelMovement] = useState<SampleMovement | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
        {message ? <p className="success">{message}</p> : null}

        <div className="sample-movement-panel-body">
          <p className="sample-movement-empty">
            Use as acoes abaixo para registrar uma venda ou uma perda nesta amostra.
          </p>

          <div className="sample-movement-panel-actions sample-movement-panel-actions-bottom">
            <button
              type="button"
              className="secondary"
              disabled={sample.status !== 'CLASSIFIED'}
              onClick={() => {
                setCreateType('LOSS');
                setCreateOpen(true);
                setError(null);
                setMessage(null);
              }}
            >
              Registrar perda
            </button>
            <button
              type="button"
              disabled={sample.status !== 'CLASSIFIED'}
              onClick={() => {
                setCreateType('SALE');
                setCreateOpen(true);
                setError(null);
                setMessage(null);
              }}
            >
              Registrar venda
            </button>
          </div>
        </div>
      </section>

      <SampleMovementModal
        session={session}
        open={createOpen}
        mode="create"
        saving={saving}
        title={createType === 'SALE' ? 'Registrar venda' : 'Registrar perda'}
        initialMovementType={createType}
        onClose={() => !saving && setCreateOpen(false)}
        onSubmit={async (data) => {
          setSaving(true);
          setError(null);
          setMessage(null);

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

            setCreateOpen(false);
            setMessage(data.movementType === 'SALE' ? 'Venda registrada com sucesso.' : 'Perda registrada com sucesso.');
            await onRefresh();
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
        onClose={() => !saving && setEditMovement(null)}
        onSubmit={async (data) => {
          if (!editMovement) {
            return;
          }

          setSaving(true);
          setError(null);
          setMessage(null);

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
            setMessage(editMovement.movementType === 'SALE' ? 'Venda atualizada com sucesso.' : 'Perda atualizada com sucesso.');
            await onRefresh();
          } catch (cause) {
            setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar movimentacao');
          } finally {
            setSaving(false);
          }
        }}
      />

      {cancelMovement ? (
        <div className="client-modal-backdrop" onClick={() => !saving && setCancelMovement(null)}>
          <section
            className="client-modal panel stack"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-movement-cancel-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="client-modal-header">
              <h3 id="sample-movement-cancel-title" style={{ margin: 0 }}>
                Cancelar movimentacao
              </h3>
              <button type="button" className="secondary" onClick={() => setCancelMovement(null)} disabled={saving}>
                Fechar
              </button>
            </div>

            <p style={{ margin: 0, color: 'var(--muted)' }}>
              Informe o motivo do cancelamento da movimentacao para manter a auditoria comercial consistente.
            </p>

            <label>
              Motivo do cancelamento
              <textarea rows={3} value={cancelReasonText} disabled={saving} onChange={(event) => setCancelReasonText(event.target.value)} />
            </label>

            <div className="row">
              <button
                type="button"
                disabled={saving || cancelReasonText.trim().length === 0}
                onClick={async () => {
                  if (!cancelMovement) {
                    return;
                  }

                  setSaving(true);
                  setError(null);
                  setMessage(null);

                  try {
                    await cancelSampleMovement(session, sampleId, cancelMovement.id, {
                      expectedVersion: sample.version,
                      reasonText: cancelReasonText.trim()
                    });
                    setCancelMovement(null);
                    setCancelReasonText('');
                    setMessage('Movimentacao cancelada com sucesso.');
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
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
