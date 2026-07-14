# Dashboard — Plano de Trabalho

Status: Em andamento (check-up geral do dashboard — desktop primeiro, depois mobile)
Escopo: backlog, decisões e execução das mudanças no dashboard. Acompanha o documento-mãe `Dashboard-Visao-Geral.md`, que registra o funcionamento atual.
Última revisão: 2026-07-14
Documentos relacionados: `Dashboard-Visao-Geral.md` (estado atual), `Revisao-Geral-Plano-de-Trabalho.md` (roteiro de revisão do app inteiro)

> **Objetivo do ciclo (Flavio, 2026-07-12):** check-up geral do sistema, página por página e por dispositivo, começando pelo **dashboard desktop** → depois **dashboard mobile**. Meta: simplificar, deixar o app menos confuso de mexer e viabilizá-lo para mais corretoras (multi-cliente). Mudanças de layout/funcionalidade/disposição estão em cima da mesa.

---

## 1. Protocolo de trabalho

1. **Docs-first.** O `Dashboard-Visao-Geral.md` registra o funcionamento atual (verdade viva). Nenhuma mudança começa sem a linha de base registrada.
2. **Uma mudança por vez, com decisão registrada.** Cada mudança vira uma decisão numerada (`DSB-Dn`) aqui neste doc, discutida e confirmada antes de implementar.
3. **Ao concluir e validar uma implementação:** atualizar o `Dashboard-Visao-Geral.md` no mesmo ciclo (o estado atual muda) e marcar o item aqui como ✅.
4. **Ordem por dispositivo:** desktop primeiro; só depois de o desktop estar correto, o mobile.
5. **Validação no device** é obrigatória para o que não dá para testar localmente (visual/responsivo/iOS PWA). Itens só viram ✅ com validação do Flavio.
6. **Gates verdes** antes de qualquer commit (lint, format:check, typecheck, build, testes).

Prefixo de decisão deste ciclo: **`DSB`** (Dashboard check-up). Achados: **`DSB-Bn`** (bug), **`DSB-Gn`** (gargalo), **`DSB-Ln`** (design/layout), **`DSB-An`** (acessibilidade).

---

## 2. Linha de base

O funcionamento atual está inteiramente descrito em **`Dashboard-Visao-Geral.md`**. Resumo do que existe hoje:

- Dashboard padrão (5 papéis não-PROSPECTOR): desktop = top row com **3 cards** (donut "Lotes disponíveis" estreito + "Amostras enviadas" + "Aprovações enviadas" — **DSB-D5**) + Eventos horizontal embaixo (**DSB-D3**); mobile = hero + donut. (Os cards de pendências saíram em **DSB-D2**.)
- Dashboard do PROSPECTOR: dedicado (visitas/informes).
- 6 rotas de API; `/dashboard/recent-sends` devolve **duas listas** (`sampleItems`/`approvalItems`, **DSB-D5**); card de Eventos com 3 feeds (pagamento/embarque/faturamento — DSB-D9 removeu o de aprovação, DSB-D11 somou o de faturamento), em **1 semana com eventos na célula** (**DSB-D4**), coloridos por **estado** (DSB-D10).
- Página de Lotes (`/samples`): ganhou o card só-visualização "Classificação pendente" (**DSB-D2**).

**Tudo isso está implementado mas ainda aguarda validação no device** — ver §4.

---

## 3. Backlog herdado (absorvido dos docs antigos)

Itens que estavam abertos no `Eventos-Dashboard-Plano-de-Trabalho.md` (removido) e na seção DSH da Revisão Geral. Reavaliar cada um dentro deste check-up.

### Layout / design

- **DSB-H1 (era DSH-P6 / EVD-P5)** — ✅ **endereçado por DSB-D4:** o card de Eventos foi redesenhado (1 semana, células altas com os eventos dentro). O painel some, então a "proporção grade × painel" deixou de existir. Ajuste fino de altura/largura das células fica para a validação no device (achados DSB-L).
- **DSB-H2 (era DSH-P5)** — ✅ **resolvido por DSB-D12:** os greys/inks hardcoded dos **textos** dos cards `dd-*` viraram `var(--ink)`/`var(--muted)` da paleta. Fundos brancos, bordas `rgba(112,130,103,…)` e as cores de estado do chip ficaram (fora do escopo do achado). _(Os exemplos originais estavam imprecisos: `#72766f` era da `.samples-page-v2`, não dd; `#1f8540` já não existia.)_
- **DSB-H3** — ✅ **resolvido por DSB-D2**: a linha de StatCards de pendências saiu do dashboard; a coluna esquerda ficou só com a pilha donut + Últimos envios. Validar no device se o donut, agora com mais altura disponível, ficou bem.

### Gargalos / performance

- **DSB-H4 (era DSH-P3)** — ✅ **resolvido no check-up (C2):** `getDashboardPending` virou **count-only** (`sample.count`) — saíram o `findMany` (até 500 `items`, mapeado e descartado) e o `clientsIncomplete`, que eram payload morto. Resta só a dívida do **nome** "dashboard" (o endpoint hoje serve só `/samples`), pra revisão de Lotes/Clientes.
- **DSB-H5 (era DSH-P4)** — ✅ **resolvido no check-up (C2):** o `client.count(completeness)` (near-full scan) foi **removido** do `getDashboardPending` (era o payload morto `clientsIncomplete`). A completude de cliente segue no filtro de `/clients`, inalterada.

### Cobertura mobile

- **DSB-H6 (era EVD-P3)** — **Card de Eventos não existe no mobile** (desktop-only). Definir se/como o calendário aparece no mobile. → **Entra no ciclo do dashboard mobile.** ⚠️ **Ficou mais urgente com DSB-D14:** o dashboard mobile hoje é só o hero (página vazia).
- **DSB-H7** — Os cards de envios ("Amostras enviadas"/"Aprovações enviadas") são desktop-only. Mesma pergunta — agora nas **novas casas** (`/samples` e aba Aprovações — DSB-D14), não mais no dashboard.

### Testes

- **DSB-H8 (era EVD-T1)** — ✅ **resolvido no check-up (C3):** `tests/dashboard-calendar.test.ts` cobre a matemática (semana/dayKey/BRT/rótulos, `now` injetável). O `test:unit` já roda `.test.ts` via `--experimental-strip-types`; o módulo deixou de importar `isWeekendDate` (inlinou o check de fim de semana) pra carregar sob strip-types.

### Features futuras (ideias, nada travado)

- **DSB-H9 (era E11 / EVD-P1)** — Catálogo de tipos de evento está aberto: hoje **pagamento, embarque e faturamento** (aprovação saiu no DSB-D9; faturamento entrou no DSB-D11). Novos tipos entram feature a feature.
- **DSB-H10 (era EVD-P4)** — Criação manual de evento pelo card (fora de escopo até aqui).

---

## 4. Validação no device pendente

O redesenho e os feeds foram implementados mas nunca foram confirmados no aparelho real. Antes (ou durante) as mudanças deste check-up, validar (lista atualizada pós-DSB-D14):

- **Dashboard desktop (DSB-D14):** só o card de Eventos, ocupando a área toda (semana **seg–sex**, hoje com anel, navegação ◀ Hoje ▶ com deslize, eventos como chips **dentro da célula** com scroll interno, coloridos por **estado**, legenda); os 3 feeds (**pagamento/embarque/faturamento**) com deep links para `/contratos`/`/embarques`. Altura confortável? Viewport baixa (~768px): estoura?
- **Dashboard mobile (DSB-D14):** só o hero (sem donut, sem sheet) a 320px; dashboard do PROSPECTOR **intacto**.
- **Página de Lotes (`/samples`, desktop):** topo do sheet com "Classificação pendente" + **"Amostras enviadas"** lado a lado (`.spv2-top-cards`); a lista de envios rola por dentro (teto ~340px); física+laudo, cancelado esmaecido, truncamento, tempo relativo. **Mobile:** o card de envios **não aparece**; "Classificação pendente" igual a antes.
- **Aba Aprovações (`/embarques?tab=aprovacoes`, desktop):** card **"Aprovações enviadas"** acima da worklist (nº contrato + comprador + tempo); atualiza após gerar etiqueta. **Mobile:** card não aparece; worklist igual a antes.
- **Detalhe do cliente ("Resumo comercial"):** o donut do cliente **continua intacto** (o CSS base `.sales-card*` ficou; só o CSS exclusivo do donut do dashboard saiu).
- **Contraste** (DSH-A3): textos secundários pequenos ficaram um tom mais escuros — conferir.

---

## 5. Decisões do ciclo

- **DSB-D1 (2026-07-12)** — Consolidação da documentação do dashboard em **dois arquivos**: `Dashboard-Visao-Geral.md` (mãe / estado atual) e este `Dashboard-Plano-de-Trabalho.md` (futuro). O `Eventos-Dashboard-Plano-de-Trabalho.md` foi **absorvido e removido**; a seção DSH da `Revisao-Geral-Plano-de-Trabalho.md` passou a apontar para estes dois docs. Histórico preservado no Git.

- **DSB-D2 (2026-07-12)** — **Remoção dos cards de pendências do dashboard** (desktop + mobile), para simplificar:
  - **"Classificação pendente"** saiu do dashboard e virou um card **só-visualização** na página de Lotes (`components/samples/ClassificationPendingCard.tsx`), inerte. **Sem** o `OperationModal` — a fila/seta → `/camera` será reconstruída na revisão da página de Lotes. Contagem vinda de `getDashboardPending` (`classificationPending.total`).
  - **"Cadastros pendentes"** foi **removido** por completo (decisão do Flavio: não migrou; não é mais necessário).
  - `useDashboardData` simplificado (só o donut); `OperationModal.tsx`, `useOperationModal.ts` e `StatCard.tsx` **deletados**; CSS morto `.dd-summary-row`/`.dd-stat-*` removido.
  - **Backend intacto** — `/dashboard/pending` mantido como fonte da contagem (decisão do Flavio); testes de integração não tocados.
  - **Desvio consciente vs. plano:** o card de `/samples` é **page-native** (classe `.spv2-pending-stat`) em vez de reusar o `StatCard` do dashboard — evita acoplar `/samples` ao CSS desktop-only do dashboard e permitiu deletar o `StatCard`. Mesmo resultado visual.
  - Gates locais verdes (lint/format/typecheck/build/unit). 📱 **validar no device**.

- **DSB-D3 (2026-07-12)** — **Rearranjo do layout do dashboard desktop:** "Lotes disponíveis" (donut) e "Últimos envios" passaram a ficar **lado a lado** numa top row; o card de **Eventos** desceu para **baixo dos dois**, ocupando a **largura toda** (virou horizontal). `.dd-content-grid` passou de 2 colunas para 2 linhas; `.dd-left-col`/`.dd-left-stack` → `.dd-top-row`. Só CSS + a árvore do `DashboardDesktop`.

- **DSB-D4 (2026-07-12)** — **Redesenho do card de Eventos:** de 2 semanas → **1 semana (7 dias)**; cada dia virou um **quadrado alto** que mostra os **eventos dentro da própria célula** (chips coloridos por tipo, clicáveis → `/contratos`), **sem painel** de dia selecionado. Dias cheios **rolam por dentro** da célula (decisão do Flavio). Navegação ◀ Hoje ▶ **de 7 em 7** (mantida). "Hoje" com anel; **fins de semana deixam de ser apagados**. `lib/dashboard-calendar.ts`: quinzena→semana (`buildWeek`/`computeWeekStart`/`CALENDAR_WEEK_DAYS`); removidos `formatSelectedDayLabel`/`isWeekend` (órfãos). CSS `.dd-events-*` reescrito (grid 7×1, célula = container, `.dd-events-day-list` rolável, `.dd-events-chip`); painel/dots removidos. Backend e os 3 feeds **intactos** (só muda a janela: 7 dias). Gates verdes. 📱 validar.

- **DSB-D5 (2026-07-12)** — **Divisão do card "Últimos envios" em dois:** "Amostras enviadas" (física + laudo, com selo de tipo) e "Aprovações enviadas" (só aprovações, sem selo). Os dois entram na **mesma linha** do donut → **top row com 3 cards** (donut **mais estreito**, ~`0.8fr / 1.1fr / 1.1fr`). Decisões do Flavio: física+laudo juntos; **backend devolve duas listas independentes** (`{ sampleItems, approvalItems }`, cada uma com seu top-40 — corrige o risco de o corte global de 40 zerar as aprovações); donut mais estreito.
  - **Backend:** só o handler `getDashboardRecentSends` (`backend-api.js`) mudou — deixou de mesclar/cortar e passou a devolver as duas sub-listas (o query-service e o `getRecentApprovalSends` seguem intactos, cap 40 cada).
  - **Tipos:** `DashboardRecentSendsResponse` → `{ sampleItems, approvalItems }` (`DashboardRecentSendItem` inalterado). `lib/api-client.ts` não mudou (tipo inferido).
  - **Frontend:** `RecentSendsCard` parametrizado (`title`/`emptyLabel`; selo omitido quando `kind === 'APPROVAL'`); `DashboardDesktop` renderiza os dois cards na top row.
  - **CSS:** `.dd-top-row` de 2 → 3 colunas (donut estreito). Nenhuma classe nova (os dois feeds reusam `.dd-sends-card`).
  - **Não tocado:** rota, limites 40/40, teste `dashboard-recent-sends.integration.test.js` (exercita o query-service, cuja forma `{ items }` não mudou).
  - Gates verdes. 📱 **validar no device** (larguras 901-1200px — 3 cards legíveis? minicards estouram? proporção boa?).

- **DSB-D6 (2026-07-12)** — **Navegação do desktop foi pra top bar + saudação removida** (mudança **cross-página**, centralizada em `AppShell.tsx`, afeta todas as páginas):
  - **Nav desktop:** dos 5 papéis não-PROSPECTOR saiu da **sidebar vertical verde** (esquerda) e virou uma **top bar horizontal branca** no topo — logo colorido (`/logo-safras-color.png`) à esquerda, **itens só com NOME (sem ícones)** centralizados, avatar à direita, item ativo **sublinhado**. Grid do shell virou **coluna única**; `:has(.app-sidebar)` reativa o layout de 2 colunas só pro **PROSPECTOR**, que **mantém a sidebar** (app restrito, decisão do Flavio).
  - **Logout:** o botão **"Sair" saiu da navegação** — agora só pelo **menu do avatar** (dropdown do perfil, já presente em todas as páginas desktop).
  - **Saudação:** o bloco `.topbar-greeting` (saudação + nome) do **dashboard desktop** foi **removido** (o hero mobile mantém a saudação).
  - **Arquivos:** `AppShell.tsx` (sidebar condicional ao prospector; `.topbar-nav`; logo duplo branco/colorido; remove greeting + `getGreeting`/`profileFirstName`) e `globals.css` (grid via `:has(.app-sidebar)`; `.topbar-inner:has(.topbar-nav)` grid 3 colunas; `.topbar-nav*`; remove `.topbar-greeting*`; `.ctr-contract-sheet` volta a centralizar normal — fim da dependência de `--app-sidebar-w`, mantido só no grid do prospector). Páginas individuais **não** mudaram (só montam o `AppShell`). Mobile **intacto**.
  - Docs: `Auditoria-Navegacao-por-Papel.md` (canônico), skill `design-system`, `Dashboard-Visao-Geral.md`. Gates verdes. 📱 **validar** (901-1400px: nav centralizada não colide com 6 itens do ADMIN? altura da faixa? sublinhado do ativo? prospector inalterado?).

- **DSB-D7 (2026-07-12)** — **Datas de contrato sem fim de semana + card de Eventos só seg–sex** (feature que cruza contrato ↔ dashboard):
  - **Contrato:** as datas de **ação** (`invoiceDate`/faturamento, `paymentDate`/pagamento, `invoicedAt`/`paidAt`/`shippedAt`) **recusam sábado/domingo** — bloqueio duro com erro no campo (front) + `422 WEEKEND_DATE` (back, autoritativo, em `assertBusinessDate` chamado por `normalizeActionDate` + `normalizeEtapa2Input`). A **data do contrato** (`contractDate`, assinatura) fica **livre**. Helper `lib/business-days.ts` (`isWeekendIso`/`isWeekendDate`/`WEEKEND_DATE_MESSAGE`).
  - **Card de Eventos:** renderiza só **seg–sex (5 células)** — sábado/domingo saem. A janela buscada segue **dom–sáb** e o backend **rola** os eventos de fim de semana pro dia útil vizinho (`rollWeekendToWeekday` nos `bucketPaymentEvents`/`bucketShipmentEvents`, sáb→sex/dom→seg) pra nada sumir (legado/borda). Aprovação não rola (fan-out cobre os dias úteis). `lib/dashboard-calendar.ts` ganhou `buildBusinessDays`; CSS `.dd-events-grid`/`.dd-events-weekdays` = `repeat(5,…)`.
  - **Supera** o trecho de DSB-D4 "fins de semana legíveis (sem apagar)" → agora **ocultos**.
  - Testes: unit (`assertBusinessDate`/`rollWeekendToWeekday`/buckets) em `sale-contract-support.test.js`; fixtures de contrato com data de fim de semana corrigidas. Gates verdes. 📱 validar.

- **DSB-D8 (2026-07-12)** — **Cards de envios viraram tabela horizontal compacta.** "Amostras enviadas" e "Aprovações enviadas" deixaram o mini-card de 2 linhas (que reusava `.spv2-card`) e passaram a **uma linha por envio** com **cabeçalho de colunas** (sticky):
  - **Amostras:** `Lote · Destinatário · Tipo · Tempo`. `Tipo` = texto **cinza neutro**, uma palavra: física → **"Físico"**, laudo → **"Descrição"** (decisão do Flavio; ⚠️ diverge do termo "Laudo" do resto do app, escopado só a este card).
  - **Aprovações:** `Contrato · Comprador · Tempo` (sem coluna de tipo — o título já diz).
  - Decisões do Flavio: cancelado = **linha esmaecida + número riscado** (sem tag); Tipo em **texto neutro** (sem pílula colorida).
  - Gargalos endereçados: **desacoplado do `.spv2-card`** (a variante `is-static` era exclusiva daqui — a revisão de Lotes vai mexer no `.spv2-card`); **truncamento** de nomes longos (ellipsis + `title`); **cabeçalho sticky** (não some ao rolar); ícone de relógio **removido** (coluna já rotulada); semântica de **tabela** (`role=table/row/columnheader/cell`); classes/consts órfãs removidas. `RecentSendsCard` ganhou prop `variant`; CSS `.dd-send-*` novo. **Sem backend** (o dado já tinha tudo).
  - Supera o visual `.spv2-card` que a DSB-D5 herdou. 📱 validar (901-1400px: 4 colunas cabem no card mais estreito? truncamento ok? cabeçalho fixo?).

- **DSB-D9 (2026-07-12)** — **Removido o lembrete de aprovação ("a enviar") do card de Eventos.** Início da série "consertar os gargalos do card de Eventos" (ver análise dos 5 pontos no fim do §5). Decisão do Flavio: a **data em que a aprovação deve ser enviada não é exata**, e o lembrete fazia **fan-out** (o mesmo contrato pintado em vários dias) → informação imprecisa. **Removido ponta a ponta:** rota `app/api/v1/dashboard/approval-events/`, handler `getDashboardApprovalEvents` (backend-api), método no service, `APPROVAL_REMINDER_SELECT`/`buildApprovalReminderEvent`/`bucketApprovalReminders` + helpers `addDaysUtc`/`dayKeyFromDate` (support), `getDashboardApprovalEvents` (api-client), `DashboardApprovalEventsResponse` (types), o feed/estado/merge no `DashboardDesktop`, o branch `contract_approval_due` do `navTabForEvent` e o chip `[data-type='contract_approval_due']` (CSS). **NÃO mexeu** no schema/migrations nem no form: `requiresApproval`/`approvalReminderLeadDays` ficam (a **aba Aprovações** usa `requiresApproval`; o lead-time deixou de ter consumidor). O card **"Aprovações enviadas"** segue. Testes: −3 unit (`buildApprovalReminderEvent`/`bucketApprovalReminders`) + −1 integração (feed). Docs: Visão Geral (§7.3/§8/matriz/endpoints/arquivos), skills `design-system` + `prisma`, `Aprovacoes-Plano` (nota de superação da Fase 2), `Embarque-Plano`. 📱 validar (card de Eventos sem os chips laranja).

- **DSB-D10 (2026-07-12)** — **Card de Eventos colorido por ESTADO + rótulo com o nome do tipo + legenda.** A **cor** do chip passou a identificar só o **estado** (🔵 azul previsto / 🔴 vermelho atrasado / 🟢 verde realizado — **3 cores**, no lugar das 6 por tipo), e o **nome do tipo** no rótulo é que diferencia os eventos. Endereça os gargalos anotados ao fim do DSB-D9 (prefixo no chip de pagamento + legenda de cores):
  - **`state`** (`previsto|atrasado|realizado`) no `DashboardCalendarEvent`, derivado do `typeKey` em `buildPaymentEvent`/`buildShipmentEvent` (`sale-contract-support.js`).
  - **Pagamento ganhou prefixo** `pagamento ·` no `label` (antes só `nº · comprador`); embarque já tinha `embarque ·`.
  - **CSS:** de 6 regras `.dd-events-chip[data-type=…]` → **3** `[data-state=…]` (vars `--state-previsto/atrasado/realizado` no `.dd-events-card`); o chip renderiza `data-state` (mantém `data-type` p/ QA). **Legenda** `.dd-events-legend` sob o header (bolinhas por estado).
  - **A11y (DSB-A):** o estado ia só na cor → agora também no `aria-label`/`title` do chip.
  - Testes: labels de pagamento atualizados (+prefixo) + asserts de `state`. Gates verdes (typecheck/lint/format/build/408 unit). 📱 validar.

- **DSB-D11 (2026-07-12)** — **Novo evento de Faturamento no card de Eventos** (feed próprio, irmão do Embarque). Faturamento e embarque caem os dois na `invoiceDate` como "previsto", mas são eventos distintos (nomes diferentes, mesmo dia — decisão do Flavio). Segue o esquema de cor/estado do DSB-D10:
  - **Previsto** (azul) = `EMITIDO` no `invoiceDate`; **atrasado** (vermelho) = `invoiceDate` passou, ainda `EMITIDO`; **realizado** (verde) = `FATURADO`/`PAGO` no `invoicedAt` (dia REAL do faturamento).
  - **Feed auth-only** (`getDashboardInvoiceEvents`; todos os não-PROSPECTOR, sem escopo por corretor — como o embarque). Ponta a ponta: `INVOICE_EVENT_SELECT`/`buildInvoiceEvent`/`bucketInvoiceEvents` (support), método no service, handler (backend-api), rota `/dashboard/invoice-events`, fn no api-client, `DashboardInvoiceEventsResponse` (types). 3º feed mesclado no `DashboardDesktop`.
  - **Chip → aba Contratos** (onde mora "Faturar"), com **realce**: a aba Contratos ganhou o `useContractHighlight` (pisca/rola) que só Financeiro/Embarque/Aprovações tinham (`ContratosPanel` + `SaleContractCard` `isHighlighted`/`data-contract-id` + `.ctr-card.is-highlighted` no keyframe existente).
  - **Chip inerte por papel:** faturamento é visível a todos, mas a aba Contratos só abre p/ ADMIN/COMMERCIAL → p/ operacionais o chip aparece mas **não linka** (`eventHref` recebe `navigableTabs` = `contractsHubTabs(role)`).
  - **Migration aditiva** `20260712120000_sale_contract_invoice_event_indexes` (índices `[status, invoice_date]` + `[status, invoiced_at]`; `CREATE INDEX IF NOT EXISTS`).
  - Testes: +3 unit (`buildInvoiceEvent`/`bucketInvoiceEvents`) + 1 integração (`getDashboardInvoiceEvents`; escrita mas **não** rodada local p/ preservar os 4 contratos de demonstração — roda no CI). Gates verdes (typecheck/lint/format/build/411 unit). 📱 validar.

- **DSB-D12 (2026-07-12)** — **Dívida de token nos cards `dd-*` (resolve DSB-H2): greys/inks hardcoded → tokens da paleta.** Os textos dos cards do dashboard desktop usavam ~5 tons ad-hoc fora da paleta; colapsados nos **2 tokens de texto** canônicos:
  - **`var(--ink)`** (#24392f) — primário: títulos (`.dd-sends-title`/`.dd-events-title`), célula (`.dd-send-cell`), destinatário/comprador (`.dd-send-party`), dia (`.dd-events-day`), chip (`.dd-events-chip`). Substitui `#1a2e1f` (×5) e `#3a4a3f`.
  - **`var(--muted)`** (#66756b) — secundário: rótulos de coluna, tipo/tempo, vazio, período, mês do dia, iniciais dos dias da semana, legenda. Substitui `#71786d` (×6), `#4d5c52`, `#5c6b5a`.
  - **14 trocas, só `app/globals.css`.** **Fora de escopo (deixados de propósito):** fundos brancos/tints (o dashboard usa branco por decisão), bordas `rgba(112,130,103,…)`, cores de ESTADO do chip (semânticas, DSB-D10), e os greys de `.samples-page-v2`/prospector (outros componentes / outros ciclos).
  - **Mudança visual sutil:** `--ink` clareia um tom os textos escuros; `--muted` escurece um tom os secundários (melhora o contraste AA). Ganho: 2 tons da paleta em vez de 5 ad-hoc + tema-aware. `build` fica pro device (`next dev` ativo na 3000). 📱 validar (legibilidade dos textos; hierarquia código>destinatário>tipo/tempo preservada pelo peso).

- **DSB-D13 (2026-07-12)** — **Rodada de correção do dashboard (check-up pré-reforma)**, a partir de uma **auditoria multi-agente** (5 agentes: donut · envios · Eventos · shell · docs/skills). Escopo confirmado com o Flavio: **correção + higiene** (estrutural/UX/design ficou pra reforma). Cinco commits:
  - **C1 — confiabilidade dos fetches + erro/retry:** consertada a tempestade de refetch dos 3 feeds de Eventos (gate `visibilityState` + throttle 30s + dedupe focus/visibility); feeds re-buscam no resize mobile→desktop (`mq.change`); `useDashboardData` com `mountedRef`; falhas silenciosas viraram **erro + "Tentar novamente"** por card (`DashboardLoadError`).
  - **C2 — código/payload morto:** `/dashboard/pending` → **count-only** (DSB-H4/H5); `PAYMENT_EVENT_SELECT`/`buildPaymentEvent` sem `sellerSnapshot`/`sellerName`/`version`; seletor CSS órfão removido.
  - **C3 — testes (destrava DSB-H8):** `tests/dashboard-calendar.test.ts` (novo), `buildShipmentEvent` unit, caso "atrasado + rolado no fim de semana". **Adiado:** o teste de integração do split-40 no handler (roda em `test:integration:db`, que trunca o banco de demonstração).
  - **C4 — sync docs/skills + comentários:** Visão Geral §8/§9/§10 + nota de escopo por papel dos feeds; skill `design-system` (tokens de texto `--ink`/`--muted`, período seg–sex); `CLAUDE.md` (+`button-press-effect`); `README` (+3 docs, data); `Central-de-Contratos` (porta do card de Eventos removida); comentários stale + pt-BR "Distribuição".
  - **C5 — fundação da reforma:** doc canônico **`Design-Language.md`** (inventário token-first do `:root`) + listado no `README` + skill `design-system` aponta pra ele como fonte dos tokens.
  - **Decisões do Flavio (plan mode):** escopo = correção+higiene; falhas → **erro+retry**; fonte de design → **doc Design-Language novo**; **visibilidade do COMMERCIAL** nos feeds embarque/faturamento → **manter** (auth-only; sem mudança de backend).
  - Gates verdes (typecheck/lint/format/**423 unit**/knip 79); `build` fica pro device (`next dev` ativo na 3000). 📱 validar (erro+retry no offline; Eventos popula no resize mobile→desktop; `/samples` com o total de pendência certo; sem regressão visual).

_(Fora de escopo, pra REFORMA de design: unificar os 3 feeds num endpoint; primitivo `<AgingDonut>` compartilhado; a11y — sinal não-cromático de estado no chip (WCAG 1.4.1), total no aria do donut, "cancelado" p/ leitor de tela, foco de teclado; cobertura mobile de Eventos/envios; renomear `/dashboard/pending`.)_

- **DSB-D14 (2026-07-14)** — **Dashboard só com o calendário** (início da reforma de layout/design do check-up; decisão do Flavio). A página `/dashboard` passa a apresentar **apenas o card de Eventos** (que será redesenhado em decisões seguintes); os 3 cards da top row ganham outro destino:
  - **Donut "Lotes disponíveis" — APAGADO do sistema ponta a ponta** (análise do Flavio: não é relevante): `SalesAvailabilityCard.tsx`, hook `useDashboardData.ts`, rota `/api/v1/dashboard/sales-availability`, handler `getDashboardSalesAvailability` (backend-api), método no `sample-query-service`, fn no api-client, tipo `DashboardSalesAvailabilityResponse`, CSS exclusivo e o teste `dashboard-sales-availability.integration.test.js`. ⚠️ O CSS base `.sales-card*`/`.sales-chart-*` **FICA** — é reusado pelo "Resumo comercial" do detalhe do cliente (`ClientCommercialSummaryCard`); só as regras exclusivas do donut saem (`is-compact`, `.sales-card-aside`, `.sales-card-detail-button*`).
  - **"Amostras enviadas" → página de Lotes (`/samples`)**, topo do sheet na região do card "Classificação pendente" (que já migrou no DSB-D2). **Desktop-only**, como era no dashboard (cobertura mobile fica pro ciclo mobile, DSB-H7).
  - **"Aprovações enviadas" → aba Aprovações (`/embarques?tab=aprovacoes`)**, no topo da aba, acima da worklist. **Desktop-only.** Redundância parcial com o filtro "Enviadas" da worklist foi apontada e **aceita** (decisão do Flavio: o card entra mesmo assim, como visão rápida dos últimos envios).
  - **API dividida em 2 endpoints** (decisão do Flavio; cada página baixa só o que usa): `GET /samples/recent-sends` (handler `getSampleRecentSends` → query-service) e `GET /sale-contracts/approvals/recent-sends` (handler `getApprovalRecentSends` → `getRecentApprovalSends` do contract service). Mesmos caps top-40 e `Cache-Control: private, max-age=30, must-revalidate`. A rota `/dashboard/recent-sends` **morre** (sem consumidor).
  - **Mobile:** o dashboard mobile fica **só com o hero** por enquanto (decisão do Flavio) — o calendário chega ao mobile no ciclo mobile (DSB-H6, que fica mais urgente).
  - **Frontend compartilhado:** `RecentSendsCard` sai de `components/dashboard/` pra `components/` (desacoplado do dashboard, molde DSB-D2); classes CSS `dd-sends-*`/`dd-send-*` renomeadas pra `sends-*`; fetch desktop-gated + refetch em foreground num hook novo reutilizado pelas 2 páginas.

---

## 6. Fases

_A definir com o Flavio ao iniciar as mudanças. Ordem-base: **desktop → mobile**, uma frente por vez, cada uma com sua decisão registrada e a Visão Geral atualizada ao concluir._

---

## 7. Histórico

- **2026-07-14** — **DSB-D14 implementada:** dashboard **só com o calendário**. Donut "Lotes disponíveis" **apagado ponta a ponta** (componente + hook `useDashboardData` + rota `/dashboard/sales-availability` + handler + método do query-service + api-client + tipo + CSS exclusivo + teste de integração deletado; CSS base `.sales-card*` preservado pro "Resumo comercial" do cliente). **"Amostras enviadas" → `/samples`** (topo do sheet, wrapper `.spv2-top-cards` ao lado de "Classificação pendente") e **"Aprovações enviadas" → aba Aprovações** de `/embarques` (acima da worklist; refetch pós-gerar) — ambos desktop-only, `RecentSendsCard` movido pra `components/` (classes `dd-send*` → `sends-*`), fetch no hook novo `lib/use-recent-sends-feed.ts` (molde C1). **API dividida:** `/dashboard/recent-sends` morreu; nasceram `GET /samples/recent-sends` (`getSampleRecentSends` → `getRecentSampleSends`) e `GET /sale-contracts/approvals/recent-sends` (`getApprovalRecentSends`), mesmos caps 40 + cache. `DashboardLoadError` → `components/LoadError.tsx` (`LoadError`). Mobile = só hero (transitório; DSB-H6 mais urgente). Teste `dashboard-recent-sends` renomeado pra `sample-recent-sends` (método novo). Gates: typecheck/lint/format/**449 unit**/schemas/contracts verdes; knip sem regressão; build fica pro device (dev ativo na 3000); `test:integration:db` não rodado local de propósito. Docs (Visão Geral, API-e-Contratos, Contratos-Visão-Geral, Auditoria-Navegação, planos) + skills (design-system, feedback-messages) no mesmo ciclo. 📱 **validar no device** (ver §4).
- **2026-07-12** — Início do check-up geral (Flavio). Documentação do dashboard consolidada nos dois arquivos (DSB-D1). Visão Geral reconstruída a partir do código real; backlog herdado absorvido dos docs antigos.
- **2026-07-12** — **DSB-D2 implementada:** removidos os cards de pendências do dashboard (desktop + mobile); "Classificação pendente" migrou para `/samples` (só-visualização); "Cadastros pendentes" removido; `OperationModal`/`useOperationModal`/`StatCard` deletados; backend intacto. Docs (Visão Geral, API-e-Contratos, Auditoria-Navegação, Classificação-Plano, Liga-Plano) e skills (design-system, modals, feedback-messages) atualizados no mesmo ciclo. 📱 aguardando validação no device.
- **2026-07-12** — **DSB-D3 + DSB-D4 implementadas:** rearranjo do layout desktop (donut + Últimos envios lado a lado; Eventos horizontal embaixo) e redesenho do card de Eventos (1 semana, eventos dentro da célula com scroll, sem painel, navegação semanal). `lib/dashboard-calendar.ts` de quinzena→semana; CSS `.dd-events-*` reescrito. Docs (Visão Geral §4/§7.3) e skill `design-system` atualizados; DSB-H1 endereçado. Backend intacto. 📱 aguardando validação no device.
- **2026-07-12** — **DSB-D5 implementada:** card "Últimos envios" dividido em "Amostras enviadas" (física+laudo, com selo) e "Aprovações enviadas" (só aprovações, sem selo); top row passou a ter **3 cards** (donut estreito). Backend `getDashboardRecentSends` devolve `{ sampleItems, approvalItems }` (duas listas independentes, top-40 cada); `RecentSendsCard` parametrizado; `.dd-top-row` 2→3 colunas. Docs (Visão Geral §3/§4/§7.2/§8/§10) e skill `design-system` atualizados. Query-service, rota, limites e teste intactos. 📱 aguardando validação no device.
- **2026-07-12** — **DSB-D7 implementada:** datas de ação do contrato recusam fim de semana (bloqueio + 422 `WEEKEND_DATE`; `contractDate` livre) e o card de Eventos passou a mostrar só **seg–sex** (5 células), com roll dos eventos de fim de semana pro dia útil vizinho no backend. `lib/business-days.ts` novo; `sale-contract-support.js` (assert + roll); 3 modais de contrato; `dashboard-calendar`/`EventsCalendarCard`/CSS. Docs Visão Geral/skill/API/Contratos/Embarque/Aprovações. 📱 aguardando validação.
- **2026-07-12** — **DSB-D6 implementada:** navegação do **desktop** migrou da sidebar esquerda para uma **top bar horizontal branca** (só nomes, sem ícones, centralizada; logo colorido; ativo sublinhado) e a **saudação do dashboard desktop** foi removida; **"Sair"** saiu da navegação (só no menu do avatar). Mudança **cross-página**, centralizada em `AppShell.tsx` + `globals.css` (grid via `:has(.app-sidebar)`). **PROSPECTOR** mantém a sidebar. Docs `Auditoria-Navegacao-por-Papel.md` + skill `design-system` + `Dashboard-Visao-Geral.md` atualizados. Mobile intacto. 📱 aguardando validação no device.
- **2026-07-12** — **DSB-D9 implementada:** removido o **lembrete de aprovação ("a enviar")** do card de Eventos (data imprecisa + fan-out). Removido ponta a ponta: rota `approval-events`, `getDashboardApprovalEvents` (handler + service), `APPROVAL_REMINDER_SELECT`/`buildApprovalReminderEvent`/`bucketApprovalReminders` + `addDaysUtc`/`dayKeyFromDate` (support), fn no api-client, tipo `DashboardApprovalEventsResponse`, feed/estado/merge no `DashboardDesktop`, branch `contract_approval_due` no `navTabForEvent` + chip CSS. Schema/form intactos (`requiresApproval`/`approvalReminderLeadDays` ficam; aba Aprovações usa o 1º). −3 unit / −1 integração. Gates: typecheck/lint/format/test:unit (408)/knip verdes; build fica pro device (dev ativo). test:integration:db **não** rodado de propósito (truncaria os 4 contratos de demonstração do device). Docs Visão Geral/skills/Aprovações/Embarque. 📱 aguardando validação no device.
- **2026-07-12** — **DSB-D13 (check-up de correção) implementada:** rodada pré-reforma a partir da **auditoria multi-agente** (5 agentes). **C1** confiabilidade dos fetches + erro/retry (`DashboardLoadError`); **C2** payload morto (`/pending` count-only + selects de evento enxutos); **C3** testes (`dashboard-calendar.test.ts` novo/shipment/overdue — **destrava DSB-H8**); **C4** sync docs/skills + comentários; **C5** doc **`Design-Language.md`** (fundação da reforma). Resolvidos: DSB-H4/H5 (C2), DSB-H8 (C3). Escopo = correção+higiene (estrutural/UX/design → reforma). Gates verdes (**423 unit**/knip 79); build pro device. 📱 validar.
- **2026-07-12** — **DSB-D12 implementada (resolve DSB-H2):** dívida de token nos cards `dd-*` — 5 greys/inks hardcoded dos textos (`#1a2e1f`/`#71786d`/`#3a4a3f`/`#4d5c52`/`#5c6b5a`) colapsados em `var(--ink)`/`var(--muted)` da paleta (14 trocas, só `app/globals.css`). Fundos/bordas/estado/`.samples-page-v2` fora do escopo. `build` fica pro device (dev ativo na 3000). 📱 validar.
- **2026-07-12** — **DSB-D11 implementada:** novo evento de **Faturamento** no card de Eventos (feed auth-only `getDashboardInvoiceEvents` — irmão do embarque; previsto=`EMITIDO`/`invoiceDate`, atrasado, realizado=`FATURADO`/`PAGO`/`invoicedAt`). Ponta a ponta: support (`INVOICE_EVENT_SELECT`/`buildInvoiceEvent`/`bucketInvoiceEvents`) + service + backend-api + rota `/dashboard/invoice-events` + api-client + types; 3º feed no `DashboardDesktop`. Chip → aba **Contratos** com **realce** (`useContractHighlight` novo em `ContratosPanel`/`SaleContractCard`); **inerte por papel** (`navigableTabs`). Migration aditiva de índices `20260712120000`. +3 unit / +1 integração (não rodada local). Gates verdes (build + 411 unit). Docs (Visão Geral §7.3/§8, este plano) + skills `design-system`/`prisma`. 📱 aguardando validação.
- **2026-07-12** — **DSB-D10 implementada:** card de Eventos colorido por **estado** (🔵 previsto / 🔴 atrasado / 🟢 realizado — 3 cores no lugar de 6 por tipo); `state` no `DashboardCalendarEvent` (derivado do `typeKey` nos builders); pagamento ganhou prefixo `pagamento ·` no rótulo; CSS `data-type`→`data-state` (vars `--state-*` no `.dd-events-card`); **legenda** `.dd-events-legend`; estado no `aria-label`/`title` (a11y). `sale-contract-support.js`/`EventsCalendarCard.tsx`/`globals.css`/tests. Docs (Visão Geral §7.3) + skill `design-system`. Gates verdes (build + 408 unit). 📱 aguardando validação.
- **2026-07-12** — **DSB-D8 implementada:** cards de envios ("Amostras enviadas"/"Aprovações enviadas") viraram **tabela horizontal compacta** com cabeçalho de colunas sticky (amostras: `Lote·Destinatário·Tipo·Tempo`; aprovações: `Contrato·Comprador·Tempo`). `Tipo` em texto cinza (`Físico`/`Descrição`); cancelado = esmaecido + número riscado. **Desacoplado do `.spv2-card`** (classes `.dd-send-*` novas); truncamento + cabeçalho sticky + semântica de tabela; removidas classes/consts órfãs (`.dd-send-kind*`, `.dd-send-cancelled-tag`, `KIND_LABEL`, `KIND_BADGE_CLASS`). `RecentSendsCard` com prop `variant`; `DashboardDesktop` passa `variant`. Sem backend/tipos. Gates verdes (typecheck/lint/format/knip; build fica pro device — dev ativo). Docs (Visão Geral §7.2, este plano) + skill `design-system`. 📱 aguardando validação no device.
