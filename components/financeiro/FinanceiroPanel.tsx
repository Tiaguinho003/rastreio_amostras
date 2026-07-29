'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { ApiError, listFinanceiro } from '../../lib/api-client';
import { useContractHighlight } from '../../lib/use-contract-highlight';
import { useIsDesktop } from '../../lib/use-desktop';
import type {
  FinanceiroFilter,
  FinanceiroKpi,
  FinanceiroPaymentState,
  FinanceiroReceivable,
  SessionData,
} from '../../lib/types';
import { FinanceiroCard } from './FinanceiroCard';
import { BRL, FIN_STATE_CHIP, FIN_STATE_LABEL, dateBR, dueBR, money } from './financeiro-format';

// Financeiro (Revisao do Pagamento, FN1-FN6): a corretagem A RECEBER da corretora,
// com a lente de estado (a vencer/vencido/recebida/cancelado), fila por vencimento
// (FN4) e busca por nº/comprador/corretor. RC-D3: so ADMIN entra. A casca
// (guard/AppShell) vive em app/financeiro/page.tsx. Paginado por cursor keyset opaco
// (scroll infinito).
//
// RC-D67: LEITURA PURA — nenhuma acao. A FN7 punha aqui o "Pago", a unica acao da
// pagina; ela morreu com o status PAGO. A corretagem sai da fila quando o CONTRATO e
// finalizado, e finalizar mora em /contratos (a casa de quem conduz o contrato).
//
// RC-D92..D95 (kit FV): desktop = TABELA (o acordeao morreu, o detalhe da corretagem
// virou sublinha); os quatro estados viraram a KPI ROW CLICAVEL, que e tambem o
// filtro (os chips `.fin-filters` e a faixa de vencidos sairam); sem coluna ⋯ —
// numa pagina de leitura pura, a unica saida e abrir o contrato, e quem faz isso e a
// linha inteira.

const FIN_PAGE_LIMIT = 30;
const FIN_LOAD_MORE_ROOT_MARGIN = '0px';
const TABLE_COLUMN_COUNT = 6;

// RC-D93: os quatro cartoes SAO o filtro. Ordem = a da fila de trabalho (o que
// aperta primeiro a esquerda), nao a do enum.
const KPI_CARDS: { key: FinanceiroPaymentState; label: string; tone: string }[] = [
  { key: 'a_vencer', label: 'A vencer', tone: 'amber' },
  { key: 'vencido', label: 'Vencido', tone: 'red' },
  { key: 'recebida', label: 'Recebida', tone: 'green' },
  { key: 'cancelado', label: 'Cancelado', tone: 'gray' },
];

const EMPTY_KPIS: Record<FinanceiroPaymentState, FinanceiroKpi> = {
  a_vencer: { count: 0, value: 0 },
  vencido: { count: 0, value: 0 },
  recebida: { count: 0, value: 0 },
  cancelado: { count: 0, value: 0 },
};

function contractHref(id: string): string {
  return `/contratos?details=${id}`;
}

type FinListStatus = 'loading-initial' | 'loading-more' | 'idle' | 'error';

interface FinListState {
  items: FinanceiroReceivable[];
  nextCursor: string | null;
  kpis: Record<FinanceiroPaymentState, FinanceiroKpi>;
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
      kpis: Record<FinanceiroPaymentState, FinanceiroKpi>;
    }
  | { type: 'success-more'; items: FinanceiroReceivable[]; nextCursor: string | null }
  | { type: 'error'; message: string };

const FIN_INITIAL: FinListState = {
  items: [],
  nextCursor: null,
  kpis: EMPTY_KPIS,
  status: 'loading-initial',
  error: null,
};

function finListReducer(state: FinListState, action: FinListAction): FinListState {
  switch (action.type) {
    case 'fetch-initial':
      // Os KPIs seguem a BUSCA, nao o filtro: trocar de cartao nao pode zera-los e
      // deixar a faixa piscando. Por isso o reset preserva os numeros atuais.
      return { ...FIN_INITIAL, kpis: state.kpis, status: 'loading-initial' };
    case 'fetch-more':
      return { ...state, status: 'loading-more', error: null };
    case 'success-initial':
      return {
        ...state,
        items: action.items,
        nextCursor: action.nextCursor,
        kpis: action.kpis,
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
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [listState, dispatchList] = useReducer(finListReducer, FIN_INITIAL);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filter, setFilter] = useState<FinanceiroFilter>('todos');

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

  // Fetch inicial: dispara ao mudar busca/filtro/sessão. Reseta o cursor (a
  // paginação é keyset por página).
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
          kpis: response.kpis,
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
  }, [appliedSearch, filter, session]);

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

  const { items, status, error, nextCursor, kpis } = listState;
  const isInitialLoading = status === 'loading-initial';
  // Piscada no contrato tocado no evento de pagamento do dashboard (?highlight=<id>).
  const highlightId = useContractHighlight(items, scrollRef);

  // Contagem do conjunto INTEIRO (vem dos KPIs), não das páginas já carregadas.
  const listCount =
    filter === 'todos'
      ? KPI_CARDS.reduce((sum, card) => sum + kpis[card.key].count, 0)
      : kpis[filter].count;

  const openContract = (id: string) => router.push(contractHref(id));

  // --- Chrome (KPI row + toolbar) --------------------------------------------

  // As duas faixas são montadas UMA vez e POSICIONADAS por breakpoint: no desktop
  // ficam presas (a KPI acima do cartão, a toolbar no topo dele); no mobile rolam
  // DENTRO do `.spv2-list-scroll`, porque ali cada faixa presa custa altura
  // permanente (data-tables §1).
  //
  // RC-D94: no mobile são os QUATRO cartões (2×2), não dois. A regra do KPI-2
  // vale para cartão que só informa; aqui o cartão é a ÚNICA porta do estado —
  // cortar dois tornaria "Recebida" e "Cancelado" inalcançáveis.
  const kpiRow = (
    <div className="fv-kpi-row">
      {KPI_CARDS.map((card) => {
        const isActive = filter === card.key;
        return (
          <button
            key={card.key}
            type="button"
            className={`fv-kpi is-clickable fv-kpi-tone-${card.tone}${isActive ? ' is-active' : ''}`}
            aria-pressed={isActive}
            onClick={() => setFilter(isActive ? 'todos' : card.key)}
          >
            <div className="fv-kpi-top">
              <span className="fv-kpi-label">{card.label}</span>
              <span className={`fv-kpi-icon is-${card.tone}`} aria-hidden="true">
                {card.key === 'a_vencer' ? (
                  <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                ) : card.key === 'vencido' ? (
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                  </svg>
                ) : card.key === 'recebida' ? (
                  <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="12" cy="12" r="9" />
                    <path d="m8.5 12.3 2.4 2.4 4.6-4.9" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="12" cy="12" r="9" />
                    <path d="m8.8 8.8 6.4 6.4" />
                  </svg>
                )}
              </span>
            </div>
            <span className="fv-kpi-value fin-kpi-value">{BRL.format(kpis[card.key].value)}</span>
            <span className="fv-kpi-delta">
              {kpis[card.key].count} {kpis[card.key].count === 1 ? 'contrato' : 'contratos'}
            </span>
          </button>
        );
      })}
    </div>
  );

  const toolbar = (
    <div className="fv-toolbar">
      <form
        className="fv-toolbar-search"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
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
          placeholder="Buscar nº, comprador ou corretor..."
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
      {/* Sem botão de filtros: os KPIs SÃO o filtro (RC-D93). "Limpar" só aparece
          quando há um ligado — é a saída sem precisar achar o cartão aceso. */}
      {filter !== 'todos' ? (
        <button type="button" className="fv-toolbar-clear" onClick={() => setFilter('todos')}>
          Limpar
        </button>
      ) : null}
      <span className="fv-toolbar-count">{listCount} contrato(s)</span>
    </div>
  );

  const mobileListChrome = isDesktop ? null : (
    <>
      {kpiRow}
      {toolbar}
    </>
  );

  const emptyState = (
    <div className="spv2-empty">
      <svg className="cv2-empty-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18v12H3z" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M7 12h.01M17 12h.01" />
      </svg>
      <p className="spv2-empty-text">Nenhum contrato para mostrar</p>
      <p className="spv2-empty-sub">
        {filter !== 'todos' || appliedSearch
          ? 'Tente outro termo ou desligue o filtro'
          : 'A corretagem aparece aqui quando um contrato é emitido'}
      </p>
    </div>
  );

  const tableSkeletonRows = (count: number, keyPrefix: string) =>
    Array.from({ length: count }).map((_, i) => (
      <tr key={`${keyPrefix}-${i}`} className="fv-table-skel-row" aria-hidden="true">
        {Array.from({ length: TABLE_COLUMN_COUNT }).map((__, j) => (
          <td key={j}>
            <span className="fv-table-skel" />
          </td>
        ))}
      </tr>
    ));

  return (
    <>
      {/* Desktop (>=901px): cabeçalho institucional. No mobile fica display:none —
          o título mora na faixa do shell. Sem ações: aqui não se cria nada. */}
      <div className="fv-page-head">
        <h2 className="fv-page-title">Financeiro</h2>
      </div>

      {isDesktop ? kpiRow : null}

      <section className="clients-v2-sheet">
        {isDesktop ? toolbar : null}

        {status === 'error' && error && items.length > 0 ? (
          <p className="spv2-error-banner" role="status">
            {error}
          </p>
        ) : null}

        {isInitialLoading ? (
          isDesktop ? (
            <div className="spv2-list-scroll fv-table-scroll">
              <table className="fv-table">
                <tbody>{tableSkeletonRows(6, 'boot')}</tbody>
              </table>
            </div>
          ) : (
            <div className="spv2-list-scroll">
              {mobileListChrome}
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={`boot-${i}`} className="spv2-skeleton-card" aria-hidden />
              ))}
            </div>
          )
        ) : status === 'error' && items.length === 0 ? (
          <div className={`spv2-list-scroll${isDesktop ? ' fv-table-scroll' : ''}`}>
            {mobileListChrome}
            <div className="spv2-empty">
              <p className="spv2-empty-text">{error ?? 'Não foi possível carregar.'}</p>
            </div>
          </div>
        ) : items.length === 0 ? (
          // `fv-table-scroll` no desktop também no vazio: sem ele o
          // `.spv2-list-scroll` é um grid de 3 colunas (herdado dos cards) e o
          // `.spv2-empty` cairia na primeira célula, encostado à esquerda.
          <div className={`spv2-list-scroll${isDesktop ? ' fv-table-scroll' : ''}`}>
            {mobileListChrome}
            {emptyState}
          </div>
        ) : isDesktop ? (
          /* RC-D92 (desktop): tabela institucional de 6 colunas, SEM ⋯ (RC-D95).
             Os mesmos dados, ordem e scroll infinito dos cards — muda a
             apresentação. A linha inteira navega; o nº é um <Link> de verdade,
             para dar alvo de teclado e abrir em outra aba. */
          <div ref={scrollRef} className="spv2-list-scroll fv-table-scroll" tabIndex={-1}>
            <table className="fv-table">
              <colgroup>
                <col className="fv-col-contract" />
                <col className="fv-col-fin-buyer" />
                <col className="fv-col-fin-value" />
                <col className="fv-col-fin-commission" />
                <col className="fv-col-fin-due" />
                <col className="fv-col-status" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Contrato</th>
                  <th scope="col">Comprador</th>
                  <th scope="col">Valor total</th>
                  <th scope="col">Corretagem</th>
                  <th scope="col">Vencimento</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={`fv-table-row${highlightId === item.id ? ' is-highlighted' : ''}`}
                    data-contract-id={item.id}
                    onClick={() => openContract(item.id)}
                  >
                    <td>
                      <Link
                        href={contractHref(item.id)}
                        className="fv-table-name-btn"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <span className="fv-table-name">{item.contractNumber}</span>
                        <span className="fv-table-code">{dateBR(item.contractDate)}</span>
                      </Link>
                    </td>
                    <td>
                      <span className="fv-table-cell-stack">
                        <span className="fv-table-cell-main">{item.buyerName ?? '—'}</span>
                        {item.brokers.length > 0 ? (
                          <span className="fv-table-sub">
                            {item.brokers.map((b) => b.name).join(' · ')}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      <span className="fv-table-cell-main">{money(item.totalValue)}</span>
                    </td>
                    <td>
                      {/* O acordeão virou sublinha (RC-D92): o split vendedor ·
                          comprador fica sempre à vista, sem um clique por linha. */}
                      <span className="fv-table-cell-stack">
                        <span className="fv-table-cell-main fin-commission">
                          {money(item.commissionTotal)}
                        </span>
                        <span className="fv-table-sub">
                          V {money(item.sellerBrokerageValue)} · C {money(item.buyerBrokerageValue)}
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="fv-table-cell-main">{dueBR(item.paymentDate)}</span>
                    </td>
                    <td>
                      <span className={`fv-chip ${FIN_STATE_CHIP[item.paymentState]}`}>
                        {FIN_STATE_LABEL[item.paymentState]}
                      </span>
                    </td>
                  </tr>
                ))}
                {status === 'loading-more' ? tableSkeletonRows(3, 'more') : null}
              </tbody>
            </table>
            {nextCursor ? (
              <div ref={loadMoreRef} className="cv2-load-more-sentinel" aria-hidden />
            ) : null}
            {!nextCursor && status === 'idle' ? (
              <p className="spv2-list-end">Você chegou ao fim</p>
            ) : null}
          </div>
        ) : (
          <div className="spv2-list-scroll" ref={scrollRef}>
            {mobileListChrome}
            <div className="fin-list">
              {items.map((item) => (
                <FinanceiroCard key={item.id} item={item} isHighlighted={highlightId === item.id} />
              ))}
              {status === 'loading-more'
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={`more-${i}`} className="spv2-skeleton-card" aria-hidden />
                  ))
                : null}
            </div>
            {nextCursor ? (
              <div ref={loadMoreRef} className="cv2-load-more-sentinel" aria-hidden />
            ) : null}
            {!nextCursor && status === 'idle' ? (
              <p className="spv2-list-end">Você chegou ao fim</p>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}
