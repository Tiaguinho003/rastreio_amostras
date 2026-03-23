'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { ApiError, createClient } from '../../lib/api-client';
import { maskDocumentInput, maskPhoneInput } from '../../lib/client-field-formatters';
import type { ClientPersonType, ClientSummary, SessionData } from '../../lib/types';

type ClientQuickCreateModalProps = {
  session: SessionData;
  open: boolean;
  title: string;
  description?: string;
  initialSearch?: string;
  initialPersonType?: ClientPersonType;
  initialIsBuyer?: boolean;
  initialIsSeller?: boolean;
  onClose: () => void;
  onCreated: (client: ClientSummary) => void;
};

function buildInitialForm({
  initialSearch = '',
  initialPersonType = 'PJ',
  initialIsBuyer = false,
  initialIsSeller = true
}: {
  initialSearch?: string;
  initialPersonType?: ClientPersonType;
  initialIsBuyer?: boolean;
  initialIsSeller?: boolean;
}) {
  return {
    personType: initialPersonType,
    fullName: initialPersonType === 'PF' ? initialSearch : '',
    legalName: initialPersonType === 'PJ' ? initialSearch : '',
    tradeName: initialPersonType === 'PJ' ? initialSearch : '',
    cpf: '',
    cnpj: '',
    phone: '',
    isBuyer: initialIsBuyer,
    isSeller: initialIsSeller
  };
}

export function ClientQuickCreateModal({
  session,
  open,
  title,
  initialSearch,
  initialPersonType = 'PJ',
  initialIsBuyer = false,
  initialIsSeller = true,
  onClose,
  onCreated
}: ClientQuickCreateModalProps) {
  const [form, setForm] = useState(() =>
    buildInitialForm({
      initialSearch,
      initialPersonType,
      initialIsBuyer,
      initialIsSeller
    })
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(
      buildInitialForm({
        initialSearch,
        initialPersonType,
        initialIsBuyer,
        initialIsSeller
      })
    );
    setSaving(false);
    setError(null);
  }, [initialIsBuyer, initialIsSeller, initialPersonType, initialSearch, open]);

  const canSubmit = useMemo(() => {
    if (!form.isBuyer && !form.isSeller) {
      return false;
    }

    if (form.personType === 'PF') {
      return form.fullName.trim().length > 0 && form.cpf.trim().length > 0;
    }

    return form.legalName.trim().length > 0 && form.cnpj.trim().length > 0;
  }, [form]);

  if (!open) {
    return null;
  }

  const documentLabel = form.personType === 'PF' ? 'CPF' : 'CNPJ';
  const documentValue = form.personType === 'PF' ? form.cpf : form.cnpj;
  const displayNameValue = form.personType === 'PF' ? form.fullName : form.tradeName;
  const legalNameDisabled = form.personType === 'PF';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setError('Preencha os campos minimos do cliente antes de salvar.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await createClient(session, {
        personType: form.personType,
        fullName: form.personType === 'PF' ? form.fullName : undefined,
        legalName: form.personType === 'PJ' ? form.legalName : undefined,
        tradeName: form.personType === 'PJ' ? form.tradeName || null : undefined,
        cpf: form.personType === 'PF' ? form.cpf : undefined,
        cnpj: form.personType === 'PJ' ? form.cnpj : undefined,
        phone: form.phone || null,
        isBuyer: form.isBuyer,
        isSeller: form.isSeller
      });

      onCreated(response.client);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao criar cliente');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="client-modal-backdrop" onClick={() => !saving && onClose()}>
      <section
        className="client-modal panel stack client-quick-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-quick-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="client-modal-header client-quick-create-header">
          <div className="client-quick-create-copy">
            <h3 id="client-quick-create-title" style={{ margin: 0 }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="app-modal-close client-quick-create-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar novo cliente"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <form className="client-quick-create-form" onSubmit={handleSubmit}>
          <div className="client-quick-create-body">
            {error ? <p className="error client-quick-create-error">{error}</p> : null}

            <section className="client-quick-create-group" aria-labelledby="client-quick-create-group-identificacao">
              <p id="client-quick-create-group-identificacao" className="client-quick-create-group-title">
                Identificacao
              </p>

              <div className="client-quick-create-grid client-quick-create-grid-compact">
                <label className="client-quick-create-field">
                  Tipo de cliente
                  <select
                    value={form.personType}
                    disabled={saving}
                    onChange={(event) => {
                      const nextType = event.target.value as ClientPersonType;
                      setForm((current) => ({
                        ...current,
                        personType: nextType,
                        fullName:
                          nextType === 'PF'
                            ? current.fullName || current.tradeName || initialSearch || ''
                            : current.fullName,
                        legalName: nextType === 'PJ' ? current.legalName || initialSearch || '' : current.legalName,
                        tradeName:
                          nextType === 'PJ'
                            ? current.tradeName || current.fullName || initialSearch || ''
                            : current.tradeName
                      }));
                    }}
                  >
                    <option value="PJ">Pessoa juridica</option>
                    <option value="PF">Pessoa fisica</option>
                  </select>
                </label>

                <label className="client-quick-create-field">
                  {documentLabel}
                  <input
                    value={documentValue}
                    disabled={saving}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cpf: current.personType === 'PF' ? maskDocumentInput(event.target.value, 'PF') : current.cpf,
                        cnpj: current.personType === 'PJ' ? maskDocumentInput(event.target.value, 'PJ') : current.cnpj
                      }))
                    }
                    placeholder="Somente numeros ou formatado"
                  />
                </label>
              </div>

              <div className="client-quick-create-grid client-quick-create-grid-single">
                <label className="client-quick-create-field">
                  Nome completo
                  <input
                    value={displayNameValue}
                    disabled={saving}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        fullName: current.personType === 'PF' ? event.target.value : current.fullName,
                        tradeName: current.personType === 'PJ' ? event.target.value : current.tradeName
                      }))
                    }
                  />
                </label>
              </div>

              <div className="client-quick-create-grid client-quick-create-grid-single">
                <label className="client-quick-create-field client-quick-create-field-disabled">
                  Razao social
                  <input
                    value={form.legalName}
                    disabled={saving || legalNameDisabled}
                    onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))}
                    placeholder={legalNameDisabled ? 'Nao se aplica para pessoa fisica' : ''}
                  />
                </label>
              </div>
            </section>

            <section className="client-quick-create-group" aria-labelledby="client-quick-create-group-contato">
              <p id="client-quick-create-group-contato" className="client-quick-create-group-title">
                Contato
              </p>
              <div className="client-quick-create-grid client-quick-create-grid-single">
                <label className="client-quick-create-field">
                  Telefone
                  <input
                    value={form.phone}
                    disabled={saving}
                    onChange={(event) => setForm((current) => ({ ...current, phone: maskPhoneInput(event.target.value) }))}
                    placeholder="(xx)xxxx-xxxx ou (xx)xxxxx-xxxx"
                  />
                </label>
              </div>
            </section>

            <section className="client-quick-create-group" aria-labelledby="client-quick-create-group-papeis">
              <p id="client-quick-create-group-papeis" className="client-quick-create-group-title">
                Papel operacional
              </p>
              <div className="client-modal-flags client-quick-create-flags">
                <label className="client-modal-flag client-quick-create-flag">
                  <input
                    type="checkbox"
                    checked={form.isSeller}
                    disabled={saving}
                    onChange={(event) => setForm((current) => ({ ...current, isSeller: event.target.checked }))}
                  />
                  <span className="client-quick-create-flag-label">Proprietario/vendedor</span>
                </label>
                <label className="client-modal-flag client-quick-create-flag">
                  <input
                    type="checkbox"
                    checked={form.isBuyer}
                    disabled={saving}
                    onChange={(event) => setForm((current) => ({ ...current, isBuyer: event.target.checked }))}
                  />
                  <span className="client-quick-create-flag-label">Comprador</span>
                </label>
              </div>
            </section>
          </div>

          <div className="client-quick-create-actions">
            <button type="button" className="app-modal-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="app-modal-submit" disabled={saving || !canSubmit}>
              {saving ? 'Salvando...' : 'Cadastrar cliente'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
