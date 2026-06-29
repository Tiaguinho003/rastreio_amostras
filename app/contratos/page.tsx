'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { ContractCreateRadialFab } from '../../components/contracts/ContractCreateRadialFab';
import { SaleContractCard } from '../../components/contracts/SaleContractCard';
import { SaleContractConfirmDialog } from '../../components/contracts/SaleContractConfirmDialog';
import { SaleContractDocumentModal } from '../../components/contracts/SaleContractDocumentModal';
import { SaleContractEtapa2Modal } from '../../components/contracts/SaleContractEtapa2Modal';
import {
  SaleContractLifecycleDialog,
  type LifecycleAction,
} from '../../components/contracts/SaleContractLifecycleDialog';
import { SaleContractLotPickerModal } from '../../components/contracts/SaleContractLotPickerModal';
import {
  SampleMovementModal,
  type SampleMovementModalSubmitInput,
} from '../../components/samples/SampleMovementModal';
import {
  getNextContractNumber,
  getSampleDetail,
  listSaleContracts,
  updateRegistration,
} from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-auth';
import { useToast } from '../../lib/toast/ToastProvider';
import type {
  ActiveBlendDetail,
  SaleContract,
  SaleContractStatus,
  SampleSnapshot,
} from '../../lib/types';

type StatusFilter = 'ALL' | SaleContractStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'EM_ABERTO', label: 'Em aberto' },
  { value: 'CONFERIR', label: 'Conferir' },
  { value: 'CONFIRMADO', label: 'Confirmado' },
  { value: 'FATURADO', label: 'Faturado' },
  { value: 'PAGO', label: 'Pago' },
  { value: 'WASH_OUT', label: 'Quebrado' },
];

export default function ContratosPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: ['ADMIN'],
  });
  const toast = useToast();

  const [contracts, setContracts] = useState<SaleContract[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
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
  const [confirmTarget, setConfirmTarget] = useState<{
    contractId: string;
    expectedVersion: number;
    contractNumber: string;
  } | null>(null);
  const [lifecycle, setLifecycle] = useState<{
    contractId: string;
    expectedVersion: number;
    contractNumber: string;
    action: LifecycleAction;
    status: SaleContractStatus;
    hasLot: boolean;
  } | null>(null);
  // Criação de contrato FUTURO (sem lote): 1 modal só (futureCreate).
  const [futureOpen, setFutureOpen] = useState(false);

  // Criacao a vista pela pagina: picker de lote -> venda (cria o contrato
  // EM_ABERTO) -> encadeia a Etapa 2 (Gerar documento) com o id recem-criado.
  const [spotPickerOpen, setSpotPickerOpen] = useState(false);
  // Wizard à vista: passo 1 (Registrar venda) → passo 2 (Gerar rascunho). O
  // contrato só é criado no fim (passo 2); saleData preserva ao "Voltar".
  const [spotWizard, setSpotWizard] = useState<{
    step: 1 | 2;
    sample: SampleSnapshot;
    activeBlends: ActiveBlendDetail[];
    nextNumber: string | null;
    saleData: SampleMovementModalSubmitInput | null;
  } | null>(null);
  // Contexto de criação pro 2º modal (estável p/ o effect dele) — só quando há
  // dados da venda (passo 2). O create→emit roda dentro do Etapa2 (modo criação).
  const spotCreateContext = useMemo(() => {
    if (!spotWizard?.saleData) return undefined;
    const sale = spotWizard.saleData;
    return {
      sampleId: spotWizard.sample.id,
      sampleVersion: spotWizard.sample.version,
      sellerClientId: spotWizard.sample.ownerClientId ?? null,
      sale: {
        buyerClientId: sale.buyerClientId,
        buyerUnitId: sale.buyerUnitId,
        quantitySacks: sale.quantitySacks,
        movementDate: sale.movementDate,
        unitPrice: sale.unitPrice,
        sellerBrokeragePct: sale.sellerBrokeragePct,
        buyerBrokeragePct: sale.buyerBrokeragePct,
        brokerIds: sale.brokerIds,
      },
    };
  }, [spotWizard]);
  // initialSale do passo 1 (prefill ao voltar) — ESTÁVEL (dep só na saleData, não
  // no sample) pra o reset do modal NÃO re-rodar a cada render / ao atribuir dono.
  const spotSaleData = spotWizard?.saleData ?? null;
  const spotInitialSale = useMemo(() => {
    if (!spotSaleData) return undefined;
    return {
      buyerClient: spotSaleData.buyerClient,
      quantitySacks: spotSaleData.quantitySacks,
      unitPrice: spotSaleData.unitPrice,
      sellerBrokeragePct: spotSaleData.sellerBrokeragePct,
      buyerBrokeragePct: spotSaleData.buyerBrokeragePct,
      brokerIds: spotSaleData.brokerIds,
      movementDate: spotSaleData.movementDate,
    };
  }, [spotSaleData]);

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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts
      .filter((c) => (statusFilter === 'ALL' ? true : c.status === statusFilter))
      .filter((c) => {
        if (!q) return true;
        const seller = String(c.sellerSnapshot?.displayName ?? '').toLowerCase();
        const buyer = String(c.buyerSnapshot?.displayName ?? '').toLowerCase();
        return (
          c.contractNumber.toLowerCase().includes(q) || seller.includes(q) || buyer.includes(q)
        );
      });
  }, [contracts, search, statusFilter]);

  if (loading || !session) return null;

  const avatarInitials = (() => {
    const base = (session.user.fullName ?? session.user.username ?? '').trim();
    if (!base) return '?';
    const parts = base.split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + last).toUpperCase() || '?';
  })();

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="clients-page-v2 ctr-page">
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

        <div className="hero-search-wrap">
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
        </div>

        <div className="ctr-filter-row" role="tablist" aria-label="Filtrar por status">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === filter.value}
              className={`ctr-filter${statusFilter === filter.value ? ' is-active' : ''}`}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
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
                  return (
                    <SaleContractCard
                      key={contract.id}
                      contract={contract}
                      isExpanded={expandedIds.has(contract.id)}
                      onToggle={() => toggleExpand(contract.id)}
                      onGerar={() => setEtapa2({ contractId: contract.id })}
                      onCancelar={() => openLifecycle('cancel')}
                      onEditar={() => setEtapa2({ contractId: contract.id })}
                      onVisualizar={() =>
                        setDocModal({
                          contractId: contract.id,
                          contractNumber: contract.contractNumber,
                        })
                      }
                      onFaturar={() => openLifecycle('invoice')}
                      onPagar={() => openLifecycle('pay')}
                      onReverter={() => openLifecycle('revert')}
                      onWashout={() => openLifecycle('washout')}
                      onConfirmar={() =>
                        setConfirmTarget({
                          contractId: contract.id,
                          expectedVersion: contract.version,
                          contractNumber: contract.contractNumber,
                        })
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <ContractCreateRadialFab
          onCreateSpot={() => setSpotPickerOpen(true)}
          onCreateFuture={() => setFutureOpen(true)}
        />
      </section>

      {etapa2 ? (
        <SaleContractEtapa2Modal
          session={session}
          contractId={etapa2.contractId}
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

      {futureOpen ? (
        <SaleContractEtapa2Modal
          session={session}
          futureCreate
          onClose={() => setFutureOpen(false)}
          onSaved={() => {
            setFutureOpen(false);
            void refresh();
            toast.success({ title: 'Contrato Futuro gerado' });
          }}
        />
      ) : null}

      {confirmTarget ? (
        <SaleContractConfirmDialog
          session={session}
          contractId={confirmTarget.contractId}
          expectedVersion={confirmTarget.expectedVersion}
          contractNumber={confirmTarget.contractNumber}
          onClose={() => setConfirmTarget(null)}
          onConfirmed={() => {
            setConfirmTarget(null);
            void refresh();
            toast.success({ title: 'Contrato confirmado' });
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
          currentStatus={lifecycle.status}
          hasLot={lifecycle.hasLot}
          onClose={() => setLifecycle(null)}
          onDone={() => {
            const { action, status } = lifecycle;
            setLifecycle(null);
            void refresh();
            const title =
              action === 'invoice'
                ? 'Contrato faturado'
                : action === 'pay'
                  ? 'Pagamento registrado'
                  : action === 'washout'
                    ? 'Washout realizado'
                    : action === 'cancel'
                      ? 'Contrato cancelado'
                      : status === 'PAGO'
                        ? 'Pagamento desfeito'
                        : 'Faturamento desfeito';
            toast.success({ title });
          }}
        />
      ) : null}

      {spotPickerOpen ? (
        <SaleContractLotPickerModal
          session={session}
          onClose={() => setSpotPickerOpen(false)}
          onPicked={async (sample, activeBlends) => {
            setSpotPickerOpen(false);
            let nextNumber: string | null = null;
            try {
              nextNumber = (await getNextContractNumber(session)).contractNumber;
            } catch {
              nextNumber = null;
            }
            setSpotWizard({ step: 1, sample, activeBlends, nextNumber, saleData: null });
          }}
        />
      ) : null}

      {/* Wizard à vista — PASSO 1: registrar a venda (só coleta; não commita). */}
      {spotWizard?.step === 1 ? (
        <SampleMovementModal
          session={session}
          open
          mode="create"
          saving={false}
          title="Registrar venda"
          infoFields={[
            { label: 'Tipo', value: 'À vista' },
            { label: 'Lote', value: spotWizard.sample.internalLotNumber ?? 'Sem número' },
            { label: 'Documento', value: spotWizard.nextNumber ?? '—' },
          ]}
          initialMovementType="SALE"
          initialSale={spotInitialSale}
          availableSacks={spotWizard.sample.availableSacks ?? 0}
          blend={
            spotWizard.sample.isBlend
              ? {
                  sampleId: spotWizard.sample.id,
                  ownerClientId: spotWizard.sample.ownerClientId ?? null,
                }
              : null
          }
          activeBlends={spotWizard.sample.isBlend ? [] : spotWizard.activeBlends}
          onAssignOwner={async (ownerClientId) => {
            await updateRegistration(session, spotWizard.sample.id, {
              expectedVersion: spotWizard.sample.version,
              after: { ownerClientId },
              reasonCode: 'DATA_FIX',
              reasonText: 'Atribuicao de dono a liga antes da movimentacao comercial',
            });
            const detail = await getSampleDetail(session, spotWizard.sample.id);
            setSpotWizard((prev) =>
              prev
                ? { ...prev, sample: detail.sample, activeBlends: detail.activeBlends ?? [] }
                : prev
            );
          }}
          onClose={() => setSpotWizard(null)}
          onSubmit={(data) => {
            // Passo 1 NÃO commita: guarda os dados e avança pro passo 2.
            setSpotWizard((prev) => (prev ? { ...prev, step: 2, saleData: data } : prev));
          }}
        />
      ) : null}

      {/* Wizard à vista — PASSO 2: gerar rascunho (cria venda+contrato e emite). */}
      {spotWizard?.step === 2 && spotCreateContext ? (
        <SaleContractEtapa2Modal
          session={session}
          createContext={spotCreateContext}
          onBack={() => setSpotWizard((prev) => (prev ? { ...prev, step: 1 } : prev))}
          onClose={() => setSpotWizard(null)}
          onSaved={() => {
            setSpotWizard(null);
            void refresh();
            toast.success({ title: 'Rascunho gerado' });
          }}
        />
      ) : null}
    </AppShell>
  );
}
