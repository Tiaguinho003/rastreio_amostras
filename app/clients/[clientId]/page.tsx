'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../../components/AppShell';
import {
  ApiError,
  getClient,
  getClientImpact,
  updateClient,
  inactivateClient,
  reactivateClient,
  createClientRegistration,
  updateClientRegistration,
  inactivateClientRegistration,
  reactivateClientRegistration,
  listClientSamples,
  listClientPurchases,
  getClientCommercialSummary
} from '../../../lib/api-client';
import {
  formatClientDocument,
  formatPhone,
  maskCpfInput,
  maskCnpjInput,
  maskPhoneInput
} from '../../../lib/client-field-formatters';
import { useFocusTrap } from '../../../lib/use-focus-trap';
import { useRequireAuth } from '../../../lib/use-auth';
import type { ClientPersonType, ClientRegistrationSummary, ClientSummary, ClientSampleItem, ClientPurchaseItem, ClientCommercialSummary } from '../../../lib/types';

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
    reasonText: ''
  };
}

function blankRegistrationForm() {
  return {
    registrationNumber: '',
    registrationType: '',
    addressLine: '',
    district: '',
    city: '',
    state: 'MG',
    postalCode: '',
    complement: '',
    reasonText: ''
  };
}

function registrationToForm(reg: ClientRegistrationSummary) {
  return {
    registrationNumber: reg.registrationNumber,
    registrationType: reg.registrationType,
    addressLine: reg.addressLine,
    district: reg.district,
    city: reg.city,
    state: reg.state,
    postalCode: reg.postalCode,
    complement: reg.complement ?? '',
    reasonText: ''
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
    case 'OPEN': return 'is-commercial-status-open';
    case 'PARTIALLY_SOLD': return 'is-commercial-status-partial';
    case 'SOLD': return 'is-commercial-status-sold';
    case 'LOST': return 'is-commercial-status-lost';
    default: return '';
  }
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export default function ClientDetailPage() {
  /* ---- auth & params ---- */
  const { session, loading, logout } = useRequireAuth();
  const params = useParams<{ clientId: string }>();
  const clientId = typeof params.clientId === 'string' ? params.clientId : '';

  /* ---- data ---- */
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [registrations, setRegistrations] = useState<ClientRegistrationSummary[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);

  /* ---- notices (6 zones) ---- */
  const [pageNotice, setPageNotice] = useState<Notice>(null);
  const [detailNotice, setDetailNotice] = useState<Notice>(null);
  const [registrationNotice, setRegistrationNotice] = useState<Notice>(null);
  const [editClientModalNotice, setEditClientModalNotice] = useState<Notice>(null);
  const [registrationModalNotice, setRegistrationModalNotice] = useState<Notice>(null);
  const [statusModalNotice, setStatusModalNotice] = useState<Notice>(null);
  const [regStatusNotice, setRegStatusNotice] = useState<Notice>(null);

  /* ---- edit client modal ---- */
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editClientSuccess, setEditClientSuccess] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);
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
      status: 'ACTIVE'
    } as unknown as ClientSummary)
  );
  const [savingClient, setSavingClient] = useState(false);
  const editClientTrapRef = useFocusTrap(editClientOpen);

  /* ---- registration modal (create + edit) ---- */
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [regModalMode, setRegModalMode] = useState<'create' | 'edit'>('create');
  const [regForm, setRegForm] = useState(blankRegistrationForm());
  const [selectedRegId, setSelectedRegId] = useState<string | null>(null);
  const [savingReg, setSavingReg] = useState(false);
  const regTrapRef = useFocusTrap(regModalOpen);

  /* ---- status modal (inactivate/reactivate client) ---- */
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<'inactivate' | 'reactivate'>('inactivate');
  const [statusReasonText, setStatusReasonText] = useState('');
  const [statusImpact, setStatusImpact] = useState<{
    ownedSamples: number;
    activeMovements: number;
    activeRegistrations: number;
  } | null>(null);
  const [statusImpactLoading, setStatusImpactLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const statusTrapRef = useFocusTrap(statusModalOpen);

  /* ---- registration status modal (inactivate/reactivate registration) ---- */
  const [regStatusModalOpen, setRegStatusModalOpen] = useState(false);
  const [regStatusAction, setRegStatusAction] = useState<'inactivate' | 'reactivate'>('inactivate');
  const [regStatusRegId, setRegStatusRegId] = useState<string | null>(null);
  const [regStatusReasonText, setRegStatusReasonText] = useState('');
  const [savingRegStatus, setSavingRegStatus] = useState(false);
  const regStatusTrapRef = useFocusTrap(regStatusModalOpen);

  /* ---- commercial tab ---- */
  const [clientSection, setClientSection] = useState<ClientDetailSection>('GENERAL');
  const [commercialSubTab, setCommercialSubTab] = useState<CommercialSubTab>('SALE');
  const [commercialSummary, setCommercialSummary] = useState<ClientCommercialSummary | null>(null);
  const [commercialSummaryLoading, setCommercialSummaryLoading] = useState(false);
  const [ownerSamples, setOwnerSamples] = useState<ClientSampleItem[]>([]);
  const [ownerSamplesPage, setOwnerSamplesPage] = useState(1);
  const [ownerSamplesMeta, setOwnerSamplesMeta] = useState<{ total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null);
  const [ownerSamplesLoading, setOwnerSamplesLoading] = useState(false);
  const [buyerPurchases, setBuyerPurchases] = useState<ClientPurchaseItem[]>([]);
  const [buyerPurchasesPage, setBuyerPurchasesPage] = useState(1);
  const [buyerPurchasesMeta, setBuyerPurchasesMeta] = useState<{ total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null);
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
    periodValue: ''
  });
  const [saleAppliedFilters, setSaleAppliedFilters] = useState({
    buyer: '',
    commercialStatus: '',
    harvest: '',
    sacksMin: '',
    sacksMax: '',
    periodMode: 'exact' as 'exact' | 'month' | 'year',
    periodValue: ''
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
    periodValue: ''
  });
  const [purchaseAppliedFilters, setPurchaseAppliedFilters] = useState({
    owner: '',
    sacksMin: '',
    sacksMax: '',
    periodMode: 'exact' as 'exact' | 'month' | 'year',
    periodValue: ''
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
        setRegistrations(response.registrations);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setPageNotice({
          kind: 'error',
          text: cause instanceof ApiError ? cause.message : 'Falha ao carregar cliente.'
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
        periodValue: saleAppliedFilters.periodValue || undefined
      });
      setOwnerSamples(response.items);
      setOwnerSamplesMeta({ total: response.page.total, totalPages: response.page.totalPages, hasNext: response.page.hasNext, hasPrev: response.page.hasPrev });
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
        periodMode: purchaseAppliedFilters.periodValue ? purchaseAppliedFilters.periodMode : undefined,
        periodValue: purchaseAppliedFilters.periodValue || undefined
      });
      setBuyerPurchases(response.items);
      setBuyerPurchasesMeta({ total: response.page.total, totalPages: response.page.totalPages, hasNext: response.page.hasNext, hasPrev: response.page.hasPrev });
      setBuyerPurchasesPage(page);
    } catch {
      setBuyerPurchases([]);
      setBuyerPurchasesMeta(null);
    } finally {
      setBuyerPurchasesLoading(false);
    }
  }

  /* ---- lazy‑load commercial data ---- */
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [clientSection, client]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (clientSection !== 'COMMERCIAL' || !commercialFetchedRef.current || !client) return;
    if (commercialSubTab === 'SALE' && ownerSamples.length === 0 && !ownerSamplesLoading && client.isSeller) {
      void fetchOwnerSamples(1);
    }
    if (commercialSubTab === 'PURCHASE' && buyerPurchases.length === 0 && !buyerPurchasesLoading && client.isBuyer) {
      void fetchBuyerPurchases(1);
    }
  }, [commercialSubTab]);

  /* ---- sale search debounce ---- */
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return () => { if (saleSearchDebounceRef.current !== null) { window.clearTimeout(saleSearchDebounceRef.current); saleSearchDebounceRef.current = null; } };
  }, [saleSearch, clientSection, commercialSubTab, saleAppliedSearch]);

  /* ---- re-fetch when applied search/filters change ---- */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (clientSection !== 'COMMERCIAL' || commercialSubTab !== 'SALE' || !commercialFetchedRef.current) return;
    void fetchOwnerSamples(1);
  }, [saleAppliedSearch, saleAppliedFilters]);

  /* ---- purchase search debounce ---- */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (clientSection !== 'COMMERCIAL' || commercialSubTab !== 'PURCHASE') return;
    if (purchaseSearchDebounceRef.current !== null) window.clearTimeout(purchaseSearchDebounceRef.current);
    const trimmed = purchaseSearch.trim();
    if (trimmed === purchaseAppliedSearch) return;
    purchaseSearchDebounceRef.current = window.setTimeout(() => {
      purchaseSearchDebounceRef.current = null;
      setPurchaseAppliedSearch(trimmed);
      setBuyerPurchasesPage(1);
    }, 400);
    return () => { if (purchaseSearchDebounceRef.current !== null) { window.clearTimeout(purchaseSearchDebounceRef.current); purchaseSearchDebounceRef.current = null; } };
  }, [purchaseSearch, clientSection, commercialSubTab, purchaseAppliedSearch]);

  /* ---- re-fetch when applied purchase search/filters change ---- */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (clientSection !== 'COMMERCIAL' || commercialSubTab !== 'PURCHASE' || !commercialFetchedRef.current) return;
    void fetchBuyerPurchases(1);
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
    { value: 'LOST', label: 'Perdido' }
  ];

  const HARVEST_OPTIONS = ['24/25', '25/26', '26/27'];

  const saleActiveFiltersCount = [
    saleAppliedFilters.buyer,
    saleAppliedFilters.commercialStatus,
    saleAppliedFilters.harvest,
    saleAppliedFilters.sacksMin || saleAppliedFilters.sacksMax,
    saleAppliedFilters.periodValue
  ].filter(Boolean).length;

  function handleApplySaleFilters() {
    setSaleAppliedFilters({ ...saleDraftFilters });
    setOwnerSamplesPage(1);
    setSaleFiltersOpen(false);
  }

  function handleClearSaleFilters() {
    const empty = { buyer: '', commercialStatus: '', harvest: '', sacksMin: '', sacksMax: '', periodMode: 'exact' as const, periodValue: '' };
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
    purchaseAppliedFilters.periodValue
  ].filter(Boolean).length;

  function handleApplyPurchaseFilters() {
    setPurchaseAppliedFilters({ ...purchaseDraftFilters });
    setBuyerPurchasesPage(1);
    setPurchaseFiltersOpen(false);
  }

  function handleClearPurchaseFilters() {
    const empty = { owner: '', sacksMin: '', sacksMax: '', periodMode: 'exact' as const, periodValue: '' };
    setPurchaseDraftFilters(empty);
    setPurchaseAppliedFilters(empty);
    setBuyerPurchasesPage(1);
    setPurchaseFiltersOpen(false);
  }

  /* ================================================================ */
  /*  Validation                                                      */
  /* ================================================================ */

  const canSaveClient = useMemo(() => {
    if (!editClientForm.isBuyer && !editClientForm.isSeller) return false;
    if (editClientForm.personType === 'PF')
      return editClientForm.fullName.trim().length > 0 && editClientForm.cpf.trim().length > 0;
    return editClientForm.legalName.trim().length > 0 && editClientForm.cnpj.trim().length > 0;
  }, [editClientForm]);

  const canSaveReg = useMemo(
    () =>
      regForm.registrationNumber.trim().length > 0 &&
      regForm.registrationType.trim().length > 0 &&
      regForm.addressLine.trim().length > 0 &&
      regForm.district.trim().length > 0 &&
      regForm.city.trim().length > 0 &&
      regForm.state.trim().length > 0 &&
      regForm.postalCode.trim().length > 0,
    [regForm]
  );

  /* ================================================================ */
  /*  Edit client handlers                                            */
  /* ================================================================ */

  function openEditClient() {
    if (!client) return;
    setEditClientForm(clientSummaryToForm(client));
    setEditClientModalNotice(null);
    setEditClientOpen(true);
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
        reasonText: editClientForm.reasonText
      };

      if (editClientForm.personType === 'PF') {
        data.fullName = editClientForm.fullName;
        data.cpf = editClientForm.cpf.replace(/\D/g, '');
      } else {
        data.legalName = editClientForm.legalName;
        data.tradeName = editClientForm.tradeName || null;
        data.cnpj = editClientForm.cnpj.replace(/\D/g, '');
      }

      if (editClientForm.phone.replace(/\D/g, '').length > 0) {
        data.phone = editClientForm.phone.replace(/\D/g, '');
      } else {
        data.phone = null;
      }

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
        text: cause instanceof ApiError ? cause.message : 'Falha ao atualizar cliente.'
      });
    } finally {
      setSavingClient(false);
    }
  }

  /* ================================================================ */
  /*  Registration CRUD handlers                                      */
  /* ================================================================ */

  function openRegCreate() {
    setRegModalMode('create');
    setRegForm(blankRegistrationForm());
    setSelectedRegId(null);
    setRegistrationModalNotice(null);
    setRegModalOpen(true);
  }

  function openRegEdit(reg: ClientRegistrationSummary) {
    setRegModalMode('edit');
    setRegForm(registrationToForm(reg));
    setSelectedRegId(reg.id);
    setRegistrationModalNotice(null);
    setRegModalOpen(true);
  }

  function closeRegModal() {
    if (savingReg) return;
    setRegModalOpen(false);
  }

  async function handleRegSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !clientId || !canSaveReg) return;
    setSavingReg(true);
    setRegistrationModalNotice(null);

    try {
      const payload = {
        registrationNumber: regForm.registrationNumber,
        registrationType: regForm.registrationType,
        addressLine: regForm.addressLine,
        district: regForm.district,
        city: regForm.city,
        state: regForm.state,
        postalCode: regForm.postalCode,
        complement: regForm.complement || null
      };

      if (regModalMode === 'create') {
        await createClientRegistration(session, clientId, payload);
      } else {
        if (!selectedRegId) return;
        await updateClientRegistration(session, clientId, selectedRegId, {
          ...payload,
          reasonText: regForm.reasonText
        });
      }

      setRegSuccess(true);
      void fetchData();
      window.setTimeout(() => {
        setRegModalOpen(false);
        setRegSuccess(false);
      }, 1000);
    } catch (cause) {
      setRegistrationModalNotice({
        kind: 'error',
        text: cause instanceof ApiError ? cause.message : 'Falha ao salvar inscricao.'
      });
    } finally {
      setSavingReg(false);
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
            text: cause instanceof ApiError ? cause.message : 'Falha ao verificar impacto.'
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
        text: cause instanceof ApiError ? cause.message : 'Falha ao alterar status do cliente.'
      });
    } finally {
      setSavingStatus(false);
    }
  }

  /* ================================================================ */
  /*  Registration status handlers                                    */
  /* ================================================================ */

  function openRegStatusModal(reg: ClientRegistrationSummary, action: 'inactivate' | 'reactivate') {
    setRegStatusRegId(reg.id);
    setRegStatusAction(action);
    setRegStatusReasonText('');
    setRegStatusNotice(null);
    setRegStatusModalOpen(true);
  }

  function closeRegStatusModal() {
    if (savingRegStatus) return;
    setRegStatusModalOpen(false);
  }

  async function handleRegStatusSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !clientId || !regStatusRegId || regStatusReasonText.trim().length === 0) return;
    setSavingRegStatus(true);
    setRegStatusNotice(null);

    try {
      if (regStatusAction === 'inactivate') {
        await inactivateClientRegistration(session, clientId, regStatusRegId, regStatusReasonText);
        setRegistrationNotice({ kind: 'success', text: 'Inscricao inativada com sucesso.' });
      } else {
        await reactivateClientRegistration(session, clientId, regStatusRegId, regStatusReasonText);
        setRegistrationNotice({ kind: 'success', text: 'Inscricao reativada com sucesso.' });
      }

      setRegStatusModalOpen(false);
      void fetchData();
    } catch (cause) {
      setRegStatusNotice({
        kind: 'error',
        text: cause instanceof ApiError ? cause.message : 'Falha ao alterar status da inscricao.'
      });
    } finally {
      setSavingRegStatus(false);
    }
  }

  /* ================================================================ */
  /*  Guard: loading / unauthenticated                                */
  /* ================================================================ */

  if (loading || !session) return null;

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="client-detail-page">
        {loadingPage ? (
          <p style={{ margin: 0, color: 'var(--muted)' }}>Carregando cliente...</p>
        ) : null}

        {!loadingPage && client ? (
          <div className="stack client-detail-page-shell">
            {/* ========== TOP BAR ========== */}
            <div className="client-detail-top-bar">
              <Link
                href="/samples?mode=clients"
                className="sample-detail-back-button"
                aria-label="Voltar"
                title="Voltar"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </Link>

              <section className="client-detail-hero-panel">
                <div className="client-detail-hero-main">
                  <span
                    className={`client-detail-hero-status-line is-${getStatusTone(client.status)}`}
                    aria-hidden="true"
                  />
                  <div className="client-detail-hero-text">
                    <h2 style={{ margin: 0 }}>{client.displayName ?? 'Cliente'}</h2>
                    <p style={{ margin: 0 }}>
                      Codigo {client.code} · {getStatusLabel(client.status)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className={`client-detail-hero-action ${client.status === 'ACTIVE' ? 'is-danger' : 'is-reactivate'}`}
                  onClick={() =>
                    openStatusModal(client.status === 'ACTIVE' ? 'inactivate' : 'reactivate')
                  }
                  aria-label={
                    client.status === 'ACTIVE' ? 'Inativar cliente' : 'Reativar cliente'
                  }
                  title={client.status === 'ACTIVE' ? 'Inativar cliente' : 'Reativar cliente'}
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
              </section>
            </div>

            <NoticeSlot notice={pageNotice} />

            {/* ========== TAB HEADER ========== */}
            <div className="sample-detail-info-switch-header client-detail-tab-header sample-detail-info-switch-floating" role="tablist" aria-label="Secoes do cliente">
              <button
                type="button"
                role="tab"
                aria-selected={clientSection === 'GENERAL'}
                className={clientSection === 'GENERAL' ? 'sample-detail-info-tab is-active' : 'sample-detail-info-tab'}
                onClick={() => setClientSection('GENERAL')}
              >
                <span className="sample-detail-info-tab-label">Geral</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={clientSection === 'COMMERCIAL'}
                className={clientSection === 'COMMERCIAL' ? 'sample-detail-info-tab is-active' : 'sample-detail-info-tab'}
                onClick={() => setClientSection('COMMERCIAL')}
              >
                <span className="sample-detail-info-tab-label">Comercial</span>
              </button>
            </div>

            <section className="panel stack sample-detail-content-switch sample-detail-content-panel">
              <div className="sample-detail-info-switch-body">

                {clientSection === 'GENERAL' ? (
                  <section className="stack client-detail-general-pane">
                    {/* ========== CLIENT INFO SECTION ========== */}
                    <section className="panel stack client-detail-info-section">
                      <div className="client-detail-section-header">
                        <h3 style={{ margin: 0 }}>Informacoes</h3>
                        <button
                          type="button"
                          className="secondary client-detail-edit-icon-btn"
                          onClick={openEditClient}
                          aria-label="Editar informacoes"
                          title="Editar informacoes"
                        >
                          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                          </svg>
                        </button>
                      </div>

                      <div className="client-detail-info-grid" style={{ flex: 1 }}>
                        {/* Linha 1: Nome (span full) */}
                        <div className="client-detail-info-item is-full">
                          <span className="client-detail-info-label">
                            {client.personType === 'PF' ? 'Nome completo' : 'Razao social'}
                          </span>
                          <span className="client-detail-info-value">
                            {client.personType === 'PF'
                              ? (client.fullName || '\u2014')
                              : (client.legalName || '\u2014')}
                          </span>
                        </div>

                        {/* Linha 2: Tipo + Documento */}
                        <div className="client-detail-info-item is-border-right">
                          <span className="client-detail-info-label">Tipo</span>
                          <span className="client-detail-info-value">
                            {client.personType === 'PF' ? 'Pessoa fisica' : 'Pessoa juridica'}
                          </span>
                        </div>
                        <div className="client-detail-info-item">
                          <span className="client-detail-info-label">
                            {client.personType === 'PF' ? 'CPF' : 'CNPJ'}
                          </span>
                          <span className="client-detail-info-value">
                            {client.personType === 'PF'
                              ? (formatClientDocument(client.cpf, 'PF') || '\u2014')
                              : (formatClientDocument(client.cnpj, 'PJ') || '\u2014')}
                          </span>
                        </div>

                        {/* Linha 3: Papeis + Telefone */}
                        <div className="client-detail-info-item is-border-right" style={{ borderBottom: 0 }}>
                          <span className="client-detail-info-label">Papeis</span>
                          <span className="client-detail-info-value">
                            {[
                              client.isSeller ? 'Vendedor' : null,
                              client.isBuyer ? 'Comprador' : null
                            ].filter(Boolean).join(' / ') || '\u2014'}
                          </span>
                        </div>
                        <div className="client-detail-info-item" style={{ borderBottom: 0 }}>
                          <span className="client-detail-info-label">Telefone</span>
                          <span className="client-detail-info-value">
                            {formatPhone(client.phone) || '\u2014'}
                          </span>
                        </div>
                      </div>

                      <NoticeSlot notice={detailNotice} />
                    </section>

                    {/* ========== REGISTRATIONS SECTION ========== */}
                    <section className="panel stack client-detail-registrations-section">
                      <div className="client-detail-section-header">
                        <h3 style={{ margin: 0 }}>Inscricoes ({registrations.length})</h3>
                        <button
                          type="button"
                          className="secondary client-detail-inline-action"
                          onClick={openRegCreate}
                        >
                          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                            <path d="M12 5v14" />
                            <path d="M5 12h14" />
                          </svg>
                          Nova
                        </button>
                      </div>

                      {registrations.length === 0 ? (
                        <p style={{ margin: 0, color: 'var(--muted)', textAlign: 'center' }}>
                          Nenhuma inscricao cadastrada.
                        </p>
                      ) : (
                        <div className="client-detail-registration-list">
                          {registrations.map((reg) => (
                            <article
                              key={reg.id}
                              className={`client-detail-registration-card${reg.status === 'INACTIVE' ? ' is-inactive' : ''}`}
                            >
                              <div className="client-detail-registration-card-head">
                                <div className="client-detail-registration-card-info">
                                  <strong>{reg.registrationNumber}</strong>
                                  <p
                                    style={{ margin: 0, color: 'var(--muted)', fontSize: '0.78rem' }}
                                  >
                                    {reg.registrationType} · {reg.city}/{reg.state}
                                  </p>
                                </div>
                                <span
                                  className={`client-detail-reg-status-badge is-${reg.status === 'ACTIVE' ? 'active' : 'inactive'}`}
                                >
                                  {reg.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}
                                </span>
                              </div>
                              <div className="client-detail-registration-card-actions">
                                <button
                                  type="button"
                                  className="secondary client-detail-card-btn"
                                  onClick={() => openRegEdit(reg)}
                                  disabled={savingReg}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className={`secondary client-detail-card-btn${reg.status === 'ACTIVE' ? ' is-danger' : ''}`}
                                  onClick={() =>
                                    openRegStatusModal(
                                      reg,
                                      reg.status === 'ACTIVE' ? 'inactivate' : 'reactivate'
                                    )
                                  }
                                  disabled={savingRegStatus}
                                >
                                  {reg.status === 'ACTIVE' ? 'Inativar' : 'Reativar'}
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}

                      <NoticeSlot notice={registrationNotice} />
                    </section>
                  </section>
                ) : null}

                {clientSection === 'COMMERCIAL' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 'clamp(0.72rem, 2.5vw, 1.64rem)', paddingTop: 'clamp(0.38rem, 1.5vw, 0.72rem)' }}>

                    {/* BLOCO 1: Sub-abas (fixo) */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: '0.15rem',
                        padding: '0.14rem',
                        border: '1px solid #d6d2c5',
                        borderRadius: '10px',
                        background: 'linear-gradient(180deg, #f7f4ee 0%, #f0ece3 100%)',
                        flexShrink: 0
                      }}
                    >
                      <button
                        type="button"
                        disabled={!client.isSeller}
                        onClick={() => setCommercialSubTab('SALE')}
                        style={{
                          border: 0,
                          borderRadius: '7px',
                          background: commercialSubTab === 'SALE' ? 'linear-gradient(180deg, #5caa4f 0%, #3e8438 100%)' : 'transparent',
                          color: commercialSubTab === 'SALE' ? '#ffffff' : '#5f6c61',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '0.22rem 0.5rem',
                          lineHeight: 1.2,
                          boxShadow: commercialSubTab === 'SALE' ? '0 3px 8px rgba(45, 89, 42, 0.18)' : 'none',
                          opacity: !client.isSeller ? 0.46 : 1,
                          cursor: !client.isSeller ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Venda
                      </button>
                      <button
                        type="button"
                        disabled={!client.isBuyer}
                        onClick={() => setCommercialSubTab('PURCHASE')}
                        style={{
                          border: 0,
                          borderRadius: '7px',
                          background: commercialSubTab === 'PURCHASE' ? 'linear-gradient(180deg, #5caa4f 0%, #3e8438 100%)' : 'transparent',
                          color: commercialSubTab === 'PURCHASE' ? '#ffffff' : '#5f6c61',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '0.22rem 0.5rem',
                          lineHeight: 1.2,
                          boxShadow: commercialSubTab === 'PURCHASE' ? '0 3px 8px rgba(45, 89, 42, 0.18)' : 'none',
                          opacity: !client.isBuyer ? 0.46 : 1,
                          cursor: !client.isBuyer ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Compra
                      </button>
                    </div>

                    {/* BLOCO 2: Cards de resumo (fixo) */}
                    <div style={{ flexShrink: 0 }}>
                      {commercialSummaryLoading ? (
                        <p style={{ margin: 0, color: 'var(--muted)', textAlign: 'center', fontSize: '0.78rem' }}>Carregando resumo...</p>
                      ) : commercialSummary ? (
                        <div className="client-detail-commercial-summary">
                          {commercialSubTab === 'SALE' ? (
                            <>
                              <div className="client-detail-summary-card is-samples">
                                <span className="client-detail-summary-label">Registradas</span>
                                <strong className="client-detail-summary-value">{commercialSummary.seller.registeredSamples}</strong>
                              </div>
                              <div className="client-detail-summary-card is-sacks">
                                <span className="client-detail-summary-label">Sacas</span>
                                <strong className="client-detail-summary-value">{commercialSummary.seller.totalSacks}</strong>
                              </div>
                              <div className="client-detail-summary-card is-sold">
                                <span className="client-detail-summary-label">Vendidas</span>
                                <strong className="client-detail-summary-value">{commercialSummary.seller.soldSacks}</strong>
                              </div>
                              <div className="client-detail-summary-card is-lost">
                                <span className="client-detail-summary-label">Perdidas</span>
                                <strong className="client-detail-summary-value">{commercialSummary.seller.lostSacks}</strong>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="client-detail-summary-card is-purchases">
                                <span className="client-detail-summary-label">Total de compras</span>
                                <strong className="client-detail-summary-value">{commercialSummary.buyer.totalPurchases}</strong>
                              </div>
                              <div className="client-detail-summary-card is-purchased-sacks">
                                <span className="client-detail-summary-label">Sacas compradas</span>
                                <strong className="client-detail-summary-value">{commercialSummary.buyer.purchasedSacks}</strong>
                              </div>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {/* BLOCO 3: Lista de amostras/compras */}
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {commercialSubTab === 'SALE' ? (
                        <>
                          {/* Topo fixo: busca + filtro */}
                          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
                            <form
                              style={{ flex: 1, display: 'flex' }}
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (saleSearchDebounceRef.current !== null) { window.clearTimeout(saleSearchDebounceRef.current); saleSearchDebounceRef.current = null; }
                                setSaleAppliedSearch(saleSearch.trim());
                                setOwnerSamplesPage(1);
                              }}
                            >
                              <input
                                className="samples-filter-field-input"
                                value={saleSearch}
                                onChange={(e) => setSaleSearch(e.target.value)}
                                placeholder="Buscar por lote"
                                style={{ flex: 1, fontSize: '0.78rem', padding: '0.32rem 0.58rem', borderRadius: '10px' }}
                              />
                            </form>
                            <button
                              type="button"
                              style={{
                                border: '1px solid rgba(183, 203, 179, 0.86)',
                                borderRadius: '999px',
                                padding: '0.28rem',
                                width: '2rem',
                                height: '2rem',
                                display: 'inline-grid',
                                placeItems: 'center',
                                background: saleActiveFiltersCount > 0 ? 'linear-gradient(180deg, #5caa4f 0%, #3e8438 100%)' : 'rgba(255,255,255,0.74)',
                                color: saleActiveFiltersCount > 0 ? '#fff' : '#456050',
                                position: 'relative',
                                flexShrink: 0,
                                cursor: 'pointer'
                              }}
                              onClick={() => { setSaleDraftFilters({ ...saleAppliedFilters }); setSaleFiltersOpen(true); }}
                              aria-label="Filtros"
                            >
                              <svg viewBox="0 0 24 24" style={{ width: '0.88rem', height: '0.88rem', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                                <path d="M4 6h16" /><path d="M7 12h10" /><path d="M10 18h4" />
                              </svg>
                              {saleActiveFiltersCount > 0 ? (
                                <span style={{
                                  position: 'absolute', top: '-0.2rem', right: '-0.2rem',
                                  width: '0.88rem', height: '0.88rem', borderRadius: '999px',
                                  background: '#c94444', color: '#fff', fontSize: '0.52rem', fontWeight: 700,
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                                }}>{saleActiveFiltersCount}</span>
                              ) : null}
                            </button>
                          </div>

                          {/* Meio: lista com scroll */}
                          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            {ownerSamplesLoading ? (
                              <p style={{ margin: 0, color: 'var(--muted)', textAlign: 'center', fontSize: '0.78rem' }}>Carregando amostras...</p>
                            ) : ownerSamples.length === 0 ? (
                              <p style={{ margin: 0, color: 'var(--muted)', textAlign: 'center', fontSize: '0.78rem' }}>Nenhuma amostra encontrada.</p>
                            ) : (
                              <div className="client-detail-commercial-list">
                                {ownerSamples.map((sample) => (
                                  <Link key={sample.id} href={`/samples/${sample.id}`} className={`client-detail-commercial-item ${getCommercialStatusClass(sample.commercialStatus)}`}>
                                    <div className="client-detail-commercial-item-main">
                                      <strong>{sample.internalLotNumber ?? sample.id}</strong>
                                      <span>{sample.declaredOwner ?? '\u2014'} · Safra {sample.declaredHarvest ?? '\u2014'} · {sample.declaredSacks ?? 0} sacas</span>
                                    </div>
                                    <span className="client-detail-commercial-item-date">{formatDate(sample.createdAt)}</span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Fundo fixo: paginação */}
                          <div className="client-detail-commercial-pagination" style={{ flexShrink: 0 }}>
                            <button
                              type="button"
                              disabled={!ownerSamplesMeta?.hasPrev}
                              onClick={() => void fetchOwnerSamples(ownerSamplesPage - 1)}
                              style={{ width: '2rem', height: '2rem', minWidth: '2rem', borderRadius: '999px', padding: 0, display: 'inline-grid', placeItems: 'center', border: '1px solid rgba(112, 133, 98, 0.5)', background: 'rgba(255,255,255,0.74)', color: '#456050' }}
                              aria-label="Pagina anterior"
                            >
                              <svg viewBox="0 0 24 24" style={{ width: '0.92rem', height: '0.92rem', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M15 6 9 12l6 6" /></svg>
                            </button>
                            <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>{ownerSamplesPage} de {ownerSamplesMeta?.totalPages ?? 1}</span>
                            <button
                              type="button"
                              disabled={!ownerSamplesMeta?.hasNext}
                              onClick={() => void fetchOwnerSamples(ownerSamplesPage + 1)}
                              style={{ width: '2rem', height: '2rem', minWidth: '2rem', borderRadius: '999px', padding: 0, display: 'inline-grid', placeItems: 'center', border: '1px solid rgba(112, 133, 98, 0.5)', background: 'rgba(255,255,255,0.74)', color: '#456050' }}
                              aria-label="Proxima pagina"
                            >
                              <svg viewBox="0 0 24 24" style={{ width: '0.92rem', height: '0.92rem', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="m9 6 6 6-6 6" /></svg>
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Topo fixo: busca + filtro */}
                          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
                            <form
                              style={{ flex: 1, display: 'flex' }}
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (purchaseSearchDebounceRef.current !== null) { window.clearTimeout(purchaseSearchDebounceRef.current); purchaseSearchDebounceRef.current = null; }
                                setPurchaseAppliedSearch(purchaseSearch.trim());
                                setBuyerPurchasesPage(1);
                              }}
                            >
                              <input
                                className="samples-filter-field-input"
                                value={purchaseSearch}
                                onChange={(e) => setPurchaseSearch(e.target.value)}
                                placeholder="Buscar por lote"
                                style={{ flex: 1, fontSize: '0.78rem', padding: '0.32rem 0.58rem', borderRadius: '10px' }}
                              />
                            </form>
                            <button
                              type="button"
                              style={{
                                border: '1px solid rgba(183, 203, 179, 0.86)',
                                borderRadius: '999px',
                                padding: '0.28rem',
                                width: '2rem',
                                height: '2rem',
                                display: 'inline-grid',
                                placeItems: 'center',
                                background: purchaseActiveFiltersCount > 0 ? 'linear-gradient(180deg, #5caa4f 0%, #3e8438 100%)' : 'rgba(255,255,255,0.74)',
                                color: purchaseActiveFiltersCount > 0 ? '#fff' : '#456050',
                                position: 'relative',
                                flexShrink: 0,
                                cursor: 'pointer'
                              }}
                              onClick={() => { setPurchaseDraftFilters({ ...purchaseAppliedFilters }); setPurchaseFiltersOpen(true); }}
                              aria-label="Filtros"
                            >
                              <svg viewBox="0 0 24 24" style={{ width: '0.88rem', height: '0.88rem', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                                <path d="M4 6h16" /><path d="M7 12h10" /><path d="M10 18h4" />
                              </svg>
                              {purchaseActiveFiltersCount > 0 ? (
                                <span style={{
                                  position: 'absolute', top: '-0.2rem', right: '-0.2rem',
                                  width: '0.88rem', height: '0.88rem', borderRadius: '999px',
                                  background: '#c94444', color: '#fff', fontSize: '0.52rem', fontWeight: 700,
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                                }}>{purchaseActiveFiltersCount}</span>
                              ) : null}
                            </button>
                          </div>

                          {/* Meio: lista com scroll */}
                          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            {buyerPurchasesLoading ? (
                              <p style={{ margin: 0, color: 'var(--muted)', textAlign: 'center', fontSize: '0.78rem' }}>Carregando compras...</p>
                            ) : buyerPurchases.length === 0 ? (
                              <p style={{ margin: 0, color: 'var(--muted)', textAlign: 'center', fontSize: '0.78rem' }}>Nenhuma compra encontrada.</p>
                            ) : (
                              <div className="client-detail-commercial-list">
                                {buyerPurchases.map((purchase) => (
                                  <Link key={purchase.id} href={`/samples/${purchase.sampleId}`} className="client-detail-commercial-item">
                                    <div className="client-detail-commercial-item-main">
                                      <strong>{purchase.sampleLotNumber ?? purchase.sampleId}</strong>
                                      <span>{purchase.ownerName ?? '\u2014'} · {purchase.quantitySacks} sacas</span>
                                    </div>
                                    <span className="client-detail-commercial-item-date">{formatDate(purchase.movementDate)}</span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Fundo fixo: paginação */}
                          <div className="client-detail-commercial-pagination" style={{ flexShrink: 0 }}>
                            <button
                              type="button"
                              disabled={!buyerPurchasesMeta?.hasPrev}
                              onClick={() => void fetchBuyerPurchases(buyerPurchasesPage - 1)}
                              style={{ width: '2rem', height: '2rem', minWidth: '2rem', borderRadius: '999px', padding: 0, display: 'inline-grid', placeItems: 'center', border: '1px solid rgba(112, 133, 98, 0.5)', background: 'rgba(255,255,255,0.74)', color: '#456050' }}
                              aria-label="Pagina anterior"
                            >
                              <svg viewBox="0 0 24 24" style={{ width: '0.92rem', height: '0.92rem', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M15 6 9 12l6 6" /></svg>
                            </button>
                            <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>{buyerPurchasesPage} de {buyerPurchasesMeta?.totalPages ?? 1}</span>
                            <button
                              type="button"
                              disabled={!buyerPurchasesMeta?.hasNext}
                              onClick={() => void fetchBuyerPurchases(buyerPurchasesPage + 1)}
                              style={{ width: '2rem', height: '2rem', minWidth: '2rem', borderRadius: '999px', padding: 0, display: 'inline-grid', placeItems: 'center', border: '1px solid rgba(112, 133, 98, 0.5)', background: 'rgba(255,255,255,0.74)', color: '#456050' }}
                              aria-label="Proxima pagina"
                            >
                              <svg viewBox="0 0 24 24" style={{ width: '0.92rem', height: '0.92rem', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="m9 6 6 6-6 6" /></svg>
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                  </div>
                ) : null}

              </div>
            </section>
          </div>
        ) : null}

        {!loadingPage && !client ? <NoticeSlot notice={pageNotice} /> : null}
      </section>

      {/* ========== MODAL 1: Edit Client ========== */}
      {editClientOpen ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            if (!savingClient) closeEditClient();
          }}
        >
          <section
            ref={editClientTrapRef}
            className="app-modal client-detail-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-client-title"
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}
          >
            <header className="app-modal-header" style={{ flexShrink: 0 }}>
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
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <svg viewBox="0 0 24 24" style={{ width: '3rem', height: '3rem', fill: 'none', stroke: '#3d9a55', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
            ) : (
            <form className="app-modal-content" onSubmit={handleUpdateClient} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <label className="app-modal-field">
                <span className="app-modal-label">Tipo de pessoa</span>
                <select
                  className="app-modal-input"
                  value={editClientForm.personType}
                  disabled={savingClient}
                  onChange={(e) =>
                    setEditClientForm((c) => ({
                      ...c,
                      personType: e.target.value as ClientPersonType
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
                        setEditClientForm((c) => ({ ...c, fullName: e.target.value }))
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
                        setEditClientForm((c) => ({ ...c, legalName: e.target.value }))
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
                        setEditClientForm((c) => ({ ...c, tradeName: e.target.value }))
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
                          cnpj: maskCnpjInput(e.target.value)
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
                      phone: maskPhoneInput(e.target.value)
                    }))
                  }
                  placeholder="(xx)xxxxx-xxxx"
                />
              </label>

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
                    setEditClientForm((c) => ({ ...c, reasonText: e.target.value }))
                  }
                  placeholder="Opcional"
                />
              </label>

              <NoticeSlot notice={editClientModalNotice} />

              <div className="app-modal-actions" style={{ flexShrink: 0 }}>
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

      {/* ========== MODAL 2: Create/Edit Registration ========== */}
      {regModalOpen ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            if (!savingReg) closeRegModal();
          }}
        >
          <section
            ref={regTrapRef}
            className="app-modal client-detail-reg-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reg-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}
          >
            <header className="app-modal-header" style={{ flexShrink: 0 }}>
              <div className="app-modal-title-wrap">
                <h3 id="reg-modal-title" className="app-modal-title">
                  {regModalMode === 'create' ? 'Nova inscricao' : 'Editar inscricao'}
                </h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={closeRegModal}
                disabled={savingReg || regSuccess}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            {regSuccess ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <svg viewBox="0 0 24 24" style={{ width: '3rem', height: '3rem', fill: 'none', stroke: '#3d9a55', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
            ) : (
            <form className="app-modal-content" onSubmit={handleRegSubmit} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <label className="app-modal-field">
                <span className="app-modal-label">Numero da inscricao</span>
                <input
                  className="app-modal-input"
                  value={regForm.registrationNumber}
                  disabled={savingReg}
                  onChange={(e) =>
                    setRegForm((c) => ({ ...c, registrationNumber: e.target.value }))
                  }
                />
              </label>
              <label className="app-modal-field">
                <span className="app-modal-label">Tipo</span>
                <input
                  className="app-modal-input"
                  value={regForm.registrationType}
                  disabled={savingReg}
                  onChange={(e) =>
                    setRegForm((c) => ({ ...c, registrationType: e.target.value }))
                  }
                  placeholder="Ex: IE, CNAE"
                />
              </label>
              <label className="app-modal-field">
                <span className="app-modal-label">Endereco</span>
                <input
                  className="app-modal-input"
                  value={regForm.addressLine}
                  disabled={savingReg}
                  onChange={(e) =>
                    setRegForm((c) => ({ ...c, addressLine: e.target.value }))
                  }
                />
              </label>
              <div className="client-detail-modal-row">
                <label className="app-modal-field">
                  <span className="app-modal-label">Bairro</span>
                  <input
                    className="app-modal-input"
                    value={regForm.district}
                    disabled={savingReg}
                    onChange={(e) =>
                      setRegForm((c) => ({ ...c, district: e.target.value }))
                    }
                  />
                </label>
                <label className="app-modal-field">
                  <span className="app-modal-label">Cidade</span>
                  <input
                    className="app-modal-input"
                    value={regForm.city}
                    disabled={savingReg}
                    onChange={(e) =>
                      setRegForm((c) => ({ ...c, city: e.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="client-detail-modal-row">
                <label className="app-modal-field">
                  <span className="app-modal-label">UF</span>
                  <input
                    className="app-modal-input"
                    value={regForm.state}
                    maxLength={2}
                    disabled={savingReg}
                    onChange={(e) =>
                      setRegForm((c) => ({ ...c, state: e.target.value.toUpperCase() }))
                    }
                  />
                </label>
                <label className="app-modal-field">
                  <span className="app-modal-label">CEP</span>
                  <input
                    className="app-modal-input"
                    value={regForm.postalCode}
                    disabled={savingReg}
                    onChange={(e) =>
                      setRegForm((c) => ({ ...c, postalCode: e.target.value }))
                    }
                  />
                </label>
              </div>
              <label className="app-modal-field">
                <span className="app-modal-label">Complemento</span>
                <input
                  className="app-modal-input"
                  value={regForm.complement}
                  disabled={savingReg}
                  onChange={(e) =>
                    setRegForm((c) => ({ ...c, complement: e.target.value }))
                  }
                  placeholder="Opcional"
                />
              </label>

              {regModalMode === 'edit' ? (
                <label className="app-modal-field">
                  <span className="app-modal-label">Motivo da edicao (opcional)</span>
                  <input
                    className="app-modal-input"
                    value={regForm.reasonText}
                    disabled={savingReg}
                    onChange={(e) =>
                      setRegForm((c) => ({ ...c, reasonText: e.target.value }))
                    }
                    placeholder="Opcional"
                  />
                </label>
              ) : null}

              <NoticeSlot notice={registrationModalNotice} />

              <div className="app-modal-actions" style={{ flexShrink: 0 }}>
                <button
                  type="submit"
                  className="app-modal-submit"
                  disabled={savingReg || !canSaveReg}
                >
                  {savingReg ? 'Salvando...' : regModalMode === 'create' ? 'Cadastrar' : 'Salvar'}
                </button>
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={closeRegModal}
                  disabled={savingReg}
                >
                  Cancelar
                </button>
              </div>
            </form>
            )}
          </section>
        </div>
      ) : null}

      {/* ========== MODAL 3: Inactivate/Reactivate Client ========== */}
      {statusModalOpen ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            if (!savingStatus) closeStatusModal();
          }}
        >
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
                <p style={{ margin: 0, color: 'var(--muted)' }}>Verificando impacto...</p>
              ) : null}

              {statusAction === 'inactivate' && statusImpact && !statusImpactLoading ? (
                <div className="client-detail-impact-warning">
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    Este cliente possui vinculos ativos:
                  </p>
                  <ul style={{ margin: '0.32rem 0 0', paddingLeft: '1.2rem' }}>
                    {statusImpact.ownedSamples > 0 ? (
                      <li>{statusImpact.ownedSamples} amostra(s) como proprietario</li>
                    ) : null}
                    {statusImpact.activeMovements > 0 ? (
                      <li>
                        {statusImpact.activeMovements} movimentacao(oes) comercial(is)
                      </li>
                    ) : null}
                    {statusImpact.activeRegistrations > 0 ? (
                      <li>{statusImpact.activeRegistrations} inscricao(oes) ativa(s)</li>
                    ) : null}
                    {statusImpact.ownedSamples === 0 &&
                    statusImpact.activeMovements === 0 &&
                    statusImpact.activeRegistrations === 0 ? (
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
                  onChange={(e) => setStatusReasonText(e.target.value)}
                  placeholder="Informe o motivo"
                />
              </label>

              <NoticeSlot notice={statusModalNotice} />

              <div className="app-modal-actions">
                <button
                  type="submit"
                  className="app-modal-submit"
                  disabled={
                    savingStatus ||
                    statusImpactLoading ||
                    statusReasonText.trim().length === 0
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

      {/* ========== MODAL 4: Inactivate/Reactivate Registration ========== */}
      {regStatusModalOpen ? (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            if (!savingRegStatus) closeRegStatusModal();
          }}
        >
          <section
            ref={regStatusTrapRef}
            className="app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reg-status-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="reg-status-modal-title" className="app-modal-title">
                  {regStatusAction === 'inactivate'
                    ? 'Inativar inscricao'
                    : 'Reativar inscricao'}
                </h3>
              </div>
              <button
                type="button"
                className="app-modal-close"
                onClick={closeRegStatusModal}
                disabled={savingRegStatus}
                aria-label="Fechar"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <form className="app-modal-content" onSubmit={handleRegStatusSubmit}>
              <label className="app-modal-field">
                <span className="app-modal-label">Motivo</span>
                <input
                  className="app-modal-input"
                  value={regStatusReasonText}
                  disabled={savingRegStatus}
                  onChange={(e) => setRegStatusReasonText(e.target.value)}
                  placeholder="Informe o motivo"
                />
              </label>

              <NoticeSlot notice={regStatusNotice} />

              <div className="app-modal-actions">
                <button
                  type="submit"
                  className="app-modal-submit"
                  disabled={
                    savingRegStatus || regStatusReasonText.trim().length === 0
                  }
                >
                  {savingRegStatus
                    ? 'Processando...'
                    : regStatusAction === 'inactivate'
                      ? 'Confirmar inativacao'
                      : 'Confirmar reativacao'}
                </button>
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={closeRegStatusModal}
                  disabled={savingRegStatus}
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
        <div className="app-modal-backdrop samples-filter-modal-backdrop" onClick={() => setSaleFiltersOpen(false)}>
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
                <h3 id="sale-filter-modal-title" className="app-modal-title">Filtros</h3>
              </div>
              <button type="button" className="app-modal-close" onClick={() => setSaleFiltersOpen(false)} aria-label="Fechar">
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <form className="samples-filter-modal-form" onSubmit={(e) => { e.preventDefault(); handleApplySaleFilters(); }}>
              <div className="samples-filter-modal-content">
                <div className="samples-filter-fields">
                  <label className="samples-filter-field">
                    <span className="samples-filter-field-label">Comprador</span>
                    <input
                      className="samples-filter-field-input"
                      value={saleDraftFilters.buyer}
                      onChange={(e) => setSaleDraftFilters((c) => ({ ...c, buyer: e.target.value }))}
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
                          onClick={() => setSaleDraftFilters((c) => ({ ...c, commercialStatus: c.commercialStatus === opt.value ? '' : opt.value }))}
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
                          onClick={() => setSaleDraftFilters((c) => ({ ...c, harvest: c.harvest === opt ? '' : opt }))}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Sacas</span>
                    <div className="samples-filter-split-grid">
                      <input className="samples-filter-field-input" type="number" min="1" step="1" inputMode="numeric"
                        value={saleDraftFilters.sacksMin}
                        onChange={(e) => setSaleDraftFilters((c) => ({ ...c, sacksMin: e.target.value.replace(/\D+/g, '') }))}
                        placeholder="De"
                      />
                      <input className="samples-filter-field-input" type="number" min="1" step="1" inputMode="numeric"
                        value={saleDraftFilters.sacksMax}
                        onChange={(e) => setSaleDraftFilters((c) => ({ ...c, sacksMax: e.target.value.replace(/\D+/g, '') }))}
                        placeholder="Ate"
                      />
                    </div>
                  </div>

                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Periodo</span>
                    <div className="samples-filter-split-grid">
                      <select className="samples-filter-field-input"
                        value={saleDraftFilters.periodMode}
                        onChange={(e) => setSaleDraftFilters((c) => ({ ...c, periodMode: e.target.value as 'exact' | 'month' | 'year', periodValue: '' }))}
                      >
                        <option value="exact">Data</option>
                        <option value="month">Mes</option>
                        <option value="year">Ano</option>
                      </select>
                      <input className="samples-filter-field-input"
                        type={saleDraftFilters.periodMode === 'exact' ? 'date' : saleDraftFilters.periodMode === 'month' ? 'month' : 'number'}
                        value={saleDraftFilters.periodValue}
                        onChange={(e) => setSaleDraftFilters((c) => ({ ...c, periodValue: e.target.value }))}
                        placeholder={saleDraftFilters.periodMode === 'year' ? 'AAAA' : ''}
                        min={saleDraftFilters.periodMode === 'year' ? '2000' : undefined}
                        max={saleDraftFilters.periodMode === 'year' ? '2100' : undefined}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="app-modal-actions samples-filter-modal-actions">
                <button type="button" className="app-modal-secondary" onClick={handleClearSaleFilters}
                  disabled={!Object.values(saleDraftFilters).some((v) => v !== '' && v !== 'exact')}
                >
                  Limpar
                </button>
                <button type="submit" className="app-modal-submit">Aplicar</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {/* ========== MODAL: Purchase Filters ========== */}
      {purchaseFiltersOpen ? (
        <div className="app-modal-backdrop samples-filter-modal-backdrop" onClick={() => setPurchaseFiltersOpen(false)}>
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
                <h3 id="purchase-filter-modal-title" className="app-modal-title">Filtros</h3>
              </div>
              <button type="button" className="app-modal-close" onClick={() => setPurchaseFiltersOpen(false)} aria-label="Fechar">
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <form className="samples-filter-modal-form" onSubmit={(e) => { e.preventDefault(); handleApplyPurchaseFilters(); }}>
              <div className="samples-filter-modal-content">
                <div className="samples-filter-fields">
                  <label className="samples-filter-field">
                    <span className="samples-filter-field-label">Proprietario</span>
                    <input
                      className="samples-filter-field-input"
                      value={purchaseDraftFilters.owner}
                      onChange={(e) => setPurchaseDraftFilters((c) => ({ ...c, owner: e.target.value }))}
                      placeholder="Nome do proprietario"
                    />
                  </label>

                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Sacas</span>
                    <div className="samples-filter-split-grid">
                      <input className="samples-filter-field-input" type="number" min="1" step="1" inputMode="numeric"
                        value={purchaseDraftFilters.sacksMin}
                        onChange={(e) => setPurchaseDraftFilters((c) => ({ ...c, sacksMin: e.target.value.replace(/\D+/g, '') }))}
                        placeholder="De"
                      />
                      <input className="samples-filter-field-input" type="number" min="1" step="1" inputMode="numeric"
                        value={purchaseDraftFilters.sacksMax}
                        onChange={(e) => setPurchaseDraftFilters((c) => ({ ...c, sacksMax: e.target.value.replace(/\D+/g, '') }))}
                        placeholder="Ate"
                      />
                    </div>
                  </div>

                  <div className="samples-filter-field">
                    <span className="samples-filter-field-label">Periodo</span>
                    <div className="samples-filter-split-grid">
                      <select className="samples-filter-field-input"
                        value={purchaseDraftFilters.periodMode}
                        onChange={(e) => setPurchaseDraftFilters((c) => ({ ...c, periodMode: e.target.value as 'exact' | 'month' | 'year', periodValue: '' }))}
                      >
                        <option value="exact">Data</option>
                        <option value="month">Mes</option>
                        <option value="year">Ano</option>
                      </select>
                      <input className="samples-filter-field-input"
                        type={purchaseDraftFilters.periodMode === 'exact' ? 'date' : purchaseDraftFilters.periodMode === 'month' ? 'month' : 'number'}
                        value={purchaseDraftFilters.periodValue}
                        onChange={(e) => setPurchaseDraftFilters((c) => ({ ...c, periodValue: e.target.value }))}
                        placeholder={purchaseDraftFilters.periodMode === 'year' ? 'AAAA' : ''}
                        min={purchaseDraftFilters.periodMode === 'year' ? '2000' : undefined}
                        max={purchaseDraftFilters.periodMode === 'year' ? '2100' : undefined}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="app-modal-actions samples-filter-modal-actions">
                <button type="button" className="app-modal-secondary" onClick={handleClearPurchaseFilters}
                  disabled={!Object.values(purchaseDraftFilters).some((v) => v !== '' && v !== 'exact')}
                >
                  Limpar
                </button>
                <button type="submit" className="app-modal-submit">Aplicar</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
