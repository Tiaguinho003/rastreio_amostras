'use client';

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, createClient } from '../../lib/api-client';
import { maskDocumentInput, maskPhoneInput } from '../../lib/client-field-formatters';
import { useFocusTrap } from '../../lib/use-focus-trap';
import type { ClientPersonType, ClientSummary, SessionData } from '../../lib/types';

type ClientQuickCreateModalProps = {
  session: SessionData;
  open: boolean;
  title: string;
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
  initialIsSeller = true,
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
    isSeller: initialIsSeller,
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
  onCreated,
}: ClientQuickCreateModalProps) {
  const focusTrapRef = useFocusTrap(open);
  const [form, setForm] = useState(() =>
    buildInitialForm({
      initialSearch,
      initialPersonType,
      initialIsBuyer,
      initialIsSeller,
    })
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const lastOpenRef = useRef(false);

  useEffect(() => {
    if (open && !lastOpenRef.current) {
      setForm(
        buildInitialForm({
          initialSearch,
          initialPersonType,
          initialIsBuyer,
          initialIsSeller,
        })
      );
      setSaving(false);
      setError(null);
      setSubmitted(false);
    }

    lastOpenRef.current = open;
  }, [initialIsBuyer, initialIsSeller, initialPersonType, initialSearch, open]);

  const documentDigitCount = useMemo(() => {
    const raw = form.personType === 'PF' ? form.cpf : form.cnpj;
    return raw.replace(/\D/g, '').length;
  }, [form.cpf, form.cnpj, form.personType]);

  const expectedDocumentDigits = form.personType === 'PF' ? 11 : 14;
  const isDocumentComplete = documentDigitCount === expectedDocumentDigits;

  const nameValue = form.personType === 'PF' ? form.fullName : form.legalName;
  const isNameFilled = nameValue.trim().length > 0;
  const isPhoneFilled = form.phone.replace(/\D/g, '').length > 0;
  const isPhoneValid =
    form.phone.replace(/\D/g, '').length === 0 ||
    [10, 11].includes(form.phone.replace(/\D/g, '').length);
  const isDocumentValid = documentDigitCount === 0 || isDocumentComplete;

  const canSubmit = useMemo(() => {
    return isNameFilled && isPhoneFilled && isPhoneValid && isDocumentValid;
  }, [isNameFilled, isPhoneFilled, isPhoneValid, isDocumentValid]);

  if (!open) {
    return null;
  }

  const documentLabel = form.personType === 'PF' ? 'CPF' : 'CNPJ';
  const documentValue = form.personType === 'PF' ? form.cpf : form.cnpj;

  const showFieldErrors = submitted && !canSubmit;
  const isDocumentInvalid = documentDigitCount > 0 && !isDocumentComplete;
  const hasDocumentError = showFieldErrors && isDocumentInvalid;
  const documentHint = isDocumentInvalid
    ? `${documentLabel} deve ter ${expectedDocumentDigits} digitos (tem ${documentDigitCount})`
    : null;
  const hasNameError = showFieldErrors && !isNameFilled;
  const hasPhoneError = showFieldErrors && (!isPhoneFilled || !isPhoneValid);
  const phoneHint = !isPhoneValid ? 'Telefone deve ter 10 ou 11 digitos' : null;

  function handleCloseAndReset() {
    if (saving) {
      return;
    }

    setForm(
      buildInitialForm({
        initialSearch,
        initialPersonType,
        initialIsBuyer,
        initialIsSeller,
      })
    );
    setError(null);
    setSubmitted(false);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!canSubmit) {
      setError('Preencha os campos obrigatorios destacados.');
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
        cpf: form.personType === 'PF' ? form.cpf || null : undefined,
        cnpj: form.personType === 'PJ' ? form.cnpj || null : undefined,
        phone: form.phone,
        isBuyer: form.isBuyer,
        isSeller: form.isSeller,
      });

      setSaving(false);
      setShowSuccess(true);
      window.setTimeout(() => {
        setShowSuccess(false);
        onCreated(response.client);
      }, 900);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao criar cliente');
      setSaving(false);
    }
  }

  return (
    <div
      className="app-modal-backdrop"
      onClick={() => {
        if (!saving && !showSuccess) {
          onClose();
        }
      }}
    >
      <section
        ref={focusTrapRef}
        className="app-modal client-quick-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-quick-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        {showSuccess ? (
          <div className="client-create-success-overlay" aria-live="polite">
            <svg className="client-create-success-check" viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r="24" fill="none" stroke="#2f8a3e" strokeWidth="2.5" />
              <path
                fill="none"
                stroke="#2f8a3e"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 27l7 7 15-15"
              />
            </svg>
          </div>
        ) : null}
        <div className="client-modal-header client-quick-create-header">
          <div className="client-quick-create-copy">
            <h3 id="client-quick-create-title" style={{ margin: 0 }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="app-modal-close client-quick-create-close"
            onClick={handleCloseAndReset}
            disabled={saving}
            aria-label="Fechar novo cliente"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <form className="client-quick-create-form" onSubmit={handleSubmit}>
          <div className="client-quick-create-body">
            {error ? <p className="error client-quick-create-error">{error}</p> : null}

            <section
              className="client-quick-create-group"
              aria-labelledby="client-quick-create-group-identificacao"
            >
              <p
                id="client-quick-create-group-identificacao"
                className="client-quick-create-group-title"
              >
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
                      setForm((current) => ({ ...current, personType: nextType }));
                      setSubmitted(false);
                      setError(null);
                    }}
                  >
                    <option value="PJ">Pessoa juridica</option>
                    <option value="PF">Pessoa fisica</option>
                  </select>
                </label>

                <label
                  className={`client-quick-create-field${isDocumentInvalid ? ' is-field-error' : ''}`}
                >
                  {documentLabel}
                  <input
                    value={documentValue}
                    disabled={saving}
                    className={isDocumentInvalid ? 'cqc-input-error' : undefined}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cpf:
                          current.personType === 'PF'
                            ? maskDocumentInput(event.target.value, 'PF')
                            : current.cpf,
                        cnpj:
                          current.personType === 'PJ'
                            ? maskDocumentInput(event.target.value, 'PJ')
                            : current.cnpj,
                      }))
                    }
                    placeholder={isDocumentInvalid ? (documentHint ?? '') : ''}
                  />
                </label>
              </div>

              <div className="client-quick-create-grid client-quick-create-grid-single">
                <label
                  className={`client-quick-create-field${hasNameError ? ' is-field-error' : ''}`}
                >
                  {form.personType === 'PF' ? 'Nome completo' : 'Razao social'}
                  <input
                    value={nameValue}
                    disabled={saving}
                    className={hasNameError ? 'cqc-input-error' : undefined}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        fullName:
                          current.personType === 'PF' ? event.target.value : current.fullName,
                        legalName:
                          current.personType === 'PJ' ? event.target.value : current.legalName,
                      }))
                    }
                    placeholder={hasNameError ? 'Obrigatorio' : ''}
                  />
                </label>
              </div>

              {form.personType === 'PJ' ? (
                <div className="client-quick-create-grid client-quick-create-grid-single">
                  <label className="client-quick-create-field">
                    Nome fantasia
                    <input
                      value={form.tradeName}
                      disabled={saving}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, tradeName: event.target.value }))
                      }
                      placeholder=""
                    />
                  </label>
                </div>
              ) : null}
            </section>

            <section
              className="client-quick-create-group"
              aria-labelledby="client-quick-create-group-contato"
            >
              <p id="client-quick-create-group-contato" className="client-quick-create-group-title">
                Contato
              </p>
              <div className="client-quick-create-grid client-quick-create-grid-single">
                <label
                  className={`client-quick-create-field${hasPhoneError ? ' is-field-error' : ''}`}
                >
                  Telefone
                  <input
                    value={form.phone}
                    disabled={saving}
                    className={hasPhoneError ? 'cqc-input-error' : undefined}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        phone: maskPhoneInput(event.target.value),
                      }))
                    }
                    placeholder={hasPhoneError ? (phoneHint ?? 'Obrigatorio') : ''}
                  />
                </label>
              </div>
            </section>

            <section
              className="client-quick-create-group"
              aria-labelledby="client-quick-create-group-papeis"
            >
              <p id="client-quick-create-group-papeis" className="client-quick-create-group-title">
                Papel operacional
              </p>
              <div className="client-modal-flags client-quick-create-flags">
                <label className="client-modal-flag client-quick-create-flag">
                  <input
                    type="checkbox"
                    checked={form.isSeller}
                    disabled={saving}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, isSeller: event.target.checked }))
                    }
                  />
                  <span className="client-quick-create-flag-label">Vendedor</span>
                </label>
                <label className="client-modal-flag client-quick-create-flag">
                  <input
                    type="checkbox"
                    checked={form.isBuyer}
                    disabled={saving}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, isBuyer: event.target.checked }))
                    }
                  />
                  <span className="client-quick-create-flag-label">Comprador</span>
                </label>
              </div>
            </section>
          </div>

          <div className="client-quick-create-actions">
            <button
              type="button"
              className="app-modal-secondary"
              onClick={handleCloseAndReset}
              disabled={saving}
            >
              Cancelar
            </button>
            <button type="submit" className="app-modal-submit" disabled={saving || !canSubmit}>
              {saving ? 'Salvando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
