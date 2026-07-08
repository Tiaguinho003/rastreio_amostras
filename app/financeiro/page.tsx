'use client';

import Link from 'next/link';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { AppShell } from '../../components/AppShell';
import { HeaderAvatarMenu } from '../../components/HeaderAvatarMenu';
import { FinanceiroCard } from '../../components/financeiro/FinanceiroCard';
import { ApiError, listFinanceiro } from '../../lib/api-client';
import { FINANCEIRO_ROLES, isAdmin } from '../../lib/roles';
import { useRequireAuth } from '../../lib/use-auth';
import type { FinanceiroReceivable } from '../../lib/types';

// Financeiro (Fase F, D135): corretagem a receber por fechamento — ADMIN +
// COMMERCIAL (D135 reabre ao COMMERCIAL, escopado aos contratos dele; o total do
// COMMERCIAL e a cota dele). Relatorio derivado (sem persistencia). S86: paginado
// por cursor (scroll infinito, molde /users); a busca e o total sao server-side.

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const FIN_PAGE_LIMIT = 30;
const FIN_LOAD_MORE_ROOT_MARGIN = '0px';

type FinListStatus = 'loading-initial' | 'loading-more' | 'idle' | 'error';

interface FinListState {
  items: FinanceiroReceivable[];
  nextCursor: number | null;
  totalCommission: number;
  status: FinListStatus;
  error: string | null;
}

type FinListAction =
  | { type: 'fetch-initial' }
  | { type: 'fetch-more' }
  | {
      type: 'success-initial';
      items: FinanceiroReceivable[];
      nextCursor: number | null;
      totalCommission: number;
    }
  | { type: 'success-more'; items: FinanceiroReceivable[]; nextCursor: number | null }
  | { type: 'error'; message: string };

const FIN_INITIAL: FinListState = {
  items: [],
  nextCursor: null,
  totalCommission: 0,
  status: 'loading-initial',
  error: null,
};

function finListReducer(state: FinListState, action: FinListAction): FinListState {
  switch (action.type) {
    case 'fetch-initial':
      return { ...FIN_INITIAL, status: 'loading-initial' };
    case 'fetch-more':
      return { ...state, status: 'loading-more', error: null };
    case 'success-initial':
      return {
        ...state,
        items: action.items,
        nextCursor: action.nextCursor,
        totalCommission: action.totalCommission,
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

export default function FinanceiroPage() {
  const { session, loading, logout, setSession } = useRequireAuth({
    allowedRoles: FINANCEIRO_ROLES,
  });

  const [listState, dispatchList] = useReducer(finListReducer, FIN_INITIAL);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadMoreStateRef = useRef<{
    inFlight: boolean;
    token: number;
    abort: AbortController | null;
  }>({ inFlight: false, token: 0, abort: null });

  // Debounce da busca: aplica só com >=2 chars; <2 desfiltra. Espelha /users.
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

  // Fetch inicial: dispara ao mudar a busca ou a sessão. Reseta o cursor.
  useEffect(() => {
    if (!session) return;
    const abortController = new AbortController();
    let active = true;
    dispatchList({ type: 'fetch-initial' });
    loadMoreStateRef.current.token += 1;
    loadMoreStateRef.current.inFlight = false;
    loadMoreStateRef.current.abort?.abort();
    loadMoreStateRef.current.abort = null;

    listFinanceiro(
      session,
      { search: appliedSearch || undefined, limit: FIN_PAGE_LIMIT },
      { signal: abortController.signal }
    )
      .then((response) => {
        if (!active) return;
        dispatchList({
          type: 'success-initial',
          items: response.items,
          nextCursor: response.nextCursor,
          totalCommission: response.totalCommission,
        });
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        dispatchList({
          type: 'error',
          message: cause instanceof ApiError ? cause.message : 'Falha ao carregar o financeiro.',
        });
      });

    return () => {
      active = false;
      abortController.abort();
    };
  }, [appliedSearch, session]);

  // Load-more pelo cursor. inFlight + token protegem contra race em scrolls
  // rápidos (mesmo padrão de /users).
  const runLoadMore = useCallback(
    (cursor: number) => {
      const state = loadMoreStateRef.current;
      if (state.inFlight || !session) return;
      state.inFlight = true;
      state.token += 1;
      const myToken = state.token;
      state.abort?.abort();
      const controller = new AbortController();
      state.abort = controller;
      dispatchList({ type: 'fetch-more' });

      listFinanceiro(
        session,
        { search: appliedSearch || undefined, limit: FIN_PAGE_LIMIT, cursor },
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
    [session, appliedSearch]
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
      { root: scrollRef.current, rootMargin: FIN_LOAD_MORE_ROOT_MARGIN }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [runLoadMore, listState.nextCursor, listState.status, session]);

  if (loading || !session) return null;

  const avatarInitials = (() => {
    const base = (session.user.fullName ?? session.user.username ?? '').trim();
    if (!base) return '?';
    const parts = base.split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + last).toUpperCase() || '?';
  })();

  const { items, status, error, nextCursor, totalCommission } = listState;
  const isInitialLoading = status === 'loading-initial';

  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="clients-page-v2 fin-page">
        <header className="clients-v2-header">
          <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div className="clients-v2-header-center">
            <h2 className="nsv2-title">Financeiro</h2>
          </div>
          <HeaderAvatarMenu session={session} onLogout={logout} />
          <Link href="/profile" className="nsv2-avatar" aria-label="Ir para perfil">
            <span className="nsv2-avatar-initials">{avatarInitials}</span>
          </Link>
        </header>

        <div className="fin-total" role="status">
          <span className="fin-total-label">
            {isAdmin(session.user.role) ? 'Total a receber' : 'Corretagem dos meus fechamentos'}
          </span>
          <span className="fin-total-value">{BRL.format(totalCommission)}</span>
        </div>

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
              placeholder="Buscar nº ou corretor..."
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

        <section className="clients-v2-sheet">
          <div className="spv2-list-meta">
            <span className="spv2-list-count">{items.length} fechamento(s)</span>
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
                <p className="spv2-empty-text">Nenhuma corretagem a receber</p>
              </div>
            ) : (
              <div className="fin-list">
                {items.map((it) => (
                  <FinanceiroCard
                    key={it.id}
                    item={it}
                    isExpanded={expandedIds.has(it.id)}
                    onToggle={() => toggleExpand(it.id)}
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
      </section>
    </AppShell>
  );
}
