'use client';

import { useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ANIMATION_MS } from '../BottomSheet';
import { ClientLookupField } from '../clients/ClientLookupField';
import { ClassificationFilterField } from '../samples/ClassificationFilterField';
import { SelectionModeHeader } from '../samples/SelectionModeHeader';
import { getNextContractNumber, listSaleContracts } from '../../lib/api-client';
import { espelhoEligibility } from '../../lib/espelho';
import { useDelayedValue } from '../../lib/use-delayed-value';
import { useContractHighlight } from '../../lib/use-contract-highlight';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { useToast } from '../../lib/toast/ToastProvider';
import type {
  AgioDesagioType,
  ClientSummary,
  SaleContract,
  SaleContractStatus,
  SessionData,
} from '../../lib/types';
import { ContractCreateRadialFab } from './ContractCreateRadialFab';
import {
  type ContractFilters,
  EMPTY_CONTRACT_FILTERS,
  LABEL_TO_STATUS,
  LABEL_TO_TYPE,
  PERIOD_BASE_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  countActiveContractFilters,
} from './ContractsFilterButton';
import { EspelhoConferenciaModal, type EspelhoSide } from './EspelhoConferenciaModal';
import { EspelhoCorretagemModal } from './EspelhoCorretagemModal';
import { SaleContractAgioDialog } from './SaleContractAgioDialog';
import { SaleContractCard } from './SaleContractCard';
import { SaleContractDetailsModal } from './SaleContractDetailsModal';
import { SaleContractEtapa2Modal } from './SaleContractEtapa2Modal';
import { SaleContractLifecycleDialog, type LifecycleAction } from './SaleContractLifecycleDialog';
import { SaleContractLotPickerModal } from './SaleContractLotPickerModal';

const STATUS_OPTION_LABELS = STATUS_LABELS.map((s) => s.label);
const TYPE_OPTION_LABELS = TYPE_LABELS.map((t) => t.label);

export function ContratosPanel({ session }: { session: SessionData }) {
  // Painel da aba "Contratos" do hub (Central de Contratos). A casca — guard,
  // AppShell, header e as abas — vive em app/contratos/page.tsx; aqui fica só o
  // conteúdo. Escopo aberto (own-only revogado): ADMIN e COMMERCIAL veem e
  // gerenciam TODOS os contratos; quem chega aqui pode gerenciar.
  const canManage = true;
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
  // Detalhes (Fase J, D120-D126): modal grande com o documento embutido +
  // infos read-only + historico; absorveu o antigo "Visualizar" (docModal).
  const [detailsTarget, setDetailsTarget] = useState<SaleContract | null>(null);
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

  // Espelho de Corretagem (Fase E): modo de seleção (D76) + alvo. O alvo abre a
  // fase de CONFERÊNCIA (D134); "Gerar espelho" avança pra prévia (espelhoPreview).
  const [espelhoMode, setEspelhoMode] = useState(false);
  const [espelhoTarget, setEspelhoTarget] = useState<SaleContract | null>(null);
  const [espelhoPreview, setEspelhoPreview] = useState<{
    contract: SaleContract;
    side: EspelhoSide;
  } | null>(null);
  // Vai-e-volta com o Detalhes (D134): "Ver detalhes" na conferência guarda o
  // alvo aqui; ao FECHAR o Detalhes a conferência reabre (dados re-buscados).
  // Os swaps do Detalhes (Editar/Ágio/Washout) LIMPAM o retorno (fluxo encerra).
  const espelhoReturnRef = useRef<SaleContract | null>(null);

  // Os modais de criação/lote são bottom sheets: mantê-los montados durante o
  // slide-down de saída (ANIMATION_MS) antes de desmontar. `open` = intenção ao vivo.
  const spotPickerRendered = useDelayedValue(spotPickerOpen || null, ANIMATION_MS);
  const spotCreateRendered = useDelayedValue(spotCreate, ANIMATION_MS);
  const futureRendered = useDelayedValue(futureOpen || null, ANIMATION_MS);
  const etapa2Rendered = useDelayedValue(etapa2, ANIMATION_MS);
  const detailsRendered = useDelayedValue(detailsTarget, ANIMATION_MS);

  // F1 (E27/D138): deep-link "Ver contrato" do card de Eventos — ?details=<id>.
  const searchParams = useSearchParams();
  const detailsParam = searchParams.get('details');
  const consumedDetailsRef = useRef<string | null>(null);

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

  // F1 (E27/D138): abre o Detalhes UMA vez quando a lista carrega e há ?details=<id>
  // (o ref evita reabrir se o usuário fechar; o modal re-busca por id, role-scoped).
  useEffect(() => {
    if (!detailsParam || consumedDetailsRef.current === detailsParam) return;
    const found = contracts.find((c) => c.id === detailsParam);
    if (found) {
      consumedDetailsRef.current = detailsParam;
      setDetailsTarget(found);
    }
  }, [detailsParam, contracts]);

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
        // Data "À definir" (null, D144) fica fora do recorte por período —
        // filtrar por uma data exclui quem não a tem.
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

  // DSB-D11: pisca/rola até o contrato tocado no chip de faturamento do dashboard
  // (?highlight=<id>). Best-effort — se não estiver na lista visível, só ancora na aba.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const highlightId = useContractHighlight(visible, scrollRef);

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
    <>
      {espelhoMode ? (
        <SelectionModeHeader
          title="Selecionar contrato"
          onExit={() => {
            setEspelhoMode(false);
            setEspelhoTarget(null);
            setEspelhoPreview(null);
            espelhoReturnRef.current = null;
          }}
        />
      ) : null}
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

        <div className="spv2-list-scroll" ref={scrollRef}>
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
                // Espelho: elegibilidade da fonte única (lib/espelho) — espelha os gates
                // do backend (status congelado, ≥1 corretagem, não washout à-vista/D145).
                const { eligible: espelhoEligible, reason: espelhoReason } =
                  espelhoEligibility(contract);
                return (
                  <SaleContractCard
                    key={contract.id}
                    contract={contract}
                    isExpanded={expandedIds.has(contract.id)}
                    onToggle={() => toggleExpand(contract.id)}
                    onDetalhes={() => setDetailsTarget(contract)}
                    canManage={canManage}
                    isHighlighted={highlightId === contract.id}
                    onFaturar={() => openLifecycle('invoice')}
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

      {/* Detalhes (Fase J): documento embutido + infos + historico. As acoes
          do rodape (Editar/Agio/Desagio/Washout) FECHAM o Detalhes e abrem o
          fluxo correspondente (um modal por vez, sem sobreposicao). */}
      {detailsRendered ? (
        <SaleContractDetailsModal
          session={session}
          open={detailsTarget != null}
          contract={detailsRendered}
          canManage={canManage}
          espelhoEligible={espelhoEligibility(detailsRendered).eligible}
          onGerarEspelho={() => {
            const target = detailsRendered;
            espelhoReturnRef.current = null;
            setDetailsTarget(null);
            setEspelhoTarget(target);
          }}
          onClose={() => {
            setDetailsTarget(null);
            // Vai-e-volta do espelho (D134): se o Detalhes foi aberto pela
            // conferência, reabre-a (o modal re-busca o contrato fresco).
            const back = espelhoReturnRef.current;
            if (back) {
              espelhoReturnRef.current = null;
              setEspelhoTarget(back);
            }
          }}
          onEditar={() => {
            const target = detailsRendered;
            espelhoReturnRef.current = null;
            setDetailsTarget(null);
            setEtapa2({ contractId: target.id });
          }}
          onApplyAgio={(type) => {
            const target = detailsRendered;
            espelhoReturnRef.current = null;
            setDetailsTarget(null);
            setAgioTarget({ contract: target, agioType: type });
          }}
          onWashout={() => {
            const target = detailsRendered;
            espelhoReturnRef.current = null;
            setDetailsTarget(null);
            setLifecycle({
              contractId: target.id,
              expectedVersion: target.version,
              contractNumber: target.contractNumber,
              action: 'washout',
              status: target.status,
              hasLot: target.type === 'MERCADO_A_VISTA',
            });
          }}
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

      {/* Espelho de Corretagem (Fase E + D134): 1ª etapa = CONFERÊNCIA dos campos
          (toggle de lado + Ver detalhes vai-e-volta) → 2ª etapa = prévia do PDF
          com Exportar/Baixar. */}
      {espelhoTarget ? (
        <EspelhoConferenciaModal
          session={session}
          contract={espelhoTarget}
          onClose={() => setEspelhoTarget(null)}
          onConfirm={(side) => {
            const target = espelhoTarget;
            setEspelhoTarget(null);
            setEspelhoPreview({ contract: target, side });
          }}
          onOpenDetails={() => {
            const target = espelhoTarget;
            setEspelhoTarget(null);
            espelhoReturnRef.current = target;
            setDetailsTarget(target);
          }}
        />
      ) : null}
      {espelhoPreview ? (
        <EspelhoCorretagemModal
          session={session}
          contract={espelhoPreview.contract}
          side={espelhoPreview.side}
          onClose={() => setEspelhoPreview(null)}
        />
      ) : null}
    </>
  );
}
