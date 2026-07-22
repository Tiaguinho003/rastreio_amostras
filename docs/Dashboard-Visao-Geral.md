# Dashboard — Visão Geral

Status: Ativo (documento-mãe / verdade viva do funcionamento atual)
Escopo: o que a página `/dashboard` faz hoje — fluxo, layout desktop e mobile, disponibilidade por papel, cards, rotas de API, projeções de banco e regras de negócio
Última revisão: 2026-07-14 (DSB-D14 — dashboard só com o calendário)
Documentos relacionados: `Dashboard-Plano-de-Trabalho.md` (backlog e próximas mudanças), `API-e-Contratos.md`, `Auditoria-Navegacao-por-Papel.md`, `Produto-e-Fluxos.md`

> **Como este documento se mantém vivo:** a cada implementação concluída e validada no ciclo de revisão do dashboard, esta Visão Geral é atualizada no mesmo passo. As decisões e o backlog vivem no `Dashboard-Plano-de-Trabalho.md`; aqui fica **só o estado atual**.

---

## 1. Propósito e quem usa

O dashboard é a **home pós-login** de todos os papéis. Ele tem duas naturezas distintas:

- **Dashboard padrão** — para os 5 papéis não-PROSPECTOR (ADMIN, COMMERCIAL, CLASSIFIER, REGISTRATION, CADASTRO). Desde **DSB-D14 (2026-07-14)** apresenta o **calendário de Eventos** (desktop): pagamento, embarque e faturamento de contratos; e desde **DSB-D19 (2026-07-15)** o **card de Avisos** à direita (aprovação a enviar — §7.4). Os demais cards saíram: o donut "Lotes disponíveis" foi **apagado do sistema**; "Amostras enviadas" migrou pra página de **Lotes** (`/samples`) — e de lá **saiu do produto** no redesenho FV, ver §7.2 — e "Aprovações enviadas" pra aba **Aprovações** (`/embarques?tab=aprovacoes`), onde segue viva.
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

- **Twins mobile + desktop montados juntos.** `DashboardMobile` e `DashboardDesktop` são renderizados sempre; a troca é **só por CSS** no breakpoint `min-width: 901px` (classes `.dashboard-mobile` / `.dashboard-desktop`). Os fetches do desktop verificam `window.matchMedia('(min-width: 901px)')` para que o twin inativo não dispare requests. _(O hook `useDashboardData`, que buscava o donut no nível da página, foi **deletado** no DSB-D14 — a página não busca mais nada; só o `DashboardDesktop` busca, e só os feeds de eventos.)_
- **PROSPECTOR tem branch separado** — não chega a chamar os endpoints do dashboard padrão (que responderiam **403**, ver §8).
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

| Elemento                                   | ADMIN | COMMERCIAL | CLASSIFIER | REGISTRATION | CADASTRO | PROSPECTOR |
| ------------------------------------------ | :---: | :--------: | :--------: | :----------: | :------: | :--------: |
| Dashboard padrão (mobile+desktop)          |  ✅   |     ✅     |     ✅     |      ✅      |    ✅    |     —      |
| Card **Eventos** — feed de **pagamento**   |  ✅   |     ✅     |     ✅     |      ✅      |    ✅    |     —      |
| Card **Eventos** — feed de **embarque**    |  ✅   |     ✅     |     ✅     |      ✅      |    ✅    |     —      |
| Card **Eventos** — feed de **faturamento** |  ✅   |     ✅     |    ✅¹     |     ✅¹      |   ✅¹    |     —      |
| Card **Avisos** (aprovação a enviar, D19)  |  ✅   |     ✅     |     ✅     |      ✅      |    ✅    |     —      |
| Dashboard do PROSPECTOR                    |   —   |     —      |     —      |      —       |    —     |     ✅     |

¹ Operacionais (Classificação/Impressão/Cadastro) **veem** o chip de faturamento, mas ele é **inerte** (não abrem a aba Contratos — DSB-D11).

Regras que geram a matriz:

- **Feed de pagamento do card de Eventos** → `FINANCEIRO_ROLES` = **`NON_PROSPECTOR_ROLES`** (todo papel menos PROSPECTOR; **ACESSO UNIFICADO 2026-07-15** — era ADMIN + COMMERCIAL). Todos veem os pagamentos de **TODOS** os contratos (escopo aberto — own-only revogado, D140; sem recorte por `Broker.userId`). Só o PROSPECTOR não chama o endpoint.
- **Feed de embarque** → **sem gate de papel**: todos os não-PROSPECTOR veem tudo (auth-only; o único bloqueio é o allowlist central que barra o PROSPECTOR). _(O feed de **aprovação** — lembrete "a enviar" — foi **REMOVIDO** em 2026-07-12, DSB-D9; a data era imprecisa.)_
- **Feed de faturamento (DSB-D11)** → **sem gate de papel** (auth-only, como o embarque): todos os não-PROSPECTOR **veem** o evento. Mas o chip só **navega** (→ aba Contratos) para quem abre essa aba (ADMIN/COMMERCIAL); para os operacionais é **rótulo inerte**. Ver §7.3.

> ℹ️ **Cards que saíram do dashboard:** "Classificação pendente" migrou pra `/samples` como card só-visualização (2026-07-12, DSB-D2; "Cadastros pendentes" foi removido). Em **DSB-D14 (2026-07-14)** saíram os três da top row: o donut **"Lotes disponíveis" foi APAGADO do sistema** (rota, backend, componente e teste); **"Amostras enviadas"** migrou pro topo do sheet de `/samples` e **"Aprovações enviadas"** pro topo da aba Aprovações de `/embarques` (os dois **desktop-only**, mesmo `RecentSendsCard`). Detalhes no `Dashboard-Plano-de-Trabalho.md`.

> ⚠️ **Alívio de UI, não segurança.** O feed financeiro não tem mais recorte por corretor — **todo não-PROSPECTOR** vê os pagamentos de todos os contratos (escopo aberto — D140; `FINANCEIRO_ROLES = NON_PROSPECTOR_ROLES` desde o acesso unificado 2026-07-15); o gate é só de papel (§8). A segregação de papel real, no estado atual, é o allowlist do PROSPECTOR.

---

## 4. Layout desktop (`components/dashboard/DashboardDesktop.tsx`)

Desde **DSB-D14 (2026-07-14)** o dashboard desktop apresenta **apenas o card de Eventos**; desde **DSB-D16 (2026-07-14)** nem o cabeçalho da página existe mais — o card ocupa a página inteira, sobre o **canvas verde-clarinho** (`#f4f6f5`) e abaixo da **top bar global** do shell (ver `Auditoria-Navegacao-por-Papel.md`):

```
┌─ .app-topbar (shell, cross-página) ────────────────────────────────┐
│  logo quadrado …………………………………………………… 🔔 ❓ (inertes)                 │
├─ .dd-content-grid (2 colunas, canvas #f4f6f5) ────────────────────┤
│  EVENTOS (calendário, 1fr)             │  AVISOS (~300px, DSB-D19) │
│  mês inteiro (grade 7×N)               │  aprovação a enviar       │
│  eventos dentro das células            │  (card-lista clicável)    │
└───────────────────────────────────────────────────────────────────┘
```

- O shell-lock de 100vh continua (a página não rola em viewport confortável; abaixo do piso de 420px — DSB-D18 — a página rola e os dias cheios rolam por dentro). A top bar global (56px) entra na conta automaticamente (grid `auto 1fr` do shell).
- **DSB-D16:** o cabeçalho `.dd-page-header` ("Visão geral" + saudação/nome + papel + data por extenso) foi **removido** (JSX + CSS `.dd-page-*`; `getTodayLong` saiu do `greeting.ts`).
- Histórico: a linha de StatCards de pendências (`.dd-summary-row`) saiu em DSB-D2 (2026-07-12); o arranjo virou top row (donut + 2 cards de envio) + Eventos horizontal em DSB-D3/D5; em **DSB-D14** a top row inteira saiu — donut **apagado do sistema**, cards de envio migrados pra `/samples` e `/embarques` (`.dd-top-row` e o CSS exclusivo do donut removidos).

---

## 5. Layout mobile (`components/dashboard/DashboardMobile.tsx`)

Página que rola inteira (`.dashboard-scroll`), sem nada fixo:

```
.dashboard-hero  → saudação (hora do dia) + nome + papel + avatar (iniciais) + HeaderAvatarMenu
```

- Desde **DSB-D14 (2026-07-14)** o mobile é **só o hero** — o donut foi apagado do sistema e o sheet saiu junto (estado transitório aceito pelo Flavio: o calendário de Eventos ainda é desktop-only e chega ao mobile no ciclo do dashboard mobile, **DSB-H6**).
- O hero tem a **saudação**, que o desktop **não** tem mais em lugar nenhum — saiu da faixa branca em **DSB-D6**, e o cabeçalho da página (`.dd-page-header`, que tinha saudação própria) saiu em **DSB-D16 (2026-07-14)**. _(Desde **DSB-D15** a navegação desktop é a **sidenav lateral esquerda** + top bar global do DSB-D16; ver `Auditoria-Navegacao-por-Papel.md`.)_
- Histórico: os op-cards de pendências saíram em DSB-D2 (2026-07-12); o donut ("hero + donut") ficou até DSB-D14.

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

> **Nota (2026-07-12, DSB-D2; superada em 2026-07-21 — ver §7.2):** os cards "Classificação pendente" e "Cadastros pendentes" **saíram do dashboard**. "Classificação pendente" virou um card **só-visualização** na página de Lotes (`components/samples/ClassificationPendingCard.tsx`, alimentado por `getDashboardPending` → `classificationPending.total`; inerte, sem modal). "Cadastros pendentes" foi **removido**. O `OperationModal` (fila de classificação, seta → `/camera`) também saiu — será reconstruído na revisão da página de Lotes.

### 7.1 Lotes disponíveis (donut) — **APAGADO DO SISTEMA (DSB-D14, 2026-07-14)**

O donut de aging dos lotes disponíveis (> 30 / 15–30 / < 15 dias, contado por `created_at`, incluindo não classificados) foi **removido ponta a ponta** por decisão do Flavio (analisou e não é relevante): componente `SalesAvailabilityCard.tsx`, hook `useDashboardData.ts`, rota `/dashboard/sales-availability`, handler + método de service, fn no api-client, tipo, CSS exclusivo e o teste de integração. ⚠️ O CSS base `.sales-card*`/`.sales-chart-*` **permanece** — é reusado pelo "Resumo comercial" do detalhe do cliente (`ClientCommercialSummaryCard`).

### 7.2 Amostras enviadas + Aprovações enviadas (`RecentSendsCard`) — **MIGRARAM DE PÁGINA (DSB-D14)**

> **🔴 Atualização de 2026-07-21 — "Amostras enviadas" foi REMOVIDO do produto.** A F1 do redesenho FV de `/samples` (RD15, decisão 6 do §2.7 do `Redesign-Plano-de-Trabalho.md`) tirou o card do JSX por decisão explícita do Flavio, mesmo sendo o único lugar do app que exibia o feed. Ficaram **órfãos**: a rota `GET /samples/recent-sends`, o helper `getSampleRecentSends`, o hook `lib/use-recent-sends-feed.ts` no que servia a `/samples` e o CSS `.spv2-top-cards`. O **"Classificação pendente"** saiu junto — a contagem virou o **4º KPI clicável** da lista, servido por `GET /samples/stats`, e o `ClassificationPendingCard` mais o CSS `.spv2-pending-stat` ficaram órfãos.
>
> **"Aprovações enviadas" não foi afetado** e continua no topo da aba Aprovações de `/embarques`, com o mesmo `RecentSendsCard` — que por isso **não** é código morto.
>
> O texto abaixo descreve o estado imediatamente após DSB-D14 e vale como registro daquele momento.

Os dois cards continuam existindo, **fora do dashboard** (desktop-only, mesmo componente `components/RecentSendsCard.tsx`, parametrizado por `title`/`emptyLabel`/`variant`; classes CSS `sends-*`, ex-`dd-send*`):

- **"Amostras enviadas"** (`variant="samples"`) → topo do sheet da página de **Lotes** (`/samples`), lado a lado com "Classificação pendente" (wrapper `.spv2-top-cards`). Colunas **Lote · Destinatário · Tipo · Tempo** (`Tipo`: "Físico"/"Descrição" — a divergência consciente de "Laudo" segue, DSB-D8); Liga leva `BlendBadge`. Dado: `GET /samples/recent-sends` (`getRecentSampleSends`, top-40).
- **"Aprovações enviadas"** (`variant="approvals"`) → topo da aba **Aprovações** (`/embarques?tab=aprovacoes`), acima da worklist (visão rápida; a worklist com filtro "Enviadas" segue sendo a lista completa — redundância parcial aceita). Colunas **Contrato · Comprador · Tempo**. Dado: `GET /sale-contracts/approvals/recent-sends` (`getApprovalRecentSends` → `getRecentApprovalSends` do contract service, top-40; degrada pra `[]` sem contract service). Refetch extra após gerar etiqueta na própria aba.
- **Comportamento comum** (inalterado desde DSB-D8): tabela compacta com cabeçalho sticky, cards inertes, cancelado = linha esmaecida + número riscado, truncamento com `title`, tempo relativo (refresh 60s). Fetch pelo hook novo `lib/use-recent-sends-feed.ts` (gate matchMedia 901px + refetch em foco/visibilidade com throttle 30s + re-busca ao entrar no desktop).

### 7.3 Eventos (`EventsCalendarCard`) — desktop-only, **card principal do dashboard** (à esquerda; DSB-D14/D19)

- **Layout (DSB-D18, 2026-07-14):** calendário **MENSAL** — grade **7×N domingo-first** (N = 4/5/6 semanas, `buildMonthGrid`) com **todos os dias do mês**, navegação ◀ ▶ de **mês em mês** + botão "Hoje"; rótulo do header = "julho de 2026" (`formatMonthLabel`). Cada dia mostra os **eventos dentro da própria célula** (chips coloridos por **estado**, DSB-D10; rótulo truncado); dias com muitos eventos **rolam por dentro** da célula. **Não há painel** de dia selecionado. "Hoje" destacado com anel. Datas em BRT (helpers em `lib/dashboard-calendar.ts`). _(Supera a "1 semana de dias úteis" do DSB-D4/D7.)_
- **Fins de semana e pontas (DSB-D18):** sáb/dom **aparecem levemente esmaecidos** (`is-weekend` — o negócio não agenda ações neles, regra de contrato em `API-e-Contratos.md`; evento ali é legado/borda e mostra no **dia REAL** — o roll `rollWeekendToWeekday` do DSB-D7 foi **removido**). Os dias dos **meses vizinhos** que fecham as semanas (`is-outside`) aparecem esmaecidos **com** os seus eventos. A **janela buscada** cobre a **grade inteira** (28–42 dias).
- **3 feeds mesclados client-side** no `DashboardDesktop` (a janela visível é emitida pelo card via `onWindowChange` → o pai busca a **grade do mês** — DSB-D18):

  | Feed        | typeKey                                                                       | Visibilidade                                                                     | Fonte                        |
  | ----------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------- |
  | Pagamento   | `contract_payment_due` / `contract_payment_overdue` / `contract_payment_paid` | Todos os não-PROSPECTOR (2026-07-15; era ADMIN + COMMERCIAL)                     | `getDashboardPaymentEvents`  |
  | Embarque    | `contract_shipment` / `contract_shipment_done` / `contract_shipment_overdue`  | Todos os não-PROSPECTOR                                                          | `getDashboardShipmentEvents` |
  | Faturamento | `contract_invoice` / `contract_invoice_overdue` / `contract_invoice_done`     | Todos os não-PROSPECTOR (chip inerte p/ quem não abre a aba Contratos — DSB-D11) | `getDashboardInvoiceEvents`  |

  > **DSB-D9 (2026-07-12):** o feed de **aprovação** (lembrete "a enviar", `contract_approval_due`) foi **REMOVIDO** do card de Eventos — a data em que a aprovação deve ser enviada não é exata (o lembrete fazia _fan-out_ do mesmo contrato sobre vários dias), então preferiu-se não exibir informação imprecisa. Removido ponta a ponta (endpoint `/dashboard/approval-events`, `getDashboardApprovalEvents`, `bucketApprovalReminders`/`buildApprovalReminderEvent`, feed no front, chip). A **aba Aprovações** (worklist do "portão") e o card **"Aprovações enviadas"** continuam; os campos `requiresApproval`/`approvalReminderLeadDays` do contrato **permanecem** (a worklist usa `requiresApproval`; o lead-time deixou de alimentar qualquer lembrete).

- **Cores por ESTADO + legenda (DSB-D10):** a **cor** do chip identifica só o **estado** — 🔵 azul `#2563eb` = **previsto**, 🔴 vermelho `#dc2626` = **atrasado**, 🟢 verde `#15803d` = **realizado** (3 cores; a borda-esquerda usa `--chip-color` via **`data-state`**, não mais `data-type`). O **nome do tipo** no rótulo é que diferencia os eventos: `pagamento · nº · comprador`, `embarque · nº · comprador` — o pagamento **ganhou o prefixo** `pagamento ·` (antes era só `nº · comprador`). O estado vai também no `aria-label`/`title` do chip (a11y: não depende só da cor). Uma **legenda** (`.dd-events-legend`) sob o header explica as 3 cores. `state` é derivado do `typeKey` nos builders — tipos novos herdam a cor certa sem regra de CSS nova.
- **Navegação pura (sem ação no card):** cada **chip** de evento (dentro da célula do dia) é um link para a **página dona** (SPLIT 2026-07-13; `contractTabRoute` mapeia aba→rota) — pagamento → `/contratos?tab=financeiro`, **faturamento → `/contratos?tab=contratos`** (DSB-D11), embarque → `/embarques?tab=embarque`, com `&highlight=<contractId>` quando há contrato. A **ação** (pagar/faturar/confirmar) mora na casa de cada um, não no dashboard. A aba dona **pisca/rola** até o contrato (`useContractHighlight` — Financeiro/Embarque/Aprovações e, desde DSB-D11, **Contratos**).
- **Chip inerte por papel (DSB-D11):** se a aba-dona não é visível ao papel (ex.: faturamento → Contratos, oculta aos operacionais), o chip vira **rótulo sem link** — o pai passa `navigableTabs` (= `contractsHubTabs(role)`) e o `eventHref` só linka p/ aba visível. Assim o operacional **vê** o faturamento (auth-only) mas não navega a uma aba que não tem.
- **Refetch dos 3 feeds:** em foco/visibilidade (sem throttle) e quando a janela do card muda.

### 7.4 Avisos (`AvisosCard`) — desktop-only, coluna à direita do calendário (DSB-D19)

- **O que é (AP31/DSB-D19):** card **GERAL de "Avisos"** (extensível por `kind`); 1º (e por ora único) tipo = **"aprovação a enviar"** — re-introduz o lembrete de aprovação que o DSB-D9 removeu, mas como **card binário** (não o feed de calendário que fazia _fan-out_ impreciso do mesmo contrato por N dias). O `approvalReminderLeadDays` **volta a ter consumidor**.
- **Regra:** o aviso existe enquanto o contrato está `requiresApproval + EMITIDO + sem etiqueta` e `invoice_date <= hoje + lead` **OU** sem data (**"À definir"**, D144 — sempre avisa). **Some** quando a etiqueta é gerada (ou o contrato deixa EMITIDO). Predicado = worklist G0 + janela de lead-time; reusa o índice `idx_sale_contract_requires_approval_status_invoice`. A regra vive em `Contratos-Visao-Geral.md` §7 (AP31).
- **Item:** nº do contrato + comprador + **chip de prazo por proximidade** ("vence hoje / amanhã / esta semana / este mês / em N dias"; **"sem data"** p/ À definir; **"faturamento vencido"** se a data já passou — `formatAvisoDue`). Linha **clicável** → `/embarques?tab=aprovacoes&highlight=<id>` (gerar a etiqueta na worklist; "a ação mora na casa", igual aos chips do calendário).
- **Layout (DSB-D19):** `.dd-content-grid` virou **2 colunas** — calendário (`1fr`) à esquerda, Avisos (`minmax(280px, 340px)`) à direita; a trava 100vh e o piso 420px do calendário permanecem. **Desktop-only por ora** (chega ao mobile no ciclo do dashboard mobile, DSB-H6).
- **Escopo:** auth-only, todos os não-PROSPECTOR (= worklist, AP10). Rota `GET /dashboard/avisos` (§8). Fetch pelo hook `useRecentSendsFeed` (generificado por `<T>`); refetch em foco/visibilidade + ao gerar a etiqueta.

---

## 8. Rotas de API (`app/api/v1/dashboard/*`)

Todas são `GET`, delegam ao backend via `executeBackend('<methodName>', …)` e estão **fora** do `PROSPECTOR_ALLOWED_API_METHODS` → o PROSPECTOR recebe **403** (allowlist central em `src/auth/prospector-access.js`, enforcement em `resolveActorContext`).

| Rota                         | methodName                   | Gate                     | Parâmetros              | Cache                                  | Resposta                                                        |
| ---------------------------- | ---------------------------- | ------------------------ | ----------------------- | -------------------------------------- | --------------------------------------------------------------- |
| `/dashboard/pending`         | `getDashboardPending`        | Auth                     | —                       | —                                      | `{ classificationPending: { total } }` (count-only — DSB-H4/H5) |
| `/dashboard/payment-events`  | `getDashboardPaymentEvents`  | Não-PROSPECTOR (service) | `?from&to` (YYYY-MM-DD) | `private, max-age=30, must-revalidate` | `{ events: Record<dayKey, evento[]> }`                          |
| `/dashboard/shipment-events` | `getDashboardShipmentEvents` | Auth (não-PROSPECTOR)    | `?from&to`              | `private, max-age=30, must-revalidate` | `{ events: Record<dayKey, evento[]> }`                          |
| `/dashboard/invoice-events`  | `getDashboardInvoiceEvents`  | Auth (não-PROSPECTOR)    | `?from&to`              | `private, max-age=30, must-revalidate` | `{ events: Record<dayKey, evento[]> }`                          |
| `/dashboard/avisos`          | `getDashboardAvisos`         | Auth (não-PROSPECTOR)    | —                       | `private, max-age=30, must-revalidate` | `{ items: aviso[] }` (aprovação a enviar — DSB-D19; ver §7.4)   |

_(`/dashboard/approval-events` foi **removido** em DSB-D9 — mas a ideia **voltou** como `/dashboard/avisos` (DSB-D19), um card binário de Avisos, não feed de calendário; ver §7.4.)_
_(`/dashboard/sales-availability` foi **removido** e `/dashboard/recent-sends` foi **dividido e movido** em DSB-D14 — os envios agora saem de `GET /samples/recent-sends` (`getSampleRecentSends`, `{ items }` top-40) e `GET /sale-contracts/approvals/recent-sends` (`getApprovalRecentSends`, `{ items }` top-40), ambos auth-only com o mesmo cache `private, max-age=30, must-revalidate`, consumidos pelas páginas donas — ver §7.2.)_

Definições dos handlers: `src/api/v1/backend-api.js`. Implementações: `src/samples/sample-query-service.js` (pending, recent-sample-sends) e `src/sale-contracts/sale-contract-service.js` (payment, shipment, invoice, recent-approval-sends).

> **`/dashboard/pending` não é mais consumido pelo dashboard** (2026-07-12, DSB-D2) — só o card só-visualização de `/samples` (`ClassificationPendingCard`) o usa, lendo apenas `.total`. **Enxugado pra count-only no check-up (DSB-H4/H5):** saíram os `items` (findMany até 500, mapeado e descartado) e o `clientsIncomplete` (`client.count` com near-full scan), que eram payload morto; agora é um `sample.count`. O nome "dashboard" é dívida consciente até a revisão de Lotes/Clientes.

**Regras dos feeds de eventos (backend):**

- **Pagamento:** agendado = `EMITIDO`/`FATURADO` com `paymentDate` na janela; realizado = `PAGO` com `paidAt` na janela; `WASH_OUT` fora. Todo **não-PROSPECTOR** vê os pagamentos de **todos** os contratos (escopo aberto — D140; `FINANCEIRO_ROLES = NON_PROSPECTOR_ROLES` desde 2026-07-15; sem recorte por `Broker.userId`). Vencidos reclassificados por "hoje BRT" (dot vermelho).
- **Embarque:** agendado = `requiresShipment` + `EMITIDO`/`FATURADO` + não embarcado, no `invoiceDate` (vermelho se o dia passar); realizado = embarcado (`shippedAt` na janela).
- **Faturamento (DSB-D11):** agendado = `EMITIDO` no `invoiceDate` (vermelho se o dia passar); realizado = `FATURADO`/`PAGO` no `invoicedAt` (dia REAL do faturamento, não no `invoiceDate`). Auth-only (todos os não-PROSPECTOR, sem escopo por corretor — como o embarque). `id` namespaced (`invoice:`). Índices `idx_sale_contract_status_invoice_date` / `_status_invoiced_at`.
- **Fim de semana (DSB-D18):** o roll de fim de semana do DSB-D7 (`rollWeekendToWeekday`) foi **removido** — os buckets (`bucketPaymentEvents`/`bucketShipmentEvents`/`bucketInvoiceEvents`) agrupam no **dia real**; o calendário mensal mostra sáb/dom. A validação de contrato que recusa datas de ação em fim de semana (`assertBusinessDate`, 422 `WEEKEND_DATE`) **permanece** — evento em sáb/dom é legado/borda.
- **Escopo por papel dos feeds:** **nenhum** feed é mais escopado por corretor — pagamento, embarque e faturamento são todos **auth-only por papel** (o COMMERCIAL vê contratos de **outros** corretores: nº + comprador + datas; info **não-sensível**, sem preço/corretagem nos selects). O pagamento segue gated por `FINANCEIRO_ROLES` (= `NON_PROSPECTOR_ROLES` desde 2026-07-15 — era ADMIN + COMMERCIAL); embarque e faturamento por qualquer não-PROSPECTOR. _(A "Decisão do check-up: **manter**" o pagamento escopado ao próprio corretor foi **revisada em 2026-07-13 — D140**: o own-only foi revogado e o feed de pagamento também abriu a todos os contratos.)_
- _(O feed de **aprovação** — lembrete "a enviar" com fan-out por intervalo — foi **removido** em DSB-D9; ver §7.3.)_

---

## 9. Regras de negócio e detalhes técnicos

- **Datas em BRT:** todos os cálculos de dia usam offset São Paulo −3h (feeds de eventos, calendário). A **grade** do calendário é mensal domingo-first (`computeMonthStart`/`buildMonthGrid` — do domingo da semana do dia 1 ao sábado da semana do último dia; DSB-D18). O dia da semana de uma data de contrato (`@db.Date`) é lido em **UTC** (`getUTCDay`), sem deslocar −3h.
- **Throttle de refetch (C1, 2026-07-12):** os **3 feeds de eventos** refazem em `focus` **e** `visibilitychange`, com gate `visibilityState==='visible'` + throttle **30s** (antes disparavam sem gate/throttle → tempestade de requests no Alt+Tab). Só no breakpoint desktop; só com janela emitida. _(Os cards de envios levaram o mesmo padrão pra `lib/use-recent-sends-feed.ts` nas suas novas páginas — DSB-D14. O card de pendência de `/samples` segue com fetch simples na montagem.)_
- **Twin inativo não busca:** os fetches dos feeds de eventos checam `matchMedia('(min-width: 901px)')` antes de disparar, e um listener de `change` re-busca ao **entrar** no desktop (senão o card ficava travado no skeleton após um resize — C1).
- **Erro + retry (C1):** falha de fetch dos eventos mostra **erro + "Tentar novamente"** (componente `LoadError` — ex-`DashboardLoadError`, agora compartilhado em `components/LoadError.tsx`; reusa `.dashboard-error-banner`) no lugar de skeleton/vazio eterno.
- **Saudação por hora:** `getGreeting()` — "Bom dia" (<12h), "Boa tarde" (<18h), "Boa noite".
- **Cards removidos (histórico):** "Últimas atividades", "Vendas e perdas" (endpoint `commercial-timeseries`), StatCards de pulso ("Lotes registrados hoje"/"Envios concluídos hoje") e "Impressão pendente" foram todos removidos. Em **2026-07-12 (DSB-D2)** saíram os StatCards de pendências: **"Classificação pendente"** (migrou para `/samples`) e **"Cadastros pendentes"** (removido), junto com o `OperationModal`. Em **2026-07-14 (DSB-D14)** o donut **"Lotes disponíveis"** foi apagado do sistema e os cards de envios migraram pra `/samples` e `/embarques`. Nenhum deve reaparecer sem decisão explícita.

---

## 10. Mapa de arquivos

**Frontend**

- `app/dashboard/page.tsx` — orquestração (branch por papel, twins)
- `components/dashboard/DashboardDesktop.tsx` — layout desktop + fetch dos 3 feeds de eventos (pagamento + embarque + faturamento)
- `components/dashboard/DashboardMobile.tsx` — layout mobile (só o hero — DSB-D14)
- `components/dashboard/EventsCalendarCard.tsx` — card de Eventos (calendário)
- `components/dashboard/greeting.ts` — saudação + iniciais
- `components/dashboard/prospector/ProspectorDashboard.tsx` + `useProspectorDashboardData.ts` — dashboard do PROSPECTOR
- `components/LoadError.tsx` — erro de carregamento + "Tentar novamente" (ex-`DashboardLoadError`; compartilhado com os cards de envios nas novas páginas — DSB-D14)
- ~~`components/samples/ClassificationPendingCard.tsx`~~ — **órfão** desde a F1 do redesenho FV (a contagem virou KPI de `/samples`, servido por `GET /samples/stats`)
- `lib/dashboard-calendar.ts` — matemática BRT do calendário
- `lib/roles.ts` — `isProspector`, `FINANCEIRO_ROLES`, labels
- `lib/api-client.ts` — funções `getDashboard*`
- CSS: `app/globals.css` (classes `dashboard-*`, `dd-*`, `prospector-*`)

> Removidos em DSB-D2 (2026-07-12): `components/dashboard/StatCard.tsx`, `OperationModal.tsx`, `useOperationModal.ts`. Removidos em **DSB-D14 (2026-07-14)**: `components/SalesAvailabilityCard.tsx`, `components/dashboard/useDashboardData.ts`. **Migraram** em DSB-D14: `RecentSendsCard.tsx` → `components/` (classes `sends-*`; consumido por `/samples` e `AprovacoesPanel`, com o hook novo `lib/use-recent-sends-feed.ts`).

**Backend**

- `app/api/v1/dashboard/{pending,payment-events,shipment-events,invoice-events}/route.ts` _(o `approval-events` saiu em DSB-D9; `sales-availability` e `recent-sends` saíram em DSB-D14 — os envios agora vivem em `app/api/v1/samples/recent-sends/` e `app/api/v1/sale-contracts/approvals/recent-sends/`)_
- `src/api/v1/backend-api.js` — handlers + gate central
- `src/samples/sample-query-service.js` — pending, recent-sample-sends
- `src/sale-contracts/sale-contract-service.js` — payment/shipment events + recent-approval-sends
- `src/auth/prospector-access.js` — allowlist (barra o PROSPECTOR nos endpoints do dashboard padrão)

**Testes**

- Integração: `tests/dashboard-pending.integration.test.js` (count-only), `tests/sample-recent-sends.integration.test.js` (ex-`dashboard-recent-sends`; o de `sales-availability` foi **deletado** com o donut — DSB-D14)
- Unit: `tests/dashboard-calendar.test.ts` — matemática do calendário/BRT (DSB-H8)
- Feeds de evento (payment/shipment/invoice) + builders/buckets: `tests/sale-contract.integration.test.js` e `tests/sale-contract-support.test.js`

---

## 11. Estado de validação

O dashboard atual (**só o card de Eventos** — DSB-D14; feeds de pagamento/embarque/faturamento), a migração dos cards de envios pra `/samples` e pra aba Aprovações (DSB-D14), a remoção do donut (DSB-D14) e as decisões anteriores do check-up (DSB-D2 a D13) foram implementados mas **aguardam validação no device** (ver `Dashboard-Plano-de-Trabalho.md`). Este documento descreve o comportamento **do código**; divergências observadas no device viram achados no plano de trabalho.
