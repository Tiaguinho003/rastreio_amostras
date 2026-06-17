'use client';

import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

import { ApiError, createClient, lookupUsersForReference } from '../../lib/api-client';
import { maskDocumentInput, maskPhoneInput } from '../../lib/client-field-formatters';
import { isValidCnpjChecksum, isValidCpfChecksum } from '../../lib/document-validation';
import { isCommercialRole } from '../../lib/roles';
import type { ClientPersonType, ClientSummary, SessionData, UserLookupItem } from '../../lib/types';
import { BottomSheet } from '../BottomSheet';
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

// Rotulo que troca de texto com CROSSFADE suave (sem efeito de digitacao) —
// usado nos campos que mudam de nome ao alternar PJ/PF (Documento: CNPJ↔CPF;
// nome do topo: Nome fantasia↔Nome completo). Fade-out do texto antigo → swap →
// fade-in do novo. `prefers-reduced-motion` = troca instantanea. O <span> e
// aria-hidden (o nome acessivel do input vem do `aria-label` no proprio input).
const CROSSFADE_MS = 150;

function CrossfadeLabel({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const [visible, setVisible] = useState(true);
  const prevTextRef = useRef(text);

  useEffect(() => {
    if (prevTextRef.current === text) return;
    prevTextRef.current = text;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setShown(text);
      setVisible(true);
      return;
    }

    setVisible(false); // fade-out do texto atual
    const timer = window.setTimeout(() => {
      setShown(text); // troca o texto
      setVisible(true); // fade-in do novo
    }, CROSSFADE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  return (
    <span className={`cqc-label-fade${visible ? '' : ' is-hidden'}`} aria-hidden="true">
      {shown}
    </span>
  );
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
  const formId = useId();
  const [form, setForm] = useState(() =>
    buildInitialForm({
      initialSearch,
      initialPersonType,
      initialIsBuyer,
      initialIsSeller,
      initialPhone,
    })
  );
  // Snapshot do form inicial pra detectar "dirty" (gatilho do "Descartar?").
  const initialFormRef = useRef(form);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [users, setUsers] = useState<UserLookupItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const lastOpenRef = useRef(false);

  useEffect(() => {
    if (open && !lastOpenRef.current) {
      const initial = buildInitialForm({
        initialSearch,
        initialPersonType,
        initialIsBuyer,
        initialIsSeller,
        initialPhone,
      });
      setForm(initial);
      initialFormRef.current = initial;
      setSaving(false);
      setError(null);
      setSubmitted(false);
      setDiscardOpen(false);
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

  // Nome OBRIGATORIO (validacao): PF→fullName (campo do topo), PJ→legalName (razao).
  const requiredNameValue = form.personType === 'PF' ? form.fullName : form.legalName;
  const isNameFilled = requiredNameValue.trim().length > 0;
  // Campo de nome do TOPO (exibicao/edicao): PF→Nome completo (fullName) /
  // PJ→Nome fantasia (tradeName). A Razao social (legalName) e a linha de baixo.
  const topNameValue = form.personType === 'PF' ? form.fullName : form.tradeName;
  const topNameLabel = form.personType === 'PF' ? 'Nome completo' : 'Nome fantasia';
  // Telefone e opcional. Se preenchido, exige formato (10 ou 11 digitos).
  const isPhoneValid =
    form.phone.replace(/\D/g, '').length === 0 ||
    [10, 11].includes(form.phone.replace(/\D/g, '').length);

  const hasCommercialUser = form.commercialUserIds.length > 0;
  const canSubmit = useMemo(() => {
    return isNameFilled && isPhoneValid && isDocumentValid && hasCommercialUser;
  }, [isNameFilled, isPhoneValid, isDocumentValid, hasCommercialUser]);

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
  // O obrigatorio fica no TOPO no PF (fullName) e na RAZAO no PJ (legalName).
  const hasTopNameError = hasNameError && form.personType === 'PF';
  const hasRazaoError = hasNameError && form.personType === 'PJ';
  const hasPhoneError = showFieldErrors && !isPhoneValid;
  const phoneHint = !isPhoneValid ? 'Telefone deve ter 10 ou 11 digitos' : null;
  // 14.7.C: erro do responsavel agora so aparece apos tentativa de
  // submit (antes era permanente quando lista vazia, gerando aspecto
  // vermelho mesmo sem o usuario interagir).
  const hasCommercialUserError = submitted && !loadingUsers && !hasCommercialUser;

  // "dirty" = algo mudou em relacao ao seed inicial (gatilho do "Descartar?").
  const dirty = JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

  function resetForm() {
    const initial = buildInitialForm({
      initialSearch,
      initialPersonType,
      initialIsBuyer,
      initialIsSeller,
      initialPhone,
    });
    setForm(initial);
    initialFormRef.current = initial;
    setError(null);
    setSubmitted(false);
    setDiscardOpen(false);
  }

  // onDismissAttempt do BottomSheet (arrastar/tocar-fora/ESC) + botao Cancelar.
  // Bloqueia durante save/sucesso; com dados digitados pede "Descartar?".
  function handleDismissAttempt() {
    if (saving || showSuccess) return false;
    if (dirty) {
      setDiscardOpen(true);
      return false;
    }
    return true;
  }

  // Fechamento PERMITIDO (sem dados, ou apos confirmar o descarte): reseta o
  // form e avisa o pai. O BottomSheet faz o slide-down (mantido montado).
  function handleClose() {
    resetForm();
    onClose();
  }

  function attemptClose() {
    if (handleDismissAttempt()) handleClose();
  }

  function confirmDiscard() {
    resetForm();
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

  const footerActions = (
    <div className="client-quick-create-actions">
      <button
        type="button"
        className="app-modal-secondary"
        onClick={attemptClose}
        disabled={saving}
      >
        Cancelar
      </button>
      {/* Habilitado fora do saving: o submit roda a validacao e REVELA os erros
          inline (showFieldErrors depende de `submitted`). Associado ao form via
          `form={formId}` — o form vive no corpo do sheet, o botao no footer. */}
      <button type="submit" form={formId} className="app-modal-submit" disabled={saving}>
        {saving ? 'Salvando...' : 'Cadastrar'}
      </button>
    </div>
  );

  // BottomSheet com `stacked`: este modal sempre abre SOBRE algo (sheet de Nova
  // Amostra, fluxo de vinculo do /resumo, detalhe). O tier stacked + o
  // scroll-lock ref-contado vivem no proprio BottomSheet (ver components/BottomSheet).
  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      onDismissAttempt={handleDismissAttempt}
      title={title}
      ariaLabel={title}
      footer={footerActions}
      stacked
      dragToDismiss
      // Pausa o arraste do proprio sheet enquanto o "Descartar?"/save estao
      // ativos (mesmo cuidado do NewSampleModal com o quick-create).
      dragDisabled={discardOpen || saving}
      className="client-quick-create-sheet"
    >
      <form id={formId} className="client-quick-create-form" onSubmit={handleSubmit}>
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
              <CrossfadeLabel text={documentLabel} />
              <input
                value={documentValue}
                disabled={saving}
                aria-label={documentLabel}
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

          {/* Linha 2 (topo): nome principal — PF "Nome completo" (fullName) /
              PJ "Nome fantasia" (tradeName). Rotulo com crossfade ao trocar. */}
          <div className="client-quick-create-grid client-quick-create-grid-single">
            <label
              className={`client-quick-create-field${hasTopNameError ? ' is-field-error' : ''}`}
            >
              <CrossfadeLabel text={topNameLabel} />
              <input
                value={topNameValue}
                disabled={saving}
                aria-label={topNameLabel}
                className={hasTopNameError ? 'cqc-input-error' : undefined}
                onChange={(event) => {
                  const value = event.target.value.toUpperCase();
                  setForm((current) => ({
                    ...current,
                    fullName: current.personType === 'PF' ? value : current.fullName,
                    tradeName: current.personType === 'PJ' ? value : current.tradeName,
                  }));
                }}
                placeholder={hasTopNameError ? 'Obrigatorio' : ''}
              />
            </label>
          </div>

          {/* Linha 3: Razao social (legalName). Ativa no PJ; no PF DESBOTA +
              desabilita (is-dimmed) mas PERMANECE renderizada — assim a altura do
              modal nao pula ao alternar o tipo. */}
          <div className="client-quick-create-grid client-quick-create-grid-single">
            <label
              className={`client-quick-create-field${hasRazaoError ? ' is-field-error' : ''}${
                form.personType === 'PF' ? ' is-dimmed' : ''
              }`}
            >
              Razao social
              <input
                value={form.legalName}
                disabled={saving || form.personType === 'PF'}
                className={hasRazaoError ? 'cqc-input-error' : undefined}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    legalName: event.target.value.toUpperCase(),
                  }))
                }
                placeholder={hasRazaoError ? 'Obrigatorio' : ''}
              />
            </label>
          </div>

          {/* Linha 4: Telefone | Responsavel */}
          <div className="client-quick-create-grid client-quick-create-grid-2col">
            <label className={`client-quick-create-field${hasPhoneError ? ' is-field-error' : ''}`}>
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
                onChange={(next) => setForm((current) => ({ ...current, commercialUserIds: next }))}
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
      </form>

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

      {discardOpen ? (
        <div
          className="client-quick-create-discard-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="client-quick-create-discard-title"
        >
          <div className="client-quick-create-discard-card">
            <div className="app-confirm-modal-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                <path d="M12 9v4" />
                <path d="M12 17v.01" />
              </svg>
            </div>
            <h3 id="client-quick-create-discard-title" className="app-confirm-modal-title">
              Descartar cadastro?
            </h3>
            <p className="app-confirm-modal-message">
              Os dados preenchidos serão perdidos. Esta ação não pode ser desfeita.
            </p>
            <div className="client-quick-create-discard-actions">
              <button
                type="button"
                className="app-modal-secondary"
                onClick={() => setDiscardOpen(false)}
                autoFocus
              >
                Continuar editando
              </button>
              <button type="button" className="app-modal-submit is-danger" onClick={confirmDiscard}>
                Descartar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}
