'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { ApiError, createClient } from '../../lib/api-client';
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
  description,
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
        className="client-modal panel stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-quick-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="client-modal-header">
          <div>
            <h3 id="client-quick-create-title" style={{ margin: 0 }}>
              {title}
            </h3>
            {description ? <p className="client-modal-description">{description}</p> : null}
          </div>
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>
            Fechar
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <form className="stack" onSubmit={handleSubmit}>
          <label>
            Tipo de pessoa
            <select
              value={form.personType}
              disabled={saving}
              onChange={(event) => {
                const nextType = event.target.value as ClientPersonType;
                setForm((current) => ({
                  ...current,
                  personType: nextType,
                  fullName: nextType === 'PF' ? current.fullName || initialSearch || '' : '',
                  legalName: nextType === 'PJ' ? current.legalName || initialSearch || '' : '',
                  tradeName: nextType === 'PJ' ? current.tradeName || initialSearch || '' : ''
                }));
              }}
            >
              <option value="PJ">Pessoa juridica</option>
              <option value="PF">Pessoa fisica</option>
            </select>
          </label>

          {form.personType === 'PF' ? (
            <>
              <label>
                Nome completo
                <input
                  value={form.fullName}
                  disabled={saving}
                  onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                />
              </label>
              <label>
                CPF
                <input
                  value={form.cpf}
                  disabled={saving}
                  onChange={(event) => setForm((current) => ({ ...current, cpf: event.target.value }))}
                  placeholder="Somente numeros ou formatado"
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Razao social
                <input
                  value={form.legalName}
                  disabled={saving}
                  onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))}
                />
              </label>
              <label>
                Nome fantasia
                <input
                  value={form.tradeName}
                  disabled={saving}
                  onChange={(event) => setForm((current) => ({ ...current, tradeName: event.target.value }))}
                />
              </label>
              <label>
                CNPJ
                <input
                  value={form.cnpj}
                  disabled={saving}
                  onChange={(event) => setForm((current) => ({ ...current, cnpj: event.target.value }))}
                  placeholder="Somente numeros ou formatado"
                />
              </label>
            </>
          )}

          <label>
            Telefone
            <input
              value={form.phone}
              disabled={saving}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Opcional"
            />
          </label>

          <div className="client-modal-flags">
            <label className="client-modal-flag">
              <input
                type="checkbox"
                checked={form.isSeller}
                disabled={saving}
                onChange={(event) => setForm((current) => ({ ...current, isSeller: event.target.checked }))}
              />
              Proprietario/vendedor
            </label>
            <label className="client-modal-flag">
              <input
                type="checkbox"
                checked={form.isBuyer}
                disabled={saving}
                onChange={(event) => setForm((current) => ({ ...current, isBuyer: event.target.checked }))}
              />
              Comprador
            </label>
          </div>

          <div className="row">
            <button type="submit" disabled={saving || !canSubmit}>
              {saving ? 'Salvando...' : 'Cadastrar cliente'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
