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
import type { ClientUnitInput } from '../../lib/types';

// L5: ClientUnit so existe em PF (filial). PJ guarda dados direto em Client.
// 14.7.I: edit inline absorvido pelo ClientUnitDetailModal — este modal e
// SO pra criacao de nova filial (Nova filial via "+").
type ClientUnitModalProps = {
  open: boolean;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (data: ClientUnitInput) => Promise<void> | void;
};

type FormState = {
  name: string;
  cnpj: string;
  phone: string;
  addressLine: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  complement: string;
  registrationNumber: string;
  car: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  cnpj: '',
  phone: '',
  addressLine: '',
  district: '',
  city: '',
  state: '',
  postalCode: '',
  complement: '',
  registrationNumber: '',
  car: '',
};

function formToInput(form: FormState, cnpjDigits: string): ClientUnitInput {
  const trim = (v: string) => (v.trim() ? v.trim() : null);
  return {
    name: form.name.trim(),
    cnpj: cnpjDigits || null,
    legalName: null,
    tradeName: null,
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
  saving,
  errorMessage,
  onClose,
  onSubmit,
}: ClientUnitModalProps) {
  const focusTrapRef = useFocusTrap(open);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const cnpjMask = useDocumentMask('cnpj');
  const cep = useCepLookup(open ? form.postalCode : '');

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY_FORM });
    cnpjMask.setRaw('');
    cep.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const submitDisabled =
    saving || !form.name.trim() || (cnpjMask.digits.length > 0 && !cnpjMask.isValid);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!form.name.trim()) return;
    if (cnpjMask.digits.length > 0 && !cnpjMask.isValid) return;
    await onSubmit(formToInput(form, cnpjMask.digits));
  }

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal is-themed is-action client-unit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-unit-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h3 id="client-unit-modal-title" className="app-modal-title">
              Nova filial
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
          <div className="sdv-edit-row">
            <label className="app-modal-field">
              <span className="app-modal-label">Nome (obrigatório)</span>
              <input
                className="app-modal-input"
                value={form.name}
                disabled={saving}
                maxLength={160}
                required
                onChange={(event) => update('name', event.target.value.toUpperCase())}
              />
            </label>
            <label className="app-modal-field">
              <span className="app-modal-label">CAR (Cadastro Ambiental Rural)</span>
              <input
                className="app-modal-input"
                value={form.car}
                disabled={saving}
                maxLength={80}
                onChange={(event) => update('car', event.target.value.toUpperCase())}
              />
            </label>
          </div>

          <div className="sdv-edit-row">
            <label className="app-modal-field">
              <span className="app-modal-label">CNPJ (opcional)</span>
              <input
                className={`app-modal-input${cnpjMask.error ? ' has-error' : ''}`}
                value={cnpjMask.masked}
                disabled={saving}
                inputMode="numeric"
                onChange={cnpjMask.onChange}
                onBlur={cnpjMask.onBlur}
              />
              {cnpjMask.error ? (
                <span className="sdv-edit-error" role="alert">
                  {cnpjMask.error}
                </span>
              ) : null}
            </label>
            <label className="app-modal-field">
              <span className="app-modal-label">Inscrição estadual</span>
              <input
                className="app-modal-input"
                value={form.registrationNumber}
                disabled={saving}
                inputMode="numeric"
                onChange={(event) =>
                  update('registrationNumber', maskRegistrationNumberInput(event.target.value))
                }
              />
            </label>
          </div>

          <div className="sdv-edit-row" style={{ gridTemplateColumns: '1fr 2fr 0.6fr' }}>
            <label className="app-modal-field">
              <span className="app-modal-label">
                CEP
                {cep.loading ? (
                  <span className="sdv-cep-spinner" aria-hidden="true">
                    {' '}
                    ⌛
                  </span>
                ) : null}
              </span>
              <input
                className="app-modal-input"
                value={form.postalCode}
                disabled={saving}
                inputMode="numeric"
                onChange={(event) => update('postalCode', maskPostalCodeInput(event.target.value))}
              />
            </label>
            <label className="app-modal-field">
              <span className="app-modal-label">Cidade</span>
              <input
                className="app-modal-input"
                value={form.city}
                disabled={saving}
                onChange={(event) => update('city', event.target.value.toUpperCase())}
              />
            </label>
            <label className="app-modal-field">
              <span className="app-modal-label">UF</span>
              <input
                className="app-modal-input"
                value={form.state}
                disabled={saving}
                maxLength={2}
                onChange={(event) => update('state', event.target.value.toUpperCase())}
              />
            </label>
          </div>

          <div className="sdv-edit-row">
            <label className="app-modal-field">
              <span className="app-modal-label">Logradouro</span>
              <input
                className="app-modal-input"
                value={form.addressLine}
                disabled={saving}
                onChange={(event) => update('addressLine', event.target.value.toUpperCase())}
              />
            </label>
            <label className="app-modal-field">
              <span className="app-modal-label">Bairro</span>
              <input
                className="app-modal-input"
                value={form.district}
                disabled={saving}
                onChange={(event) => update('district', event.target.value.toUpperCase())}
              />
            </label>
          </div>

          <div className="sdv-edit-row">
            <label className="app-modal-field">
              <span className="app-modal-label">Complemento</span>
              <input
                className="app-modal-input"
                value={form.complement}
                disabled={saving}
                maxLength={120}
                onChange={(event) => update('complement', event.target.value.toUpperCase())}
              />
            </label>
            <label className="app-modal-field">
              <span className="app-modal-label">Telefone</span>
              <input
                className="app-modal-input"
                value={form.phone}
                disabled={saving}
                inputMode="numeric"
                onChange={(event) => update('phone', maskPhoneInput(event.target.value))}
              />
            </label>
          </div>

          <div className="app-modal-actions client-unit-modal-actions">
            <button
              type="button"
              className="app-modal-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button type="submit" className="app-modal-submit" disabled={submitDisabled}>
              {saving ? 'Salvando...' : 'Criar filial'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
