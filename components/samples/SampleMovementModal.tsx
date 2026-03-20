'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { ApiError, getClient } from '../../lib/api-client';
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
  onClose,
  onSubmit
}: SampleMovementModalProps) {
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

    let active = true;
    setLoadingRegistrations(true);

    getClient(session, buyerClient.id)
      .then((response) => {
        if (!active) {
          return;
        }

        const activeRegistrations = response.registrations.filter((registration) => registration.status === 'ACTIVE');
        setBuyerRegistrations(activeRegistrations);
        if (!activeRegistrations.some((registration) => registration.id === buyerRegistrationId)) {
          setBuyerRegistrationId(null);
        }
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        setBuyerRegistrations([]);
        setBuyerRegistrationId(null);
        setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar inscricoes do comprador');
      })
      .finally(() => {
        if (active) {
          setLoadingRegistrations(false);
        }
      });

    return () => {
      active = false;
    };
  }, [buyerClient, movementType, open, session]);

  const submitDisabled = useMemo(() => {
    if (!quantitySacks.trim() || !movementDate) {
      return true;
    }

    if (showBuyerFields && !buyerClient) {
      return true;
    }

    if (showBuyerFields && !notes.trim()) {
      return true;
    }

    if (!showBuyerFields && !lossReasonText.trim()) {
      return true;
    }

    if (mode === 'edit' && !reasonText.trim()) {
      return true;
    }

    return false;
  }, [buyerClient, lossReasonText, mode, movementDate, notes, quantitySacks, reasonText, showBuyerFields]);

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

    if (showBuyerFields && !notes.trim()) {
      setError('Informe uma observacao para registrar a venda.');
      return;
    }

    if (!showBuyerFields && !lossReasonText.trim()) {
      setError('Informe o motivo da perda.');
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

  return (
    <div className="client-modal-backdrop" onClick={() => !saving && onClose()}>
      <section
        className="client-modal panel stack sample-movement-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sample-movement-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="client-modal-header">
          <h3 id="sample-movement-modal-title" style={{ margin: 0 }}>
            {title}
          </h3>
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>
            Fechar
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <form className="stack" onSubmit={handleSubmit}>
          {mode === 'create' ? (
            <label>
              Tipo de movimentacao
              <select
                value={movementType}
                disabled={saving}
                onChange={(event) => {
                  const nextType = event.target.value as SampleMovementType;
                  setMovementType(nextType);
                  setError(null);
                  if (nextType === 'LOSS') {
                    setBuyerClient(null);
                    setBuyerRegistrationId(null);
                  }
                }}
              >
                <option value="SALE">Venda</option>
                <option value="LOSS">Perda</option>
              </select>
            </label>
          ) : (
            <p className="sample-commercial-summary-copy" style={{ marginTop: 0 }}>
              Tipo: <strong>{movementType === 'SALE' ? 'Venda' : 'Perda'}</strong>
            </p>
          )}

          {showBuyerFields ? (
            <>
              <ClientLookupField
                session={session}
                label="Comprador"
                kind="buyer"
                selectedClient={buyerClient}
                onSelectClient={(client) => {
                  setBuyerClient(client);
                  setBuyerRegistrationId(null);
                  setError(null);
                }}
                emptyMessage="Nenhum comprador ativo encontrado."
              />

              <ClientRegistrationSelect
                label="Inscricao do comprador (opcional)"
                registrations={buyerRegistrations}
                value={buyerRegistrationId}
                disabled={!buyerClient || loadingRegistrations || saving}
                onChange={setBuyerRegistrationId}
              />
            </>
          ) : (
            <label>
              Motivo da perda
              <textarea
                rows={3}
                value={lossReasonText}
                disabled={saving}
                onChange={(event) => setLossReasonText(event.target.value)}
                placeholder="Descreva a origem da perda"
              />
            </label>
          )}

          <div className="grid grid-2">
            <label>
              Quantidade de sacas
              <input
                value={quantitySacks}
                inputMode="numeric"
                disabled={saving}
                onChange={(event) => setQuantitySacks(event.target.value)}
              />
            </label>

            <label>
              Data da movimentacao
              <input
                type="date"
                value={movementDate}
                disabled={saving}
                onChange={(event) => setMovementDate(event.target.value)}
              />
            </label>
          </div>

          <label>
            Observacoes {showBuyerFields ? '(obrigatorio)' : '(opcional)'}
            <textarea
              rows={3}
              value={notes}
              disabled={saving}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={showBuyerFields ? 'Descreva a venda realizada' : 'Observacoes adicionais'}
            />
          </label>

          {mode === 'edit' ? (
            <label>
              Motivo da edicao
              <input
                value={reasonText}
                disabled={saving}
                onChange={(event) => setReasonText(event.target.value)}
                placeholder="Obrigatorio para salvar a alteracao"
              />
            </label>
          ) : null}

          <div className="row">
            <button type="submit" disabled={saving || submitDisabled}>
              {saving ? 'Salvando...' : mode === 'create' ? 'Registrar movimentacao' : 'Salvar movimentacao'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
