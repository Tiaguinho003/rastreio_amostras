'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useFocusTrap } from '../../lib/use-focus-trap';
import type { ClientBranchInput, ClientBranchSummary } from '../../lib/types';

type ClientBranchModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  branch?: ClientBranchSummary | null;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (data: ClientBranchInput, reasonText: string | null) => Promise<void> | void;
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
  registrationType: string;
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
  registrationType: '',
  reasonText: '',
};

function branchToForm(branch: ClientBranchSummary | null | undefined): FormState {
  if (!branch) return { ...EMPTY_FORM };
  return {
    name: branch.name ?? '',
    cnpj: branch.cnpj ?? '',
    legalName: branch.legalName ?? '',
    tradeName: branch.tradeName ?? '',
    phone: branch.phone ?? '',
    addressLine: branch.addressLine ?? '',
    district: branch.district ?? '',
    city: branch.city ?? '',
    state: branch.state ?? '',
    postalCode: branch.postalCode ?? '',
    complement: branch.complement ?? '',
    registrationNumber: branch.registrationNumber ?? '',
    registrationType: branch.registrationType ?? '',
    reasonText: '',
  };
}

function formToInput(form: FormState): ClientBranchInput {
  const trim = (v: string) => (v.trim() ? v.trim() : null);
  return {
    name: trim(form.name),
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
    registrationType: trim(form.registrationType),
  };
}

export function ClientBranchModal({
  open,
  mode,
  branch = null,
  saving,
  errorMessage,
  onClose,
  onSubmit,
}: ClientBranchModalProps) {
  const focusTrapRef = useFocusTrap(open);
  const [form, setForm] = useState<FormState>(branchToForm(branch));

  useEffect(() => {
    if (!open) return;
    setForm(branchToForm(branch));
  }, [open, branch]);

  if (!open) return null;

  const isEdit = mode === 'edit';
  const title = isEdit
    ? branch?.isPrimary
      ? 'Editar matriz'
      : `Editar filial ${branch?.code ?? ''}`
    : 'Nova filial';

  const submitDisabled = saving || (isEdit && !form.reasonText.trim());

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (isEdit && !form.reasonText.trim()) return;
    const input = formToInput(form);
    const reason = isEdit ? form.reasonText.trim() : null;
    await onSubmit(input, reason);
  }

  return createPortal(
    <div className="app-modal-backdrop">
      <section
        ref={focusTrapRef}
        className="app-modal cdm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-branch-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="cdm-header">
          <h3 id="client-branch-modal-title" className="cdm-header-name">
            {title}
            {branch?.isPrimary ? (
              <span className="badge badge-success" style={{ marginLeft: 8 }}>
                Matriz
              </span>
            ) : null}
          </h3>
          <button
            type="button"
            className="app-modal-close cdm-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {errorMessage ? <p className="sdv-modal-error">{errorMessage}</p> : null}

        <form className="sdv-edit-fields" onSubmit={handleSubmit}>
          <h4 className="sdv-edit-section">Identificação</h4>
          <label className="sdv-edit-field">
            <span className="sdv-edit-label">Nome (apelido interno)</span>
            <input
              className="sdv-edit-input"
              value={form.name}
              disabled={saving}
              maxLength={160}
              onChange={(event) => update('name', event.target.value)}
              placeholder="Ex.: Filial Varginha"
            />
          </label>
          <label className="sdv-edit-field">
            <span className="sdv-edit-label">Razão social</span>
            <input
              className="sdv-edit-input"
              value={form.legalName}
              disabled={saving}
              maxLength={200}
              onChange={(event) => update('legalName', event.target.value)}
            />
          </label>
          <label className="sdv-edit-field">
            <span className="sdv-edit-label">Nome fantasia</span>
            <input
              className="sdv-edit-input"
              value={form.tradeName}
              disabled={saving}
              maxLength={200}
              onChange={(event) => update('tradeName', event.target.value)}
            />
          </label>

          <h4 className="sdv-edit-section">Documentos</h4>
          <label className="sdv-edit-field">
            <span className="sdv-edit-label">CNPJ</span>
            <input
              className="sdv-edit-input"
              value={form.cnpj}
              disabled={saving}
              inputMode="numeric"
              onChange={(event) => update('cnpj', event.target.value)}
              placeholder="00.000.000/0000-00"
            />
          </label>
          <div className="sdv-edit-row">
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Inscrição estadual (número)</span>
              <input
                className="sdv-edit-input"
                value={form.registrationNumber}
                disabled={saving}
                onChange={(event) => update('registrationNumber', event.target.value)}
              />
            </label>
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Tipo (estadual / municipal)</span>
              <input
                className="sdv-edit-input"
                value={form.registrationType}
                disabled={saving}
                onChange={(event) => update('registrationType', event.target.value)}
                placeholder="estadual"
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
              onChange={(event) => update('addressLine', event.target.value)}
            />
          </label>
          <label className="sdv-edit-field">
            <span className="sdv-edit-label">Bairro</span>
            <input
              className="sdv-edit-input"
              value={form.district}
              disabled={saving}
              onChange={(event) => update('district', event.target.value)}
            />
          </label>
          <div className="sdv-edit-row">
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Cidade</span>
              <input
                className="sdv-edit-input"
                value={form.city}
                disabled={saving}
                onChange={(event) => update('city', event.target.value)}
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
              <span className="sdv-edit-label">CEP</span>
              <input
                className="sdv-edit-input"
                value={form.postalCode}
                disabled={saving}
                onChange={(event) => update('postalCode', event.target.value)}
              />
            </label>
            <label className="sdv-edit-field">
              <span className="sdv-edit-label">Complemento</span>
              <input
                className="sdv-edit-input"
                value={form.complement}
                disabled={saving}
                maxLength={120}
                onChange={(event) => update('complement', event.target.value)}
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
              onChange={(event) => update('phone', event.target.value)}
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

          <div className="cdm-footer">
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
