'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

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
  updateUser,
} from '../../lib/api-client';
import { maskPhoneInput } from '../../lib/client-field-formatters';
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

// brand-green / brand-green-soft (paleta Safras)
const AVATAR_COLORS = [
  '#1f5d43',
  '#2f6b4a',
  '#0D47A1',
  '#1565C0',
  '#4E342E',
  '#AD1457',
  '#C62828',
  '#6A1B9A',
  '#4527A0',
  '#00695C',
  '#E65100',
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getUserAvatarColor(name: string): string {
  return AVATAR_COLORS[hashStr(name) % AVATAR_COLORS.length];
}

function getUserInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getRoleModifierClass(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return 'is-role-admin';
    case 'CLASSIFIER':
      return 'is-role-classifier';
    case 'REGISTRATION':
      return 'is-role-registration';
    case 'COMMERCIAL':
      return 'is-role-commercial';
    default:
      return '';
  }
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
    role: 'CLASSIFIER' as UserRole,
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
  | {
      type: 'success';
      items: UserSummary[];
      total: number;
      totalPages: number;
      hasPrev: boolean;
      hasNext: boolean;
    }
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
  error: null,
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
        error: null,
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
  message: null,
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
      return {
        ...MODAL_INITIAL,
        mode: 'view',
        loading: true,
        user: action.userId ? ({ id: action.userId } as UserSummary) : null,
      };
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
  const [editForm, setEditForm] = useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    role: 'CLASSIFIER' as UserRole,
  });

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
        limit: PAGE_LIMIT,
      });

      dispatchList({
        type: 'success',
        items: response.items,
        total: response.page.total,
        totalPages: response.page.totalPages,
        hasPrev: response.page.hasPrev,
        hasNext: response.page.hasNext,
      });
    } catch (cause) {
      dispatchList({
        type: 'error',
        message: cause instanceof ApiError ? cause.message : 'Falha ao carregar usuarios',
      });
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
          phone: maskPhoneInput(response.user.phone ?? ''),
          role: response.user.role,
        });
      })
      .catch((cause) => {
        if (!active) return;
        dispatchModal({
          type: 'detailError',
          message: cause instanceof ApiError ? cause.message : 'Falha ao carregar usuario',
        });
      });

    return () => {
      active = false;
    };
    // modal.loading e lido como guard mas nao deve disparar reload (loading e setado pelo proprio effect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // closeModal e funcao local nao memoizada; reage so a abertura/saving do modal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal.mode, modal.saving]);

  if (loading || !session) return null;

  // --- Handlers ---

  function openUserDetail(userId: string, trigger: HTMLButtonElement) {
    lastTriggerRef.current = trigger;
    const cached = listState.items.find((u) => u.id === userId) ?? null;
    dispatchModal({ type: 'openView', userId });
    if (cached) {
      dispatchModal({ type: 'detailSuccess', user: cached });
      setEditForm({
        fullName: cached.fullName,
        username: cached.username,
        email: cached.email,
        phone: maskPhoneInput(cached.phone ?? ''),
        role: cached.role,
      });
    }
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

    if (
      !createForm.fullName.trim() ||
      !createForm.username.trim() ||
      !createForm.email.trim() ||
      !createForm.password.trim()
    ) {
      dispatchModal({ type: 'saveError', message: 'Preencha todos os campos obrigatorios' });
      return;
    }

    const phoneDigits = createForm.phone.replace(/\D/g, '');
    if (phoneDigits.length > 0 && phoneDigits.length !== 10 && phoneDigits.length !== 11) {
      dispatchModal({ type: 'saveError', message: 'Telefone deve ter 10 ou 11 digitos' });
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
        role: createForm.role,
      });

      dispatchModal({
        type: 'saveSuccess',
        user: response.user,
        message: `Usuario criado. Senha: ${response.generatedPassword}`,
      });
      setEditForm({
        fullName: response.user.fullName,
        username: response.user.username,
        email: response.user.email,
        phone: maskPhoneInput(response.user.phone ?? ''),
        role: response.user.role,
      });
      refreshList();
    } catch (cause) {
      dispatchModal({
        type: 'saveError',
        message: cause instanceof ApiError ? cause.message : 'Falha ao criar usuario',
      });
    }
  }

  async function handleEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !modal.user ||
      !editForm.fullName.trim() ||
      !editForm.username.trim() ||
      !editForm.email.trim()
    ) {
      dispatchModal({ type: 'saveError', message: 'Preencha todos os campos obrigatorios' });
      return;
    }

    const phoneDigits = editForm.phone.replace(/\D/g, '');
    if (phoneDigits.length > 0 && phoneDigits.length !== 10 && phoneDigits.length !== 11) {
      dispatchModal({ type: 'saveError', message: 'Telefone deve ter 10 ou 11 digitos' });
      return;
    }

    dispatchModal({ type: 'saving' });

    try {
      const response = await updateUser(session!, modal.user.id, {
        fullName: editForm.fullName,
        username: editForm.username,
        email: editForm.email,
        phone: editForm.phone || null,
        role: editForm.role,
      });

      dispatchModal({
        type: 'saveSuccess',
        user: response.user,
        message: response.sessionRevoked
          ? 'Atualizado. Sessoes do usuario encerradas.'
          : 'Usuario atualizado.',
      });
      refreshList();
    } catch (cause) {
      dispatchModal({
        type: 'saveError',
        message: cause instanceof ApiError ? cause.message : 'Falha ao atualizar',
      });
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
      dispatchModal({
        type: 'saveError',
        message: cause instanceof ApiError ? cause.message : 'Falha ao inativar',
      });
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
      dispatchModal({
        type: 'saveError',
        message: cause instanceof ApiError ? cause.message : 'Falha ao reativar',
      });
    }
  }

  async function handleUnlock() {
    if (!modal.user) return;

    dispatchModal({ type: 'saving' });

    try {
      const response = await unlockUser(session!, modal.user.id);
      dispatchModal({
        type: 'actionSuccess',
        user: response.user,
        message: 'Usuario desbloqueado.',
      });
      refreshList();
    } catch (cause) {
      dispatchModal({
        type: 'saveError',
        message: cause instanceof ApiError ? cause.message : 'Falha ao desbloquear',
      });
    }
  }

  async function handlePasswordReset() {
    if (!modal.user) return;
    const password = window.prompt('Informe a nova senha do usuario:');
    if (!password) return;

    dispatchModal({ type: 'saving' });

    try {
      const response = await resetUserPassword(session!, modal.user.id, password);
      dispatchModal({
        type: 'actionSuccess',
        user: response.user,
        message: `Senha redefinida: ${response.generatedPassword}`,
      });
    } catch (cause) {
      dispatchModal({
        type: 'saveError',
        message: cause instanceof ApiError ? cause.message : 'Falha ao redefinir senha',
      });
    }
  }

  const userFullName = session.user.fullName ?? session.user.username;
  const userAvatarInitials = userFullName
    .split(' ')
    .map((w: string) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

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
            <h2 className="nsv2-title">Usuarios</h2>
          </div>
          <button
            type="button"
            className="nsv2-avatar"
            aria-label="Perfil"
            onClick={() => window.dispatchEvent(new CustomEvent('open-profile-sheet'))}
          >
            <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
          </button>
        </header>

        <div className="hero-search-wrap">
          <form className="hero-search-bar" role="search" onSubmit={handleSearchSubmit}>
            <svg
              className="hero-search-icon"
              viewBox="0 0 24 24"
              focusable="false"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m16.2 16.2 4.1 4.1" />
            </svg>
            <input
              className="hero-search-input"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar por nome ou email..."
              autoComplete="off"
              spellCheck={false}
            />
          </form>
        </div>

        <section className="clients-v2-sheet">
          {/* Count */}
          <div className="spv2-list-meta">
            <span className="spv2-list-count">{listState.total} usuarios</span>
          </div>

          {/* List */}
          {listState.loading ? (
            <div className="spv2-list-scroll">
              <div className="spv2-empty">
                <p className="spv2-empty-text">Carregando...</p>
              </div>
            </div>
          ) : listState.items.length === 0 ? (
            <div className="spv2-list-scroll">
              <div className="spv2-empty">
                <svg className="cv2-empty-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <p className="spv2-empty-text">Nenhum usuario encontrado</p>
                <p className="spv2-empty-sub">Tente outro termo de busca</p>
              </div>
            </div>
          ) : (
            <div ref={scrollRef} className="spv2-list-scroll" tabIndex={-1}>
              {listState.items.map((user, i) => {
                const avatarColor = getUserAvatarColor(user.fullName);
                const initials = getUserInitials(user.fullName);
                const roleModifier = getRoleModifierClass(user.role);
                return (
                  <button
                    key={user.id}
                    type="button"
                    className="cv2-card"
                    style={
                      {
                        animationDelay: `${i * 0.04}s`,
                        '--avatar-color': avatarColor,
                      } as React.CSSProperties
                    }
                    onClick={(event) => openUserDetail(user.id, event.currentTarget)}
                  >
                    <span className="cv2-card-avatar">
                      <span>{initials}</span>
                    </span>
                    <div className="cv2-card-content">
                      <div className="cv2-card-top">
                        <span className="cv2-card-name">{user.fullName}</span>
                        <span className={`cv2-card-role ${roleModifier}`}>
                          {getRoleLabel(user.role)}
                        </span>
                      </div>
                      <div className="cv2-card-bottom">
                        <span className="usr-card-email">{user.email}</span>
                        {user.status !== 'ACTIVE' ? (
                          <span className="cv2-card-role is-none">Inativo</span>
                        ) : null}
                        {user.isLocked ? (
                          <span className="cv2-card-role is-locked">Bloqueado</span>
                        ) : null}
                      </div>
                    </div>
                    <svg className="spv2-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          <footer className="spv2-footer">
            <button
              type="button"
              className="spv2-page-btn"
              disabled={!listState.hasPrev || listState.loading}
              onClick={() => dispatchList({ type: 'setPage', page: listState.currentPage - 1 })}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m14.5 6-6 6 6 6" />
              </svg>
            </button>
            <span className="spv2-page-info">
              <strong>{listState.currentPage}</strong> / {listState.totalPages}
            </span>
            <button
              type="button"
              className="spv2-page-btn"
              disabled={!listState.hasNext || listState.loading}
              onClick={() => dispatchList({ type: 'setPage', page: listState.currentPage + 1 })}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9.5 6 6 6-6 6" />
              </svg>
            </button>
          </footer>
        </section>
      </section>

      {/* FAB */}
      <button
        type="button"
        className="cv2-fab"
        aria-label="Novo usuario"
        onClick={(event) => openCreateModal(event.currentTarget)}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>

      {/* Detail / Edit Modal */}
      {modal.mode === 'view' || modal.mode === 'edit' ? (
        <div className="app-modal-backdrop" onClick={closeModal}>
          <section
            ref={modalTrapRef}
            className="app-modal cdm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            {modal.user && modal.user.fullName ? (
              (() => {
                const detailColor = getUserAvatarColor(modal.user.fullName);
                const detailInit = getUserInitials(modal.user.fullName);
                return (
                  <div className="cdm-header">
                    <span
                      className="cdm-header-avatar"
                      style={{ '--avatar-color': detailColor } as React.CSSProperties}
                    >
                      <span>{detailInit}</span>
                    </span>
                    <div className="cdm-header-copy">
                      <h3 className="cdm-header-name">{modal.user.fullName}</h3>
                      <div className="cdm-header-meta">
                        <span className="cdm-header-code">@{modal.user.username}</span>
                        <span
                          className={`cdm-header-status ${modal.user.status === 'ACTIVE' ? 'is-active' : 'is-inactive'}`}
                        >
                          {userStatusLabel(modal.user.status)}
                        </span>
                        {modal.user.isLocked ? (
                          <span className="cdm-header-status is-locked">Bloqueado</span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      ref={closeButtonRef}
                      type="button"
                      className="cdm-close"
                      onClick={closeModal}
                      aria-label="Fechar"
                    >
                      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })()
            ) : (
              <div className="cdm-header">
                <h3 className="cdm-header-name is-fill">Usuario</h3>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="cdm-close"
                  onClick={closeModal}
                  aria-label="Fechar"
                >
                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            )}

            {modal.loading ? (
              <div className="cdm-loading">Carregando...</div>
            ) : modal.error && !modal.user ? (
              <div className="cdm-error">{modal.error}</div>
            ) : modal.user ? (
              <>
                {modal.mode === 'view' ? (
                  <>
                    <div className="cdm-info-grid">
                      <div className="cdm-info-row">
                        <div className="cdm-info-item">
                          <span className="cdm-info-label">Email</span>
                          <span className="cdm-info-value">{modal.user.email}</span>
                        </div>
                        <div className="cdm-info-item">
                          <span className="cdm-info-label">Telefone</span>
                          <span className="cdm-info-value">
                            {modal.user.phone ?? 'Nao informado'}
                          </span>
                        </div>
                      </div>
                      <div className="cdm-info-row">
                        <div className="cdm-info-item">
                          <span className="cdm-info-label">Perfil</span>
                          <span
                            className={`cdm-type-badge ${getRoleModifierClass(modal.user!.role)}`}
                          >
                            {getRoleLabel(modal.user!.role)}
                          </span>
                        </div>
                        <div className="cdm-info-item">
                          <span className="cdm-info-label">Criado em</span>
                          <span className="cdm-info-value">
                            {new Date(modal.user.createdAt).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {modal.error ? <p className="usr-feedback is-error">{modal.error}</p> : null}
                    {modal.message ? (
                      <p className="usr-feedback is-success">{modal.message}</p>
                    ) : null}

                    <div className="sdv-edit-actions">
                      <button
                        type="button"
                        className="cdm-manage-link"
                        onClick={() => dispatchModal({ type: 'switchToEdit' })}
                        disabled={modal.saving}
                      >
                        Editar
                      </button>
                    </div>
                    <div className="usr-action-grid">
                      {modal.user.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          className="sdv-com-action-loss"
                          onClick={handleInactivate}
                          disabled={modal.saving}
                        >
                          Inativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="sdv-cls-action-complete"
                          onClick={handleReactivate}
                          disabled={modal.saving}
                        >
                          Reativar
                        </button>
                      )}
                      {modal.user.isLocked ? (
                        <button
                          type="button"
                          className="sdv-cls-action-complete"
                          onClick={handleUnlock}
                          disabled={modal.saving}
                        >
                          Desbloquear
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="sdv-cls-action-save"
                        onClick={handlePasswordReset}
                        disabled={modal.saving}
                      >
                        Redefinir senha
                      </button>
                    </div>
                  </>
                ) : (
                  <form className="sdv-edit-fields" onSubmit={handleEdit}>
                    <div className="sdv-edit-row">
                      <label className="sdv-edit-field">
                        <span className="sdv-edit-label">Nome completo</span>
                        <input
                          className="sdv-edit-input"
                          value={editForm.fullName}
                          onChange={(e) => setEditForm((c) => ({ ...c, fullName: e.target.value }))}
                        />
                      </label>
                      <label className="sdv-edit-field">
                        <span className="sdv-edit-label">Usuario</span>
                        <input
                          className="sdv-edit-input"
                          value={editForm.username}
                          onChange={(e) => setEditForm((c) => ({ ...c, username: e.target.value }))}
                        />
                      </label>
                    </div>
                    <label className="sdv-edit-field">
                      <span className="sdv-edit-label">Email</span>
                      <input
                        className="sdv-edit-input"
                        value={editForm.email}
                        onChange={(e) => setEditForm((c) => ({ ...c, email: e.target.value }))}
                      />
                    </label>
                    <div className="sdv-edit-row">
                      <label className="sdv-edit-field">
                        <span className="sdv-edit-label">Telefone</span>
                        <input
                          className="sdv-edit-input"
                          value={editForm.phone}
                          onChange={(e) =>
                            setEditForm((c) => ({ ...c, phone: maskPhoneInput(e.target.value) }))
                          }
                          placeholder="(00) 00000-0000"
                          inputMode="tel"
                        />
                      </label>
                      <label className="sdv-edit-field">
                        <span className="sdv-edit-label">Perfil</span>
                        <select
                          className="sdv-edit-input"
                          value={editForm.role}
                          onChange={(e) =>
                            setEditForm((c) => ({ ...c, role: e.target.value as UserRole }))
                          }
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {getRoleLabel(role)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {modal.error ? <p className="usr-feedback is-error">{modal.error}</p> : null}
                    <div className="sdv-edit-actions">
                      <button
                        type="submit"
                        className={`cdm-manage-link${modal.saving ? ' is-saving' : ''}`}
                        disabled={modal.saving}
                      >
                        {modal.saving ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {/* Create Modal */}
      {modal.mode === 'create' ? (
        <div className="app-modal-backdrop" onClick={closeModal}>
          <section
            ref={modalTrapRef}
            className="app-modal cdm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cdm-header">
              <h3 className="cdm-header-name is-fill">Novo usuario</h3>
              <button
                ref={closeButtonRef}
                type="button"
                className="cdm-close"
                onClick={closeModal}
                aria-label="Fechar"
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <form className="sdv-edit-fields" onSubmit={handleCreate}>
              <div className="sdv-edit-row">
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Nome completo</span>
                  <input
                    className="sdv-edit-input"
                    value={createForm.fullName}
                    onChange={(e) => setCreateForm((c) => ({ ...c, fullName: e.target.value }))}
                  />
                </label>
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Usuario</span>
                  <input
                    className="sdv-edit-input"
                    value={createForm.username}
                    onChange={(e) => setCreateForm((c) => ({ ...c, username: e.target.value }))}
                  />
                </label>
              </div>
              <label className="sdv-edit-field">
                <span className="sdv-edit-label">Email</span>
                <input
                  className="sdv-edit-input"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((c) => ({ ...c, email: e.target.value }))}
                  autoComplete="email"
                />
              </label>
              <div className="sdv-edit-row">
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Telefone</span>
                  <input
                    className="sdv-edit-input"
                    value={createForm.phone}
                    onChange={(e) =>
                      setCreateForm((c) => ({ ...c, phone: maskPhoneInput(e.target.value) }))
                    }
                    placeholder="(00) 00000-0000"
                    inputMode="tel"
                  />
                </label>
                <label className="sdv-edit-field">
                  <span className="sdv-edit-label">Perfil</span>
                  <select
                    className="sdv-edit-input"
                    value={createForm.role}
                    onChange={(e) =>
                      setCreateForm((c) => ({ ...c, role: e.target.value as UserRole }))
                    }
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {getRoleLabel(role)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="sdv-edit-field">
                <span className="sdv-edit-label">Senha inicial</span>
                <input
                  className="sdv-edit-input"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((c) => ({ ...c, password: e.target.value }))}
                  autoComplete="new-password"
                  placeholder="Minimo 8 caracteres"
                />
              </label>

              {modal.error ? <p className="usr-feedback is-error">{modal.error}</p> : null}
              {modal.message ? <p className="usr-feedback is-success">{modal.message}</p> : null}

              <div className="sdv-edit-actions">
                <button
                  type="submit"
                  className={`cdm-manage-link${modal.saving ? ' is-saving' : ''}`}
                  disabled={modal.saving}
                >
                  {modal.saving ? 'Criando...' : 'Criar usuario'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
