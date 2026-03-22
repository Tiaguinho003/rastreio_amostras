'use client';

import { useMemo, useState } from 'react';

import {
  ApiError,
  cancelSampleMovement,
  createSampleMovement,
  updateCommercialStatus,
  updateSampleMovement
} from '../../lib/api-client';
import type {
  SampleMovement,
  SampleMovementStatus,
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

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Nao informado';
  }

  return new Date(value).toLocaleString('pt-BR');
}

export function SampleMovementsPanel({
  session,
  sampleId,
  sample,
  movements,
  onRefresh
}: SampleMovementsPanelProps) {
  const availableSacks = sample.availableSacks ?? 0;
  const [movementTypeFilter, setMovementTypeFilter] = useState<'ALL' | SampleMovementType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SampleMovementStatus>('ALL');
  const [createType, setCreateType] = useState<SampleMovementType>('SALE');
  const [createOpen, setCreateOpen] = useState(false);
  const [editMovement, setEditMovement] = useState<SampleMovement | null>(null);
  const [cancelMovement, setCancelMovement] = useState<SampleMovement | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filteredMovements = useMemo(() => {
    return movements.filter((movement) => {
      if (movementTypeFilter !== 'ALL' && movement.movementType !== movementTypeFilter) {
        return false;
      }

      if (statusFilter !== 'ALL' && movement.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [movementTypeFilter, movements, statusFilter]);

  async function handleMarkLost() {
    if (availableSacks <= 0) {
      setError('Nao ha saldo disponivel para marcar como perdido.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await updateCommercialStatus(session, sampleId, {
        expectedVersion: sample.version,
        toCommercialStatus: 'LOST',
        reasonText: `Registrar perda manual do saldo restante de ${availableSacks} sacas.`
      });
      setMessage('Perda do saldo restante registrada com sucesso.');
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao registrar perda do saldo restante');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="stack">
      <SampleCommercialSummaryCard sample={sample} updating={saving} onMarkLost={() => void handleMarkLost()} />

      <section className="panel stack">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>Movimentacoes comerciais</h3>
          </div>

          <div className="row">
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

        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="success">{message}</p> : null}

        <div className="grid grid-2">
          <label>
            Tipo
            <select value={movementTypeFilter} onChange={(event) => setMovementTypeFilter(event.target.value as 'ALL' | SampleMovementType)}>
              <option value="ALL">Todos</option>
              <option value="SALE">Vendas</option>
              <option value="LOSS">Perdas</option>
            </select>
          </label>

          <label>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'ALL' | SampleMovementStatus)}>
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Ativas</option>
              <option value="CANCELLED">Canceladas</option>
            </select>
          </label>
        </div>

        {filteredMovements.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)' }}>Nenhuma movimentacao encontrada com os filtros atuais.</p>
        ) : (
          <div className="sample-movement-list">
            {filteredMovements.map((movement) => (
              <article className="sample-movement-card" key={movement.id}>
                <div className="sample-movement-card-head">
                  <div>
                    <strong>{movement.movementType === 'SALE' ? 'Venda' : 'Perda'}</strong>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)' }}>
                      {movement.quantitySacks} sacas · {movement.status === 'ACTIVE' ? 'Ativa' : 'Cancelada'}
                    </p>
                  </div>
                  <span className="sample-movement-card-meta">{formatDateTime(movement.createdAt)}</span>
                </div>

                <div className="sample-movement-card-body">
                  <p style={{ margin: 0 }}>
                    <strong>Data do movimento:</strong> {movement.movementDate}
                  </p>
                  {movement.buyerClient ? (
                    <p style={{ margin: 0 }}>
                      <strong>Comprador:</strong> {movement.buyerClient.displayName ?? 'Nao informado'}
                    </p>
                  ) : null}
                  {movement.buyerRegistration ? (
                    <p style={{ margin: 0 }}>
                      <strong>Inscricao:</strong> {movement.buyerRegistration.registrationNumber}
                    </p>
                  ) : null}
                  {movement.lossReasonText ? (
                    <p style={{ margin: 0 }}>
                      <strong>Motivo da perda:</strong> {movement.lossReasonText}
                    </p>
                  ) : null}
                  {movement.notes ? (
                    <p style={{ margin: 0 }}>
                      <strong>Observacoes:</strong> {movement.notes}
                    </p>
                  ) : null}
                </div>

                <div className="row">
                  <button
                    type="button"
                    className="secondary"
                    disabled={saving || sample.status !== 'CLASSIFIED' || movement.status === 'CANCELLED'}
                    onClick={() => setEditMovement(movement)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={saving || sample.status !== 'CLASSIFIED' || movement.status === 'CANCELLED'}
                    onClick={() => setCancelMovement(movement)}
                  >
                    Cancelar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
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
