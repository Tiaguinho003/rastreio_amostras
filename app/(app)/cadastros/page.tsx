'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DetailOverlay } from '../../../components/DetailOverlay';
import { BrokerFormModal } from '../../../components/cadastros/BrokerFormModal';
import {
  ClientDetailView,
  type ClientDetailInitialAction,
} from '../../../components/clients/ClientDetailView';
import { ClientsBrowser } from '../../../components/clients/ClientsBrowser';
import {
  ApiError,
  createBroker,
  getClientStats,
  listBrokers,
  lookupUsersForReference,
  updateBroker,
} from '../../../lib/api-client';
import { formatPhone } from '../../../lib/client-field-formatters';
import { CLIENT_MANAGEMENT_ROLES } from '../../../lib/roles';
import { useRequireRole } from '../../../lib/auth/AuthProvider';
import { useIsDesktop } from '../../../lib/use-desktop';
import type { Broker, BrokerInput, ClientStatsResponse, UserLookupItem } from '../../../lib/types';

// Cadastros = hub de todo nao-PROSPECTOR com 2 abas (a aba Bancos saiu na
// D141 -- banco virou texto livre na conta bancaria). "Clientes" (default) e a
// casa unica da lista via <ClientsBrowser> (a rota /clients virou redirect na
// F1 do redesign) + overlay de detalhe ?cliente=<id>; Corretores mantem a UI
// local. O FAB "+" e contextual a aba ativa.
type Tab = 'clientes' | 'corretores';

// Ajustes rodada 1 (KPI row): mini-metrica sob o valor de cada card.
type KpiDelta = { text: string; dir: 'up' | 'down' | 'flat' };
type KpiTone = 'blue' | 'green' | 'amber';

const formatKpiPct = (value: number) =>
  `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

// useSearchParams exige Suspense no App Router.
export default function CadastrosPageWrapper() {
  return (
    <Suspense>
      <CadastrosPage />
    </Suspense>
  );
}

function CadastrosPage() {
  const { session } = useRequireRole(CLIENT_MANAGEMENT_ROLES);
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL ?incomplete=true (card "Cadastros pendentes" do dashboard). So a pagina
  // le a URL; o ClientsBrowser recebe por prop (ele nao usa useSearchParams).
  const incompleteFromUrl = searchParams.get('incomplete') === 'true';

  // RD13/RD14: a aba vem da URL (?tab=corretores; default clientes) — padrao da
  // casa: param e a fonte de verdade, estado DERIVADO, troca via replace. Os
  // sub-itens da sidenav deep-linkam direto pra ca. (/contratos seguia o mesmo
  // molde ate a RC-D1 tirar as sub-abas dele.)
  const tab: Tab = searchParams.get('tab') === 'corretores' ? 'corretores' : 'clientes';
  const selectTab = useCallback(
    (next: Tab) => {
      if (next === tab) return;
      // Troca de aba zera o resto da query (overlay/incomplete) de proposito.
      router.replace(next === 'corretores' ? '/cadastros?tab=corretores' : '/cadastros', {
        scroll: false,
      });
    },
    [router, tab]
  );

  // F1 do redesign (RD2/RD7): o detalhe do cliente e um OVERLAY dirigido pela
  // URL — `?cliente=<id>` aberto, ausente fechado. Back fecha porque consome a
  // entry criada no push; deep-link/refresh (sem push nosso) fecha limpando o
  // param via replace (molde do /login ?modal).
  const clienteId = searchParams.get('cliente');
  const openedByPushRef = useRef(false);
  // Com modal interno aberto no detalhe, ESC/X do overlay nao fecham.
  const clientDismissGuardRef = useRef(false);

  // RD14: acao profunda do menu ⋯ da tabela (?acao=editar|documentos|status).
  // A pagina valida o param e repassa ao ClientDetailView, que abre o modal
  // correspondente apos o load e devolve o consumo (limpamos o param).
  const acaoParam = searchParams.get('acao');
  const acao: ClientDetailInitialAction | undefined =
    acaoParam === 'editar' || acaoParam === 'documentos' || acaoParam === 'status'
      ? acaoParam
      : undefined;

  const openClient = useCallback(
    (id: string, action?: ClientDetailInitialAction) => {
      const params = new URLSearchParams(searchParams.toString());
      const alreadyOpen = params.has('cliente');
      params.set('cliente', id);
      if (action) {
        params.set('acao', action);
      } else {
        params.delete('acao');
      }
      const url = `/cadastros?${params.toString()}`;
      if (alreadyOpen) {
        // Troca de cliente com o overlay aberto (peek desktop): replace mantem
        // UMA entry — back continua fechando em 1 passo.
        router.replace(url, { scroll: false });
      } else {
        router.push(url, { scroll: false });
        openedByPushRef.current = true;
      }
    },
    [router, searchParams]
  );

  // Consumo da acao profunda: o modal ja abriu — o ?acao= sai da URL via
  // replace (a entry do push do overlay continua UMA so; back segue fechando).
  const handleInitialActionConsumed = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has('acao')) return;
    params.delete('acao');
    const qs = params.toString();
    router.replace(qs ? `/cadastros?${qs}` : '/cadastros', { scroll: false });
  }, [router, searchParams]);

  const closeClient = useCallback(() => {
    if (openedByPushRef.current) {
      openedByPushRef.current = false;
      router.back();
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete('cliente');
    const qs = params.toString();
    router.replace(qs ? `/cadastros?${qs}` : '/cadastros', { scroll: false });
  }, [router, searchParams]);

  // RD14: KPI row do desktop. Fetch so >=901px; refetch quando o overlay de
  // detalhe abre/fecha (criacao, edicao e inativacao passam por ele) — o
  // Cache-Control de 30s da rota amortece repeticoes.
  const isDesktop = useIsDesktop();
  const [clientStats, setClientStats] = useState<ClientStatsResponse | null>(null);
  useEffect(() => {
    // RD16 C4: stats valem nos DOIS breakpoints — o KPI-2 mobile (Total +
    // Incompletos) do ClientsBrowser bebe do mesmo clientStats. Antes o gate
    // `!isDesktop` deixava os numeros em "—" no mobile pra sempre.
    if (!session) return;
    let active = true;
    getClientStats(session)
      .then((stats) => {
        if (active) setClientStats(stats);
      })
      .catch(() => {
        /* KPI fica em "—"; a lista continua funcional */
      });
    return () => {
      active = false;
    };
  }, [session, clienteId]);

  // RD14: o CTA "+ Novo cliente" do cabecalho desktop abre o quick-create que
  // vive DENTRO do ClientsBrowser — o browser registra o abridor aqui.
  const openCreateClientRef = useRef<(() => void) | null>(null);
  const registerCreateOpener = useCallback((openCreate: () => void) => {
    openCreateClientRef.current = openCreate;
  }, []);

  // Corretores
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [brokerSearch, setBrokerSearch] = useState('');
  const [showInactiveBrokers, setShowInactiveBrokers] = useState(false);
  const [brokerModalOpen, setBrokerModalOpen] = useState(false);
  const [editingBroker, setEditingBroker] = useState<Broker | null>(null);
  const [savingBroker, setSavingBroker] = useState(false);
  const [brokerModalError, setBrokerModalError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserLookupItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const refreshBrokers = useCallback(async () => {
    if (!session) return;
    try {
      const res = await listBrokers(session, {});
      setBrokers(res.items);
    } catch {
      /* refresh best-effort: a lista fica como está em falha */
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void refreshBrokers();
    setLoadingUsers(true);
    lookupUsersForReference(session, { limit: 200 })
      .then((res) => setUsers(res.items))
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [session, refreshBrokers]);

  const visibleBrokers = useMemo(() => {
    const q = brokerSearch.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return brokers
      .filter((b) => (showInactiveBrokers ? true : b.status === 'ACTIVE'))
      .filter(
        (b) =>
          !q ||
          b.name.toLowerCase().includes(q) ||
          (b.email ?? '').toLowerCase().includes(q) ||
          (qd.length > 0 && (b.cpf ?? '').includes(qd))
      );
  }, [brokers, brokerSearch, showInactiveBrokers]);

  const inactiveBrokersCount = useMemo(
    () => brokers.filter((b) => b.status === 'INACTIVE').length,
    [brokers]
  );

  if (!session) return null;

  function openCreateBroker() {
    setEditingBroker(null);
    setBrokerModalError(null);
    setBrokerModalOpen(true);
  }
  function openEditBroker(broker: Broker) {
    setEditingBroker(broker);
    setBrokerModalError(null);
    setBrokerModalOpen(true);
  }
  async function submitBroker(data: BrokerInput & { status?: 'ACTIVE' | 'INACTIVE' }) {
    if (!session) return;
    setSavingBroker(true);
    setBrokerModalError(null);
    try {
      if (editingBroker) {
        await updateBroker(session, editingBroker.id, data);
      } else {
        await createBroker(session, data);
      }
      // Sucesso: NÃO fecha aqui nem dá toast — o BrokerFormModal mostra o check
      // terminal e fecha via onClose. A lista atrás é atualizada antes.
      await refreshBrokers();
    } catch (cause) {
      setBrokerModalError(cause instanceof ApiError ? cause.message : 'Falha ao salvar corretor.');
      throw cause; // sinaliza a falha pro modal (pula o check).
    } finally {
      setSavingBroker(false);
    }
  }

  const count = visibleBrokers.length;
  const inactiveCount = inactiveBrokersCount;
  const showInactive = showInactiveBrokers;
  const toggleInactive = () => setShowInactiveBrokers((v) => !v);
  const searchValue = brokerSearch;
  const setSearchValue = (value: string) => setBrokerSearch(value);

  // RD16 /cadastros C7: UMA chrome so pra Corretores, no molde do Clientes (C2).
  // A .fv-toolbar (busca + toggle de inativos + contagem) serve os dois
  // breakpoints — no desktop presa no topo do cartao ({isDesktop ? brokerToolbar});
  // no mobile rola DENTRO do .spv2-list-scroll. Antes a aba montava DUAS chromes
  // (.hero-search-wrap mobile + .fv-toolbar desktop) e um .spv2-list-meta. O
  // toggle ganhou .fv-toolbar-filter-toggle: no desktop segue pilula secundaria,
  // no mobile vira texto compacto na 2a linha (nao cabe pilula ao lado da busca).
  const brokerToolbar = (
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
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Buscar corretor..."
          autoComplete="off"
          spellCheck={false}
        />
        {searchValue ? (
          <button
            type="button"
            className="fv-toolbar-search-clear"
            aria-label="Limpar busca"
            onClick={() => setSearchValue('')}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </form>
      {inactiveCount > 0 ? (
        <button
          type="button"
          className="fv-btn fv-btn-secondary fv-toolbar-filter-toggle"
          aria-pressed={showInactive}
          onClick={toggleInactive}
        >
          {showInactive ? 'Esconder inativos' : `Mostrar ${inactiveCount} inativo(s)`}
        </button>
      ) : null}
      <span className="fv-toolbar-count">{count} corretor(es)</span>
    </div>
  );

  // RD14 + ajustes rodada 1: cards da KPI row (desktop, so na aba Clientes),
  // na ordem pedida: total → novos → incompletos → ativos. As mini-metricas
  // derivam do proprio stats (sem serie historica): o total cresce por
  // novos/base-do-inicio-do-mes, novos compara com o mes anterior
  // (newLastMonth) e incompletos/ativos mostram participacao. Base zero vira
  // variacao absoluta ("+N"); sem stats o espaco fica reservado (nbsp).
  let totalDelta: KpiDelta | null = null;
  let newDelta: KpiDelta | null = null;
  let incompleteDelta: KpiDelta | null = null;
  let activeDelta: KpiDelta | null = null;
  if (clientStats) {
    const { total, active, incomplete, newThisMonth, newLastMonth } = clientStats;
    const monthStartBase = total - newThisMonth;
    if (monthStartBase > 0) {
      totalDelta =
        newThisMonth > 0
          ? { dir: 'up', text: `+${formatKpiPct((newThisMonth / monthStartBase) * 100)} este mês` }
          : { dir: 'flat', text: '0% este mês' };
    } else {
      totalDelta = newThisMonth > 0 ? { dir: 'up', text: `+${newThisMonth} este mês` } : null;
    }
    if (newLastMonth > 0) {
      const diff = ((newThisMonth - newLastMonth) / newLastMonth) * 100;
      newDelta =
        diff > 0
          ? { dir: 'up', text: `+${formatKpiPct(diff)} vs mês anterior` }
          : diff < 0
            ? { dir: 'down', text: `-${formatKpiPct(Math.abs(diff))} vs mês anterior` }
            : { dir: 'flat', text: '0% vs mês anterior' };
    } else {
      newDelta = newThisMonth > 0 ? { dir: 'up', text: `+${newThisMonth} vs mês anterior` } : null;
    }
    incompleteDelta =
      active > 0
        ? { dir: 'flat', text: `${formatKpiPct((incomplete / active) * 100)} dos ativos` }
        : null;
    activeDelta =
      total > 0 ? { dir: 'flat', text: `${formatKpiPct((active / total) * 100)} do total` } : null;
  }

  const kpiCards: {
    key: string;
    label: string;
    value: number | undefined;
    tone: KpiTone;
    delta: KpiDelta | null;
  }[] = [
    {
      key: 'total',
      label: 'Total de clientes',
      value: clientStats?.total,
      tone: 'blue',
      delta: totalDelta,
    },
    {
      key: 'new',
      label: 'Novos este mês',
      value: clientStats?.newThisMonth,
      tone: 'green',
      delta: newDelta,
    },
    {
      key: 'incomplete',
      label: 'Cadastros incompletos',
      value: clientStats?.incomplete,
      tone: 'amber',
      delta: incompleteDelta,
    },
    {
      key: 'active',
      label: 'Clientes ativos',
      value: clientStats?.active,
      tone: 'green',
      delta: activeDelta,
    },
  ];

  return (
    <>
      <section className="clients-page-v2 fv-cad-page">
        {/* RD16: o header verde da pagina saiu — o chrome mobile agora e unico
            e mora no AppShell (.fv-mtopbar: titulo da rota + camera + avatar). */}

        <div className="cad-tabs" role="tablist" aria-label="Tipo de cadastro">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'clientes'}
            className={`cad-tab${tab === 'clientes' ? ' is-active' : ''}`}
            onClick={() => selectTab('clientes')}
          >
            Clientes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'corretores'}
            className={`cad-tab${tab === 'corretores' ? ' is-active' : ''}`}
            onClick={() => selectTab('corretores')}
          >
            Corretores
          </button>
        </div>

        {/* RD14 (desktop >=901px): cabecalho institucional + KPI row. No mobile
            estes blocos ficam display:none e o header verde + abas seguem. */}
        <div className="fv-page-head">
          <h2 className="fv-page-title">{tab === 'clientes' ? 'Clientes' : 'Corretores'}</h2>
          {tab === 'clientes' ? (
            <button
              type="button"
              className="fv-btn fv-btn-primary"
              onClick={() => openCreateClientRef.current?.()}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              Novo cliente
            </button>
          ) : (
            <button type="button" className="fv-btn fv-btn-primary" onClick={openCreateBroker}>
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              Novo corretor
            </button>
          )}
        </div>

        {/* RD16 C4: no mobile o KPI-2 (Total + Incompletos) vem do ClientsBrowser,
            dentro da rolagem — aqui fica so o KPI de 4 cards do desktop, pra nao
            montar duas faixas (uma escondida por CSS). */}
        {tab === 'clientes' && isDesktop ? (
          <div className="fv-kpi-row">
            {kpiCards.map((card) => (
              <article key={card.key} className="fv-kpi">
                <div className="fv-kpi-top">
                  <span className="fv-kpi-label">{card.label}</span>
                  <span className={`fv-kpi-icon is-${card.tone}`} aria-hidden="true">
                    {card.key === 'total' ? (
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    ) : card.key === 'active' ? (
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="m16 11 2 2 4-4" />
                      </svg>
                    ) : card.key === 'incomplete' ? (
                      <svg viewBox="0 0 24 24" focusable="false">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 8v4" />
                        <path d="M12 16h.01" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M19 8v6" />
                        <path d="M22 11h-6" />
                      </svg>
                    )}
                  </span>
                </div>
                <span className="fv-kpi-value">
                  {card.value == null ? '—' : card.value.toLocaleString('pt-BR')}
                </span>
                <span
                  className={`fv-kpi-delta${
                    card.delta && card.delta.dir !== 'flat' ? ` is-${card.delta.dir}` : ''
                  }`}
                >
                  {card.delta?.dir === 'up' ? (
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M7 17 17 7" />
                      <path d="M8 7h9v9" />
                    </svg>
                  ) : card.delta?.dir === 'down' ? (
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="m7 7 10 10" />
                      <path d="M17 8v9H8" />
                    </svg>
                  ) : null}
                  {card.delta ? card.delta.text : '\u00A0'}
                </span>
              </article>
            ))}
          </div>
        ) : null}

        {tab === 'clientes' ? (
          <ClientsBrowser
            session={session}
            storageKey="clients-list-snapshot-cad-v3"
            initialIncomplete={incompleteFromUrl}
            clientStats={clientStats}
            onOpenClient={openClient}
            onOpenClientAction={openClient}
            registerCreateOpener={registerCreateOpener}
          />
        ) : (
          <>
            {/* RD16 C7: a .hero-search-wrap mobile saiu — busca/toggle/contagem
                agora vivem na brokerToolbar (uma chrome so, no scroll). O FAB de
                criacao perdeu o pai que o abrigava; virou filho direto, escondido
                no desktop por `.fv-cad-page .cv2-fab` (criar mora no "+ Novo
                corretor" do .fv-page-head). */}
            <button
              type="button"
              className="cv2-fab"
              aria-label="Novo corretor"
              onClick={openCreateBroker}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>

            <section className="clients-v2-sheet">
              {/* RD16 C7: no desktop a brokerToolbar fica presa no topo do
                  cartao; no mobile ela rola dentro do .spv2-list-scroll (o
                  antigo .spv2-list-meta saiu — contagem e toggle moram nela). */}
              {isDesktop ? brokerToolbar : null}

              {isDesktop ? (
                /* RD14 (desktop): tabela enxuta de corretores. Linha (e o
                   lapis) abrem o BrokerFormModal atual — re-skin fica pra E2. */
                <div className="spv2-list-scroll fv-table-scroll" tabIndex={-1}>
                  {count === 0 ? (
                    <div className="spv2-empty">
                      <p className="spv2-empty-text">Nenhum corretor para mostrar</p>
                    </div>
                  ) : (
                    <table className="fv-table">
                      <thead>
                        <tr>
                          <th scope="col">Nome</th>
                          <th scope="col">Contato</th>
                          <th scope="col">Usuário vinculado</th>
                          <th scope="col">Status</th>
                          <th scope="col" className="fv-table-th-actions" aria-label="Ações" />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleBrokers.map((broker) => {
                          const phone = formatPhone(broker.phone);
                          const isInactive = broker.status === 'INACTIVE';
                          return (
                            <tr
                              key={broker.id}
                              className={`fv-table-row${isInactive ? ' is-inactive' : ''}`}
                              onClick={() => openEditBroker(broker)}
                            >
                              <td>
                                <button
                                  type="button"
                                  className="fv-table-name-btn"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openEditBroker(broker);
                                  }}
                                >
                                  <span className="fv-table-name">{broker.name}</span>
                                </button>
                              </td>
                              <td>
                                {phone || broker.email ? (
                                  <span className="fv-table-cell-stack">
                                    {phone ? (
                                      <span className="fv-table-cell-main">{phone}</span>
                                    ) : null}
                                    {broker.email ? (
                                      <span className="fv-table-sub">{broker.email}</span>
                                    ) : null}
                                  </span>
                                ) : (
                                  <span className="fv-table-cell-main">—</span>
                                )}
                              </td>
                              <td>
                                <span className="fv-table-cell-main">
                                  {broker.user ? broker.user.fullName : '—'}
                                </span>
                              </td>
                              <td>
                                <span className="fv-table-chips">
                                  <span
                                    className={`fv-chip ${isInactive ? 'fv-chip-gray' : 'fv-chip-green'}`}
                                  >
                                    {isInactive ? 'Inativo' : 'Ativo'}
                                  </span>
                                </span>
                              </td>
                              <td
                                className="fv-table-td-actions"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="fv-table-dots is-stroke-icon"
                                  aria-label={`Editar ${broker.name}`}
                                  onClick={() => openEditBroker(broker)}
                                >
                                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <div className="spv2-list-scroll">
                  {/* RD16 C7: chrome unica — a brokerToolbar rola no topo da
                      lista (mobileListChrome, molde do Clientes/C2). */}
                  {brokerToolbar}
                  {count === 0 ? (
                    <div className="spv2-empty">
                      <p className="spv2-empty-text">Nenhum corretor para mostrar</p>
                    </div>
                  ) : (
                    <div className="cad-list">
                      {visibleBrokers.map((broker) => (
                        <button
                          key={broker.id}
                          type="button"
                          className={`cad-row${broker.status === 'INACTIVE' ? ' is-inactive' : ''}`}
                          onClick={() => openEditBroker(broker)}
                        >
                          <div className="cad-row-main">
                            <span className="cad-row-name">{broker.name}</span>
                            <span className="cad-row-sub">
                              {broker.user
                                ? `Usuário: ${broker.user.fullName}`
                                : broker.email || broker.phone || 'Sem vínculo'}
                            </span>
                          </div>
                          {/* RD16 C7: status institucional por chip (a MESMA
                              leitura da tabela desktop e do card do Clientes/C3),
                              sempre visivel. Substitui o .cad-row-badge cinza. */}
                          <span className="cad-row-status">
                            {broker.status === 'INACTIVE' ? (
                              <span className="fv-chip fv-chip-gray is-sm">Inativo</span>
                            ) : (
                              <span className="fv-chip fv-chip-green is-sm">Ativo</span>
                            )}
                          </span>
                          <svg className="cad-row-arrow" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="m9 6 6 6-6 6" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </section>

      <BrokerFormModal
        open={brokerModalOpen}
        broker={editingBroker}
        users={users}
        loadingUsers={loadingUsers}
        saving={savingBroker}
        errorMessage={brokerModalError}
        onClose={() => {
          if (!savingBroker) setBrokerModalOpen(false);
        }}
        onSubmit={submitBroker}
      />

      {/* Overlay de detalhe do cliente (F1): sheet de tela cheia no mobile,
          painel lateral peek no desktop. key={clienteId} reseta o estado ao
          trocar de cliente com o overlay aberto. */}
      <DetailOverlay
        open={Boolean(clienteId)}
        onClose={closeClient}
        title=""
        ariaLabel="Detalhe do cliente"
        dismissGuardRef={clientDismissGuardRef}
        // Rodada 2 FV: escopo do painel de registro institucional (largura
        // maior + grid 2 colunas no desktop) SO neste overlay.
        className="client-details-overlay"
        // Rodada 4 FV: X vira a seta ← na borda esquerda do drawer.
        closeVariant="edge-back"
      >
        {clienteId ? (
          <ClientDetailView
            key={clienteId}
            session={session}
            clientId={clienteId}
            dismissGuardRef={clientDismissGuardRef}
            initialAction={acao}
            onInitialActionConsumed={handleInitialActionConsumed}
          />
        ) : null}
      </DetailOverlay>
    </>
  );
}
