'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { BottomSheet } from '../BottomSheet';
import { SuccessCheckOverlay } from '../SuccessCheckOverlay';
import {
  maskPhoneInput,
  maskPostalCodeInput,
  maskRegistrationNumberInput,
} from '../../lib/client-field-formatters';
import { useCepLookup } from '../../lib/clients/use-cep-lookup';
import { useDocumentMask } from '../../lib/use-document-mask';
import type { ClientUnitInput } from '../../lib/types';

// L5: ClientUnit so existe em PF (filial). PJ guarda dados direto em Client.
// 14.7.I: edit inline absorvido pelo ClientUnitDetailModal — este modal e
// SO pra criacao de nova filial (Nova filial via "+").
// Rodada 5 FV: deixou de ser modal central — e um PAINEL LATERAL (side-sheet
// stacked, desliza da direita por cima do drawer/sheet que o abriu; mobile =
// bottom sheet empilhado). A seta ← da borda e o Cancelar (o botao textual
// morreu); submit mora no footer sticky do sheet.
type ClientUnitModalProps = {
  open: boolean;
  saving: boolean;
  success?: boolean;
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
  success = false,
  errorMessage,
  onClose,
  onSubmit,
}: ClientUnitModalProps) {
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

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDismissAttempt={() => !saving && !success}
      title="Nova filial"
      ariaLabel="Nova filial"
      stacked
      closeVariant="edge-back"
      dragDisabled={saving || success}
      className="client-panel-sheet side-sheet"
      footer={
        success ? null : (
          <button
            type="submit"
            form="client-unit-create-form"
            className="app-modal-submit"
            disabled={submitDisabled}
          >
            {saving ? 'Salvando...' : 'Criar filial'}
          </button>
        )
      }
    >
      <>
        {errorMessage ? <p className="client-unit-modal-error">{errorMessage}</p> : null}

        <form
          id="client-unit-create-form"
          className="client-unit-modal-form"
          onSubmit={handleSubmit}
        >
          <div className="client-unit-modal-body">
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
                  onChange={(event) =>
                    update('postalCode', maskPostalCodeInput(event.target.value))
                  }
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
          </div>
        </form>

        {/* Check canonico (rodada 6): overlay sobre o painel; o form fica
              montado embaixo — o reset do proximo open limpa o estado. */}
        <SuccessCheckOverlay show={success} />
      </>
    </BottomSheet>
  );
}
