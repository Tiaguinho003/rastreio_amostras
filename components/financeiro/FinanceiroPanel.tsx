'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { SaleContractLifecycleDialog } from '../contracts/SaleContractLifecycleDialog';
import { ApiError, listFinanceiro } from '../../lib/api-client';
import { isAdmin } from '../../lib/roles';
import { useToast } from '../../lib/toast/ToastProvider';
import { useContractHighlight } from '../../lib/use-contract-highlight';
import type { FinanceiroFilter, FinanceiroReceivable, SessionData } from '../../lib/types';
import { FinanceiroCard } from './FinanceiroCard';

// Financeiro — a CASA DO PAGAMENTO (Revisao do Pagamento, FN1-FN7): hospeda todos os
// contratos no escopo do papel (ADMIN todos / COMMERCIAL os dele), com a lente de
// status de pagamento (chips a vencer/vencido/pago/cancelado), fila por vencimento
// (FN4), filtros (FN5), busca por nº/comprador/corretor e o cabecalho "Total a
// receber" + "N vencidos" (FN6). O "Pago" (FATURADO → PAGO) mora aqui (FN7). A casca
// (guard/AppShell/abas) vive em app/contratos/page.tsx. Paginado por cursor keyset
// opaco (scroll infinito).

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const FIN_PAGE_LIMIT = 30;
const FIN_LOAD_MORE_ROOT_MARGIN = '0px';

const FILTERS: { key: FinanceiroFilter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'a_vencer', label: 'A vencer' },
  { key: 'vencido', label: 'Vencido' },
  { key: 'pago', label: 'Pago' },
  { key: 'cancelado', label: 'Cancelado' },
];

type FinListStatus = 'loading-initial' | 'loading-more' | 'idle' | 'error';

interface FinListState {
  items: FinanceiroReceivable[];
  nextCursor: string | null;
  totalCommission: number;
  overdueCount: number;
  overdueCommission: number;
  status: FinListStatus;
  error: string | null;
}

type FinListAction =
  | { type: 'fetch-initial' }
  | { type: 'fetch-more' }
  | {
      type: 'success-initial';
      items: FinanceiroReceivable[];
      nextCursor: string | null;
      totalCommission: number;
      overdueCount: number;
      overdueCommission: number;
    }
  | { type: 'success-more'; items: FinanceiroReceivable[]; nextCursor: string | null }
  | { type: 'error'; message: string };

const FIN_INITIAL: FinListState = {
  items: [],
  nextCursor: null,
  totalCommission: 0,
  overdueCount: 0,
  overdueCommission: 0,
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
        overdueCount: action.overdueCount,
        overdueCommission: action.overdueCommission,
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

export function FinanceiroPanel({ session }: { session: SessionData }) {
  const toast = useToast();
  const [listState, dispatchList] = useReducer(finListReducer, FIN_INITIAL);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filter, setFilter] = useState<FinanceiroFilter>('todos');
  // Bump para forcar refetch da 1a pagina apos pagar (FN4: o pago sai da fila).
  const [reloadNonce, setReloadNonce] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // FN7: registro do pagamento (FATURADO → PAGO); reusa o dialog do /contratos.
  const [lifecycle, setLifecycle] = useState<{
    contractId: string;
    expectedVersion: number;
    contractNumber: string;
  } | null>(null);
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

  // Fetch inicial: dispara ao mudar busca/filtro/sessão ou após pagar (reloadNonce).
  // Reseta o cursor (a paginação é keyset por página).
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
      { search: appliedSearch || undefined, filter, limit: FIN_PAGE_LIMIT },
      { signal: abortController.signal }
    )
      .then((response) => {
        if (!active) return;
        dispatchList({
          type: 'success-initial',
          items: response.items,
          nextCursor: response.nextCursor,
          totalCommission: response.totalCommission,
          overdueCount: response.overdueCount,
          overdueCommission: response.overdueCommission,
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

      listFinanceiro(
        session,
        { search: appliedSearch || undefined, filter, limit: FIN_PAGE_LIMIT, cursor },
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
      { root: scrollRef.current, rootMargin: FIN_LOAD_MORE_ROOT_MARGIN }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [runLoadMore, listState.nextCursor, listState.status, session]);

  // FN7: qualquer sessão permitida pode registrar o pagamento; o backend re-checa a
  // posse (COMMERCIAL só vê/paga os contratos dele — D135).
  const canManage = true;

  const { items, status, error, nextCursor, totalCommission, overdueCount, overdueCommission } =
    listState;
  const isInitialLoading = status === 'loading-initial';
  // Piscada no contrato tocado no evento de pagamento do dashboard (?highlight=<id>).
  const highlightId = useContractHighlight(items, scrollRef);

  return (
    <>
      <div className="fin-total" role="status">
        <span className="fin-total-label">
          {isAdmin(session.user.role) ? 'Corretagem total' : 'Corretagem dos meus fechamentos'}
        </span>
        <span className="fin-total-value">{BRL.format(totalCommission)}</span>
      </div>

      {overdueCount > 0 ? (
        <div className="fin-overdue" role="status">
          <span className="fin-overdue-count">
            {overdueCount} {overdueCount === 1 ? 'vencido' : 'vencidos'}
          </span>
          <span className="fin-overdue-value">{BRL.format(overdueCommission)}</span>
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
            placeholder="Buscar nº, comprador ou corretor..."
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

      <div className="fin-filters" role="group" aria-label="Filtrar por estado de pagamento">
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
              <p className="spv2-empty-text">Nenhum contrato</p>
            </div>
          ) : (
            <div className="fin-list">
              {items.map((it) => (
                <FinanceiroCard
                  key={it.id}
                  item={it}
                  isExpanded={expandedIds.has(it.id)}
                  onToggle={() => toggleExpand(it.id)}
                  canManage={canManage}
                  isHighlighted={highlightId === it.id}
                  onPagar={() =>
                    setLifecycle({
                      contractId: it.id,
                      expectedVersion: it.version,
                      contractNumber: it.contractNumber,
                    })
                  }
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

      {lifecycle ? (
        <SaleContractLifecycleDialog
          session={session}
          contractId={lifecycle.contractId}
          expectedVersion={lifecycle.expectedVersion}
          contractNumber={lifecycle.contractNumber}
          action="pay"
          hasLot={false}
          onClose={() => setLifecycle(null)}
          onDone={() => {
            setLifecycle(null);
            // FN4/E28: o pago sai da fila (some do filtro Vencido/A vencer; vai pro fim
            // no Todos) → refetch da 1ª página (mantém filtro+busca). Substitui o patch
            // otimista, que sob a nova ordem deixaria um chip verde no meio da fila.
            setReloadNonce((n) => n + 1);
            toast.success({ title: 'Pagamento registrado' });
          }}
        />
      ) : null}
    </>
  );
}
