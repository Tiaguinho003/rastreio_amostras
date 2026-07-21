'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';

import { BottomSheet } from '../BottomSheet';
import { SuccessCheckOverlay } from '../SuccessCheckOverlay';
import {
  ClientInactivateWithCascadeModal,
  type CascadeSample,
} from './ClientInactivateWithCascadeModal';
import { ClientUnitModal } from './ClientUnitModal';
import { ClientUnitDetailModal } from './ClientUnitDetailModal';
import { ClientBankAccountModal } from './ClientBankAccountModal';
import { ClientBankAccountDetailModal } from './ClientBankAccountDetailModal';
import { ClientAttachmentPreviewModal } from './ClientAttachmentPreviewModal';
import { ClientCommercialSummaryCard } from './ClientCommercialSummaryCard';
import {
  ApiError,
  getClient,
  getClientCommercialSummary,
  getClientImpact,
  updateClient,
  inactivateClient,
  inactivateClientWithCascade,
  reactivateClient,
  createClientUnit,
  updateClientUnit,
  inactivateClientUnit,
  reactivateClientUnit,
  lookupUsersForReference,
  listClientBankAccounts,
  createClientBankAccount,
  updateClientBankAccount,
  listClientAttachments,
  uploadClientAttachment,
  deleteClientAttachment,
  linkClientAttachmentUnit,
  clientAttachmentDownloadUrl,
} from '../../lib/api-client';
import {
  formatClientDocument,
  formatPhone,
  formatPostalCode,
  maskCpfInput,
  maskCnpjInput,
  maskPhoneInput,
  maskPostalCodeInput,
  maskRegistrationNumberInput,
} from '../../lib/client-field-formatters';
import {
  isClientComplete,
  labelForMissing,
  unitIdFromMissing,
} from '../../lib/clients/client-completeness';
import { useCepLookup } from '../../lib/clients/use-cep-lookup';
import { useDocumentMask } from '../../lib/use-document-mask';
import { useToast } from '../../lib/toast/ToastProvider';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { UserMultiSelect } from '../users/UserMultiSelect';
import { ChipMultiSelectField, type ChipOption } from '../ChipMultiSelectField';
import type {
  ClientCommercialSummaryResponse,
  ClientUnitSummary,
  ClientSummary,
  ClientBankAccountSummary,
  ClientBankAccountInput,
  ClientAttachmentSummary,
  SessionData,
  UserLookupItem,
} from '../../lib/types';

/* ------------------------------------------------------------------ */
/*  Local types & helpers                                             */
/* ------------------------------------------------------------------ */

type Notice = { kind: 'error' | 'success'; text: string } | null;

// Papeis do cliente como opcoes do multi-select (mapeiam pras flags booleanas
// isSeller/isBuyer/isWarehouse do form).
const CLIENT_ROLE_OPTIONS: ChipOption[] = [
  { id: 'seller', label: 'Vendedor' },
  { id: 'buyer', label: 'Comprador' },
  { id: 'warehouse', label: 'Armazém' },
];

// Botao de copia rapida (mesmo padrao da pagina de perfil) ao lado de um valor
// do card Informacoes. Auto-esconde quando nao ha valor.
function InfoCopyButton({
  value,
  label,
  onCopy,
}: {
  value: string | null | undefined;
  label: string;
  onCopy: (text: string, label: string) => void;
}) {
  if (!value) return null;
  return (
    <button
      type="button"
      className="sdv-info-copy"
      aria-label={`Copiar ${label}`}
      onClick={() => onCopy(value, label)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  );
}

function NoticeSlot({ notice }: { notice: Notice }) {
  return (
    <div className="notice-slot" aria-live="polite">
      {notice ? <p className={`notice-slot-text is-${notice.kind}`}>{notice.text}</p> : null}
    </div>
  );
}

const REG_FIELD_LABELS: Record<string, string> = {
  registrationNumber: 'Numero da inscricao',
  car: 'CAR',
  addressLine: 'Endereco',
  district: 'Bairro',
  city: 'Cidade',
  state: 'UF',
  postalCode: 'CEP',
  complement: 'Complemento',
};

function translateUnitError(cause: unknown): string {
  if (!(cause instanceof ApiError)) {
    return 'Falha ao salvar inscricao. Tente novamente.';
  }
  if (cause.status === 0) {
    return 'Sem conexao com o servidor. Verifique sua internet e tente novamente.';
  }
  if (cause.status === 401) {
    return 'Sessao expirada. Faca login novamente.';
  }
  if (cause.status === 403) {
    return 'Sem permissao para esta acao.';
  }
  // L5: PJ rejeita unit com 422 CLIENT_PJ_HAS_NO_UNITS. Mensagem ja vem
  // em pt-BR do service.
  if (
    cause.status === 422 &&
    cause.details &&
    typeof cause.details === 'object' &&
    (cause.details as { code?: string }).code === 'CLIENT_PJ_HAS_NO_UNITS'
  ) {
    return cause.message;
  }
  // Fase 0.1: bloqueio de inativacao da ultima fazenda de PF.
  if (
    cause.status === 409 &&
    cause.details &&
    typeof cause.details === 'object' &&
    (cause.details as { code?: string }).code === 'PF_LAST_ACTIVE_UNIT'
  ) {
    return cause.message;
  }
  const message = cause.message ?? '';
  if (message.includes('already exists')) {
    return 'Numero de inscricao ja esta cadastrado no sistema.';
  }
  if (message.includes('No client registration changes')) {
    return 'Nenhuma alteracao detectada para salvar.';
  }
  // Status (inactivate/reactivate) — mensagens 409 do backend.
  if (message.includes('already inactive')) {
    return 'Filial ja esta inativa.';
  }
  if (message.includes('already active')) {
    return 'Filial ja esta ativa.';
  }
  if (cause.status === 422 && cause.details && typeof cause.details === 'object') {
    const field = (cause.details as { field?: string }).field;
    if (field && REG_FIELD_LABELS[field]) {
      return `${REG_FIELD_LABELS[field]} invalido.`;
    }
  }
  return cause.message || 'Falha ao salvar filial. Tente novamente.';
}

function clientSummaryToForm(client: ClientSummary) {
  return {
    personType: client.personType,
    fullName: client.fullName ?? '',
    legalName: client.legalName ?? '',
    tradeName: client.tradeName ?? '',
    cpf: maskCpfInput(client.cpf ?? ''),
    cnpj: maskCnpjInput(client.cnpj ?? ''),
    phone: maskPhoneInput(client.phone ?? ''),
    email: client.email ?? '',
    registrationNumber: client.registrationNumber ?? '',
    addressLine: client.addressLine ?? '',
    district: client.district ?? '',
    city: client.city ?? '',
    state: client.state ?? '',
    postalCode: client.postalCode ?? '',
    complement: client.complement ?? '',
    isBuyer: client.isBuyer,
    isSeller: client.isSeller,
    isWarehouse: client.isWarehouse,
    commercialUserIds: (client.commercialUsers ?? []).map((u) => u.id),
    reasonText: '',
  };
}

// Iniciais do avatar do hero (mesma regra do avatar da tabela em
// ClientsBrowser — duplicada por ser trivial e local a cada arquivo).
function getClientInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.match(/\p{L}/u)?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Mapeia mensagens de erro de updateClient (backend retorna em ingles em
// alguns casos) para pt-BR. Usado pelo modal de edicao do cliente.
const CLIENT_FIELD_LABELS: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  legalName: 'Razao social',
  tradeName: 'Nome fantasia',
  fullName: 'Nome completo',
  phone: 'Telefone',
  email: 'E-mail',
  registrationNumber: 'Inscricao estadual',
  addressLine: 'Endereco',
  district: 'Bairro',
  city: 'Cidade',
  state: 'UF',
  postalCode: 'CEP',
  complement: 'Complemento',
  commercialUserIds: 'Responsavel',
};

function translateClientUpdateError(cause: unknown): string {
  if (!(cause instanceof ApiError)) {
    return 'Falha ao atualizar cliente. Tente novamente.';
  }
  if (cause.status === 0) {
    return 'Sem conexao com o servidor. Verifique sua internet e tente novamente.';
  }
  if (cause.status === 401) {
    return 'Sessao expirada. Faca login novamente.';
  }
  if (cause.status === 403) {
    return 'Sem permissao para esta acao.';
  }
  const code =
    cause.details && typeof cause.details === 'object'
      ? (cause.details as { code?: string }).code
      : undefined;
  const field =
    cause.details && typeof cause.details === 'object'
      ? (cause.details as { field?: string }).field
      : undefined;
  if (code === 'CLIENT_PERSON_TYPE_LOCKED') return cause.message;
  if (code === 'PJ_REQUIRES_CNPJ') {
    return 'CNPJ e obrigatorio para Pessoa juridica.';
  }
  const message = cause.message ?? '';
  if (message.includes('No client changes')) {
    return 'Nenhuma alteracao detectada para salvar.';
  }
  if (message.includes('already exists') || cause.status === 409) {
    if (field && CLIENT_FIELD_LABELS[field]) {
      return `${CLIENT_FIELD_LABELS[field]} ja cadastrado no sistema.`;
    }
    return 'Registro ja existe no sistema.';
  }
  if (cause.status === 422 && field && CLIENT_FIELD_LABELS[field]) {
    return `${CLIENT_FIELD_LABELS[field]} invalido.`;
  }
  return cause.message || 'Falha ao atualizar cliente. Tente novamente.';
}

/* ------------------------------------------------------------------ */
/*  Detail view                                                       */
/* ------------------------------------------------------------------ */

// RD14: acoes profundas do menu ⋯ da tabela de /cadastros (?acao= na URL).
export type ClientDetailInitialAction = 'editar' | 'documentos' | 'status';

interface ClientDetailViewProps {
  session: SessionData;
  clientId: string;
  /** Sinaliza ao overlay-pai que ha modal interno aberto (bloqueia ESC/X). */
  dismissGuardRef?: MutableRefObject<boolean>;
  /** RD14: abre o modal correspondente UMA vez apos o load (?acao= da URL). */
  initialAction?: ClientDetailInitialAction;
  /** Chamado ao consumir a acao — a pagina limpa o ?acao= via replace. */
  onInitialActionConsumed?: () => void;
}

// Conteudo completo do detalhe do cliente, extraido da antiga pagina
// /clients/[clientId] (F1 do redesign, RD7). Sem guard nem chrome de pagina:
// quem monta (overlay de /cadastros) ja garante sessao e papel.
export function ClientDetailView({
  session,
  clientId,
  dismissGuardRef,
  initialAction,
  onInitialActionConsumed,
}: ClientDetailViewProps) {
  /* ---- data ---- */
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [units, setUnits] = useState<ClientUnitSummary[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);

  const toast = useToast();
  const handleCopyField = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success({ title: `${label} copiado` });
      } catch {
        toast.error({ title: 'Nao foi possivel copiar' });
      }
    },
    [toast]
  );

  /* ---- Rodada 3 FV: abas do drawer de perfil ---- */
  // 'units' so existe pra PF (PJ fica com 2 abas); guarda na render coage
  // de volta pra overview se o cliente carregado for PJ.
  const [detailTab, setDetailTab] = useState<'overview' | 'docs' | 'units'>('overview');

  // Menu ⋯ do hero (Inativar/Reativar). Dismiss = clique-fora + ESC devolvendo
  // o foco ao trigger (mesmo padrao do menu de linha do ClientsBrowser).
  const [heroMenuOpen, setHeroMenuOpen] = useState(false);
  const heroMenuRef = useRef<HTMLDivElement | null>(null);
  const heroMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!heroMenuOpen) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!heroMenuRef.current?.contains(target)) {
        setHeroMenuOpen(false);
      }
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setHeroMenuOpen(false);
      heroMenuTriggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown, true);
    };
  }, [heroMenuOpen]);

  /* ---- commercial summary (4 cards: open / sold / lost / bought) ---- */
  const [commercialSummary, setCommercialSummary] =
    useState<ClientCommercialSummaryResponse | null>(null);
  // Incrementa quando uma operacao deve invalidar o summary (criar/editar
  // filial etc). Plugado nas deps do useEffect de fetch do summary.
  const [commercialRefreshKey, setCommercialRefreshKey] = useState(0);
  const invalidateCommercial = useCallback(() => setCommercialRefreshKey((k) => k + 1), []);

  /* ---- notices (zonas de ERRO; sucesso virou o check canonico) ---- */
  const [pageNotice, setPageNotice] = useState<Notice>(null);
  const [editClientModalNotice, setEditClientModalNotice] = useState<Notice>(null);
  const [unitModalNotice, setUnitModalNotice] = useState<Notice>(null);
  const [statusModalNotice, setStatusModalNotice] = useState<Notice>(null);
  const [unitStatusNotice, setUnitStatusNotice] = useState<Notice>(null);

  /* ---- edit client modal ---- */
  // 14.7.M.4: split por tab — botao pencil em "Informacoes" abre 'info',
  // pencil em "Endereco fiscal" (PJ) abre 'address'. Modal renderiza so
  // os campos do tab atual. Backend updateClient aceita payload partial,
  // entao so envia o que o tab edita.
  // Rodada 2 FV: a edicao virou MODO do painel (sub-pagina, sem modal sobre
  // modal) com form UNICO — o split por aba info/address morreu.
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editClientSuccess, setEditClientSuccess] = useState(false);
  const [editClientForm, setEditClientForm] = useState(() =>
    clientSummaryToForm({
      personType: 'PJ',
      fullName: null,
      legalName: null,
      tradeName: null,
      cpf: null,
      cnpj: null,
      phone: null,
      isBuyer: false,
      isSeller: true,
      isWarehouse: false,
      status: 'ACTIVE',
      commercialUser: null,
      commercialUsers: [],
    } as unknown as ClientSummary)
  );
  const [savingClient, setSavingClient] = useState(false);
  const [users, setUsers] = useState<UserLookupItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  // (sem focus-trap proprio: o editor e conteudo do sheet — o trap do
  // BottomSheet ja cobre; ESC/X ficam bloqueados pelo dismiss-guard.)
  // Checksum CPF/CNPJ inline (mesmo hook usado nos modais de Filial).
  // O personType nao pode ser trocado depois de criado, entao mantemos
  // 2 instancias e usamos a relevante baseado em editClientForm.personType.
  const editCpfMask = useDocumentMask('cpf');
  const editCnpjMask = useDocumentMask('cnpj');

  /* ---- unit modal (create-only) — usa ClientUnitModal pra "Nova filial".
         Edicao inline absorvida pelo ClientUnitDetailModal. ---- */
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);
  const [unitCreateSuccess, setUnitCreateSuccess] = useState(false);
  const [showInactiveUnits, setShowInactiveUnits] = useState(false);

  /* ---- 14.7.I: detail modal (view + edit inline) — abre ao clicar no
     card mini de filial. Substitui o uso do ClientUnitModal pra editar. */
  const [unitDetailUnit, setUnitDetailUnit] = useState<ClientUnitSummary | null>(null);
  const [unitDetailOpen, setUnitDetailOpen] = useState(false);
  const [unitDetailNotice, setUnitDetailNotice] = useState<string | null>(null);
  const [unitDetailSuccess, setUnitDetailSuccess] = useState(false);

  /* ---- Fechamento Fase 0: contas bancárias do cliente (D28) ---- */
  const [bankAccounts, setBankAccounts] = useState<ClientBankAccountSummary[]>([]);
  const [showInactiveBankAccounts, setShowInactiveBankAccounts] = useState(false);
  const [bankAccountModalOpen, setBankAccountModalOpen] = useState(false);
  const [bankAccountModalNotice, setBankAccountModalNotice] = useState<Notice>(null);
  const [savingBankAccount, setSavingBankAccount] = useState(false);
  const [bankAccountCreateSuccess, setBankAccountCreateSuccess] = useState(false);
  const [bankAccountDetailAccount, setBankAccountDetailAccount] =
    useState<ClientBankAccountSummary | null>(null);
  const [bankAccountDetailOpen, setBankAccountDetailOpen] = useState(false);
  const [bankAccountDetailNotice, setBankAccountDetailNotice] = useState<string | null>(null);
  const [bankAccountDetailSuccess, setBankAccountDetailSuccess] = useState(false);
  const [savingBankAccountStatus, setSavingBankAccountStatus] = useState(false);

  /* ---- Fechamento Fase 0: anexos do cliente (D27) ---- */
  const [attachments, setAttachments] = useState<ClientAttachmentSummary[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<Notice>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<ClientAttachmentSummary | null>(null);
  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false);
  const [attachmentPreviewNotice, setAttachmentPreviewNotice] = useState<string | null>(null);
  const [attachmentPreviewSuccess, setAttachmentPreviewSuccess] = useState(false);
  const [deletingAttachment, setDeletingAttachment] = useState(false);
  const [linkingAttachment, setLinkingAttachment] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  // Anexos + Contas bancarias saem do layout e viram um botao (icone de folha) no
  // header que abre o modal "Documentos" (abas). Vale pra desktop E mobile.
  // Rodada 2 FV: o modal "Documentos" morreu — Anexos e Contas bancarias
  // viraram cards SEMPRE visiveis no painel (desktop: coluna lateral).

  const visibleBankAccounts = showInactiveBankAccounts
    ? bankAccounts
    : bankAccounts.filter((account) => account.status === 'ACTIVE');
  const inactiveBankAccountsCount = bankAccounts.filter(
    (account) => account.status === 'INACTIVE'
  ).length;

  /* ---- check de sucesso do DRAWER (rodada 6): flash canonico sobre o
     detalhe quando um aviso central conclui (status do cliente, cascata,
     status da filial) — substitui as frases "... com sucesso". ---- */
  const [detailCheck, setDetailCheck] = useState(false);
  const flashDetailCheck = useCallback(() => {
    setDetailCheck(true);
    window.setTimeout(() => setDetailCheck(false), 1000);
  }, []);

  /* ---- status modal (inactivate/reactivate client) ---- */
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<'inactivate' | 'reactivate'>('inactivate');
  const [statusReasonText, setStatusReasonText] = useState('');
  const [statusImpact, setStatusImpact] = useState<{
    ownedSamples: number;
    activeMovements: number;
    activeUnits: number;
  } | null>(null);
  const [statusImpactLoading, setStatusImpactLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const statusTrapRef = useFocusTrap(statusModalOpen);

  /* ---- cascade modal (inactivate-with-cascade quando ha samples ativas) ---- */
  const [cascadeOpen, setCascadeOpen] = useState(false);
  const [cascadeSamples, setCascadeSamples] = useState<CascadeSample[]>([]);
  const [cascadeSaving, setCascadeSaving] = useState(false);
  const [cascadeError, setCascadeError] = useState<string | null>(null);

  /* ---- registration status modal (inactivate/reactivate registration) ---- */
  const [unitStatusModalOpen, setUnitStatusModalOpen] = useState(false);
  const [unitStatusAction, setUnitStatusAction] = useState<'inactivate' | 'reactivate'>(
    'inactivate'
  );
  const [unitStatusUnitId, setUnitStatusUnitId] = useState<string | null>(null);
  const [unitStatusReason, setUnitStatusReason] = useState('');
  const [savingUnitStatus, setSavingUnitStatus] = useState(false);
  const unitStatusTrapRef = useFocusTrap(unitStatusModalOpen);

  // Guarda de dismiss do overlay-pai: com QUALQUER modal interno aberto, ESC/X
  // do overlay nao fecham (quem fecha e o modal). Manter o OR completo ao
  // adicionar um modal novo a este arquivo.
  const anyModalOpen =
    editClientOpen ||
    unitModalOpen ||
    unitDetailOpen ||
    bankAccountModalOpen ||
    bankAccountDetailOpen ||
    attachmentPreviewOpen ||
    statusModalOpen ||
    cascadeOpen ||
    unitStatusModalOpen;
  useEffect(() => {
    if (!dismissGuardRef) return;
    dismissGuardRef.current = anyModalOpen;
    return () => {
      dismissGuardRef.current = false;
    };
  }, [dismissGuardRef, anyModalOpen]);

  /* ---- refs ---- */
  const fetchAbortRef = useRef<AbortController | null>(null);

  /* ================================================================ */
  /*  Data fetching                                                   */
  /* ================================================================ */

  const fetchData = useCallback(
    async (showLoading = false) => {
      if (!session || !clientId) return;
      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      if (showLoading) setLoadingPage(true);

      try {
        const [response, accountsRes, attachmentsRes] = await Promise.all([
          getClient(session, clientId, { signal: controller.signal }),
          listClientBankAccounts(session, clientId, { signal: controller.signal }).catch(
            () => null
          ),
          listClientAttachments(session, clientId, { signal: controller.signal }).catch(() => null),
        ]);
        if (controller.signal.aborted) return;
        setClient(response.client);
        setUnits(response.units);
        if (accountsRes) setBankAccounts(accountsRes.items);
        if (attachmentsRes) setAttachments(attachmentsRes.items);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setPageNotice({
          kind: 'error',
          text: cause instanceof ApiError ? cause.message : 'Falha ao carregar cliente.',
        });
      } finally {
        if (!controller.signal.aborted) setLoadingPage(false);
      }
    },
    [session, clientId]
  );

  useEffect(() => {
    void fetchData(true);
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [fetchData]);

  /* Resumo comercial — fetch lazy em paralelo apos o cliente carregar.
     So depende de session+clientId; refetch manual quando criar/atualizar
     amostras pode ser plugado no futuro. */
  useEffect(() => {
    if (!session || !clientId) return;
    const controller = new AbortController();
    getClientCommercialSummary(session, clientId, { signal: controller.signal })
      .then((response) => setCommercialSummary(response))
      .catch(() => {
        // silent — cards exibem 0 como fallback
      });
    return () => controller.abort();
  }, [session, clientId, commercialRefreshKey]);

  /* ================================================================ */
  /*  Validation                                                      */
  /* ================================================================ */

  const canSaveClient = useMemo(() => {
    // Rodada 2: form unico — as regras de nome/telefone/doc valem sempre
    // (os campos de endereco do PJ nao tem validacao obrigatoria).
    const nameOk =
      editClientForm.personType === 'PF'
        ? editClientForm.fullName.trim().length > 0
        : editClientForm.legalName.trim().length > 0;
    // Telefone e opcional. Se preenchido, exige formato brasileiro (10 ou
    // 11 digitos); se vazio, ok (backend aceita null).
    const phoneDigits = editClientForm.phone.replace(/\D/g, '').length;
    const phoneOk = phoneDigits === 0 || phoneDigits === 10 || phoneDigits === 11;
    // Checksum CPF/CNPJ via useDocumentMask — vazio tambem e valido (backend
    // aceita null pra ambos).
    const docOk = editClientForm.personType === 'PF' ? editCpfMask.isValid : editCnpjMask.isValid;
    return nameOk && phoneOk && docOk;
  }, [editClientForm, editCpfMask.isValid, editCnpjMask.isValid]);

  // Papeis selecionados (ids) derivados das flags do form, pro multi-select.
  const editClientRoleIds = useMemo(() => {
    const ids: string[] = [];
    if (editClientForm.isSeller) ids.push('seller');
    if (editClientForm.isBuyer) ids.push('buyer');
    if (editClientForm.isWarehouse) ids.push('warehouse');
    return ids;
  }, [editClientForm.isSeller, editClientForm.isBuyer, editClientForm.isWarehouse]);

  // L5: derived units lists for cards section
  const activeUnitsList = useMemo(() => units.filter((u) => u.status === 'ACTIVE'), [units]);
  const inactiveUnitsCount = useMemo(
    () => units.filter((u) => u.status === 'INACTIVE').length,
    [units]
  );
  const visibleUnits = useMemo(
    () => (showInactiveUnits ? units : activeUnitsList),
    [showInactiveUnits, units, activeUnitsList]
  );
  // L5: PJ nao tem units (dados ficam no Client direto). PF tem filiais.
  const isPf = client?.personType === 'PF';
  const isPj = client?.personType === 'PJ';
  const unitSingular = 'filial';
  const unitPlural = 'Filiais';
  // Backend rejeita unit em PJ com 422 CLIENT_PJ_HAS_NO_UNITS.
  const canAddUnit = isPf;

  // Rodada 3: aba ativa coagida — PJ nao tem a aba Filiais.
  const activeDetailTab = detailTab === 'units' && isPj ? 'overview' : detailTab;

  // 14.7.G: indicador de pendencia inline. Em vez do banner grande de
  // "Cadastro incompleto" no topo, cada campo recomendado missing recebe
  // um icone amarelo pulsante ao lado do label + label em cor amber.
  const missingSet = useMemo(() => {
    const result = isClientComplete(client);
    return new Set(result.missing);
  }, [client]);
  const isMissing = (field: string) => missingSet.has(field);
  // Borda laranja nos inputs do modal de edicao cujo campo esta pendente
  // (recomendado e ainda vazio no form). Limpa ao digitar (some quando preenche).
  const pendingClass = (field: string, value: string) =>
    isMissing(field) && value.trim().length === 0 ? ' is-pending' : '';

  // Rodada 2: resumo textual das pendencias pro banner do header — campos do
  // cliente por rotulo + filiais agregadas em contagem ("2 filiais com
  // pendências"). Substitui os indicadores pulsantes.
  const pendingSummary = useMemo(() => {
    if (missingSet.size === 0) return null;
    const parts = [...missingSet]
      .filter((key) => !key.startsWith('units[') && key !== 'client')
      .map((key) => labelForMissing(key));
    const unitIds = new Set<string>();
    for (const key of missingSet) {
      const id = unitIdFromMissing(key);
      if (id) unitIds.add(id);
    }
    if (unitIds.size === 1) parts.push('1 filial com pendências');
    if (unitIds.size > 1) parts.push(`${unitIds.size} filiais com pendências`);
    return parts.length > 0 ? parts.join(' · ') : null;
  }, [missingSet]);

  /* ================================================================ */
  /*  Edit client handlers                                            */
  /* ================================================================ */

  function openEditClient() {
    if (!client) return;
    setEditClientForm(clientSummaryToForm(client));
    editCpfMask.setRaw(client.cpf ?? '');
    editCnpjMask.setRaw(client.cnpj ?? '');
    setEditClientModalNotice(null);
    setEditClientOpen(true);

    if (!session) return;
    setLoadingUsers(true);
    lookupUsersForReference(session, { limit: 200 })
      // Responsavel opcional e QUALQUER usuario ativo pode ser responsavel.
      .then((response) => setUsers(response.items))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }

  function closeEditClient() {
    if (savingClient) return;
    setEditClientOpen(false);
  }

  // 14.1 + Q-24: CEP lookup automatico no modal de edicao PJ.
  // Mesmo padrao de ClientUnitModal: digita 8 digitos, ViaCEP responde,
  // preenche endereco/bairro/cidade/UF.
  const editCep = useCepLookup(editClientOpen ? editClientForm.postalCode : '');

  useEffect(() => {
    if (!editClientOpen) return;
    editCep.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editClientOpen]);

  useEffect(() => {
    if (!editCep.data) return;
    setEditClientForm((prev) => ({
      ...prev,
      addressLine: editCep.data!.addressLine || prev.addressLine,
      district: editCep.data!.district || prev.district,
      city: editCep.data!.city || prev.city,
      state: editCep.data!.state || prev.state,
    }));
  }, [editCep.data]);

  async function handleUpdateClient(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !clientId || !canSaveClient) return;
    setSavingClient(true);
    setEditClientModalNotice(null);

    try {
      // Rodada 2: form UNICO — informacoes sempre; endereco fiscal junto no
      // PJ (backend usa Object.hasOwn, entao mandar o conjunto todo e ok).
      // personType nao e enviado: backend bloqueia troca (422
      // CLIENT_PERSON_TYPE_LOCKED). UI mostra readonly.
      const data: Parameters<typeof updateClient>[2] = {
        reasonText: editClientForm.reasonText,
      };

      data.isBuyer = editClientForm.isBuyer;
      data.isSeller = editClientForm.isSeller;
      data.isWarehouse = editClientForm.isWarehouse;

      if (editClientForm.personType === 'PF') {
        data.fullName = editClientForm.fullName;
        data.cpf = editCpfMask.digits || null;
        data.email = editClientForm.email.trim() || null;
      } else {
        // L5: PJ guarda cnpj direto no Client.
        data.legalName = editClientForm.legalName;
        data.tradeName = editClientForm.tradeName || null;
        data.cnpj = editCnpjMask.digits || null;
        data.email = editClientForm.email.trim() || null;
      }

      if (editClientForm.phone.replace(/\D/g, '').length > 0) {
        data.phone = editClientForm.phone.replace(/\D/g, '');
      } else {
        data.phone = null;
      }

      data.commercialUserIds = editClientForm.commercialUserIds;

      if (editClientForm.personType === 'PJ') {
        // Endereco fiscal + IE (o bloco do form so existe pra PJ).
        data.registrationNumber = editClientForm.registrationNumber.trim() || null;
        data.addressLine = editClientForm.addressLine.trim() || null;
        data.district = editClientForm.district.trim() || null;
        data.city = editClientForm.city.trim() || null;
        data.state = editClientForm.state.trim().toUpperCase() || null;
        data.postalCode = editClientForm.postalCode.replace(/\D/g, '') || null;
        data.complement = editClientForm.complement.trim() || null;
      }

      await updateClient(session, clientId, data);
      setEditClientSuccess(true);
      void fetchData();
      invalidateCommercial();
      window.setTimeout(() => {
        setEditClientOpen(false);
        setEditClientSuccess(false);
      }, 1000);
    } catch (cause) {
      setEditClientModalNotice({
        kind: 'error',
        text: translateClientUpdateError(cause),
      });
    } finally {
      setSavingClient(false);
    }
  }

  /* ================================================================ */
  /*  Unit CRUD handlers — L5 (apenas PF)                            */
  /* ================================================================ */

  function openUnitCreate() {
    setUnitModalNotice(null);
    setSavingUnit(false);
    setUnitCreateSuccess(false);
    setUnitModalOpen(true);
  }

  function closeUnitModal() {
    if (savingUnit) return;
    setUnitModalOpen(false);
  }

  // 14.7.I: detail modal (view + edit inline) handlers
  function openUnitDetailModal(unit: ClientUnitSummary) {
    setUnitDetailUnit(unit);
    setUnitDetailNotice(null);
    setSavingUnit(false);
    setUnitDetailSuccess(false);
    setUnitDetailOpen(true);
  }

  function closeUnitDetailModal() {
    if (savingUnit || unitDetailSuccess) return;
    setUnitDetailOpen(false);
  }

  async function handleUnitDetailSave(
    data: import('../../lib/types').ClientUnitInput,
    reasonText: string
  ) {
    if (!session || !clientId || !unitDetailUnit) return;
    setSavingUnit(true);
    setUnitDetailNotice(null);
    try {
      await updateClientUnit(session, clientId, unitDetailUnit.id, {
        ...data,
        reasonText,
      });
      // Rodada 6: check canonico sobre o painel; fecha na sequencia.
      setUnitDetailSuccess(true);
      void fetchData();
      invalidateCommercial();
      window.setTimeout(() => {
        setUnitDetailOpen(false);
        setUnitDetailSuccess(false);
      }, 1000);
    } catch (cause) {
      setUnitDetailNotice(translateUnitError(cause));
    } finally {
      setSavingUnit(false);
    }
  }

  function handleUnitDetailInactivate() {
    if (!unitDetailUnit) return;
    const unit = unitDetailUnit;
    setUnitDetailOpen(false);
    openUnitStatusModal(unit, 'inactivate');
  }

  function handleUnitDetailReactivate() {
    if (!unitDetailUnit) return;
    const unit = unitDetailUnit;
    setUnitDetailOpen(false);
    openUnitStatusModal(unit, 'reactivate');
  }

  async function handleUnitSubmit(data: import('../../lib/types').ClientUnitInput) {
    if (!session || !clientId) return;
    setSavingUnit(true);
    setUnitModalNotice(null);

    try {
      await createClientUnit(session, clientId, data);
      setUnitCreateSuccess(true);
      void fetchData();
      invalidateCommercial();
      window.setTimeout(() => {
        setUnitModalOpen(false);
        setUnitCreateSuccess(false);
      }, 1000);
    } catch (cause) {
      setUnitModalNotice({
        kind: 'error',
        text: translateUnitError(cause),
      });
    } finally {
      setSavingUnit(false);
    }
  }

  /* ================================================================ */
  /*  Bank account handlers (Fechamento Fase 0)                       */
  /* ================================================================ */

  function openBankAccountCreate() {
    setBankAccountModalNotice(null);
    setBankAccountCreateSuccess(false);
    setSavingBankAccount(false);
    setBankAccountModalOpen(true);
  }

  function closeBankAccountModal() {
    if (savingBankAccount) return;
    setBankAccountModalOpen(false);
  }

  async function handleBankAccountSubmit(data: ClientBankAccountInput) {
    if (!session || !clientId) return;
    setSavingBankAccount(true);
    setBankAccountModalNotice(null);
    try {
      await createClientBankAccount(session, clientId, data);
      setBankAccountCreateSuccess(true);
      void fetchData();
      window.setTimeout(() => {
        setBankAccountModalOpen(false);
        setBankAccountCreateSuccess(false);
      }, 1000);
    } catch (cause) {
      setBankAccountModalNotice({
        kind: 'error',
        text: cause instanceof ApiError ? cause.message : 'Falha ao salvar conta bancária.',
      });
    } finally {
      setSavingBankAccount(false);
    }
  }

  function openBankAccountDetail(account: ClientBankAccountSummary) {
    setBankAccountDetailAccount(account);
    setBankAccountDetailNotice(null);
    setBankAccountDetailSuccess(false);
    setBankAccountDetailOpen(true);
  }

  function closeBankAccountDetail() {
    if (savingBankAccount || savingBankAccountStatus || bankAccountDetailSuccess) return;
    setBankAccountDetailOpen(false);
  }

  // Rodada 6: sucesso = check canonico sobre o painel; fecha na sequencia.
  function finishBankAccountDetail() {
    setBankAccountDetailSuccess(true);
    void fetchData();
    window.setTimeout(() => {
      setBankAccountDetailOpen(false);
      setBankAccountDetailSuccess(false);
    }, 1000);
  }

  async function handleBankAccountDetailSave(data: ClientBankAccountInput) {
    if (!session || !clientId || !bankAccountDetailAccount) return;
    setSavingBankAccount(true);
    setBankAccountDetailNotice(null);
    try {
      await updateClientBankAccount(session, clientId, bankAccountDetailAccount.id, data);
      finishBankAccountDetail();
    } catch (cause) {
      setBankAccountDetailNotice(
        cause instanceof ApiError ? cause.message : 'Falha ao salvar conta bancária.'
      );
    } finally {
      setSavingBankAccount(false);
    }
  }

  async function handleBankAccountStatusChange(status: 'ACTIVE' | 'INACTIVE') {
    if (!session || !clientId || !bankAccountDetailAccount) return;
    setSavingBankAccountStatus(true);
    setBankAccountDetailNotice(null);
    try {
      await updateClientBankAccount(session, clientId, bankAccountDetailAccount.id, { status });
      finishBankAccountDetail();
    } catch (cause) {
      setBankAccountDetailNotice(
        cause instanceof ApiError ? cause.message : 'Falha ao alterar status da conta.'
      );
    } finally {
      setSavingBankAccountStatus(false);
    }
  }

  /* ================================================================ */
  /*  Attachment handlers (Fechamento Fase 0)                         */
  /* ================================================================ */

  async function handleAttachmentSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !session || !clientId) return;
    setUploadingAttachment(true);
    setAttachmentNotice(null);
    try {
      await uploadClientAttachment(session, clientId, file);
      setAttachmentNotice({ kind: 'success', text: 'Anexo enviado com sucesso.' });
      void fetchData();
    } catch (cause) {
      setAttachmentNotice({
        kind: 'error',
        text: cause instanceof ApiError ? cause.message : 'Falha ao enviar anexo.',
      });
    } finally {
      setUploadingAttachment(false);
    }
  }

  function openAttachmentPreview(attachment: ClientAttachmentSummary) {
    setAttachmentPreview(attachment);
    setAttachmentPreviewNotice(null);
    setAttachmentPreviewSuccess(false);
    setAttachmentPreviewOpen(true);
  }

  function closeAttachmentPreview() {
    if (deletingAttachment || linkingAttachment || attachmentPreviewSuccess) return;
    setAttachmentPreviewOpen(false);
  }

  // Vinculo definitivo do anexo a uma filial. O modal segue ABERTO, entao nao
  // basta o fetchData(): o attachmentPreview e uma copia congelada do estado.
  // Atualiza o preview e a lista com a view que o PATCH devolve (ja traz unit).
  async function handleAttachmentLink(unitId: string) {
    if (!session || !clientId || !attachmentPreview) return;
    setLinkingAttachment(true);
    setAttachmentPreviewNotice(null);
    try {
      const { attachment } = await linkClientAttachmentUnit(
        session,
        clientId,
        attachmentPreview.id,
        unitId
      );
      setAttachmentPreview(attachment);
      setAttachments((prev) => prev.map((it) => (it.id === attachment.id ? attachment : it)));
      // Rodada 6: check canonico (flash) — o painel segue aberto.
      setAttachmentPreviewSuccess(true);
      window.setTimeout(() => setAttachmentPreviewSuccess(false), 1000);
    } catch (cause) {
      setAttachmentPreviewNotice(
        cause instanceof ApiError ? cause.message : 'Falha ao vincular o anexo à filial.'
      );
    } finally {
      setLinkingAttachment(false);
    }
  }

  async function handleAttachmentDelete() {
    if (!session || !clientId || !attachmentPreview) return;
    setDeletingAttachment(true);
    setAttachmentPreviewNotice(null);
    try {
      await deleteClientAttachment(session, clientId, attachmentPreview.id);
      // Rodada 6: check canonico sobre o painel; fecha na sequencia.
      setAttachmentPreviewSuccess(true);
      void fetchData();
      window.setTimeout(() => {
        setAttachmentPreviewOpen(false);
        setAttachmentPreviewSuccess(false);
      }, 1000);
    } catch (cause) {
      setAttachmentPreviewNotice(
        cause instanceof ApiError ? cause.message : 'Falha ao excluir anexo.'
      );
    } finally {
      setDeletingAttachment(false);
    }
  }

  /* ================================================================ */
  /*  Client status handlers                                          */
  /* ================================================================ */

  function openStatusModal(action: 'inactivate' | 'reactivate') {
    setStatusAction(action);
    setStatusReasonText('');
    setStatusModalNotice(null);
    setStatusImpact(null);
    setStatusModalOpen(true);

    if (action === 'inactivate' && session) {
      setStatusImpactLoading(true);
      getClientImpact(session, clientId)
        .then((result) => {
          setStatusImpact(result.usage);
        })
        .catch((cause) => {
          setStatusModalNotice({
            kind: 'error',
            text: cause instanceof ApiError ? cause.message : 'Falha ao verificar impacto.',
          });
        })
        .finally(() => {
          setStatusImpactLoading(false);
        });
    }
  }

  function closeStatusModal() {
    if (savingStatus) return;
    setStatusModalOpen(false);
  }

  // RD14: acao profunda do menu ⋯ (?acao=editar|documentos|status). Dispara o
  // modal UMA vez quando o cliente termina de carregar e devolve o consumo pra
  // pagina limpar a URL. O ref reseta quando a prop limpa (value -> undefined),
  // permitindo uma nova acao no MESMO cliente montado (sem remount).
  const initialActionConsumedRef = useRef(false);
  useEffect(() => {
    if (!initialAction) {
      initialActionConsumedRef.current = false;
      return;
    }
    if (!client || initialActionConsumedRef.current) return;
    initialActionConsumedRef.current = true;
    if (initialAction === 'editar') {
      openEditClient();
    } else if (initialAction === 'documentos') {
      // Rodada 3: documentos viraram ABA — o deep-link abre nela.
      setDetailTab('docs');
    } else {
      openStatusModal(client.status === 'ACTIVE' ? 'inactivate' : 'reactivate');
    }
    onInitialActionConsumed?.();
    // Openers sao function declarations do componente (identidade nova a cada
    // render) — deps ficam no par que dispara de fato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, client]);

  async function handleStatusSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !clientId || statusReasonText.trim().length === 0) return;
    setSavingStatus(true);
    setStatusModalNotice(null);

    try {
      if (statusAction === 'inactivate') {
        await inactivateClient(session, clientId, statusReasonText);
      } else {
        await reactivateClient(session, clientId, statusReasonText);
      }

      // Rodada 6: a frase de sucesso virou o check canonico sobre o drawer.
      setStatusModalOpen(false);
      flashDetailCheck();
      void fetchData();
    } catch (cause) {
      // #6/Q-05 (E1): backend rejeita 409 quando ha samples ATIVAS. Detalhes
      // contem `activeSamples`; abrimos o modal de cascade pra confirmacao.
      if (
        cause instanceof ApiError &&
        cause.status === 409 &&
        statusAction === 'inactivate' &&
        cause.details &&
        typeof cause.details === 'object' &&
        (cause.details as { code?: string }).code === 'CLIENT_HAS_ACTIVE_SAMPLES'
      ) {
        const detailPayload = (cause.details as { details?: { activeSamples?: CascadeSample[] } })
          .details;
        const samples = Array.isArray(detailPayload?.activeSamples)
          ? detailPayload.activeSamples
          : [];
        setCascadeSamples(samples);
        setCascadeError(null);
        setStatusModalOpen(false);
        setCascadeOpen(true);
      } else {
        setStatusModalNotice({
          kind: 'error',
          text: cause instanceof ApiError ? cause.message : 'Falha ao alterar status do cliente.',
        });
      }
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleCascadeConfirm(
    confirmedSampleIds: string[],
    reasonText: string | null
  ): Promise<void> {
    if (!session || !clientId) return;
    setCascadeSaving(true);
    setCascadeError(null);
    try {
      await inactivateClientWithCascade(session, clientId, {
        confirmedSampleIds,
        reasonText,
      });
      // Rodada 6: check canonico sobre o drawer (a contagem de amostras
      // invalidadas saiu junto com a frase; o proprio modal ja lista tudo).
      setCascadeOpen(false);
      flashDetailCheck();
      void fetchData();
    } catch (cause) {
      setCascadeError(
        cause instanceof ApiError ? cause.message : 'Falha ao inativar cliente em cascata.'
      );
    } finally {
      setCascadeSaving(false);
    }
  }

  /* ================================================================ */
  /*  Registration status handlers                                    */
  /* ================================================================ */

  function openUnitStatusModal(unit: ClientUnitSummary, action: 'inactivate' | 'reactivate') {
    setUnitStatusUnitId(unit.id);
    setUnitStatusAction(action);
    setUnitStatusReason('');
    setUnitStatusNotice(null);
    setUnitStatusModalOpen(true);
  }

  function closeUnitStatusModal() {
    if (savingUnitStatus) return;
    setUnitStatusModalOpen(false);
  }

  async function handleUnitStatusSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !clientId || !unitStatusUnitId || unitStatusReason.trim().length === 0) return;
    setSavingUnitStatus(true);
    setUnitStatusNotice(null);

    try {
      // L5: ClientUnit so existe pra PF (filial).
      if (unitStatusAction === 'inactivate') {
        await inactivateClientUnit(session, clientId, unitStatusUnitId, unitStatusReason);
      } else {
        await reactivateClientUnit(session, clientId, unitStatusUnitId, unitStatusReason);
      }

      // Rodada 6: a frase de sucesso virou o check canonico sobre o drawer.
      setUnitStatusModalOpen(false);
      flashDetailCheck();
      void fetchData();
      // Status da filial muda OR clauses de baseWhere (filial inativa
      // some/aparece nos counts).
      invalidateCommercial();
    } catch (cause) {
      setUnitStatusNotice({
        kind: 'error',
        text: translateUnitError(cause),
      });
    } finally {
      setSavingUnitStatus(false);
    }
  }

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  // Corpo dos anexos (grade OU vazio + notice) reutilizado no card (mobile) e no
  // modal (desktop). Os handlers/estado sao os mesmos.
  const attachmentsBody = (
    <>
      {attachments.length === 0 ? (
        <div className="spv2-empty client-detail-empty-compact">
          <p className="spv2-empty-text">Nenhum anexo</p>
        </div>
      ) : (
        <div className="sdv-attachment-grid">
          {attachments.map((attachment) => {
            const isImage = (attachment.mimeType ?? '').startsWith('image/');
            return (
              <button
                key={attachment.id}
                type="button"
                className="sdv-attachment-thumb"
                onClick={() => openAttachmentPreview(attachment)}
                title={attachment.fileName ?? 'Anexo'}
              >
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={clientAttachmentDownloadUrl(clientId, attachment.id)}
                    alt={attachment.fileName ?? 'Anexo'}
                  />
                ) : (
                  <span className="sdv-attachment-thumb-pdf" aria-hidden="true">
                    PDF
                  </span>
                )}
                {/* Sem chip = anexo do proprio cliente. Filial inativa = chip esmaecido. */}
                {attachment.unit ? (
                  <span
                    className={`sdv-attachment-thumb-chip${
                      attachment.unit.status === 'INACTIVE' ? ' is-inactive' : ''
                    }`}
                  >
                    {attachment.unit.name ?? 'Filial'}
                  </span>
                ) : null}
                <span className="sdv-attachment-thumb-name">{attachment.fileName ?? 'Anexo'}</span>
              </button>
            );
          })}
        </div>
      )}
      <NoticeSlot notice={attachmentNotice} />
    </>
  );

  // Corpo das contas bancarias (lista OU vazio + notice) reutilizado no modal
  // "Documentos" (aba Contas). Mesmos handlers/estado do antigo card.
  const bankAccountsBody = (
    <>
      {bankAccounts.length === 0 ? (
        <div className="spv2-empty client-detail-empty-compact">
          <p className="spv2-empty-text">Nenhuma conta cadastrada</p>
        </div>
      ) : (
        <div className="sdv-unit-list">
          {visibleBankAccounts.map((account) => (
            <button
              key={account.id}
              type="button"
              className={`sdv-unit-card-mini${account.status === 'INACTIVE' ? ' is-inactive' : ''}`}
              onClick={() => openBankAccountDetail(account)}
            >
              <div className="sdv-unit-card-mini-content">
                <span className="sdv-unit-card-mini-name">
                  {account.bankName || 'Banco'}
                  {account.status === 'INACTIVE' ? (
                    <span className="sdv-unit-card-mini-inactive">Inativa</span>
                  ) : null}
                </span>
                <span className="sdv-unit-card-mini-city">
                  Ag. {account.agency} · Conta {account.accountNumber}
                </span>
              </div>
              <svg className="sdv-unit-card-mini-arrow" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          ))}
          {inactiveBankAccountsCount > 0 ? (
            <button
              type="button"
              className="sdv-edit-btn-small"
              onClick={() => setShowInactiveBankAccounts((v) => !v)}
            >
              {showInactiveBankAccounts
                ? 'Esconder inativas'
                : `Mostrar ${inactiveBankAccountsCount} inativa(s)`}
            </button>
          ) : null}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Rodada 6: check canonico sobre o DRAWER — flash apos avisos centrais
          concluirem (status do cliente, cascata, status da filial). Ancorado
          no sheet do detalhe (absolute). */}
      <SuccessCheckOverlay show={detailCheck} />

      {/* Rodada 5 FV: o editor virou painel lateral — o drawer nao se esconde
          mais (o is-editing/display:none da rodada 2 morreu). */}
      <section className="sdv-page">
        {loadingPage && !client ? (
          <div className="spv2-empty">
            <p className="spv2-empty-text">Carregando cliente…</p>
          </div>
        ) : null}
        {!loadingPage && client ? (
          <>
            {/* Rodada 3 FV: HERO de perfil (referencia "Staff details") —
                avatar central com ponto de status, nome, Cod., chips de
                papeis, contato copiavel e fileira de acoes redondas
                (e-mail, telefone, editar, ⋯). O header de identidade e o
                botao Editar textual morreram; Inativar/Reativar migrou do
                rodape pro menu ⋯. */}
            <header className="fv-cd-hero">
              <div className={`fv-cd-avatar${isPj ? ' is-pj' : ''}`} aria-hidden="true">
                <span className="fv-cd-avatar-initials">
                  {getClientInitials(client.displayName ?? 'Cliente') || '—'}
                </span>
                <span
                  className={`fv-cd-avatar-dot ${client.status === 'ACTIVE' ? 'is-active' : 'is-inactive'}`}
                />
              </div>
              <h2 className="fv-cd-name">{client.displayName ?? 'Cliente'}</h2>
              <span className="fv-cd-code">
                Cod. {client.code} · {client.personType}
              </span>
              <div className="fv-cd-role-chips">
                {client.status !== 'ACTIVE' ? (
                  /* Status unico da tabela: inativo = "Cancelado" (ativo fica
                     implicito no ponto verde do avatar, como na referencia). */
                  <span className="fv-chip fv-chip-red">Cancelado</span>
                ) : null}
                {client.isSeller ? <span className="fv-chip fv-chip-gray">Vendedor</span> : null}
                {client.isBuyer ? <span className="fv-chip fv-chip-gray">Comprador</span> : null}
                {client.isWarehouse ? <span className="fv-chip fv-chip-gray">Armazém</span> : null}
              </div>
              <div className="fv-cd-contact">
                {client.email ? (
                  <button
                    type="button"
                    className="fv-cd-contact-item"
                    title="Copiar e-mail"
                    onClick={() => handleCopyField(client.email ?? '', 'Email')}
                  >
                    {client.email}
                  </button>
                ) : null}
                {client.email && client.phone ? (
                  <span className="fv-cd-contact-sep" aria-hidden="true">
                    ·
                  </span>
                ) : null}
                {client.phone ? (
                  <button
                    type="button"
                    className="fv-cd-contact-item"
                    title="Copiar telefone"
                    onClick={() =>
                      handleCopyField(formatPhone(client.phone) || (client.phone ?? ''), 'Telefone')
                    }
                  >
                    {formatPhone(client.phone) || client.phone}
                  </button>
                ) : null}
                {!client.email && !client.phone ? (
                  <span className="fv-cd-contact-empty">Sem contato cadastrado</span>
                ) : null}
              </div>

              <div className="fv-cd-actions-row">
                {client.email ? (
                  <a
                    className="fv-cd-iconbtn"
                    href={`mailto:${client.email}`}
                    aria-label="Enviar e-mail"
                    title="Enviar e-mail"
                  >
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </a>
                ) : (
                  <span className="fv-cd-iconbtn is-disabled" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </span>
                )}
                <button
                  type="button"
                  className="fv-cd-iconbtn"
                  disabled={!client.phone}
                  aria-label="Copiar telefone"
                  title="Copiar telefone"
                  onClick={() =>
                    client.phone
                      ? handleCopyField(formatPhone(client.phone) || client.phone, 'Telefone')
                      : undefined
                  }
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="fv-cd-iconbtn"
                  onClick={() => openEditClient()}
                  disabled={editClientOpen}
                  aria-label="Editar cadastro"
                  title="Editar cadastro"
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                  </svg>
                </button>
                <div className="fv-cd-more-wrap" ref={heroMenuRef}>
                  <button
                    type="button"
                    ref={heroMenuTriggerRef}
                    className="fv-cd-iconbtn"
                    aria-haspopup="menu"
                    aria-expanded={heroMenuOpen}
                    aria-label="Mais ações"
                    title="Mais ações"
                    onClick={() => setHeroMenuOpen((open) => !open)}
                  >
                    <svg
                      className="fv-cd-iconbtn-dots"
                      viewBox="0 0 24 24"
                      focusable="false"
                      aria-hidden="true"
                    >
                      <circle cx="5" cy="12" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <circle cx="19" cy="12" r="1.6" />
                    </svg>
                  </button>
                  {heroMenuOpen ? (
                    <div className="fv-cd-more-menu" role="menu" aria-label="Mais ações">
                      <button
                        type="button"
                        role="menuitem"
                        className={`fv-cd-more-item${client.status === 'ACTIVE' ? ' is-danger' : ''}`}
                        onClick={() => {
                          setHeroMenuOpen(false);
                          openStatusModal(client.status === 'ACTIVE' ? 'inactivate' : 'reactivate');
                        }}
                      >
                        {client.status === 'ACTIVE' ? 'Inativar cliente' : 'Reativar cliente'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Pendencias: banner discreto abaixo das acoes. So em cliente
                  ativo (inativo ja e terminal). */}
              {client.status === 'ACTIVE' && pendingSummary ? (
                <div className="fv-cd-pending" role="note">
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                  </svg>
                  <span className="fv-cd-pending-text">
                    <strong>Cadastro incompleto.</strong> Faltam: {pendingSummary}.
                  </span>
                </div>
              ) : null}
            </header>

            <NoticeSlot notice={pageNotice} />

            {/* Abas do drawer (molde ARIA do .cad-tabs). PJ nao tem Filiais. */}
            <div className="fv-cd-tabs" role="tablist" aria-label="Seções do cliente">
              <button
                type="button"
                role="tab"
                aria-selected={activeDetailTab === 'overview'}
                className={`fv-cd-tab${activeDetailTab === 'overview' ? ' is-active' : ''}`}
                onClick={() => setDetailTab('overview')}
              >
                Visão geral
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeDetailTab === 'docs'}
                className={`fv-cd-tab${activeDetailTab === 'docs' ? ' is-active' : ''}`}
                onClick={() => setDetailTab('docs')}
              >
                Documentos
              </button>
              {!isPj ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeDetailTab === 'units'}
                  className={`fv-cd-tab${activeDetailTab === 'units' ? ' is-active' : ''}`}
                  onClick={() => setDetailTab('units')}
                >
                  {unitPlural}
                </button>
              ) : null}
            </div>

            <section className="sdv-content">
              <div className="sdv-content-inner">
                {/* ── ABA VISÃO GERAL: grafico de linhas + cards numericos ── */}
                {activeDetailTab === 'overview' ? (
                  <section className="sdv-client-commercial-section">
                    <ClientCommercialSummaryCard
                      summary={commercialSummary}
                      isBuyer={!!client.isBuyer}
                    />
                  </section>
                ) : null}

                {/* ── ABA DOCUMENTOS: dados cadastrais (contato e papeis moram
                    no hero) + endereco fiscal (PJ) + contas + anexos ── */}
                {activeDetailTab === 'docs' ? (
                  <section className="sdv-general">
                    <div className="sdv-info-split-row">
                      <div id="sdv-informacoes" className="sdv-card sdv-info-compact sdv-card-info">
                        {/* Edicao e uma so, pelas acoes do hero. */}
                        <div className="sdv-card-header">
                          <span className="sdv-card-title">Dados do cadastro</span>
                        </div>
                        <div className="sdv-info-grid">
                          <div className="sdv-info-item is-full">
                            <span className="sdv-info-label">
                              {client.personType === 'PF' ? 'Nome completo' : 'Razao social'}
                            </span>
                            <div className="sdv-info-value-row">
                              <span className="sdv-info-value">
                                {client.personType === 'PF'
                                  ? client.fullName || '\u2014'
                                  : client.legalName || '\u2014'}
                              </span>
                              <InfoCopyButton
                                value={
                                  client.personType === 'PF' ? client.fullName : client.legalName
                                }
                                label={
                                  client.personType === 'PF' ? 'Nome completo' : 'Razao social'
                                }
                                onCopy={handleCopyField}
                              />
                            </div>
                          </div>
                          {client.personType === 'PJ' ? (
                            <div className="sdv-info-item is-full">
                              <span
                                className={`sdv-info-label${isMissing('tradeName') ? ' is-missing' : ''}`}
                              >
                                Nome fantasia
                              </span>
                              <div className="sdv-info-value-row">
                                <span className="sdv-info-value">
                                  {client.tradeName || '\u2014'}
                                </span>
                                <InfoCopyButton
                                  value={client.tradeName}
                                  label="Nome fantasia"
                                  onCopy={handleCopyField}
                                />
                              </div>
                            </div>
                          ) : null}
                          <div className="sdv-info-item is-full">
                            <span
                              className={`sdv-info-label${client.personType === 'PF' && isMissing('cpf') ? ' is-missing' : ''}`}
                            >
                              {client.personType === 'PF' ? 'CPF' : 'CNPJ'}
                            </span>
                            <div className="sdv-info-value-row">
                              <span className="sdv-info-value">
                                {client.personType === 'PF'
                                  ? formatClientDocument(client.cpf, 'PF') || '\u2014'
                                  : formatClientDocument(client.cnpj, 'PJ') || '\u2014'}
                              </span>
                              <InfoCopyButton
                                value={
                                  client.personType === 'PF'
                                    ? formatClientDocument(client.cpf, 'PF')
                                    : formatClientDocument(client.cnpj, 'PJ')
                                }
                                label={client.personType === 'PF' ? 'CPF' : 'CNPJ'}
                                onCopy={handleCopyField}
                              />
                            </div>
                          </div>
                          {/* Telefone, e-mail e papeis sairam do DL \u2014 moram no
                            HERO fixo (rodada 3). */}
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}

                {/* Endereco fiscal (PJ) — segue na aba Documentos, junto dos
                    dados cadastrais (a IE mora aqui). Sem o wrapper
                    .sdv-client-side-col: os cards sao filhos diretos do inner
                    (os grids antigos que dependiam do :has() morrem sozinhos). */}
                {activeDetailTab === 'docs' && isPj ? (
                  <div className="sdv-card sdv-info-compact sdv-card-address">
                    {/* Rodada 2: lapis proprio saiu — Editar do header cobre
                          o endereco fiscal no mesmo form. */}
                    <div className="sdv-card-header">
                      <span className="sdv-card-title">Endereço fiscal</span>
                    </div>
                    <div className="sdv-info-grid">
                      <div className="sdv-info-item">
                        <span
                          className={`sdv-info-label${isMissing('postalCode') ? ' is-missing' : ''}`}
                        >
                          CEP
                        </span>
                        <span className="sdv-info-value">
                          {formatPostalCode(client.postalCode) || '—'}
                        </span>
                      </div>
                      <div className="sdv-info-item">
                        <span
                          className={`sdv-info-label${isMissing('addressLine') ? ' is-missing' : ''}`}
                        >
                          Endereço
                        </span>
                        <span className="sdv-info-value">{client.addressLine || '—'}</span>
                      </div>
                      <div className="sdv-info-item">
                        <span
                          className={`sdv-info-label${isMissing('district') ? ' is-missing' : ''}`}
                        >
                          Bairro
                        </span>
                        <span className="sdv-info-value">{client.district || '—'}</span>
                      </div>
                      <div className="sdv-info-item">
                        <span className="sdv-info-label">Complemento</span>
                        <span className="sdv-info-value">{client.complement || '—'}</span>
                      </div>
                      <div className="sdv-info-item">
                        <span
                          className={`sdv-info-label${isMissing('city') || isMissing('state') ? ' is-missing' : ''}`}
                        >
                          Cidade/UF
                        </span>
                        <span className="sdv-info-value">
                          {client.city && client.state ? `${client.city}/${client.state}` : '—'}
                        </span>
                      </div>
                      <div className="sdv-info-item">
                        <span
                          className={`sdv-info-label${isMissing('registrationNumber') ? ' is-missing' : ''}`}
                        >
                          Inscrição estadual
                        </span>
                        <span className="sdv-info-value">{client.registrationNumber || '—'}</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* ── ABA FILIAIS (so PF; PJ fica com 2 abas) ── */}
                {activeDetailTab === 'units' && !isPj ? (
                  <div className="sdv-card sdv-info-compact sdv-card-filiais">
                    <div className="sdv-card-header">
                      <span className="sdv-card-title">{unitPlural}</span>
                      {canAddUnit ? (
                        <button type="button" className="fv-cd-add-btn" onClick={openUnitCreate}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 5v14" />
                            <path d="M5 12h14" />
                          </svg>
                          <span>Adicionar filial</span>
                        </button>
                      ) : null}
                    </div>
                    {units.length === 0 ? (
                      <div className="spv2-empty client-detail-empty-compact">
                        <p className="spv2-empty-text">Nenhuma filial cadastrada</p>
                      </div>
                    ) : (
                      <div className="sdv-unit-list">
                        {visibleUnits.map((unit) => {
                          const cityLabel =
                            unit.city && unit.state
                              ? `${unit.city}/${unit.state}`
                              : 'Cidade não informada';
                          const unitDisplayName =
                            unit.name ?? unit.legalName ?? `Filial ${unit.code}`;
                          // 14.7.M.2: detecta se a unit tem algum campo
                          // recomendado missing — alimenta a barra lateral
                          // amber do card (.is-incomplete).
                          const unitIncomplete = Array.from(missingSet).some((key) =>
                            key.startsWith(`units[${unit.id}].`)
                          );
                          return (
                            <button
                              key={unit.id}
                              type="button"
                              className={`sdv-unit-card-mini${unit.status === 'INACTIVE' ? ' is-inactive' : ''}${unitIncomplete && unit.status !== 'INACTIVE' ? ' is-incomplete' : ''}`}
                              onClick={() => openUnitDetailModal(unit)}
                            >
                              {/* Rodada 2: sai o triangulo pulsante — ponto
                                    ambar estatico (a barra lateral ambar do
                                    is-incomplete segue como reforco). */}
                              {unitIncomplete && unit.status !== 'INACTIVE' ? (
                                <span
                                  className="fv-cd-dot"
                                  role="img"
                                  aria-label="Filial com pendências"
                                />
                              ) : null}
                              <div className="sdv-unit-card-mini-content">
                                <span className="sdv-unit-card-mini-name">
                                  {unitDisplayName}
                                  {unit.status === 'INACTIVE' ? (
                                    <span className="sdv-unit-card-mini-inactive">Inativa</span>
                                  ) : null}
                                </span>
                                <span className="sdv-unit-card-mini-city">{cityLabel}</span>
                              </div>
                              <svg
                                className="sdv-unit-card-mini-arrow"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path d="m9 6 6 6-6 6" />
                              </svg>
                            </button>
                          );
                        })}

                        {inactiveUnitsCount > 0 ? (
                          <button
                            type="button"
                            className="sdv-edit-btn-small"
                            onClick={() => setShowInactiveUnits((v) => !v)}
                          >
                            {showInactiveUnits
                              ? 'Esconder inativas'
                              : `Mostrar ${inactiveUnitsCount} inativa(s)`}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Contas bancárias + Anexos — aba Documentos (PF e PJ). */}
                {activeDetailTab === 'docs' ? (
                  <>
                    <div className="sdv-card sdv-info-compact sdv-card-bank-accounts">
                      <div className="sdv-card-header">
                        <span className="sdv-card-title">Contas bancárias</span>
                        <button
                          type="button"
                          className="fv-cd-add-btn"
                          onClick={openBankAccountCreate}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 5v14" />
                            <path d="M5 12h14" />
                          </svg>
                          <span>Adicionar conta</span>
                        </button>
                      </div>
                      {bankAccountsBody}
                    </div>

                    {/* Anexos (Fechamento Fase 0 — D27) — PF e PJ */}
                    <div className="sdv-card sdv-info-compact sdv-card-attachments">
                      <div className="sdv-card-header">
                        <span className="sdv-card-title">Anexos</span>
                        <button
                          type="button"
                          className="fv-cd-add-btn"
                          onClick={() => attachmentInputRef.current?.click()}
                          disabled={uploadingAttachment}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 5v14" />
                            <path d="M5 12h14" />
                          </svg>
                          <span>{uploadingAttachment ? 'Enviando…' : 'Adicionar anexo'}</span>
                        </button>
                        <input
                          ref={attachmentInputRef}
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          style={{ display: 'none' }}
                          onChange={handleAttachmentSelected}
                        />
                      </div>
                      {attachmentsBody}
                    </div>
                  </>
                ) : null}

                {/* Rodada 3: o rodape Inativar/Reativar morreu — a acao mora
                    no menu ⋯ do hero. */}
              </div>
            </section>
          </>
        ) : null}

        {!loadingPage && !client ? <NoticeSlot notice={pageNotice} /> : null}
      </section>

      {/* ========== EDITOR (rodada 2 FV; rodada 5 = painel LATERAL) ========== */}
      {/* Form UNICO (informacoes + endereco fiscal PJ + motivo, um Salvar so)
          num side-sheet stacked que desliza por cima do drawer — mesmo molde
          dos paineis de filial/conta. A seta ← da borda cancela (o Cancelar
          textual morreu); Salvar mora no footer sticky. */}
      <BottomSheet
        open={editClientOpen}
        onClose={closeEditClient}
        onDismissAttempt={() => !savingClient && !editClientSuccess}
        title="Editar cadastro"
        ariaLabel="Editar cadastro"
        stacked
        closeVariant="edge-back"
        dragDisabled={savingClient || editClientSuccess}
        className="client-panel-sheet fv-cd-editor-sheet side-sheet"
        footer={
          editClientSuccess ? null : (
            <button
              type="submit"
              form="client-detail-edit-form"
              className="app-modal-submit"
              disabled={savingClient || !canSaveClient}
            >
              {savingClient ? 'Salvando...' : 'Salvar'}
            </button>
          )
        }
      >
        <div className="fv-cd-editor" role="region" aria-label="Editar cadastro">
          <span className="fv-cd-editor-sub">
            {isPj
              ? 'Informações, papéis e endereço fiscal — salvar aplica tudo de uma vez.'
              : 'Informações e papéis — salvar aplica tudo de uma vez.'}
          </span>

          <form
            id="client-detail-edit-form"
            className="app-modal-content client-detail-modal-form"
            onSubmit={handleUpdateClient}
          >
            <>
              <span className="cqc-group-heading">Informações</span>
              <div className="sdv-edit-row">
                <label className="app-modal-field">
                  <span className="app-modal-label">Tipo de pessoa</span>
                  {/* Backend bloqueia troca de personType (422 CLIENT_PERSON_TYPE_LOCKED).
                            Mostramos readonly pra evitar UX confusa. */}
                  <input
                    className="app-modal-input"
                    value={editClientForm.personType === 'PF' ? 'Pessoa fisica' : 'Pessoa juridica'}
                    disabled
                    readOnly
                  />
                </label>
                {editClientForm.personType === 'PF' ? (
                  <label className="app-modal-field">
                    <span className="app-modal-label">CPF</span>
                    <input
                      className={`app-modal-input${editCpfMask.error ? ' has-error' : ''}${pendingClass('cpf', editCpfMask.masked)}`}
                      value={editCpfMask.masked}
                      disabled={savingClient}
                      inputMode="numeric"
                      onChange={editCpfMask.onChange}
                      onBlur={editCpfMask.onBlur}
                    />
                    {editCpfMask.error ? (
                      <span className="cudm-edit-error">{editCpfMask.error}</span>
                    ) : null}
                  </label>
                ) : (
                  <label className="app-modal-field">
                    <span className="app-modal-label">CNPJ</span>
                    <input
                      className={`app-modal-input${editCnpjMask.error ? ' has-error' : ''}`}
                      value={editCnpjMask.masked}
                      disabled={savingClient}
                      inputMode="numeric"
                      onChange={editCnpjMask.onChange}
                      onBlur={editCnpjMask.onBlur}
                    />
                    {editCnpjMask.error ? (
                      <span className="cudm-edit-error">{editCnpjMask.error}</span>
                    ) : null}
                  </label>
                )}
              </div>

              {editClientForm.personType === 'PF' ? (
                <>
                  <label className="app-modal-field">
                    <span className="app-modal-label">Nome completo</span>
                    <input
                      className="app-modal-input"
                      value={editClientForm.fullName}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({
                          ...c,
                          fullName: e.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </label>
                  <label className="app-modal-field">
                    <span className="app-modal-label">Email</span>
                    <input
                      className="app-modal-input"
                      type="email"
                      value={editClientForm.email}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({
                          ...c,
                          email: e.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="sdv-edit-row">
                    <label className="app-modal-field">
                      <span className="app-modal-label">Razao social</span>
                      <input
                        className="app-modal-input"
                        value={editClientForm.legalName}
                        disabled={savingClient}
                        onChange={(e) =>
                          setEditClientForm((c) => ({
                            ...c,
                            legalName: e.target.value.toUpperCase(),
                          }))
                        }
                      />
                    </label>
                    <label className="app-modal-field">
                      <span className="app-modal-label">Nome fantasia</span>
                      <input
                        className={`app-modal-input${pendingClass('tradeName', editClientForm.tradeName)}`}
                        value={editClientForm.tradeName}
                        disabled={savingClient}
                        onChange={(e) =>
                          setEditClientForm((c) => ({
                            ...c,
                            tradeName: e.target.value.toUpperCase(),
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label className="app-modal-field">
                    <span className="app-modal-label">Email</span>
                    <input
                      className="app-modal-input"
                      type="email"
                      value={editClientForm.email}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({
                          ...c,
                          email: e.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </label>
                </>
              )}

              <div className="sdv-edit-row">
                <label className="app-modal-field">
                  <span className="app-modal-label">Telefone</span>
                  <input
                    className="app-modal-input"
                    value={editClientForm.phone}
                    disabled={savingClient}
                    onChange={(e) =>
                      setEditClientForm((c) => ({
                        ...c,
                        phone: maskPhoneInput(e.target.value),
                      }))
                    }
                  />
                </label>
                <ChipMultiSelectField
                  label="Papel"
                  placeholder="Selecione"
                  forceDropDown
                  options={CLIENT_ROLE_OPTIONS}
                  selected={editClientRoleIds}
                  disabled={savingClient}
                  onChange={(next) =>
                    setEditClientForm((c) => ({
                      ...c,
                      isSeller: next.includes('seller'),
                      isBuyer: next.includes('buyer'),
                      isWarehouse: next.includes('warehouse'),
                    }))
                  }
                />
              </div>

              <UserMultiSelect
                label="Responsavel"
                value={editClientForm.commercialUserIds}
                onChange={(next) => setEditClientForm((c) => ({ ...c, commercialUserIds: next }))}
                users={users}
                loading={loadingUsers}
                disabled={savingClient}
                hideRoleInChips
                firstNameOnly
                placeholder="Selecione (opcional)"
              />
            </>

            {isPj ? (
              <>
                <span className="cqc-group-heading">Endereço fiscal</span>
                {/* CEP primeiro: dispara auto-lookup que preenche endereco/
                        bairro/cidade/UF. Endereco em coluna larga ao lado. */}
                <div className="sdv-edit-row" style={{ gridTemplateColumns: '1fr 2fr' }}>
                  <label className="app-modal-field">
                    <span className="app-modal-label">
                      CEP
                      {editCep.loading ? <span aria-hidden="true"> ⌛</span> : null}
                    </span>
                    <input
                      className={`app-modal-input${pendingClass('postalCode', editClientForm.postalCode)}`}
                      value={editClientForm.postalCode}
                      disabled={savingClient}
                      inputMode="numeric"
                      onChange={(e) =>
                        setEditClientForm((c) => ({
                          ...c,
                          postalCode: maskPostalCodeInput(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="app-modal-field">
                    <span className="app-modal-label">Endereço</span>
                    <input
                      className={`app-modal-input${pendingClass('addressLine', editClientForm.addressLine)}`}
                      value={editClientForm.addressLine}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({
                          ...c,
                          addressLine: e.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="sdv-edit-row">
                  <label className="app-modal-field">
                    <span className="app-modal-label">Bairro</span>
                    <input
                      className={`app-modal-input${pendingClass('district', editClientForm.district)}`}
                      value={editClientForm.district}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({
                          ...c,
                          district: e.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </label>
                  <label className="app-modal-field">
                    <span className="app-modal-label">Complemento</span>
                    <input
                      className="app-modal-input"
                      value={editClientForm.complement}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({
                          ...c,
                          complement: e.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="sdv-edit-row" style={{ gridTemplateColumns: '2fr 0.6fr' }}>
                  <label className="app-modal-field">
                    <span className="app-modal-label">Cidade</span>
                    <input
                      className={`app-modal-input${pendingClass('city', editClientForm.city)}`}
                      value={editClientForm.city}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({
                          ...c,
                          city: e.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </label>
                  <label className="app-modal-field">
                    <span className="app-modal-label">UF</span>
                    <input
                      className={`app-modal-input${pendingClass('state', editClientForm.state)}`}
                      value={editClientForm.state}
                      disabled={savingClient}
                      maxLength={2}
                      onChange={(e) =>
                        setEditClientForm((c) => ({
                          ...c,
                          state: e.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </label>
                </div>

                <label className="app-modal-field">
                  <span className="app-modal-label">Inscrição estadual</span>
                  <input
                    className={`app-modal-input${pendingClass('registrationNumber', editClientForm.registrationNumber)}`}
                    value={editClientForm.registrationNumber}
                    disabled={savingClient}
                    inputMode="numeric"
                    onChange={(e) =>
                      setEditClientForm((c) => ({
                        ...c,
                        registrationNumber: maskRegistrationNumberInput(e.target.value),
                      }))
                    }
                  />
                </label>
              </>
            ) : null}

            <label className="app-modal-field">
              <span className="app-modal-label">Motivo da edicao (opcional)</span>
              <input
                className="app-modal-input"
                value={editClientForm.reasonText}
                disabled={savingClient}
                onChange={(e) =>
                  setEditClientForm((c) => ({
                    ...c,
                    reasonText: e.target.value.toUpperCase(),
                  }))
                }
                placeholder="Opcional"
              />
            </label>

            <NoticeSlot notice={editClientModalNotice} />
          </form>
        </div>

        {/* Check canonico (rodada 6): overlay sobre o painel do editor. */}
        <SuccessCheckOverlay show={editClientSuccess} />
      </BottomSheet>

      {/* ========== MODAL 2: Create Unit (PF only — filiais L5) ========== */}
      <ClientUnitModal
        open={unitModalOpen}
        saving={savingUnit}
        success={unitCreateSuccess}
        errorMessage={unitModalNotice?.kind === 'error' ? unitModalNotice.text : null}
        onClose={closeUnitModal}
        onSubmit={handleUnitSubmit}
      />

      {/* 14.7.I: MODAL 2.B Unit Detail (view + edit inline) */}
      <ClientUnitDetailModal
        open={unitDetailOpen}
        unit={unitDetailUnit}
        saving={savingUnit}
        savingStatus={savingUnitStatus}
        success={unitDetailSuccess}
        errorMessage={unitDetailNotice}
        missingSet={missingSet}
        dismissLocked={unitStatusModalOpen}
        onClose={closeUnitDetailModal}
        onSave={handleUnitDetailSave}
        onInactivate={handleUnitDetailInactivate}
        onReactivate={handleUnitDetailReactivate}
      />

      {/* ========== Fechamento Fase 0: Contas bancárias ========== */}
      <ClientBankAccountModal
        open={bankAccountModalOpen}
        saving={savingBankAccount}
        success={bankAccountCreateSuccess}
        errorMessage={bankAccountModalNotice?.kind === 'error' ? bankAccountModalNotice.text : null}
        defaultHolderName={client?.displayName ?? null}
        defaultHolderTaxId={client?.document ?? null}
        onClose={closeBankAccountModal}
        onSubmit={handleBankAccountSubmit}
      />

      <ClientBankAccountDetailModal
        open={bankAccountDetailOpen}
        account={bankAccountDetailAccount}
        saving={savingBankAccount}
        savingStatus={savingBankAccountStatus}
        success={bankAccountDetailSuccess}
        errorMessage={bankAccountDetailNotice}
        onClose={closeBankAccountDetail}
        onSave={handleBankAccountDetailSave}
        onInactivate={() => handleBankAccountStatusChange('INACTIVE')}
        onReactivate={() => handleBankAccountStatusChange('ACTIVE')}
      />

      {/* ========== Fechamento Fase 0: Preview de anexo ========== */}
      <ClientAttachmentPreviewModal
        open={attachmentPreviewOpen}
        attachment={attachmentPreview}
        downloadUrl={
          attachmentPreview ? clientAttachmentDownloadUrl(clientId, attachmentPreview.id) : null
        }
        units={activeUnitsList}
        deleting={deletingAttachment}
        linking={linkingAttachment}
        success={attachmentPreviewSuccess}
        errorMessage={attachmentPreviewNotice}
        onClose={closeAttachmentPreview}
        onDelete={handleAttachmentDelete}
        onLink={handleAttachmentLink}
      />

      {/* ========== MODAL 2.5: Cascade Inactivate (#6/Q-05) ========== */}
      <ClientInactivateWithCascadeModal
        open={cascadeOpen}
        clientName={client?.displayName ?? 'Cliente'}
        activeSamples={cascadeSamples}
        saving={cascadeSaving}
        errorMessage={cascadeError}
        initialReason={statusReasonText}
        onCancel={() => {
          if (!cascadeSaving) setCascadeOpen(false);
        }}
        onConfirm={handleCascadeConfirm}
      />

      {/* ========== MODAL 3: Inactivate/Reactivate Client ========== */}
      {/* Rodada 5: aviso central DENTRO da area do painel (fv-panel-scrim). */}
      {statusModalOpen
        ? createPortal(
            <div className="app-modal-backdrop fv-panel-scrim">
              <section
                ref={statusTrapRef}
                className="app-modal is-themed is-action"
                role="dialog"
                aria-modal="true"
                aria-labelledby="status-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="status-modal-title" className="app-modal-title">
                      {statusAction === 'inactivate' ? 'Inativar cliente' : 'Reativar cliente'}
                    </h3>
                    <p className="app-modal-description">
                      {statusAction === 'inactivate'
                        ? 'Bloqueia este cliente em novas amostras e movimentacoes.'
                        : 'Libera este cliente para novas operacoes.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="app-modal-close"
                    onClick={closeStatusModal}
                    disabled={savingStatus}
                    aria-label="Fechar"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </header>

                <form className="app-modal-content" onSubmit={handleStatusSubmit}>
                  {statusAction === 'inactivate' && statusImpactLoading ? (
                    <p className="client-detail-status-msg">Verificando impacto...</p>
                  ) : null}

                  {statusAction === 'inactivate' &&
                  statusImpact &&
                  !statusImpactLoading &&
                  (statusImpact.ownedSamples > 0 ||
                    statusImpact.activeMovements > 0 ||
                    statusImpact.activeUnits > 0) ? (
                    <div className="client-detail-impact-warning">
                      <p className="client-detail-impact-title">
                        Este cliente possui vinculos ativos:
                      </p>
                      <ul>
                        {statusImpact.ownedSamples > 0 ? (
                          <li>{statusImpact.ownedSamples} amostra(s) como proprietario</li>
                        ) : null}
                        {statusImpact.activeMovements > 0 ? (
                          <li>{statusImpact.activeMovements} movimentacao(oes) comercial(is)</li>
                        ) : null}
                        {statusImpact.activeUnits > 0 ? (
                          <li>{statusImpact.activeUnits} filial(is) ativa(s)</li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}

                  <label className="app-modal-field">
                    <span className="app-modal-label">Motivo</span>
                    <input
                      className="app-modal-input"
                      value={statusReasonText}
                      disabled={savingStatus}
                      onChange={(e) => setStatusReasonText(e.target.value.toUpperCase())}
                      placeholder="Informe o motivo"
                    />
                  </label>

                  <NoticeSlot notice={statusModalNotice} />

                  <div className="app-modal-actions client-detail-status-actions">
                    <button
                      type="button"
                      className="app-modal-secondary"
                      onClick={closeStatusModal}
                      disabled={savingStatus}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="app-modal-submit"
                      disabled={
                        savingStatus || statusImpactLoading || statusReasonText.trim().length === 0
                      }
                    >
                      {savingStatus
                        ? 'Processando...'
                        : statusAction === 'inactivate'
                          ? 'Inativar'
                          : 'Reativar'}
                    </button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )
        : null}

      {/* ========== MODAL 4: Inactivate/Reactivate Unit (L5 — PF) ========== */}
      {/* Rodada 5: central dentro da area do painel, ACIMA do painel da
          filial (tier +20 do fv-panel-scrim). */}
      {unitStatusModalOpen
        ? createPortal(
            <div className="app-modal-backdrop fv-panel-scrim">
              <section
                ref={unitStatusTrapRef}
                className="app-modal is-themed is-action"
                role="dialog"
                aria-modal="true"
                aria-labelledby="unit-status-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="app-modal-header">
                  <div className="app-modal-title-wrap">
                    <h3 id="unit-status-modal-title" className="app-modal-title">
                      {unitStatusAction === 'inactivate' ? 'Inativar filial' : 'Reativar filial'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="app-modal-close"
                    onClick={closeUnitStatusModal}
                    disabled={savingUnitStatus}
                    aria-label="Fechar"
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </header>

                <form className="app-modal-content" onSubmit={handleUnitStatusSubmit}>
                  <label className="app-modal-field">
                    <span className="app-modal-label">Motivo</span>
                    <input
                      className="app-modal-input"
                      value={unitStatusReason}
                      disabled={savingUnitStatus}
                      onChange={(e) => setUnitStatusReason(e.target.value.toUpperCase())}
                      placeholder="Informe o motivo"
                    />
                  </label>

                  <NoticeSlot notice={unitStatusNotice} />

                  <div className="app-modal-actions client-detail-status-actions">
                    <button
                      type="button"
                      className="app-modal-secondary"
                      onClick={closeUnitStatusModal}
                      disabled={savingUnitStatus}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="app-modal-submit"
                      disabled={savingUnitStatus || unitStatusReason.trim().length === 0}
                    >
                      {savingUnitStatus
                        ? 'Processando...'
                        : unitStatusAction === 'inactivate'
                          ? 'Inativar'
                          : 'Reativar'}
                    </button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
