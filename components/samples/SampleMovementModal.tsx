'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, getClient } from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type {
  ClientRegistrationSummary,
  ClientSummary,
  SampleMovement,
  SampleMovementType,
  SessionData
} from '../../lib/types';
import { ClientLookupField } from '../clients/ClientLookupField';
import { ClientRegistrationSelect } from '../clients/ClientRegistrationSelect';

type SampleMovementModalSubmitInput = {
  movementType: SampleMovementType;
  buyerClientId: string | null;
  buyerRegistrationId: string | null;
  quantitySacks: number;
  movementDate: string;
  notes: string | null;
  lossReasonText: string | null;
  reasonText: string | null;
};

type SampleMovementModalProps = {
  session: SessionData;
  open: boolean;
  mode: 'create' | 'edit';
  saving?: boolean;
  title: string;
  initialMovementType?: SampleMovementType;
  movement?: SampleMovement | null;
  availableSacks?: number;
  stampType?: SampleMovementType | null;
  onClose: () => void;
  onSubmit: (data: SampleMovementModalSubmitInput) => Promise<void> | void;
};

function toClientSummary(client: SampleMovement['buyerClient']): ClientSummary | null {
  if (!client) {
    return null;
  }

  return {
    id: client.id,
    code: client.code,
    personType: client.personType,
    displayName: client.displayName,
    fullName: client.fullName,
    legalName: client.legalName,
    tradeName: client.tradeName,
    cpf: client.cpf,
    cnpj: client.cnpj,
    document: client.personType === 'PF' ? client.cpf : client.cnpj,
    phone: client.phone,
    isBuyer: client.isBuyer,
    isSeller: client.isSeller,
    status: client.status,
    registrationCount: 0,
    activeRegistrationCount: 0,
    primaryCity: null,
    primaryState: null,
    createdAt: null,
    updatedAt: null
  };
}

function todayAsInputDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function SampleMovementModal({
  session,
  open,
  mode,
  saving = false,
  title,
  initialMovementType = 'SALE',
  movement = null,
  availableSacks = 0,
  stampType = null,
  onClose,
  onSubmit
}: SampleMovementModalProps) {
  const focusTrapRef = useFocusTrap(open);
  const [movementType, setMovementType] = useState<SampleMovementType>(movement?.movementType ?? initialMovementType);
  const [buyerClient, setBuyerClient] = useState<ClientSummary | null>(toClientSummary(movement?.buyerClient ?? null));
  const [buyerRegistrations, setBuyerRegistrations] = useState<ClientRegistrationSummary[]>([]);
  const [buyerRegistrationId, setBuyerRegistrationId] = useState<string | null>(movement?.buyerRegistrationId ?? null);
  const [quantitySacks, setQuantitySacks] = useState(String(movement?.quantitySacks ?? ''));
  const [movementDate, setMovementDate] = useState(movement?.movementDate ?? todayAsInputDate());
  const [notes, setNotes] = useState(movement?.notes ?? '');
  const [lossReasonText, setLossReasonText] = useState(movement?.lossReasonText ?? '');
  const [reasonText, setReasonText] = useState('');
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showBuyerFields = movementType === 'SALE';

  useEffect(() => {
    if (!open) {
      return;
    }

    setMovementType(movement?.movementType ?? initialMovementType);
    setBuyerClient(toClientSummary(movement?.buyerClient ?? null));
    setBuyerRegistrationId(movement?.buyerRegistrationId ?? null);
    setQuantitySacks(movement?.quantitySacks ? String(movement.quantitySacks) : '');
    setMovementDate(movement?.movementDate ?? todayAsInputDate());
    setNotes(movement?.notes ?? '');
    setLossReasonText(movement?.lossReasonText ?? '');
    setReasonText('');
    setError(null);
  }, [initialMovementType, movement, open]);

  useEffect(() => {
    if (!open || !buyerClient) {
      setBuyerRegistrations([]);
      setLoadingRegistrations(false);
      if (movementType === 'SALE') {
        setBuyerRegistrationId(null);
      }
      return;
    }

    const controller = new AbortController();
    setLoadingRegistrations(true);

    getClient(session, buyerClient.id, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        const activeRegistrations = response.registrations.filter((registration) => registration.status === 'ACTIVE');
        setBuyerRegistrations(activeRegistrations);
      })
      .catch((cause) => {
        if (controller.signal.aborted) {
          return;
        }

        setBuyerRegistrations([]);
        setBuyerRegistrationId(null);
        setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar inscricoes do comprador');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingRegistrations(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [buyerClient, movementType, open, session]);

  const submitDisabled = useMemo(() => {
    if (!quantitySacks.trim() || !movementDate) {
      return true;
    }

    if (showBuyerFields && !buyerClient) {
      return true;
    }

    if (mode === 'edit' && !reasonText.trim()) {
      return true;
    }

    return false;
  }, [buyerClient, mode, movementDate, quantitySacks, reasonText, showBuyerFields]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedQuantity = Number(quantitySacks);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError('Quantidade de sacas deve ser um numero inteiro maior que zero.');
      return;
    }

    if (showBuyerFields && !buyerClient) {
      setError('Selecione um comprador para registrar a venda.');
      return;
    }

    if (mode === 'edit' && !reasonText.trim()) {
      setError('Informe o motivo da edicao da movimentacao.');
      return;
    }

    setError(null);
    await onSubmit({
      movementType,
      buyerClientId: showBuyerFields ? buyerClient?.id ?? null : null,
      buyerRegistrationId: showBuyerFields ? buyerRegistrationId : null,
      quantitySacks: parsedQuantity,
      movementDate,
      notes: notes.trim() ? notes.trim() : null,
      lossReasonText: showBuyerFields ? null : lossReasonText.trim(),
      reasonText: mode === 'edit' ? reasonText.trim() : null
    });
  }

  return createPortal(
    <div className="app-modal-backdrop" onClick={() => !saving && onClose()}>
      <section
        ref={focusTrapRef}
        className="cdm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sample-movement-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cdm-header" style={{ gap: '10px' }}>
          <h3 id="sample-movement-modal-title" className="cdm-header-name" style={{ flex: 1 }}>{title}</h3>
          <button type="button" className="cdm-close" onClick={onClose} disabled={saving} aria-label="Fechar">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        {error ? <p style={{ margin: 0, fontSize: 'clamp(11px, 3vw, 12px)', color: '#c45c5c' }}>{error}</p> : null}

        <form className="sdv-edit-fields" onSubmit={handleSubmit}>
          {showBuyerFields ? (
            <>
              <div className="sdv-edit-field">
                <ClientLookupField
                  session={session}
                  label="Comprador"
                  kind="buyer"
                  selectedClient={buyerClient}
                  disabled={saving}
                  compact
                  onSelectClient={(client) => { setBuyerClient(client); setBuyerRegistrationId(null); setError(null); }}
                  emptyMessage="Nenhum comprador encontrado."
                />
              </div>
              <div className="sdv-edit-field">
                <ClientRegistrationSelect
                  label="Inscricao (opcional)"
                  registrations={buyerRegistrations}
                  value={buyerRegistrationId}
                  disabled={!buyerClient || loadingRegistrations || saving}
                  onChange={setBuyerRegistrationId}
                  compact
                />
              </div>
            </>
          ) : (
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Motivo da perda</span>
              <input className="sdv-edit-input" value={lossReasonText} disabled={saving} onChange={(event) => setLossReasonText(event.target.value)} placeholder="Descreva a origem da perda" />
            </label>
          )}

          <div className="sdv-edit-row">
            <div className="sdv-edit-field">
              <span className="sdv-edit-label">Sacas</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input className="sdv-edit-input" value={quantitySacks} inputMode="numeric" disabled={saving} onChange={(event) => setQuantitySacks(event.target.value)} style={{ flex: 1 }} />
                {availableSacks > 0 ? (
                  <button type="button" className="sdv-mov-all-btn" disabled={saving} onClick={() => setQuantitySacks(String(availableSacks))}>Todas</button>
                ) : null}
              </div>
            </div>
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Data</span>
              <input className="sdv-edit-input" type="date" value={movementDate} disabled={saving} onChange={(event) => setMovementDate(event.target.value)} />
            </label>
          </div>

          <label className="sdv-edit-field">
            <span className="sdv-edit-label">Observacoes (opcional)</span>
            <input className="sdv-edit-input" value={notes} disabled={saving} onChange={(event) => setNotes(event.target.value)} placeholder="Observacoes adicionais" />
          </label>

          {mode === 'edit' ? (
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Motivo da edicao</span>
              <input className="sdv-edit-input" value={reasonText} disabled={saving} onChange={(event) => setReasonText(event.target.value)} placeholder="Obrigatorio" />
            </label>
          ) : null}

          <div className="sdv-edit-actions" style={{ marginTop: 'clamp(4px, 1vw, 6px)' }}>
            <button type="submit" className="cdm-manage-link" disabled={saving || submitDisabled} style={{ opacity: (saving || submitDisabled) ? 0.5 : 1 }}>
              {saving ? 'Salvando...' : mode === 'create' ? 'Registrar' : 'Salvar'}
            </button>
          </div>
        </form>

        {stampType ? (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(253,249,236,0.92)', borderRadius: '20px', zIndex: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: stampType === 'SALE' ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${stampType === 'SALE' ? '#BBF7D0' : '#FECACA'}`, display: 'inline-grid', placeItems: 'center', marginBottom: 8 }}>
                <svg viewBox="0 0 24 24" style={{ width: 22, height: 22, fill: 'none', stroke: stampType === 'SALE' ? '#27AE60' : '#C0392B', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="m5 12.5 4.3 4.2L19 7" />
                </svg>
              </div>
              <p style={{ margin: 0, fontSize: 'clamp(14px, 3.8vw, 15px)', fontWeight: 700, color: '#1a1a1a' }}>{stampType === 'SALE' ? 'Venda registrada' : 'Perda registrada'}</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>,
    document.body
  );
}
