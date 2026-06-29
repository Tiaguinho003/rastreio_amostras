'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  ApiError,
  createClientUnit,
  emitSaleContract,
  getClient,
  getSaleContract,
  listContractLookups,
  updateClient,
} from '../../lib/api-client';
import {
  formatCurrencyValue,
  maskCurrencyInput,
  parseCurrencyInput,
  parseDecimalBr,
} from '../../lib/currency';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { ClientLookupField } from '../clients/ClientLookupField';
import { ClientUnitModal } from '../clients/ClientUnitModal';
import { ClientBankAccountSelectField } from './ClientBankAccountSelectField';
import type {
  ClientSummary,
  ClientUnitInput,
  ClientUnitSummary,
  ContractLookupsResponse,
  SaleContractDetail,
  SaleContractEtapa2Input,
  SessionData,
} from '../../lib/types';

type SaleContractEtapa2ModalProps = {
  session: SessionData;
  contractId: string;
  mode: 'emit' | 'view';
  onClose: () => void;
  onSaved: () => void;
};

function dateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function unitLabel(unit: ClientUnitSummary): string {
  return unit.name ?? `Filial ${unit.code}`;
}

// Fechamento (Fase B.3): modal da etapa 2 ("Gerar documento"/"Emitir"/"Editar"
// e "Revisar"/"Ver" em modo read-only). Pre-preenche via getSaleContract +
// listContractLookups + getClient (vendedor/comprador/armazens). Submete via
// emitSaleContract. Inclui "+cadastrar na hora" (filial/conta) e D49 (armazem).
export function SaleContractEtapa2Modal({
  session,
  contractId,
  mode,
  onClose,
  onSaved,
}: SaleContractEtapa2ModalProps) {
  const focusTrapRef = useFocusTrap(true);
  const readOnly = mode === 'view';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contract, setContract] = useState<SaleContractDetail | null>(null);
  const [lookups, setLookups] = useState<ContractLookupsResponse | null>(null);

  // Partes / banco / armazens
  const [seller, setSeller] = useState<ClientSummary | null>(null);
  const [sellerUnits, setSellerUnits] = useState<ClientUnitSummary[]>([]);
  const [sellerUnitId, setSellerUnitId] = useState('');
  const [buyer, setBuyer] = useState<ClientSummary | null>(null);
  const [buyerUnits, setBuyerUnits] = useState<ClientUnitSummary[]>([]);
  const [buyerUnitId, setBuyerUnitId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [buyerWarehouse, setBuyerWarehouse] = useState<ClientSummary | null>(null);
  const [sellerWarehouse, setSellerWarehouse] = useState<ClientSummary | null>(null);

  // Campos simples
  const [purchaseNumber, setPurchaseNumber] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [paymentCondition, setPaymentCondition] = useState('');
  const [agioType, setAgioType] = useState<'' | 'AGIO' | 'DESAGIO'>('');
  const [agioValue, setAgioValue] = useState('');
  const [paymentFormId, setPaymentFormId] = useState('');
  const [modalityId, setModalityId] = useState('');
  const [packagingId, setPackagingId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [observations, setObservations] = useState('');
  const [description, setDescription] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sub-modais de "+cadastrar filial"
  const [unitModalFor, setUnitModalFor] = useState<'seller' | 'buyer' | null>(null);
  const [savingUnit, setSavingUnit] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [contractRes, lookupsRes] = await Promise.all([
          getSaleContract(session, contractId),
          listContractLookups(session),
        ]);
        if (aborted) return;
        const c = contractRes.contract;
        setContract(c);
        setLookups(lookupsRes);
        setPurchaseNumber(c.purchaseNumber ?? '');
        setWeightKg(c.weightKg != null ? String(c.weightKg) : '');
        setPaymentCondition(c.paymentCondition ?? '');
        setAgioType(c.agioDesagioType ?? '');
        setAgioValue(formatCurrencyValue(c.agioDesagioValue));
        setPaymentFormId(c.paymentFormId ?? '');
        setModalityId(c.modalityId ?? '');
        setPackagingId(c.packagingId ?? '');
        setInvoiceDate(dateInputValue(c.invoiceDate));
        setPaymentDate(dateInputValue(c.paymentDate));
        setObservations(c.observations ?? '');
        setDescription(c.description ?? '');
        setSellerUnitId(c.sellerUnitId ?? '');
        setBuyerUnitId(c.buyerUnitId ?? '');
        setBankAccountId(c.sellerBankAccountId ?? '');

        const [sellerD, buyerD, bwD, swD] = await Promise.all([
          c.sellerClientId ? getClient(session, c.sellerClientId).catch(() => null) : null,
          c.buyerClientId ? getClient(session, c.buyerClientId).catch(() => null) : null,
          c.buyerWarehouseClientId
            ? getClient(session, c.buyerWarehouseClientId).catch(() => null)
            : null,
          c.sellerWarehouseClientId
            ? getClient(session, c.sellerWarehouseClientId).catch(() => null)
            : null,
        ]);
        if (aborted) return;
        if (sellerD) {
          setSeller(sellerD.client);
          setSellerUnits(sellerD.units);
        }
        if (buyerD) {
          setBuyer(buyerD.client);
          setBuyerUnits(buyerD.units);
        }
        if (bwD) setBuyerWarehouse(bwD.client);
        if (swD) setSellerWarehouse(swD.client);
      } catch (cause) {
        if (!aborted) {
          setLoadError(cause instanceof ApiError ? cause.message : 'Falha ao carregar o contrato.');
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [session, contractId]);

  const sellerIsPF = seller?.personType === 'PF';
  const buyerIsPF = buyer?.personType === 'PF';

  async function handleSelectSeller(client: ClientSummary | null) {
    setSeller(client);
    setSellerUnitId('');
    setBankAccountId('');
    setError(null);
    if (!client) {
      setSellerUnits([]);
      return;
    }
    try {
      const detail = await getClient(session, client.id);
      setSeller(detail.client);
      setSellerUnits(detail.units);
    } catch {
      setSellerUnits(client.units ?? []);
    }
  }

  async function handleSelectWarehouse(which: 'buyer' | 'seller', client: ClientSummary | null) {
    if (which === 'buyer') setBuyerWarehouse(client);
    else setSellerWarehouse(client);
    setError(null);
    // D49: liga isWarehouse no cliente escolhido (best-effort — o contrato
    // guarda a referencia mesmo se isto falhar).
    if (client && !client.isWarehouse) {
      try {
        await updateClient(session, client.id, {
          isWarehouse: true,
          reasonText: 'Definido como armazem em um contrato (Fechamento)',
        });
      } catch {
        /* nao bloqueia o fluxo */
      }
    }
  }

  async function handleCreateUnit(data: ClientUnitInput) {
    const party = unitModalFor === 'seller' ? seller : buyer;
    if (!party) return;
    setSavingUnit(true);
    setUnitError(null);
    try {
      const res = await createClientUnit(session, party.id, data);
      const detail = await getClient(session, party.id);
      if (unitModalFor === 'seller') {
        setSellerUnits(detail.units);
        setSellerUnitId(res.unit.id);
      } else {
        setBuyerUnits(detail.units);
        setBuyerUnitId(res.unit.id);
      }
      setUnitModalFor(null);
    } catch (cause) {
      setUnitError(cause instanceof ApiError ? cause.message : 'Falha ao cadastrar a filial.');
    } finally {
      setSavingUnit(false);
    }
  }

  const missingRequired =
    !seller ||
    !bankAccountId ||
    !paymentFormId ||
    !modalityId ||
    !packagingId ||
    !invoiceDate ||
    !paymentDate ||
    (sellerIsPF && !sellerUnitId) ||
    (buyerIsPF && !buyerUnitId) ||
    (agioType !== '' && !agioValue.trim());

  async function handleSubmit() {
    if (!contract || !seller) return;
    if (missingRequired) {
      setError('Preencha os campos obrigatórios da etapa 2.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload: SaleContractEtapa2Input = {
      expectedVersion: contract.version,
      sellerClientId: seller.id,
      sellerUnitId: sellerIsPF ? sellerUnitId || null : null,
      buyerUnitId: buyerIsPF ? buyerUnitId || null : null,
      sellerBankAccountId: bankAccountId,
      buyerWarehouseClientId: buyerWarehouse?.id ?? null,
      sellerWarehouseClientId: sellerWarehouse?.id ?? null,
      paymentFormId,
      modalityId,
      packagingId,
      invoiceDate,
      paymentDate,
      purchaseNumber: purchaseNumber.trim() || null,
      paymentCondition: paymentCondition.trim() || null,
      observations: observations.trim() || null,
      description: description.trim() || null,
      weightKg: weightKg.trim() ? parseDecimalBr(weightKg) : null,
      agioDesagioType: agioType || null,
      agioDesagioValue: agioType ? parseCurrencyInput(agioValue) : null,
    };
    try {
      await emitSaleContract(session, contractId, payload);
      onSaved();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError('Este contrato foi modificado. Recarregue a página e tente de novo.');
      } else {
        setError(cause instanceof ApiError ? cause.message : 'Falha ao emitir o contrato.');
      }
    } finally {
      setSaving(false);
    }
  }

  const disabled = readOnly || saving;

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action ctr-etapa2-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ctr-etapa2-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="ctr-etapa2-title" className="app-modal-title">
              {readOnly ? 'Contrato' : 'Gerar documento'}
              {contract ? ` ${contract.contractNumber}` : ''}
            </h3>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        {error ? <p className="sdv-modal-error">{error}</p> : null}
        {loadError ? <p className="sdv-modal-error">{loadError}</p> : null}

        {loading ? (
          <div className="app-modal-content">
            <p className="ctr-modal-loading">Carregando...</p>
          </div>
        ) : (
          <div className="app-modal-content ctr-etapa2-content">
            {/* Partes */}
            <p className="ctr-section-title">Partes</p>

            <div className="app-modal-field">
              <span className="app-modal-label">Vendedor</span>
              <ClientLookupField
                session={session}
                label="Vendedor"
                kind="owner"
                selectedClient={seller}
                disabled={disabled}
                compact
                onSelectClient={(client) => void handleSelectSeller(client)}
                emptyMessage="Nenhum vendedor encontrado."
              />
            </div>

            {sellerIsPF ? (
              <label className="app-modal-field">
                <span className="app-modal-label">Filial do vendedor</span>
                <select
                  className="app-modal-input"
                  value={sellerUnitId}
                  disabled={disabled}
                  onChange={(event) => {
                    setSellerUnitId(event.target.value);
                    setError(null);
                  }}
                >
                  <option value="">Selecione a filial</option>
                  {sellerUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unitLabel(unit)}
                    </option>
                  ))}
                </select>
                {!readOnly ? (
                  <button
                    type="button"
                    className="ctr-inline-add"
                    onClick={() => {
                      setUnitError(null);
                      setUnitModalFor('seller');
                    }}
                  >
                    + cadastrar filial
                  </button>
                ) : null}
              </label>
            ) : null}

            <div className="app-modal-field">
              <span className="app-modal-label">Comprador</span>
              <input
                className="app-modal-input"
                value={buyer?.displayName ?? '—'}
                disabled
                readOnly
              />
            </div>

            {buyerIsPF ? (
              <label className="app-modal-field">
                <span className="app-modal-label">Filial do comprador</span>
                <select
                  className="app-modal-input"
                  value={buyerUnitId}
                  disabled={disabled}
                  onChange={(event) => {
                    setBuyerUnitId(event.target.value);
                    setError(null);
                  }}
                >
                  <option value="">Selecione a filial</option>
                  {buyerUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unitLabel(unit)}
                    </option>
                  ))}
                </select>
                {!readOnly ? (
                  <button
                    type="button"
                    className="ctr-inline-add"
                    onClick={() => {
                      setUnitError(null);
                      setUnitModalFor('buyer');
                    }}
                  >
                    + cadastrar filial
                  </button>
                ) : null}
              </label>
            ) : null}

            {/* Banco & armazéns */}
            <p className="ctr-section-title">Banco e armazéns</p>

            <div className="app-modal-field">
              <span className="app-modal-label">Banco do vendedor</span>
              <ClientBankAccountSelectField
                session={session}
                clientId={seller?.id ?? null}
                value={bankAccountId}
                disabled={disabled}
                defaultHolderName={seller?.displayName ?? null}
                defaultHolderTaxId={seller?.cnpj ?? seller?.cpf ?? null}
                onChange={(id) => {
                  setBankAccountId(id ?? '');
                  setError(null);
                }}
              />
            </div>

            <div className="app-modal-field">
              <span className="app-modal-label">Armazém do comprador (opcional)</span>
              <ClientLookupField
                session={session}
                label="Armazém do comprador"
                kind="any"
                selectedClient={buyerWarehouse}
                disabled={disabled}
                compact
                onSelectClient={(client) => void handleSelectWarehouse('buyer', client)}
                emptyMessage="Nenhum cliente encontrado."
              />
            </div>

            <div className="app-modal-field">
              <span className="app-modal-label">Armazém do vendedor (opcional)</span>
              <ClientLookupField
                session={session}
                label="Armazém do vendedor"
                kind="any"
                selectedClient={sellerWarehouse}
                disabled={disabled}
                compact
                onSelectClient={(client) => void handleSelectWarehouse('seller', client)}
                emptyMessage="Nenhum cliente encontrado."
              />
            </div>

            {/* Pagamento & logística */}
            <p className="ctr-section-title">Pagamento e logística</p>

            <label className="app-modal-field">
              <span className="app-modal-label">Forma de pagamento</span>
              <select
                className="app-modal-input"
                value={paymentFormId}
                disabled={disabled}
                onChange={(event) => {
                  setPaymentFormId(event.target.value);
                  setError(null);
                }}
              >
                <option value="">Selecione</option>
                {(lookups?.paymentForms ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="app-modal-field">
              <span className="app-modal-label">Modalidade</span>
              <select
                className="app-modal-input"
                value={modalityId}
                disabled={disabled}
                onChange={(event) => {
                  setModalityId(event.target.value);
                  setError(null);
                }}
              >
                <option value="">Selecione</option>
                {(lookups?.modalities ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="app-modal-field">
              <span className="app-modal-label">Embalagem</span>
              <select
                className="app-modal-input"
                value={packagingId}
                disabled={disabled}
                onChange={(event) => {
                  setPackagingId(event.target.value);
                  setError(null);
                }}
              >
                <option value="">Selecione</option>
                {(lookups?.packagings ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="app-modal-field">
              <span className="app-modal-label">Condição de pagamento (opcional)</span>
              <input
                className="app-modal-input"
                value={paymentCondition}
                disabled={disabled}
                onChange={(event) => setPaymentCondition(event.target.value)}
                placeholder="Ex.: 50% na retirada, 50% em 30 dias"
              />
            </label>

            <label className="app-modal-field">
              <span className="app-modal-label">Data de faturamento</span>
              <input
                className="app-modal-input"
                type="date"
                value={invoiceDate}
                disabled={disabled}
                onChange={(event) => {
                  setInvoiceDate(event.target.value);
                  setError(null);
                }}
              />
            </label>

            <label className="app-modal-field">
              <span className="app-modal-label">Data de pagamento</span>
              <input
                className="app-modal-input"
                type="date"
                value={paymentDate}
                disabled={disabled}
                onChange={(event) => {
                  setPaymentDate(event.target.value);
                  setError(null);
                }}
              />
            </label>

            {/* Valores */}
            <p className="ctr-section-title">Valores</p>

            <label className="app-modal-field">
              <span className="app-modal-label">Número de compra (opcional)</span>
              <input
                className="app-modal-input"
                value={purchaseNumber}
                disabled={disabled}
                onChange={(event) => setPurchaseNumber(event.target.value)}
                placeholder="Referência externa"
              />
            </label>

            <label className="app-modal-field">
              <span className="app-modal-label">Peso (Kg) (opcional)</span>
              <input
                className="app-modal-input"
                inputMode="decimal"
                value={weightKg}
                disabled={disabled}
                onChange={(event) => setWeightKg(event.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0,00"
              />
            </label>

            <div className="ctr-agio-row">
              <label className="app-modal-field">
                <span className="app-modal-label">Ágio/Deságio (opcional)</span>
                <select
                  className="app-modal-input"
                  value={agioType}
                  disabled={disabled}
                  onChange={(event) => {
                    setAgioType(event.target.value as '' | 'AGIO' | 'DESAGIO');
                    setError(null);
                  }}
                >
                  <option value="">Nenhum</option>
                  <option value="AGIO">Ágio</option>
                  <option value="DESAGIO">Deságio</option>
                </select>
              </label>
              {agioType ? (
                <label className="app-modal-field">
                  <span className="app-modal-label">Valor (R$/saca)</span>
                  <input
                    className="app-modal-input"
                    inputMode="decimal"
                    value={agioValue}
                    disabled={disabled}
                    onChange={(event) => {
                      setAgioValue(maskCurrencyInput(event.target.value));
                      setError(null);
                    }}
                    placeholder="0,00"
                  />
                </label>
              ) : null}
            </div>

            {/* Textos */}
            <p className="ctr-section-title">Textos</p>

            <label className="app-modal-field">
              <span className="app-modal-label">Observações (opcional)</span>
              <textarea
                className="app-modal-input ctr-textarea"
                value={observations}
                disabled={disabled}
                onChange={(event) => setObservations(event.target.value)}
                rows={2}
              />
            </label>

            <label className="app-modal-field">
              <span className="app-modal-label">Descrição (opcional)</span>
              <textarea
                className="app-modal-input ctr-textarea"
                value={description}
                disabled={disabled}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
              />
            </label>
          </div>
        )}

        <div className="app-modal-actions">
          <button type="button" className="app-modal-secondary" onClick={onClose} disabled={saving}>
            {readOnly ? 'Fechar' : 'Cancelar'}
          </button>
          {!readOnly ? (
            <button
              type="button"
              className="app-modal-submit"
              onClick={handleSubmit}
              disabled={saving || loading || missingRequired}
            >
              {saving ? 'Emitindo...' : 'Emitir'}
            </button>
          ) : null}
        </div>
      </section>

      {unitModalFor ? (
        <ClientUnitModal
          open
          saving={savingUnit}
          errorMessage={unitError}
          onClose={() => {
            if (!savingUnit) setUnitModalFor(null);
          }}
          onSubmit={handleCreateUnit}
        />
      ) : null}
    </div>,
    document.body
  );
}
