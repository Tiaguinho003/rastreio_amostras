# Dashboard — Visão Geral

Status: Ativo (documento-mãe / verdade viva do funcionamento atual)
Escopo: o que a página `/dashboard` faz hoje — fluxo, layout desktop e mobile, disponibilidade por papel, cards, rotas de API, projeções de banco e regras de negócio
Última revisão: 2026-07-12 (reconstruída a partir do código real)
Documentos relacionados: `Dashboard-Plano-de-Trabalho.md` (backlog e próximas mudanças), `API-e-Contratos.md`, `Auditoria-Navegacao-por-Papel.md`, `Produto-e-Fluxos.md`

> **Como este documento se mantém vivo:** a cada implementação concluída e validada no ciclo de revisão do dashboard, esta Visão Geral é atualizada no mesmo passo. As decisões e o backlog vivem no `Dashboard-Plano-de-Trabalho.md`; aqui fica **só o estado atual**.

---

## 1. Propósito e quem usa

O dashboard é a **home pós-login** de todos os papéis. Ele tem duas naturezas distintas:

- **Dashboard padrão** — para os 5 papéis não-PROSPECTOR (ADMIN, COMMERCIAL, CLASSIFIER, REGISTRATION, CADASTRO). É um painel operacional: pendências do dia, disponibilidade de lotes para venda, últimos envios e um calendário de eventos.
- **Dashboard do PROSPECTOR** — um app restrito e dedicado (a "casa" do papel de campo): registro de visitas/informes, contadores do dia e a lista dos próprios informes. Nada além disso.

A escolha entre os dois é feita em `app/dashboard/page.tsx` pelo papel do usuário logado.

---

## 2. Arquitetura e fluxo de montagem

**Arquivo raiz:** `app/dashboard/page.tsx` (`'use client'`)

```
DashboardPageWrapper (Suspense)   ← Suspense por causa do useSearchParams
  └─ DashboardPage
       useRequireAuth() → { session, loading, logout, setSession }
       prospector = isProspector(session.role)
       useDashboardData(prospector ? null : session)   ← null = não busca
       if (loading || !session) → null
       <AppShell>
         prospector
           ? <ProspectorDashboard>
           : <>
               <DashboardMobile ... />     ← ambos montados SEMPRE;
               <DashboardDesktop ... />       o CSS esconde um no breakpoint 901px
             </>
```

Decisões estruturais em vigor:

- **Twins mobile + desktop montados juntos.** `DashboardMobile` e `DashboardDesktop` são renderizados sempre; a troca é **só por CSS** no breakpoint `min-width: 901px` (classes `.dashboard-mobile` / `.dashboard-desktop`). Cada twin, nos seus `useEffect`, verifica `window.matchMedia('(min-width: 901px)')` para que o twin inativo não dispare fetches.
- **PROSPECTOR tem branch separado** e recebe `null` no `useDashboardData` — não chega a chamar os endpoints do dashboard padrão (que responderiam **403**, ver §8).
- **`Suspense`** envolve a página porque o `ProspectorDashboard` usa `useSearchParams` (deep link `?informe=novo` do lembrete push).

---

## 3. Disponibilidade e matriz por papel

Rótulos de papel (`lib/roles.ts` → `USER_ROLE_LABELS`):

| Papel | Rótulo na UI |
|---|---|
| ADMIN | Administração |
| COMMERCIAL | Comercial |
| CLASSIFIER | Classificação |
| REGISTRATION | Impressão |
| CADASTRO | Cadastro |
| PROSPECTOR | Prospecção |

**O que cada papel vê no dashboard:**

| Elemento | ADMIN | COMMERCIAL | CLASSIFIER | REGISTRATION | CADASTRO | PROSPECTOR |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard padrão (mobile+desktop) | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Card **Classificação pendente** | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Card **Cadastros pendentes** | ✅ | — | — | — | ✅ | — |
| Donut **Lotes disponíveis** | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Card **Últimos envios** (desktop) | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Card **Eventos** — feed de **pagamento** | ✅ | ✅ (só os dele) | — | — | — | — |
| Card **Eventos** — feed de **aprovação** | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Card **Eventos** — feed de **embarque** | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Dashboard do PROSPECTOR | — | — | — | — | — | ✅ |

Regras que geram a matriz:

- **Card "Cadastros pendentes"** → `canManageClients(role)` = `CLIENT_MANAGEMENT_ROLES` = **ADMIN + CADASTRO**. Os demais não abrem o detalhe do cliente, então o card não os levaria a ação nenhuma.
- **Feed de pagamento do card de Eventos** → `FINANCEIRO_ROLES` = **ADMIN + COMMERCIAL**; o COMMERCIAL é escopado aos contratos em que é corretor (`Broker.userId`). Os demais nem chamam o endpoint.
- **Feeds de aprovação e embarque** → **sem gate de papel**: todos os não-PROSPECTOR veem tudo (auth-only; o único bloqueio é o allowlist central que barra o PROSPECTOR).

> ⚠️ **Alívio de UI, não segurança.** O card "Cadastros pendentes" e o escopo do COMMERCIAL são reforçados no backend para o feed financeiro (§8). Mas os endpoints `pending` e `sales-availability` exigem **só autenticação** — qualquer papel autenticado obtém os mesmos números. A segregação de papel real, no estado atual, é o allowlist do PROSPECTOR.

---

## 4. Layout desktop (`components/dashboard/DashboardDesktop.tsx`)

Grid de duas colunas (`.dd-content-grid`):

```
┌─ .dd-left-col ───────────────────────┬─ coluna direita ──────────┐
│  .dd-summary-row                      │                           │
│   ┌──────────────┐ ┌──────────────┐   │   ┌───────────────────┐   │
│   │ Classificação│ │  Cadastros   │   │   │                   │   │
│   │  pendente    │ │  pendentes*  │   │   │     EVENTOS       │   │
│   └──────────────┘ └──────────────┘   │   │   (calendário     │   │
│  .dd-left-stack                       │   │    de 2 semanas)  │   │
│   ┌───────────────────────────────┐   │   │                   │   │
│   │  Donut "Lotes disponíveis"    │   │   │   altura total    │   │
│   └───────────────────────────────┘   │   │   da coluna       │   │
│   ┌───────────────────────────────┐   │   │                   │   │
│   │  "Últimos envios" (scroll      │   │   │                   │   │
│   │   interno)                    │   │   │                   │   │
│   └───────────────────────────────┘   │   └───────────────────┘   │
└───────────────────────────────────────┴───────────────────────────┘
  * "Cadastros pendentes" só para ADMIN + CADASTRO (senão .dd-summary-row.is-single)
```

- **Coluna esquerda (`.dd-left-col`):** linha de StatCards (1 ou 2) + pilha donut/Últimos envios (rows 1fr/1fr preenchendo a viewport; a lista de envios rola por dentro — o shell do dashboard não rola).
- **Coluna direita:** o card **Eventos** ocupa a altura inteira (do topo da linha de pendências até a base).
- Banner de erro (`.dashboard-error-banner`, `role="status"`) no topo quando o fetch principal falha.
- **`OperationModal`** (BottomSheet que vira modal central no desktop) é aberto pelo card "Classificação pendente".

---

## 5. Layout mobile (`components/dashboard/DashboardMobile.tsx`)

Página que rola inteira (`.dashboard-scroll`), sem nada fixo:

```
.dashboard-hero      → saudação (hora do dia) + nome + papel + avatar (iniciais) + HeaderAvatarMenu
.dashboard-sheet
  is-slot-operations → grid de op-cards:
     ┌──────────────────────────┐  "Lotes / Pendentes"  (classificação; badge com total)
     ┌──────────────────────────┐  "Clientes / Pendentes"* (→ /cadastros?incomplete=true)
  is-slot-sales      → Donut "Lotes disponíveis" (SalesAvailabilityCard, tamanho cheio)
  * só ADMIN + CADASTRO (senão .dashboard-operations-grid.is-single)
```

- **Diferenças vs. desktop:** o mobile **não** tem o card "Últimos envios" nem o card "Eventos" (ambos são **desktop-only**). Tem o hero com saudação, que o desktop não tem.
- `OperationModal` idem desktop (aberto pelo op-card de classificação).

---

## 6. Dashboard do PROSPECTOR (`components/dashboard/prospector/`)

App restrito (tabbar só com Início + Perfil). Reusa as classes visuais do dashboard padrão + os cards `rsm-*` do /resumo.

- **Hero:** saudação + papel + avatar + **busca por nome do cliente** (debounce 250ms, a partir da 2ª letra; filtra no servidor).
- **2 stat op-cards (inertes):** "Visitas / Hoje" (`stats.todayCount`) e "Clientes novos / Hoje" (`stats.todayNewClientsCount`) — de `getMyVisitReportStats`.
- **Lista "Últimos informes":** os PRÓPRIOS informes, paginados (`PAGE_LIMIT = 20`, "Carregar mais"), acordeão de expansão, lixeira só no próprio informe. Só essa área rola.
- **Chip de fila offline:** contador do outbox + "Enviar agora" quando online.
- **FAB central "+":** abre o `VisitReportFormSheet` (novo informe). Deep link `?informe=novo` (lembrete push) abre o sheet sozinho e limpa a URL.
- **Refetch:** foco/visibilidade (throttle 30s) + envio online pelo sheet + conclusão do sync da fila offline (`VISIT_SYNC_COMPLETED_EVENT`).
- **Dados:** hook `useProspectorDashboardData(session, search)` → `getMyVisitReportStats` + `listVisitReports` (escopo por `userId` forçado no backend).

---

## 7. Cards do dashboard padrão em detalhe

### 7.1 Classificação pendente (`StatCard` / op-card + `OperationModal`)

- **Mostra:** total de amostras aguardando classificação. Clique abre o `OperationModal` com a lista.
- **Dado:** `data.classificationPending` de `useDashboardData` → `getDashboardPending`.
- **Backend:** `sample-query-service.getDashboardPending()` — `groupBy` + `findMany` sobre `status IN CLASSIFICATION_PENDING_STATUSES` (= **`REGISTRATION_CONFIRMED`**), ordenado por `updatedAt asc`, **até `DASHBOARD_LIST_LIMIT` = 500 itens** (a lista completa alimenta o modal; a contagem vem do groupBy).
- **`OperationModal`:** cards colapsados no visual `.spv2-card` (lote + BlendBadge + owner + sacas declaradas). A seta de cada card navega para `/camera?sampleId=…` (fluxo de classificação).

### 7.2 Cadastros pendentes (`StatCard` / op-card) — ADMIN + CADASTRO

- **Mostra:** total de clientes com cadastro incompleto. Clique → `/cadastros?incomplete=true`.
- **Dado:** `data.clientsIncomplete.total`.
- **Backend:** `client.count({ status: 'ACTIVE', ...buildCompletenessWhere('incomplete') })` — reusa a regra canônica de completude de `client-service` (mesma do chip filtro em /clients).

### 7.3 Lotes disponíveis (donut — `components/SalesAvailabilityCard.tsx`)

- **Mostra:** um donut com 3 faixas de idade dos lotes disponíveis para venda: **> 30 dias**, **15–30 dias**, **< 15 dias**.
- **Dado:** `salesData.bands` de `getDashboardSalesAvailability`.
- **Backend:** `$queryRaw` em `sample` contando por `created_at` com fronteiras BRT (offset −3h), `WHERE status <> 'INVALIDATED' AND commercial_status IN ('OPEN', 'PARTIALLY_SOLD')`.
- **Regra-chave:** conta por **`created_at`** (data de registro/chegada do lote) e **inclui não classificados** (qualquer amostra com status comercial OPEN/PARTIALLY_SOLD que não foi invalidada).
- Renderizado `compact` no desktop, tamanho cheio no mobile.

### 7.4 Últimos envios (`RecentSendsCard`) — desktop-only

- **Mostra:** os **últimos 40 envios** como minicards **inertes** (`.spv2-card`), com scroll interno. Cancelados aparecem esmaecidos com a tag "Cancelado".
- **3 tipos (`kind`):** `PHYSICAL_SAMPLE` (Amostra física), `REPORT` (Laudo), `APPROVAL` (Aprovação — pill laranja). Amostra/laudo mostram lote + destinatário atual; aprovação mostra nº do contrato + comprador.
- **Dado:** estado local `recentSends`, buscado no próprio `DashboardDesktop` via `getDashboardRecentSends` (refetch em foco/visibilidade com throttle 30s + ao entrar no breakpoint desktop).
- **Backend:** o handler mescla duas fontes — `sample-query-service.getDashboardRecentSends()` (eventos `PHYSICAL_SAMPLE_SENT` + `REPORT_EXPORTED`, top-40, com detecção de cancelamento e destinatário pós-edição) + `sale-contract-service.getRecentApprovalSends()` (etiquetas de aprovação com contrato, top-40) — ordena por `at` desc e corta em 40 (top-40 global). Degrada para só-amostra se o contract service não estiver configurado.

### 7.5 Eventos (`EventsCalendarCard`) — desktop-only

- **Layout:** calendário de **2 semanas domingo-first**, navegação ◀ ▶ de 14 em 14 dias + botão "Hoje", quadrados com número + até 3 dots coloridos por tipo (`+N` acima disso), painel fixo embaixo com os eventos do dia selecionado. Hoje destacado e selecionado por default. Só visualização. Navegação por teclado (roving tabindex, setas). Datas em BRT (helpers em `lib/dashboard-calendar.ts`).
- **3 feeds mesclados client-side** no `DashboardDesktop` (a janela visível é emitida pelo card via `onWindowChange` → o pai busca a quinzena):

  | Feed | typeKey | Visibilidade | Fonte |
  |---|---|---|---|
  | Pagamento | `contract_payment_due` / `contract_payment_overdue` / `contract_payment_paid` | ADMIN + COMMERCIAL (escopado) | `getDashboardPaymentEvents` |
  | Aprovação | `contract_approval_due` | Todos os não-PROSPECTOR | `getDashboardApprovalEvents` |
  | Embarque | `contract_shipment` / `contract_shipment_done` / `contract_shipment_overdue` | Todos os não-PROSPECTOR | `getDashboardShipmentEvents` |

- **Navegação pura (sem ação no card):** todo evento é um link para a sub-aba dona em `/contratos` — pagamento → `?tab=financeiro`, embarque → `?tab=embarque`, aprovação → `?tab=aprovacoes` (com `&highlight=<contractId>` quando há contrato). A **ação** (pagar/confirmar/gerar) mora na casa de cada um, não no dashboard.
- **Refetch dos 3 feeds:** em foco/visibilidade (sem throttle) e quando a janela do card muda.

---

## 8. Rotas de API (`app/api/v1/dashboard/*`)

Todas são `GET`, delegam ao backend via `executeBackend('<methodName>', …)` e estão **fora** do `PROSPECTOR_ALLOWED_API_METHODS` → o PROSPECTOR recebe **403** (allowlist central em `src/auth/prospector-access.js`, enforcement em `resolveActorContext`).

| Rota | methodName | Gate | Parâmetros | Cache | Resposta |
|---|---|---|---|---|---|
| `/dashboard/pending` | `getDashboardPending` | Auth | — | — | `{ classificationPending: {counts,total,items}, clientsIncomplete: {total} }` |
| `/dashboard/sales-availability` | `getDashboardSalesAvailability` | Auth | — | — | `{ bands: {over30, from15to30, under15} }` |
| `/dashboard/recent-sends` | `getDashboardRecentSends` | Auth | — | `private, max-age=30` | `{ items: [...] }` (top-40) |
| `/dashboard/payment-events` | `getDashboardPaymentEvents` | ADMIN+COMMERCIAL (service) | `?from&to` (YYYY-MM-DD) | `private, max-age=30` | `{ events: Record<dayKey, evento[]> }` |
| `/dashboard/approval-events` | `getDashboardApprovalEvents` | Auth (não-PROSPECTOR) | `?from&to` | `private, max-age=30` | `{ events: Record<dayKey, evento[]> }` |
| `/dashboard/shipment-events` | `getDashboardShipmentEvents` | Auth (não-PROSPECTOR) | `?from&to` | `private, max-age=30` | `{ events: Record<dayKey, evento[]> }` |

Definições dos handlers: `src/api/v1/backend-api.js`. Implementações: `src/samples/sample-query-service.js` (pending, sales, recent-sends) e `src/sale-contracts/sale-contract-service.js` (payment, approval, shipment, recent-approval-sends).

**Regras dos feeds de eventos (backend):**
- **Pagamento:** agendado = `EMITIDO`/`FATURADO` com `paymentDate` na janela; realizado = `PAGO` com `paidAt` na janela; `WASH_OUT` fora. COMMERCIAL escopado ao próprio `Broker` (sem broker → vazio). Vencidos reclassificados por "hoje BRT" (dot vermelho).
- **Aprovação:** pendente = `requiresApproval` + `EMITIDO` + `invoiceDate` não-nulo + **sem** linha em `approval_label_log`. Lembrete pintado todo dia de `max(from, hoje)` até `to`.
- **Embarque:** agendado = `requiresShipment` + `EMITIDO`/`FATURADO` + não embarcado, no `invoiceDate` (vermelho se o dia passar); realizado = embarcado (`shippedAt` na janela).

---

## 9. Regras de negócio e detalhes técnicos

- **Datas em BRT:** todos os cálculos de dia usam offset São Paulo −3h (donut, feeds de eventos, calendário). O calendário é **domingo-first** por decisão (não unificar com a matemática segunda-based do relatório semanal).
- **Throttle de refetch:** `useDashboardData` e o `recent-sends` refazem em `visibilitychange`/`focus` com throttle de **30s** (evita N requests em Alt+Tab). Os 3 feeds de eventos refazem em foco/visibilidade **sem** throttle (mas só quando há janela e no breakpoint desktop).
- **Twin inativo não busca:** cada `useEffect` checa `matchMedia('(min-width: 901px)')` antes de disparar fetch; um listener de `change` re-busca ao **entrar** no desktop (senão o card ficava travado no skeleton após um resize).
- **Saudação por hora:** `getGreeting()` — "Bom dia" (<12h), "Boa tarde" (<18h), "Boa noite".
- **Cards removidos (histórico):** "Últimas atividades", "Vendas e perdas" (endpoint `commercial-timeseries`), StatCards de pulso ("Lotes registrados hoje"/"Envios concluídos hoje") e "Impressão pendente" foram todos removidos. Não devem reaparecer sem decisão explícita.

---

## 10. Mapa de arquivos

**Frontend**
- `app/dashboard/page.tsx` — orquestração (branch por papel, twins)
- `components/dashboard/DashboardDesktop.tsx` — layout desktop + fetch dos 3 feeds de eventos e recent-sends
- `components/dashboard/DashboardMobile.tsx` — layout mobile (hero + operações + donut)
- `components/dashboard/useDashboardData.ts` — fetch de pending + sales-availability
- `components/dashboard/EventsCalendarCard.tsx` — card de Eventos (calendário)
- `components/dashboard/RecentSendsCard.tsx` — card Últimos envios
- `components/dashboard/StatCard.tsx` — card de contagem (desktop)
- `components/dashboard/OperationModal.tsx` + `useOperationModal.ts` — modal de lotes pendentes
- `components/dashboard/greeting.ts` — saudação + iniciais
- `components/dashboard/prospector/ProspectorDashboard.tsx` + `useProspectorDashboardData.ts` — dashboard do PROSPECTOR
- `components/SalesAvailabilityCard.tsx` — donut (compartilhado)
- `lib/dashboard-calendar.ts` — matemática BRT do calendário
- `lib/roles.ts` — `isProspector`, `canManageClients`, `FINANCEIRO_ROLES`, labels
- `lib/api-client.ts` — funções `getDashboard*`
- CSS: `app/globals.css` (classes `dashboard-*`, `dd-*`, `sales-card`, `prospector-*`)

**Backend**
- `app/api/v1/dashboard/{pending,sales-availability,recent-sends,payment-events,approval-events,shipment-events}/route.ts`
- `src/api/v1/backend-api.js` — handlers + gate central
- `src/samples/sample-query-service.js` — pending, sales-availability, recent-sends
- `src/sale-contracts/sale-contract-service.js` — payment/approval/shipment events + recent-approval-sends
- `src/auth/prospector-access.js` — allowlist (barra o PROSPECTOR nos endpoints do dashboard padrão)

**Testes**
- `tests/dashboard-pending.integration.test.js`

---

## 11. Estado de validação

O redesenho desktop (2 StatCards + donut + Últimos envios + card de Eventos) e os feeds de eventos (pagamento/aprovação/embarque) foram implementados mas **ainda aguardam validação no device** (ver `Dashboard-Plano-de-Trabalho.md` → backlog herdado). Este documento descreve o comportamento **do código**; divergências observadas no device viram achados no plano de trabalho.
