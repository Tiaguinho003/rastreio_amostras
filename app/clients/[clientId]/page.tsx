'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../../components/AppShell';
import { HeaderAvatarMenu } from '../../../components/HeaderAvatarMenu';
import { IncompleteIcon } from '../../../components/clients/IncompleteIcon';
import {
  ClientInactivateWithCascadeModal,
  type CascadeSample,
} from '../../../components/clients/ClientInactivateWithCascadeModal';
import { ClientUnitModal } from '../../../components/clients/ClientUnitModal';
import { ClientUnitDetailModal } from '../../../components/clients/ClientUnitDetailModal';
import { BlendBadge } from '../../../components/samples/BlendBadge';
import {
  ApiError,
  getClient,
  getClientCommercialSummary,
  getClientImpact,
  listClientPurchases,
  listClientSamples,
  updateClient,
  inactivateClient,
  inactivateClientWithCascade,
  reactivateClient,
  createClientUnit,
  updateClientUnit,
  inactivateClientUnit,
  reactivateClientUnit,
  lookupUsersForReference,
} from '../../../lib/api-client';
import {
  formatClientDocument,
  formatPhone,
  formatPostalCode,
  maskCpfInput,
  maskCnpjInput,
  maskPhoneInput,
  maskPostalCodeInput,
  maskRegistrationNumberInput,
} from '../../../lib/client-field-formatters';
import { isClientComplete } from '../../../lib/clients/client-completeness';
import { useCepLookup } from '../../../lib/clients/use-cep-lookup';
import { useDocumentMask } from '../../../lib/use-document-mask';
import { useGlobalLoading } from '../../../lib/loading/loading-context';
import { useToast } from '../../../lib/toast/ToastProvider';
import { useFocusTrap } from '../../../lib/use-focus-trap';
import { useRequireAuth } from '../../../lib/use-auth';
import { isCommercialRole, NON_PROSPECTOR_ROLES } from '../../../lib/roles';
import { UserMultiSelect } from '../../../components/users/UserMultiSelect';
import { ChipMultiSelectField, type ChipOption } from '../../../components/ChipMultiSelectField';
import type {
  ClientPurchaseListItem,
  ClientSampleListItem,
  ClientUnitSummary,
  ClientSummary,
  UserLookupItem,
} from '../../../lib/types';

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

function getStatusLabel(status: string): string {
  return status === 'ACTIVE' ? 'Ativo' : 'Inativo';
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
  commercialUserIds: 'Responsavel comercial',
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
  if (code === 'COMMERCIAL_USER_REQUIRED_FOR_ACTIVE') {
    return 'Cliente ativo deve manter ao menos um responsavel comercial.';
  }
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

// Mapeia status comercial pra classe `is-card-*` (mesmo set da samples page).
function commercialStatusClass(
  status: string | null | undefined,
  sampleStatus: string | null | undefined
): string {
  if (sampleStatus === 'INVALIDATED') return 'is-card-invalid';
  if (status === 'SOLD') return 'is-card-sold';
  if (status === 'LOST') return 'is-card-lost';
  return 'is-card-open';
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export default function ClientDetailPage() {
  /* ---- auth & params ---- */
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: NON_PROSPECTOR_ROLES,
  });
  const params = useParams<{ clientId: string }>();
  const clientId = typeof params.clientId === 'string' ? params.clientId : '';

  /* ---- data ---- */
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [units, setUnits] = useState<ClientUnitSummary[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);
  // Loader da marca (logo + barra + bolinhas) se o cliente demorar a carregar —
  // substitui o "Carregando cliente..." verde.
  useGlobalLoading(loadingPage);

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

  /* ---- commercial summary (4 cards: open / sold / lost / bought) ---- */
  const [commercialSummary, setCommercialSummary] = useState<{
    openCount: number;
    soldCount: number;
    lostCount: number;
    boughtCount: number;
  } | null>(null);

  /* ---- commercial filter (qual card esta ativo) + lista paginada ---- */
  const [commercialFilter, setCommercialFilter] = useState<'open' | 'sold' | 'lost' | 'bought'>(
    'open'
  );
  const [commercialSamples, setCommercialSamples] = useState<ClientSampleListItem[]>([]);
  const [commercialPurchases, setCommercialPurchases] = useState<ClientPurchaseListItem[]>([]);
  const [commercialPage, setCommercialPage] = useState(1);
  const [commercialHasMore, setCommercialHasMore] = useState(false);
  const [commercialLoading, setCommercialLoading] = useState(false);
  // Incrementa quando uma operacao deve invalidar summary+lista (criar/editar
  // amostra, inativar unit, etc). Plugado nas deps dos useEffect de fetch.
  const [commercialRefreshKey, setCommercialRefreshKey] = useState(0);
  const invalidateCommercial = useCallback(() => setCommercialRefreshKey((k) => k + 1), []);

  /* ---- notices (6 zones) ---- */
  const [pageNotice, setPageNotice] = useState<Notice>(null);
  const [detailNotice, setDetailNotice] = useState<Notice>(null);
  const [unitNotice, setUnitNotice] = useState<Notice>(null);
  const [editClientModalNotice, setEditClientModalNotice] = useState<Notice>(null);
  const [unitModalNotice, setUnitModalNotice] = useState<Notice>(null);
  const [statusModalNotice, setStatusModalNotice] = useState<Notice>(null);
  const [unitStatusNotice, setUnitStatusNotice] = useState<Notice>(null);

  /* ---- edit client modal ---- */
  // 14.7.M.4: split por tab — botao pencil em "Informacoes" abre 'info',
  // pencil em "Endereco fiscal" (PJ) abre 'address'. Modal renderiza so
  // os campos do tab atual. Backend updateClient aceita payload partial,
  // entao so envia o que o tab edita.
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editClientTab, setEditClientTab] = useState<'info' | 'address'>('info');
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
  const editClientTrapRef = useFocusTrap(editClientOpen);
  // Checksum CPF/CNPJ inline (mesmo hook usado nos modais de Filial).
  // O personType nao pode ser trocado depois de criado, entao mantemos
  // 2 instancias e usamos a relevante baseado em editClientForm.personType.
  const editCpfMask = useDocumentMask('cpf');
  const editCnpjMask = useDocumentMask('cnpj');

  /* ---- unit modal (create-only) — usa ClientUnitModal pra "Nova filial".
         Edicao inline absorvida pelo ClientUnitDetailModal. ---- */
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);
  const [showInactiveUnits, setShowInactiveUnits] = useState(false);

  /* ---- 14.7.I: detail modal (view + edit inline) — abre ao clicar no
     card mini de filial. Substitui o uso do ClientUnitModal pra editar. */
  const [unitDetailUnit, setUnitDetailUnit] = useState<ClientUnitSummary | null>(null);
  const [unitDetailOpen, setUnitDetailOpen] = useState(false);
  const [unitDetailNotice, setUnitDetailNotice] = useState<string | null>(null);

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

  /* ---- refs ---- */
  const fetchAbortRef = useRef<AbortController | null>(null);
  // AbortController dedicado pra paginacao da lista comercial. Compartilhar
  // com o controller do useEffect causaria interferencia entre re-fetch
  // por filter change e load-more.
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  // Token gerado a cada filter switch — load-more so persiste a pagina
  // se o token bater (evita race onde response antiga sobrescreve filter
  // novo).
  const commercialFetchTokenRef = useRef(0);

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
        const response = await getClient(session, clientId, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setClient(response.client);
        setUnits(response.units);
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

  /* Lista comercial — refetch da pagina 1 toda vez que muda o filtro.
     "Comprado" usa endpoint separado (/purchases); os outros 3 usam
     /samples?status=. Cada switch incrementa um token; respostas com
     token defasado sao ignoradas (evita race com load-more pendente). */
  useEffect(() => {
    if (!session || !clientId) return;
    const controller = new AbortController();
    const token = ++commercialFetchTokenRef.current;
    // Cancela load-more pendente do filter anterior — evita que ele
    // contamine a lista nova com items antigos.
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = null;

    setCommercialLoading(true);
    setCommercialPage(1);
    // Limpa lista imediato pra evitar mix de filters durante a transicao
    // (state da lista antiga continua visivel ate response chegar — sem
    // limpar, vendido aparece "encima de" em-aberto por 1 frame).
    setCommercialSamples([]);
    setCommercialPurchases([]);

    const promise =
      commercialFilter === 'bought'
        ? listClientPurchases(
            session,
            clientId,
            { page: 1, limit: 20 },
            { signal: controller.signal }
          )
        : listClientSamples(
            session,
            clientId,
            { status: commercialFilter, page: 1, limit: 20 },
            { signal: controller.signal }
          );

    promise
      .then((response) => {
        // Token defasado = filter trocou enquanto request voava — descarta.
        if (token !== commercialFetchTokenRef.current) return;
        if ('items' in response && Array.isArray(response.items)) {
          if (commercialFilter === 'bought') {
            setCommercialPurchases(response.items as ClientPurchaseListItem[]);
          } else {
            setCommercialSamples(response.items as ClientSampleListItem[]);
          }
          setCommercialHasMore(response.page?.hasNext ?? false);
        }
      })
      .catch(() => {
        if (token !== commercialFetchTokenRef.current) return;
        setCommercialHasMore(false);
      })
      .finally(() => {
        if (token === commercialFetchTokenRef.current) setCommercialLoading(false);
      });

    return () => controller.abort();
  }, [session, clientId, commercialFilter, commercialRefreshKey]);

  async function loadMoreCommercial() {
    if (!session || !clientId || commercialLoading || !commercialHasMore) return;
    const nextPage = commercialPage + 1;
    const token = commercialFetchTokenRef.current;
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    setCommercialLoading(true);
    try {
      if (commercialFilter === 'bought') {
        const response = await listClientPurchases(
          session,
          clientId,
          { page: nextPage, limit: 20 },
          { signal: controller.signal }
        );
        if (token !== commercialFetchTokenRef.current) return;
        setCommercialPurchases((prev) => [...prev, ...response.items]);
        setCommercialHasMore(response.page?.hasNext ?? false);
      } else {
        const response = await listClientSamples(
          session,
          clientId,
          { status: commercialFilter, page: nextPage, limit: 20 },
          { signal: controller.signal }
        );
        if (token !== commercialFetchTokenRef.current) return;
        setCommercialSamples((prev) => [...prev, ...response.items]);
        setCommercialHasMore(response.page?.hasNext ?? false);
      }
      if (token === commercialFetchTokenRef.current) setCommercialPage(nextPage);
    } catch {
      // AbortError ou rede — ignora (controller pode ter sido abortado).
    } finally {
      if (token === commercialFetchTokenRef.current) setCommercialLoading(false);
    }
  }

  /* ================================================================ */
  /*  Validation                                                      */
  /* ================================================================ */

  const canSaveClient = useMemo(() => {
    // 14.7.M.4: address tab nao mostra nome/telefone/doc, entao pula
    // validacao desses campos. O save vai mandar so os campos de endereco.
    if (editClientTab === 'address') return true;

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
  }, [editClientForm, editClientTab, editCpfMask.isValid, editCnpjMask.isValid]);

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

  // Se cliente perde isBuyer (via edit), resetar filter 'bought' pra 'open'
  // pra evitar lista orfa.
  useEffect(() => {
    if (client && !client.isBuyer && commercialFilter === 'bought') {
      setCommercialFilter('open');
    }
  }, [client, commercialFilter]);

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

  /* ================================================================ */
  /*  Edit client handlers                                            */
  /* ================================================================ */

  function openEditClient(tab: 'info' | 'address') {
    if (!client) return;
    setEditClientTab(tab);
    setEditClientForm(clientSummaryToForm(client));
    editCpfMask.setRaw(client.cpf ?? '');
    editCnpjMask.setRaw(client.cnpj ?? '');
    setEditClientModalNotice(null);
    setEditClientOpen(true);

    // address tab nao precisa do dropdown de usuarios.
    if (tab !== 'info' || !session) return;
    setLoadingUsers(true);
    lookupUsersForReference(session, { limit: 200 })
      .then((response) =>
        // So papeis comerciais (COMMERCIAL + PROSPECTOR) podem ser responsaveis.
        setUsers(response.items.filter((u) => isCommercialRole(u.role)))
      )
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
      // 14.7.M.4: split por tab. Backend updateClient (server/services/
      // client-support.js linhas 593-638) usa Object.hasOwn pra detectar
      // campos a atualizar — entao so mandamos o que o tab atual edita.
      // personType nao e enviado: backend bloqueia troca (422
      // CLIENT_PERSON_TYPE_LOCKED). UI mostra readonly.
      const data: Parameters<typeof updateClient>[2] = {
        reasonText: editClientForm.reasonText,
      };

      if (editClientTab === 'info') {
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
      } else {
        // address tab — PJ only (card so aparece pra PJ). Atualiza so
        // os campos do endereco fiscal + IE.
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
    setUnitDetailOpen(true);
  }

  function closeUnitDetailModal() {
    if (savingUnit) return;
    setUnitDetailOpen(false);
  }

  async function handleUnitDetailSave(
    data: import('../../../lib/types').ClientUnitInput,
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
      setUnitNotice({ kind: 'success', text: 'Filial atualizada com sucesso.' });
      void fetchData();
      invalidateCommercial();
      setUnitDetailOpen(false);
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

  async function handleUnitSubmit(data: import('../../../lib/types').ClientUnitInput) {
    if (!session || !clientId) return;
    setSavingUnit(true);
    setUnitModalNotice(null);

    try {
      await createClientUnit(session, clientId, data);
      setUnitNotice({ kind: 'success', text: 'Filial criada com sucesso.' });
      void fetchData();
      invalidateCommercial();
      setUnitModalOpen(false);
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

  async function handleStatusSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !clientId || statusReasonText.trim().length === 0) return;
    setSavingStatus(true);
    setStatusModalNotice(null);

    try {
      if (statusAction === 'inactivate') {
        await inactivateClient(session, clientId, statusReasonText);
        setDetailNotice({ kind: 'success', text: 'Cliente inativado com sucesso.' });
      } else {
        await reactivateClient(session, clientId, statusReasonText);
        setDetailNotice({ kind: 'success', text: 'Cliente reativado com sucesso.' });
      }

      setStatusModalOpen(false);
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
      const result = await inactivateClientWithCascade(session, clientId, {
        confirmedSampleIds,
        reasonText,
      });
      setDetailNotice({
        kind: 'success',
        text: `Cliente inativado. ${result.cascade.cascadedSampleCount} amostra${result.cascade.cascadedSampleCount === 1 ? '' : 's'} invalidada${result.cascade.cascadedSampleCount === 1 ? '' : 's'} em cascata.`,
      });
      setCascadeOpen(false);
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
        setUnitNotice({ kind: 'success', text: 'Filial inativada com sucesso.' });
      } else {
        await reactivateClientUnit(session, clientId, unitStatusUnitId, unitStatusReason);
        setUnitNotice({ kind: 'success', text: 'Filial reativada com sucesso.' });
      }

      setUnitStatusModalOpen(false);
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
  /*  Guard: loading / unauthenticated                                */
  /* ================================================================ */

  if (loading || !session) return null;

  // Evita o "shell vazio" no 1o load (topo + corpo antes do conteudo chegar):
  // enquanto o cliente nao carregou, fica em branco em vez de renderizar o
  // AppShell/.sdv-page sem conteudo (o loader global da marca cobre a tela). So
  // no 1o load (client ainda null) — refetch mantem o client e nao pisca.
  if (loadingPage && !client) return null;

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  const sessionFullName = session.user.fullName ?? session.user.username;
  const sessionInitials = sessionFullName
    .split(' ')
    .map((w: string) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="sdv-page">
        {!loadingPage && client ? (
          <>
            {/* Header verde */}
            <header className="sdv-header">
              <div className="sdv-header-top">
                <Link href="/clients" className="nsv2-back" aria-label="Voltar">
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </Link>
                <span className="sdv-header-title" aria-hidden="true" />
                <HeaderAvatarMenu session={session} onLogout={logout} />
                <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
                  <span className="nsv2-avatar-initials">{sessionInitials}</span>
                </Link>
              </div>

              <div className="sdv-identity-card">
                <div className="sdv-identity-left">
                  <div className="sdv-identity-code-row">
                    <span className="sdv-identity-code">{client.displayName ?? 'Cliente'}</span>
                    <span
                      className={`sdv-identity-badge ${client.status === 'ACTIVE' ? 'is-active' : 'is-inactive'}`}
                    >
                      {getStatusLabel(client.status)}
                    </span>
                  </div>
                  <span className="sdv-identity-owner">
                    Cod. {client.code} · {client.personType}
                  </span>
                </div>
                <div className="sdv-identity-actions">
                  <button
                    type="button"
                    className={`sdv-identity-btn ${client.status === 'ACTIVE' ? 'is-danger' : ''}`}
                    onClick={() =>
                      openStatusModal(client.status === 'ACTIVE' ? 'inactivate' : 'reactivate')
                    }
                    aria-label={client.status === 'ACTIVE' ? 'Inativar' : 'Reativar'}
                  >
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      {client.status === 'ACTIVE' ? (
                        <>
                          {/* 14.7.E: icone de lixeira (inativar). */}
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </>
                      ) : (
                        <>
                          <circle cx="12" cy="12" r="8" />
                          <path d="m9 12 2 2 4-4" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>
            </header>

            <NoticeSlot notice={pageNotice} />

            <section className="sdv-content">
              <div className="sdv-content-inner">
                <section className="sdv-general">
                  {/* Card de Informacoes — padrao branco dos containers (sem
                      header verde): titulo + hairline + editar minimalista, igual
                      ao container "Informacoes" do detalhe da amostra. Os papeis
                      saem do cabecalho e viram um campo no corpo (ver abaixo). */}
                  <div className="sdv-info-split-row">
                    <div id="sdv-informacoes" className="sdv-card sdv-info-compact sdv-card-info">
                      <div className="sdv-card-header">
                        <span className="sdv-card-title">Informações</span>
                        <button
                          type="button"
                          className="sdv-edit-btn"
                          onClick={() => openEditClient('info')}
                          aria-label="Editar informações"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                          </svg>
                          <span>Editar</span>
                        </button>
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
                              label={client.personType === 'PF' ? 'Nome completo' : 'Razao social'}
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
                              <span className="sdv-info-value">{client.tradeName || '\u2014'}</span>
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
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Email</span>
                          <div className="sdv-info-value-row">
                            <span className="sdv-info-value">{client.email || '\u2014'}</span>
                            <InfoCopyButton
                              value={client.email}
                              label="Email"
                              onCopy={handleCopyField}
                            />
                          </div>
                        </div>
                        <div className="sdv-info-item">
                          <span className="sdv-info-label">Telefone</span>
                          <div className="sdv-info-value-row">
                            <span className="sdv-info-value">
                              {formatPhone(client.phone) || '\u2014'}
                            </span>
                            <InfoCopyButton
                              value={formatPhone(client.phone)}
                              label="Telefone"
                              onCopy={handleCopyField}
                            />
                          </div>
                        </div>
                        <div className="sdv-info-item is-full">
                          <span className="sdv-info-label">
                            Responsavel
                            {client.commercialUsers.length > 0
                              ? ` (${client.commercialUsers.length})`
                              : ''}
                          </span>
                          <div className="sdv-commercial-users">
                            {client.commercialUsers.length === 0 ? (
                              <span className="sdv-info-value">{'\u2014'}</span>
                            ) : (
                              client.commercialUsers.map((u) => (
                                <span key={u.id} className="sdv-commercial-user-chip">
                                  {u.fullName}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="sdv-info-item is-full">
                          <span className="sdv-info-label">Papéis</span>
                          <div className="sdv-commercial-users">
                            {client.isSeller ? (
                              <span className="sdv-commercial-user-chip">Vendedor</span>
                            ) : null}
                            {client.isBuyer ? (
                              <span className="sdv-commercial-user-chip">Comprador</span>
                            ) : null}
                            {client.isWarehouse ? (
                              <span className="sdv-commercial-user-chip">Armazém</span>
                            ) : null}
                            {!client.isSeller && !client.isBuyer && !client.isWarehouse ? (
                              <span className="sdv-info-value">{'—'}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <NoticeSlot notice={detailNotice} />
                    </div>
                  </div>

                  {isPj ? (
                    /* 14.7.F PJ — card "Endereço fiscal" — header verde + editar inline */
                    <div className="sdv-card sdv-card-themed sdv-card-address">
                      <div className="sdv-card-themed-header">
                        <span className="sdv-card-themed-title">Endereço fiscal</span>
                        <button
                          type="button"
                          className="sdv-card-themed-edit"
                          onClick={() => openEditClient('address')}
                          aria-label="Editar endereço fiscal"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            {/* 14.7.M.1: lapis simetrico — mesmo path do
                                  Card Informacoes (consistencia visual). */}
                            <path d="M4 20h3l13-13-3-3L4 17z" />
                            <path d="M14 6l4 4" />
                          </svg>
                        </button>
                      </div>
                      <div className="sdv-card-themed-body">
                        <div className="sdv-info-grid">
                          <div className="sdv-info-item">
                            <span
                              className={`sdv-info-label${isMissing('postalCode') ? ' is-missing' : ''}`}
                            >
                              CEP
                              {isMissing('postalCode') ? (
                                <IncompleteIcon className="sdv-info-label-warning" />
                              ) : null}
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
                              {isMissing('addressLine') ? (
                                <IncompleteIcon className="sdv-info-label-warning" />
                              ) : null}
                            </span>
                            <span className="sdv-info-value">{client.addressLine || '—'}</span>
                          </div>
                          <div className="sdv-info-item">
                            <span
                              className={`sdv-info-label${isMissing('district') ? ' is-missing' : ''}`}
                            >
                              Bairro
                              {isMissing('district') ? (
                                <IncompleteIcon className="sdv-info-label-warning" />
                              ) : null}
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
                              {isMissing('city') || isMissing('state') ? (
                                <IncompleteIcon className="sdv-info-label-warning" />
                              ) : null}
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
                              {isMissing('registrationNumber') ? (
                                <IncompleteIcon className="sdv-info-label-warning" />
                              ) : null}
                            </span>
                            <span className="sdv-info-value">
                              {client.registrationNumber || '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Card "Filiais" (PF) — padrao branco dos containers (sem
                       header verde), igual ao de Informacoes: titulo + hairline +
                       botao "Nova" minimalista. Click no card abre o detalhe. */
                    <div className="sdv-card sdv-info-compact sdv-card-filiais">
                      <div className="sdv-card-header">
                        <span className="sdv-card-title">{unitPlural}</span>
                        {canAddUnit ? (
                          <button
                            type="button"
                            className="sdv-edit-btn"
                            onClick={openUnitCreate}
                            aria-label="Nova filial"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 5v14" />
                              <path d="M5 12h14" />
                            </svg>
                            <span>Nova</span>
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
                      <NoticeSlot notice={unitNotice} />
                    </div>
                  )}
                </section>

                <section className="sdv-commercial">
                  <div className="sdv-commercial-mini-stack">
                    <button
                      type="button"
                      onClick={() => setCommercialFilter('open')}
                      className={`sdv-card sdv-card-commercial-mini is-open${commercialFilter === 'open' ? ' is-active' : ''}`}
                    >
                      <span className="sdv-card-commercial-mini-title">Em aberto</span>
                      <strong className="sdv-card-commercial-mini-value">
                        {commercialSummary?.openCount ?? 0}
                      </strong>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommercialFilter('sold')}
                      className={`sdv-card sdv-card-commercial-mini is-sold${commercialFilter === 'sold' ? ' is-active' : ''}`}
                    >
                      <span className="sdv-card-commercial-mini-title">Vendido</span>
                      <strong className="sdv-card-commercial-mini-value">
                        {commercialSummary?.soldCount ?? 0}
                      </strong>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommercialFilter('lost')}
                      className={`sdv-card sdv-card-commercial-mini is-lost${commercialFilter === 'lost' ? ' is-active' : ''}`}
                    >
                      <span className="sdv-card-commercial-mini-title">Perdido</span>
                      <strong className="sdv-card-commercial-mini-value">
                        {commercialSummary?.lostCount ?? 0}
                      </strong>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommercialFilter('bought')}
                      disabled={!client?.isBuyer}
                      className={`sdv-card sdv-card-commercial-mini is-bought${client?.isBuyer ? '' : ' is-dim'}${commercialFilter === 'bought' ? ' is-active' : ''}`}
                    >
                      <span className="sdv-card-commercial-mini-title">Comprado</span>
                      <strong className="sdv-card-commercial-mini-value">
                        {commercialSummary?.boughtCount ?? 0}
                      </strong>
                    </button>
                  </div>
                  <div className="sdv-card-commercial">
                    {commercialLoading && commercialPage === 1 ? (
                      <div className="sdv-commercial-skeleton" aria-hidden="true">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className="sdv-commercial-skeleton-row"
                            style={{ animationDelay: `${i * 0.06}s` }}
                          />
                        ))}
                      </div>
                    ) : commercialFilter === 'bought' ? (
                      commercialPurchases.length === 0 ? (
                        <div className="sdv-commercial-empty">Sem amostras compradas.</div>
                      ) : (
                        <ul className="sdv-commercial-list" key="bought">
                          {commercialPurchases.map((p, idx) => (
                            <li
                              key={p.id}
                              className="sdv-commercial-list-item"
                              style={{ animationDelay: `${Math.min(idx, 10) * 0.025}s` }}
                            >
                              <Link
                                href={`/samples/${p.sampleId}`}
                                className={`sdv-commercial-list-row ${commercialStatusClass(p.commercialStatus, p.status)}`}
                              >
                                <span className="sdv-commercial-list-bar" aria-hidden="true" />
                                <span className="sdv-commercial-list-lot">
                                  {p.sampleLotNumber ?? '—'}
                                </span>
                                <span className="sdv-commercial-list-meta">
                                  {p.sellerName ?? '—'}
                                </span>
                                <span className="sdv-commercial-list-meta">
                                  {p.movementDate
                                    ? new Date(p.movementDate).toLocaleDateString('pt-BR')
                                    : '—'}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )
                    ) : commercialSamples.length === 0 ? (
                      <div className="sdv-commercial-empty">
                        Sem amostras{' '}
                        {commercialFilter === 'open'
                          ? 'em aberto'
                          : commercialFilter === 'sold'
                            ? 'vendidas'
                            : 'perdidas'}
                        .
                      </div>
                    ) : (
                      <ul className="sdv-commercial-list" key={commercialFilter}>
                        {commercialSamples.map((s, idx) => (
                          <li
                            key={s.id}
                            className="sdv-commercial-list-item"
                            style={{ animationDelay: `${Math.min(idx, 10) * 0.025}s` }}
                          >
                            <Link
                              href={`/samples/${s.id}`}
                              className={`sdv-commercial-list-row ${commercialStatusClass(s.commercialStatus, s.status)}`}
                            >
                              <span className="sdv-commercial-list-bar" aria-hidden="true" />
                              <span className="sdv-commercial-list-lot">
                                {s.internalLotNumber ?? '—'}
                                {s.isBlend ? <BlendBadge size="sm" /> : null}
                              </span>
                              <span className="sdv-commercial-list-meta">
                                {s.createdAt
                                  ? new Date(s.createdAt).toLocaleDateString('pt-BR')
                                  : '—'}
                              </span>
                              <span className="sdv-commercial-list-meta">
                                {s.declaredSacks} sacas
                              </span>
                              <span className="sdv-commercial-list-meta">
                                {s.declaredHarvest ?? '—'}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                    {commercialHasMore && !commercialLoading ? (
                      <button
                        type="button"
                        className="sdv-commercial-load-more"
                        onClick={() => void loadMoreCommercial()}
                      >
                        Carregar mais
                      </button>
                    ) : commercialHasMore && commercialPage > 1 && commercialLoading ? (
                      <button type="button" className="sdv-commercial-load-more" disabled>
                        Carregando...
                      </button>
                    ) : null}
                  </div>
                </section>
              </div>
            </section>
          </>
        ) : null}

        {!loadingPage && !client ? <NoticeSlot notice={pageNotice} /> : null}
      </section>

      {/* ========== MODAL 1: Edit Client ========== */}
      {editClientOpen ? (
        <div className="app-modal-backdrop">
          <section
            ref={editClientTrapRef}
            className="app-modal is-themed is-action client-detail-edit-modal client-detail-modal-scrollable"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-client-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="edit-client-title" className="app-modal-title">
                  {editClientTab === 'info' ? 'Editar informações' : 'Editar endereço fiscal'}
                </h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={closeEditClient}
                disabled={savingClient || editClientSuccess}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            {editClientSuccess ? (
              <div className="client-detail-success-check">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
            ) : (
              <form
                className="app-modal-content client-detail-modal-form"
                onSubmit={handleUpdateClient}
              >
                {editClientTab === 'info' ? (
                  <>
                    <div className="sdv-edit-row">
                      <label className="app-modal-field">
                        <span className="app-modal-label">Tipo de pessoa</span>
                        {/* Backend bloqueia troca de personType (422 CLIENT_PERSON_TYPE_LOCKED).
                            Mostramos readonly pra evitar UX confusa. */}
                        <input
                          className="app-modal-input"
                          value={
                            editClientForm.personType === 'PF' ? 'Pessoa fisica' : 'Pessoa juridica'
                          }
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
                      onChange={(next) =>
                        setEditClientForm((c) => ({ ...c, commercialUserIds: next }))
                      }
                      users={users}
                      loading={loadingUsers}
                      disabled={savingClient}
                      hideRoleInChips
                      firstNameOnly
                      placeholder={
                        editClientForm.commercialUserIds.length === 0 && client?.status === 'ACTIVE'
                          ? 'Obrigatorio'
                          : 'Selecione 1+ responsaveis comerciais'
                      }
                      errorMessage={
                        editClientForm.commercialUserIds.length === 0 && client?.status === 'ACTIVE'
                          ? 'required'
                          : undefined
                      }
                    />
                  </>
                ) : null}

                {editClientTab === 'address' ? (
                  <>
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

                <div className="app-modal-actions client-detail-edit-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={closeEditClient}
                    disabled={savingClient}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="app-modal-submit"
                    disabled={savingClient || !canSaveClient}
                  >
                    {savingClient ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}

      {/* ========== MODAL 2: Create Unit (PF only — filiais L5) ========== */}
      <ClientUnitModal
        open={unitModalOpen}
        saving={savingUnit}
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
        errorMessage={unitDetailNotice}
        missingSet={missingSet}
        onClose={closeUnitDetailModal}
        onSave={handleUnitDetailSave}
        onInactivate={handleUnitDetailInactivate}
        onReactivate={handleUnitDetailReactivate}
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
      {statusModalOpen ? (
        <div className="app-modal-backdrop">
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
                  <p className="client-detail-impact-title">Este cliente possui vinculos ativos:</p>
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
        </div>
      ) : null}

      {/* ========== MODAL 4: Inactivate/Reactivate Unit (L5 — PF) ========== */}
      {unitStatusModalOpen ? (
        <div className="app-modal-backdrop">
          <section
            ref={unitStatusTrapRef}
            className="app-modal is-themed"
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

              <div className="app-modal-actions">
                <button
                  type="submit"
                  className="app-modal-submit"
                  disabled={savingUnitStatus || unitStatusReason.trim().length === 0}
                >
                  {savingUnitStatus
                    ? 'Processando...'
                    : unitStatusAction === 'inactivate'
                      ? 'Confirmar inativação'
                      : 'Confirmar reativação'}
                </button>
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={closeUnitStatusModal}
                  disabled={savingUnitStatus}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
