'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  formatPostalCode,
  maskPhoneInput,
  maskPostalCodeInput,
  maskRegistrationNumberInput,
} from '../../lib/client-field-formatters';
import { useCepLookup } from '../../lib/clients/use-cep-lookup';
import { useDocumentMask } from '../../lib/use-document-mask';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { ClientUnitInput, ClientUnitSummary } from '../../lib/types';
import { IncompleteIcon } from './IncompleteIcon';

// 14.7.I: modal de detalhe + edicao inline da filial. Substitui o fluxo
// antigo onde clicar em "Editar" abria outro modal — agora o mesmo modal
// alterna entre view e edit mode preservando o contexto.

type Mode = 'view' | 'edit';

type Props = {
  open: boolean;
  unit: ClientUnitSummary | null;
  saving: boolean;
  savingStatus: boolean;
  errorMessage: string | null;
  missingSet: Set<string>;
  onClose: () => void;
  onSave: (data: ClientUnitInput, reasonText: string) => Promise<void>;
  onInactivate: () => void;
  onReactivate: () => void;
};

type FormState = {
  name: string;
  cnpj: string;
  legalName: string;
  tradeName: string;
  phone: string;
  addressLine: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  complement: string;
  registrationNumber: string;
  car: string;
  reasonText: string;
};

function unitToForm(unit: ClientUnitSummary | null | undefined): FormState {
  if (!unit) {
    return {
      name: '',
      cnpj: '',
      legalName: '',
      tradeName: '',
      phone: '',
      addressLine: '',
      district: '',
      city: '',
      state: '',
      postalCode: '',
      complement: '',
      registrationNumber: '',
      car: '',
      reasonText: '',
    };
  }
  return {
    name: unit.name ?? '',
    cnpj: unit.cnpj ?? '',
    legalName: unit.legalName ?? '',
    tradeName: unit.tradeName ?? '',
    phone: unit.phone ?? '',
    addressLine: unit.addressLine ?? '',
    district: unit.district ?? '',
    city: unit.city ?? '',
    state: unit.state ?? '',
    postalCode: unit.postalCode ?? '',
    complement: unit.complement ?? '',
    registrationNumber: unit.registrationNumber ?? '',
    car: unit.car ?? '',
    reasonText: '',
  };
}

function trimOrNull(v: string): string | null {
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function ClientUnitDetailModal({
  open,
  unit,
  saving,
  savingStatus,
  errorMessage,
  missingSet,
  onClose,
  onSave,
  onInactivate,
  onReactivate,
}: Props) {
  const focusTrapRef = useFocusTrap(open);
  const [mode, setMode] = useState<Mode>('view');
  const [form, setForm] = useState<FormState>(() => unitToForm(unit));
  const cnpjMask = useDocumentMask('cnpj');
  const cep = useCepLookup(open && mode === 'edit' ? form.postalCode : '');

  useEffect(() => {
    if (!open) return;
    setMode('view');
    setForm(unitToForm(unit));
    cnpjMask.setRaw(unit?.cnpj ?? '');
    cep.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit]);

  useEffect(() => {
    if (!cep.data) return;
    setForm((prev) => ({
      ...prev,
      addressLine: cep.data!.addressLine || prev.addressLine,
      district: cep.data!.district || prev.district,
      city: cep.data!.city || prev.city,
      state: cep.data!.state || prev.state,
    }));
  }, [cep.data]);

  const isMissing = useMemo(() => {
    if (!unit) return () => false;
    return (field: string) => missingSet.has(`units[${unit.id}].${field}`);
  }, [missingSet, unit]);

  if (!open || !unit) return null;

  const submitDisabled =
    saving ||
    !form.name.trim() ||
    !form.reasonText.trim() ||
    (cnpjMask.digits.length > 0 && !cnpjMask.isValid);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitDisabled) return;
    const data: ClientUnitInput = {
      name: form.name.trim(),
      cnpj: cnpjMask.digits || null,
      legalName: trimOrNull(form.legalName),
      tradeName: trimOrNull(form.tradeName),
      phone: trimOrNull(form.phone),
      addressLine: trimOrNull(form.addressLine),
      district: trimOrNull(form.district),
      city: trimOrNull(form.city),
      state: trimOrNull(form.state)?.toUpperCase() ?? null,
      postalCode: trimOrNull(form.postalCode),
      complement: trimOrNull(form.complement),
      registrationNumber: trimOrNull(form.registrationNumber),
      car: trimOrNull(form.car),
    };
    await onSave(data, form.reasonText.trim());
  }

  const isInactive = unit.status === 'INACTIVE';
  const cityLabel = unit.city && unit.state ? `${unit.city}/${unit.state}` : null;

  return createPortal(
    <div className="app-modal-backdrop" onClick={onClose}>
      <section
        ref={focusTrapRef}
        className="app-modal is-themed cudm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cudm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header cudm-header">
          <div className="app-modal-title-wrap cudm-header-copy">
            <span className="cudm-header-eyebrow">Filial {unit.code}</span>
            <h3 id="cudm-title" className="app-modal-title cudm-header-name">
              {unit.name ?? unit.legalName ?? 'Sem nome'}
            </h3>
            {isInactive ? <span className="cudm-header-inactive">Inativa</span> : null}
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={saving || savingStatus}
            aria-label="Fechar"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {errorMessage ? <p className="cudm-error">{errorMessage}</p> : null}

        {mode === 'view' ? (
          <div className="app-modal-content cudm-body">
            <div className="cudm-info-grid">
              <div className="cudm-info-item">
                <span className="cudm-info-label">CNPJ</span>
                <span className="cudm-info-value">{unit.cnpj || '—'}</span>
              </div>
              <div className="cudm-info-item">
                <span
                  className={`cudm-info-label${isMissing('city') || isMissing('state') ? ' is-missing' : ''}`}
                >
                  Cidade/UF
                  {isMissing('city') || isMissing('state') ? (
                    <IncompleteIcon className="sdv-info-label-warning" />
                  ) : null}
                </span>
                <span className="cudm-info-value">{cityLabel || '—'}</span>
              </div>
              <div className="cudm-info-item is-full">
                <span className={`cudm-info-label${isMissing('addressLine') ? ' is-missing' : ''}`}>
                  Endereço
                  {isMissing('addressLine') ? (
                    <IncompleteIcon className="sdv-info-label-warning" />
                  ) : null}
                </span>
                <span className="cudm-info-value">{unit.addressLine || '—'}</span>
              </div>
              <div className="cudm-info-item">
                <span className={`cudm-info-label${isMissing('district') ? ' is-missing' : ''}`}>
                  Bairro
                  {isMissing('district') ? (
                    <IncompleteIcon className="sdv-info-label-warning" />
                  ) : null}
                </span>
                <span className="cudm-info-value">{unit.district || '—'}</span>
              </div>
              <div className="cudm-info-item">
                <span className={`cudm-info-label${isMissing('postalCode') ? ' is-missing' : ''}`}>
                  CEP
                  {isMissing('postalCode') ? (
                    <IncompleteIcon className="sdv-info-label-warning" />
                  ) : null}
                </span>
                <span className="cudm-info-value">{formatPostalCode(unit.postalCode) || '—'}</span>
              </div>
              <div className="cudm-info-item">
                <span className="cudm-info-label">Complemento</span>
                <span className="cudm-info-value">{unit.complement || '—'}</span>
              </div>
              <div className="cudm-info-item">
                <span
                  className={`cudm-info-label${isMissing('registrationNumber') ? ' is-missing' : ''}`}
                >
                  Inscrição estadual
                  {isMissing('registrationNumber') ? (
                    <IncompleteIcon className="sdv-info-label-warning" />
                  ) : null}
                </span>
                <span className="cudm-info-value">{unit.registrationNumber || '—'}</span>
              </div>
              <div className="cudm-info-item">
                <span className={`cudm-info-label${isMissing('car') ? ' is-missing' : ''}`}>
                  CAR
                  {isMissing('car') ? <IncompleteIcon className="sdv-info-label-warning" /> : null}
                </span>
                <span className="cudm-info-value">{unit.car || '—'}</span>
              </div>
              <div className="cudm-info-item">
                <span className="cudm-info-label">Telefone</span>
                <span className="cudm-info-value">{unit.phone || '—'}</span>
              </div>
            </div>

            <div className="cudm-footer">
              <button
                type="button"
                className={`cudm-status-btn${isInactive ? '' : ' is-danger'}`}
                onClick={isInactive ? onReactivate : onInactivate}
                disabled={savingStatus}
              >
                {isInactive ? 'Reativar' : 'Inativar'}
              </button>
              <button
                type="button"
                className="cudm-edit-btn"
                onClick={() => setMode('edit')}
                disabled={savingStatus}
              >
                Editar
              </button>
            </div>
          </div>
        ) : (
          <form className="app-modal-content cudm-body cudm-edit-form" onSubmit={handleSubmit}>
            <div className="cudm-info-grid">
              <label className="cudm-edit-field is-full">
                <span className="cudm-edit-label">Nome (obrigatório)</span>
                <input
                  className="cudm-edit-input"
                  value={form.name}
                  disabled={saving}
                  maxLength={160}
                  required
                  onChange={(event) => update('name', event.target.value.toUpperCase())}
                />
              </label>
              <label className="cudm-edit-field">
                <span className="cudm-edit-label">CNPJ</span>
                <input
                  className={`cudm-edit-input${cnpjMask.error ? ' has-error' : ''}`}
                  value={cnpjMask.masked}
                  disabled={saving}
                  inputMode="numeric"
                  onChange={cnpjMask.onChange}
                  onBlur={cnpjMask.onBlur}
                  placeholder="00.000.000/0000-00"
                />
                {cnpjMask.error ? <span className="cudm-edit-error">{cnpjMask.error}</span> : null}
              </label>
              <label className="cudm-edit-field">
                <span className="cudm-edit-label">CAR</span>
                <input
                  className="cudm-edit-input"
                  value={form.car}
                  disabled={saving}
                  maxLength={80}
                  onChange={(event) => update('car', event.target.value.toUpperCase())}
                />
              </label>
              <label className="cudm-edit-field is-full">
                <span className="cudm-edit-label">Endereço</span>
                <input
                  className="cudm-edit-input"
                  value={form.addressLine}
                  disabled={saving}
                  onChange={(event) => update('addressLine', event.target.value.toUpperCase())}
                />
              </label>
              <label className="cudm-edit-field">
                <span className="cudm-edit-label">Bairro</span>
                <input
                  className="cudm-edit-input"
                  value={form.district}
                  disabled={saving}
                  onChange={(event) => update('district', event.target.value.toUpperCase())}
                />
              </label>
              <label className="cudm-edit-field">
                <span className="cudm-edit-label">
                  CEP{cep.loading ? <span aria-hidden="true"> ⌛</span> : null}
                </span>
                <input
                  className="cudm-edit-input"
                  value={form.postalCode}
                  disabled={saving}
                  inputMode="numeric"
                  onChange={(event) =>
                    update('postalCode', maskPostalCodeInput(event.target.value))
                  }
                  placeholder="00000-000"
                />
              </label>
              <label className="cudm-edit-field">
                <span className="cudm-edit-label">Cidade</span>
                <input
                  className="cudm-edit-input"
                  value={form.city}
                  disabled={saving}
                  onChange={(event) => update('city', event.target.value.toUpperCase())}
                />
              </label>
              <label className="cudm-edit-field">
                <span className="cudm-edit-label">UF</span>
                <input
                  className="cudm-edit-input"
                  value={form.state}
                  disabled={saving}
                  maxLength={2}
                  onChange={(event) => update('state', event.target.value.toUpperCase())}
                  placeholder="MG"
                />
              </label>
              <label className="cudm-edit-field is-full">
                <span className="cudm-edit-label">Complemento</span>
                <input
                  className="cudm-edit-input"
                  value={form.complement}
                  disabled={saving}
                  maxLength={120}
                  onChange={(event) => update('complement', event.target.value.toUpperCase())}
                />
              </label>
              <label className="cudm-edit-field">
                <span className="cudm-edit-label">Inscrição estadual</span>
                <input
                  className="cudm-edit-input"
                  value={form.registrationNumber}
                  disabled={saving}
                  inputMode="numeric"
                  onChange={(event) =>
                    update('registrationNumber', maskRegistrationNumberInput(event.target.value))
                  }
                  placeholder="000.000.000.00-00"
                />
              </label>
              <label className="cudm-edit-field">
                <span className="cudm-edit-label">Telefone</span>
                <input
                  className="cudm-edit-input"
                  value={form.phone}
                  disabled={saving}
                  inputMode="numeric"
                  onChange={(event) => update('phone', maskPhoneInput(event.target.value))}
                  placeholder="(00) 00000-0000"
                />
              </label>
              <label className="cudm-edit-field is-full">
                <span className="cudm-edit-label">Motivo da edição (obrigatório)</span>
                <textarea
                  className="cudm-edit-input"
                  value={form.reasonText}
                  disabled={saving}
                  rows={2}
                  maxLength={300}
                  onChange={(event) => update('reasonText', event.target.value)}
                  placeholder="Ex.: corrigir endereço"
                />
              </label>
            </div>

            <div className="cudm-footer">
              <button
                type="button"
                className="cudm-cancel-btn"
                onClick={() => setMode('view')}
                disabled={saving}
              >
                Cancelar
              </button>
              <button type="submit" className="cudm-save-btn" disabled={submitDisabled}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>,
    document.body
  );
}
