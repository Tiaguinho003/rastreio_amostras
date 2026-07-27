'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
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
import { formatRelativeTime } from '../../lib/relative-time';
import { useToast } from '../../lib/toast/ToastProvider';
import { useIsDesktop } from '../../lib/use-desktop';
import { useFocusTrap } from '../../lib/use-focus-trap';
import { getRoleLabel, isAssignableUserRole } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';
import type { UserRole, UserStatus, UserSummary } from '../../lib/types';

// Papeis oferecidos ao CRIAR um usuario. O PROSPECTOR ficou de fora: o papel
// continua existindo (enum, login, app de campo), mas ninguem cria mais.
const CREATE_ROLE_OPTIONS: UserRole[] = [
  'ADMIN',
  'CLASSIFIER',
  'REGISTRATION',
  'CADASTRO',
  'COMMERCIAL',
];

// Ao EDITAR, o select precisa conter o papel atual — senao um PROSPECTOR
// existente abriria o formulario com o campo em branco e o primeiro
// salvamento trocaria o papel dele em silencio. Nao ha promocao a
// PROSPECTOR: o papel so aparece para quem ja o tem.
function editRoleOptions(currentRole: UserRole): UserRole[] {
  return isAssignableUserRole(currentRole)
    ? CREATE_ROLE_OPTIONS
    : [...CREATE_ROLE_OPTIONS, currentRole];
}
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

// U-D6: UM chip de status por linha. Inativo domina (o usuario nao entra de
// qualquer forma); bloqueado so aparece em quem esta ativo, que e onde a
// informacao e acionavel.
function getUserStatusChip(user: Pick<UserSummary, 'status' | 'isLocked'>) {
  if (user.status !== 'ACTIVE') {
    return { label: 'Inativo', className: 'fv-chip fv-chip-gray' };
  }
  if (user.isLocked) {
    return { label: 'Bloqueado', className: 'fv-chip fv-chip-red' };
  }
  return { label: 'Ativo', className: 'fv-chip fv-chip-green' };
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

  // U-D1: no desktop a lista vira TABELA institucional (.fv-table); no mobile
  // seguem os cards. Dados, ordem e scroll infinito sao os mesmos — muda so a
  // apresentacao (data-tables §9).
  const isDesktop = useIsDesktop();

  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [inactivateOpen, setInactivateOpen] = useState(false);

  // Menu ⋯ da linha. Dismiss = clique-fora + ESC devolvendo o foco ao trigger
  // (mesmo padrao do ClientsBrowser).
  const [rowMenuFor, setRowMenuFor] = useState<string | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const rowMenuTriggerRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    if (!rowMenuFor) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rowMenuRef.current?.contains(target)) {
        setRowMenuFor(null);
      }
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setRowMenuFor(null);
      rowMenuTriggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [rowMenuFor]);

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

  function openUserDetail(
    userId: string,
    trigger: HTMLButtonElement | null,
    mode: 'view' | 'edit' = 'view'
  ) {
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
    // O ⋯ abre direto na acao pedida. Sem o cache o formulario nasceria vazio,
    // entao a edicao so e antecipada quando a linha ja veio na lista — o que e
    // sempre o caso aqui (o menu sai da propria linha).
    if (mode === 'edit' && cached) {
      dispatchModal({ type: 'switchToEdit' });
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

  const nowMs = Date.now();

  // U-D3: a toolbar de /users e a mais enxuta do kit — busca + contagem. Sem
  // funil e sem "Limpar": a pagina nao tem filtros (o role/status do backend
  // segue sem consumidor de tela, de proposito).
  const toolbar = (
    <div className="fv-toolbar">
      <form className="fv-toolbar-search" role="search" onSubmit={handleSearchSubmit}>
        <svg
          className="fv-toolbar-search-icon"
          viewBox="0 0 24 24"
          focusable="false"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m16.2 16.2 4.1 4.1" />
        </svg>
        <input
          className="fv-input fv-toolbar-search-input"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Buscar por nome, usuário ou e-mail..."
          autoComplete="off"
          spellCheck={false}
        />
        {searchInput ? (
          <button
            type="button"
            className="fv-toolbar-search-clear"
            aria-label="Limpar busca"
            onClick={() => setSearchInput('')}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </form>
      <span className="fv-toolbar-count">{listState.total} usuários</span>
    </div>
  );

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="clients-page-v2 fv-users-page">
        {/* RD16: o header verde da pagina saiu — o chrome mobile agora e unico
            e mora no AppShell (.fv-mtopbar: titulo da rota + camera + avatar). */}

        {/* U2 (desktop >=901px): cabecalho institucional. No mobile fica
            display:none — o titulo mora na faixa do shell e criar e o FAB. */}
        <div className="fv-page-head">
          <h2 className="fv-page-title">Usuários</h2>
          <button
            type="button"
            className="fv-btn fv-btn-primary"
            onClick={(event) => openCreateModal(event.currentTarget)}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Novo usuário
          </button>
        </div>

        {/* Chrome LEGADA, hoje so mobile: no desktop `.fv-users-page
            .hero-search-wrap` esconde a faixa inteira — busca mora na
            .fv-toolbar e criar no "+ Novo usuário" do .fv-page-head. As duas
            juntas dariam DUAS chromes empilhadas (data-tables §1). Sai do JSX
            na U5, quando a toolbar passar a valer nos dois breakpoints.
            Busca + FAB na mesma linha (o FAB sai do fluxo via fixed); lupa
            DECORATIVA + "X" pra limpar (a busca filtra ao vivo). */}
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
          {/* No desktop a toolbar assume a contagem (.fv-toolbar-count); no
              mobile segue o contador legado. Uma fonte por breakpoint. */}
          {isDesktop ? (
            toolbar
          ) : (
            <div className="spv2-list-meta">
              <span className="spv2-list-count">{listState.total} usuários</span>
            </div>
          )}

          {/* O erro da lista nao era renderizado em lugar nenhum — o reducer
              guardava a mensagem e a tela ficava no vazio "Nenhum usuário
              encontrado". */}
          {listState.status === 'error' && listState.error ? (
            <p className="spv2-error-banner" role="status">
              {listState.error}
            </p>
          ) : null}

          {/* Card list */}
          {listState.status === 'loading-initial' ? (
            isDesktop ? (
              <div className="spv2-list-scroll fv-table-scroll">
                <table className="fv-table">
                  <tbody>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <tr key={`boot-${i}`} className="fv-table-skel-row" aria-hidden="true">
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j}>
                            <span className="fv-table-skel" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="spv2-list-scroll">
                <div className="spv2-empty">
                  <p className="spv2-empty-text">Carregando...</p>
                </div>
              </div>
            )
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
          ) : isDesktop ? (
            /* U-D1/U-D6 (desktop): tabela institucional de 5 colunas + ⋯.
               Dados, ordem alfabetica e scroll infinito identicos aos cards —
               muda so a apresentacao. A linha inteira clica; o nome e <button>
               pra dar alvo de teclado. */
            <div ref={scrollRef} className="spv2-list-scroll fv-table-scroll" tabIndex={-1}>
              <table className="fv-table">
                <colgroup>
                  <col className="fv-col-client" />
                  <col className="fv-col-role" />
                  <col className="fv-col-status" />
                  <col className="fv-col-contact" />
                  <col className="fv-col-updated" />
                  <col className="fv-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Usuário</th>
                    <th scope="col">Perfil</th>
                    <th scope="col">Status</th>
                    <th scope="col">Contato</th>
                    <th scope="col">Último acesso</th>
                    <th scope="col" className="fv-table-th-actions" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {listState.items.map((user) => {
                    const chip = getUserStatusChip(user);
                    const isInactive = user.status !== 'ACTIVE';
                    return (
                      <tr
                        key={user.id}
                        className={`fv-table-row${isInactive ? ' is-inactive' : ''}`}
                        onClick={() => openUserDetail(user.id, null)}
                      >
                        <td>
                          <span className="fv-table-client">
                            <span
                              className="fv-table-avatar"
                              aria-hidden="true"
                              style={{ '--avatar-color': USER_AVATAR_COLOR } as React.CSSProperties}
                            >
                              {getUserInitials(user.fullName)}
                            </span>
                            <button
                              type="button"
                              className="fv-table-name-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                openUserDetail(user.id, event.currentTarget);
                              }}
                            >
                              <span className="fv-table-name">{user.fullName}</span>
                              <span className="fv-table-code">@{user.username}</span>
                            </button>
                          </span>
                        </td>
                        <td>
                          {/* RD12: cor so semantica. O papel e categoria, nao
                              alerta — texto, nao chip colorido. */}
                          <span className="fv-table-cell-main">{getRoleLabel(user.role)}</span>
                        </td>
                        <td>
                          <span className={chip.className}>{chip.label}</span>
                        </td>
                        <td>
                          <span className="fv-table-cell-stack">
                            <span className="fv-cell-ic">
                              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                <rect x="2" y="4" width="20" height="16" rx="2" />
                                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                              </svg>
                              <span className="fv-table-cell-main">{user.email}</span>
                            </span>
                            {user.phone ? (
                              <span className="fv-cell-ic">
                                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                                </svg>
                                <span className="fv-table-sub">{user.phone}</span>
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td>
                          <span
                            className="fv-table-sub"
                            title={
                              user.lastLoginAt
                                ? new Date(user.lastLoginAt).toLocaleString('pt-BR')
                                : undefined
                            }
                          >
                            {user.lastLoginAt
                              ? formatRelativeTime(user.lastLoginAt, nowMs)
                              : 'Nunca acessou'}
                          </span>
                        </td>
                        <td
                          className="fv-table-td-actions"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div
                            className="fv-row-menu-wrap"
                            ref={rowMenuFor === user.id ? rowMenuRef : undefined}
                          >
                            <button
                              type="button"
                              className="fv-table-dots"
                              aria-label={`Ações de ${user.fullName}`}
                              aria-haspopup="menu"
                              aria-expanded={rowMenuFor === user.id}
                              onClick={(event) => {
                                rowMenuTriggerRef.current = event.currentTarget;
                                setRowMenuFor((current) => (current === user.id ? null : user.id));
                              }}
                            >
                              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                <circle cx="5" cy="12" r="1.6" />
                                <circle cx="12" cy="12" r="1.6" />
                                <circle cx="19" cy="12" r="1.6" />
                              </svg>
                            </button>
                            {rowMenuFor === user.id ? (
                              <div
                                className="fv-row-menu"
                                role="menu"
                                aria-label={`Ações de ${user.fullName}`}
                              >
                                {/* U2 entrega os dois atalhos que ja tem
                                    destino. Inativar/Reativar, Desbloquear e
                                    Redefinir senha entram aqui na U3/U4, junto
                                    com o painel que as hospeda. */}
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="fv-row-menu-item"
                                  onClick={() => {
                                    setRowMenuFor(null);
                                    openUserDetail(user.id, null);
                                  }}
                                >
                                  Ver detalhes
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="fv-row-menu-item"
                                  onClick={() => {
                                    setRowMenuFor(null);
                                    openUserDetail(user.id, null, 'edit');
                                  }}
                                >
                                  Editar
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {listState.status === 'loading-more'
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <tr key={`skel-${i}`} className="fv-table-skel-row" aria-hidden="true">
                          {Array.from({ length: 6 }).map((__, j) => (
                            <td key={j}>
                              <span className="fv-table-skel" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
              {listState.nextCursor ? (
                <div ref={loadMoreRef} className="cv2-load-more-sentinel" aria-hidden />
              ) : null}
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
                          {/* Baseado no papel PERSISTIDO (modal.user), nao no
                              editForm: senao a opcao sumiria assim que o
                              usuario trocasse o select, impedindo desfazer. */}
                          {editRoleOptions(modal.user.role).map((role) => (
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
                    {CREATE_ROLE_OPTIONS.map((role) => (
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
          onSuccess={(updated) => {
            setInactivateOpen(false);
            dispatchModal({ type: 'actionSuccess', user: updated, message: 'Usuario inativado.' });
            refreshList();
          }}
          onCancel={() => setInactivateOpen(false)}
        />
      ) : null}
    </AppShell>
  );
}
