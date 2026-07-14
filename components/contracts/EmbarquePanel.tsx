'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { ApiError, listShipments } from '../../lib/api-client';
import { isRoleAllowed, CONTRATOS_ROLES } from '../../lib/roles';
import { useToast } from '../../lib/toast/ToastProvider';
import { useContractHighlight } from '../../lib/use-contract-highlight';
import type { ShipmentFilter, ShipmentReceivable, SessionData } from '../../lib/types';
import { EmbarqueCard } from './EmbarqueCard';
import { ShipmentConfirmationModal } from './ShipmentConfirmationModal';

// Embarque — a CASA do embarque (EMB20/EMB23-EMB26): a worklist dos contratos que
// embarcam, com estados a embarcar/atrasado/embarcado/cancelado, fila cronológica
// (mais antigo/atrasado no topo), filtros, busca por nº/comprador, contador "N
// atrasados" e a ação [Confirmar embarque] (todos não-PROSPECTOR). A casca
// (guard/AppShell/abas) vive em app/embarques/page.tsx (split 2026-07-13).
// Paginado por cursor keyset.

const EMB_PAGE_LIMIT = 30;

const FILTERS: { key: ShipmentFilter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'a_embarcar', label: 'A embarcar' },
  { key: 'atrasado', label: 'Atrasado' },
  { key: 'embarcado', label: 'Embarcado' },
  { key: 'cancelado', label: 'Cancelado' },
];

type EmbListStatus = 'loading-initial' | 'loading-more' | 'idle' | 'error';

interface EmbListState {
  items: ShipmentReceivable[];
  nextCursor: string | null;
  overdueCount: number;
  status: EmbListStatus;
  error: string | null;
}

type EmbListAction =
  | { type: 'fetch-initial' }
  | { type: 'fetch-more' }
  | {
      type: 'success-initial';
      items: ShipmentReceivable[];
      nextCursor: string | null;
      overdueCount: number;
    }
  | { type: 'success-more'; items: ShipmentReceivable[]; nextCursor: string | null }
  | { type: 'error'; message: string };

const EMB_INITIAL: EmbListState = {
  items: [],
  nextCursor: null,
  overdueCount: 0,
  status: 'loading-initial',
  error: null,
};

function embListReducer(state: EmbListState, action: EmbListAction): EmbListState {
  switch (action.type) {
    case 'fetch-initial':
      return { ...EMB_INITIAL, status: 'loading-initial' };
    case 'fetch-more':
      return { ...state, status: 'loading-more', error: null };
    case 'success-initial':
      return {
        ...state,
        items: action.items,
        nextCursor: action.nextCursor,
        overdueCount: action.overdueCount,
        status: 'idle',
        error: null,
      };
    case 'success-more':
      return {
        ...state,
        items: [...state.items, ...action.items],
        nextCursor: action.nextCursor,
        status: 'idle',
        error: null,
      };
    case 'error':
      return { ...state, status: 'error', error: action.message };
    default:
      return state;
  }
}

export function EmbarquePanel({ session }: { session: SessionData }) {
  const toast = useToast();
  const [listState, dispatchList] = useReducer(embListReducer, EMB_INITIAL);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filter, setFilter] = useState<ShipmentFilter>('todos');
  // Bump para forçar refetch da 1ª página após confirmar (o item muda de estado).
  const [reloadNonce, setReloadNonce] = useState(0);
  // Contrato em confirmação (abre o ShipmentConfirmationModal).
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  // "Ver contrato" só ADMIN/COMMERCIAL (D110); [Confirmar] = todos (a aba já é
  // não-PROSPECTOR pela casca).
  const canViewContract = isRoleAllowed(session.user.role, CONTRATOS_ROLES);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadMoreStateRef = useRef<{
    inFlight: boolean;
    token: number;
    abort: AbortController | null;
  }>({ inFlight: false, token: 0, abort: null });

  // Debounce da busca: aplica só com >=2 chars; <2 desfiltra.
  useEffect(() => {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
    }
    const trimmed = searchInput.trim();
    const next = trimmed.length >= 2 ? trimmed : '';
    if (next === appliedSearch) return;
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

  // Fetch inicial: dispara ao mudar busca/filtro/sessão ou após confirmar.
  useEffect(() => {
    if (!session) return;
    const abortController = new AbortController();
    let active = true;
    dispatchList({ type: 'fetch-initial' });
    loadMoreStateRef.current.token += 1;
    loadMoreStateRef.current.inFlight = false;
    loadMoreStateRef.current.abort?.abort();
    loadMoreStateRef.current.abort = null;

    listShipments(
      session,
      { search: appliedSearch || undefined, filter, limit: EMB_PAGE_LIMIT },
      { signal: abortController.signal }
    )
      .then((response) => {
        if (!active) return;
        dispatchList({
          type: 'success-initial',
          items: response.items,
          nextCursor: response.nextCursor,
          overdueCount: response.overdueCount,
        });
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        dispatchList({
          type: 'error',
          message: cause instanceof ApiError ? cause.message : 'Falha ao carregar os embarques.',
        });
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [appliedSearch, filter, reloadNonce, session]);

  // Load-more pelo cursor. inFlight + token protegem contra race em scrolls rápidos.
  const runLoadMore = useCallback(
    (cursor: string) => {
      const state = loadMoreStateRef.current;
      if (state.inFlight || !session) return;
      state.inFlight = true;
      state.token += 1;
      const myToken = state.token;
      state.abort?.abort();
      const controller = new AbortController();
      state.abort = controller;
      dispatchList({ type: 'fetch-more' });

      listShipments(
        session,
        { search: appliedSearch || undefined, filter, limit: EMB_PAGE_LIMIT, cursor },
        { signal: controller.signal }
      )
        .then((response) => {
          if (loadMoreStateRef.current.token !== myToken) return;
          dispatchList({
            type: 'success-more',
            items: response.items,
            nextCursor: response.nextCursor,
          });
        })
        .catch((cause) => {
          if (loadMoreStateRef.current.token !== myToken) return;
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          dispatchList({
            type: 'error',
            message: cause instanceof ApiError ? cause.message : 'Falha ao carregar mais.',
          });
        })
        .finally(() => {
          if (loadMoreStateRef.current.token === myToken) {
            loadMoreStateRef.current.inFlight = false;
            loadMoreStateRef.current.abort = null;
          }
        });
    },
    [session, appliedSearch, filter]
  );

  // IntersectionObserver no sentinel: dispara load-more quando entra na viewport.
  useEffect(() => {
    if (!session) return;
    if (listState.status !== 'idle') return;
    if (listState.nextCursor === null) return;
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;
    const cursor = listState.nextCursor;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) runLoadMore(cursor);
      },
      { root: scrollRef.current, rootMargin: '0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [runLoadMore, listState.nextCursor, listState.status, session]);

  const { items, status, error, nextCursor, overdueCount } = listState;
  const isInitialLoading = status === 'loading-initial';
  // Piscada no contrato tocado no evento do dashboard (?highlight=<id>).
  const highlightId = useContractHighlight(items, scrollRef);

  return (
    <>
      {overdueCount > 0 ? (
        <div className="fin-overdue" role="status">
          <span className="fin-overdue-count">
            {overdueCount} {overdueCount === 1 ? 'atrasado' : 'atrasados'}
          </span>
        </div>
      ) : null}

      <div className="hero-search-wrap">
        <form
          className="hero-search-bar"
          role="search"
          onSubmit={(event) => event.preventDefault()}
        >
          <input
            className="hero-search-input"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar nº ou comprador..."
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
              <svg className="hero-search-icon-search" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m16.2 16.2 4.1 4.1" />
              </svg>
            </span>
          )}
        </form>
      </div>

      <div className="fin-filters" role="group" aria-label="Filtrar por estado do embarque">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`fin-filter-chip${filter === f.key ? ' is-active' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="clients-v2-sheet">
        <div className="spv2-list-meta">
          <span className="spv2-list-count">{items.length} contrato(s)</span>
        </div>

        <div className="spv2-list-scroll" ref={scrollRef}>
          {isInitialLoading ? (
            <div className="spv2-empty">
              <p className="spv2-empty-text">Carregando...</p>
            </div>
          ) : status === 'error' && items.length === 0 ? (
            <div className="spv2-empty">
              <p className="spv2-empty-text">{error ?? 'Não foi possível carregar.'}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="spv2-empty">
              <p className="spv2-empty-text">Nenhum embarque</p>
            </div>
          ) : (
            <div className="fin-list">
              {items.map((it) => (
                <EmbarqueCard
                  key={it.id}
                  item={it}
                  canViewContract={canViewContract}
                  onConfirm={() => setConfirmTarget(it.id)}
                  isHighlighted={highlightId === it.id}
                />
              ))}
              {nextCursor !== null ? (
                <div ref={loadMoreRef} className="fin-load-more" aria-hidden="true">
                  {status === 'loading-more' ? 'Carregando mais...' : ''}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {confirmTarget ? (
        <ShipmentConfirmationModal
          session={session}
          contractId={confirmTarget}
          onClose={() => setConfirmTarget(null)}
          onDone={() => {
            setConfirmTarget(null);
            // O item muda de estado (a_embarcar/atrasado → embarcado) → refetch da 1ª
            // página (mantém filtro+busca), como o Financeiro faz após pagar.
            setReloadNonce((n) => n + 1);
            toast.success({ title: 'Embarque confirmado' });
          }}
        />
      ) : null}
    </>
  );
}
