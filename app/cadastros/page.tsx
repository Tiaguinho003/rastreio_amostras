'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { BrokerFormModal } from '../../components/cadastros/BrokerFormModal';
import { ClientsBrowser } from '../../components/clients/ClientsBrowser';
import {
  ApiError,
  createBroker,
  listBrokers,
  lookupUsersForReference,
  updateBroker,
} from '../../lib/api-client';
import { CLIENT_MANAGEMENT_ROLES } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';
import { useToast } from '../../lib/toast/ToastProvider';
import type { Broker, BrokerInput, UserLookupItem } from '../../lib/types';

// Cadastros = hub ADMIN/CADASTRO com 2 abas (a aba Bancos saiu na D141 --
// banco virou texto livre na conta bancaria). "Clientes" (default) reusa a
// experiencia COMPLETA da pagina /clients via <ClientsBrowser>; Corretores
// mantem a UI local. O FAB "+" e contextual a aba ativa.
type Tab = 'clientes' | 'corretores';

// useSearchParams exige Suspense no App Router (mesmo padrao de /clients).
export default function CadastrosPageWrapper() {
  return (
    <Suspense>
      <CadastrosPage />
    </Suspense>
  );
}

function CadastrosPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: CLIENT_MANAGEMENT_ROLES,
  });
  const toast = useToast();
  const searchParams = useSearchParams();

  // URL ?incomplete=true (card "Cadastros pendentes" do dashboard). So a pagina
  // le a URL; o ClientsBrowser recebe por prop (ele nao usa useSearchParams).
  const incompleteFromUrl = searchParams.get('incomplete') === 'true';

  const [tab, setTab] = useState<Tab>('clientes');

  // Corretores
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [brokerSearch, setBrokerSearch] = useState('');
  const [showInactiveBrokers, setShowInactiveBrokers] = useState(false);
  const [brokerModalOpen, setBrokerModalOpen] = useState(false);
  const [editingBroker, setEditingBroker] = useState<Broker | null>(null);
  const [savingBroker, setSavingBroker] = useState(false);
  const [brokerModalError, setBrokerModalError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserLookupItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const refreshBrokers = useCallback(async () => {
    if (!session) return;
    try {
      const res = await listBrokers(session, {});
      setBrokers(res.items);
    } catch {
      /* lista vazia em falha; toast cobre a mutação */
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void refreshBrokers();
    setLoadingUsers(true);
    lookupUsersForReference(session, { limit: 200 })
      .then((res) => setUsers(res.items))
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [session, refreshBrokers]);

  const visibleBrokers = useMemo(() => {
    const q = brokerSearch.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return brokers
      .filter((b) => (showInactiveBrokers ? true : b.status === 'ACTIVE'))
      .filter(
        (b) =>
          !q ||
          b.name.toLowerCase().includes(q) ||
          (b.email ?? '').toLowerCase().includes(q) ||
          (qd.length > 0 && (b.cpf ?? '').includes(qd))
      );
  }, [brokers, brokerSearch, showInactiveBrokers]);

  const inactiveBrokersCount = useMemo(
    () => brokers.filter((b) => b.status === 'INACTIVE').length,
    [brokers]
  );

  if (loading || !session) return null;

  const avatarInitials = (() => {
    const base = (session.user.fullName ?? session.user.username ?? '').trim();
    if (!base) return '?';
    const parts = base.split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + last).toUpperCase() || '?';
  })();

  function openCreateBroker() {
    setEditingBroker(null);
    setBrokerModalError(null);
    setBrokerModalOpen(true);
  }
  function openEditBroker(broker: Broker) {
    setEditingBroker(broker);
    setBrokerModalError(null);
    setBrokerModalOpen(true);
  }
  async function submitBroker(data: BrokerInput & { status?: 'ACTIVE' | 'INACTIVE' }) {
    if (!session) return;
    setSavingBroker(true);
    setBrokerModalError(null);
    try {
      if (editingBroker) {
        await updateBroker(session, editingBroker.id, data);
        toast.success({ title: 'Corretor atualizado' });
      } else {
        await createBroker(session, data);
        toast.success({ title: 'Corretor criado' });
      }
      setBrokerModalOpen(false);
      await refreshBrokers();
    } catch (cause) {
      setBrokerModalError(cause instanceof ApiError ? cause.message : 'Falha ao salvar corretor.');
    } finally {
      setSavingBroker(false);
    }
  }

  const count = visibleBrokers.length;
  const inactiveCount = inactiveBrokersCount;
  const showInactive = showInactiveBrokers;
  const toggleInactive = () => setShowInactiveBrokers((v) => !v);
  const searchValue = brokerSearch;
  const setSearchValue = (value: string) => setBrokerSearch(value);

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
            <h2 className="nsv2-title">Cadastros</h2>
          </div>
          <HeaderAvatarMenu session={session} onLogout={logout} />
          <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
            <span className="nsv2-avatar-initials">{avatarInitials}</span>
          </Link>
        </header>

        <div className="cad-tabs" role="tablist" aria-label="Tipo de cadastro">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'clientes'}
            className={`cad-tab${tab === 'clientes' ? ' is-active' : ''}`}
            onClick={() => setTab('clientes')}
          >
            Clientes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'corretores'}
            className={`cad-tab${tab === 'corretores' ? ' is-active' : ''}`}
            onClick={() => setTab('corretores')}
          >
            Corretores
          </button>
        </div>

        {tab === 'clientes' ? (
          <ClientsBrowser
            session={session}
            storageKey="clients-list-snapshot-cad-v3"
            initialIncomplete={incompleteFromUrl}
          />
        ) : (
          <>
            <div className="hero-search-wrap">
              <form
                className="hero-search-bar"
                role="search"
                onSubmit={(event) => event.preventDefault()}
              >
                <input
                  className="hero-search-input"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Buscar corretor..."
                  autoComplete="off"
                  spellCheck={false}
                />
                {searchValue ? (
                  <button
                    type="button"
                    className="hero-search-clear-input"
                    aria-label="Limpar busca"
                    onClick={() => setSearchValue('')}
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
              <button
                type="button"
                className="cv2-fab"
                aria-label="Novo corretor"
                onClick={openCreateBroker}
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </button>
            </div>

            <section className="clients-v2-sheet">
              <div className="spv2-list-meta">
                <span className="spv2-list-count">{count} corretor(es)</span>
                {inactiveCount > 0 ? (
                  <button type="button" className="sdv-edit-btn-small" onClick={toggleInactive}>
                    {showInactive ? 'Esconder inativos' : `Mostrar ${inactiveCount} inativo(s)`}
                  </button>
                ) : null}
              </div>

              <div className="spv2-list-scroll">
                {count === 0 ? (
                  <div className="spv2-empty">
                    <p className="spv2-empty-text">Nenhum corretor para mostrar</p>
                  </div>
                ) : (
                  <div className="cad-list">
                    {visibleBrokers.map((broker) => (
                      <button
                        key={broker.id}
                        type="button"
                        className={`cad-row${broker.status === 'INACTIVE' ? ' is-inactive' : ''}`}
                        onClick={() => openEditBroker(broker)}
                      >
                        <div className="cad-row-main">
                          <span className="cad-row-name">{broker.name}</span>
                          <span className="cad-row-sub">
                            {broker.user
                              ? `Usuário: ${broker.user.fullName}`
                              : broker.email || broker.phone || 'Sem vínculo'}
                          </span>
                        </div>
                        {broker.status === 'INACTIVE' ? (
                          <span className="cad-row-badge">Inativo</span>
                        ) : null}
                        <svg className="cad-row-arrow" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </section>

      <BrokerFormModal
        open={brokerModalOpen}
        broker={editingBroker}
        users={users}
        loadingUsers={loadingUsers}
        saving={savingBroker}
        errorMessage={brokerModalError}
        onClose={() => {
          if (!savingBroker) setBrokerModalOpen(false);
        }}
        onSubmit={submitBroker}
      />
    </AppShell>
  );
}
