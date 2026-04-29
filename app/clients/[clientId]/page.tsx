'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../../components/AppShell';
import { ClientBranchModal } from '../../../components/clients/ClientBranchModal';
import {
  ApiError,
  getClient,
  getClientImpact,
  updateClient,
  inactivateClient,
  reactivateClient,
  createClientBranch,
  updateClientBranch,
  inactivateClientBranch,
  reactivateClientBranch,
  listClientSamples,
  listClientPurchases,
  getClientCommercialSummary,
  lookupUsersForReference,
} from '../../../lib/api-client';
import {
  formatClientDocument,
  formatPhone,
  maskCpfInput,
  maskCnpjInput,
  maskPhoneInput,
} from '../../../lib/client-field-formatters';
import { useFocusTrap } from '../../../lib/use-focus-trap';
import { useRequireAuth } from '../../../lib/use-auth';
import { UserMultiSelect } from '../../../components/users/UserMultiSelect';
import type {
  ClientPersonType,
  ClientBranchSummary,
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
  registrationType: 'Tipo',
  addressLine: 'Endereco',
  district: 'Bairro',
  city: 'Cidade',
  state: 'UF',
  postalCode: 'CEP',
  complement: 'Complemento',
};

function translateBranchError(cause: unknown): string {
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
  const [branches, setBranches] = useState<ClientBranchSummary[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);

  /* ---- notices (6 zones) ---- */
  const [pageNotice, setPageNotice] = useState<Notice>(null);
  const [detailNotice, setDetailNotice] = useState<Notice>(null);
  const [branchNotice, setBranchNotice] = useState<Notice>(null);
  const [editClientModalNotice, setEditClientModalNotice] = useState<Notice>(null);
  const [branchModalNotice, setBranchModalNotice] = useState<Notice>(null);
  const [statusModalNotice, setStatusModalNotice] = useState<Notice>(null);
  const [branchStatusNotice, setBranchStatusNotice] = useState<Notice>(null);

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

  /* ---- branch modal (create + edit) — F6.0: usa ClientBranchModal extraido ---- */
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchModalMode, setBranchModalMode] = useState<'create' | 'edit'>('create');
  const [selectedBranch, setSelectedBranch] = useState<ClientBranchSummary | null>(null);
  const [savingBranch, setSavingBranch] = useState(false);
  const [showInactiveBranches, setShowInactiveBranches] = useState(false);

  /* ---- status modal (inactivate/reactivate client) ---- */
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<'inactivate' | 'reactivate'>('inactivate');
  const [statusReasonText, setStatusReasonText] = useState('');
  const [statusImpact, setStatusImpact] = useState<{
    ownedSamples: number;
    activeMovements: number;
    activeBranches: number;
  } | null>(null);
  const [statusImpactLoading, setStatusImpactLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const statusTrapRef = useFocusTrap(statusModalOpen);

  /* ---- registration status modal (inactivate/reactivate registration) ---- */
  const [branchStatusModalOpen, setBranchStatusModalOpen] = useState(false);
  const [branchStatusAction, setBranchStatusAction] = useState<
    'inactivate' | 'reactivate' | 'promote'
  >('inactivate');
  const [branchStatusBranchId, setBranchStatusBranchId] = useState<string | null>(null);
  const [branchStatusReason, setBranchStatusReason] = useState('');
  const [savingBranchStatus, setSavingBranchStatus] = useState(false);
  const branchStatusTrapRef = useFocusTrap(branchStatusModalOpen);

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
        setBranches(response.branches);
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

  // F6.0: derived branches lists for cards section
  const activeBranchesList = useMemo(
    () => branches.filter((b) => b.status === 'ACTIVE'),
    [branches]
  );
  const inactiveBranchesCount = useMemo(
    () => branches.filter((b) => b.status === 'INACTIVE').length,
    [branches]
  );
  const visibleBranches = useMemo(
    () => (showInactiveBranches ? branches : activeBranchesList),
    [showInactiveBranches, branches, activeBranchesList]
  );
  // Próxima filial ACTIVE não-primary (auto-promote candidate)
  const autoPromoteCandidate = useMemo(
    () => activeBranchesList.find((b) => !b.isPrimary) ?? null,
    [activeBranchesList]
  );

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
        data.legalName = editClientForm.legalName;
        data.tradeName = editClientForm.tradeName || null;
        // F5.2: cnpj agora vive nas branches; updateClient nao aceita cnpj
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
  /*  Branch CRUD handlers (F6.0 — usa ClientBranchModal extraido)    */
  /* ================================================================ */

  function openBranchCreate() {
    setBranchModalMode('create');
    setSelectedBranch(null);
    setBranchModalNotice(null);
    setSavingBranch(false);
    setBranchModalOpen(true);
  }

  function openBranchEdit(branch: ClientBranchSummary) {
    setBranchModalMode('edit');
    setSelectedBranch(branch);
    setBranchModalNotice(null);
    setSavingBranch(false);
    setBranchModalOpen(true);
  }

  function closeBranchModal() {
    if (savingBranch) return;
    setBranchModalOpen(false);
  }

  async function handleBranchSubmit(
    data: import('../../../lib/types').ClientBranchInput,
    reasonText: string | null
  ) {
    if (!session || !clientId) return;
    setSavingBranch(true);
    setBranchModalNotice(null);

    try {
      if (branchModalMode === 'create') {
        await createClientBranch(session, clientId, data);
        setBranchNotice({ kind: 'success', text: 'Filial criada com sucesso.' });
      } else {
        if (!selectedBranch) return;
        await updateClientBranch(session, clientId, selectedBranch.id, {
          ...data,
          reasonText: reasonText ?? '',
        });
        setBranchNotice({ kind: 'success', text: 'Filial atualizada com sucesso.' });
      }
      void fetchData();
      setBranchModalOpen(false);
    } catch (cause) {
      setBranchModalNotice({
        kind: 'error',
        text: translateBranchError(cause),
      });
    } finally {
      setSavingBranch(false);
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
      setStatusModalNotice({
        kind: 'error',
        text: cause instanceof ApiError ? cause.message : 'Falha ao alterar status do cliente.',
      });
    } finally {
      setSavingStatus(false);
    }
  }

  /* ================================================================ */
  /*  Registration status handlers                                    */
  /* ================================================================ */

  function openBranchStatusModal(
    branch: ClientBranchSummary,
    action: 'inactivate' | 'reactivate' | 'promote'
  ) {
    setSelectedBranch(branch);
    setBranchStatusBranchId(branch.id);
    setBranchStatusAction(action);
    setBranchStatusReason('');
    setBranchStatusNotice(null);
    setBranchStatusModalOpen(true);
  }

  function closeBranchStatusModal() {
    if (savingBranchStatus) return;
    setBranchStatusModalOpen(false);
  }

  async function handleBranchStatusSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !clientId || !branchStatusBranchId || branchStatusReason.trim().length === 0)
      return;
    setSavingBranchStatus(true);
    setBranchStatusNotice(null);

    try {
      if (branchStatusAction === 'inactivate') {
        const result = await inactivateClientBranch(
          session,
          clientId,
          branchStatusBranchId,
          branchStatusReason
        );
        const successText = result.autoPromoted
          ? `Filial inativada. ${result.autoPromoted.name ?? `Filial ${result.autoPromoted.code}`} virou a nova matriz.`
          : 'Filial inativada com sucesso.';
        setBranchNotice({ kind: 'success', text: successText });
      } else if (branchStatusAction === 'reactivate') {
        await reactivateClientBranch(session, clientId, branchStatusBranchId, branchStatusReason);
        setBranchNotice({ kind: 'success', text: 'Filial reativada com sucesso.' });
      } else {
        // promote: usa updateClientBranch com isPrimary=true
        await updateClientBranch(session, clientId, branchStatusBranchId, {
          isPrimary: true,
          reasonText: branchStatusReason,
        });
        setBranchNotice({ kind: 'success', text: 'Nova matriz definida com sucesso.' });
      }

      setBranchStatusModalOpen(false);
      void fetchData();
    } catch (cause) {
      setBranchStatusNotice({
        kind: 'error',
        text: cause instanceof ApiError ? cause.message : 'Falha ao alterar status da inscricao.',
      });
    } finally {
      setSavingBranchStatus(false);
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
                          <circle cx="12" cy="12" r="8" />
                          <path d="m8.6 15.4 6.8-6.8" />
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
                    {/* Card: Informações */}
                    <div className="sdv-card sdv-info-compact">
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
                          <span className="sdv-info-label">
                            {client.personType === 'PF' ? 'CPF' : 'CNPJ'}
                          </span>
                          <span className="sdv-info-value">
                            {client.personType === 'PF'
                              ? formatClientDocument(client.cpf, 'PF') || '\u2014'
                              : formatClientDocument(client.cnpj, 'PJ') || '\u2014'}
                          </span>
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
                        <div className="sdv-info-sep" />
                        <div className="sdv-info-item is-full">
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
                      </div>
                      <button
                        type="button"
                        className="sdv-edit-btn sdv-edit-btn-inline"
                        onClick={openEditClient}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                        </svg>
                        <span>Editar informacoes</span>
                      </button>
                      <NoticeSlot notice={detailNotice} />
                    </div>

                    {/* Card: Filiais (F6.0) */}
                    <div className="sdv-card">
                      <div className="sdv-card-header">
                        <span className="sdv-card-title">
                          Filiais ({visibleBranches.length}
                          {inactiveBranchesCount > 0
                            ? ` · ${inactiveBranchesCount} inativa(s)`
                            : ''}
                          )
                        </span>
                        <button type="button" className="sdv-edit-btn" onClick={openBranchCreate}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 5v14" />
                            <path d="M5 12h14" />
                          </svg>
                          <span>Nova filial</span>
                        </button>
                      </div>

                      {client.personType === 'PJ' && activeBranchesList.length === 0 ? (
                        <div className="sdv-banner sdv-banner-warn">
                          <strong>Esta empresa ainda não tem matriz configurada.</strong>
                          <p>Adicione uma filial para começar a registrar amostras.</p>
                        </div>
                      ) : null}

                      {branches.length === 0 ? (
                        <div className="spv2-empty client-detail-empty-compact">
                          <p className="spv2-empty-text">Nenhuma filial cadastrada</p>
                        </div>
                      ) : (
                        <div className="sdv-branch-list">
                          {visibleBranches.map((branch) => (
                            <div
                              key={branch.id}
                              className={`sdv-branch-card${branch.status === 'INACTIVE' ? ' is-inactive' : ''}${branch.isPrimary ? ' is-primary' : ''}`}
                            >
                              <div className="sdv-branch-card-header">
                                <span
                                  className={`sdv-branch-badge ${branch.isPrimary ? 'is-primary' : 'is-filial'}`}
                                >
                                  {branch.isPrimary ? 'Matriz' : `Filial ${branch.code}`}
                                </span>
                                {branch.status === 'INACTIVE' ? (
                                  <span className="sdv-branch-badge is-inactive">Inativa</span>
                                ) : null}
                                <span className="sdv-branch-name">
                                  {branch.name ?? branch.legalName ?? 'Sem nome'}
                                </span>
                              </div>
                              <div className="sdv-branch-card-body">
                                {branch.cnpj ? (
                                  <div>
                                    <span className="sdv-branch-label">CNPJ:</span> {branch.cnpj}
                                  </div>
                                ) : null}
                                {branch.city && branch.state ? (
                                  <div>
                                    <span className="sdv-branch-label">Local:</span> {branch.city}/
                                    {branch.state}
                                  </div>
                                ) : null}
                                {branch.registrationNumber ? (
                                  <div>
                                    <span className="sdv-branch-label">IE:</span>{' '}
                                    {branch.registrationNumber}
                                    {branch.registrationType ? ` (${branch.registrationType})` : ''}
                                  </div>
                                ) : null}
                              </div>
                              <div className="sdv-branch-card-actions">
                                <button
                                  type="button"
                                  className="sdv-edit-btn-small"
                                  onClick={() => openBranchEdit(branch)}
                                  disabled={savingBranch}
                                >
                                  Editar
                                </button>
                                {!branch.isPrimary && branch.status === 'ACTIVE' ? (
                                  <button
                                    type="button"
                                    className="sdv-edit-btn-small"
                                    onClick={() => openBranchStatusModal(branch, 'promote')}
                                    disabled={savingBranchStatus}
                                  >
                                    Tornar matriz
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className={`sdv-edit-btn-small${branch.status === 'ACTIVE' ? ' is-danger' : ''}`}
                                  onClick={() =>
                                    openBranchStatusModal(
                                      branch,
                                      branch.status === 'ACTIVE' ? 'inactivate' : 'reactivate'
                                    )
                                  }
                                  disabled={savingBranchStatus}
                                >
                                  {branch.status === 'ACTIVE' ? 'Inativar' : 'Reativar'}
                                </button>
                              </div>
                            </div>
                          ))}

                          {inactiveBranchesCount > 0 ? (
                            <button
                              type="button"
                              className="sdv-edit-btn-small"
                              onClick={() => setShowInactiveBranches((v) => !v)}
                            >
                              {showInactiveBranches
                                ? 'Esconder inativas'
                                : `Mostrar ${inactiveBranchesCount} inativa(s)`}
                            </button>
                          ) : null}
                        </div>
                      )}
                      <NoticeSlot notice={branchNotice} />
                    </div>
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

      {/* ========== MODAL 2: Create/Edit Branch (F6.0) ========== */}
      <ClientBranchModal
        open={branchModalOpen}
        mode={branchModalMode}
        branch={selectedBranch}
        saving={savingBranch}
        errorMessage={branchModalNotice?.kind === 'error' ? branchModalNotice.text : null}
        onClose={closeBranchModal}
        onSubmit={handleBranchSubmit}
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
                    {statusImpact.activeBranches > 0 ? (
                      <li>{statusImpact.activeBranches} filial(is) ativa(s)</li>
                    ) : null}
                    {statusImpact.ownedSamples === 0 &&
                    statusImpact.activeMovements === 0 &&
                    statusImpact.activeBranches === 0 ? (
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

      {/* ========== MODAL 4: Inactivate/Reactivate/Promote Branch (F6.0) ========== */}
      {branchStatusModalOpen ? (
        <div className="app-modal-backdrop">
          <section
            ref={branchStatusTrapRef}
            className="app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="branch-status-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="branch-status-modal-title" className="app-modal-title">
                  {branchStatusAction === 'inactivate'
                    ? 'Inativar filial'
                    : branchStatusAction === 'reactivate'
                      ? 'Reativar filial'
                      : 'Tornar matriz'}
                </h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={closeBranchStatusModal}
                disabled={savingBranchStatus}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <form className="app-modal-content" onSubmit={handleBranchStatusSubmit}>
              {/* Aviso para promover a matriz (B1) */}
              {branchStatusAction === 'promote' && selectedBranch ? (
                <div className="sdv-banner sdv-banner-info">
                  <strong>
                    {activeBranchesList.find((b) => b.isPrimary)?.name ??
                      `Filial ${activeBranchesList.find((b) => b.isPrimary)?.code}`}
                  </strong>{' '}
                  vai virar uma filial comum.{' '}
                  <strong>{selectedBranch.name ?? `Filial ${selectedBranch.code}`}</strong> vira a
                  nova matriz desta empresa.
                </div>
              ) : null}

              {/* Aviso para inativar a matriz (3B) */}
              {branchStatusAction === 'inactivate' && selectedBranch?.isPrimary ? (
                <div className="sdv-banner sdv-banner-warn">
                  <strong>Atenção:</strong> esta é a matriz desta empresa.{' '}
                  {autoPromoteCandidate ? (
                    <>
                      Ao inativar,{' '}
                      <strong>
                        {autoPromoteCandidate.name ?? `Filial ${autoPromoteCandidate.code}`}
                      </strong>{' '}
                      vai virar a nova matriz automaticamente.
                    </>
                  ) : (
                    <>Esta empresa ficará sem matriz cadastrada até você reativar uma filial.</>
                  )}
                </div>
              ) : null}

              <label className="app-modal-field">
                <span className="app-modal-label">Motivo</span>
                <input
                  className="app-modal-input"
                  value={branchStatusReason}
                  disabled={savingBranchStatus}
                  onChange={(e) => setBranchStatusReason(e.target.value.toUpperCase())}
                  placeholder="Informe o motivo"
                />
              </label>

              <NoticeSlot notice={branchStatusNotice} />

              <div className="app-modal-actions">
                <button
                  type="submit"
                  className="app-modal-submit"
                  disabled={savingBranchStatus || branchStatusReason.trim().length === 0}
                >
                  {savingBranchStatus
                    ? 'Processando...'
                    : branchStatusAction === 'inactivate'
                      ? 'Confirmar inativação'
                      : branchStatusAction === 'reactivate'
                        ? 'Confirmar reativação'
                        : 'Tornar matriz'}
                </button>
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={closeBranchStatusModal}
                  disabled={savingBranchStatus}
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
