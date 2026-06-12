'use client';

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, createClient, lookupUsersForReference } from '../../lib/api-client';
import { maskDocumentInput, maskPhoneInput } from '../../lib/client-field-formatters';
import { isValidCnpjChecksum, isValidCpfChecksum } from '../../lib/document-validation';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { isCommercialRole } from '../../lib/roles';
import type { ClientPersonType, ClientSummary, SessionData, UserLookupItem } from '../../lib/types';
import { UserMultiSelect } from '../users/UserMultiSelect';

// Mapeia mensagens de erro do backend (em ingles) para pt-BR.
const FIELD_LABELS: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  legalName: 'Razao social',
  tradeName: 'Nome fantasia',
  fullName: 'Nome completo',
  phone: 'Telefone',
  email: 'E-mail',
  commercialUserId: 'Responsavel comercial',
};

function translateCreateClientError(cause: unknown): string {
  if (!(cause instanceof ApiError)) {
    return 'Falha ao criar cliente. Tente novamente.';
  }
  if (cause.status === 0) {
    return 'Sem conexao com o servidor. Verifique sua internet e tente novamente.';
  }
  if (cause.status === 401) return 'Sessao expirada. Faca login novamente.';
  if (cause.status === 403) return 'Sem permissao para esta acao.';
  const code =
    cause.details && typeof cause.details === 'object'
      ? (cause.details as { code?: string }).code
      : undefined;
  const field =
    cause.details && typeof cause.details === 'object'
      ? (cause.details as { field?: string }).field
      : undefined;
  if (code === 'PJ_REQUIRES_CNPJ') return 'CNPJ e obrigatorio para Pessoa juridica.';
  if (code === 'COMMERCIAL_USER_NOT_FOUND' || code === 'COMMERCIAL_USER_INACTIVE') {
    return 'Responsavel comercial invalido ou inativo.';
  }
  const message = cause.message ?? '';
  if (message.includes('already exists') || cause.status === 409) {
    if (field && FIELD_LABELS[field]) return `${FIELD_LABELS[field]} ja cadastrado no sistema.`;
    return 'Registro ja existe no sistema.';
  }
  if (cause.status === 422 && field && FIELD_LABELS[field]) {
    return `${FIELD_LABELS[field]} invalido.`;
  }
  return cause.message || 'Falha ao criar cliente. Tente novamente.';
}

type ClientQuickCreateModalProps = {
  session: SessionData;
  open: boolean;
  title: string;
  initialSearch?: string;
  initialPersonType?: ClientPersonType;
  initialIsBuyer?: boolean;
  initialIsSeller?: boolean;
  /** Prefill opcional do telefone (ex: anotado no informe de visita). */
  initialPhone?: string;
  onClose: () => void;
  onCreated: (client: ClientSummary) => void;
};

function buildInitialForm({
  initialSearch = '',
  initialPersonType = 'PJ',
  initialIsBuyer = false,
  initialIsSeller = true,
  initialPhone = '',
}: {
  initialSearch?: string;
  initialPersonType?: ClientPersonType;
  initialIsBuyer?: boolean;
  initialIsSeller?: boolean;
  initialPhone?: string;
}) {
  return {
    personType: initialPersonType,
    fullName: initialPersonType === 'PF' ? initialSearch : '',
    legalName: initialPersonType === 'PJ' ? initialSearch : '',
    tradeName: initialPersonType === 'PJ' ? initialSearch : '',
    cpf: '',
    cnpj: '',
    phone: maskPhoneInput(initialPhone),
    isBuyer: initialIsBuyer,
    isSeller: initialIsSeller,
    commercialUserIds: [] as string[],
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
  initialPhone,
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
      initialPhone,
    })
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [users, setUsers] = useState<UserLookupItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const lastOpenRef = useRef(false);

  useEffect(() => {
    if (open && !lastOpenRef.current) {
      setForm(
        buildInitialForm({
          initialSearch,
          initialPersonType,
          initialIsBuyer,
          initialIsSeller,
          initialPhone,
        })
      );
      setSaving(false);
      setError(null);
      setSubmitted(false);
    }

    lastOpenRef.current = open;
  }, [initialIsBuyer, initialIsSeller, initialPersonType, initialPhone, initialSearch, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setLoadingUsers(true);
    lookupUsersForReference(session, { limit: 200 })
      .then((response) => {
        if (!cancelled) {
          // So papeis comerciais (COMMERCIAL + PROSPECTOR) podem ser
          // responsaveis comerciais — alinhado com o filtro de responsavel do
          // ClientsFilterButton em /clients.
          setUsers(response.items.filter((u) => isCommercialRole(u.role)));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsers([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingUsers(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, session]);

  const documentDigits = useMemo(() => {
    const raw = form.personType === 'PF' ? form.cpf : form.cnpj;
    return raw.replace(/\D/g, '');
  }, [form.cpf, form.cnpj, form.personType]);

  const documentDigitCount = documentDigits.length;
  const expectedDocumentDigits = form.personType === 'PF' ? 11 : 14;
  const isDocumentFilled = documentDigitCount > 0;
  const isDocumentComplete = documentDigitCount === expectedDocumentDigits;
  // F6.1: valida checksum (Receita Federal) alem do length
  const isChecksumValid = useMemo(() => {
    if (!isDocumentComplete) return false;
    return form.personType === 'PF'
      ? isValidCpfChecksum(documentDigits)
      : isValidCnpjChecksum(documentDigits);
  }, [isDocumentComplete, form.personType, documentDigits]);
  const isDocumentValid = !isDocumentFilled || isChecksumValid;

  const nameValue = form.personType === 'PF' ? form.fullName : form.legalName;
  const isNameFilled = nameValue.trim().length > 0;
  // Telefone e opcional. Se preenchido, exige formato (10 ou 11 digitos).
  const isPhoneValid =
    form.phone.replace(/\D/g, '').length === 0 ||
    [10, 11].includes(form.phone.replace(/\D/g, '').length);

  const hasCommercialUser = form.commercialUserIds.length > 0;
  const canSubmit = useMemo(() => {
    return isNameFilled && isPhoneValid && isDocumentValid && hasCommercialUser;
  }, [isNameFilled, isPhoneValid, isDocumentValid, hasCommercialUser]);

  if (!open) {
    return null;
  }

  const documentLabel = form.personType === 'PF' ? 'CPF' : 'CNPJ';
  const documentValue = form.personType === 'PF' ? form.cpf : form.cnpj;

  const showFieldErrors = submitted && !canSubmit;
  const isDocumentInvalid = isDocumentFilled && !isChecksumValid;
  const hasDocumentError = showFieldErrors && isDocumentInvalid;
  const documentHint = isDocumentInvalid
    ? !isDocumentComplete
      ? `${documentLabel} deve ter ${expectedDocumentDigits} digitos (tem ${documentDigitCount})`
      : `${documentLabel} invalido (digito verificador errado)`
    : null;
  const hasNameError = showFieldErrors && !isNameFilled;
  const hasPhoneError = showFieldErrors && !isPhoneValid;
  const phoneHint = !isPhoneValid ? 'Telefone deve ter 10 ou 11 digitos' : null;
  // 14.7.C: erro do responsavel agora so aparece apos tentativa de
  // submit (antes era permanente quando lista vazia, gerando aspecto
  // vermelho mesmo sem o usuario interagir).
  const hasCommercialUserError = submitted && !loadingUsers && !hasCommercialUser;

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
        initialPhone,
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
      // L5: PJ guarda cnpj direto no Client (sem branches). PF nao tem cnpj
      // aqui (cpf vai no proprio Client; filiais eventuais sao adicionadas
      // depois pela tela de detalhe).
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
        commercialUserIds: form.commercialUserIds,
      });

      setSaving(false);
      setShowSuccess(true);
      window.setTimeout(() => {
        setShowSuccess(false);
        onCreated(response.client);
      }, 900);
    } catch (cause) {
      setError(translateCreateClientError(cause));
      setSaving(false);
    }
  }

  return createPortal(
    <div className="app-modal-backdrop">
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

            {/* 14.7.C: 1 bloco unico (sem sections "Identificacao/Contato/...").
                5 linhas ordenadas: tipo+doc / nome / nome fantasia (PJ) /
                telefone+responsavel / vendedor+comprador. */}

            {/* Linha 1: Tipo de cliente | CNPJ ou CPF */}
            <div className="client-quick-create-grid client-quick-create-grid-2col">
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
                className={`client-quick-create-field${hasDocumentError ? ' is-field-error' : ''}`}
              >
                {documentLabel}
                <input
                  value={documentValue}
                  disabled={saving}
                  className={hasDocumentError ? 'cqc-input-error' : undefined}
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
                  placeholder={hasDocumentError ? (documentHint ?? '') : ''}
                />
              </label>
            </div>

            {/* Linha 2: Nome (PF: completo, PJ: razao social) — full width */}
            <div className="client-quick-create-grid client-quick-create-grid-single">
              <label
                className={`client-quick-create-field${hasNameError ? ' is-field-error' : ''}`}
              >
                {form.personType === 'PF' ? 'Nome completo' : 'Razao social'}
                <input
                  value={nameValue}
                  disabled={saving}
                  className={hasNameError ? 'cqc-input-error' : undefined}
                  onChange={(event) => {
                    const value = event.target.value.toUpperCase();
                    setForm((current) => ({
                      ...current,
                      fullName: current.personType === 'PF' ? value : current.fullName,
                      legalName: current.personType === 'PJ' ? value : current.legalName,
                    }));
                  }}
                  placeholder={hasNameError ? 'Obrigatorio' : ''}
                />
              </label>
            </div>

            {/* Linha 3 (so PJ): Nome fantasia — full width */}
            {form.personType === 'PJ' ? (
              <div className="client-quick-create-grid client-quick-create-grid-single">
                <label className="client-quick-create-field">
                  Nome fantasia
                  <input
                    value={form.tradeName}
                    disabled={saving}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        tradeName: event.target.value.toUpperCase(),
                      }))
                    }
                    placeholder=""
                  />
                </label>
              </div>
            ) : null}

            {/* Linha 4: Telefone | Responsavel */}
            <div className="client-quick-create-grid client-quick-create-grid-2col">
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

              <div className="client-quick-create-field">
                Responsavel
                <UserMultiSelect
                  value={form.commercialUserIds}
                  onChange={(next) =>
                    setForm((current) => ({ ...current, commercialUserIds: next }))
                  }
                  users={users}
                  loading={loadingUsers}
                  disabled={saving}
                  placeholder=""
                  errorMessage={hasCommercialUserError ? 'Obrigatorio' : undefined}
                  hideRoleInChips
                />
              </div>
            </div>

            {/* Linha 5: Vendedor | Comprador checkboxes */}
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
            {/* Habilitado fora do saving: o submit roda a validacao e REVELA
                os erros inline (showFieldErrors depende de `submitted`).
                Desabilitar por !canSubmit criava beco sem saida: clique morto
                e nenhum erro visivel. */}
            <button type="submit" className="app-modal-submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
