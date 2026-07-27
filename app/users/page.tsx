'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { AppShell } from '../../components/AppShell';
import { BottomSheet } from '../../components/BottomSheet';
import { SuccessCheckOverlay, SUCCESS_CHECK_MS } from '../../components/SuccessCheckOverlay';
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
import { getRoleLabel, isAssignableUserRole } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';
import type { UserRole, UserSummary } from '../../lib/types';

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

// Os forms vivem no corpo do painel e o botao no footer do sheet — a ligacao e
// pelo `form={id}` (forms §5).
const EDIT_FORM_ID = 'user-edit-form';
const CREATE_FORM_ID = 'user-create-form';

type UserFieldName = 'fullName' | 'username' | 'email' | 'phone' | 'password' | 'reset';
type UserFieldErrors = Partial<Record<UserFieldName, string>>;

const MIN_PASSWORD_LENGTH = 8;

// Telefone e OPCIONAL, mas se vier tem que ser DDD + 8 ou 9 digitos.
function validatePhone(masked: string): string | null {
  const digits = masked.replace(/\D/g, '');
  if (digits.length === 0) return null;
  return digits.length === 10 || digits.length === 11
    ? null
    : 'Informe DDD + número (10 ou 11 dígitos)';
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
}

const MODAL_INITIAL: ModalState = {
  mode: 'closed',
  user: null,
  loading: false,
  saving: false,
  error: null,
};

type ModalAction =
  | { type: 'openCreate' }
  | { type: 'openView'; userId: string }
  | { type: 'switchToEdit' }
  | { type: 'switchToView' }
  | { type: 'close' }
  | { type: 'fetchDetail' }
  | { type: 'detailSuccess'; user: UserSummary }
  | { type: 'detailError'; message: string }
  | { type: 'saving' }
  | { type: 'saveSuccess'; user: UserSummary }
  | { type: 'saveError' }
  | { type: 'actionSuccess'; user: UserSummary }
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
      return { ...state, mode: 'edit', error: null };
    case 'switchToView':
      return { ...state, mode: 'view', error: null };
    case 'close':
      return MODAL_INITIAL;
    case 'fetchDetail':
      return { ...state, loading: true, error: null };
    case 'detailSuccess':
      return { ...state, loading: false, user: action.user };
    case 'detailError':
      return { ...state, loading: false, error: action.message };
    case 'saving':
      return { ...state, saving: true, error: null };
    case 'saveSuccess':
      return { ...state, saving: false, user: action.user, mode: 'view' };
    // Falha de escrita virou TOAST (o painel nao tem mais linha de feedback);
    // aqui so destrava o formulario. O `error` sobrevive para o unico caso que
    // ainda pertence ao corpo do painel: falhar ao CARREGAR o usuario.
    case 'saveError':
      return { ...state, saving: false };
    case 'actionSuccess':
      return { ...state, saving: false, user: action.user };
    case 'clearMessages':
      return { ...state, error: null };
    default:
      return state;
  }
}

// useSearchParams exige Suspense no App Router (molde de /cadastros).
export default function UsersPageWrapper() {
  return (
    <Suspense>
      <UsersPage />
    </Suspense>
  );
}

function UsersPage() {
  const { session, loading, logout, setSession } = useRequireAuth({ allowedRoles: ['ADMIN'] });
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  // U-D9: o detalhe e ENDERECAVEL (`containers` §5) — `/users?usuario=<id>`
  // sobrevive ao F5 e vira link. Criar NAO entra na URL, de proposito.
  //
  // 🔴 A URL aqui e ESPELHO, nao dona do historico: sempre `replace`, nunca
  // `push`. Diferente de /cadastros, o container e o `BottomSheet`, que ja
  // injeta a propria entry — com push seriam DUAS (back precisaria de dois
  // toques). E `manageHistory={false}` nao resolve: o mesmo sheet serve os
  // tres modos, e virar a prop de true pra false com o painel ABERTO dispara o
  // cleanup do efeito de historico do sheet, que chama `history.back()` e
  // fecharia o painel no meio do criar→ver. Com `replace` o sheet segue dono
  // unico do historico: back fecha em UM toque e a URL so acompanha.
  const usuarioParam = searchParams.get('usuario');

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

  // Erro DENTRO do campo (forms §6): o form nao tem mais a linha "Preencha
  // todos os campos obrigatorios" no topo. Falha de rede/409 vira toast.
  const [fieldErrors, setFieldErrors] = useState<UserFieldErrors>({});
  // Rascunho sujo => tentar fechar abre o confirm de descarte.
  const [panelDirty, setPanelDirty] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [panelSuccess, setPanelSuccess] = useState(false);
  // "Redefinir senha": secao que abre dentro do painel (era window.prompt).
  const [resetOpen, setResetOpen] = useState(false);
  const [resetValue, setResetValue] = useState('');

  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
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
          message:
            cause instanceof ApiError ? cause.message : 'Não foi possível carregar os usuários',
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
            message:
              cause instanceof ApiError ? cause.message : 'Não foi possível carregar mais usuários',
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
        message:
          cause instanceof ApiError ? cause.message : 'Não foi possível carregar os usuários',
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
          message:
            cause instanceof ApiError ? cause.message : 'Não foi possível carregar o usuário',
        });
      });

    return () => {
      active = false;
    };
    // modal.loading e lido como guard mas nao deve disparar reload (loading e setado pelo proprio effect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal.mode, modal.user?.id, session]);

  // U-D9: URL → painel. Cobre deep-link e F5 (o unico caminho em que a URL
  // chega na frente do estado). Abrir pela lista ja despacha o estado e so
  // ESPELHA na URL, e este efeito vira no-op pelo guard do id.
  useEffect(() => {
    if (!session || !usuarioParam) return;
    if (modal.mode === 'create') return;
    if (modal.mode !== 'closed' && modal.user?.id === usuarioParam) return;
    openUserDetail(usuarioParam, null);
    // openUserDetail e estavel (function declaration) e so le refs/listState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioParam, session, modal.mode, modal.user?.id]);

  // Devolve o foco a quem abriu o painel. Scroll-lock, ESC, focus trap e
  // historico sao do BottomSheet — duplicar aqui daria dois donos do
  // `body.overflow` (o segundo a limpar restauraria o valor errado).
  useEffect(() => {
    if (modal.mode !== 'closed') return;
    const trigger = lastTriggerRef.current;
    if (!trigger) return;
    const id = window.setTimeout(() => trigger.focus(), 0);
    return () => window.clearTimeout(id);
  }, [modal.mode]);

  if (loading || !session) return null;

  // --- Handlers ---

  // Zera tudo o que e do painel — some junto com ele, nunca vaza pro proximo.
  function resetPanelScratch() {
    setFieldErrors({});
    setPanelDirty(false);
    setConfirmDiscardOpen(false);
    setPanelSuccess(false);
    setResetOpen(false);
    setResetValue('');
  }

  function clearFieldError(field: UserFieldName) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  // U-D9: o painel de ver/editar vive na URL. `replace` porque o dono do
  // historico e o BottomSheet (ver o comentario do usuarioParam).
  function syncUrl(userId: string | null) {
    const target = userId ? `/users?usuario=${encodeURIComponent(userId)}` : '/users';
    if (userId ? usuarioParam === userId : usuarioParam === null) return;
    router.replace(target, { scroll: false });
  }

  function openUserDetail(
    userId: string,
    trigger: HTMLButtonElement | null,
    mode: 'view' | 'edit' = 'view'
  ) {
    lastTriggerRef.current = trigger;
    resetPanelScratch();
    syncUrl(userId);
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
    resetPanelScratch();
    setCreateForm(blankCreateForm());
    dispatchModal({ type: 'openCreate' });
  }

  function closeModal() {
    if (modal.saving) return;
    resetPanelScratch();
    dispatchModal({ type: 'close' });
    syncUrl(null);
  }

  // Gesto de fechar (seta, ESC, back, drag, tap no scrim). Rascunho tocado
  // abre o confirm em vez de fechar (forms §8).
  function handlePanelDismiss(): boolean {
    if (modal.saving || panelSuccess) return false;
    if (panelDirty) {
      setConfirmDiscardOpen(true);
      return false;
    }
    return true;
  }

  function handleDiscardPanel() {
    setConfirmDiscardOpen(false);
    setPanelDirty(false);
    // Editar volta pro modo leitura com o formulario restaurado; criar fecha o
    // painel inteiro (nao ha estado anterior pra onde voltar).
    if (modal.mode === 'edit' && modal.user) {
      setFieldErrors({});
      setEditForm({
        fullName: modal.user.fullName,
        username: modal.user.username,
        email: modal.user.email,
        phone: maskPhoneInput(modal.user.phone ?? ''),
        role: modal.user.role,
      });
      dispatchModal({ type: 'switchToView' });
      return;
    }
    resetPanelScratch();
    dispatchModal({ type: 'close' });
    syncUrl(null);
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

    const errors: UserFieldErrors = {};
    if (!createForm.fullName.trim()) errors.fullName = 'Informe o nome completo';
    if (!createForm.username.trim()) errors.username = 'Informe o usuário de acesso';
    if (!createForm.email.trim()) errors.email = 'Informe o e-mail';
    if (createForm.password.trim().length < MIN_PASSWORD_LENGTH) {
      errors.password = `Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`;
    }
    const phoneError = validatePhone(createForm.phone);
    if (phoneError) errors.phone = phoneError;
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
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

      // U-D4: a senha NAO volta pra tela. O backend ja a envia por e-mail
      // (sendUserCreated) — repetir aqui so criava uma copia em texto puro no
      // state do React e na tela de quem estivesse por perto.
      setPanelDirty(false);
      setPanelSuccess(true);
      setEditForm({
        fullName: response.user.fullName,
        username: response.user.username,
        email: response.user.email,
        phone: maskPhoneInput(response.user.phone ?? ''),
        role: response.user.role,
      });
      refreshList();
      // Check terminal e o painel segue aberto no usuario recem-criado
      // (coreografia "check e abre outra coisa", forms §7).
      window.setTimeout(() => {
        setPanelSuccess(false);
        dispatchModal({ type: 'saveSuccess', user: response.user });
        // Criar nao e enderecavel, mas o que sobra na tela DEPOIS do check e o
        // detalhe — e detalhe e enderecavel (U-D9). `replace` de novo: a entry
        // do sheet, aberta pelo criar, continua sendo a unica.
        syncUrl(response.user.id);
        toast.success({
          title: 'Usuário criado',
          description: `A senha de acesso foi enviada para ${response.user.email}.`,
        });
      }, SUCCESS_CHECK_MS);
    } catch (cause) {
      dispatchModal({ type: 'saveError' });
      toast.error({
        title: 'Não foi possível criar o usuário',
        description: cause instanceof ApiError ? cause.message : undefined,
      });
    }
  }

  async function handleEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal.user) return;

    const errors: UserFieldErrors = {};
    if (!editForm.fullName.trim()) errors.fullName = 'Informe o nome completo';
    if (!editForm.username.trim()) errors.username = 'Informe o usuário de acesso';
    if (!editForm.email.trim()) errors.email = 'Informe o e-mail';
    const phoneError = validatePhone(editForm.phone);
    if (phoneError) errors.phone = phoneError;
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    dispatchModal({ type: 'saving' });

    try {
      const response = await updateUser(session!, modal.user.id, {
        fullName: editForm.fullName,
        username: editForm.username,
        email: editForm.email,
        phone: editForm.phone || null,
        role: editForm.role,
      });

      setPanelDirty(false);
      setPanelSuccess(true);
      refreshList();
      window.setTimeout(() => {
        setPanelSuccess(false);
        dispatchModal({ type: 'saveSuccess', user: response.user });
        if (response.sessionRevoked) {
          toast.success({
            title: 'Usuário atualizado',
            description: 'As sessões abertas dele foram encerradas.',
          });
        }
      }, SUCCESS_CHECK_MS);
    } catch (cause) {
      dispatchModal({ type: 'saveError' });
      toast.error({
        title: 'Não foi possível salvar',
        description: cause instanceof ApiError ? cause.message : undefined,
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
      dispatchModal({ type: 'actionSuccess', user: response.user });
      toast.success({ title: 'Usuário reativado' });
      refreshList();
    } catch (cause) {
      dispatchModal({ type: 'saveError' });
      toast.error({
        title: 'Não foi possível reativar',
        description: cause instanceof ApiError ? cause.message : undefined,
      });
    }
  }

  async function handleUnlock() {
    if (!modal.user) return;

    dispatchModal({ type: 'saving' });

    try {
      const response = await unlockUser(session!, modal.user.id);
      dispatchModal({ type: 'actionSuccess', user: response.user });
      toast.success({ title: 'Usuário desbloqueado' });
      refreshList();
    } catch (cause) {
      dispatchModal({ type: 'saveError' });
      toast.error({
        title: 'Não foi possível desbloquear',
        description: cause instanceof ApiError ? cause.message : undefined,
      });
    }
  }

  // Era um window.prompt() do browser — dialogo nativo no meio do app
  // institucional, e a senha voltava pra tela em texto puro. Agora e uma secao
  // do painel; a senha vai por e-mail (U-D4) e nunca e ecoada.
  async function handlePasswordReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal.user || modal.saving) return;

    if (resetValue.trim().length < MIN_PASSWORD_LENGTH) {
      setFieldErrors((current) => ({
        ...current,
        reset: `Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`,
      }));
      return;
    }

    const targetEmail = modal.user.email;
    dispatchModal({ type: 'saving' });

    try {
      const response = await resetUserPassword(session!, modal.user.id, resetValue);
      dispatchModal({ type: 'actionSuccess', user: response.user });
      setResetOpen(false);
      setResetValue('');
      clearFieldError('reset');
      toast.success({
        title: 'Senha redefinida',
        description: `A nova senha foi enviada para ${targetEmail}. As sessões abertas foram encerradas.`,
      });
    } catch (cause) {
      dispatchModal({ type: 'saveError' });
      toast.error({
        title: 'Não foi possível redefinir a senha',
        description: cause instanceof ApiError ? cause.message : undefined,
      });
    }
  }

  const nowMs = Date.now();

  // U-D7: o backend recusa o ADMIN que tenta tirar o proprio acesso
  // administrativo — trocando o papel OU se inativando (409
  // LAST_ADMIN_REQUIRED, assertAdminInvariant no user-service). A tela para de
  // OFERECER o que vai ser recusado; a trava de verdade continua no backend.
  // O outro ramo do invariante (ultimo ADMIN ativo do sistema, mesmo que nao
  // seja voce) fica so no backend: a tela precisaria de uma contagem que ela
  // nao tem, e o toast do 409 ja explica.
  const isSelf = modal.user != null && modal.user.id === session?.user.id;

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

  // A MESMA toolbar, montada dentro da rolagem quando e mobile. Uma fonte de
  // estado — dois `<input>` no mesmo state seria a duplicacao que o ciclo
  // mobile eliminou nas outras listas.
  const mobileListChrome = isDesktop ? null : toolbar;

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

        {/* U5: a `.hero-search-wrap` legada SAIU. Busca e contagem moram na
            `.fv-toolbar` nos dois breakpoints — presa no topo do cartao no
            desktop, rolando com a lista no mobile (`mobileListChrome`). Uma
            chrome so, como em /samples e /cadastros.

            O FAB perdeu o pai que o abrigava e virou filho direto; e `fixed`,
            entao a posicao nao muda. No desktop ele some por
            `.fv-users-page .cv2-fab` (criar mora no "+ Novo usuário"). */}
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

        <section className="clients-v2-sheet">
          {/* Desktop: a toolbar fica presa no topo do cartao. Mobile: ela
              entra na rolagem (`mobileListChrome`), porque no mobile a lista
              tem altura fixa e cada faixa presa acima dela custa altura
              PERMANENTE na tela menor (data-tables §1). O `.spv2-list-meta`
              legado saiu — a contagem mora na `.fv-toolbar-count`. */}
          {isDesktop ? toolbar : null}

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
                {mobileListChrome}
                <div className="spv2-empty">
                  <p className="spv2-empty-text">Carregando...</p>
                </div>
              </div>
            )
          ) : listState.items.length === 0 ? (
            <div className="spv2-list-scroll">
              {mobileListChrome}
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
                                {/* So os dois atalhos de ABRIR. Inativar,
                                    Reativar, Desbloquear e Redefinir senha
                                    ficaram no PAINEL (U3), nao aqui: sao acoes
                                    que precisam do contexto do usuario na tela
                                    (e a de inativar ainda pede um motivo). */}
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
              {mobileListChrome}
              {listState.items.map((user, i) => {
                const initials = getUserInitials(user.fullName);
                const chip = getUserStatusChip(user);
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
                        {/* U5: a MESMA leitura da tabela do desktop — perfil
                            como TEXTO (categoria, nao alerta: RD12) e UM chip
                            de status. Eram tres pilulas `.cv2-card-role` com
                            paleta propria por papel, e ate duas somavam na
                            mesma linha (Inativo + Bloqueado). */}
                        <span className="cv2-card-status usr-card-meta">
                          <span className="usr-card-role">{getRoleLabel(user.role)}</span>
                          <span className={`${chip.className} is-sm`}>{chip.label}</span>
                        </span>
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

      {/* ── Painel do usuário: criar · ver ↔ editar ───────────────────────
          Um so contêiner nos dois breakpoints: `BottomSheet` +
          `.fv-panel-sheet.side-sheet` = painel LATERAL no desktop e sheet de
          baixo no mobile (RD11 / containers §8). Eram DOIS `.app-modal
          .cdm-modal` centrais (detalhe/editar e criar).

          Um sheet so para os tres modos, nao um por modo: depois de criar, o
          painel passa a mostrar o usuario recem-criado (`saveSuccess` leva o
          mode pra 'view'). Com dois sheets isso seria um saindo enquanto o
          outro entra — aqui e so o conteudo que troca, por baixo do check.

          Scroll-lock, ESC, back, foco e historico sao do BottomSheet. */}
      <BottomSheet
        open={modal.mode !== 'closed'}
        onClose={closeModal}
        onDismissAttempt={handlePanelDismiss}
        ariaLabel={
          modal.mode === 'create'
            ? 'Novo usuário'
            : modal.mode === 'edit'
              ? 'Editar usuário'
              : 'Usuário'
        }
        closeVariant="edge-back"
        dragDisabled={modal.saving || confirmDiscardOpen || inactivateOpen}
        className="fv-panel-sheet side-sheet usr-panel-sheet"
        footer={
          panelSuccess ? null : modal.mode === 'create' ? (
            <button
              type="submit"
              form={CREATE_FORM_ID}
              className="app-modal-submit"
              disabled={modal.saving}
            >
              {modal.saving ? 'Criando...' : 'Criar usuário'}
            </button>
          ) : !modal.user || modal.loading ? null : modal.mode === 'edit' ? (
            <div className="fv-panel-footer-row">
              <button
                type="button"
                className="app-modal-secondary"
                onClick={handleDiscardPanel}
                disabled={modal.saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form={EDIT_FORM_ID}
                className="app-modal-submit"
                disabled={modal.saving}
              >
                {modal.saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="app-modal-submit"
              onClick={() => dispatchModal({ type: 'switchToEdit' })}
              disabled={modal.saving}
            >
              Editar
            </button>
          )
        }
      >
        <>
          {modal.mode === 'create' ? (
            <>
              <p className="fv-panel-lead">
                O acesso é criado na hora e a senha vai por e-mail para o endereço informado.
              </p>

              <form id={CREATE_FORM_ID} className="fv-form-body" onSubmit={handleCreate}>
                <div className="fv-form-row fv-form-row-2col">
                  <label
                    className={`fv-form-field${fieldErrors.fullName ? ' is-field-error' : ''}`}
                  >
                    <span className="fv-form-label">
                      Nome completo <span className="fv-form-required">*</span>
                    </span>
                    <input
                      value={createForm.fullName}
                      disabled={modal.saving}
                      onChange={(e) => {
                        setCreateForm((c) => ({ ...c, fullName: e.target.value }));
                        setPanelDirty(true);
                        clearFieldError('fullName');
                      }}
                    />
                    {fieldErrors.fullName ? (
                      <p className="fv-form-field-error">{fieldErrors.fullName}</p>
                    ) : null}
                  </label>
                  <label
                    className={`fv-form-field${fieldErrors.username ? ' is-field-error' : ''}`}
                  >
                    <span className="fv-form-label">
                      Usuário <span className="fv-form-required">*</span>
                    </span>
                    <input
                      value={createForm.username}
                      autoComplete="off"
                      disabled={modal.saving}
                      onChange={(e) => {
                        setCreateForm((c) => ({ ...c, username: e.target.value }));
                        setPanelDirty(true);
                        clearFieldError('username');
                      }}
                    />
                    {fieldErrors.username ? (
                      <p className="fv-form-field-error">{fieldErrors.username}</p>
                    ) : null}
                  </label>
                </div>
                <label className={`fv-form-field${fieldErrors.email ? ' is-field-error' : ''}`}>
                  <span className="fv-form-label">
                    E-mail <span className="fv-form-required">*</span>
                  </span>
                  <input
                    type="email"
                    value={createForm.email}
                    autoComplete="email"
                    disabled={modal.saving}
                    onChange={(e) => {
                      setCreateForm((c) => ({ ...c, email: e.target.value }));
                      setPanelDirty(true);
                      clearFieldError('email');
                    }}
                  />
                  {fieldErrors.email ? (
                    <p className="fv-form-field-error">{fieldErrors.email}</p>
                  ) : null}
                </label>
                <div className="fv-form-row fv-form-row-2col">
                  <label className={`fv-form-field${fieldErrors.phone ? ' is-field-error' : ''}`}>
                    <span className="fv-form-label">Telefone</span>
                    <input
                      value={createForm.phone}
                      placeholder="(00) 00000-0000"
                      inputMode="tel"
                      disabled={modal.saving}
                      onChange={(e) => {
                        setCreateForm((c) => ({ ...c, phone: maskPhoneInput(e.target.value) }));
                        setPanelDirty(true);
                        clearFieldError('phone');
                      }}
                    />
                    {fieldErrors.phone ? (
                      <p className="fv-form-field-error">{fieldErrors.phone}</p>
                    ) : null}
                  </label>
                  <label className="fv-form-field">
                    <span className="fv-form-label">Perfil</span>
                    <select
                      value={createForm.role}
                      disabled={modal.saving}
                      onChange={(e) => {
                        setCreateForm((c) => ({ ...c, role: e.target.value as UserRole }));
                        setPanelDirty(true);
                      }}
                    >
                      {CREATE_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {getRoleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className={`fv-form-field${fieldErrors.password ? ' is-field-error' : ''}`}>
                  <span className="fv-form-label">
                    Senha inicial <span className="fv-form-required">*</span>
                  </span>
                  <input
                    type="password"
                    value={createForm.password}
                    autoComplete="new-password"
                    placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`}
                    disabled={modal.saving}
                    onChange={(e) => {
                      setCreateForm((c) => ({ ...c, password: e.target.value }));
                      setPanelDirty(true);
                      clearFieldError('password');
                    }}
                  />
                  {fieldErrors.password ? (
                    <p className="fv-form-field-error">{fieldErrors.password}</p>
                  ) : null}
                </label>
              </form>
            </>
          ) : (
            <>
              {modal.user && modal.user.fullName ? (
                <div className="usr-panel-id">
                  <span
                    className="usr-panel-avatar"
                    aria-hidden="true"
                    style={{ '--avatar-color': USER_AVATAR_COLOR } as React.CSSProperties}
                  >
                    {getUserInitials(modal.user.fullName)}
                  </span>
                  <div className="usr-panel-id-copy">
                    <h3 className="usr-panel-name">{modal.user.fullName}</h3>
                    <div className="usr-panel-meta">
                      <span className="usr-panel-username">@{modal.user.username}</span>
                      {(() => {
                        const chip = getUserStatusChip(modal.user);
                        return <span className={`${chip.className} is-sm`}>{chip.label}</span>;
                      })()}
                    </div>
                  </div>
                </div>
              ) : null}

              {modal.loading ? (
                <p className="fv-panel-lead">Carregando...</p>
              ) : modal.error && !modal.user?.fullName ? (
                <p className="fv-panel-lead">{modal.error}</p>
              ) : modal.user ? (
                modal.mode === 'view' ? (
                  <>
                    <div className="usr-panel-facts sdv-info-grid">
                      <div className="sdv-info-item">
                        <span className="sdv-info-label">E-mail</span>
                        <div className="sdv-info-value-row">
                          <span className="sdv-info-value">{modal.user.email}</span>
                          <button
                            type="button"
                            className="sdv-info-copy"
                            aria-label="Copiar e-mail"
                            onClick={() => void handleCopyField(modal.user!.email, 'E-mail')}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="sdv-info-item">
                        <span className="sdv-info-label">Telefone</span>
                        <div className="sdv-info-value-row">
                          <span className="sdv-info-value">
                            {modal.user.phone ?? 'Não informado'}
                          </span>
                          {modal.user.phone ? (
                            <button
                              type="button"
                              className="sdv-info-copy"
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
                      <div className="sdv-info-item">
                        <span className="sdv-info-label">Perfil</span>
                        <span className="sdv-info-value">{getRoleLabel(modal.user.role)}</span>
                      </div>
                      <div className="sdv-info-item">
                        <span className="sdv-info-label">Criado em</span>
                        <span className="sdv-info-value">
                          {new Date(modal.user.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <div className="sdv-info-item">
                        <span className="sdv-info-label">Último acesso</span>
                        <span className="sdv-info-value">
                          {modal.user.lastLoginAt
                            ? new Date(modal.user.lastLoginAt).toLocaleString('pt-BR')
                            : 'Nunca acessou'}
                        </span>
                      </div>
                    </div>

                    <span className="fv-form-heading">Acesso</span>

                    {/* U-D4: "Redefinir senha" era um window.prompt(). Agora abre
                      aqui; a senha vai por e-mail e nao volta pra tela. */}
                    {resetOpen ? (
                      <form className="fv-form-body usr-panel-reset" onSubmit={handlePasswordReset}>
                        <label
                          className={`fv-form-field${fieldErrors.reset ? ' is-field-error' : ''}`}
                        >
                          <span className="fv-form-label">Nova senha</span>
                          <input
                            type="password"
                            value={resetValue}
                            autoComplete="new-password"
                            placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`}
                            disabled={modal.saving}
                            onChange={(event) => {
                              setResetValue(event.target.value);
                              clearFieldError('reset');
                            }}
                          />
                          {fieldErrors.reset ? (
                            <p className="fv-form-field-error">{fieldErrors.reset}</p>
                          ) : null}
                        </label>
                        <p className="usr-panel-note">
                          {modal.user.fullName.split(' ')[0]} recebe a nova senha por e-mail e todas
                          as sessões abertas dele são encerradas.
                        </p>
                        <div className="fv-panel-footer-row">
                          <button
                            type="button"
                            className="app-modal-secondary"
                            disabled={modal.saving}
                            onClick={() => {
                              setResetOpen(false);
                              setResetValue('');
                              clearFieldError('reset');
                            }}
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="app-modal-submit"
                            disabled={modal.saving}
                          >
                            {modal.saving ? 'Redefinindo...' : 'Redefinir senha'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="usr-panel-actions">
                        <button
                          type="button"
                          className="fv-btn fv-btn-secondary"
                          onClick={() => setResetOpen(true)}
                          disabled={modal.saving}
                        >
                          Redefinir senha
                        </button>
                        {modal.user.isLocked ? (
                          <button
                            type="button"
                            className="fv-btn fv-btn-secondary"
                            onClick={handleUnlock}
                            disabled={modal.saving}
                          >
                            Desbloquear
                          </button>
                        ) : null}
                        {modal.user.status === 'ACTIVE' ? (
                          isSelf ? null : (
                            <button
                              type="button"
                              className="fv-btn fv-btn-secondary is-danger"
                              onClick={openInactivateFlow}
                              disabled={modal.saving}
                            >
                              Inativar
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            className="fv-btn fv-btn-secondary"
                            onClick={handleReactivate}
                            disabled={modal.saving}
                          >
                            Reativar
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <form id={EDIT_FORM_ID} className="fv-form-body" onSubmit={handleEdit}>
                    <div className="fv-form-row fv-form-row-2col">
                      <label
                        className={`fv-form-field${fieldErrors.fullName ? ' is-field-error' : ''}`}
                      >
                        <span className="fv-form-label">
                          Nome completo <span className="fv-form-required">*</span>
                        </span>
                        <input
                          value={editForm.fullName}
                          disabled={modal.saving}
                          onChange={(e) => {
                            setEditForm((c) => ({ ...c, fullName: e.target.value }));
                            setPanelDirty(true);
                            clearFieldError('fullName');
                          }}
                        />
                        {fieldErrors.fullName ? (
                          <p className="fv-form-field-error">{fieldErrors.fullName}</p>
                        ) : null}
                      </label>
                      <label
                        className={`fv-form-field${fieldErrors.username ? ' is-field-error' : ''}`}
                      >
                        <span className="fv-form-label">
                          Usuário <span className="fv-form-required">*</span>
                        </span>
                        <input
                          value={editForm.username}
                          disabled={modal.saving}
                          autoComplete="off"
                          onChange={(e) => {
                            setEditForm((c) => ({ ...c, username: e.target.value }));
                            setPanelDirty(true);
                            clearFieldError('username');
                          }}
                        />
                        {fieldErrors.username ? (
                          <p className="fv-form-field-error">{fieldErrors.username}</p>
                        ) : null}
                      </label>
                    </div>
                    <label className={`fv-form-field${fieldErrors.email ? ' is-field-error' : ''}`}>
                      <span className="fv-form-label">
                        E-mail <span className="fv-form-required">*</span>
                      </span>
                      <input
                        type="email"
                        value={editForm.email}
                        disabled={modal.saving}
                        onChange={(e) => {
                          setEditForm((c) => ({ ...c, email: e.target.value }));
                          setPanelDirty(true);
                          clearFieldError('email');
                        }}
                      />
                      {fieldErrors.email ? (
                        <p className="fv-form-field-error">{fieldErrors.email}</p>
                      ) : null}
                    </label>
                    <div className="fv-form-row fv-form-row-2col">
                      <label
                        className={`fv-form-field${fieldErrors.phone ? ' is-field-error' : ''}`}
                      >
                        <span className="fv-form-label">Telefone</span>
                        <input
                          value={editForm.phone}
                          placeholder="(00) 00000-0000"
                          inputMode="tel"
                          disabled={modal.saving}
                          onChange={(e) => {
                            setEditForm((c) => ({ ...c, phone: maskPhoneInput(e.target.value) }));
                            setPanelDirty(true);
                            clearFieldError('phone');
                          }}
                        />
                        {fieldErrors.phone ? (
                          <p className="fv-form-field-error">{fieldErrors.phone}</p>
                        ) : null}
                      </label>
                      <label className="fv-form-field">
                        <span className="fv-form-label">Perfil</span>
                        <select
                          value={editForm.role}
                          disabled={modal.saving || isSelf}
                          onChange={(e) => {
                            setEditForm((c) => ({ ...c, role: e.target.value as UserRole }));
                            setPanelDirty(true);
                          }}
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
                        {/* U-D7: travado no proprio usuario. A nota diz por que
                            em vez de deixar o campo cinza sem explicacao. */}
                        {isSelf ? (
                          <p className="usr-panel-note">
                            Você não pode alterar o próprio perfil de acesso.
                          </p>
                        ) : null}
                      </label>
                    </div>
                  </form>
                )
              ) : null}
            </>
          )}

          <SuccessCheckOverlay show={panelSuccess} />
        </>
      </BottomSheet>

      {/* Descartar rascunho: confirm central portalado, `.is-scrim-none`
          (o painel atras fica como estava) + `.is-compact` (forms §8). */}
      {confirmDiscardOpen
        ? createPortal(
            <div
              className="app-modal-backdrop is-scrim-none"
              onClick={() => setConfirmDiscardOpen(false)}
            >
              <section
                className="app-modal is-themed app-confirm-modal is-compact"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="discard-user-title"
                aria-describedby="discard-user-description"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="app-modal-content">
                  <div className="app-confirm-modal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17v.01" />
                    </svg>
                  </div>
                  <h3 id="discard-user-title" className="app-confirm-modal-title">
                    {modal.mode === 'create' ? 'Descartar usuário?' : 'Descartar alterações?'}
                  </h3>
                  <p id="discard-user-description" className="app-confirm-modal-message">
                    Os dados preenchidos serão perdidos. Esta ação não pode ser desfeita.
                  </p>
                </div>

                <div className="app-modal-actions">
                  <button
                    type="button"
                    className="app-modal-secondary"
                    onClick={() => setConfirmDiscardOpen(false)}
                    autoFocus
                  >
                    Continuar
                  </button>
                  <button
                    type="button"
                    className="app-modal-submit is-danger"
                    onClick={handleDiscardPanel}
                  >
                    Descartar
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}

      {inactivateOpen && modal.user ? (
        <InactivateUserModal
          open
          user={modal.user}
          session={session}
          onSuccess={(updated) => {
            setInactivateOpen(false);
            dispatchModal({ type: 'actionSuccess', user: updated });
            toast.success({ title: 'Usuário inativado' });
            refreshList();
          }}
          onCancel={() => setInactivateOpen(false)}
        />
      ) : null}
    </AppShell>
  );
}
