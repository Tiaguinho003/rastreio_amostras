# Dashboard — Visão Geral

Status: Ativo (documento-mãe / verdade viva do funcionamento atual)
Escopo: o que a página `/dashboard` faz hoje — fluxo, layout desktop e mobile, disponibilidade por papel, cards, rotas de API, projeções de banco e regras de negócio
Última revisão: 2026-07-12 (reconstruída a partir do código real)
Documentos relacionados: `Dashboard-Plano-de-Trabalho.md` (backlog e próximas mudanças), `API-e-Contratos.md`, `Auditoria-Navegacao-por-Papel.md`, `Produto-e-Fluxos.md`

> **Como este documento se mantém vivo:** a cada implementação concluída e validada no ciclo de revisão do dashboard, esta Visão Geral é atualizada no mesmo passo. As decisões e o backlog vivem no `Dashboard-Plano-de-Trabalho.md`; aqui fica **só o estado atual**.

---

## 1. Propósito e quem usa

O dashboard é a **home pós-login** de todos os papéis. Ele tem duas naturezas distintas:

- **Dashboard padrão** — para os 5 papéis não-PROSPECTOR (ADMIN, COMMERCIAL, CLASSIFIER, REGISTRATION, CADASTRO). É um painel operacional: disponibilidade de lotes para venda, últimos envios e um calendário de eventos.
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

| Papel        | Rótulo na UI  |
| ------------ | ------------- |
| ADMIN        | Administração |
| COMMERCIAL   | Comercial     |
| CLASSIFIER   | Classificação |
| REGISTRATION | Impressão     |
| CADASTRO     | Cadastro      |
| PROSPECTOR   | Prospecção    |

**O que cada papel vê no dashboard:**

| Elemento                                 | ADMIN |   COMMERCIAL    | CLASSIFIER | REGISTRATION | CADASTRO | PROSPECTOR |
| ---------------------------------------- | :---: | :-------------: | :--------: | :----------: | :------: | :--------: |
| Dashboard padrão (mobile+desktop)        |  ✅   |       ✅        |     ✅     |      ✅      |    ✅    |     —      |
| Donut **Lotes disponíveis**              |  ✅   |       ✅        |     ✅     |      ✅      |    ✅    |     —      |
| Card **Amostras enviadas** (desktop)     |  ✅   |       ✅        |     ✅     |      ✅      |    ✅    |     —      |
| Card **Aprovações enviadas** (desktop)   |  ✅   |       ✅        |     ✅     |      ✅      |    ✅    |     —      |
| Card **Eventos** — feed de **pagamento** |  ✅   | ✅ (só os dele) |     —      |      —       |    —     |     —      |
| Card **Eventos** — feed de **aprovação** |  ✅   |       ✅        |     ✅     |      ✅      |    ✅    |     —      |
| Card **Eventos** — feed de **embarque**  |  ✅   |       ✅        |     ✅     |      ✅      |    ✅    |     —      |
| Dashboard do PROSPECTOR                  |   —   |        —        |     —      |      —       |    —     |     ✅     |

Regras que geram a matriz:

- **Feed de pagamento do card de Eventos** → `FINANCEIRO_ROLES` = **ADMIN + COMMERCIAL**; o COMMERCIAL é escopado aos contratos em que é corretor (`Broker.userId`). Os demais nem chamam o endpoint.
- **Feeds de aprovação e embarque** → **sem gate de papel**: todos os não-PROSPECTOR veem tudo (auth-only; o único bloqueio é o allowlist central que barra o PROSPECTOR).

> ℹ️ **"Classificação pendente" saiu do dashboard** (2026-07-12, DSB-D2): virou um card só-visualização na página de **Lotes** (`/samples`), visível a todos os papéis que abrem `/samples`. O card **"Cadastros pendentes" foi removido** por completo. Detalhes no `Dashboard-Plano-de-Trabalho.md`.

> ⚠️ **Alívio de UI, não segurança.** O escopo do COMMERCIAL é reforçado no backend para o feed financeiro (§8). Mas o endpoint `sales-availability` exige **só autenticação** — qualquer papel autenticado obtém os mesmos números. A segregação de papel real, no estado atual, é o allowlist do PROSPECTOR.

---

## 4. Layout desktop (`components/dashboard/DashboardDesktop.tsx`)

Grid de duas **linhas** (`.dd-content-grid`) desde 2026-07-12 (DSB-D3; top row com 3 cards desde DSB-D5):

```
┌─ .dd-top-row (3 colunas) ─────────────────────────────────────────┐
│  ┌─────────────────┐ ┌──────────────────┐ ┌───────────────────┐   │
│  │ Donut "Lotes    │ │ "Amostras         │ │ "Aprovações        │  │
│  │  disponíveis"   │ │  enviadas" (scroll)│ │  enviadas" (scroll)│  │
│  │  (mais estreito)│ │  física + laudo    │ │  só aprovações     │  │
│  └─────────────────┘ └──────────────────┘ └───────────────────┘   │
├───────────────────────────────────────────────────────────────────┤
│           EVENTOS (horizontal, largura total, mais alto)           │
│           semana atual (7 dias) com eventos dentro das células     │
└───────────────────────────────────────────────────────────────────┘
```

- **Top row (`.dd-top-row`, 3 colunas):** "Lotes disponíveis" (donut, mais estreito), "Amostras enviadas" e "Aprovações enviadas" **lado a lado** (as listas de envio rolam por dentro — o shell do dashboard não rola). Proporção ~`0.8fr / 1.1fr / 1.1fr` (donut estreito, feeds mais largos).
- **Embaixo:** o card **Eventos** ocupa a **largura toda** (horizontal), com altura maior que a top row.
- Banner de erro (`.dashboard-error-banner`, `role="status"`) no topo quando o fetch do donut falha.
- Histórico: a linha de StatCards de pendências (`.dd-summary-row`) saiu em DSB-D2 (2026-07-12); o arranjo em duas colunas (donut empilhado sobre envios + Eventos vertical à direita) virou top row + Eventos horizontal em DSB-D3; em DSB-D5 o card único "Últimos envios" foi dividido em "Amostras enviadas" + "Aprovações enviadas" (top row passou a ter 3 cards).

---

## 5. Layout mobile (`components/dashboard/DashboardMobile.tsx`)

Página que rola inteira (`.dashboard-scroll`), sem nada fixo:

```
.dashboard-hero  → saudação (hora do dia) + nome + papel + avatar (iniciais) + HeaderAvatarMenu
.dashboard-sheet
  (banner de erro, se houver)
  is-slot-sales  → Donut "Lotes disponíveis" (SalesAvailabilityCard, tamanho cheio)
```

- **Diferenças vs. desktop:** o mobile **não** tem os cards de envio ("Amostras enviadas"/"Aprovações enviadas") nem "Eventos" (todos **desktop-only**). Tem o hero com **saudação**, que o desktop **não** tem — desde **DSB-D6 (2026-07-12)** a saudação também saiu da faixa branca do desktop (que virou a top bar de navegação; ver `Auditoria-Navegacao-por-Papel.md`).
- Desde 2026-07-12 (DSB-D2) o mobile **não tem mais** os op-cards de pendências (`is-slot-operations`): sobrou hero + donut.

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

> **Nota (2026-07-12, DSB-D2):** os cards "Classificação pendente" e "Cadastros pendentes" **saíram do dashboard**. "Classificação pendente" virou um card **só-visualização** na página de Lotes (`components/samples/ClassificationPendingCard.tsx`, alimentado por `getDashboardPending` → `classificationPending.total`; inerte, sem modal). "Cadastros pendentes" foi **removido**. O `OperationModal` (fila de classificação, seta → `/camera`) também saiu — será reconstruído na revisão da página de Lotes.

### 7.1 Lotes disponíveis (donut — `components/SalesAvailabilityCard.tsx`)

- **Mostra:** um donut com 3 faixas de idade dos lotes disponíveis para venda: **> 30 dias**, **15–30 dias**, **< 15 dias**.
- **Dado:** `salesData.bands` de `getDashboardSalesAvailability`.
- **Backend:** `$queryRaw` em `sample` contando por `created_at` com fronteiras BRT (offset −3h), `WHERE status <> 'INVALIDATED' AND commercial_status IN ('OPEN', 'PARTIALLY_SOLD')`.
- **Regra-chave:** conta por **`created_at`** (data de registro/chegada do lote) e **inclui não classificados** (qualquer amostra com status comercial OPEN/PARTIALLY_SOLD que não foi invalidada).
- Renderizado `compact` no desktop, tamanho cheio no mobile.

### 7.2 Amostras enviadas + Aprovações enviadas (`RecentSendsCard`) — desktop-only

Desde **DSB-D5** (2026-07-12) são **dois cards** que reusam o mesmo componente (`RecentSendsCard`, parametrizado por `title`/`emptyLabel`). Cada um recebe seu **próprio feed independente** (top-40 cada, sem corte global). Minicards **inertes** (`.spv2-card`) com scroll interno; envios cancelados aparecem esmaecidos com a tag "Cancelado".

- **"Amostras enviadas":** dois tipos (`kind`) — `PHYSICAL_SAMPLE` (Amostra física) e `REPORT` (Laudo), **com selo de tipo** para distinguir. Mostra lote + destinatário atual (pós-edição).
- **"Aprovações enviadas":** só `APPROVAL`. Mostra nº do contrato + comprador; **sem selo** (redundante — o card já é só de aprovações).
- **Dado:** estado local `recentSends` (`{ sampleItems, approvalItems }`), buscado no próprio `DashboardDesktop` via `getDashboardRecentSends` (refetch em foco/visibilidade com throttle 30s + ao entrar no breakpoint desktop). Uma única chamada alimenta os dois cards.
- **Backend:** o handler devolve as **duas sub-listas separadas** — `sample-query-service.getDashboardRecentSends()` (eventos `PHYSICAL_SAMPLE_SENT` + `REPORT_EXPORTED`, top-40, com detecção de cancelamento e destinatário pós-edição) → `sampleItems`; `sale-contract-service.getRecentApprovalSends()` (etiquetas de aprovação com contrato, top-40) → `approvalItems`. Sem merge/corte global (que podia zerar as aprovações). `approvalItems` degrada para `[]` se o contract service não estiver configurado.

### 7.3 Eventos (`EventsCalendarCard`) — desktop-only

- **Layout (DSB-D4 + DSB-D7):** card **horizontal**; calendário de **1 semana de DIAS ÚTEIS (seg–sex, 5 células)**, navegação ◀ ▶ de 7 em 7 dias + botão "Hoje". Cada dia é um **quadrado alto** que mostra os **eventos dentro da própria célula** (chips coloridos por tipo, rótulo truncado); dias com muitos eventos **rolam por dentro** da célula. **Não há painel** de dia selecionado. "Hoje" destacado com anel. Datas em BRT (helpers em `lib/dashboard-calendar.ts`).
- **Sem fins de semana (DSB-D7):** sábado e domingo **não aparecem** (o negócio não agenda faturamento/embarque/pagamento neles — ver §8 e a regra de contrato em `API-e-Contratos.md`). A **janela buscada** continua **dom–sáb (7 dias)** de propósito: o backend **rola** os eventos de fim de semana (legado no banco, ou datas reais de borda) pro **dia útil vizinho** (sáb→sex, dom→seg) via `rollWeekendToWeekday`, então nada some do calendário. `buildBusinessDays(weekStart)` filtra os 5 dias renderizados.
- **3 feeds mesclados client-side** no `DashboardDesktop` (a janela visível é emitida pelo card via `onWindowChange` → o pai busca a **semana**):

  | Feed      | typeKey                                                                       | Visibilidade                  | Fonte                        |
  | --------- | ----------------------------------------------------------------------------- | ----------------------------- | ---------------------------- |
  | Pagamento | `contract_payment_due` / `contract_payment_overdue` / `contract_payment_paid` | ADMIN + COMMERCIAL (escopado) | `getDashboardPaymentEvents`  |
  | Aprovação | `contract_approval_due`                                                       | Todos os não-PROSPECTOR       | `getDashboardApprovalEvents` |
  | Embarque  | `contract_shipment` / `contract_shipment_done` / `contract_shipment_overdue`  | Todos os não-PROSPECTOR       | `getDashboardShipmentEvents` |

- **Navegação pura (sem ação no card):** cada **chip** de evento (dentro da célula do dia) é um link para a sub-aba dona em `/contratos` — pagamento → `?tab=financeiro`, embarque → `?tab=embarque`, aprovação → `?tab=aprovacoes` (com `&highlight=<contractId>` quando há contrato). A **ação** (pagar/confirmar/gerar) mora na casa de cada um, não no dashboard.
- **Refetch dos 3 feeds:** em foco/visibilidade (sem throttle) e quando a janela do card muda.

---

## 8. Rotas de API (`app/api/v1/dashboard/*`)

Todas são `GET`, delegam ao backend via `executeBackend('<methodName>', …)` e estão **fora** do `PROSPECTOR_ALLOWED_API_METHODS` → o PROSPECTOR recebe **403** (allowlist central em `src/auth/prospector-access.js`, enforcement em `resolveActorContext`).

| Rota                            | methodName                      | Gate                       | Parâmetros              | Cache                 | Resposta                                                                      |
| ------------------------------- | ------------------------------- | -------------------------- | ----------------------- | --------------------- | ----------------------------------------------------------------------------- |
| `/dashboard/pending`            | `getDashboardPending`           | Auth                       | —                       | —                     | `{ classificationPending: {counts,total,items}, clientsIncomplete: {total} }` |
| `/dashboard/sales-availability` | `getDashboardSalesAvailability` | Auth                       | —                       | —                     | `{ bands: {over30, from15to30, under15} }`                                    |
| `/dashboard/recent-sends`       | `getDashboardRecentSends`       | Auth                       | —                       | `private, max-age=30` | `{ sampleItems: [...], approvalItems: [...] }` (top-40 cada — DSB-D5)         |
| `/dashboard/payment-events`     | `getDashboardPaymentEvents`     | ADMIN+COMMERCIAL (service) | `?from&to` (YYYY-MM-DD) | `private, max-age=30` | `{ events: Record<dayKey, evento[]> }`                                        |
| `/dashboard/approval-events`    | `getDashboardApprovalEvents`    | Auth (não-PROSPECTOR)      | `?from&to`              | `private, max-age=30` | `{ events: Record<dayKey, evento[]> }`                                        |
| `/dashboard/shipment-events`    | `getDashboardShipmentEvents`    | Auth (não-PROSPECTOR)      | `?from&to`              | `private, max-age=30` | `{ events: Record<dayKey, evento[]> }`                                        |

Definições dos handlers: `src/api/v1/backend-api.js`. Implementações: `src/samples/sample-query-service.js` (pending, sales, recent-sends) e `src/sale-contracts/sale-contract-service.js` (payment, approval, shipment, recent-approval-sends).

> **`/dashboard/pending` não é mais consumido pelo dashboard** (2026-07-12, DSB-D2). `classificationPending.total` agora alimenta o card só-visualização de `/samples` (`ClassificationPendingCard`); `clientsIncomplete` ficou **sem consumidor de UI** (limpeza adiada — ver `Dashboard-Plano-de-Trabalho.md`, DSB-H4). O endpoint segue **intacto** por decisão. O nome "dashboard" é dívida consciente até a revisão de Lotes/Clientes.

**Regras dos feeds de eventos (backend):**

- **Pagamento:** agendado = `EMITIDO`/`FATURADO` com `paymentDate` na janela; realizado = `PAGO` com `paidAt` na janela; `WASH_OUT` fora. COMMERCIAL escopado ao próprio `Broker` (sem broker → vazio). Vencidos reclassificados por "hoje BRT" (dot vermelho).
- **Aprovação:** pendente = `requiresApproval` + `EMITIDO` + `invoiceDate` não-nulo + **sem** linha em `approval_label_log`. Lembrete pintado todo dia de `max(from, hoje)` até `to`.
- **Embarque:** agendado = `requiresShipment` + `EMITIDO`/`FATURADO` + não embarcado, no `invoiceDate` (vermelho se o dia passar); realizado = embarcado (`shippedAt` na janela).
- **Roll de fim de semana (DSB-D7):** pagamento e embarque **rolam** o evento pro dia útil vizinho na montagem (`bucketPaymentEvents`/`bucketShipmentEvents`, sáb→sex/dom→seg) — o `typeKey` de atraso é computado sobre a data REAL, antes do roll. Aprovação **não** rola (o fan-out já cobre os dias úteis). Datas novas já não caem em fim de semana (validação do contrato); o roll cobre legado/borda.

---

## 9. Regras de negócio e detalhes técnicos

- **Datas em BRT:** todos os cálculos de dia usam offset São Paulo −3h (donut, feeds de eventos, calendário). A **janela** do calendário segue ancorada no **domingo** (`computeWeekStart`/`buildWeek`, 7 dias), mas o card **renderiza só os dias úteis** (seg–sex, `buildBusinessDays`) — DSB-D7. O dia da semana de uma data de contrato (`@db.Date`) é lido em **UTC** (`getUTCDay`), sem deslocar −3h.
- **Throttle de refetch:** `useDashboardData` (agora só o donut) e o `recent-sends` refazem em `visibilitychange`/`focus` com throttle de **30s** (evita N requests em Alt+Tab). Os 3 feeds de eventos refazem em foco/visibilidade **sem** throttle (mas só quando há janela e no breakpoint desktop). O card de `/samples` faz um fetch simples na montagem.
- **Twin inativo não busca:** cada `useEffect` checa `matchMedia('(min-width: 901px)')` antes de disparar fetch; um listener de `change` re-busca ao **entrar** no desktop (senão o card ficava travado no skeleton após um resize).
- **Saudação por hora:** `getGreeting()` — "Bom dia" (<12h), "Boa tarde" (<18h), "Boa noite".
- **Cards removidos (histórico):** "Últimas atividades", "Vendas e perdas" (endpoint `commercial-timeseries`), StatCards de pulso ("Lotes registrados hoje"/"Envios concluídos hoje") e "Impressão pendente" foram todos removidos. Em **2026-07-12 (DSB-D2)** saíram os StatCards de pendências: **"Classificação pendente"** (migrou para `/samples`) e **"Cadastros pendentes"** (removido), junto com o `OperationModal`. Nenhum deve reaparecer sem decisão explícita.

---

## 10. Mapa de arquivos

**Frontend**

- `app/dashboard/page.tsx` — orquestração (branch por papel, twins)
- `components/dashboard/DashboardDesktop.tsx` — layout desktop + fetch dos 3 feeds de eventos e recent-sends
- `components/dashboard/DashboardMobile.tsx` — layout mobile (hero + donut)
- `components/dashboard/useDashboardData.ts` — fetch do donut (`sales-availability`)
- `components/dashboard/EventsCalendarCard.tsx` — card de Eventos (calendário)
- `components/dashboard/RecentSendsCard.tsx` — card de envios reutilizável (renderiza "Amostras enviadas" e "Aprovações enviadas" — DSB-D5)
- `components/dashboard/greeting.ts` — saudação + iniciais
- `components/dashboard/prospector/ProspectorDashboard.tsx` + `useProspectorDashboardData.ts` — dashboard do PROSPECTOR
- `components/SalesAvailabilityCard.tsx` — donut (compartilhado)
- `components/samples/ClassificationPendingCard.tsx` — card só-visualização de "Classificação pendente" (mora na página de Lotes desde DSB-D2; alimentado por `getDashboardPending`)
- `lib/dashboard-calendar.ts` — matemática BRT do calendário
- `lib/roles.ts` — `isProspector`, `FINANCEIRO_ROLES`, labels
- `lib/api-client.ts` — funções `getDashboard*`
- CSS: `app/globals.css` (classes `dashboard-*`, `dd-*`, `sales-card`, `prospector-*`, `spv2-pending-stat`)

> Removidos em DSB-D2 (2026-07-12): `components/dashboard/StatCard.tsx`, `OperationModal.tsx`, `useOperationModal.ts`.

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

O dashboard atual (donut + "Amostras enviadas" + "Aprovações enviadas" + card de Eventos; feeds de pagamento/aprovação/embarque), a remoção dos cards de pendências (DSB-D2), o rearranjo do layout + Eventos semanal (DSB-D3/D4) e a divisão do card de envios (DSB-D5) foram implementados mas **aguardam validação no device** (ver `Dashboard-Plano-de-Trabalho.md`). Este documento descreve o comportamento **do código**; divergências observadas no device viram achados no plano de trabalho.
