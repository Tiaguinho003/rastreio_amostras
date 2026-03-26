'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import {
  ApiError,
  createUser,
  getUser,
  inactivateUser,
  listUsers,
  reactivateUser,
  resetUserPassword,
  unlockUser,
  updateUser
} from '../../lib/api-client';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { getRoleLabel } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';
import type { UserRole, UserStatus, UserSummary } from '../../lib/types';

const ROLE_OPTIONS: UserRole[] = ['ADMIN', 'CLASSIFIER', 'REGISTRATION', 'COMMERCIAL'];
const PAGE_LIMIT = 10;

function userStatusLabel(status: UserStatus) {
  return status === 'ACTIVE' ? 'Ativo' : 'Inativo';
}

function userStatusThemeClass(status: UserStatus) {
  return status === 'ACTIVE' ? 'is-status-success' : 'is-status-danger';
}

function formatUserCardSummary(user: UserSummary) {
  return `${user.username} | ${user.email}`;
}

function formatUserCardMeta(user: UserSummary) {
  const parts = [getRoleLabel(user.role), userStatusLabel(user.status)];
  if (user.isLocked) {
    parts.push('Bloqueado');
  }

  return parts.join(' | ');
}

function blankCreateForm() {
  return {
    fullName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    role: 'CLASSIFIER' as UserRole
  };
}

// --- List state ---

interface UsersListState {
  items: UserSummary[];
  total: number;
  totalPages: number;
  currentPage: number;
  hasPrev: boolean;
  hasNext: boolean;
  loading: boolean;
  error: string | null;
}

type UsersListAction =
  | { type: 'fetch' }
  | { type: 'success'; items: UserSummary[]; total: number; totalPages: number; hasPrev: boolean; hasNext: boolean }
  | { type: 'error'; message: string }
  | { type: 'setPage'; page: number };

const USERS_INITIAL: UsersListState = {
  items: [],
  total: 0,
  totalPages: 1,
  currentPage: 1,
  hasPrev: false,
  hasNext: false,
  loading: false,
  error: null
};

function usersListReducer(state: UsersListState, action: UsersListAction): UsersListState {
  switch (action.type) {
    case 'fetch':
      return { ...state, loading: true, error: null };
    case 'success':
      return {
        ...state,
        items: action.items,
        total: action.total,
        totalPages: action.totalPages,
        hasPrev: action.hasPrev,
        hasNext: action.hasNext,
        loading: false,
        error: null
      };
    case 'error':
      return { ...state, loading: false, error: action.message };
    case 'setPage':
      return { ...state, currentPage: action.page };
    default:
      return state;
  }
}

// --- Detail modal state ---

type ModalMode = 'closed' | 'view' | 'edit' | 'create';

interface ModalState {
  mode: ModalMode;
  user: UserSummary | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  message: string | null;
}

const MODAL_INITIAL: ModalState = {
  mode: 'closed',
  user: null,
  loading: false,
  saving: false,
  error: null,
  message: null
};

type ModalAction =
  | { type: 'openCreate' }
  | { type: 'openView'; userId: string }
  | { type: 'switchToEdit' }
  | { type: 'close' }
  | { type: 'fetchDetail' }
  | { type: 'detailSuccess'; user: UserSummary }
  | { type: 'detailError'; message: string }
  | { type: 'saving' }
  | { type: 'saveSuccess'; user: UserSummary; message: string }
  | { type: 'saveError'; message: string }
  | { type: 'actionSuccess'; user: UserSummary; message: string }
  | { type: 'clearMessages' };

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'openCreate':
      return { ...MODAL_INITIAL, mode: 'create' };
    case 'openView':
      return { ...MODAL_INITIAL, mode: 'view', loading: true };
    case 'switchToEdit':
      return { ...state, mode: 'edit', error: null, message: null };
    case 'close':
      return MODAL_INITIAL;
    case 'fetchDetail':
      return { ...state, loading: true, error: null };
    case 'detailSuccess':
      return { ...state, loading: false, user: action.user };
    case 'detailError':
      return { ...state, loading: false, error: action.message };
    case 'saving':
      return { ...state, saving: true, error: null, message: null };
    case 'saveSuccess':
      return { ...state, saving: false, user: action.user, message: action.message, mode: 'view' };
    case 'saveError':
      return { ...state, saving: false, error: action.message };
    case 'actionSuccess':
      return { ...state, saving: false, user: action.user, message: action.message };
    case 'clearMessages':
      return { ...state, error: null, message: null };
    default:
      return state;
  }
}

export default function UsersPage() {
  const { session, loading, logout, setSession } = useRequireAuth({ allowedRoles: ['ADMIN'] });

  const [listState, dispatchList] = useReducer(usersListReducer, USERS_INITIAL);
  const [modal, dispatchModal] = useReducer(modalReducer, MODAL_INITIAL);

  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');

  const [createForm, setCreateForm] = useState(blankCreateForm());
  const [editForm, setEditForm] = useState({ fullName: '', username: '', email: '', phone: '', role: 'CLASSIFIER' as UserRole });

  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const modalTrapRef = useFocusTrap(modal.mode !== 'closed');

  // --- Load list ---
  const refreshList = useCallback(async () => {
    if (!session) return;

    dispatchList({ type: 'fetch' });

    try {
      const response = await listUsers(session, {
        search: appliedSearch || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        page: listState.currentPage,
        limit: PAGE_LIMIT
      });

      dispatchList({
        type: 'success',
        items: response.items,
        total: response.page.total,
        totalPages: response.page.totalPages,
        hasPrev: response.page.hasPrev,
        hasNext: response.page.hasNext
      });
    } catch (cause) {
      dispatchList({ type: 'error', message: cause instanceof ApiError ? cause.message : 'Falha ao carregar usuarios' });
    }
  }, [appliedSearch, listState.currentPage, roleFilter, session, statusFilter]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  // --- Load detail when modal opens ---
  useEffect(() => {
    if (modal.mode === 'closed' || modal.mode === 'create' || !session) return;

    const userId = modal.user?.id;
    if (!userId && modal.loading) return;
    if (!userId) return;

    let active = true;

    getUser(session, userId)
      .then((response) => {
        if (!active) return;
        dispatchModal({ type: 'detailSuccess', user: response.user });
        setEditForm({
          fullName: response.user.fullName,
          username: response.user.username,
          email: response.user.email,
          phone: response.user.phone ?? '',
          role: response.user.role
        });
      })
      .catch((cause) => {
        if (!active) return;
        dispatchModal({ type: 'detailError', message: cause instanceof ApiError ? cause.message : 'Falha ao carregar usuario' });
      });

    return () => { active = false; };
  }, [modal.mode, modal.user?.id, session]);

  // --- Modal focus & scroll lock ---
  useEffect(() => {
    if (modal.mode === 'closed') return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !modal.saving) {
        event.preventDefault();
        closeModal();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
    };
  }, [modal.mode, modal.saving]);

  if (loading || !session) return null;

  // --- Handlers ---

  function openUserDetail(userId: string, trigger: HTMLButtonElement) {
    lastTriggerRef.current = trigger;
    dispatchModal({ type: 'openView', userId });
    // Temporarily set user id so useEffect can fetch
    dispatchModal({ type: 'detailSuccess', user: { id: userId } as UserSummary });
    dispatchModal({ type: 'fetchDetail' });
  }

  function openCreateModal(trigger: HTMLButtonElement) {
    lastTriggerRef.current = trigger;
    setCreateForm(blankCreateForm());
    dispatchModal({ type: 'openCreate' });
  }

  function closeModal() {
    if (modal.saving) return;
    dispatchModal({ type: 'close' });
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
    dispatchList({ type: 'setPage', page: 1 });
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!createForm.fullName.trim() || !createForm.username.trim() || !createForm.email.trim() || !createForm.password.trim()) {
      dispatchModal({ type: 'saveError', message: 'Preencha todos os campos obrigatorios' });
      return;
    }

    dispatchModal({ type: 'saving' });

    try {
      const response = await createUser(session!, {
        fullName: createForm.fullName,
        username: createForm.username,
        email: createForm.email,
        phone: createForm.phone || null,
        password: createForm.password,
        role: createForm.role
      });

      dispatchModal({
        type: 'saveSuccess',
        user: response.user,
        message: `Usuario criado. Senha: ${response.generatedPassword}`
      });
      setEditForm({
        fullName: response.user.fullName,
        username: response.user.username,
        email: response.user.email,
        phone: response.user.phone ?? '',
        role: response.user.role
      });
      refreshList();
    } catch (cause) {
      dispatchModal({ type: 'saveError', message: cause instanceof ApiError ? cause.message : 'Falha ao criar usuario' });
    }
  }

  async function handleEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!modal.user || !editForm.fullName.trim() || !editForm.username.trim() || !editForm.email.trim()) {
      dispatchModal({ type: 'saveError', message: 'Preencha todos os campos obrigatorios' });
      return;
    }

    dispatchModal({ type: 'saving' });

    try {
      const response = await updateUser(session!, modal.user.id, {
        fullName: editForm.fullName,
        username: editForm.username,
        email: editForm.email,
        phone: editForm.phone || null,
        role: editForm.role
      });

      dispatchModal({
        type: 'saveSuccess',
        user: response.user,
        message: response.sessionRevoked ? 'Atualizado. Sessoes do usuario encerradas.' : 'Usuario atualizado.'
      });
      refreshList();
    } catch (cause) {
      dispatchModal({ type: 'saveError', message: cause instanceof ApiError ? cause.message : 'Falha ao atualizar' });
    }
  }

  async function handleInactivate() {
    if (!modal.user) return;
    const reasonText = window.prompt('Informe o motivo da inativacao:');
    if (!reasonText) return;

    dispatchModal({ type: 'saving' });

    try {
      const response = await inactivateUser(session!, modal.user.id, reasonText);
      dispatchModal({ type: 'actionSuccess', user: response.user, message: 'Usuario inativado.' });
      refreshList();
    } catch (cause) {
      dispatchModal({ type: 'saveError', message: cause instanceof ApiError ? cause.message : 'Falha ao inativar' });
    }
  }

  async function handleReactivate() {
    if (!modal.user) return;

    dispatchModal({ type: 'saving' });

    try {
      const response = await reactivateUser(session!, modal.user.id);
      dispatchModal({ type: 'actionSuccess', user: response.user, message: 'Usuario reativado.' });
      refreshList();
    } catch (cause) {
      dispatchModal({ type: 'saveError', message: cause instanceof ApiError ? cause.message : 'Falha ao reativar' });
    }
  }

  async function handleUnlock() {
    if (!modal.user) return;

    dispatchModal({ type: 'saving' });

    try {
      const response = await unlockUser(session!, modal.user.id);
      dispatchModal({ type: 'actionSuccess', user: response.user, message: 'Usuario desbloqueado.' });
      refreshList();
    } catch (cause) {
      dispatchModal({ type: 'saveError', message: cause instanceof ApiError ? cause.message : 'Falha ao desbloquear' });
    }
  }

  async function handlePasswordReset() {
    if (!modal.user) return;
    const password = window.prompt('Informe a nova senha do usuario:');
    if (!password) return;

    dispatchModal({ type: 'saving' });

    try {
      const response = await resetUserPassword(session!, modal.user.id, password);
      dispatchModal({ type: 'actionSuccess', user: response.user, message: `Senha redefinida: ${response.generatedPassword}` });
    } catch (cause) {
      dispatchModal({ type: 'saveError', message: cause instanceof ApiError ? cause.message : 'Falha ao redefinir senha' });
    }
  }

  const totalLabel = listState.loading ? 'Carregando...' : `${listState.total} usuarios`;

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="samples-page-panel">
        <div className="samples-page-toolbar">
          <form className="samples-page-search-bar" onSubmit={handleSearchSubmit}>
            <div className="sample-search-field samples-page-search-field">
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Nome, usuario ou email"
              />
              <button type="submit" className="samples-page-search-submit-icon" aria-label="Buscar">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.2 16.2 4.1 4.1" />
                </svg>
              </button>
            </div>

            <button
              type="button"
              className="samples-page-filter-toggle"
              aria-label="Filtrar por perfil"
              onClick={() => {
                if (roleFilter) {
                  setRoleFilter('');
                  setStatusFilter('');
                  dispatchList({ type: 'setPage', page: 1 });
                } else {
                  const nextRole = ROLE_OPTIONS[(ROLE_OPTIONS.indexOf(roleFilter as UserRole) + 1) % ROLE_OPTIONS.length];
                  setRoleFilter(nextRole);
                  dispatchList({ type: 'setPage', page: 1 });
                }
              }}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M7 12h10" />
                <path d="M10 18h4" />
              </svg>
            </button>

            <button
              type="button"
              className="samples-page-create-client-button"
              aria-label="Novo usuario"
              onClick={(event) => openCreateModal(event.currentTarget)}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
          </form>

          {(roleFilter || statusFilter) ? (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {roleFilter ? (
                <button
                  type="button"
                  className="app-modal-chip"
                  onClick={() => { setRoleFilter(''); dispatchList({ type: 'setPage', page: 1 }); }}
                  style={{ cursor: 'pointer' }}
                >
                  {getRoleLabel(roleFilter)} ×
                </button>
              ) : null}
              {statusFilter ? (
                <button
                  type="button"
                  className="app-modal-chip"
                  onClick={() => { setStatusFilter(''); dispatchList({ type: 'setPage', page: 1 }); }}
                  style={{ cursor: 'pointer' }}
                >
                  {statusFilter === 'ACTIVE' ? 'Ativo' : 'Inativo'} ×
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {listState.error ? (
          <section className="samples-page-list-area">
            <p className="error" style={{ margin: 0, padding: '1rem' }}>{listState.error}</p>
          </section>
        ) : listState.loading ? (
          <section className="samples-page-list-area">
            <header className="samples-page-list-header">
              <p className="samples-page-list-total">{totalLabel}</p>
            </header>
            <div className="samples-page-list-state">
              <p className="samples-page-empty">Carregando usuarios...</p>
            </div>
          </section>
        ) : listState.items.length === 0 ? (
          <section className="samples-page-list-area">
            <header className="samples-page-list-header">
              <p className="samples-page-list-total">{totalLabel}</p>
            </header>
            <div className="samples-page-list-state">
              <p className="samples-page-empty">
                {appliedSearch ? 'Nenhum usuario encontrado para a pesquisa.' : 'Nenhum usuario cadastrado.'}
              </p>
            </div>
          </section>
        ) : (
          <section className="samples-page-list-area">
            <header className="samples-page-list-header">
              <p className="samples-page-list-total">{totalLabel}</p>
            </header>
            <div ref={scrollRef} className="samples-page-list-scroll" aria-label="Lista de usuarios" tabIndex={-1}>
              <div className="samples-page-list">
                {listState.items.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className={`samples-page-item records-client-card ${userStatusThemeClass(user.status)}`}
                    onClick={(event) => openUserDetail(user.id, event.currentTarget)}
                  >
                    <div className="samples-page-item-main">
                      <p className="dashboard-latest-registration-title">{user.fullName}</p>
                      <p className="dashboard-latest-registration-subtitle">{formatUserCardSummary(user)}</p>
                      <p className="dashboard-latest-registration-meta">{formatUserCardMeta(user)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        <footer className="samples-page-footer">
          <div className="samples-page-pagination-controls" role="group" aria-label="Paginacao">
            <button
              type="button"
              className="samples-page-pagination-button"
              aria-label="Pagina anterior"
              disabled={!listState.hasPrev || listState.loading}
              onClick={() => dispatchList({ type: 'setPage', page: listState.currentPage - 1 })}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="m14.5 6-6 6 6 6" />
              </svg>
            </button>
            <p className="samples-page-pagination-counter">
              <strong>{listState.currentPage}</strong>
              <span>/</span>
              <span>{listState.totalPages}</span>
            </p>
            <button
              type="button"
              className="samples-page-pagination-button"
              aria-label="Proxima pagina"
              disabled={!listState.hasNext || listState.loading}
              onClick={() => dispatchList({ type: 'setPage', page: listState.currentPage + 1 })}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="m9.5 6 6 6-6 6" />
              </svg>
            </button>
          </div>
        </footer>
      </section>

      {/* --- Detail / Edit Modal --- */}
      {modal.mode === 'view' || modal.mode === 'edit' ? (
        <div className="client-modal-backdrop" onClick={closeModal}>
          <section
            ref={modalTrapRef}
            className="client-modal panel stack records-client-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="client-modal-header">
              <div className="records-client-detail-header-copy">
                <h3 id="user-detail-title" style={{ margin: 0 }}>
                  {modal.user?.fullName ?? 'Usuario'}
                </h3>
                {modal.user && !modal.loading ? (
                  <div className="records-client-detail-header-meta">
                    <span className="records-client-detail-code">{modal.user.username}</span>
                    <span className={`status-badge records-client-status-badge ${modal.user.status === 'ACTIVE' ? 'status-badge-success' : 'status-badge-danger'}`}>
                      {userStatusLabel(modal.user.status)}
                    </span>
                    {modal.user.isLocked ? (
                      <span className="status-badge records-client-status-badge status-badge-warning">Bloqueado</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="records-client-detail-close"
                onClick={closeModal}
                aria-label="Fechar"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            {modal.loading ? (
              <p style={{ margin: 0, color: 'var(--muted)' }}>Carregando...</p>
            ) : modal.error && !modal.user ? (
              <p className="error" style={{ margin: 0 }}>{modal.error}</p>
            ) : modal.user ? (
              <>
                {modal.mode === 'view' ? (
                  <article className="panel stack records-client-detail-summary">
                    <p className="records-client-detail-line"><strong>Email:</strong> {modal.user.email}</p>
                    <p className="records-client-detail-line"><strong>Telefone:</strong> {modal.user.phone ?? 'Nao informado'}</p>
                    <p className="records-client-detail-line"><strong>Perfil:</strong> {getRoleLabel(modal.user.role)}</p>
                    <p className="records-client-detail-line"><strong>Criado em:</strong> {new Date(modal.user.createdAt).toLocaleDateString('pt-BR')}</p>
                    {modal.user.lastLoginAt ? (
                      <p className="records-client-detail-line"><strong>Ultimo acesso:</strong> {new Date(modal.user.lastLoginAt).toLocaleString('pt-BR')}</p>
                    ) : null}
                    {modal.user.pendingEmailChange ? (
                      <p className="records-client-detail-line"><strong>Email pendente:</strong> {modal.user.pendingEmailChange.newEmail}</p>
                    ) : null}
                  </article>
                ) : (
                  <form className="stack" onSubmit={handleEdit}>
                    <label>
                      Nome completo
                      <input value={editForm.fullName} onChange={(e) => setEditForm((c) => ({ ...c, fullName: e.target.value }))} />
                    </label>
                    <label>
                      Usuario
                      <input value={editForm.username} onChange={(e) => setEditForm((c) => ({ ...c, username: e.target.value }))} />
                    </label>
                    <label>
                      Email
                      <input value={editForm.email} onChange={(e) => setEditForm((c) => ({ ...c, email: e.target.value }))} />
                    </label>
                    <label>
                      Telefone
                      <input value={editForm.phone} onChange={(e) => setEditForm((c) => ({ ...c, phone: e.target.value }))} />
                    </label>
                    <label>
                      Perfil
                      <select value={editForm.role} onChange={(e) => setEditForm((c) => ({ ...c, role: e.target.value as UserRole }))}>
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>{getRoleLabel(role)}</option>
                        ))}
                      </select>
                    </label>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button type="submit" disabled={modal.saving}>
                        {modal.saving ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button type="button" className="secondary-button" onClick={() => dispatchModal({ type: 'close' })} disabled={modal.saving}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}

                {modal.error ? <p className="error" style={{ margin: 0 }}>{modal.error}</p> : null}
                {modal.message ? <p style={{ margin: 0, color: 'var(--muted)' }}>{modal.message}</p> : null}

                {modal.mode === 'view' ? (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => dispatchModal({ type: 'switchToEdit' })} disabled={modal.saving}>
                      Editar
                    </button>
                    {modal.user.status === 'ACTIVE' ? (
                      <button type="button" className="secondary-button" onClick={handleInactivate} disabled={modal.saving}>
                        Inativar
                      </button>
                    ) : (
                      <button type="button" className="secondary-button" onClick={handleReactivate} disabled={modal.saving}>
                        Reativar
                      </button>
                    )}
                    {modal.user.isLocked ? (
                      <button type="button" className="secondary-button" onClick={handleUnlock} disabled={modal.saving}>
                        Desbloquear
                      </button>
                    ) : null}
                    <button type="button" className="secondary-button" onClick={handlePasswordReset} disabled={modal.saving}>
                      Redefinir senha
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {/* --- Create Modal --- */}
      {modal.mode === 'create' ? (
        <div className="client-modal-backdrop" onClick={closeModal}>
          <section
            ref={modalTrapRef}
            className="client-modal panel stack records-client-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-create-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="client-modal-header">
              <h3 id="user-create-title" style={{ margin: 0 }}>Novo usuario</h3>
              <button
                ref={closeButtonRef}
                type="button"
                className="records-client-detail-close"
                onClick={closeModal}
                aria-label="Fechar"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <form className="stack" onSubmit={handleCreate}>
              <label>
                Nome completo
                <input value={createForm.fullName} onChange={(e) => setCreateForm((c) => ({ ...c, fullName: e.target.value }))} />
              </label>
              <label>
                Usuario
                <input value={createForm.username} onChange={(e) => setCreateForm((c) => ({ ...c, username: e.target.value }))} />
              </label>
              <label>
                Email
                <input value={createForm.email} onChange={(e) => setCreateForm((c) => ({ ...c, email: e.target.value }))} autoComplete="email" />
              </label>
              <label>
                Telefone
                <input value={createForm.phone} onChange={(e) => setCreateForm((c) => ({ ...c, phone: e.target.value }))} />
              </label>
              <label>
                Perfil
                <select value={createForm.role} onChange={(e) => setCreateForm((c) => ({ ...c, role: e.target.value as UserRole }))}>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>{getRoleLabel(role)}</option>
                  ))}
                </select>
              </label>
              <label>
                Senha inicial
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((c) => ({ ...c, password: e.target.value }))}
                  autoComplete="new-password"
                  placeholder="Minimo de 8 caracteres"
                />
              </label>

              {modal.error ? <p className="error" style={{ margin: 0 }}>{modal.error}</p> : null}
              {modal.message ? <p style={{ margin: 0, color: 'var(--muted)' }}>{modal.message}</p> : null}

              <button type="submit" disabled={modal.saving}>
                {modal.saving ? 'Criando...' : 'Criar usuario'}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
