'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../../components/AppShell';
import { IncompleteIcon } from '../../../components/clients/IncompleteIcon';
import {
  ClientInactivateWithCascadeModal,
  type CascadeSample,
} from '../../../components/clients/ClientInactivateWithCascadeModal';
import { ClientUnitModal } from '../../../components/clients/ClientUnitModal';
import {
  ApiError,
  getClient,
  getClientImpact,
  updateClient,
  inactivateClient,
  inactivateClientWithCascade,
  reactivateClient,
  createClientUnit,
  updateClientUnit,
  inactivateClientUnit,
  reactivateClientUnit,
  listClientSamples,
  listClientPurchases,
  getClientCommercialSummary,
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
import { useFocusTrap } from '../../../lib/use-focus-trap';
import { useRequireAuth } from '../../../lib/use-auth';
import { UserMultiSelect } from '../../../components/users/UserMultiSelect';
import type {
  ClientPersonType,
  ClientUnitSummary,
  ClientSummary,
  ClientSampleItem,
  ClientPurchaseItem,
  ClientCommercialSummary,
  UserLookupItem,
} from '../../../lib/types';

/* ------------------------------------------------------------------ */
/*  Local types & helpers                                             */
/* ------------------------------------------------------------------ */

type Notice = { kind: 'error' | 'success'; text: string } | null;
type ClientDetailSection = 'GENERAL' | 'COMMERCIAL';
type CommercialSubTab = 'SALE' | 'PURCHASE';

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
  const message = cause.message ?? '';
  if (message.includes('already exists')) {
    return 'Numero de inscricao ja esta cadastrado no sistema.';
  }
  if (message.includes('No client registration changes')) {
    return 'Nenhuma alteracao detectada para salvar.';
  }
  if (cause.status === 422 && cause.details && typeof cause.details === 'object') {
    const field = (cause.details as { field?: string }).field;
    if (field && REG_FIELD_LABELS[field]) {
      return `${REG_FIELD_LABELS[field]} invalido.`;
    }
  }
  return 'Falha ao salvar inscricao. Tente novamente.';
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
    commercialUserIds: (client.commercialUsers ?? []).map((u) => u.id),
    reasonText: '',
  };
}

function getStatusTone(status: string): string {
  return status === 'ACTIVE' ? 'success' : 'danger';
}

function getStatusLabel(status: string): string {
  return status === 'ACTIVE' ? 'Ativo' : 'Inativo';
}

function getCommercialStatusClass(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'is-commercial-status-open';
    case 'PARTIALLY_SOLD':
      return 'is-commercial-status-partial';
    case 'SOLD':
      return 'is-commercial-status-sold';
    case 'LOST':
      return 'is-commercial-status-lost';
    default:
      return '';
  }
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export default function ClientDetailPage() {
  /* ---- auth & params ---- */
  const { session, loading, logout, setSession } = useRequireAuth();
  const params = useParams<{ clientId: string }>();
  const clientId = typeof params.clientId === 'string' ? params.clientId : '';

  /* ---- data ---- */
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [units, setUnits] = useState<ClientUnitSummary[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);

  /* ---- notices (6 zones) ---- */
  const [pageNotice, setPageNotice] = useState<Notice>(null);
  const [detailNotice, setDetailNotice] = useState<Notice>(null);
  const [unitNotice, setUnitNotice] = useState<Notice>(null);
  const [editClientModalNotice, setEditClientModalNotice] = useState<Notice>(null);
  const [unitModalNotice, setUnitModalNotice] = useState<Notice>(null);
  const [statusModalNotice, setStatusModalNotice] = useState<Notice>(null);
  const [unitStatusNotice, setUnitStatusNotice] = useState<Notice>(null);

  /* ---- edit client modal ---- */
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
      status: 'ACTIVE',
      commercialUser: null,
      commercialUsers: [],
    } as unknown as ClientSummary)
  );
  const [savingClient, setSavingClient] = useState(false);
  const [users, setUsers] = useState<UserLookupItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const editClientTrapRef = useFocusTrap(editClientOpen);

  /* ---- unit modal (create + edit) — usa ClientUnitModal ---- */
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [unitModalMode, setUnitModalMode] = useState<'create' | 'edit'>('create');
  const [selectedUnit, setSelectedUnit] = useState<ClientUnitSummary | null>(null);
  const [savingUnit, setSavingUnit] = useState(false);
  const [showInactiveUnits, setShowInactiveUnits] = useState(false);

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

  /* ---- commercial tab ---- */
  const [clientSection, setClientSection] = useState<ClientDetailSection>('GENERAL');
  const [commercialSubTab, setCommercialSubTab] = useState<CommercialSubTab>('SALE');
  const [commercialSummary, setCommercialSummary] = useState<ClientCommercialSummary | null>(null);
  const [commercialSummaryLoading, setCommercialSummaryLoading] = useState(false);
  const [ownerSamples, setOwnerSamples] = useState<ClientSampleItem[]>([]);
  const [ownerSamplesPage, setOwnerSamplesPage] = useState(1);
  const [ownerSamplesMeta, setOwnerSamplesMeta] = useState<{
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  } | null>(null);
  const [ownerSamplesLoading, setOwnerSamplesLoading] = useState(false);
  const [buyerPurchases, setBuyerPurchases] = useState<ClientPurchaseItem[]>([]);
  const [buyerPurchasesPage, setBuyerPurchasesPage] = useState(1);
  const [buyerPurchasesMeta, setBuyerPurchasesMeta] = useState<{
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  } | null>(null);
  const [buyerPurchasesLoading, setBuyerPurchasesLoading] = useState(false);
  const commercialFetchedRef = useRef(false);

  /* ---- sale search & filters ---- */
  const [saleSearch, setSaleSearch] = useState('');
  const [saleAppliedSearch, setSaleAppliedSearch] = useState('');
  const [saleFiltersOpen, setSaleFiltersOpen] = useState(false);
  const [saleDraftFilters, setSaleDraftFilters] = useState({
    buyer: '',
    commercialStatus: '',
    harvest: '',
    sacksMin: '',
    sacksMax: '',
    periodMode: 'exact' as 'exact' | 'month' | 'year',
    periodValue: '',
  });
  const [saleAppliedFilters, setSaleAppliedFilters] = useState({
    buyer: '',
    commercialStatus: '',
    harvest: '',
    sacksMin: '',
    sacksMax: '',
    periodMode: 'exact' as 'exact' | 'month' | 'year',
    periodValue: '',
  });
  const saleFiltersTrapRef = useFocusTrap(saleFiltersOpen);
  const saleSearchDebounceRef = useRef<number | null>(null);

  /* ---- purchase search & filters ---- */
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseAppliedSearch, setPurchaseAppliedSearch] = useState('');
  const [purchaseFiltersOpen, setPurchaseFiltersOpen] = useState(false);
  const [purchaseDraftFilters, setPurchaseDraftFilters] = useState({
    owner: '',
    sacksMin: '',
    sacksMax: '',
    periodMode: 'exact' as 'exact' | 'month' | 'year',
    periodValue: '',
  });
  const [purchaseAppliedFilters, setPurchaseAppliedFilters] = useState({
    owner: '',
    sacksMin: '',
    sacksMax: '',
    periodMode: 'exact' as 'exact' | 'month' | 'year',
    periodValue: '',
  });
  const purchaseFiltersTrapRef = useFocusTrap(purchaseFiltersOpen);
  const purchaseSearchDebounceRef = useRef<number | null>(null);

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

  /* ================================================================ */
  /*  Commercial data fetching                                        */
  /* ================================================================ */

  async function fetchCommercialSummary() {
    if (!session || !clientId) return;
    setCommercialSummaryLoading(true);
    try {
      const response = await getClientCommercialSummary(session, clientId);
      setCommercialSummary({ seller: response.seller, buyer: response.buyer });
    } catch {
      // silent — summary is supplementary
    } finally {
      setCommercialSummaryLoading(false);
    }
  }

  async function fetchOwnerSamples(page: number) {
    if (!session || !clientId) return;
    setOwnerSamplesLoading(true);
    try {
      const response = await listClientSamples(session, clientId, {
        page,
        limit: 10,
        search: saleAppliedSearch || undefined,
        buyer: saleAppliedFilters.buyer || undefined,
        commercialStatus: saleAppliedFilters.commercialStatus || undefined,
        harvest: saleAppliedFilters.harvest || undefined,
        sacksMin: saleAppliedFilters.sacksMin || undefined,
        sacksMax: saleAppliedFilters.sacksMax || undefined,
        periodMode: saleAppliedFilters.periodValue ? saleAppliedFilters.periodMode : undefined,
        periodValue: saleAppliedFilters.periodValue || undefined,
      });
      setOwnerSamples(response.items);
      setOwnerSamplesMeta({
        total: response.page.total,
        totalPages: response.page.totalPages,
        hasNext: response.page.hasNext,
        hasPrev: response.page.hasPrev,
      });
      setOwnerSamplesPage(page);
    } catch {
      setOwnerSamples([]);
      setOwnerSamplesMeta(null);
    } finally {
      setOwnerSamplesLoading(false);
    }
  }

  async function fetchBuyerPurchases(page: number) {
    if (!session || !clientId) return;
    setBuyerPurchasesLoading(true);
    try {
      const response = await listClientPurchases(session, clientId, {
        page,
        limit: 10,
        search: purchaseAppliedSearch || undefined,
        owner: purchaseAppliedFilters.owner || undefined,
        sacksMin: purchaseAppliedFilters.sacksMin || undefined,
        sacksMax: purchaseAppliedFilters.sacksMax || undefined,
        periodMode: purchaseAppliedFilters.periodValue
          ? purchaseAppliedFilters.periodMode
          : undefined,
        periodValue: purchaseAppliedFilters.periodValue || undefined,
      });
      setBuyerPurchases(response.items);
      setBuyerPurchasesMeta({
        total: response.page.total,
        totalPages: response.page.totalPages,
        hasNext: response.page.hasNext,
        hasPrev: response.page.hasPrev,
      });
      setBuyerPurchasesPage(page);
    } catch {
      setBuyerPurchases([]);
      setBuyerPurchasesMeta(null);
    } finally {
      setBuyerPurchasesLoading(false);
    }
  }

  /* ---- lazy‑load commercial data ---- */
  useEffect(() => {
    if (clientSection !== 'COMMERCIAL' || commercialFetchedRef.current || !client) return;
    commercialFetchedRef.current = true;
    void fetchCommercialSummary();
    if (client.isSeller) {
      void fetchOwnerSamples(1);
    }
    if (!client.isSeller && client.isBuyer) {
      setCommercialSubTab('PURCHASE');
      void fetchBuyerPurchases(1);
    }
    // fetch* sao funcoes locais nao memoizadas; effect deve disparar so quando section/client mudam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSection, client]);

  useEffect(() => {
    if (clientSection !== 'COMMERCIAL' || !commercialFetchedRef.current || !client) return;
    if (
      commercialSubTab === 'SALE' &&
      ownerSamples.length === 0 &&
      !ownerSamplesLoading &&
      client.isSeller
    ) {
      void fetchOwnerSamples(1);
    }
    if (
      commercialSubTab === 'PURCHASE' &&
      buyerPurchases.length === 0 &&
      !buyerPurchasesLoading &&
      client.isBuyer
    ) {
      void fetchBuyerPurchases(1);
    }
    // intencionalmente reage so a mudancas de subtab; demais valores sao snapshot do momento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commercialSubTab]);

  /* ---- sale search debounce ---- */

  useEffect(() => {
    if (clientSection !== 'COMMERCIAL' || commercialSubTab !== 'SALE') return;
    if (saleSearchDebounceRef.current !== null) window.clearTimeout(saleSearchDebounceRef.current);
    const trimmed = saleSearch.trim();
    if (trimmed === saleAppliedSearch) return;
    saleSearchDebounceRef.current = window.setTimeout(() => {
      saleSearchDebounceRef.current = null;
      setSaleAppliedSearch(trimmed);
      setOwnerSamplesPage(1);
    }, 400);
    return () => {
      if (saleSearchDebounceRef.current !== null) {
        window.clearTimeout(saleSearchDebounceRef.current);
        saleSearchDebounceRef.current = null;
      }
    };
  }, [saleSearch, clientSection, commercialSubTab, saleAppliedSearch]);

  /* ---- re-fetch when applied search/filters change ---- */
  useEffect(() => {
    if (
      clientSection !== 'COMMERCIAL' ||
      commercialSubTab !== 'SALE' ||
      !commercialFetchedRef.current
    )
      return;
    void fetchOwnerSamples(1);
    // dispara so quando filtros aplicados mudam; section/subTab funcionam como guard
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleAppliedSearch, saleAppliedFilters]);

  /* ---- purchase search debounce ---- */

  useEffect(() => {
    if (clientSection !== 'COMMERCIAL' || commercialSubTab !== 'PURCHASE') return;
    if (purchaseSearchDebounceRef.current !== null)
      window.clearTimeout(purchaseSearchDebounceRef.current);
    const trimmed = purchaseSearch.trim();
    if (trimmed === purchaseAppliedSearch) return;
    purchaseSearchDebounceRef.current = window.setTimeout(() => {
      purchaseSearchDebounceRef.current = null;
      setPurchaseAppliedSearch(trimmed);
      setBuyerPurchasesPage(1);
    }, 400);
    return () => {
      if (purchaseSearchDebounceRef.current !== null) {
        window.clearTimeout(purchaseSearchDebounceRef.current);
        purchaseSearchDebounceRef.current = null;
      }
    };
  }, [purchaseSearch, clientSection, commercialSubTab, purchaseAppliedSearch]);

  /* ---- re-fetch when applied purchase search/filters change ---- */
  useEffect(() => {
    if (
      clientSection !== 'COMMERCIAL' ||
      commercialSubTab !== 'PURCHASE' ||
      !commercialFetchedRef.current
    )
      return;
    void fetchBuyerPurchases(1);
    // dispara so quando filtros aplicados mudam; section/subTab funcionam como guard
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseAppliedSearch, purchaseAppliedFilters]);

  function formatDate(value: string | null): string {
    if (!value) return '\u2014';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('pt-BR');
  }

  /* ================================================================ */
  /*  Sale filter helpers                                              */
  /* ================================================================ */

  const COMMERCIAL_OPTIONS = [
    { value: 'OPEN', label: 'Aberto' },
    { value: 'PARTIALLY_SOLD', label: 'Parcial' },
    { value: 'SOLD', label: 'Vendido' },
    { value: 'LOST', label: 'Perdido' },
  ];

  const HARVEST_OPTIONS = ['24/25', '25/26', '26/27'];

  const saleActiveFiltersCount = [
    saleAppliedFilters.buyer,
    saleAppliedFilters.commercialStatus,
    saleAppliedFilters.harvest,
    saleAppliedFilters.sacksMin || saleAppliedFilters.sacksMax,
    saleAppliedFilters.periodValue,
  ].filter(Boolean).length;

  function handleApplySaleFilters() {
    setSaleAppliedFilters({ ...saleDraftFilters });
    setOwnerSamplesPage(1);
    setSaleFiltersOpen(false);
  }

  function handleClearSaleFilters() {
    const empty = {
      buyer: '',
      commercialStatus: '',
      harvest: '',
      sacksMin: '',
      sacksMax: '',
      periodMode: 'exact' as const,
      periodValue: '',
    };
    setSaleDraftFilters(empty);
    setSaleAppliedFilters(empty);
    setOwnerSamplesPage(1);
    setSaleFiltersOpen(false);
  }

  /* ================================================================ */
  /*  Purchase filter helpers                                          */
  /* ================================================================ */

  const purchaseActiveFiltersCount = [
    purchaseAppliedFilters.owner,
    purchaseAppliedFilters.sacksMin || purchaseAppliedFilters.sacksMax,
    purchaseAppliedFilters.periodValue,
  ].filter(Boolean).length;

  function handleApplyPurchaseFilters() {
    setPurchaseAppliedFilters({ ...purchaseDraftFilters });
    setBuyerPurchasesPage(1);
    setPurchaseFiltersOpen(false);
  }

  function handleClearPurchaseFilters() {
    const empty = {
      owner: '',
      sacksMin: '',
      sacksMax: '',
      periodMode: 'exact' as const,
      periodValue: '',
    };
    setPurchaseDraftFilters(empty);
    setPurchaseAppliedFilters(empty);
    setBuyerPurchasesPage(1);
    setPurchaseFiltersOpen(false);
  }

  /* ================================================================ */
  /*  Validation                                                      */
  /* ================================================================ */

  const canSaveClient = useMemo(() => {
    const nameOk =
      editClientForm.personType === 'PF'
        ? editClientForm.fullName.trim().length > 0
        : editClientForm.legalName.trim().length > 0;
    const phoneDigits = editClientForm.phone.replace(/\D/g, '').length;
    const phoneOk = phoneDigits === 10 || phoneDigits === 11;
    const cpfDigits = editClientForm.cpf.replace(/\D/g, '').length;
    const cnpjDigits = editClientForm.cnpj.replace(/\D/g, '').length;
    const docOk =
      editClientForm.personType === 'PF'
        ? cpfDigits === 0 || cpfDigits === 11
        : cnpjDigits === 0 || cnpjDigits === 14;
    return nameOk && phoneOk && docOk;
  }, [editClientForm]);

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

  // 14.7.G: indicador de pendencia inline. Em vez do banner grande de
  // "Cadastro incompleto" no topo, cada campo recomendado missing recebe
  // um icone amarelo pulsante ao lado do label + label em cor amber.
  const missingSet = useMemo(() => {
    const result = isClientComplete(client);
    return new Set(result.missing);
  }, [client]);
  const isMissing = (field: string) => missingSet.has(field);
  const isUnitMissing = (unitId: string, field: string) =>
    missingSet.has(`units[${unitId}].${field}`);

  /* ================================================================ */
  /*  Edit client handlers                                            */
  /* ================================================================ */

  function openEditClient() {
    if (!client) return;
    setEditClientForm(clientSummaryToForm(client));
    setEditClientModalNotice(null);
    setEditClientOpen(true);

    if (!session) return;
    setLoadingUsers(true);
    lookupUsersForReference(session, { limit: 200 })
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
      const data: Parameters<typeof updateClient>[2] = {
        personType: editClientForm.personType,
        isBuyer: editClientForm.isBuyer,
        isSeller: editClientForm.isSeller,
        reasonText: editClientForm.reasonText,
      };

      if (editClientForm.personType === 'PF') {
        data.fullName = editClientForm.fullName;
        data.cpf = editClientForm.cpf.replace(/\D/g, '');
      } else {
        // L5: PJ guarda cnpj direto no Client.
        data.legalName = editClientForm.legalName;
        data.tradeName = editClientForm.tradeName || null;
        data.cnpj = editClientForm.cnpj.replace(/\D/g, '') || null;
        // 14.1: PJ tambem guarda IE + endereco + email no proprio Client.
        data.registrationNumber = editClientForm.registrationNumber.trim() || null;
        data.addressLine = editClientForm.addressLine.trim() || null;
        data.district = editClientForm.district.trim() || null;
        data.city = editClientForm.city.trim() || null;
        data.state = editClientForm.state.trim().toUpperCase() || null;
        data.postalCode = editClientForm.postalCode.replace(/\D/g, '') || null;
        data.complement = editClientForm.complement.trim() || null;
        data.email = editClientForm.email.trim() || null;
      }

      if (editClientForm.phone.replace(/\D/g, '').length > 0) {
        data.phone = editClientForm.phone.replace(/\D/g, '');
      } else {
        data.phone = null;
      }

      data.commercialUserIds = editClientForm.commercialUserIds;

      await updateClient(session, clientId, data);
      setEditClientSuccess(true);
      void fetchData();
      window.setTimeout(() => {
        setEditClientOpen(false);
        setEditClientSuccess(false);
      }, 1000);
    } catch (cause) {
      setEditClientModalNotice({
        kind: 'error',
        text: cause instanceof ApiError ? cause.message : 'Falha ao atualizar cliente.',
      });
    } finally {
      setSavingClient(false);
    }
  }

  /* ================================================================ */
  /*  Unit CRUD handlers — L5 (apenas PF)                            */
  /* ================================================================ */

  function openUnitCreate() {
    setUnitModalMode('create');
    setSelectedUnit(null);
    setUnitModalNotice(null);
    setSavingUnit(false);
    setUnitModalOpen(true);
  }

  function openUnitEdit(unit: ClientUnitSummary) {
    setUnitModalMode('edit');
    setSelectedUnit(unit);
    setUnitModalNotice(null);
    setSavingUnit(false);
    setUnitModalOpen(true);
  }

  function closeUnitModal() {
    if (savingUnit) return;
    setUnitModalOpen(false);
  }

  async function handleUnitSubmit(
    data: import('../../../lib/types').ClientUnitInput,
    reasonText: string | null
  ) {
    if (!session || !clientId) return;
    setSavingUnit(true);
    setUnitModalNotice(null);

    try {
      // 14.2: terminologia unificada — PJ no L5 nao tem unit (substituido
      // por card "Endereco e fiscal"); ClientUnit existe so em PF.
      const term = 'Filial';
      if (unitModalMode === 'create') {
        await createClientUnit(session, clientId, data);
        setUnitNotice({ kind: 'success', text: `${term} criada com sucesso.` });
      } else {
        if (!selectedUnit) return;
        await updateClientUnit(session, clientId, selectedUnit.id, {
          ...data,
          reasonText: reasonText ?? '',
        });
        setUnitNotice({ kind: 'success', text: `${term} atualizada com sucesso.` });
      }
      void fetchData();
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
    setSelectedUnit(unit);
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
    } catch (cause) {
      setUnitStatusNotice({
        kind: 'error',
        text: cause instanceof ApiError ? cause.message : 'Falha ao alterar status da filial.',
      });
    } finally {
      setSavingUnitStatus(false);
    }
  }

  /* ================================================================ */
  /*  Guard: loading / unauthenticated                                */
  /* ================================================================ */

  if (loading || !session) return null;

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
        {loadingPage ? <div className="sdv-loading">Carregando cliente...</div> : null}

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
                <span className="sdv-header-title">Detalhes</span>
                <button
                  type="button"
                  className="nsv2-avatar"
                  aria-label="Perfil"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-profile-sheet'))}
                >
                  <span className="nsv2-avatar-initials">{sessionInitials}</span>
                </button>
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

            {/* Abas */}
            <div className="sdv-tabs" role="tablist" aria-label="Secoes do cliente">
              <button
                type="button"
                role="tab"
                aria-selected={clientSection === 'GENERAL'}
                className={`sdv-tab${clientSection === 'GENERAL' ? ' is-active' : ''}`}
                onClick={() => setClientSection('GENERAL')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>Geral</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={clientSection === 'COMMERCIAL'}
                className={`sdv-tab${clientSection === 'COMMERCIAL' ? ' is-active' : ''}`}
                onClick={() => setClientSection('COMMERCIAL')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2v20" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                <span>Comercial</span>
              </button>
            </div>

            {/* Conteúdo */}
            <section className="sdv-content">
              <div className="sdv-content-inner">
                {clientSection === 'GENERAL' ? (
                  <section className="sdv-general">
                    {/* 14.7.F Card: Informações — header verde + editar inline */}
                    <div className="sdv-card sdv-card-themed sdv-card-info">
                      <div className="sdv-card-themed-header">
                        <span className="sdv-card-themed-title">Informações</span>
                        <button
                          type="button"
                          className="sdv-card-themed-edit"
                          onClick={openEditClient}
                          aria-label="Editar informações"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                          </svg>
                        </button>
                      </div>
                      <div className="sdv-card-themed-body">
                        <div className="sdv-info-grid">
                          <div className="sdv-info-item is-full">
                            <span className="sdv-info-label">
                              {client.personType === 'PF' ? 'Nome completo' : 'Razao social'}
                            </span>
                            <span className="sdv-info-value">
                              {client.personType === 'PF'
                                ? client.fullName || '\u2014'
                                : client.legalName || '\u2014'}
                            </span>
                          </div>
                          <div className="sdv-info-item">
                            <span
                              className={`sdv-info-label${client.personType === 'PF' && isMissing('cpf') ? ' is-missing' : ''}`}
                            >
                              {client.personType === 'PF' ? 'CPF' : 'CNPJ'}
                              {client.personType === 'PF' && isMissing('cpf') ? (
                                <IncompleteIcon className="sdv-info-label-warning" />
                              ) : null}
                            </span>
                            <span className="sdv-info-value">
                              {client.personType === 'PF'
                                ? formatClientDocument(client.cpf, 'PF') || '\u2014'
                                : formatClientDocument(client.cnpj, 'PJ') || '\u2014'}
                            </span>
                          </div>
                          <div className="sdv-info-item">
                            <span className="sdv-info-label">Papeis</span>
                            <div className="cdm-roles">
                              {client.isBuyer ? (
                                <span className="cv2-card-role is-buyer">Comprador</span>
                              ) : null}
                              {client.isSeller ? (
                                <span className="cv2-card-role is-seller">Vendedor</span>
                              ) : null}
                              {!client.isBuyer && !client.isSeller ? (
                                <span className="cv2-card-role is-none">Sem papel</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="sdv-info-item">
                            <span className="sdv-info-label">Email</span>
                            <span className="sdv-info-value">{client.email || '\u2014'}</span>
                          </div>
                          <div className="sdv-info-item">
                            <span className="sdv-info-label">Telefone</span>
                            <span className="sdv-info-value">
                              {formatPhone(client.phone) || '\u2014'}
                            </span>
                          </div>
                          <div className="sdv-info-item is-full">
                            <span className="sdv-info-label">
                              Respons\u00e1veis comerciais
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
                            onClick={openEditClient}
                            aria-label="Editar informações"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                            </svg>
                          </button>
                        </div>
                        <div className="sdv-card-themed-body">
                          <div className="sdv-info-grid">
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
                                {client.city && client.state
                                  ? `${client.city}/${client.state}`
                                  : '—'}
                              </span>
                            </div>
                            <div className="sdv-info-item is-full">
                              <span
                                className={`sdv-info-label${isMissing('addressLine') ? ' is-missing' : ''}`}
                              >
                                Endereço
                                {isMissing('addressLine') ? (
                                  <IncompleteIcon className="sdv-info-label-warning" />
                                ) : null}
                              </span>
                              <span className="sdv-info-value">
                                {[client.addressLine, client.complement]
                                  .filter(Boolean)
                                  .join(', ') || '—'}
                              </span>
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
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* 14.2: Card "Filiais" (PF apenas — PJ no L5 nao tem ClientUnit). */
                      <div className="sdv-card sdv-card-filiais">
                        <div className="sdv-card-header">
                          <span className="sdv-card-title">
                            {unitPlural} ({visibleUnits.length}
                            {inactiveUnitsCount > 0 ? ` · ${inactiveUnitsCount} inativa(s)` : ''})
                          </span>
                          {canAddUnit ? (
                            <button type="button" className="sdv-edit-btn" onClick={openUnitCreate}>
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 5v14" />
                                <path d="M5 12h14" />
                              </svg>
                              <span>Nova filial</span>
                            </button>
                          ) : null}
                        </div>

                        {units.length === 0 ? (
                          <div className="spv2-empty client-detail-empty-compact">
                            <p className="spv2-empty-text">Nenhuma filial cadastrada</p>
                          </div>
                        ) : (
                          <div className="sdv-unit-list">
                            {visibleUnits.map((unit) => (
                              <div
                                key={unit.id}
                                className={`sdv-unit-card${unit.status === 'INACTIVE' ? ' is-inactive' : ''}`}
                              >
                                <div className="sdv-unit-card-header">
                                  <span className="sdv-unit-badge is-filial">
                                    Filial {unit.code}
                                  </span>
                                  {unit.status === 'INACTIVE' ? (
                                    <span className="sdv-unit-badge is-inactive">Inativa</span>
                                  ) : null}
                                  <span className="sdv-unit-name">
                                    {unit.name ?? unit.legalName ?? 'Sem nome'}
                                  </span>
                                </div>
                                <div className="sdv-unit-card-body">
                                  {/* CNPJ — nao e recomendado, so exibe se ha valor. */}
                                  {unit.cnpj ? (
                                    <div>
                                      <span className="sdv-unit-label">CNPJ:</span> {unit.cnpj}
                                    </div>
                                  ) : null}
                                  {/* 14.7.G: campos recomendados — exibem com — + warning
                                      quando missing, valor + label normal quando presente. */}
                                  {(() => {
                                    const localMissing =
                                      isUnitMissing(unit.id, 'city') ||
                                      isUnitMissing(unit.id, 'state');
                                    const localValue =
                                      unit.city && unit.state ? `${unit.city}/${unit.state}` : null;
                                    if (!localValue && !localMissing) return null;
                                    return (
                                      <div>
                                        <span
                                          className={`sdv-unit-label${localMissing ? ' is-missing' : ''}`}
                                        >
                                          Local:
                                          {localMissing ? (
                                            <IncompleteIcon className="sdv-info-label-warning" />
                                          ) : null}
                                        </span>{' '}
                                        {localValue || '—'}
                                      </div>
                                    );
                                  })()}
                                  {(() => {
                                    const missing = isUnitMissing(unit.id, 'addressLine');
                                    if (!unit.addressLine && !missing) return null;
                                    return (
                                      <div>
                                        <span
                                          className={`sdv-unit-label${missing ? ' is-missing' : ''}`}
                                        >
                                          Endereço:
                                          {missing ? (
                                            <IncompleteIcon className="sdv-info-label-warning" />
                                          ) : null}
                                        </span>{' '}
                                        {unit.addressLine || '—'}
                                      </div>
                                    );
                                  })()}
                                  {(() => {
                                    const missing = isUnitMissing(unit.id, 'district');
                                    if (!unit.district && !missing) return null;
                                    return (
                                      <div>
                                        <span
                                          className={`sdv-unit-label${missing ? ' is-missing' : ''}`}
                                        >
                                          Bairro:
                                          {missing ? (
                                            <IncompleteIcon className="sdv-info-label-warning" />
                                          ) : null}
                                        </span>{' '}
                                        {unit.district || '—'}
                                      </div>
                                    );
                                  })()}
                                  {(() => {
                                    const missing = isUnitMissing(unit.id, 'postalCode');
                                    if (!unit.postalCode && !missing) return null;
                                    return (
                                      <div>
                                        <span
                                          className={`sdv-unit-label${missing ? ' is-missing' : ''}`}
                                        >
                                          CEP:
                                          {missing ? (
                                            <IncompleteIcon className="sdv-info-label-warning" />
                                          ) : null}
                                        </span>{' '}
                                        {unit.postalCode || '—'}
                                      </div>
                                    );
                                  })()}
                                  {(() => {
                                    const missing = isUnitMissing(unit.id, 'registrationNumber');
                                    if (!unit.registrationNumber && !missing) return null;
                                    return (
                                      <div>
                                        <span
                                          className={`sdv-unit-label${missing ? ' is-missing' : ''}`}
                                        >
                                          IE:
                                          {missing ? (
                                            <IncompleteIcon className="sdv-info-label-warning" />
                                          ) : null}
                                        </span>{' '}
                                        {unit.registrationNumber || '—'}
                                      </div>
                                    );
                                  })()}
                                  {(() => {
                                    const missing = isUnitMissing(unit.id, 'car');
                                    if (!unit.car && !missing) return null;
                                    return (
                                      <div>
                                        <span
                                          className={`sdv-unit-label${missing ? ' is-missing' : ''}`}
                                        >
                                          CAR:
                                          {missing ? (
                                            <IncompleteIcon className="sdv-info-label-warning" />
                                          ) : null}
                                        </span>{' '}
                                        {unit.car || '—'}
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div className="sdv-unit-card-actions">
                                  <button
                                    type="button"
                                    className="sdv-edit-btn-small"
                                    onClick={() => openUnitEdit(unit)}
                                    disabled={savingUnit}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className={`sdv-edit-btn-small${unit.status === 'ACTIVE' ? ' is-danger' : ''}`}
                                    onClick={() =>
                                      openUnitStatusModal(
                                        unit,
                                        unit.status === 'ACTIVE' ? 'inactivate' : 'reactivate'
                                      )
                                    }
                                    disabled={savingUnitStatus}
                                  >
                                    {unit.status === 'ACTIVE' ? 'Inativar' : 'Reativar'}
                                  </button>
                                </div>
                              </div>
                            ))}

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
                ) : null}

                {clientSection === 'COMMERCIAL' ? (
                  <div className="client-detail-commercial-pane">
                    {/* BLOCO 1: Sub-abas (fixo) */}
                    <div className="client-detail-commercial-subtabs">
                      <button
                        type="button"
                        disabled={!client.isSeller}
                        onClick={() => setCommercialSubTab('SALE')}
                        className={commercialSubTab === 'SALE' ? 'is-active' : ''}
                      >
                        Venda
                      </button>
                      <button
                        type="button"
                        disabled={!client.isBuyer}
                        onClick={() => setCommercialSubTab('PURCHASE')}
                        className={commercialSubTab === 'PURCHASE' ? 'is-active' : ''}
                      >
                        Compra
                      </button>
                    </div>

                    {/* BLOCO 2: Cards de resumo (fixo) */}
                    <div className="client-detail-commercial-summary-wrap">
                      {commercialSummaryLoading ? (
                        <p className="client-detail-status-msg">Carregando resumo...</p>
                      ) : commercialSummary ? (
                        <div className="client-detail-commercial-summary">
                          {commercialSubTab === 'SALE' ? (
                            <>
                              <div className="client-detail-summary-card is-samples">
                                <span className="client-detail-summary-label">Registradas</span>
                                <strong className="client-detail-summary-value">
                                  {commercialSummary.seller.registeredSamples}
                                </strong>
                              </div>
                              <div className="client-detail-summary-card is-sacks">
                                <span className="client-detail-summary-label">Sacas</span>
                                <strong className="client-detail-summary-value">
                                  {commercialSummary.seller.totalSacks}
                                </strong>
                              </div>
                              <div className="client-detail-summary-card is-sold">
                                <span className="client-detail-summary-label">Vendidas</span>
                                <strong className="client-detail-summary-value">
                                  {commercialSummary.seller.soldSacks}
                                </strong>
                              </div>
                              <div className="client-detail-summary-card is-lost">
                                <span className="client-detail-summary-label">Perdidas</span>
                                <strong className="client-detail-summary-value">
                                  {commercialSummary.seller.lostSacks}
                                </strong>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="client-detail-summary-card is-purchases">
                                <span className="client-detail-summary-label">
                                  Total de compras
                                </span>
                                <strong className="client-detail-summary-value">
                                  {commercialSummary.buyer.totalPurchases}
                                </strong>
                              </div>
                              <div className="client-detail-summary-card is-purchased-sacks">
                                <span className="client-detail-summary-label">Sacas compradas</span>
                                <strong className="client-detail-summary-value">
                                  {commercialSummary.buyer.purchasedSacks}
                                </strong>
                              </div>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {/* BLOCO 3: Lista de amostras/compras */}
                    <div className="client-detail-commercial-list-block">
                      {commercialSubTab === 'SALE' ? (
                        <>
                          {/* Topo fixo: busca + filtro */}
                          <div className="client-detail-commercial-search-row">
                            <form
                              className="client-detail-commercial-search-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (saleSearchDebounceRef.current !== null) {
                                  window.clearTimeout(saleSearchDebounceRef.current);
                                  saleSearchDebounceRef.current = null;
                                }
                                setSaleAppliedSearch(saleSearch.trim());
                                setOwnerSamplesPage(1);
                              }}
                            >
                              <input
                                className="samples-filter-field-input client-detail-commercial-search-input"
                                value={saleSearch}
                                onChange={(e) => setSaleSearch(e.target.value)}
                                placeholder="Buscar por lote"
                              />
                            </form>
                            <button
                              type="button"
                              className={`client-detail-commercial-filter-btn${saleActiveFiltersCount > 0 ? ' has-filters' : ''}`}
                              onClick={() => {
                                setSaleDraftFilters({ ...saleAppliedFilters });
                                setSaleFiltersOpen(true);
                              }}
                              aria-label="Filtros"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M4 6h16" />
                                <path d="M7 12h10" />
                                <path d="M10 18h4" />
                              </svg>
                              {saleActiveFiltersCount > 0 ? (
                                <span className="client-detail-commercial-filter-badge">
                                  {saleActiveFiltersCount}
                                </span>
                              ) : null}
                            </button>
                          </div>

                          {/* Meio: lista com scroll */}
                          <div className="client-detail-commercial-scroll">
                            {ownerSamplesLoading ? (
                              <p className="client-detail-status-msg">Carregando amostras...</p>
                            ) : ownerSamples.length === 0 ? (
                              <p className="client-detail-status-msg">
                                Nenhuma amostra encontrada.
                              </p>
                            ) : (
                              <div className="client-detail-commercial-list">
                                {ownerSamples.map((sample) => (
                                  <Link
                                    key={sample.id}
                                    href={`/samples/${sample.id}`}
                                    className={`client-detail-commercial-item ${getCommercialStatusClass(sample.commercialStatus)}`}
                                  >
                                    <div className="client-detail-commercial-item-main">
                                      <strong>{sample.internalLotNumber ?? sample.id}</strong>
                                      <span>
                                        {sample.declaredOwner ?? '\u2014'} · Safra{' '}
                                        {sample.declaredHarvest ?? '\u2014'} ·{' '}
                                        {sample.declaredSacks ?? 0} sacas
                                      </span>
                                    </div>
                                    <span className="client-detail-commercial-item-date">
                                      {formatDate(sample.createdAt)}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Fundo fixo: paginação */}
                          <div className="client-detail-commercial-pagination">
                            <button
                              type="button"
                              className="client-detail-page-btn"
                              disabled={!ownerSamplesMeta?.hasPrev}
                              onClick={() => void fetchOwnerSamples(ownerSamplesPage - 1)}
                              aria-label="Pagina anterior"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M15 6 9 12l6 6" />
                              </svg>
                            </button>
                            <span className="client-detail-page-info">
                              {ownerSamplesPage} de {ownerSamplesMeta?.totalPages ?? 1}
                            </span>
                            <button
                              type="button"
                              className="client-detail-page-btn"
                              disabled={!ownerSamplesMeta?.hasNext}
                              onClick={() => void fetchOwnerSamples(ownerSamplesPage + 1)}
                              aria-label="Proxima pagina"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m9 6 6 6-6 6" />
                              </svg>
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Topo fixo: busca + filtro */}
                          <div className="client-detail-commercial-search-row">
                            <form
                              className="client-detail-commercial-search-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (purchaseSearchDebounceRef.current !== null) {
                                  window.clearTimeout(purchaseSearchDebounceRef.current);
                                  purchaseSearchDebounceRef.current = null;
                                }
                                setPurchaseAppliedSearch(purchaseSearch.trim());
                                setBuyerPurchasesPage(1);
                              }}
                            >
                              <input
                                className="samples-filter-field-input client-detail-commercial-search-input"
                                value={purchaseSearch}
                                onChange={(e) => setPurchaseSearch(e.target.value)}
                                placeholder="Buscar por lote"
                              />
                            </form>
                            <button
                              type="button"
                              className={`client-detail-commercial-filter-btn${purchaseActiveFiltersCount > 0 ? ' has-filters' : ''}`}
                              onClick={() => {
                                setPurchaseDraftFilters({ ...purchaseAppliedFilters });
                                setPurchaseFiltersOpen(true);
                              }}
                              aria-label="Filtros"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M4 6h16" />
                                <path d="M7 12h10" />
                                <path d="M10 18h4" />
                              </svg>
                              {purchaseActiveFiltersCount > 0 ? (
                                <span className="client-detail-commercial-filter-badge">
                                  {purchaseActiveFiltersCount}
                                </span>
                              ) : null}
                            </button>
                          </div>

                          {/* Meio: lista com scroll */}
                          <div className="client-detail-commercial-scroll">
                            {buyerPurchasesLoading ? (
                              <p className="client-detail-status-msg">Carregando compras...</p>
                            ) : buyerPurchases.length === 0 ? (
                              <p className="client-detail-status-msg">Nenhuma compra encontrada.</p>
                            ) : (
                              <div className="client-detail-commercial-list">
                                {buyerPurchases.map((purchase) => (
                                  <Link
                                    key={purchase.id}
                                    href={`/samples/${purchase.sampleId}`}
                                    className="client-detail-commercial-item"
                                  >
                                    <div className="client-detail-commercial-item-main">
                                      <strong>
                                        {purchase.sampleLotNumber ?? purchase.sampleId}
                                      </strong>
                                      <span>
                                        {purchase.ownerName ?? '\u2014'} · {purchase.quantitySacks}{' '}
                                        sacas
                                      </span>
                                    </div>
                                    <span className="client-detail-commercial-item-date">
                                      {formatDate(purchase.movementDate)}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Fundo fixo: paginação */}
                          <div className="client-detail-commercial-pagination">
                            <button
                              type="button"
                              className="client-detail-page-btn"
                              disabled={!buyerPurchasesMeta?.hasPrev}
                              onClick={() => void fetchBuyerPurchases(buyerPurchasesPage - 1)}
                              aria-label="Pagina anterior"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M15 6 9 12l6 6" />
                              </svg>
                            </button>
                            <span className="client-detail-page-info">
                              {buyerPurchasesPage} de {buyerPurchasesMeta?.totalPages ?? 1}
                            </span>
                            <button
                              type="button"
                              className="client-detail-page-btn"
                              disabled={!buyerPurchasesMeta?.hasNext}
                              onClick={() => void fetchBuyerPurchases(buyerPurchasesPage + 1)}
                              aria-label="Proxima pagina"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m9 6 6 6-6 6" />
                              </svg>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : null}
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
            className="app-modal client-detail-edit-modal client-detail-modal-scrollable"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-client-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="edit-client-title" className="app-modal-title">
                  Editar cliente
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
                <label className="app-modal-field">
                  <span className="app-modal-label">Tipo de pessoa</span>
                  <select
                    className="app-modal-input"
                    value={editClientForm.personType}
                    disabled={savingClient}
                    onChange={(e) =>
                      setEditClientForm((c) => ({
                        ...c,
                        personType: e.target.value as ClientPersonType,
                      }))
                    }
                  >
                    <option value="PJ">Pessoa juridica</option>
                    <option value="PF">Pessoa fisica</option>
                  </select>
                </label>

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
                      <span className="app-modal-label">CPF</span>
                      <input
                        className="app-modal-input"
                        value={editClientForm.cpf}
                        disabled={savingClient}
                        onChange={(e) =>
                          setEditClientForm((c) => ({ ...c, cpf: maskCpfInput(e.target.value) }))
                        }
                      />
                    </label>
                  </>
                ) : (
                  <>
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
                        className="app-modal-input"
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
                    <label className="app-modal-field">
                      <span className="app-modal-label">CNPJ</span>
                      <input
                        className="app-modal-input"
                        value={editClientForm.cnpj}
                        disabled={savingClient}
                        onChange={(e) =>
                          setEditClientForm((c) => ({
                            ...c,
                            cnpj: maskCnpjInput(e.target.value),
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
                        placeholder="CONTATO@EMPRESA.COM"
                      />
                    </label>
                    <label className="app-modal-field">
                      <span className="app-modal-label">Inscrição estadual</span>
                      <input
                        className="app-modal-input"
                        value={editClientForm.registrationNumber}
                        disabled={savingClient}
                        inputMode="numeric"
                        onChange={(e) =>
                          setEditClientForm((c) => ({
                            ...c,
                            registrationNumber: maskRegistrationNumberInput(e.target.value),
                          }))
                        }
                        placeholder="000.000.000.00-00"
                      />
                    </label>
                    <label className="app-modal-field">
                      <span className="app-modal-label">
                        CEP
                        {editCep.loading ? <span aria-hidden="true"> ⌛</span> : null}
                      </span>
                      <input
                        className="app-modal-input"
                        value={editClientForm.postalCode}
                        disabled={savingClient}
                        inputMode="numeric"
                        onChange={(e) =>
                          setEditClientForm((c) => ({
                            ...c,
                            postalCode: maskPostalCodeInput(e.target.value),
                          }))
                        }
                        placeholder="00000-000"
                      />
                    </label>
                    <label className="app-modal-field">
                      <span className="app-modal-label">Endereço</span>
                      <input
                        className="app-modal-input"
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
                    <label className="app-modal-field">
                      <span className="app-modal-label">Bairro</span>
                      <input
                        className="app-modal-input"
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
                      <span className="app-modal-label">Cidade</span>
                      <input
                        className="app-modal-input"
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
                        className="app-modal-input"
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
                  </>
                )}

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
                    placeholder="(xx)xxxxx-xxxx"
                  />
                </label>

                <UserMultiSelect
                  label="Responsáveis comerciais"
                  value={editClientForm.commercialUserIds}
                  onChange={(next) => setEditClientForm((c) => ({ ...c, commercialUserIds: next }))}
                  users={users}
                  loading={loadingUsers}
                  disabled={savingClient}
                  placeholder="Selecione 1+ responsáveis comerciais"
                  errorMessage={
                    editClientForm.commercialUserIds.length === 0 && client?.status === 'ACTIVE'
                      ? 'Cliente ativo precisa de pelo menos 1 responsável'
                      : undefined
                  }
                />

                <div className="client-detail-modal-flags">
                  <label className="client-detail-modal-flag">
                    <input
                      type="checkbox"
                      checked={editClientForm.isSeller}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({ ...c, isSeller: e.target.checked }))
                      }
                    />
                    Proprietario/Vendedor
                  </label>
                  <label className="client-detail-modal-flag">
                    <input
                      type="checkbox"
                      checked={editClientForm.isBuyer}
                      disabled={savingClient}
                      onChange={(e) =>
                        setEditClientForm((c) => ({ ...c, isBuyer: e.target.checked }))
                      }
                    />
                    Comprador
                  </label>
                </div>

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

                <div className="app-modal-actions">
                  <button
                    type="submit"
                    className="app-modal-submit"
                    disabled={savingClient || !canSaveClient}
                  >
                    {savingClient ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={closeEditClient}
                    disabled={savingClient}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}

      {/* ========== MODAL 2: Create/Edit Unit (PF only — filiais L5) ========== */}
      <ClientUnitModal
        open={unitModalOpen}
        mode={unitModalMode}
        unit={selectedUnit}
        saving={savingUnit}
        errorMessage={unitModalNotice?.kind === 'error' ? unitModalNotice.text : null}
        onClose={closeUnitModal}
        onSubmit={handleUnitSubmit}
      />

      {/* ========== MODAL 2.5: Cascade Inactivate (#6/Q-05) ========== */}
      <ClientInactivateWithCascadeModal
        open={cascadeOpen}
        clientName={client?.displayName ?? 'Cliente'}
        activeSamples={cascadeSamples}
        saving={cascadeSaving}
        errorMessage={cascadeError}
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
            className="app-modal"
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
                    ? 'A inativacao impede que este cliente seja selecionado em novas amostras ou movimentacoes.'
                    : 'A reativacao permitira que este cliente seja usado novamente em novas operacoes.'}
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

              {statusAction === 'inactivate' && statusImpact && !statusImpactLoading ? (
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
                    {statusImpact.ownedSamples === 0 &&
                    statusImpact.activeMovements === 0 &&
                    statusImpact.activeUnits === 0 ? (
                      <li>Nenhum vinculo ativo encontrado.</li>
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

              <div className="app-modal-actions">
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
                      ? 'Confirmar inativacao'
                      : 'Confirmar reativacao'}
                </button>
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={closeStatusModal}
                  disabled={savingStatus}
                >
                  Cancelar
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
            className="app-modal"
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

      {/* ========== MODAL: Sale Filters ========== */}
      {saleFiltersOpen ? (
        <div
          className="app-modal-backdrop samples-filter-modal-backdrop"
          onClick={() => setSaleFiltersOpen(false)}
        >
          <section
            ref={saleFiltersTrapRef}
            className="app-modal samples-filter-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-filter-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="app-modal-header samples-filter-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="sale-filter-modal-title" className="app-modal-title">
                  Filtros
                </h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={() => setSaleFiltersOpen(false)}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <form
              className="samples-filter-modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleApplySaleFilters();
              }}
            >
              <div className="samples-filter-modal-content">
                <div className="samples-filter-fields">
                  <label className="samples-filter-field">
                    <span className="samples-filter-field-label">Comprador</span>
                    <input
                      className="samples-filter-field-input"
                      value={saleDraftFilters.buyer}
                      onChange={(e) =>
                        setSaleDraftFilters((c) => ({ ...c, buyer: e.target.value }))
                      }
                      placeholder="Nome do comprador"
                    />
                  </label>

                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Status comercial</span>
                    <div className="samples-filter-chip-row">
                      {COMMERCIAL_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`samples-filter-chip${saleDraftFilters.commercialStatus === opt.value ? ' is-selected' : ''}`}
                          onClick={() =>
                            setSaleDraftFilters((c) => ({
                              ...c,
                              commercialStatus: c.commercialStatus === opt.value ? '' : opt.value,
                            }))
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Safra</span>
                    <div className="samples-filter-chip-row">
                      {HARVEST_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={`samples-filter-chip${saleDraftFilters.harvest === opt ? ' is-selected' : ''}`}
                          onClick={() =>
                            setSaleDraftFilters((c) => ({
                              ...c,
                              harvest: c.harvest === opt ? '' : opt,
                            }))
                          }
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Sacas</span>
                    <div className="samples-filter-split-grid">
                      <input
                        className="samples-filter-field-input"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={saleDraftFilters.sacksMin}
                        onChange={(e) =>
                          setSaleDraftFilters((c) => ({
                            ...c,
                            sacksMin: e.target.value.replace(/\D+/g, ''),
                          }))
                        }
                        placeholder="De"
                      />
                      <input
                        className="samples-filter-field-input"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={saleDraftFilters.sacksMax}
                        onChange={(e) =>
                          setSaleDraftFilters((c) => ({
                            ...c,
                            sacksMax: e.target.value.replace(/\D+/g, ''),
                          }))
                        }
                        placeholder="Ate"
                      />
                    </div>
                  </div>

                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Periodo</span>
                    <div className="samples-filter-split-grid">
                      <select
                        className="samples-filter-field-input"
                        value={saleDraftFilters.periodMode}
                        onChange={(e) =>
                          setSaleDraftFilters((c) => ({
                            ...c,
                            periodMode: e.target.value as 'exact' | 'month' | 'year',
                            periodValue: '',
                          }))
                        }
                      >
                        <option value="exact">Data</option>
                        <option value="month">Mes</option>
                        <option value="year">Ano</option>
                      </select>
                      <input
                        className="samples-filter-field-input"
                        type={
                          saleDraftFilters.periodMode === 'exact'
                            ? 'date'
                            : saleDraftFilters.periodMode === 'month'
                              ? 'month'
                              : 'number'
                        }
                        value={saleDraftFilters.periodValue}
                        onChange={(e) =>
                          setSaleDraftFilters((c) => ({ ...c, periodValue: e.target.value }))
                        }
                        placeholder={saleDraftFilters.periodMode === 'year' ? 'AAAA' : ''}
                        min={saleDraftFilters.periodMode === 'year' ? '2000' : undefined}
                        max={saleDraftFilters.periodMode === 'year' ? '2100' : undefined}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="app-modal-actions samples-filter-modal-actions">
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={handleClearSaleFilters}
                  disabled={!Object.values(saleDraftFilters).some((v) => v !== '' && v !== 'exact')}
                >
                  Limpar
                </button>
                <button type="submit" className="app-modal-submit">
                  Aplicar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {/* ========== MODAL: Purchase Filters ========== */}
      {purchaseFiltersOpen ? (
        <div
          className="app-modal-backdrop samples-filter-modal-backdrop"
          onClick={() => setPurchaseFiltersOpen(false)}
        >
          <section
            ref={purchaseFiltersTrapRef}
            className="app-modal samples-filter-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-filter-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="app-modal-header samples-filter-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="purchase-filter-modal-title" className="app-modal-title">
                  Filtros
                </h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={() => setPurchaseFiltersOpen(false)}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <form
              className="samples-filter-modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleApplyPurchaseFilters();
              }}
            >
              <div className="samples-filter-modal-content">
                <div className="samples-filter-fields">
                  <label className="samples-filter-field">
                    <span className="samples-filter-field-label">Proprietario</span>
                    <input
                      className="samples-filter-field-input"
                      value={purchaseDraftFilters.owner}
                      onChange={(e) =>
                        setPurchaseDraftFilters((c) => ({ ...c, owner: e.target.value }))
                      }
                      placeholder="Nome do proprietario"
                    />
                  </label>

                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Sacas</span>
                    <div className="samples-filter-split-grid">
                      <input
                        className="samples-filter-field-input"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={purchaseDraftFilters.sacksMin}
                        onChange={(e) =>
                          setPurchaseDraftFilters((c) => ({
                            ...c,
                            sacksMin: e.target.value.replace(/\D+/g, ''),
                          }))
                        }
                        placeholder="De"
                      />
                      <input
                        className="samples-filter-field-input"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={purchaseDraftFilters.sacksMax}
                        onChange={(e) =>
                          setPurchaseDraftFilters((c) => ({
                            ...c,
                            sacksMax: e.target.value.replace(/\D+/g, ''),
                          }))
                        }
                        placeholder="Ate"
                      />
                    </div>
                  </div>

                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Periodo</span>
                    <div className="samples-filter-split-grid">
                      <select
                        className="samples-filter-field-input"
                        value={purchaseDraftFilters.periodMode}
                        onChange={(e) =>
                          setPurchaseDraftFilters((c) => ({
                            ...c,
                            periodMode: e.target.value as 'exact' | 'month' | 'year',
                            periodValue: '',
                          }))
                        }
                      >
                        <option value="exact">Data</option>
                        <option value="month">Mes</option>
                        <option value="year">Ano</option>
                      </select>
                      <input
                        className="samples-filter-field-input"
                        type={
                          purchaseDraftFilters.periodMode === 'exact'
                            ? 'date'
                            : purchaseDraftFilters.periodMode === 'month'
                              ? 'month'
                              : 'number'
                        }
                        value={purchaseDraftFilters.periodValue}
                        onChange={(e) =>
                          setPurchaseDraftFilters((c) => ({ ...c, periodValue: e.target.value }))
                        }
                        placeholder={purchaseDraftFilters.periodMode === 'year' ? 'AAAA' : ''}
                        min={purchaseDraftFilters.periodMode === 'year' ? '2000' : undefined}
                        max={purchaseDraftFilters.periodMode === 'year' ? '2100' : undefined}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="app-modal-actions samples-filter-modal-actions">
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={handleClearPurchaseFilters}
                  disabled={
                    !Object.values(purchaseDraftFilters).some((v) => v !== '' && v !== 'exact')
                  }
                >
                  Limpar
                </button>
                <button type="submit" className="app-modal-submit">
                  Aplicar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
