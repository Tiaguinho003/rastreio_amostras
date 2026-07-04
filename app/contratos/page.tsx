'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApprovalLabelModal } from '../../components/ApprovalLabelModal';
import { AppShell } from '../../components/AppShell';
import { ANIMATION_MS } from '../../components/BottomSheet';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { ClientLookupField } from '../../components/clients/ClientLookupField';
import { ContractCreateRadialFab } from '../../components/contracts/ContractCreateRadialFab';
import {
  type ContractFilters,
  EMPTY_CONTRACT_FILTERS,
  LABEL_TO_STATUS,
  LABEL_TO_TYPE,
  PERIOD_BASE_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  countActiveContractFilters,
} from '../../components/contracts/ContractsFilterButton';
import { EspelhoCorretagemModal } from '../../components/contracts/EspelhoCorretagemModal';
import { SaleContractAgioDialog } from '../../components/contracts/SaleContractAgioDialog';
import { SaleContractCard } from '../../components/contracts/SaleContractCard';
import { SaleContractDocumentModal } from '../../components/contracts/SaleContractDocumentModal';
import { SaleContractEtapa2Modal } from '../../components/contracts/SaleContractEtapa2Modal';
import {
  SaleContractLifecycleDialog,
  type LifecycleAction,
} from '../../components/contracts/SaleContractLifecycleDialog';
import { SaleContractLotPickerModal } from '../../components/contracts/SaleContractLotPickerModal';
import { ClassificationFilterField } from '../../components/samples/ClassificationFilterField';
import { SelectionModeHeader } from '../../components/samples/SelectionModeHeader';
import {
  ApiError,
  getApprovalLabelPrefill,
  getNextContractNumber,
  listSaleContracts,
} from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-auth';
import { useDelayedValue } from '../../lib/use-delayed-value';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { useToast } from '../../lib/toast/ToastProvider';
import type {
  AgioDesagioType,
  ApprovalLabelPrefill,
  ClientSummary,
  SaleContract,
  SaleContractStatus,
} from '../../lib/types';

// Espelho de Corretagem (Fase E): só contratos congelados podem gerar o espelho (D73).
// D105: WASH_OUT também é elegível (o corretor recebe a comissão mesmo com washout).
const ESPELHO_ELIGIBLE: SaleContractStatus[] = ['EMITIDO', 'FATURADO', 'PAGO', 'WASH_OUT'];

const STATUS_OPTION_LABELS = STATUS_LABELS.map((s) => s.label);
const TYPE_OPTION_LABELS = TYPE_LABELS.map((t) => t.label);

export default function ContratosPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    // S74: COMMERCIAL acessa /contratos (filtrada aos contratos dele pelo backend).
    // Fase 1 = só-leitura + Espelho; gestão (criar/editar/faturar/...) segue ADMIN.
    allowedRoles: ['ADMIN', 'COMMERCIAL'],
  });
  // Fase 2 (D110): ADMIN e COMMERCIAL gerenciam (a página guarda só esses dois; o
  // backend filtra/autoriza aos contratos do corretor). Todos aqui podem gerenciar.
  const canManage = Boolean(session);
  const toast = useToast();

  const [contracts, setContracts] = useState<SaleContract[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Filtros avancados (modal) — estado local draft/applied (sem query params),
  // molde de /samples e /clients. `applied` filtra a lista; `draft` e o que o
  // modal edita; "Aplicar" copia draft->applied. `isDesktop` so reagrupa campos.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ContractFilters>(EMPTY_CONTRACT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ContractFilters>(EMPTY_CONTRACT_FILTERS);
  const [isDesktop, setIsDesktop] = useState(false);
  const filtersTrapRef = useFocusTrap(filtersOpen);
  const filterCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFilterTriggerRef = useRef<HTMLButtonElement | null>(null);

  const activeFiltersCount = useMemo(
    () => countActiveContractFilters(appliedFilters),
    [appliedFilters]
  );
  const hasAnyFilter = activeFiltersCount > 0 || countActiveContractFilters(draftFilters) > 0;

  const openFilters = (trigger: HTMLButtonElement) => {
    lastFilterTriggerRef.current = trigger;
    setDraftFilters(appliedFilters);
    setFiltersOpen(true);
  };
  const closeFilters = () => {
    setDraftFilters(appliedFilters);
    setFiltersOpen(false);
  };
  const handleApplyFilters = (event: FormEvent) => {
    event.preventDefault();
    setAppliedFilters(draftFilters);
    setFiltersOpen(false);
  };
  const handleClearFilters = () => {
    setDraftFilters(EMPTY_CONTRACT_FILTERS);
    setAppliedFilters(EMPTY_CONTRACT_FILTERS);
  };
  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [etapa2, setEtapa2] = useState<{ contractId: string } | null>(null);
  const [docModal, setDocModal] = useState<{ contractId: string; contractNumber: string } | null>(
    null
  );
  const [lifecycle, setLifecycle] = useState<{
    contractId: string;
    expectedVersion: number;
    contractNumber: string;
    action: LifecycleAction;
    status: SaleContractStatus;
    hasLot: boolean;
  } | null>(null);
  // Aplicar ágio/deságio (D87): alvo = contrato + sinal escolhido no card.
  const [agioTarget, setAgioTarget] = useState<{
    contract: SaleContract;
    agioType: AgioDesagioType;
  } | null>(null);
  // Criação de contrato FUTURO (sem lote): 1 modal só (futureCreate).
  const [futureOpen, setFutureOpen] = useState(false);

  // Criação à vista pela página: picker de lote → 1 modal (spotCreate) que cria a
  // venda no lote e emite (createSampleMovement → emit, dentro do Etapa2Modal).
  const [spotPickerOpen, setSpotPickerOpen] = useState(false);
  const [spotCreate, setSpotCreate] = useState<{
    sampleId: string;
    sampleVersion: number;
    internalLotNumber: string | null;
    availableSacks: number;
    isBlend: boolean;
    ownerClientId: string | null;
    nextNumber: string | null;
  } | null>(null);

  // Espelho de Corretagem (Fase E): modo de seleção (D76) + alvo (abre o modal só-leitura).
  const [espelhoMode, setEspelhoMode] = useState(false);
  const [espelhoTarget, setEspelhoTarget] = useState<SaleContract | null>(null);

  // Aprovação (Fase I, D112/D117): botão do card (EMITIDO/FATURADO/PAGO) busca
  // o prefill e abre o formulário da etiqueta DIRETO (sem seletor, sem Voltar).
  const [approvalForm, setApprovalForm] = useState<{
    saleContractId: string;
    prefill: ApprovalLabelPrefill;
  } | null>(null);
  const [approvalLoadingId, setApprovalLoadingId] = useState<string | null>(null);

  // Os modais de criação/lote são bottom sheets: mantê-los montados durante o
  // slide-down de saída (ANIMATION_MS) antes de desmontar. `open` = intenção ao vivo.
  const spotPickerRendered = useDelayedValue(spotPickerOpen || null, ANIMATION_MS);
  const spotCreateRendered = useDelayedValue(spotCreate, ANIMATION_MS);
  const futureRendered = useDelayedValue(futureOpen || null, ANIMATION_MS);
  const etapa2Rendered = useDelayedValue(etapa2, ANIMATION_MS);
  const approvalFormRendered = useDelayedValue(approvalForm, ANIMATION_MS);

  // Abre a etiqueta de Aprovação do card: busca o prefill (guard de duplo
  // clique) e monta o formulário já preenchido. Sem refresh no sucesso —
  // o envio não muda nada no contrato (é ortogonal ao status, D107).
  const openApproval = useCallback(
    async (contract: SaleContract) => {
      if (!session || approvalLoadingId) return;
      setApprovalLoadingId(contract.id);
      try {
        const prefill = await getApprovalLabelPrefill(session, contract.id);
        setApprovalForm({ saleContractId: contract.id, prefill });
      } catch (cause) {
        toast.error({
          title: 'Falha ao abrir a aprovação',
          description:
            cause instanceof ApiError && cause.status === 409
              ? 'Este contrato não está mais elegível para aprovação.'
              : cause instanceof ApiError
                ? cause.message
                : 'Tente novamente.',
        });
      } finally {
        setApprovalLoadingId(null);
      }
    },
    [session, approvalLoadingId, toast]
  );

  const refresh = useCallback(async () => {
    if (!session) return;
    setListLoading(true);
    try {
      const res = await listSaleContracts(session, {});
      setContracts(res.items);
    } catch {
      /* lista vazia em falha; toasts cobrem as mutações */
    } finally {
      setListLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void refresh();
  }, [session, refresh]);

  // Desktop vs mobile — usado so p/ reagrupar os campos do modal de filtros
  // (o resto do layout desktop e 100% CSS). Breakpoint canonico do projeto.
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 901px)');
    const apply = () => setIsDesktop(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);

  // Modal de filtros aberto: trava o scroll do body, ESC fecha, foca o "×" ao
  // abrir e devolve o foco ao gatilho ao fechar (molde de /samples).
  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeFilters();
      }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    const focusTimer = window.setTimeout(() => filterCloseButtonRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => lastFilterTriggerRef.current?.focus(), 0);
    };
    // closeFilters e local nao-memoizado; disparar so quando filtersOpen muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersOpen]);

  // Modo de seleção do Espelho: marca o body para o CSS esconder o header
  // normal + a barra de busca/filtro/"+" (paridade com o modo seleção de
  // /samples). O SelectionModeHeader assume o topo enquanto ativo.
  useEffect(() => {
    if (!espelhoMode) return;
    document.body.classList.add('is-selection-mode');
    return () => document.body.classList.remove('is-selection-mode');
  }, [espelhoMode]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const statusSet = new Set(appliedFilters.statusLabels.map((l) => LABEL_TO_STATUS[l]));
    const typeSet = new Set(appliedFilters.typeLabels.map((l) => LABEL_TO_TYPE[l]));
    const buyerId = appliedFilters.buyerClient?.id ?? null;
    const sellerId = appliedFilters.sellerClient?.id ?? null;
    const dateKey: 'invoiceDate' | 'paymentDate' | 'contractDate' =
      appliedFilters.periodBase === 'invoice'
        ? 'invoiceDate'
        : appliedFilters.periodBase === 'payment'
          ? 'paymentDate'
          : 'contractDate';
    const { periodFrom: from, periodTo: to } = appliedFilters;
    return contracts.filter((c) => {
      if (statusSet.size && !statusSet.has(c.status)) return false;
      if (typeSet.size && !typeSet.has(c.type)) return false;
      if (buyerId && c.buyerClientId !== buyerId) return false;
      if (sellerId && c.sellerClientId !== sellerId) return false;
      if (from || to) {
        const iso = c[dateKey];
        if (!iso) return false;
        const day = iso.slice(0, 10); // ISO 'YYYY-MM-DD…' → compare lexicográfico
        if (from && day < from) return false;
        if (to && day > to) return false;
      }
      if (q) {
        const seller = String(c.sellerSnapshot?.displayName ?? '').toLowerCase();
        const buyer = String(c.buyerSnapshot?.displayName ?? '').toLowerCase();
        if (
          !(c.contractNumber.toLowerCase().includes(q) || seller.includes(q) || buyer.includes(q))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [contracts, search, appliedFilters]);

  if (loading || !session) return null;

  const avatarInitials = (() => {
    const base = (session.user.fullName ?? session.user.username ?? '').trim();
    if (!base) return '?';
    const parts = base.split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + last).toUpperCase() || '?';
  })();

  const renderFilterFields = () => {
    const buyerField = (
      <div className="samples-filter-field">
        <ClientLookupField
          session={session}
          label="Comprador"
          kind="buyer"
          selectedClient={draftFilters.buyerClient}
          onSelectClient={(client: ClientSummary | null) =>
            setDraftFilters((f) => ({ ...f, buyerClient: client }))
          }
          compact
          placeholder="Qualquer comprador"
        />
      </div>
    );
    const sellerField = (
      <div className="samples-filter-field">
        <ClientLookupField
          session={session}
          label="Vendedor"
          kind="owner"
          selectedClient={draftFilters.sellerClient}
          onSelectClient={(client: ClientSummary | null) =>
            setDraftFilters((f) => ({ ...f, sellerClient: client }))
          }
          compact
          placeholder="Qualquer vendedor"
        />
      </div>
    );
    const statusField = (
      <ClassificationFilterField
        label="Status"
        placeholder="Qualquer status"
        options={STATUS_OPTION_LABELS}
        selected={draftFilters.statusLabels}
        onChange={(next) => setDraftFilters((f) => ({ ...f, statusLabels: next }))}
      />
    );
    const typeField = (
      <ClassificationFilterField
        label="Tipo"
        placeholder="Qualquer tipo"
        options={TYPE_OPTION_LABELS}
        selected={draftFilters.typeLabels}
        onChange={(next) => setDraftFilters((f) => ({ ...f, typeLabels: next }))}
      />
    );
    const periodActive = draftFilters.periodFrom !== '' || draftFilters.periodTo !== '';
    const periodField = (
      <div className={`samples-filter-field${periodActive ? ' is-active' : ''}`}>
        <span className="samples-filter-field-label">Período</span>
        <select
          className="samples-filter-field-input"
          value={draftFilters.periodBase}
          onChange={(event) =>
            setDraftFilters((f) => ({
              ...f,
              periodBase: event.target.value as ContractFilters['periodBase'],
            }))
          }
          aria-label="Base da data do período"
        >
          {PERIOD_BASE_LABELS.map((base) => (
            <option key={base.value} value={base.value}>
              {base.label}
            </option>
          ))}
        </select>
        <div className="samples-filter-split-grid">
          <input
            className={`samples-filter-field-input${draftFilters.periodFrom === '' ? ' is-placeholder' : ' is-active'}`}
            type="date"
            value={draftFilters.periodFrom}
            onChange={(event) => setDraftFilters((f) => ({ ...f, periodFrom: event.target.value }))}
            aria-label="Data inicial"
          />
          <input
            className={`samples-filter-field-input${draftFilters.periodTo === '' ? ' is-placeholder' : ' is-active'}`}
            type="date"
            value={draftFilters.periodTo}
            onChange={(event) => setDraftFilters((f) => ({ ...f, periodTo: event.target.value }))}
            aria-label="Data final"
          />
        </div>
      </div>
    );

    if (isDesktop) {
      return (
        <>
          <div className="samples-filter-row">
            {buyerField}
            {sellerField}
          </div>
          <div className="samples-filter-row">
            {statusField}
            {typeField}
          </div>
          {periodField}
        </>
      );
    }
    return (
      <>
        {buyerField}
        {sellerField}
        <div className="samples-filter-row">
          {statusField}
          {typeField}
        </div>
        {periodField}
      </>
    );
  };

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="clients-page-v2 ctr-page">
        {espelhoMode ? (
          <SelectionModeHeader
            title="Selecionar contrato"
            onExit={() => {
              setEspelhoMode(false);
              setEspelhoTarget(null);
            }}
          />
        ) : null}
        <header className="clients-v2-header">
          <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div className="clients-v2-header-center">
            <h2 className="nsv2-title">Contratos</h2>
          </div>
          <HeaderAvatarMenu session={session} onLogout={logout} />
          <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
            <span className="nsv2-avatar-initials">{avatarInitials}</span>
          </Link>
        </header>

        <div className={`hero-search-wrap${activeFiltersCount > 0 ? ' has-applied-filters' : ''}`}>
          <form
            className="hero-search-bar"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <input
              className="hero-search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar nº, vendedor ou comprador..."
              autoComplete="off"
              spellCheck={false}
            />
            {search ? (
              <button
                type="button"
                className="hero-search-clear-input"
                aria-label="Limpar busca"
                onClick={() => setSearch('')}
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            ) : (
              <span className="hero-search-submit" aria-hidden="true">
                <svg className="hero-search-icon-search" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.2 16.2 4.1 4.1" />
                </svg>
              </span>
            )}
          </form>
          {/* "X" de limpar filtros (aparece só com filtros aplicados) + botão de
              filtros avançados (abre o modal). O FAB "+" entra aqui na Fase 2. */}
          <span className="hero-search-clear-slot" aria-hidden={activeFiltersCount === 0}>
            <button
              type="button"
              className="hero-search-clear-btn"
              aria-label="Limpar filtros"
              tabIndex={activeFiltersCount > 0 ? 0 : -1}
              onClick={handleClearFilters}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </span>
          <button
            type="button"
            className={`hero-search-filter-btn${activeFiltersCount > 0 ? ' has-filters' : ''}`}
            aria-label="Filtros avançados"
            onClick={(event) => {
              if (filtersOpen) {
                closeFilters();
                return;
              }
              openFilters(event.currentTarget);
            }}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M4 6h16" />
              <path d="M7 12h10" />
              <path d="M10 18h4" />
            </svg>
            {activeFiltersCount > 0 ? (
              <span className="hero-search-filter-badge">{activeFiltersCount}</span>
            ) : null}
          </button>
          {/* FAB "+" como último filho do wrap: inline no desktop (regra
              .clients-page-v2 .hero-search-wrap .cv2-fab), flutuante no mobile. */}
          {!espelhoMode ? (
            <ContractCreateRadialFab
              canCreate={canManage}
              onCreateSpot={() => setSpotPickerOpen(true)}
              onCreateFuture={() => setFutureOpen(true)}
              onCreateEspelho={() => setEspelhoMode(true)}
            />
          ) : null}
        </div>

        <section className="clients-v2-sheet">
          <div className="spv2-list-meta">
            <span className="spv2-list-count">{visible.length} contrato(s)</span>
          </div>

          <div className="spv2-list-scroll">
            {listLoading ? (
              <div className="spv2-empty">
                <p className="spv2-empty-text">Carregando...</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="spv2-empty">
                <p className="spv2-empty-text">Nenhum contrato para mostrar</p>
              </div>
            ) : (
              <div className="ctr-list">
                {visible.map((contract) => {
                  const openLifecycle = (action: LifecycleAction) =>
                    setLifecycle({
                      contractId: contract.id,
                      expectedVersion: contract.version,
                      contractNumber: contract.contractNumber,
                      action,
                      status: contract.status,
                      hasLot: contract.type === 'MERCADO_A_VISTA',
                    });
                  // Espelho elegível = status congelado E ≥1 corretagem preenchida
                  // (sem comissão não há o que espelhar). Motivo p/ o card esmaecido.
                  const espelhoStatusOk = ESPELHO_ELIGIBLE.includes(contract.status);
                  const espelhoHasBrokerage =
                    (contract.sellerBrokeragePct ?? 0) > 0 || (contract.buyerBrokeragePct ?? 0) > 0;
                  const espelhoEligible = espelhoStatusOk && espelhoHasBrokerage;
                  const espelhoReason = !espelhoStatusOk
                    ? 'Só confirmados'
                    : !espelhoHasBrokerage
                      ? 'Sem corretagem'
                      : undefined;
                  return (
                    <SaleContractCard
                      key={contract.id}
                      contract={contract}
                      isExpanded={expandedIds.has(contract.id)}
                      onToggle={() => toggleExpand(contract.id)}
                      onEditar={() => setEtapa2({ contractId: contract.id })}
                      onVisualizar={() =>
                        setDocModal({
                          contractId: contract.id,
                          contractNumber: contract.contractNumber,
                        })
                      }
                      onAprovacao={() => void openApproval(contract)}
                      onApplyAgio={(type) => setAgioTarget({ contract, agioType: type })}
                      canManage={canManage}
                      onFaturar={() => openLifecycle('invoice')}
                      onPagar={() => openLifecycle('pay')}
                      onWashout={() => openLifecycle('washout')}
                      espelhoMode={espelhoMode}
                      espelhoEligible={espelhoEligible}
                      espelhoReason={espelhoReason}
                      onSelectEspelho={() => setEspelhoTarget(contract)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </section>

      {filtersOpen ? (
        <div className="app-modal-backdrop samples-filter-modal-backdrop" onClick={closeFilters}>
          <section
            ref={filtersTrapRef}
            id="contracts-filter-modal"
            className="app-modal is-themed samples-filter-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contracts-filter-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header samples-filter-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="contracts-filter-modal-title" className="app-modal-title">
                  Filtros
                </h3>
              </div>
              <button
                ref={filterCloseButtonRef}
                type="button"
                className="app-modal-close"
                onClick={closeFilters}
                aria-label="Fechar filtros"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <form className="samples-filter-modal-form" onSubmit={handleApplyFilters}>
              <div className="samples-filter-modal-content">{renderFilterFields()}</div>

              <div className="app-modal-actions samples-filter-modal-actions">
                <button
                  type="button"
                  className="app-modal-secondary"
                  onClick={handleClearFilters}
                  disabled={!hasAnyFilter}
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

      {etapa2Rendered ? (
        <SaleContractEtapa2Modal
          session={session}
          open={etapa2 != null}
          contractId={etapa2Rendered.contractId}
          onClose={() => setEtapa2(null)}
          onSaved={() => {
            setEtapa2(null);
            void refresh();
            toast.success({ title: 'Documento emitido' });
          }}
        />
      ) : null}

      {docModal ? (
        <SaleContractDocumentModal
          session={session}
          contractId={docModal.contractId}
          contractNumber={docModal.contractNumber}
          onClose={() => setDocModal(null)}
        />
      ) : null}

      {futureRendered ? (
        <SaleContractEtapa2Modal
          session={session}
          open={futureOpen}
          futureCreate
          onClose={() => setFutureOpen(false)}
          onSaved={() => {
            setFutureOpen(false);
            void refresh();
            toast.success({ title: 'Contrato Futuro gerado' });
          }}
        />
      ) : null}

      {lifecycle ? (
        <SaleContractLifecycleDialog
          session={session}
          contractId={lifecycle.contractId}
          expectedVersion={lifecycle.expectedVersion}
          contractNumber={lifecycle.contractNumber}
          action={lifecycle.action}
          hasLot={lifecycle.hasLot}
          onClose={() => setLifecycle(null)}
          onDone={() => {
            const { action } = lifecycle;
            setLifecycle(null);
            void refresh();
            const title =
              action === 'invoice'
                ? 'Contrato faturado'
                : action === 'pay'
                  ? 'Pagamento registrado'
                  : 'Washout realizado';
            toast.success({ title });
          }}
        />
      ) : null}

      {agioTarget ? (
        <SaleContractAgioDialog
          session={session}
          contract={agioTarget.contract}
          agioType={agioTarget.agioType}
          onClose={() => setAgioTarget(null)}
          onDone={() => {
            const applied = agioTarget.agioType === 'AGIO' ? 'Ágio aplicado' : 'Deságio aplicado';
            setAgioTarget(null);
            void refresh();
            toast.success({ title: applied });
          }}
        />
      ) : null}

      {spotPickerRendered ? (
        <SaleContractLotPickerModal
          session={session}
          open={spotPickerOpen}
          dragDisabled={spotCreate != null}
          onClose={() => setSpotPickerOpen(false)}
          onPicked={async (sample) => {
            // Swap sem sobreposição: o picker FECHA no mesmo batch em que o form
            // abre (um desce enquanto o outro sobe). "Voltar" reabre o picker.
            let nextNumber: string | null = null;
            try {
              nextNumber = (await getNextContractNumber(session)).contractNumber;
            } catch {
              nextNumber = null;
            }
            setSpotPickerOpen(false);
            setSpotCreate({
              sampleId: sample.id,
              sampleVersion: sample.version,
              internalLotNumber: sample.internalLotNumber,
              availableSacks: sample.availableSacks ?? 0,
              isBlend: sample.isBlend ?? false,
              ownerClientId: sample.ownerClientId ?? null,
              nextNumber,
            });
          }}
        />
      ) : null}

      {/* Criação à vista — form que SUBSTITUI o picker (sem sobreposição). Voltar
          reabre o picker; X/backdrop/ESC encerra o fluxo (volta à página);
          onSaved fecha tudo. */}
      {spotCreateRendered ? (
        <SaleContractEtapa2Modal
          session={session}
          open={spotCreate != null}
          spotCreate={spotCreateRendered}
          onBack={() => {
            // "Voltar": fecha o form e reabre o picker de lote (swap).
            setSpotCreate(null);
            setSpotPickerOpen(true);
          }}
          onClose={() => {
            // "X"/dismiss: encerra todo o fluxo à vista, volta à página.
            setSpotCreate(null);
            setSpotPickerOpen(false);
          }}
          onSaved={() => {
            setSpotCreate(null);
            setSpotPickerOpen(false);
            void refresh();
            toast.success({ title: 'Contrato à vista gerado' });
          }}
        />
      ) : null}

      {/* Espelho de Corretagem (Fase E): conferência só-leitura + Exportar/Baixar. */}
      {espelhoTarget ? (
        <EspelhoCorretagemModal
          session={session}
          contract={espelhoTarget}
          onClose={() => setEspelhoTarget(null)}
        />
      ) : null}

      {/* Aprovação (Fase I): formulário da etiqueta pré-preenchido, direto do
          card (sem seletor, sem Voltar — D117). Sucesso auto-fecha. */}
      {approvalFormRendered ? (
        <ApprovalLabelModal
          session={session}
          open={approvalForm != null}
          prefill={approvalFormRendered.prefill}
          saleContractId={approvalFormRendered.saleContractId}
          onClose={() => setApprovalForm(null)}
        />
      ) : null}
    </AppShell>
  );
}
