'use client';

import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiError, createClient, lookupUsersForReference } from '../../lib/api-client';
import { maskDocumentInput, maskPhoneInput } from '../../lib/client-field-formatters';
import type { ClientPersonType, ClientSummary, SessionData, UserLookupItem } from '../../lib/types';
import { useToast } from '../../lib/toast/ToastProvider';
import { BottomSheet } from '../BottomSheet';
import { ChipMultiSelectField } from '../ChipMultiSelectField';
import { SuccessCheckOverlay, SUCCESS_CHECK_MS } from '../SuccessCheckOverlay';

// Mapeia mensagens de erro do backend (em ingles) para pt-BR.
const FIELD_LABELS: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  legalName: 'Razão social',
  tradeName: 'Nome fantasia',
  fullName: 'Nome completo',
  phone: 'Telefone',
  email: 'E-mail',
  commercialUserId: 'Responsável',
};

function translateCreateClientError(cause: unknown): string {
  if (!(cause instanceof ApiError)) {
    return 'Falha ao criar cliente. Tente novamente.';
  }
  if (cause.status === 0) {
    return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
  }
  if (cause.status === 401) return 'Sessão expirada. Faça login novamente.';
  if (cause.status === 403) return 'Sem permissão para esta ação.';
  const code =
    cause.details && typeof cause.details === 'object'
      ? (cause.details as { code?: string }).code
      : undefined;
  const field =
    cause.details && typeof cause.details === 'object'
      ? (cause.details as { field?: string }).field
      : undefined;
  if (code === 'PJ_REQUIRES_CNPJ') return 'CNPJ é obrigatório para Pessoa jurídica.';
  if (code === 'COMMERCIAL_USER_NOT_FOUND' || code === 'COMMERCIAL_USER_INACTIVE') {
    return 'Responsável inválido ou inativo.';
  }
  // Inalcancavel pela UI (o seletor nao lista papeis nao atribuiveis), mas o
  // backend responde este 422 a chamadas diretas — sem o mapa, vazaria a
  // mensagem crua em ingles.
  if (code === 'PROSPECTOR_NOT_ASSIGNABLE') {
    return 'Este usuário não pode ser responsável por clientes.';
  }
  const message = cause.message ?? '';
  if (message.includes('already exists') || cause.status === 409) {
    if (field && FIELD_LABELS[field]) return `${FIELD_LABELS[field]} já cadastrado no sistema.`;
    return 'Registro ja existe no sistema.';
  }
  if (cause.status === 422 && field && FIELD_LABELS[field]) {
    return `${FIELD_LABELS[field]} inválido.`;
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
  initialIsWarehouse?: boolean;
  /** Prefill opcional do telefone (ex: anotado no informe de visita). */
  initialPhone?: string;
  onClose: () => void;
  onCreated: (client: ClientSummary) => void;
};

function buildInitialForm({
  initialSearch = '',
  initialPersonType = 'PJ',
  initialIsBuyer = false,
  initialIsSeller = false,
  initialIsWarehouse = false,
  initialPhone = '',
}: {
  initialSearch?: string;
  initialPersonType?: ClientPersonType;
  initialIsBuyer?: boolean;
  initialIsSeller?: boolean;
  initialIsWarehouse?: boolean;
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
    isWarehouse: initialIsWarehouse,
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
  initialIsSeller = false,
  initialIsWarehouse = false,
  initialPhone,
  onClose,
  onCreated,
}: ClientQuickCreateModalProps) {
  const formId = useId();
  const toast = useToast();
  const [form, setForm] = useState(() =>
    buildInitialForm({
      initialSearch,
      initialPersonType,
      initialIsBuyer,
      initialIsSeller,
      initialIsWarehouse,
      initialPhone,
    })
  );
  // Snapshot do form inicial pra detectar "dirty" (gatilho do "Descartar?").
  const initialFormRef = useRef(form);
  const [saving, setSaving] = useState(false);
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
        initialIsWarehouse,
        initialPhone,
      });
      setForm(initial);
      initialFormRef.current = initial;
      setSaving(false);
      setSubmitted(false);
      setDiscardOpen(false);
    }

    lastOpenRef.current = open;
  }, [
    initialIsBuyer,
    initialIsSeller,
    initialIsWarehouse,
    initialPersonType,
    initialPhone,
    initialSearch,
    open,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setLoadingUsers(true);
    lookupUsersForReference(session, { limit: 200 })
      .then((response) => {
        if (!cancelled) {
          // Responsavel opcional e QUALQUER usuario ativo pode ser responsavel
          // (nao so papeis comerciais). O backend retorna comerciais primeiro.
          setUsers(response.items);
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
  // Decisao 2026-06-19: valida APENAS comprimento (sem digito verificador da
  // Receita). Aceita qualquer documento com a contagem certa de dígitos.
  const isDocumentValid = !isDocumentFilled || isDocumentComplete;

  // Nome OBRIGATORIO (validacao): PF→fullName (campo do topo), PJ→legalName (razao).
  const requiredNameValue = form.personType === 'PF' ? form.fullName : form.legalName;
  const isNameFilled = requiredNameValue.trim().length > 0;
  // Campo de nome do TOPO (exibicao/edicao): PF→Nome completo (fullName) /
  // PJ→Nome fantasia (tradeName). A Razão social (legalName) e a linha de baixo.
  const topNameValue = form.personType === 'PF' ? form.fullName : form.tradeName;
  const topNameLabel = form.personType === 'PF' ? 'Nome completo' : 'Nome fantasia';
  // Telefone e opcional. Se preenchido, exige formato (10 ou 11 dígitos).
  const isPhoneValid =
    form.phone.replace(/\D/g, '').length === 0 ||
    [10, 11].includes(form.phone.replace(/\D/g, '').length);

  // Papel obrigatorio: o usuario deve escolher ao menos Vendedor, Comprador ou
  // Armazem (o campo vem VAZIO, sem default — pra forcar a escolha consciente).
  const hasRole = form.isSeller || form.isBuyer || form.isWarehouse;
  // Responsavel e OPCIONAL — nao entra no canSubmit.
  const canSubmit = useMemo(() => {
    return isNameFilled && isPhoneValid && isDocumentValid && hasRole;
  }, [isNameFilled, isPhoneValid, isDocumentValid, hasRole]);

  const documentLabel = form.personType === 'PF' ? 'CPF' : 'CNPJ';
  const documentValue = form.personType === 'PF' ? form.cpf : form.cnpj;

  const showFieldErrors = submitted && !canSubmit;
  const isDocumentInvalid = isDocumentFilled && !isDocumentComplete;
  const hasDocumentError = showFieldErrors && isDocumentInvalid;
  const documentHint = isDocumentInvalid
    ? `${documentLabel} deve ter ${expectedDocumentDigits} dígitos (tem ${documentDigitCount})`
    : null;
  const hasNameError = showFieldErrors && !isNameFilled;
  // O obrigatorio fica no TOPO no PF (fullName) e na RAZAO no PJ (legalName).
  const hasTopNameError = hasNameError && form.personType === 'PF';
  const hasRazaoError = hasNameError && form.personType === 'PJ';
  const hasPhoneError = showFieldErrors && !isPhoneValid;
  const phoneHint = !isPhoneValid ? 'Telefone deve ter 10 ou 11 dígitos' : null;
  const hasRoleError = submitted && !hasRole;

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
      // Mensagem ESPECIFICA quando o bloqueio e por valor invalido (CPF/telefone
      // preenchidos mas errados) — senao o usuario ve "preencha os campos" achando
      // que faltou algo, sem entender que o numero digitado e que esta invalido
      // (a dica do campo fica no placeholder, que some quando ha valor).
      const title = isDocumentInvalid
        ? (documentHint ?? `${documentLabel} inválido.`)
        : !isPhoneValid
          ? (phoneHint ?? 'Telefone inválido.')
          : 'Preencha os campos obrigatórios destacados.';
      toast.error({ title });
      return;
    }

    setSaving(true);

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
        isWarehouse: form.isWarehouse,
        commercialUserIds: form.commercialUserIds,
      });

      setSaving(false);
      setShowSuccess(true);
      window.setTimeout(() => {
        setShowSuccess(false);
        onCreated(response.client);
      }, SUCCESS_CHECK_MS);
    } catch (cause) {
      toast.error({ title: translateCreateClientError(cause) });
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

  // BottomSheet com `stacked`: este modal costuma abrir SOBRE algo (sheet de
  // Nova Amostra, contrato, detalhe). O tier stacked + o scroll-lock
  // ref-contado vivem no proprio BottomSheet (ver components/BottomSheet).
  // `side-sheet` (2026-07-20): criar cliente e SEMPRE painel lateral direito
  // no desktop, em todos os contextos — sobre outro painel lateral (Novo
  // lote) desliza por cima cobrindo-o, como um push de navegacao; o tier
  // stacked garante a ordem. Mobile segue sheet empilhado.
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
      className="client-quick-create-sheet side-sheet"
      // Rodada 4 FV: mesmo fechar dos drawers do cliente — seta ← na borda.
      closeVariant="edge-back"
    >
      <form id={formId} className="client-quick-create-form" onSubmit={handleSubmit}>
        <div className="client-quick-create-body">
          {/* 14.7.C: 5 linhas ordenadas: tipo+doc / nome / nome fantasia (PJ) /
                telefone+responsavel / vendedor+comprador. Rodada 2 FV: dois
                micro-cabecalhos institucionais agrupam as linhas (Identificacao
                / Contato e comercial) — hierarquia sem virar wizard. */}
          <span className="cqc-group-heading">Identificação</span>

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
                }}
              >
                <option value="PJ">Pessoa jurídica</option>
                <option value="PF">Pessoa física</option>
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
                placeholder={hasTopNameError ? 'Obrigatório' : ''}
              />
            </label>
          </div>

          {/* Linha 3: Razão social (legalName). Ativa no PJ; no PF DESBOTA +
              desabilita (is-dimmed) mas PERMANECE renderizada — assim a altura do
              modal nao pula ao alternar o tipo. */}
          <div className="client-quick-create-grid client-quick-create-grid-single">
            <label
              className={`client-quick-create-field${hasRazaoError ? ' is-field-error' : ''}${
                form.personType === 'PF' ? ' is-dimmed' : ''
              }`}
            >
              Razão social
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
                placeholder={hasRazaoError ? 'Obrigatório' : ''}
              />
            </label>
          </div>

          <span className="cqc-group-heading">Contato e comercial</span>

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
                placeholder={hasPhoneError ? (phoneHint ?? 'Obrigatório') : ''}
              />
            </label>

            <ChipMultiSelectField
              label="Responsável"
              placeholder="Selecione"
              searchable
              // Rodada 2: sempre pra baixo (pedido do Flavio) — o corpo do
              // sheet rola, entao nada e cortado.
              forceDropDown
              options={users.map((user) => ({ id: user.id, label: user.fullName }))}
              selected={form.commercialUserIds}
              onChange={(next) => setForm((current) => ({ ...current, commercialUserIds: next }))}
              loading={loadingUsers}
              disabled={saving}
            />
          </div>

          {/* Linha 5: Papel (Vendedor/Comprador/Armazem) — multi-select com chips,
              mesmo padrao do Responsavel. Cliente pode ser qualquer combinacao. */}
          <div className="client-quick-create-grid client-quick-create-grid-single">
            <ChipMultiSelectField
              label="Papel"
              placeholder="Selecione"
              // Rodada 2: pra BAIXO tambem no ultimo campo (pedido do Flavio);
              // o corpo do sheet rola e acomoda o dropdown.
              forceDropDown
              options={[
                { id: 'seller', label: 'Vendedor' },
                { id: 'buyer', label: 'Comprador' },
                { id: 'warehouse', label: 'Armazém' },
              ]}
              selected={[
                ...(form.isSeller ? ['seller'] : []),
                ...(form.isBuyer ? ['buyer'] : []),
                ...(form.isWarehouse ? ['warehouse'] : []),
              ]}
              onChange={(next) =>
                setForm((current) => ({
                  ...current,
                  isSeller: next.includes('seller'),
                  isBuyer: next.includes('buyer'),
                  isWarehouse: next.includes('warehouse'),
                }))
              }
              disabled={saving}
              errorMessage={hasRoleError ? 'Obrigatório' : undefined}
            />
          </div>
        </div>
      </form>

      <SuccessCheckOverlay show={showSuccess} />

      {/* "Descartar cadastro?" era um overlay INTERNO do sheet (absolute
          inset:0 com scrim escuro). Padronizado com o "Descartar lote?" do
          NewSampleModal: dialogo CENTRADO na tela, via portal pro body — o
          `transform` do .bottom-sheet capturaria o position:fixed. O backdrop
          `is-scrim-none` e transparente (o painel atras continua exatamente
          como estava) e fica num tier acima do sheet stacked; `is-compact`
          deixa o card pequeno. */}
      {discardOpen
        ? createPortal(
            <div className="app-modal-backdrop is-scrim-none" onClick={() => setDiscardOpen(false)}>
              <section
                className="app-modal is-themed app-confirm-modal is-compact"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="client-quick-create-discard-title"
                aria-describedby="client-quick-create-discard-description"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="app-modal-content">
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
                  <p
                    id="client-quick-create-discard-description"
                    className="app-confirm-modal-message"
                  >
                    Os dados preenchidos serão perdidos. Esta ação não pode ser desfeita.
                  </p>
                </div>

                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={() => setDiscardOpen(false)}
                    autoFocus
                  >
                    Continuar editando
                  </button>
                  <button
                    type="button"
                    className="app-modal-submit is-danger"
                    onClick={confirmDiscard}
                  >
                    Descartar
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </BottomSheet>
  );
}
