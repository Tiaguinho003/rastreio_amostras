'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { SaleContractCard } from '../../components/contracts/SaleContractCard';
import { SaleContractConfirmDialog } from '../../components/contracts/SaleContractConfirmDialog';
import { SaleContractEtapa2Modal } from '../../components/contracts/SaleContractEtapa2Modal';
import {
  SaleContractLifecycleDialog,
  type LifecycleAction,
} from '../../components/contracts/SaleContractLifecycleDialog';
import { ApiError, downloadSaleContractPdf, listSaleContracts } from '../../lib/api-client';
import { shareOrDownloadFile } from '../../lib/share-blob';
import { useRequireAuth } from '../../lib/use-auth';
import { useToast } from '../../lib/toast/ToastProvider';
import type { SaleContract, SaleContractStatus } from '../../lib/types';

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

  const [etapa2, setEtapa2] = useState<{ contractId: string; mode: 'emit' | 'view' } | null>(null);
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
  } | null>(null);

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

  async function handleBaixarPdf(contract: SaleContract) {
    if (!session) return;
    try {
      const { blob, fileName } = await downloadSaleContractPdf(session, contract.id);
      await shareOrDownloadFile(blob, fileName, {
        mimeType: 'application/pdf',
        shareTitle: `Contrato ${contract.contractNumber}`,
      });
    } catch (cause) {
      toast.error({
        title: 'Não foi possível gerar o PDF',
        description: cause instanceof ApiError ? cause.message : undefined,
      });
    }
  }

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="clients-page-v2">
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
                    });
                  return (
                    <SaleContractCard
                      key={contract.id}
                      contract={contract}
                      isExpanded={expandedIds.has(contract.id)}
                      onToggle={() => toggleExpand(contract.id)}
                      onGerar={() => setEtapa2({ contractId: contract.id, mode: 'emit' })}
                      onEditar={() => setEtapa2({ contractId: contract.id, mode: 'emit' })}
                      onRevisar={() => setEtapa2({ contractId: contract.id, mode: 'view' })}
                      onVer={() => setEtapa2({ contractId: contract.id, mode: 'view' })}
                      onBaixarPdf={() => void handleBaixarPdf(contract)}
                      onFaturar={() => openLifecycle('invoice')}
                      onPagar={() => openLifecycle('pay')}
                      onReverter={() => openLifecycle('revert')}
                      onQuebrar={() => openLifecycle('washout')}
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
      </section>

      {etapa2 ? (
        <SaleContractEtapa2Modal
          session={session}
          contractId={etapa2.contractId}
          mode={etapa2.mode}
          onClose={() => setEtapa2(null)}
          onSaved={() => {
            setEtapa2(null);
            void refresh();
            toast.success({ title: 'Documento emitido' });
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
                    ? 'Contrato quebrado'
                    : status === 'PAGO'
                      ? 'Pagamento desfeito'
                      : 'Faturamento desfeito';
            toast.success({ title });
          }}
        />
      ) : null}
    </AppShell>
  );
}
