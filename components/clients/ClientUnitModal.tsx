'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  maskPhoneInput,
  maskPostalCodeInput,
  maskRegistrationNumberInput,
} from '../../lib/client-field-formatters';
import { useCepLookup } from '../../lib/clients/use-cep-lookup';
import { useDocumentMask } from '../../lib/use-document-mask';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { ClientUnitInput, ClientUnitSummary } from '../../lib/types';

// L5: ClientUnit so existe em PF (filial). PJ guarda dados direto em Client.
type ClientUnitModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  unit?: ClientUnitSummary | null;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (data: ClientUnitInput, reasonText: string | null) => Promise<void> | void;
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

const EMPTY_FORM: FormState = {
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

function unitToForm(unit: ClientUnitSummary | null | undefined): FormState {
  if (!unit) return { ...EMPTY_FORM };
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

function formToInput(form: FormState): ClientUnitInput {
  const trim = (v: string) => (v.trim() ? v.trim() : null);
  return {
    name: form.name.trim(),
    cnpj: trim(form.cnpj),
    legalName: trim(form.legalName),
    tradeName: trim(form.tradeName),
    phone: trim(form.phone),
    addressLine: trim(form.addressLine),
    district: trim(form.district),
    city: trim(form.city),
    state: trim(form.state)?.toUpperCase() ?? null,
    postalCode: trim(form.postalCode),
    complement: trim(form.complement),
    registrationNumber: trim(form.registrationNumber),
    car: trim(form.car),
  };
}

export function ClientUnitModal({
  open,
  mode,
  unit = null,
  saving,
  errorMessage,
  onClose,
  onSubmit,
}: ClientUnitModalProps) {
  const focusTrapRef = useFocusTrap(open);
  const [form, setForm] = useState<FormState>(unitToForm(unit));
  const cnpjMask = useDocumentMask('cnpj');
  const cep = useCepLookup(open ? form.postalCode : '');

  useEffect(() => {
    if (!open) return;
    setForm(unitToForm(unit));
    cnpjMask.setRaw(unit?.cnpj ?? '');
    cep.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit]);

  // Q-24: ao receber dados do CEP, preenche endereco. Sobrescreve mesmo
  // se ja havia conteudo (acao deliberada do usuario). Complemento NAO
  // e tocado.
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

  if (!open) return null;

  const isEdit = mode === 'edit';

  const title = isEdit ? `Editar filial ${unit?.code ?? ''}`.trim() : 'Nova filial';

  const submitDisabled =
    saving ||
    !form.name.trim() ||
    (isEdit && !form.reasonText.trim()) ||
    (cnpjMask.digits.length > 0 && !cnpjMask.isValid);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!form.name.trim()) return;
    if (isEdit && !form.reasonText.trim()) return;
    if (cnpjMask.digits.length > 0 && !cnpjMask.isValid) return;
    const input = { ...formToInput(form), cnpj: cnpjMask.digits || null };
    const reason = isEdit ? form.reasonText.trim() : null;
    await onSubmit(input, reason);
  }

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed client-unit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-unit-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="client-unit-modal-title" className="app-modal-title">
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {errorMessage ? <p className="client-unit-modal-error">{errorMessage}</p> : null}

        <form className="app-modal-content client-unit-modal-form" onSubmit={handleSubmit}>
          <h4 className="sdv-edit-section">Identificação</h4>
          <label className="sdv-edit-field">
            <span className="sdv-edit-label">Nome (obrigatório)</span>
            <input
              className="sdv-edit-input"
              value={form.name}
              disabled={saving}
              maxLength={160}
              required
              onChange={(event) => update('name', event.target.value.toUpperCase())}
              placeholder="Ex.: FILIAL BOM RETIRO"
            />
          </label>

          <h4 className="sdv-edit-section">Documentos</h4>
          <label className="sdv-edit-field">
            <span className="sdv-edit-label">CNPJ (opcional)</span>
            <input
              className={`sdv-edit-input${cnpjMask.error ? ' has-error' : ''}`}
              value={cnpjMask.masked}
              disabled={saving}
              inputMode="numeric"
              onChange={cnpjMask.onChange}
              onBlur={cnpjMask.onBlur}
              placeholder="00.000.000/0000-00"
            />
            {cnpjMask.error ? (
              <span className="sdv-edit-error" role="alert">
                {cnpjMask.error}
              </span>
            ) : null}
          </label>
          <div className="sdv-edit-row">
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Inscrição estadual</span>
              <input
                className="sdv-edit-input"
                value={form.registrationNumber}
                disabled={saving}
                inputMode="numeric"
                onChange={(event) =>
                  update('registrationNumber', maskRegistrationNumberInput(event.target.value))
                }
                placeholder="000.000.000.00-00"
              />
            </label>
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">CAR (Cadastro Ambiental Rural)</span>
              <input
                className="sdv-edit-input"
                value={form.car}
                disabled={saving}
                maxLength={80}
                onChange={(event) => update('car', event.target.value.toUpperCase())}
              />
            </label>
          </div>

          <h4 className="sdv-edit-section">Endereço</h4>
          <label className="sdv-edit-field">
            <span className="sdv-edit-label">Logradouro</span>
            <input
              className="sdv-edit-input"
              value={form.addressLine}
              disabled={saving}
              onChange={(event) => update('addressLine', event.target.value.toUpperCase())}
            />
          </label>
          <label className="sdv-edit-field">
            <span className="sdv-edit-label">Bairro</span>
            <input
              className="sdv-edit-input"
              value={form.district}
              disabled={saving}
              onChange={(event) => update('district', event.target.value.toUpperCase())}
            />
          </label>
          <div className="sdv-edit-row">
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Cidade</span>
              <input
                className="sdv-edit-input"
                value={form.city}
                disabled={saving}
                onChange={(event) => update('city', event.target.value.toUpperCase())}
              />
            </label>
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">UF</span>
              <input
                className="sdv-edit-input"
                value={form.state}
                disabled={saving}
                maxLength={2}
                onChange={(event) => update('state', event.target.value.toUpperCase())}
                placeholder="MG"
              />
            </label>
          </div>
          <div className="sdv-edit-row">
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">
                CEP
                {cep.loading ? (
                  <span className="sdv-cep-spinner" aria-hidden="true">
                    {' '}
                    ⌛
                  </span>
                ) : null}
              </span>
              <input
                className="sdv-edit-input"
                value={form.postalCode}
                disabled={saving}
                inputMode="numeric"
                onChange={(event) => update('postalCode', maskPostalCodeInput(event.target.value))}
                placeholder="00000-000"
              />
            </label>
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Complemento</span>
              <input
                className="sdv-edit-input"
                value={form.complement}
                disabled={saving}
                maxLength={120}
                onChange={(event) => update('complement', event.target.value.toUpperCase())}
              />
            </label>
          </div>
          <label className="sdv-edit-field">
            <span className="sdv-edit-label">Telefone</span>
            <input
              className="sdv-edit-input"
              value={form.phone}
              disabled={saving}
              inputMode="numeric"
              onChange={(event) => update('phone', maskPhoneInput(event.target.value))}
              placeholder="(00) 00000-0000"
            />
          </label>

          {isEdit ? (
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Motivo da edição (obrigatório)</span>
              <textarea
                className="sdv-edit-input"
                value={form.reasonText}
                disabled={saving}
                rows={2}
                maxLength={300}
                onChange={(event) => update('reasonText', event.target.value)}
                placeholder="Ex.: corrigir endereço"
              />
            </label>
          ) : null}

          <div className="app-modal-actions">
            <button
              type="button"
              className="app-modal-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button type="submit" className="app-modal-submit" disabled={submitDisabled}>
              {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar filial'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
