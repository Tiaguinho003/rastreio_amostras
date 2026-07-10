# Card de Eventos do Dashboard — Plano de Trabalho

> **Status: CARD INCOMPLETO (registrado em 2026-07-07, decisão do Flavio de
> pausar aqui e seguir pra próxima página da revisão).** Decisões E1–E20
> travadas; **F0 implementada** (commits `9a66cd8` + `49f4fb7`/E20) — o card
> existe, funciona e está no dashboard, mas: (a) o **refino de layout ficou
> adiado** (EVD-P5 — proporções grade/painel e altura dos quadrados com o
> card em altura total); (b) **não existe nenhum evento** até as features da
> F1+ nascerem (painel sempre vazio, por design E7). Fonte canônica da
> feature — o resumo vive na decisão **DSH-D6** de
> `Revisao-Geral-Plano-de-Trabalho.md`.
> **Escopo da 1ª rodada:** só o card (layout, design e funcionamento
> geral). As features que GERAM eventos são atualizações grandes e virão
> depois, cada uma com rodada própria de decisões.
> **2026-07-08 — 1º tipo de evento DECIDIDO (E21–E24): pagamentos de contrato**
> (agendado por `paymentDate` / realizado por `paidAt`; escopado por papel —
> revisa E8; sem deep link na v1). Só decisão/registro — implementação = **F1**
> (sessão futura). Ver **D138** em `Contratos-Plano-de-Trabalho.md`.
> **2026-07-08 (cont.) — E25–E27:** o evento vira **expansível (acordeão)** com info +
> **atalho "Pago"** (só `FATURADO`) + **"Ver contrato"** (resolve EVD-P6). Revisa E6/E23.
> **2026-07-08 (F1 IMPLEMENTADA):** o card recebeu seu **1º tipo de evento** — pagamentos de
> contrato — **ponta a ponta**: endpoint escopado `GET /api/v1/dashboard/payment-events` (janela
> de data), feed no card, dots âmbar/verde, **acordeão** (nº·comprador·vendedor·status) com **"Pago"**
> (só `FATURADO`) + **"Ver contrato"** (`/contratos?details=`). 100% dos gates verdes + unit +
> integração. 📱 **validar no device** (cores dos dots, acordeão, fluxo "Pago", deep link; ADMIN vê
> todos × COMMERCIAL só os dele). **EVD-P5** (refino de layout) segue adiado.
> **2026-07-10 — REVISÃO DO PAGAMENTO (E28–E30 + FN1–FN7), pra alinhar os 3 eventos:** o
> evento vira **navegação pura → Financeiro** (revê E25–E27 — saem acordeão/"Pago"/"Ver
> contrato" do card), ganha **"atrasado"** (vermelho `#dc2626`), e o **Financeiro** vira a
> **casa do pagamento** (todos os contratos, chips a vencer/vencido/pago, fila por
> vencimento). **DESIGN — reverte código já implementado (E25–E27); implementação depois.**

## Contexto e objetivo

A coluna direita da linha 2 do dashboard desktop ficou vazia após as remoções
de "Últimas atividades" (2026-07-06) e "Vendas e perdas" (2026-07-07,
DSH-D3). O Flavio decidiu que ela será ocupada por **um único card de
Eventos em formato de calendário**: os dias aparecem em quadrados e, ao
clicar num dia, o card apresenta as atividades marcadas para ele.

Os eventos em si dependem de lógica e funcionalidades novas no sistema —
**ideias citadas como contexto** (nada travado): programações de embarque,
entregas de café futuro, envio marcado de aprovações. Cada uma será uma
feature própria, com modelo de dados e fluxo de criação definidos na sua
rodada.

## Decisões travadas (E1–E11, 2026-07-07)

- **E1 — Card único, altura total da coluna.** A coluna direita inteira é um
  só card, cobrindo a mesma altura dos dois cards da esquerda juntos (donut
  "Lotes disponíveis" + "Últimos envios").
- **E2 — Visão de duas semanas.** A grade mostra a semana atual + a próxima,
  com os dias em quadrados grandes (não é o mês inteiro).
- **E3 — Navegação livre com passo de 2 semanas.** Setas ◀ ▶ viram a
  "página" (2 semanas por clique), sem limite pra passado ou futuro; botão
  **"Hoje"** volta pro par semana atual + próxima.
- **E4 — Expansão em painel fixo.** Clicar num dia o **seleciona** e um
  painel fixo dentro do card (abaixo da grade) lista as atividades daquele
  dia. A grade não se reorganiza (formato escolhido em preview, no lugar do
  quadrado que cresce inline).
- **E5 — Indicador por dots coloridos.** Dia com eventos mostra pontinhos
  coloridos (1 cor por tipo de evento) no quadrado; quando não couber,
  `+N`.
- **E6 — Só visualização.** O card não cria eventos nesta fase; eventos
  nascem nos fluxos das features futuras. Criação manual pelo card fica em
  aberto (EVD-P4). _(REVISADO por E25/E26 (2026-07-08 cont.): o card ganha a
  **ação "Pago"** (atalho) nos eventos de pagamento `FATURADO` — mas continua
  **sem CRIAR** eventos.)_
- **E7 — O card nasce antes das features.** A implementação do card (grade +
  navegação + painel + estados) acontece com estado vazio ("Nenhum evento"),
  fechando o layout do dashboard; as features vão populando depois.
- **E8 — Papéis: todos veem tudo.** Os 5 papéis não-PROSPECTOR veem o card e
  os mesmos eventos (consistente com DSH-D2). Restrição por papel, se algum
  tipo de evento pedir, será decidida na feature correspondente.
- **E9 — Desktop-only por ora.** Como o "Últimos envios", o calendário nasce
  no desktop; versão mobile fica como pendência (EVD-P3).
- **E10 — Estado inicial: hoje selecionado.** O quadrado de HOJE vem
  destacado e já selecionado; o painel abre mostrando os eventos de hoje
  ("Nenhum evento hoje" quando vazio).
- **E11 — Catálogo de tipos em aberto.** Nenhum tipo de evento (nome ou cor)
  está travado — nem os exemplos do contexto. O catálogo será construído
  feature a feature (EVD-P1).

## Decisões da rodada da F0 (E12–E19, 2026-07-07)

- **E12 — Semana começa no DOMINGO** (D S T Q Q S S), calendário
  tradicional. A matemática de quinzena é própria (domingo-based, BRT,
  `lib/dashboard-calendar.ts`) — **não unificar** com o
  `computeClientWeekReference` do relatório semanal, que é segunda-based
  por regra daquele domínio.
- **E13 — Quadrado do dia: número + dots** (até 3 + `+N`); todo o detalhe
  fica no painel.
- **E14 — Painel do dia é o protagonista (~60%)**; grade compacta (~40%).
- **E15 — Rótulo do período em intervalo**: "7 – 20 de julho"; cruzando mês
  "28 de jul – 10 de ago"; ano acrescentado quando o período sai do ano
  corrente.
- **E16 — Sábados e domingos APAGADOS** (esmaecidos no cabeçalho e nos
  quadrados).
- **E17 — Dias passados iguais aos demais** (sem distinção visual —
  substitui a proposta antiga de esmaecer o passado; a navegação livre E3
  já dá acesso ao histórico).
- **E18 — Deslize horizontal** (~200ms na direção da seta) na troca de
  quinzena; `prefers-reduced-motion` vira troca seca.
- **E19 — Copy do vazio na F0**: "Nenhum evento para este dia." + nota
  menor "As programações (embarques, entregas, aprovações...) chegam nas
  próximas atualizações." — a nota é temporária da F0 e sai quando as
  features de evento chegarem.
- **E20 (revisa a altura da E1, validação no device 2026-07-07)** — o card
  ocupa a coluna direita **INTEIRA do dashboard**: do topo (altura da linha
  de pendências) até a base, e não só a altura da pilha da linha 2. As
  pendências passaram a viver dentro da coluna esquerda (`.dd-left-col`),
  com a largura dos StatCards preservada; o espaço extra do card vai todo
  pro painel do dia (E14). Commit `49f4fb7`.

## Decisões da F1 — Pagamentos de contrato (E21–E27, 2026-07-08)

**Primeiro tipo de evento real do card.** O fluxo de pagamento dos contratos (feature Contratos —
`SaleContract`, ciclo `EMITIDO → FATURADO → PAGO` + `WASH_OUT`) passa a alimentar o card. Decidido com o
Flavio (análise de 2 agentes + plan mode). **Só as decisões aqui — implementação = fase F1 (sessão
futura).** Ver `docs/Contratos-Plano-de-Trabalho.md` (**D138**).

- **E21 — Pagamento de contrato = 1º tipo do catálogo (inicia a EVD-P1).** Cada contrato vira **1 evento**
  conforme o status, em **dois sub-tipos**:
  - **Pagamento AGENDADO** — contratos **não pagos** (`EMITIDO`/`FATURADO`) no dia da **`paymentDate`**
    (data planejada de pagamento). "O que está por vir."
  - **Pagamento REALIZADO** — contratos **`PAGO`** no dia do **`paidAt`** (data real da liquidação). "O que
    já foi pago."
  - **`WASH_OUT` fora** (negócio quebrado). Ao marcar `PAGO`, o evento **deixa de ser agendado e vira
    realizado** (sai do `paymentDate`, entra no `paidAt`).
- **E22 — Escopo por papel (REVISA a E8 neste tipo).** A E8 ("todos veem os mesmos eventos") **não vale**
  para pagamentos (dado financeiro): **ADMIN** vê todos; **COMMERCIAL** só os contratos **dele** (mesmo
  escopo do Financeiro/`/contratos` — `Broker.userId` via `_resolveOwnBrokerId` + `ownContractIds`);
  **CLASSIFIER/REGISTRATION/CADASTRO** não têm contratos → **nenhum** evento de pagamento. _(Cada tipo
  futuro define o próprio escopo; a E8 passa a ser "cada tipo decide quem vê".)_
- **E23 — Sem deep link na v1.** O item segue **só-texto** (`<li>`, sem navegação — mantém a E6 e o stub
  mínimo `{id,typeKey,label}`). Clicar levar ao contrato/Financeiro = **melhoria futura (EVD-P6)**.
  _(REVISADO por E25–E27 na 2ª rodada 2026-07-08: o evento vira expansível, ganha o botão "Pago" e o "Ver
  contrato" → o deep link ENTRA na v1; EVD-P6 resolvida.)_
- **E24 — Fonte de dados (RESOLVE a EVD-P2).** Um **endpoint do dashboard** (molde do `recent-sends`, mas
  **com `actor`** para escopar) consulta o `SaleContract` por `paymentDate` (não pago) / `paidAt` (pago) na
  janela e devolve `Record<'YYYY-MM-DD', stub[]>`. Datas: `paymentDate`/`paidAt` são `@db.Date` (serializam
  `…T00:00:00.000Z`) → dayKey = `.slice(0,10)` **sem conversão de fuso** (casa com o `toDayKey`/BRT do
  `lib/dashboard-calendar.ts`). A janela pede **índice novo** em `payment_date` (+ `paid_at`) — migration na F1.

**Catálogo (EVD-P1) — 1ª entrada (proposta, a confirmar no visual da F1):** `typeKey` `contract_payment_due`
(agendado) + `contract_payment_paid` (realizado); cores dos dots **coerentes com os selos de status**:
agendado **âmbar `#eab308`** (= `EMITIDO`), realizado **verde `#15803d`** (= `PAGO`). Rótulo do item
**recolhido** (1 linha): `"{nº do contrato} · {comprador}"` (o dot distingue agendado × realizado); os
demais campos vão no **expandido** (E25).

**Segunda rodada (2026-07-08 cont.) — E25–E27: evento expansível + ação "Pago" + "Ver contrato".** A pedido
do Flavio, o evento de pagamento ganha uma **versão expandida** (info extra) com um **atalho para marcar
como pago** e um **link para o contrato**. Só decisão — implementação = F1.

- **E25 — Evento expansível (acordeão) no painel do dia (REVISA E6/E23).** Clicar num evento no painel o
  **expande** (acordeão), revelando **nº do contrato · comprador · vendedor · status** + as ações (E26/E27).
  O item recolhido segue enxuto (1 linha, dot + rótulo). O card **ganha interação/ação** — revisa a E6 ("só
  visualização"; segue **sem CRIAR** eventos) e a E23 ("só-texto na v1"). **O stub do evento cresce** além
  de `{id,typeKey,label}`: passa a carregar `contractId`, `status`, `version` (p/ o "Pago") +
  `comprador`/`vendedor` (p/ exibir) — promover pro `lib/types.ts` na F1.
- **E26 — Ação "Pago" no evento (atalho do Financeiro).** O botão **"Pago"** aparece **só nos eventos
  `FATURADO`** (agendado) — os únicos pagáveis (D106: pagar só após faturar; o "Faturar" fica no
  `/contratos`, D137). Reusa o **`SaleContractLifecycleDialog`** (ação `pay`, mesmo do Financeiro/D137):
  confirma, exige `expectedVersion`, grava o marco `SaleContractStatusLog` (D123). **Escopo = E22** (ADMIN
  qualquer; COMMERCIAL só os dele). Ao pagar, o feed é **re-buscado** (o evento migra de agendado
  `paymentDate` → realizado `paidAt`, podendo mudar de dia). **O "Pago" do Financeiro (D137) CONTINUA** — o
  dashboard é um **atalho adicional** (2 pontos de entrada, mesmo dialog).
- **E27 — "Ver contrato" no evento (RESOLVE a EVD-P6; revisa E23).** No expandido, um **link/botão "Ver
  contrato"** leva ao **`/contratos` → Detalhes** do contrato (via `contractId`, já carregado pro "Pago").
  Vale pra **todos** os eventos de pagamento (agendado e realizado). Como o feed é escopado (E22), o link
  sempre aponta pra um contrato que o usuário acessa. Fecha o deep link adiado pela E23.

## Revisão do Pagamento — alinhamento com Embarque/Aprovação (E28–E30 + FN1–FN7, 2026-07-10)

> **Gatilho.** Depois de desenhar a Aprovação (sub-aba = casa, dashboard = caminho) e o
> Embarque (navegação pura + atraso + portão), o Flavio pediu para **revisar o Pagamento** — o
> 1º e **único evento já implementado** (F1) — para que os **três eventos do dashboard fiquem
> alinhados**. Diferente dos outros dois, aqui a revisão é **do código real contra o padrão
> firmado**. O Pagamento não ganha página nova: a casa dele é o **Financeiro** (existente, no
> hub `/contratos`). **DESIGN — reverte parte do que está implementado (E25–E27); implementação
> depois.**

**Já estava alinhado (mantém):** o "Pago" já abre **seletor de data** (default hoje, editável)
= padrão do `shippedAt` (EMB27); o **realizado** (verde) fica no histórico do calendário; o
**escopo por papel** (E22 — ADMIN todos / COMMERCIAL os seus; operacionais não veem pagamento)
é **diferença proposital** (dado financeiro) e **fica**.

### Decisões do evento (dashboard)

- **E28 — O evento de pagamento vira NAVEGAÇÃO PURA → Financeiro (revê E25/E26/E27).** Como o
  Embarque (EMB26), o evento no card deixa de ter **acordeão**, **"Pago"** e **"Ver contrato"**:
  fica **dot + rótulo** e, ao tocar, **leva pro Financeiro** (`/contratos?tab=financeiro` — abre
  a aba; destacar o contrato tocado se der). O **"Pago" passa a existir só no Financeiro**
  (deixa de ser 2ª porta). Motivo reforçado: o **portão do embarque (EMB28)** faz "marcar PAGO
  sem embarcar" abrir um **modal** — que no dashboard violaria a regra "sem modal no card"
  (Embarque); com o "Pago" só no Financeiro, o portão mora num lugar só. _(Reverte E25/E26/E27,
  que estão implementados na F1.)_
- **E29 — O pagamento ganha o "atrasado" (espelha o Embarque).** Um pagamento **vencido**
  (passou o `paymentDate` sem pagar, EMITIDO/FATURADO) deixa de pintar âmbar igual a um a
  vencer: vira **vermelho `#dc2626`** a partir do **dia seguinte** ao vencimento. É o **3º
  sub-tipo** do calendário (`typeKey` proposto **`contract_payment_overdue`**). **Vermelho =
  convenção "atrasado" cross-type** (pagamento + embarque; o rótulo e o escopo distinguem). A
  **fila durável de vencidos** vive no **Financeiro** (FN). _(Hoje o CSS reserva o vermelho de
  propósito — passa a ser usado.)_
- **E30 — Nit: o seletor do "Pago" trava em `máx hoje`.** Hoje aceita data futura; alinha com o
  `shippedAt` do embarque (EMB27) — não se paga no futuro.

### A casa do pagamento — desenho do Financeiro (FN1–FN7)

O Financeiro (sub-aba de `/contratos`, restrita a `FINANCEIRO_ROLES`) deixa de ser só
"corretagem a receber" e vira **a casa do pagamento**: hospeda **todos os contratos** (no
escopo do papel — ADMIN todos / COMMERCIAL os dele), com **lente primária = status de
pagamento** (a corretagem continua exibida).

- **FN1 — Estados (chip derivado, sem enum):** **a vencer** (não pago, `paymentDate` ≥ hoje —
  âmbar `#eab308`) · **vencido** (não pago, `paymentDate` < hoje — vermelho `#dc2626`) · **pago**
  (PAGO — verde `#15803d`). Cores = **as mesmas dos dots do calendário** (coerência
  evento↔página). _Edge:_ contrato sem `paymentDate` = "a vencer" sem data (nunca vira vencido).
- **FN2 — Washout = 4º chip "cancelado" (cinza), não some** (o Flavio quis "todos os
  contratos").
- **FN3 — O card:** chip · nº · comprador · **vencimento** (`paymentDate`; "pago em `paidAt`"
  quando pago) · **total + corretagem** · ação. Dados financeiros **aparecem** (aba restrita).
  Ação = **[Pago]** só em FATURADO (a vencer/vencido) + **[Ver contrato]** sempre.
- **FN4 — Ordem: por vencimento crescente** (vencidos no topo → a vencer mais próximo); pagos e
  cancelados ao fim. Fila de trabalho, como o Embarque.
- **FN5 — Filtros:** **Todos · A vencer · Vencido · Pago · Cancelado** + busca por **nº,
  comprador ou corretor**.
- **FN6 — Cabeçalho:** mantém o **"Total a receber"** (corretagem) e acrescenta um indicador de
  **vencidos** ("N vencidos · R$ X").
- **FN7 — "Pago" + portão + nit:** **[Pago]** (FATURADO) abre o seletor (default hoje, **máx
  hoje** — E30) com o **portão EMB28** (exige embarque e não embarcou → modal só com **[Confirmar
  embarque]** → segue direto pro pagamento). O "Pago" do dashboard sai (E28).

**Revisadas:** E25/E26/E27 → **revertidas** pelo E28 (o dashboard não age mais no pagamento);
E23 (deep link) volta a "toca → Financeiro"; o catálogo (EVD-P1) ganha a 3ª cor
(`contract_payment_overdue`, vermelho). **Escopo E22 mantido.** Tudo **DESIGN** — diverge do
código atual (F1 implementada com acordeão/"Pago"/sem atraso).

## Propostas de design (NÃO travadas — defaults da implementação, sujeitos à validação visual)

- Shell no padrão dos cards da linha 2: branco, radius 20, borda
  `rgba(112,130,103,0.22)`, sombra `var(--dd-card-shadow)`. Header: título
  "Eventos" + rótulo do período embaixo (E15); à direita o grupo de
  navegação ◀ `Hoje` ▶ (no lugar do tile de ícone dos outros cards).
- Quadrados de dia são `<button>` reais: press-effect canônico (scale, sem
  mudança de cor — skill button-press-effect), `aria-pressed` na seleção,
  `aria-current="date"` em hoje, roving tabindex com setas (±1 dia
  horizontal, ±7 vertical).
- Hoje: anel verde da marca (`inset box-shadow var(--brand-green)`);
  selecionado: preenchimento `#e8f1ec`; virada de mês: "1 ago" no quadrado.
- Painel do dia com scroll interno; itens de evento seguirão o molde de
  minicard do dashboard (a definir com o catálogo EVD-P1).
- Sem skeleton na F0 (nada carrega); estados de loading nascem com o fetch
  da F1. Deslize E18 coberto no bloco `prefers-reduced-motion` do
  dashboard.

## Fases

| Fase   | Tema                                                                                                                                                                                                                                                                                                                                                     | Status                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **F0** | Card shell no dashboard desktop: grade 2 semanas + navegação + painel do dia + vazio E19, SEM backend de eventos (lista sempre vazia)                                                                                                                                                                                                                    | 📱 implementada (`9a66cd8`); validar no device  |
| **F1** | **Pagamentos de contrato** (E21–E27, 2026-07-08): endpoint escopado + feed + dots + **evento expansível** (nº·comprador·vendedor·status) com atalho **"Pago"** (só FATURADO) + **"Ver contrato"**                                                                                                                                                        | 📱 implementada (2026-07-08); validar no device |
| **F2** | **Aprovação** (lembrete de envio): endpoint `GET /api/v1/dashboard/approval-events` (fan-out por intervalo, de hoje pra frente); dot **laranja `#f97316`** `contract_approval_due`, rótulo "a enviar · nº · comprador"; expandido com **"Gerar aprovação"** (reusa `ApprovalLabelModal`); **todos os não-PROSPECTOR veem** (AP10). Some ao gerar/faturar | 📱 implementada (2026-07-09); validar no device |
| F3+    | Outros tipos de evento (embarques, entregas… — a definir; cada um = rodada própria de decisões + backend + catálogo)                                                                                                                                                                                                                                     | ⬜                                              |

## Pendências

- **EVD-P1** — Catálogo de tipos de evento + cores dos dots. **1ª entrada (E21):** pagamentos de
  contrato (`contract_payment_due` amarelo `#eab308` / `contract_payment_paid` verde `#15803d`).
  **2ª entrada (F2, 2026-07-09):** **lembrete de aprovação** (um só sub-tipo, "a enviar") —
  dot **laranja `#f97316`** (decidido; distinto do amarelo `#eab308` do pagamento agendado, regra E5 =
  1 cor por tipo; laranja ≠ vermelho → sem falso "atrasado", coerente com AP6). `typeKey`
  `contract_approval_due` (**implementado na F2, 2026-07-09**). **Rótulo do item recolhido =
  "a enviar · nº · comprador"** (AP15 + distinção; nº/comprador/vendedor completos no expandido — AP7).
  Decisões em `Aprovacoes-Plano-de-Trabalho.md` (AP6/AP7/AP15). **Demais tipos seguem em aberto** (E11).
- **EVD-P2** — Modelo de dados / fonte dos eventos. **✅ RESOLVIDA (E24)** para o tipo pagamento: **endpoint
  do dashboard escopado** consultando o `SaleContract` (sem tabela nova). _(Tipos futuros podem ter fonte
  própria — reabrir por tipo.)_
- **EVD-P3** — Versão mobile do calendário (E9: desktop-only por ora).
- **EVD-P4** — Criação manual de evento pelo card (E6: fora desta fase).
- **EVD-T1** — Helpers de `lib/dashboard-calendar.ts` (quinzena, dayKey,
  rótulos) sem unit test: o `node --test` do projeto não roda TS. Cobrir
  quando houver infra de teste front (ou na F1, se a matemática migrar pro
  backend do endpoint).
- **EVD-P5** — **Refino de layout do card ADIADO** (Flavio, 2026-07-07,
  após o E20 deixar o card em altura total): proporção grade × painel,
  altura dos quadrados e demais ajustes visuais serão retomados depois —
  "layout faremos depois". Retomar junto com a validação no device.
- **EVD-P6** — Deep link do evento. **✅ RESOLVIDA (E27, 2026-07-08 cont.):** o card expandido ganha um
  **"Ver contrato"** → `/contratos` Detalhes (via `contractId` no stub, já carregado pro "Pago").
  _(✅ **implementado na F1**, 2026-07-08: `/contratos?details=<id>` + `<Suspense>`.)_

## Histórico

- **2026-07-07** — Doc criado. Decisões E1–E11 travadas com o Flavio em 3
  rodadas de perguntas (12 respostas) durante o ciclo DSH da Revisão Geral
  (sessão S6 do doc da revisão). Nenhuma implementação iniciada.
- **2026-07-07 (cont.)** — Decisões E12–E19 travadas (2 rodadas, 8
  respostas) e **F0 implementada** (commit `9a66cd8`): helpers
  `lib/dashboard-calendar.ts`, componente
  `components/dashboard/EventsCalendarCard.tsx`, CSS `dd-events-*` e wiring
  no `DashboardDesktop` (coluna direita da linha 2). 100% front — sem
  endpoint; o seam da F1 é a prop `events`
  (`Record<'YYYY-MM-DD', DashboardCalendarEventStub[]>`, tipo local do
  componente). Gates verdes; aguardando validação no device.
- **2026-07-07 (validação)** — Flavio pediu o card mais alto → **E20**: a
  coluna direita inteira, incluindo a altura das pendências (`49f4fb7`).
- **2026-07-07 (pausa)** — Flavio decidiu **pausar o card aqui** e seguir
  pra próxima página da Revisão Geral: status marcado como **INCOMPLETO**
  (refino de layout adiado = EVD-P5; eventos só na F1+). Espelhado na
  pendência DSH-P6 do doc da revisão.
- **2026-07-08** — **1ª feature de evento DECIDIDA (E21–E24): pagamentos de contrato.** Análise (2 agentes:
  o card + a plumbing do dashboard) + plan mode (3 perguntas). Ambos os sub-tipos (agendado `paymentDate` /
  realizado `paidAt`); escopo por papel (revisa E8); sem deep link (v1). **EVD-P2 resolvida, EVD-P1
  iniciada, EVD-P6 nova.** Só decisão/registro — **sem código** (implementação = F1). Ver **D138** no doc de
  Contratos.
- **2026-07-08 (cont.)** — **2ª rodada de decisões (E25–E27):** o evento de pagamento vira **expansível**
  (acordeão) com **nº · comprador · vendedor · status**, um **atalho "Pago"** (só `FATURADO`, reusa o
  `SaleContractLifecycleDialog`/D137, escopo E22, re-busca após pagar) e um **"Ver contrato"** (→
  `/contratos` Detalhes — **resolve a EVD-P6**). Revisa E6 (o card ganha ação; segue sem criar eventos) e
  E23 (interação/deep link entram na v1). Só decisão — implementação = F1.
- **2026-07-08 (F1 implementada)** — Pagamentos de contrato no card, ponta a ponta. **Backend:** migration
  `20260708120000` (índices `[status, payment_date]` + `[status, paid_at]`),
  `SaleContractService.getDashboardPaymentEvents({from,to}, actor)` (gate `FINANCEIRO_ROLES`; ADMIN todos ×
  COMMERCIAL só os seus via `_resolveOwnBrokerId`; 2 queries — agendado `EMITIDO/FATURADO` no `paymentDate`,
  realizado `PAGO` no `paidAt`; `WASH_OUT` fora), helpers puros `buildPaymentEvent`/`bucketPaymentEvents`
  em `sale-contract-support.js`, handler + rota `GET /api/v1/dashboard/payment-events`. **Front:**
  `EventsCalendarCard` ganhou `onWindowChange` (busca só a quinzena visível — sem carregar todos os
  contratos) + **acordeão** por evento com "Pago" (reusa `SaleContractLifecycleDialog`/D137) e "Ver
  contrato"; `DashboardDesktop` faz o fetch (gate `canPay` + desktop) e reabre o feed após pagar (evento
  migra agendado→realizado); `/contratos` ganhou `?details=<id>` + `<Suspense>`. Dots âmbar/verde.
  Gates verdes + unit (`buildPaymentEvent`/`bucketPaymentEvents`) + integração (escopo/janela/WASH_OUT/
  dayKey). 📱 falta validação no device. Ver **D138** no doc de Contratos.
- **2026-07-09 (F2 implementada) — 2º tipo de evento: lembrete de aprovação.** Plan mode com análise (3
  Explore + design). **Backend:** endpoint SEPARADO do de pagamentos (visibilidade diferente) —
  `SaleContractService.getDashboardApprovalEvents({from,to}, actor)` (só `assertAuthenticatedActor`, **SEM
  gate de papel** — todos os não-PROSPECTOR; pendente = `requiresApproval` + `EMITIDO` + anti-join `groupBy`
  em `approval_label_log` "sem etiqueta"); helpers puros `buildApprovalReminderEvent` (id **namespaced**
  `reminder:` — evita colisão de key com o pagamento do mesmo dia) + `bucketApprovalReminders` (**fan-out
  1→N**: pinta o dot em cada dia de `[max(hoje, invoiceDate−lead), to]` — **só de hoje pra frente**);
  handler + rota `GET /api/v1/dashboard/approval-events`; migration `20260709130000` (índice
  `[requiresApproval, status, invoiceDate]`). **Front:** `EventsCalendarCard` ganhou a prop
  `onGerarAprovacao` + o botão **"Gerar aprovação"** no acordeão (só `contract_approval_due`); dot laranja
  `#f97316` (CSS); `DashboardDesktop` busca o feed de aprovação (mesma janela, **sem `canPay`**), **merge
  client-side** com os pagamentos, e abre o `ApprovalLabelModal` pré-preenchido (molde do `openApproval` do
  /contratos) — ao gerar, o lembrete some (passa a ter linha no log). Rótulo "a enviar · nº · comprador".
  Gates verdes + unit (`buildApprovalReminderEvent`/`bucketApprovalReminders`) + integração
  (pendente/anti-join/visibilidade por papel). 📱 falta validação no device. Ver F2/AP6-AP15 no doc de
  Aprovações.
- **2026-07-10 (Revisão do Pagamento — alinhamento; E28–E30 + FN1–FN7).** Depois da Aprovação e
  do Embarque, o Flavio pediu pra alinhar o Pagamento (1º e único evento já implementado) aos
  outros dois. **E28:** o evento vira **navegação pura → Financeiro** (revê E25–E27 — saem
  acordeão/"Pago"/"Ver contrato" do card; "Pago" só no Financeiro; o portão EMB28 mora só lá,
  sem modal no card). **E29:** ganha **"atrasado"** (vermelho `#dc2626`, dia seguinte ao
  `paymentDate`, EMITIDO+FATURADO; `typeKey` `contract_payment_overdue`; vermelho = convenção
  cross-type com o embarque). **E30:** o seletor do "Pago" trava em máx hoje. **Financeiro =
  casa do pagamento (FN1–FN7):** todos os contratos no escopo, chips **a vencer/vencido/pago**
  (+ cancelado), card com vencimento + total + corretagem, ordem por vencimento crescente,
  filtros, cabeçalho com "N vencidos", "Pago" (FATURADO) + portão. Escopo E22 mantido. **DESIGN —
  reverte código implementado (E25–E27); implementação depois.** Só decisão/registro — sem código.
