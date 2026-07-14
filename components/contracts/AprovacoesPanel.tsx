'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import {
  ApiError,
  getApprovalLabelPrefill,
  getApprovalRecentSends,
  listApprovals,
} from '../../lib/api-client';
import { isRoleAllowed, CONTRATOS_ROLES } from '../../lib/roles';
import { useToast } from '../../lib/toast/ToastProvider';
import { useContractHighlight } from '../../lib/use-contract-highlight';
import { useRecentSendsFeed } from '../../lib/use-recent-sends-feed';
import type {
  ApprovalFilter,
  ApprovalLabelPrefill,
  ApprovalReceivable,
  SessionData,
} from '../../lib/types';
import { ApprovalLabelModal } from '../ApprovalLabelModal';
import { RecentSendsCard } from '../RecentSendsCard';
import { AprovacaoCard } from './AprovacaoCard';

// Aprovação — a CASA da aprovação (AP25-AP28): a worklist dos contratos MARCADOS, com
// estados a enviar/enviada/cancelado, fila cronológica (faturamento mais próximo em
// cima), filtros, busca por nº/comprador, contador "N a enviar" e a ação [Gerar] (abre
// o ApprovalLabelModal pré-preenchido — a única casa proativa da geração, AP29). A
// casca (guard/AppShell/abas) vive em app/contratos/page.tsx. Paginado por cursor keyset.

const APR_PAGE_LIMIT = 30;

const FILTERS: { key: ApprovalFilter; label: string }[] = [
  { key: 'a_enviar', label: 'A enviar' },
  { key: 'enviada', label: 'Enviadas' },
  { key: 'cancelado', label: 'Canceladas' },
  { key: 'todos', label: 'Todas' },
];

type AprListStatus = 'loading-initial' | 'loading-more' | 'idle' | 'error';

interface AprListState {
  items: ApprovalReceivable[];
  nextCursor: string | null;
  pendingCount: number;
  status: AprListStatus;
  error: string | null;
}

type AprListAction =
  | { type: 'fetch-initial' }
  | { type: 'fetch-more' }
  | {
      type: 'success-initial';
      items: ApprovalReceivable[];
      nextCursor: string | null;
      pendingCount: number;
    }
  | { type: 'success-more'; items: ApprovalReceivable[]; nextCursor: string | null }
  | { type: 'error'; message: string };

const APR_INITIAL: AprListState = {
  items: [],
  nextCursor: null,
  pendingCount: 0,
  status: 'loading-initial',
  error: null,
};

function aprListReducer(state: AprListState, action: AprListAction): AprListState {
  switch (action.type) {
    case 'fetch-initial':
      return { ...APR_INITIAL, status: 'loading-initial' };
    case 'fetch-more':
      return { ...state, status: 'loading-more', error: null };
    case 'success-initial':
      return {
        ...state,
        items: action.items,
        nextCursor: action.nextCursor,
        pendingCount: action.pendingCount,
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

export function AprovacoesPanel({ session }: { session: SessionData }) {
  const toast = useToast();
  const [listState, dispatchList] = useReducer(aprListReducer, APR_INITIAL);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filter, setFilter] = useState<ApprovalFilter>('a_enviar');
  // Bump para forçar refetch da 1ª página após gerar (o item muda de estado).
  const [reloadNonce, setReloadNonce] = useState(0);
  // Etiqueta em geração (contrato + prefill do backend → abre o ApprovalLabelModal).
  const [gerarForm, setGerarForm] = useState<{
    contractId: string;
    prefill: ApprovalLabelPrefill;
  } | null>(null);
  const [gerarLoadingId, setGerarLoadingId] = useState<string | null>(null);

  // "Ver contrato" só ADMIN/COMMERCIAL (D110/AP27); [Gerar] = todos (a aba já é
  // não-PROSPECTOR pela casca).
  const canViewContract = isRoleAllowed(session.user.role, CONTRATOS_ROLES);

  // Card "Aprovações enviadas" (DSB-D14, migrado do dashboard): visão rápida dos
  // últimos envios, desktop-only, acima da worklist (que segue sendo a lista
  // completa — filtro "Enviadas").
  const approvalSends = useRecentSendsFeed(session, getApprovalRecentSends);

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

  // Fetch inicial: dispara ao mudar busca/filtro/sessão ou após gerar.
  useEffect(() => {
    if (!session) return;
    const abortController = new AbortController();
    let active = true;
    dispatchList({ type: 'fetch-initial' });
    loadMoreStateRef.current.token += 1;
    loadMoreStateRef.current.inFlight = false;
    loadMoreStateRef.current.abort?.abort();
    loadMoreStateRef.current.abort = null;

    listApprovals(
      session,
      { search: appliedSearch || undefined, filter, limit: APR_PAGE_LIMIT },
      { signal: abortController.signal }
    )
      .then((response) => {
        if (!active) return;
        dispatchList({
          type: 'success-initial',
          items: response.items,
          nextCursor: response.nextCursor,
          pendingCount: response.pendingCount,
        });
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        dispatchList({
          type: 'error',
          message: cause instanceof ApiError ? cause.message : 'Falha ao carregar as aprovações.',
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

      listApprovals(
        session,
        { search: appliedSearch || undefined, filter, limit: APR_PAGE_LIMIT, cursor },
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

  // [Gerar]: busca o prefill do contrato e abre o ApprovalLabelModal (molde da porta
  // do dashboard, agora AQUI — a sub-aba é a casa proativa da geração, AP29).
  const openGerar = useCallback(
    (contractId: string) => {
      if (gerarLoadingId) return;
      setGerarLoadingId(contractId);
      getApprovalLabelPrefill(session, contractId)
        .then((prefill) => setGerarForm({ contractId, prefill }))
        .catch((cause) => {
          toast.error({
            title: 'Não foi possível abrir a etiqueta',
            description: cause instanceof ApiError ? cause.message : undefined,
          });
        })
        .finally(() => setGerarLoadingId(null));
    },
    [session, gerarLoadingId, toast]
  );

  const { items, status, error, nextCursor, pendingCount } = listState;
  const isInitialLoading = status === 'loading-initial';
  // Piscada no contrato tocado no evento do dashboard (?highlight=<id>).
  const highlightId = useContractHighlight(items, scrollRef);

  return (
    <>
      <RecentSendsCard
        title="Aprovações enviadas"
        emptyLabel="Nenhuma aprovação enviada."
        variant="approvals"
        items={approvalSends.items}
        error={approvalSends.error}
        onRetry={approvalSends.retry}
      />

      {pendingCount > 0 ? (
        <div className="fin-overdue" role="status">
          <span className="fin-overdue-count">{pendingCount} a enviar</span>
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

      <div className="fin-filters" role="group" aria-label="Filtrar por estado da aprovação">
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
              <p className="spv2-empty-text">Nenhuma aprovação</p>
            </div>
          ) : (
            <div className="fin-list">
              {items.map((it) => (
                <AprovacaoCard
                  key={it.id}
                  item={it}
                  canViewContract={canViewContract}
                  onGerar={() => openGerar(it.id)}
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

      {gerarForm ? (
        <ApprovalLabelModal
          open
          session={session}
          prefill={gerarForm.prefill}
          saleContractId={gerarForm.contractId}
          onBack={null}
          onSent={() => {
            // Enviou → o item muda de estado (a_enviar → enviada, ou +1 no ·N×).
            // Refetch da 1ª página (mantém filtro+busca) + do card "Aprovações
            // enviadas" (o envio novo entra no topo). O modal segue no sucesso.
            setReloadNonce((n) => n + 1);
            approvalSends.retry();
          }}
          onClose={() => setGerarForm(null)}
        />
      ) : null}
    </>
  );
}
