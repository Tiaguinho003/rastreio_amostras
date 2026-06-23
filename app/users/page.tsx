'use client';

import Link from 'next/link';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { InactivateUserModal } from '../../components/users/InactivateUserModal';
import {
  ApiError,
  createUser,
  getUser,
  listUsers,
  reactivateUser,
  resetUserPassword,
  unlockUser,
  updateUser,
} from '../../lib/api-client';
import { maskPhoneInput } from '../../lib/client-field-formatters';
import { useToast } from '../../lib/toast/ToastProvider';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { getRoleLabel } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';
import type { UserRole, UserStatus, UserSummary } from '../../lib/types';

const ROLE_OPTIONS: UserRole[] = [
  'ADMIN',
  'CLASSIFIER',
  'REGISTRATION',
  'CADASTRO',
  'COMMERCIAL',
  'PROSPECTOR',
];
// Scroll infinito: cada fetch traz ate 30 (cap backend 60). Espelha /clients.
const USER_PAGE_LIMIT = 30;
// rootMargin '0px': sentinel so dispara o load-more quando ja esta visivel
// (sem prefetch agressivo). Mesmo valor de /clients.
const USER_LOAD_MORE_ROOT_MARGIN = '0px';

// Avatar unificado no verde da marca (decisao 2026-06): todos os usuarios usam
// o mesmo verde do /clients. O gradiente + sombra derivam de --avatar-color.
const USER_AVATAR_COLOR = '#1f5d43';

function userStatusLabel(status: UserStatus) {
  return status === 'ACTIVE' ? 'Ativo' : 'Inativo';
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
    case 'PROSPECTOR':
      return 'is-role-prospector';
    default:
      return '';
  }
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

// --- List state (scroll infinito por cursor, espelha /clients) ---

type UserCursor = { fullName: string; id: string };
type UsersListStatus = 'loading-initial' | 'loading-more' | 'idle' | 'error';

interface UsersListState {
  items: UserSummary[];
  total: number;
  nextCursor: UserCursor | null;
  status: UsersListStatus;
  error: string | null;
  // indice (no array merged) do primeiro card recem-chegado, p/ animar SO os
  // novos cards na cascade row-major. null = nenhum batch novo pendente.
  firstNewIndex: number | null;
}

type UsersListAction =
  | { type: 'fetch-initial' }
  | { type: 'fetch-more' }
  | { type: 'success-initial'; items: UserSummary[]; total: number; nextCursor: UserCursor | null }
  | { type: 'success-more'; items: UserSummary[]; nextCursor: UserCursor | null }
  | { type: 'error'; message: string };

const USERS_INITIAL: UsersListState = {
  items: [],
  total: 0,
  nextCursor: null,
  status: 'loading-initial',
  error: null,
  firstNewIndex: null,
};

function usersListReducer(state: UsersListState, action: UsersListAction): UsersListState {
  switch (action.type) {
    case 'fetch-initial':
      return { ...USERS_INITIAL, status: 'loading-initial' };
    case 'fetch-more':
      return { ...state, status: 'loading-more', error: null };
    case 'success-initial':
      return {
        ...state,
        items: action.items,
        total: action.total,
        nextCursor: action.nextCursor,
        status: 'idle',
        error: null,
        firstNewIndex: 0,
      };
    case 'success-more':
      return {
        ...state,
        items: [...state.items, ...action.items],
        nextCursor: action.nextCursor,
        status: 'idle',
        error: null,
        firstNewIndex: state.items.length,
      };
    case 'error':
      return { ...state, status: 'error', error: action.message };
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
  const toast = useToast();

  const [listState, dispatchList] = useReducer(usersListReducer, USERS_INITIAL);
  const [modal, dispatchModal] = useReducer(modalReducer, MODAL_INITIAL);

  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [inactivateOpen, setInactivateOpen] = useState(false);

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
  const searchDebounceRef = useRef<number | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadMoreStateRef = useRef<{
    inFlight: boolean;
    token: number;
    abort: AbortController | null;
  }>({ inFlight: false, token: 0, abort: null });

  // Debounce da busca: aplica so com >=2 chars; <2 desfiltra. Espelha /clients.
  useEffect(() => {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
    }
    const trimmed = searchInput.trim();
    const next = trimmed.length >= 2 ? trimmed : '';
    if (next === appliedSearch) {
      return;
    }
    searchDebounceRef.current = window.setTimeout(() => {
      searchDebounceRef.current = null;
      setAppliedSearch(next);
    }, 400);
    return () => {
      if (searchDebounceRef.current !== null) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [searchInput, appliedSearch]);

  // Fetch inicial: dispara ao mudar busca ou sessao. Reseta o cursor.
  useEffect(() => {
    if (!session) {
      return;
    }

    const abortController = new AbortController();
    let active = true;
    dispatchList({ type: 'fetch-initial' });
    loadMoreStateRef.current.token += 1;
    loadMoreStateRef.current.inFlight = false;
    loadMoreStateRef.current.abort?.abort();
    loadMoreStateRef.current.abort = null;

    listUsers(
      session,
      { search: appliedSearch || undefined, limit: USER_PAGE_LIMIT },
      { signal: abortController.signal }
    )
      .then((response) => {
        if (!active) return;
        dispatchList({
          type: 'success-initial',
          items: response.items,
          total: response.page.total,
          nextCursor: response.page.nextCursor,
        });
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        dispatchList({
          type: 'error',
          message: cause instanceof ApiError ? cause.message : 'Falha ao carregar usuarios',
        });
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [appliedSearch, session]);

  // Load-more pelo cursor. inFlight + token protegem contra race em scrolls
  // rapidos (mesmo padrao de /clients).
  const runLoadMore = useCallback(
    (cursor: UserCursor) => {
      const state = loadMoreStateRef.current;
      if (state.inFlight) return;
      if (!session) return;
      state.inFlight = true;
      state.token += 1;
      const myToken = state.token;
      state.abort?.abort();
      const controller = new AbortController();
      state.abort = controller;
      dispatchList({ type: 'fetch-more' });

      listUsers(
        session,
        {
          search: appliedSearch || undefined,
          limit: USER_PAGE_LIMIT,
          cursorFullName: cursor.fullName,
          cursorId: cursor.id,
        },
        { signal: controller.signal }
      )
        .then((response) => {
          if (loadMoreStateRef.current.token !== myToken) return;
          dispatchList({
            type: 'success-more',
            items: response.items,
            nextCursor: response.page.nextCursor,
          });
        })
        .catch((cause) => {
          if (loadMoreStateRef.current.token !== myToken) return;
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          dispatchList({
            type: 'error',
            message: cause instanceof ApiError ? cause.message : 'Falha ao carregar mais',
          });
        })
        .finally(() => {
          if (loadMoreStateRef.current.token === myToken) {
            loadMoreStateRef.current.inFlight = false;
            loadMoreStateRef.current.abort = null;
          }
        });
    },
    [session, appliedSearch]
  );

  // IntersectionObserver no sentinel: dispara load-more quando entra na viewport.
  useEffect(() => {
    if (!session) return;
    if (listState.status !== 'idle') return;
    if (!listState.nextCursor) return;
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;
    const cursor = listState.nextCursor;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          runLoadMore(cursor);
        }
      },
      { root: scrollRef.current, rootMargin: USER_LOAD_MORE_ROOT_MARGIN }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [runLoadMore, listState.nextCursor, listState.status, session]);

  // Recarrega a primeira pagina apos mutacoes (criar/editar/inativar/etc).
  const refreshList = useCallback(async () => {
    if (!session) return;
    dispatchList({ type: 'fetch-initial' });
    loadMoreStateRef.current.token += 1;
    loadMoreStateRef.current.inFlight = false;
    try {
      const response = await listUsers(session, {
        search: appliedSearch || undefined,
        limit: USER_PAGE_LIMIT,
      });
      dispatchList({
        type: 'success-initial',
        items: response.items,
        total: response.page.total,
        nextCursor: response.page.nextCursor,
      });
    } catch (cause) {
      dispatchList({
        type: 'error',
        message: cause instanceof ApiError ? cause.message : 'Falha ao carregar usuarios',
      });
    }
  }, [appliedSearch, session]);

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

  async function handleCopyField(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success({ title: `${label} copiado` });
    } catch {
      toast.error({ title: 'Não foi possível copiar' });
    }
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    const trimmed = searchInput.trim();
    setAppliedSearch(trimmed.length >= 2 ? trimmed : '');
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

  function openInactivateFlow() {
    if (!modal.user) return;
    dispatchModal({ type: 'clearMessages' });
    setInactivateOpen(true);
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
            <h2 className="nsv2-title">Usuários</h2>
          </div>
          <HeaderAvatarMenu session={session} onLogout={logout} />
          <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
            <span className="nsv2-avatar-initials">{userAvatarInitials}</span>
          </Link>
        </header>

        {/* Busca + FAB na mesma linha (mobile: FAB sai do fluxo via fixed).
            Sem botao de filtro (decisao: so busca). Lupa DECORATIVA + "X" pra
            limpar o input — espelha /clients (a busca filtra ao vivo). */}
        <div className="hero-search-wrap">
          <form className="hero-search-bar" role="search" onSubmit={handleSearchSubmit}>
            <input
              className="hero-search-input"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar por nome ou email..."
              autoComplete="off"
              spellCheck={false}
            />
            {searchInput ? (
              <button
                type="button"
                className="hero-search-clear-input"
                aria-label="Limpar busca"
                onClick={() => setSearchInput('')}
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            ) : (
              <span className="hero-search-submit" aria-hidden="true">
                <svg
                  className="hero-search-icon-search"
                  viewBox="0 0 24 24"
                  focusable="false"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.2 16.2 4.1 4.1" />
                </svg>
              </span>
            )}
          </form>
          <button
            type="button"
            className="cv2-fab"
            aria-label="Novo usuário"
            onClick={(event) => openCreateModal(event.currentTarget)}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>

        <section className="clients-v2-sheet">
          {/* Contador a direita (espelha /clients). */}
          <div className="spv2-list-meta">
            <span className="spv2-list-count">{listState.total} usuários</span>
          </div>

          {/* Card list */}
          {listState.status === 'loading-initial' ? (
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
                <p className="spv2-empty-text">Nenhum usuário encontrado</p>
                <p className="spv2-empty-sub">Tente outro termo de busca</p>
              </div>
            </div>
          ) : (
            <div ref={scrollRef} className="spv2-list-scroll" tabIndex={-1}>
              {listState.items.map((user, i) => {
                const initials = getUserInitials(user.fullName);
                const roleModifier = getRoleModifierClass(user.role);
                return (
                  <button
                    key={user.id}
                    type="button"
                    className="cv2-card"
                    style={
                      {
                        // cascade row-major SO nos cards do batch atual (mesmo
                        // calculo de /clients; cap 25 evita delay > 0.75s).
                        animationDelay:
                          listState.firstNewIndex !== null && i >= listState.firstNewIndex
                            ? `${Math.min(i - listState.firstNewIndex, 25) * 0.03}s`
                            : '0s',
                        '--avatar-color': USER_AVATAR_COLOR,
                      } as React.CSSProperties
                    }
                    onClick={(event) => openUserDetail(user.id, event.currentTarget)}
                  >
                    <div className="cv2-card-head">
                      <span className="cv2-card-avatar">
                        <span>{initials}</span>
                      </span>
                      <div className="cv2-card-content">
                        <span className="cv2-card-name">{user.fullName}</span>
                        <div className="cv2-card-meta">
                          <span className={`cv2-card-role ${roleModifier}`}>
                            {getRoleLabel(user.role)}
                          </span>
                          {user.status !== 'ACTIVE' ? (
                            <span className="cv2-card-role is-none">Inativo</span>
                          ) : null}
                          {user.isLocked ? (
                            <span className="cv2-card-role is-locked">Bloqueado</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <span className="cv2-card-divider" aria-hidden="true" />
                    <div className="cv2-card-foot">
                      <span className="cv2-card-arrow-btn" aria-hidden="true">
                        <svg className="spv2-card-chevron" viewBox="0 0 24 24">
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </span>
                    </div>
                  </button>
                );
              })}
              {/* Carregar mais: 3 skeletons (sem travar o scroll); o sentinel
                  fino abaixo dispara o IntersectionObserver. Igual /clients. */}
              {listState.status === 'loading-more'
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={`skel-${i}`} className="spv2-skeleton-card" aria-hidden />
                  ))
                : null}
              {listState.nextCursor ? (
                <div ref={loadMoreRef} className="cv2-load-more-sentinel" aria-hidden />
              ) : null}
            </div>
          )}
        </section>
      </section>

      {/* Detail / Edit Modal */}
      {modal.mode === 'view' || modal.mode === 'edit' ? (
        <div className="app-modal-backdrop is-scrim-dark">
          <section
            ref={modalTrapRef}
            className="app-modal cdm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            {modal.user && modal.user.fullName ? (
              (() => {
                const detailInit = getUserInitials(modal.user.fullName);
                return (
                  <div className="cdm-header">
                    <span
                      className="cdm-header-avatar"
                      style={{ '--avatar-color': USER_AVATAR_COLOR } as React.CSSProperties}
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
                          <div className="cdm-info-value-row">
                            <span className="cdm-info-value">{modal.user.email}</span>
                            <button
                              type="button"
                              className="cdm-info-copy"
                              aria-label="Copiar email"
                              onClick={() => void handleCopyField(modal.user!.email, 'Email')}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <rect x="9" y="9" width="13" height="13" rx="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="cdm-info-item">
                          <span className="cdm-info-label">Telefone</span>
                          <div className="cdm-info-value-row">
                            <span className="cdm-info-value">
                              {modal.user.phone ?? 'Nao informado'}
                            </span>
                            {modal.user.phone ? (
                              <button
                                type="button"
                                className="cdm-info-copy"
                                aria-label="Copiar telefone"
                                onClick={() =>
                                  void handleCopyField(modal.user!.phone ?? '', 'Telefone')
                                }
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <rect x="9" y="9" width="13" height="13" rx="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              </button>
                            ) : null}
                          </div>
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
                          onClick={openInactivateFlow}
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
        <div className="app-modal-backdrop is-scrim-dark">
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

      {inactivateOpen && modal.user ? (
        <InactivateUserModal
          open
          user={modal.user}
          session={session}
          onSuccess={(updated, reassignedCount) => {
            setInactivateOpen(false);
            const message =
              reassignedCount > 0
                ? `Usuario inativado. ${reassignedCount} cliente(s) reatribuido(s).`
                : 'Usuario inativado.';
            dispatchModal({ type: 'actionSuccess', user: updated, message });
            refreshList();
          }}
          onCancel={() => setInactivateOpen(false)}
        />
      ) : null}
    </AppShell>
  );
}
