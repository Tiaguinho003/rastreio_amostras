---
name: design-system
description: Use this skill whenever building, adjusting, or reviewing any page, component, or visual element in this PWA. Ensures consistencia visual com a linguagem de design estabelecida no dashboard e login.
---

# Design System — Linguagem Visual do App

Este documento define a linguagem visual do app. Toda pagina e componente DEVE seguir estes padroes para garantir consistencia. Nao inventar estilos novos — usar os padroes documentados aqui.

> **⚠️ TRANSICAO EM CURSO (FV, 2026-07): o app esta migrando pagina a pagina para a linguagem
> INSTITUCIONAL do §0 abaixo.** `/cadastros` (desktop) e o piloto CONCLUIDO e o EXEMPLO canonico.
> Ao redesenhar uma pagina no ciclo da FV, o §0 MANDA e sobrepoe o que os §§1–13 disserem
> (eles descrevem o app pre-FV e continuam validos SO para paginas ainda nao migradas — nao
> "corrigir" uma pagina legada pro padrao antigo nem misturar os dois numa pagina migrada).

## 0. FV institucional — o kit do piloto `/cadastros` (padrao das proximas paginas)

Direcao travada pelo Flavio (RD12–RD14 em `docs/Redesign-Plano-de-Trabalho.md`; historico
rodada-a-rodada na §2.6 do mesmo doc). Motivacao: aspecto "institucional" de SaaS — neutro,
denso, sem infantilidade. O kit abaixo foi construido e conferido no `/cadastros` desktop e e o
molde das proximas paginas do ciclo (`/samples` → `/relatorios` → `/users`+`/profile` →
`/contratos`+`/embarques` → globais). Mobile de cada pagina entra na E2 dela.

### 0.1 Fundamentos

- **Fonte: Inter** (`--font-sans`, global desde a E1). Poppins segue carregada SO para as pecas
  de informativo (`--font-family-story`, lida pelo canvas — ver gotcha do next/font na skill).
- **Tokens `--fv-*`** no `:root` (espelho legivel: `docs/Design-Language.md` §1.5): canvas
  `#f6f7f6`, surface branca, hairlines `--fv-line`/`--fv-line-strong`, radius **10px**
  (`--fv-radius`; sm 8 / lg 12), CTA **verde-escuro `--fv-cta` `#173c30`** (hover
  `--fv-cta-strong`), chips pastel `--fv-chip-{green,amber,red,gray,blue}-{bg,fg}`, acento frio
  `--fv-blue`. _(Nomes `fv-` sao do piloto; promocao/renomeacao pro vocabulario definitivo fica
  pra consolidacao final.)_
- **Cards/superficies**: branco definido por **hairline + sombra minima** — morrem o gradiente
  quente, a sombra tripla e o radius 14–20 "fofo". Cor SO semantica e em doses pequenas (chips,
  icones de KPI); o verde da marca vira o "preto institucional" dos CTAs, nao fundo decorativo.
- **Botoes**: preenchido verde `--fv-cta`, texto branco, radius 10, press = so scale
  (button-press-effect); botoes de modal (`.app-modal-submit/-secondary`) perderam a pilula →
  radius 10 (global, app inteiro, desde a rodada 1). Botoes de adicionar sao NOMEADOS
  ("+ Adicionar filial", nunca "+" solto) — molde `.fv-cd-add-btn`.
- **Chips de status pastel** (fundo suave + texto colorido) sao o padrao de status. `/cadastros`
  usa status UNICO por linha (Completo verde / Incompleto ambar / Cancelado vermelho).
- **Modais e sheets BRANCOS** (global desde a rodada 1; o vidro bege morreu).

### 0.2 Chrome global desktop (RD13) e anatomia de pagina (RD14)

- Chrome: **sidebar UNICA** (logo completo centralizado + itens com sub-itens `?tab=` +
  footer Perfil/Ajuda) + **topbar** com titulo da secao + sino + perfil (nome+papel+chevron).
  Vale pra todas as paginas desktop nao-PROSPECTOR. (AppShell NAO pode usar `useSearchParams` —
  `activeSubTab` chega por prop da pagina.)
- Anatomia da pagina de listagem (molde `/cadastros`): **titulo grande + CTA** ("+ Novo
  cliente"; FAB desktop morre) → **KPI row** (cards brancos hairline, icone traco+borda
  colorido, mini-metricas com setas) → **toolbar** (busca + filtros) → **TABELA**
  (`table-layout: fixed` + colgroup, avatar de iniciais PJ quadrado/PF circulo, chips de
  status, icones de contato; linha abre o detalhe) → scroll infinito. **Filtros = side-sheet
  400px** (`.fv-filter-sheet`). Menu **⋯** = acoes profundas por URL (`?cliente=<id>&acao=…`).

### 0.3 Detalhe = drawer de perfil (620px)

Molde do detalhe de recurso na FV (referencia "Staff details"): `DetailOverlay` 620px com
**hero fixo** (avatar de iniciais + ponto de status, nome, chips de papeis, contato COPIAVEL,
fileira de acoes redondas com menu ⋯) + **abas** `.fv-cd-tabs` (sublinhado RETO — o reset
global `button{border-radius:10px}` curvaria o border-bottom: por `border-radius: 0` na aba) +
conteudo em coluna unica; grafico de LINHAS (SVG manual, stroke 1.4) no lugar de donut;
`scrollbar-gutter: stable` no body (trocar de aba nao desloca o conteudo). **Backdrop
BLOQUEANTE** (pagina escurecida e nao-clicavel atras — no cliente o "peek swap" morreu de
proposito; avaliar por pagina).

**Pecas genericas do molde** (sem escopo, use estas em pagina nova): `.fv-tabs`/`.fv-tab` (a
faixa de abas), `.fv-iconbtn` (+ `.fv-iconbtn-dots`) para as acoes redondas do hero e
`.fv-more-wrap`/`-menu`/`-item`/`-empty` para o ⋯. Os `.fv-cd-*` do cliente sao aliases com a
MESMA geometria, mantidos ate a consolidacao. O que muda por recurso e so o miolo do hero:
cliente = avatar de iniciais; lote = **miniatura da foto da classificacao** (108×72, retangulo,
placeholder tracejado quando nao ha foto).

### 0.4 Modais de dentro do detalhe = PAINEIS LATERAIS

TODOS os modais alcancaveis do drawer (criar/detalhe de sub-recursos, editar, preview,
"novo anexo") viram side-sheets `stacked` com **seta ← na borda** — molde completo no §8
"Paineis do detalhe" abaixo. Avisos/confirms continuam CENTRAIS mas centrados **dentro da
faixa do painel** (`.fv-panel-scrim`). Sucesso = **check canonico** (`SuccessCheckOverlay`,
ver skill `feedback-messages` — frases "... com sucesso" morreram). Modo VIEW de um detalhe
espelha o form de edicao (campos com borda `.cudm-view-value` na MESMA ordem — view↔edit sem
a pagina mudar de cara).

## 1. Estrutura de Pagina

Toda pagina autenticada segue o padrao **Fundo Verde (app-shell) + Header Transparente + Sheet Bege**:

### Fundo Verde (app-shell)

- O verde vem do `app-shell-main.is-dashboard-route`: `linear-gradient(180deg, #1f5d43 0%, #14372a 100%)`
- O topo DEVE ser `#1f5d43` (mesma cor do `theme-color` e da status bar)
- Toda pagina que usa este padrao deve ser adicionada como `isLayeredRoute` no AppShell

### Header da Pagina

- **background: transparent** — NUNCA usar gradiente proprio no header. O header herda o verde do app-shell
- `align-items: flex-end` para posicionar conteudo na base da area verde, proximo ao sheet bege
- `padding-top` inclui `env(safe-area-inset-top)` + espacamento generoso para criar a area verde visivel
- Conteudo especifico da pagina (titulo, botao voltar, avatar, etc)

### Sheet de Conteudo (area bege)

- Fundo quente: `linear-gradient(180deg, #fdf9ec 0%, #f4f0e7 100%)`. **Excecoes aprovadas (fundo claro frio)**: (1) dashboard mobile do ADMIN — **BRANCO `#ffffff`** no sheet (2026-06-22, `.dashboard-mobile .dashboard-sheet`; era `#f4f6f5`); o PROSPECTOR segue em `#f4f6f5` (`.prospector-dashboard .dashboard-sheet`, divergiu do admin); (2) pagina de **Lotes `/samples`** — **BRANCO puro `#ffffff`** no sheet **e** nos cards (`.spv2-card-wrap`, sai o gradiente quente), com **sombra reforcada** pra definir as bordas sobre o branco e o recuo lateral redistribuido (pouco no sheet, mais no `.spv2-list-scroll`) pra a sombra nao ser decepada (2026-06-16, escopado `.samples-page-v2:not(.informe-commercial-page)` — NAO afeta o `InformeCommercialPage`/shell reusado); (3) pagina de **Clientes `/clients`** — **BRANCO puro `#ffffff`** no `.clients-v2-sheet` **e** nos cards (`.cv2-card`, sai o gradiente quente) com a mesma **sombra reforcada**, e o indicador alfabetico (`.cv2-section-divider`) — desde 2026-06-18 um **chip flutuante** branco (sem a linha, so a letra), ancorado a esquerda (`align-self:flex-start`), com sombra reforcada, cantos arredondados e `z-index:5` (acima da barra de status do card `.cv2-card::before`, que e `z-index:1`) pra a letra nao ser "furada" pela barra ao rolar por baixo; antes (2026-06-17, batch de alinhamento de /clients ao /samples) era faixa branca de largura total. (4) pagina de **Informe** comercial — **BRANCO puro `#ffffff`** no `.samples-page-v2-sheet` **e** nos cards (`.rsm-card`, sai o gradiente quente) com a mesma **sombra reforcada**, escopado `.informe-commercial-page` (2026-06-18, espelhando /samples). (5) pagina de **Resumo** (`/resumo`, informes de visita) — **BRANCO puro `#ffffff`** no sheet (`.sdv-content.informe-content.rsm-content`) **e** nos cards (`.rsm-card`) com a mesma **sombra reforcada** + recuo lateral redistribuido (pouco no sheet, mais no `.rsm-feed`), escopado `.rsm-content` (2026-06-18, mantem o shell `.sdv-page`). (6) pagina de **Perfil** (`/profile`) — **BRANCO puro `#ffffff`** no sheet (`.sdv-content.stg-content`) **e** nos cards (`.sdv-card.stg-card`, sai o gradiente quente) com a mesma **sombra reforcada**; os campos (`.stg-field-row`) saem do bege pra **cinza-frio claro `#f4f5f7`** (2026-06-19, escopado, mantem o shell `.sdv-page`). `/samples`, `/clients`, `/informe`, `/resumo`, `/profile` e o **dashboard** usam sheet branco. **2026-06-22: o FUNDO DE PAGINA (`--mobile-page-bg-base` + `html`) virou branco `#fff`** (era gradiente bege), desktop e mobile, a pedido do usuario — a regra "nunca `#fff` puro" foi superada. Sheets de paginas ainda nao migradas seguem no bege quente
- `border-radius: 20px 20px 0 0` — bordas arredondadas no topo criando o efeito 3D sobre o verde
- `padding-bottom` respeita tabbar: `calc(var(--app-safe-area-bottom, env(safe-area-inset-bottom)) + var(--mobile-tabbar-clearance))` — usar a CSS var sincronizada (ver skill `responsive` §4), nunca `env()` direto. **Excecao**: list pages com sheet rolavel (`/samples`, `/clients`) movem o clearance pro container de scroll e deixam o conteudo rolar por tras da tabbar flutuante — ver skill `responsive` §5
- O sheet ocupa o restante da tela com `flex: 1`

### Variante: dashboard mobile do ADMIN (redesign 2026-06, mockup)

Overrides escopados sob `.dashboard-mobile` em `app/globals.css` (bloco "Dashboard mobile (admin) — redesign 2026-06") — as classes base sao compartilhadas com o prospector — cujo **dashboard ESPELHA o do admin desde 2026-06-18** (overrides proprios sob `.prospector-dashboard` atualizados pros mesmos valores: sheet `#f4f6f5`, hero grande `clamp(2.3-3rem)` + avatar translucido, cards de contagem brancos flat + chip; ver bloco do prospector abaixo). So a **busca por cliente** e o **FAB** seguem especificos dele. Componente: `DashboardMobile.tsx`. **Desde DSB-D14 (2026-07-14) o dashboard mobile do admin e SO o hero** (o donut "Lotes disponiveis" foi apagado do sistema e o sheet saiu do JSX; estado transitorio ate o calendario chegar ao mobile — DSB-H6). _(O card "Ultimas atividades" — `RecentActivityListMobile` — foi REMOVIDO em 2026-07-06 junto com a rota/backend do feed.)_

- **Hero**: saudacao grande em 2 linhas (label `clamp(1.25-1.5rem)` w400; nome `clamp(2.3-3rem)` **w700**) + papel com escudo `#7eccae`; verde liso vindo do shell (sem textura no proprio `.dashboard-hero`, continuo com a area da busca — sem emenda na borda de baixo do hero); avatar do menu (`.header-avatar-trigger .user-avatar`) translucido `rgba(255,255,255,0.18)` com iniciais brancas (`!important` por causa do backgroundColor inline do UserAvatar)
- **Busca**: pill branca solida radius 999px, input mais alto, inteira sobre a area verde. Lupa segue A DIREITA (diverge do mockup de proposito: o botao vira o CTA verde de submit no estado `.has-input` — move-lo quebraria a interacao). Estruturalmente ela NAO vive no hero: e um irmao no fluxo do `.dashboard-scroll`, entre o hero e o sheet (ver scroll abaixo)
- **Scroll simples da pagina** (so o admin mobile): hero (saudacao + avatar) e sheet vivem dentro do `.dashboard-scroll` (`flex: 1; min-height: 0; overflow-y: auto`, momentum + `overscroll-behavior: contain`) e **rolam juntos** — nada fica fixo no topo. O sheet fica no fluxo normal (`.dashboard-sheet` `overflow: visible; flex: 1 0 auto` pra preencher a tela quando o conteudo e curto). O `.dashboard-page` continua `overflow: hidden; height: 100%` (so o `.dashboard-scroll` rola). _(A **busca por lote** no hero do admin mobile foi REMOVIDA a pedido do usuario em 2026-06-16 — o `SampleSearchField` saiu do `DashboardMobile`; as classes `.dashboard-hero-search`/CSS seguem em uso pelo prospector (busca por cliente, ver abaixo). Antes disso ja se removera o efeito antigo "cobrir a busca" — busca sticky + sheet por cima + recorte arredondado — em 2026-06-15.)_
- **Cards de pendencias (mobile): REMOVIDOS em 2026-07-12 (DSB-D2).** Os op-cards "Lotes"/"Clientes" (classificacao pendente + cadastros incompletos) sairam do `DashboardMobile`. "Classificacao pendente" virou card so-visualizacao na pagina de Lotes (`/samples`, classe `.spv2-pending-stat`); "Cadastros pendentes" foi removido por completo. As classes `.dashboard-operation-card`/`.dashboard-operations-grid`/`.dashboard-operation-badge` seguem VIVAS pelo **PROSPECTOR** (mesmo visual, cards de contagem de visitas). Ver `docs/Dashboard-Plano-de-Trabalho.md`.
- **Lotes disponiveis (donut): APAGADO DO SISTEMA em 2026-07-14 (DSB-D14)** — `SalesAvailabilityCard.tsx`, hook, rota, backend, tipo, CSS exclusivo (`.sales-card-detail-button*`, `.sales-card-aside`, `is-compact`) e teste sairam. _(O ultimo consumidor do padrao `.sales-card`/`.sales-chart-*` — o donut do detalhe do cliente — morreu na rodada 3 da FV (2026-07-21): o `ClientCommercialSummaryCard` virou **grafico de LINHAS 6 meses** (`.fv-cd-chart-*`, SVG manual, stroke 1.4; Perdido saiu da UI) e o CSS `.sales-*`/`.ccs-*` foi DELETADO. Sobram so 2 hooks de animacao inofensivos.)_
- **Ultimas atividades**: card REMOVIDO em 2026-07-06 (componentes, CSS, rota `/api/v1/dashboard/recent-activity` e backend sairam). De `lib/dashboard-activity.ts` sobrou so `formatRelativeTime` (renomeado pra `lib/relative-time.ts` na revisao DSH 2026-07-07; usado pelo modal de Detalhes do contrato e pelos cards de envios)

### Paginas sem header verde

- Paginas como settings, detalhes de amostra podem usar header mais compacto
- **2026-06-22: o fundo de pagina virou BRANCO `#fff`** (`--mobile-page-bg-base` + `html`), desktop e mobile, a pedido do usuario. Sheets ja migrados pro branco: `/samples`, `/clients`, `/informe`, `/resumo`, `/profile` e o **dashboard**; paginas nao migradas mantem o sheet bege quente `#fdf9ec` (ver §1, Sheet de Conteudo)
- Excecao: areas de formulario/cards internos podem usar `#ffffff`

### Variante: dashboard DESKTOP (>=901px)

- **Arquitetura:** `app/dashboard/page.tsx` renderiza `DashboardMobile` + `DashboardDesktop` JUNTOS (nao-prospector); o CSS alterna por `@media (min-width:901px)` (`.dashboard-desktop`/`.dashboard-mobile` viram `display:contents`/`none`). **DSB-D14 (2026-07-14):** o mobile nao busca nada (so o hero); o desktop busca APENAS os 3 feeds de eventos do calendario (guard `matchMedia` + listener `change` + throttle 30s, so o breakpoint ativo busca). O hook `useDashboardData` e o fetch `getDashboardRecentSends` foram removidos. CSS do desktop e **desktop-first na base** + mobile em `@media (max-width:900px)`.
- **Chrome (DSB-D15 + DSB-D16, 2026-07-14):** o desktop dos 5 papeis nao-PROSPECTOR tem **TOP BAR GLOBAL + SIDENAV lateral em 2 colunas + canvas verde-clarinho** (referencia visual do usuario):
  - **TOP BAR GLOBAL** `.app-topbar` (DSB-D16): faixa branca UNICA atravessando o viewport (row 1 do grid, `grid-column: 1/-1`, sticky, **56px** = `--app-topbar-h`, borda inferior hairline): **logo quadrado** `/icon-safras.png` (38px, radius 10) a esquerda → `/dashboard` + **2 icones INERTES a direita** (`.app-topbar-action` 38px ghost, radius 10: **sino "Notificacoes" + ajuda "?"** — ganharao funcao no futuro). Miolo **VAZIO de proposito** (sem busca, sem titulo de pagina — decisao do usuario).
  - **SIDENAV** `.app-sidenav` (DSB-D15; comeca ABAIXO da top bar — row 2, `top`/`height` descontando `--app-topbar-h`): **TRILHO** `.app-sidenav-rail` (~60px, fundo `#f4f6f5`, borda hairline) com o **avatar** no rodape (menu de perfil em **DROPUP** `.app-sidenav-profile-menu`, mesma casca branca do `.topbar-profile-menu`; conteudo = `ProfileMenuCard`, compartilhado com o dropdown) + **PAINEL** `.app-sidenav-panel` (~216px, branco, borda `--topbar-line`) com a nav de **botoes PEQUENOS icone+nome** (`.app-sidenav-link`: `renderNavIcon` 1.15rem + label 0.9rem w600, padding `0.45rem 0.6rem`, radius 10). **Item ativo = PILULA suave verde** (`.is-active`: `rgba(31,93,67,0.10)` + `--brand-green`); hover tint 6% em `@media (hover:hover)`; `:active` so scale (button-press-effect).
  - **CANVAS `#f4f6f5`** (DSB-D16): fundo de TODAS as paginas desktop nao-PROSPECTOR (`background` no `.app-shell-root:has(.app-sidenav)`; o mesmo verde-clarinho do trilho) — cards/sheets **brancos** saltam sobre ele. **So desktop** (decisao do usuario; mobile segue branco).
  - **TITULO DA PAGINA** `.app-page-title` (DSB-D17): `<h1>` no topo do `.app-shell-main` (shell, desktop nao-PROSPECTOR), **dentro da pagina** — texto = rotulo do item de nav ativo, so nas 8 rotas principais (match exato; detalhes/Perfil mantem headers proprios). **Alinhado verticalmente ao botao "Inicio"** via tokens compartilhados `--app-nav-row-top` (0.9rem) + `--app-nav-row-h` (34px) — o painel/links da sidenav usam os MESMOS tokens (mexeu num, mexeu nos dois). Row do titulo segue o box do dashboard (`max-width: var(--content-max-wide)` + padding `clamp(0.85rem, 3vw, 4rem)`); fonte 1.15rem w700 `--ink`. Titulos proprios das paginas ficam escondidos no desktop (incl. "Relatorios" do informe comercial `.nsv2-title` e do viewer `.inf-intro-title`).
  - Grid 2 colunas via `:has(.app-sidenav)` (`--app-sidenav-w`, 276px); chrome **sticky**, NAO `position:fixed` (o PageTransition aplica transform e quebraria fixed). A faixa branca antiga (`.topbar`) segue `display:none` nesse contexto. GOTCHA corrigido no DSB-D17: o main de Lotes/Clientes descontava `4.5rem` hardcoded (top bar do DSB-D6) → `var(--app-topbar-h, 4.5rem)`. `:has(.app-sidebar)` segue reativando o grid do **PROSPECTOR**, que mantem a **sidebar vertical verde** + faixa branca com o avatar e fundo branco (app restrito). **"Sair" segue so no menu do avatar.** Mobile inalterado (topbar verde + MobileTabbar + hero). _(Historico: DSB-D6 (2026-07-12) = top bar de nomes sem icone, ativo sublinhado — superada, CSS removido.)_
- **Saudacao no desktop: REMOVIDA de vez.** O bloco `.topbar-greeting` saiu da faixa branca em DSB-D6; o cabecalho do dashboard `.dd-page-header` ("Visao geral" + saudacao/nome + papel + data, classes `.dd-page-*` + `getTodayLong`) saiu em **DSB-D16**. So o **hero mobile** (`DashboardMobile`) mantem saudacao. **Busca de lote** fora do chrome desktop (`.topbar-search-slot{display:none}` >=901px; mobile mantem).
- **1a linha — StatCards de pendencia: REMOVIDOS em 2026-07-12 (DSB-D2).** A linha `.dd-summary-row` (Classificacao pendente / Cadastros pendentes) saiu do desktop; o `StatCard.tsx` e o CSS `.dd-stat-*`/`.dd-summary-row` foram **deletados**. "Classificacao pendente" migrou pra pagina de Lotes (`/samples`, card `.spv2-pending-stat`, so-visualizacao); "Cadastros pendentes" foi removido. _(Historico: os StatCards de pulso "Lotes registrados hoje"/"Envios concluidos hoje" e o delta `formatDelta`/`.dd-stat-delta` ja tinham saido em 2026-07-07 com o payload `dailyRegistered`/`dailySent` — DSH-D4.)_
- **Grid principal — `.dd-content-grid`** (DSB-D14, 2026-07-14: **UMA AREA**, `flex: 1 0 auto`; o shell-lock de 100vh continua): o card **"Eventos"** (`EventsCalendarCard`) ocupa a area de conteudo **inteira** (`grid-template-rows: minmax(300px, 1fr)` — piso em px; abaixo dele a pagina rola). _(Historico: DSB-D3/D5 tinham top row `.dd-top-row` com donut + 2 cards de envio e Eventos embaixo — a top row saiu inteira no DSB-D14; antes disso eram 2 colunas com `.dd-left-col`.)_ Sombra dos cards via var **`--dd-card-shadow`** em `.dashboard-page` (tunavel num lugar so).
- **Cards de envio** (`components/RecentSendsCard.tsx`, desktop-only): **SAIRAM do dashboard no DSB-D14 (2026-07-14)** — "Amostras enviadas" mora no **topo do sheet de `/samples`** (wrapper `.spv2-top-cards`, lado a lado com o `.spv2-pending-stat`) e "Aprovacoes enviadas" no **topo da aba Aprovacoes de `/embarques`** (acima da worklist). UM componente parametrizado (`title`/`emptyLabel`/`items`/`variant`), classes **`.sends-*`** (ex-`.dd-send*`; base `.sends-card{display:none}` + liga em `@media (min-width:901px)` com `max-height` proprio — o card se esconde sozinho no mobile). Visual DSB-D8 inalterado: TABELA horizontal compacta — cabecalho de colunas **sticky** (`.sends-head`) + **1 linha por envio** (`.sends-row`); colunas por variante (`.sends-list.is-samples`/`.is-approvals`): `samples` = **Lote · Destinatario · Tipo · Tempo**; `approvals` = **Contrato · Comprador · Tempo**. `Tipo` = texto **cinza neutro** (`.sends-type`): `PHYSICAL_SAMPLE`→"Fisico", `REPORT`→"Descricao" (⚠️ "Descricao" diverge de "Laudo" do resto do app — decisao do usuario, so aqui). Shell branco radius 20 + header (`.sends-title` + tile `.sends-icon`) + `.sends-list` com **scroll interno**. Celulas: `.sends-code` (lote/n contrato + `BlendBadge`) · `.sends-party` (**ellipsis + `title`**) · `.sends-time` (relativo `formatRelativeTime`/refresh 60s, `title` com data exata). Cards **INERTES**. Cancelado = `.sends-row.is-cancelled` + numero riscado (`.sends-code-text`). Semantica de tabela. Dados (DSB-D14, endpoints proprios `{ items }` top-40): `GET /samples/recent-sends` (amostra = `PHYSICAL_SAMPLE_SENT`+`REPORT_EXPORTED`) e `GET /sale-contracts/approvals/recent-sends` (aprovacao = `approval_label_log`); fetch pelo hook `lib/use-recent-sends-feed.ts` (gate matchMedia 901px + foco/visibilidade throttle 30s); erro via `components/LoadError.tsx` (ex-`DashboardLoadError`).
- **Card "Eventos"** (`components/dashboard/EventsCalendarCard.tsx`, desktop-only; detalhe em `docs/Dashboard-Visao-Geral.md` §7.3): **DSB-D18 (2026-07-14)** — calendario **MENSAL** (grade `.dd-events-grid` **7 colunas × N linhas** domingo-first, N=4/5/6 semanas via `grid-auto-rows: minmax(0,1fr)`), com **TODOS os dias**: sab/dom **esmaecidos** (`.dd-events-day.is-weekend`, fundo `#f4f6f4` + numero muted — o negocio nao agenda acoes neles; evento ali e legado/borda no **dia REAL**, o roll `rollWeekendToWeekday` do backend foi REMOVIDO) e pontas dos meses vizinhos esmaecidas COM eventos (`.is-outside`, fundo transparente + numero muted w500). Helpers date-only BRT em `lib/dashboard-calendar.ts`: `computeMonthStart`/`addMonths`/`buildMonthGrid`/`formatMonthLabel` (+`computeWeekStart` como ancora das linhas; NAO unificar com o weekly-report segunda-based). Header = titulo + rotulo "julho de 2026" + nav ◀ `Hoje` ▶ (passo de **1 mes**, passado/futuro livres; deslize horizontal 200ms `dd-events-slide-*`, coberto no reduced-motion). Cabecalho de colunas `D S T Q Q S S` (7). Cada celula (`.dd-events-day`, container `<div>`) = numero no topo (`.dd-events-day-number`; "1 ago" no dia 1) + **`.dd-events-day-list`** (`flex:1; overflow-y:auto` — **rola POR DENTRO** quando o dia tem muitos eventos; decisao do usuario no DSB-D18, sem popover). **Sem painel** de dia selecionado e **sem dots**. Cada evento = **`.dd-events-chip`** (Link ou span): borda-esquerda colorida por **ESTADO** (var `--chip-color` via `data-state`, DSB-D10) + rotulo truncado; **navegacao PURA** → a sub-aba dona via `navTabForEvent` (`/contratos?tab=financeiro|contratos` e `/embarques?tab=embarque`, `&highlight={contractId}`; DSB-D11: `eventHref` recebe `navigableTabs` do papel e deixa o chip INERTE quando a aba-dona nao e visivel); tipo desconhecido/inerte = chip so-rotulo (span). **Cores por estado** (DSB-D10 — 3 cores; o **nome do tipo** no rotulo `tipo · nº · comprador` diferencia): azul `#2563eb` previsto / vermelho `#dc2626` atrasado / verde `#15803d` realizado; vars `--state-*` no `.dd-events-card`; **legenda** `.dd-events-legend`; estado tambem no `aria-label`/`title` (a11y). Hoje = anel `inset var(--brand-green)` + fundo `#f2f8f4` + `aria-current="date"`. **3 feeds mesclados no `DashboardDesktop`** via `onWindowChange` (janela = **grade inteira do mes**, 28–42 dias): pagamento (`/dashboard/payment-events`, `FINANCEIRO_ROLES` = todos os não-PROSPECTOR desde 2026-07-15 — era ADMIN+COMMERCIAL; flag `canPay`) + embarque (`/dashboard/shipment-events`, auth-only) + faturamento (`/dashboard/invoice-events`, auth-only; DSB-D11 — chip → aba Contratos, pisca via `useContractHighlight`). _(Feed de aprovacao removido em DSB-D9.)_ A prop `events` = `Record<'YYYY-MM-DD', DashboardCalendarEvent[]>`. Card **desktop-only** (o `DashboardMobile` nao o renderiza). Piso do `.dd-content-grid` = 420px (6 semanas).
- **Modal "Lotes pendentes" (`OperationModal`): REMOVIDO em 2026-07-12 (DSB-D2)** junto com os cards de pendencia. O CSS `.bottom-sheet.is-operations` + `.spv2-card-classify-arrow` foi **MANTIDO** (sera reusado quando o fluxo de classificar-a-partir-da-fila for reconstruido na pagina de Lotes). Ver `docs/Dashboard-Plano-de-Trabalho.md` (DSB-D2).
- **CSS orfao legado: LIMPO na revisao DSH (2026-07-07).** O cluster de classes mortas do dashboard antigo (`.dashboard-secondary-grid`, `-section-column*/-link/-subtitle`, `-secondary-panel*`, `-operations-panel`, `-search-section`, `-op-print/-progress*`, `-mobile-hero*/-welcome*`, `-total-today*`, `-view-all-link`, `-action-link*/-icon/-label`, `-empty-state`, `-muted-text`, skeleton `-md/-lg/-full/-xs`+`circle`/`content`, `.sales-total-number`) foi removido classe-a-classe com grep. Continuam VIVAS: `.dashboard-section-heading/-title`, `.dashboard-operations-grid`/`.dashboard-operation-card*`/`.dashboard-operation-badge` (PROSPECTOR), `.dashboard-skeleton-line`/`-sm`/`-card`/`-icon-wrap`. A regra segue valendo pra limpezas futuras: **so classe-a-classe com grep antes** — delecao por faixa de linha QUEBRA o prospector. Novidade da mesma revisao: `.dashboard-error-banner` (banner de erro de carregamento, ver skill `feedback-messages` §4). **DSB-D2 (2026-07-12):** removidas tambem `.dd-summary-row` + `.dd-stat-*` (com o `StatCard`); `.bottom-sheet.is-operations` e `.spv2-card-classify-arrow` ficaram SEM uso mas foram MANTIDAS (rebuild do fluxo de classificar na pagina de Lotes). Novo: `.spv2-pending-stat*` (card so-visualizacao "Classificacao pendente" em `/samples`).

### Variante: dashboard do PROSPECTOR (app restrito)

- `/dashboard` renderiza `components/dashboard/prospector/ProspectorDashboard.tsx` quando `isProspector(role)` — **layout unico responsivo** (sem par mobile/desktop): reusa `.dashboard-page/.dashboard-hero/.dashboard-sheet` do dashboard mobile; o bloco `@media (min-width: 901px)` replica hero/sheet sob `.prospector-dashboard` com cap de largura (46rem). **No desktop o prospector DIVERGE do admin de proposito** (mantem o hero verde replicado + cabecalhos `.dashboard-section-heading/-title`, em vez da sidebar + faixa branca do admin) — decisao de NAO alinhar por ora (app restrito; alinhar seria redesign maior)
- Hero de saudacao com **busca por nome de cliente** no lugar da busca de lote (mesmas classes visuais `dashboard-hero-search`/`sample-search-field`; filtra ao digitar com debounce 250ms a partir da 2a letra — server-side, o total acompanha); 2 cards de contagem `dashboard-operation-card is-wide is-static` ("Visitas / Hoje" e "Clientes novos / Hoje", SEMPRE do usuario logado; nao clicaveis: `cursor: default`, sem `:active`, badge sempre visivel e sem pulse; desde 2026-06-18 **espelham o visual do admin** (`.dashboard-mobile`): card branco flat + sombra, icon-wrap flat verde-claro `#e8f1ec` (o icone segue stroke verde brand, sem modificador `.dashboard-op-*`) e badge = chip verde-claro flutuante no canto)
- Lista "Ultimos informes": mostra **apenas os informes do PROPRIO prospector** (escopo own-only no backend, `where.userId`), com contador `.prospector-list-meta`+`.spv2-list-count` no canto esquerdo acima dos cards (segue o filtro de busca) e cards `rsm-*` compartilhados (`components/visits/VisitReportCard.tsx`). **Scroll interno** so na area da lista (`.prospector-list-scroll`; hero/busca/cards de contagem sempre visiveis — o `.dashboard-sheet` do prospector vira `overflow: hidden` e o clearance do botao "+" migra pro fim da lista). O `.dashboard-sheet` do prospector usa o mesmo fundo frio `#f4f6f5` do admin (override proprio — sem ele herdava o gradiente bege legado da base `.dashboard-sheet`). Como a lista e own-only, a lixeira `.rsm-card-quick-delete` (prop `quickDelete`; confirm central via portal; exclusao por autor no backend) aparece em TODOS os cards do dashboard
- **SEM navbar**: o PROSPECTOR nao renderiza a MobileTabbar (`hideMobileTabbar` no AppShell). O botao `.prospector-fab` — gradiente do pill da camera (`#1a6b2e→#0d4a1a`), **quadrado arredondado** (`border-radius clamp(18-22px)`, `clamp(4.2-4.9rem)`), icone "+" — fica fixo no rodape **a direita, alinhado ao centro do avatar do hero** (right = padding do hero + meio avatar − meio botao); abre o formulario num bottom sheet `.is-informe`; some quando ha sheet/modal aberto. Em `/profile` o prospector ganha seta de voltar no canto esquerdo (`.stg-header .sdv-header-top` com `width: 100%` — sem isso o align-items:center do stg-header encolhe o header-top)
- Sheet `.is-informe`: corpo no fundo padrao do BottomSheet (quase branco) com `.inf-intro` escondida (o header do sheet ja titula "Novo informe")

### Barra de navegacao inferior (MobileTabbar)

Pill flutuante (`.mobile-tabbar-inner`) renderizada via Portal no `body` (`components/MobileTabbar.tsx`); todos os papeis EXCETO PROSPECTOR renderizam (oculta tambem na pagina de detalhe de lote — `hideMobileTabbar` no `AppShell`; o detalhe de CLIENTE virou overlay em `/cadastros` na F1 do redesign e esconde a tabbar via `body.is-bottom-sheet-open`). **4 itens** (CAM-P3, 2026-07-16 — o slot central da camera saiu; conceito `emphasis`/`is-primary` removido): Inicio, Lotes, Cadastros (F1 do redesign 2026-07-20: o item "Clientes" saiu — `/clients` e redirect; Cadastros pra todo nao-PROSPECTOR) e um slot por papel — Relatorios (papeis com acesso) ou Perfil (CLASSIFIER/CADASTRO/REGISTRATION). A camera abre por um **icone no header de todas as paginas** (cluster `[camera][avatar]` do `HeaderAvatarMenu`, `.header-camera-trigger` no molde `.nsv2-back`; em `.sdv-header` espelha o back branco/verde) → bottom sheet global `CameraSheet`. Estilos em `app/globals.css` (`.mobile-tabbar*`, `.header-camera-trigger`, `.camera-sheet-stage`).

- **Superficie BRANCA** (redesign 2026-06-15, mockup): `.mobile-tabbar-inner` `#ffffff`, hairline `rgba(20,50,25,0.08)` + sombra reforcada em camadas (`0 4px 12px /.14` + `0 14px 34px /.22`) pra destacar do fundo (era barra verde-escura `#0b4a04→#073603` com icones brancos)
- **Estados por item**: inativo cinza-esverdeado `#74837a` (icone via `currentColor` + label w500); **ativo verde `#1e8540`** (icone + label w600) com **indicador = traco verde curto arredondado ABAIXO do label** (`::before`, `bottom`, `border-radius: 999px`) — era traco branco no topo
- **Traco fino**: labels leves (w500/w600) e icones com `stroke-width: 0.9`
- **Layout = grid de colunas iguais**: `.mobile-tabbar-inner` usa `grid-auto-flow: column; grid-auto-columns: minmax(0,1fr)` -> os itens ficam exatamente equidistantes (4 itens desde a CAM-P3); cada link centra o conteudo na propria coluna
- **Altura -10%** (vs versao anterior): icone/label/paddings internos escalados por 0.9 (clamps em `.mobile-tabbar-icon`, `-label`, `-link`); `--mobile-tabbar-clearance` acompanha (8.9rem -> 8.3rem). Ao mexer na altura da barra, reavaliar a clearance pra nao sobrar/faltar respiro

## 2. Paleta de Cores

> **Fonte-da-verdade dos TOKENS = `docs/Design-Language.md`** (espelho do `:root` de
> `app/globals.css`: cor/tipografia/espaco/raio/sombra/motion/z-index/breakpoints). Esta skill é o
> guia **aplicado** — como usar os tokens em cards/componentes + acabamento. As tabelas abaixo são um
> resumo; o inventário completo e canônico está no Design-Language.

### Marca (verdes — paleta Safras)

Todos os verdes do app vivem na paleta Safras, expostos como tokens CSS no `:root` de `app/globals.css`. **Sempre preferir o token** ao hex literal.

| Uso                             | Token                                   | Hex                  |
| ------------------------------- | --------------------------------------- | -------------------- |
| Status bar / base               | `--brand-green`                         | `#1f5d43`            |
| Gradiente login inicio          | `--brand-green-deep`                    | `#173c30`            |
| Gradiente login meio            | `--brand-green-strong`, `--brand-green` | `#24553a`, `#1f5d43` |
| Gradiente login fim             | `--brand-green-soft`                    | `#2f6b4a`            |
| Acento interativo (foco, links) | `--brand-green-soft`                    | `#2f6b4a`            |
| Avatar fundo                    | —                                       | `#2a6b45`            |

### Superficies

| Uso                   | Cor                                                 |
| --------------------- | --------------------------------------------------- |
| Fundo pagina (quente) | `#fdf9ec` → `#f4f0e7`                               |
| Fundo card            | `linear-gradient(180deg, #ffffff 0%, #f9f7f2 100%)` |
| Fundo campo repouso   | `#f8f6f2`                                           |
| Fundo campo focado    | `#ffffff`                                           |
| Divider / separador   | `#d9d3be`                                           |
| Skeleton loading      | `#e8e3d5`, `#e0dbd0`                                |

### Texto

| Uso                     | Cor                                                                             |
| ----------------------- | ------------------------------------------------------------------------------- |
| Primario (texto)        | **`--ink`** `#24392f` — token canônico (DSB-D12; hex ad-hoc antigo `#1a1a1a`)   |
| Secundario / muted      | **`--muted`** `#66756b` — token canônico (DSB-D12; hexes antigos `#555`/`#999`) |
| Sobre verde (titulo)    | `#ffffff`                                                                       |
| Sobre verde (subtitulo) | `rgba(255,255,255,0.5)` a `rgba(255,255,255,0.7)`                               |
| Placeholder             | `rgba(0,0,0,0.18)`                                                              |

### Status (pendencias, alertas)

| Status                 | Cor       | Uso                                           |
| ---------------------- | --------- | --------------------------------------------- |
| Impressao pendente     | `#C0392B` | Cards, badges, alertas                        |
| Classificacao pendente | `#D4A017` | Cards, badges                                 |
| Em andamento           | `#2980B9` | Cards, badges                                 |
| Disponivel / sucesso   | `#27AE60` | Barras, indicadores                           |
| Alerta (> 15 dias)     | `#E67E22` | Barras de distribuicao                        |
| Erro em campo          | `#c45c5c` | Placeholder de erro (nunca vermelho saturado) |

## 3. Cards

### Estilo base de card

```
background: linear-gradient(180deg, #ffffff 0%, #f9f7f2 100%);
border-top: 1px solid rgba(255, 255, 255, 0.9);
border-radius: clamp(14px, 4vw, 16px);
box-shadow:
  0 2px 4px rgba(0, 0, 0, 0.06),
  0 6px 16px rgba(0, 0, 0, 0.08),
  0 12px 28px rgba(0, 0, 0, 0.05),
  inset 0 1px 0 rgba(255, 255, 255, 0.8);
```

### Linha lateral de status

Existem dois padroes em uso (ambos validos — usar conforme o contexto do card):

**Compacto** (cards de listagem leves, ex: filiais antigas, dots/markers internos):

- `::before` com `position: absolute`, `left: 0`, `top: 20%`, `bottom: 20%`
- `width: 3px`, `border-radius: 0 3px 3px 0`

**Padrao amostras / cards detalhados** (`sdv-unit-card-mini`, `cv2-card.is-incomplete`):

- `::before` = barra lateral CURTA, arredondada e centralizada (NAO encosta nas bordas): `left: clamp(6px, 1.8vw, 8px)`, `top: 50%` + `translateY(-50%)`, `width: 4px`, `height: clamp(~34-46px)`, `border-radius: 2px`
- Cor via `--card-status-color` (verde completo / amber `#d97706`/`#f59e0b` incompleto / cinza inativo)

### Interacao

> Pattern completo de tap feedback documentado na skill **`button-press-effect`** — esta secao e apenas resumo.

- `:active` usa `transform: scale(0.95-0.99)` + sombra reduzida
- Nunca mudar cor de fundo ao clicar (excecao: filter chips em listagens — ver §7)
- `-webkit-tap-highlight-color: transparent`

### Skeleton loading

- Formato identico ao card final (mesma altura, mesmo radius, mesma cor de fundo neutra)
- Pode usar **shimmer suave** (`background-size: 200% 100%` + `linear-gradient` em movimento, `~1.4s ease-in-out infinite`) combinado com fade-in `cubic-bezier(0.22, 1, 0.36, 1)` na entrada
- Exemplo em uso: skeleton dos cards de `/samples` (`.spv2-card` + `spv2-skeleton-shimmer`, ver `app/globals.css`)
- Skeleton e para **cards/secoes especificas** dentro de uma pagina ja carregada. Para a **pagina inteira** ainda nao pronta, usar o loader da marca (abaixo), nunca um texto "Carregando..."

### Loader de pagina lenta (branded)

- Quando **uma pagina inteira** demora (sessao/auth ou dados), aparece o visual da marca (logo + barra + bolinhas) — o mesmo do splash de boot — em vez de texto verde.
- Componente reusavel: `components/SplashVisual.tsx` (variante `pageLoader`); `SplashScreen` (boot) e o loader de pagina compartilham esse visual.
- Arquitetura: `LoadingProvider` (`app/layout.tsx`, em volta do `PageTransition`) conta fontes de carregamento e so mostra o overlay apos ~480ms (loads rapidos nao piscam), portado ao `body`, z-index 99998 (abaixo do splash de boot 99999, pra handoff sem glitch no startup).
- Registrar uma fase async lenta: hook `useGlobalLoading(active)` (`lib/loading/loading-context.ts`). Ja vem ligado no `useRequireAuth` (cobre auth de toda pagina autenticada); paginas de detalhe ligam tambem o load dos dados (`useGlobalLoading(loadingDetail)`).
- **Evitar o "shell vazio" no 1o load:** a pagina de detalhe deve dar `return null` enquanto os dados ainda nao chegaram (`if (loadingDetail && !detail) return null` / `if (loadingPage && !client) return null`), em vez de renderizar `AppShell`/`.sdv-page` sem conteudo — o loader da marca cobre a tela e a pagina aparece de uma vez. So no 1o load (dado ainda `null`); refetch mantem o dado e nao pisca. Aplicado em `/samples/[sampleId]` e `/clients/[clientId]`.

### Variantes de card especificas

| Classe                      | Uso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.sdv-card`                 | Card branco padrao (sombra 3D, radius 18px) — base para detalhe de cliente/amostra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `.sdv-info-compact`         | Container branco padrao (SEM header verde): `.sdv-card-header` (titulo cinza + hairline full-bleed) + acao minimalista `.sdv-edit-btn` (lapis "Editar" ou "+" "Nova") + `.sdv-info-grid`. Containers Informacoes/Classificacao/Resumo do detalhe da amostra e **Informacoes + Filiais + Endereco fiscal** do detalhe do cliente. (O antigo `.sdv-card-themed` de header verde foi APOSENTADO 2026-06-19 — nenhum container do cliente usa mais; CSS removido.)                                                                                                                                |
| `.sdv-card-commercial-mini` | **REMOVIDO 2026-06-19** — era o mini-card-filtro (Em aberto/Vendido/Perdido/Comprado) + a lista (`.sdv-commercial-list*`) da seção comercial do detalhe do cliente; a seção virou um **gráfico donut** (`ClientCommercialSummaryCard`, ver §"Lotes disponiveis") sem filtros. Todo o CSS órfão foi removido do `globals.css`.                                                                                                                                                                                                                                                                 |
| `.sdv-unit-card-mini`       | Card minimalista de filial — barra lateral CURTA/arredondada/centralizada (não encosta nas bordas, padrão Lotes/Clientes): verde (completo) / amber (incompleto) / cinza (inativo). Incompleto tb mostra o badge `cv2-card-incomplete-badge` no canto sup. direito (card é `overflow:visible`). **⚠️ No drawer do cliente (`.client-details-overlay`) o card foi RE-ESTILIZADO institucional (rodada 4 FV): branco+hairline+radius 10, sem gradiente/sombra tripla/barra lateral, badge Inativa = chip pastel — restyle ESCOPADO; o molde base descrito aqui segue valendo fora do overlay.** |
| `.sdv-attachment-thumb`     | Miniatura de anexo do cliente na `.sdv-attachment-grid` (grade compartilhada pelo card lateral "Anexos" e pela aba "Anexos" do modal "Documentos"): imagem `<img>` ou selo `.sdv-attachment-thumb-pdf` (verde translucido) + `.sdv-attachment-thumb-name`. `.sdv-attachment-thumb-chip` = chip com o nome da **filial** dona do anexo (verde translucido; `.is-inactive` = cinza esmaecido quando a filial esta inativa). Sem chip = anexo do proprio cliente.                                                                                                                                |
| `.cv2-card`                 | Card de cliente `/clients` — barra lateral CURTA estilo Lotes (`::before` centralizada, NAO mais faixa de altura cheia): VERDE (completo) / LARANJA (`.is-incomplete`). Avatar de iniciais VERDE por TIPO (PJ `#1f5d43` escuro / PF `#2f8a5e` claro, via `--avatar-color`). Nome com ellipsis no mobile (`display:block`).                                                                                                                                                                                                                                                                    |

## 4. Icones

### Padrao SVG

- Todos os icones sao SVG inline com `viewBox="0 0 24 24"`
- `fill: none`, `stroke: currentColor` (cor herdada do pai)
- `stroke-width: 1.6` a `1.8`, `stroke-linecap: round`, `stroke-linejoin: round`
- Tamanho controlado pelo container pai com `clamp()`

### Icones em caixas (icon-wrap)

- Container com `border-radius: clamp(10px, 3vw, 14px)`
- Fundo em gradiente sutil da cor do status: `linear-gradient(135deg, cor 15% opacidade, cor 8% opacidade)`
- Borda `1.5px solid` na cor do status com 25% opacidade
- Icone SVG na cor solida do status

## 5. Badges (contadores)

### Badge Pill

- Circulo com `border-radius: 50%`, tamanho `clamp(22px, 6.5vw, 26px)`
- Fundo na cor solida do status, texto branco `font-weight: 700`
- `border: 2px solid` na cor do background da superficie pai (para criar separacao visual)
- Position absolute no canto superior direito do icon-wrap: `top: clamp(-8px, -2vw, -6px)`, `right: clamp(-10px, -2.5vw, -8px)`
- So aparece se o valor for > 0
- Animacao de pulso: `scale(1) → scale(1.15) → scale(1)`, `2s ease-in-out infinite`

### Badge indicador da amostra (Liga / Mix)

Badges inline, SEM hover/click (indicadores puros), ao lado do numero do lote ou dentro do valor de um campo. Molde comum: pill `inline-flex`, `padding: 2px 7px`, `border-radius: 6px`, texto branco `font-weight: 600`, `font-size: clamp(10.5px, 2.8vw, 11.5px)`, `box-shadow` sutil.

- **`.blend-badge` ("Liga")** — `components/samples/BlendBadge.tsx`, gradiente **lilas** `#7c3aed→#6d28d9`; marca que a amostra e uma liga (blend). Tamanhos `--sm`/`--md`.
- **`.mix-badge` ("Mix")** — `components/samples/HarvestDisplay.tsx`, gradiente **ambar** `#f59e0b→#d97706`; aparece no campo **Safra** quando a liga tem **2+ safras distintas** (`isMixHarvest` em `lib/sample-identification.ts`). Cor distinta do lilas "Liga" e do verde/vermelho de status. No **card** = so o badge; no **detalhe/linhas** = badge + as safras (`.mix-harvest` / `.mix-harvest-safras`, ex.: `[Mix] 24/25 · 25/26`). Safra unica passa direto (sem badge).

## 6. Campos de Input

### Estrutura

- Container flex com icone a esquerda + input + acao opcional a direita
- `border-radius: clamp(12px, 3.5vw, 14px)`
- `padding: clamp(12px, 3.5vw, 14px) clamp(14px, 4vw, 16px)`

### Estados

| Estado  | Fundo     | Borda                                 | Extras                                       |
| ------- | --------- | ------------------------------------- | -------------------------------------------- |
| Repouso | `#f8f6f2` | `1.5px solid rgba(0,0,0,0.06)`        | —                                            |
| Focado  | `#ffffff` | `1.5px solid var(--brand-green-soft)` | `box-shadow: 0 0 0 3px rgba(47,107,74,0.08)` |
| Erro    | `#f8f6f2` | `1.5px solid rgba(196,92,92,0.4)`     | Placeholder em `#c45c5c`                     |

### Transicao

- `transition: background 0.25s, border-color 0.25s, box-shadow 0.25s`

### Icone do campo

- Tamanho: `clamp(18px, 5vw, 20px)`
- `stroke: #888`, `stroke-width: 1.6`
- `margin-right: clamp(10px, 3vw, 12px)`

## 7. Botoes

### Botao Primario (acao principal)

```
background: linear-gradient(135deg, var(--brand-green), var(--brand-green-soft));
color: #ffffff;
border-radius: clamp(12px, 3.5vw, 14px);
padding: clamp(14px, 4vw, 16px);
font-weight: 600;
box-shadow: 0 4px 24px rgba(31, 93, 67, 0.3);
```

- Full-width quando e a acao principal da pagina
- Reforcar `background` em TODOS os estados (:hover, :focus, :focus-visible, :active, :disabled)
- `:active` = `scale(0.96)` + sombra reduzida
- `:disabled` = `opacity: 0.65`

### Botao Secundario (acoes menores)

- `background: transparent` ou `rgba(cor, 0.08)`
- Texto na cor da acao
- `:active` = `scale(0.95)` ou `opacity: 0.7`

### Filter chips e botoes de filtro em listagens

Excecao a regra "nunca verde ao clicar":

- Em listagens (`/clients`, `/users`), **filter chips/botoes em estado `.is-active`** podem usar verde solid (`linear-gradient(135deg, var(--brand-green), var(--brand-green-soft))` com SVG branco) para sinalizar acao em uso. Exemplo: `.hero-search-filter-btn` (base verde, hoje só em `/users`). **Exceção — `/samples` e `/clients`**: o `.hero-search-filter-btn` foi movido pra linha da busca (à direita; a busca encurta via flex) e vira **pílula BRANCA + ícone verde** (escopado a `.samples-page-v2`; `/clients` ganhou o equivalente escopado a `.clients-page-v2` — ver bullet abaixo), com **badge vermelho** sinalizando filtros ativos. A **lupa DENTRO** da busca de `/samples` é **puramente decorativa** (a busca filtra ao vivo ao digitar, sem submit): override em `.samples-page-v2` remove a afordância de botão herdada do `.hero-search-submit` compartilhado (`cursor:default`, sem `scale` no `:active`, caixa colapsa de 2rem pro tamanho do ícone) e **encolhe** o `.hero-search-icon-search` (0.95rem), centralizado pelo flex da barra — diferente de **`/users`** (único que mantém a lupa-**botão** com cross-fade pra seta de submit; `/clients` também adotou a lupa decorativa — ver bullet abaixo). O contador `.spv2-list-meta`/`.spv2-list-count` ficou alinhado à direita (modo liga volta a `space-between`). Quando há filtros aplicados, aparece à ESQUERDA do filtro um botão redondo de limpar `.hero-search-clear-btn` (X verde) num `.hero-search-clear-slot`: o slot colapsa a largura (+ margin-left negativa que cancela 1 `--search-row-gap`) e o botão desliza via `transform` pra TRÁS do filtro (que tem `z-index:1` + fundo opaco) — assim some/aparece junto com a busca encolhendo/crescendo. Default = colapsado; `.hero-search-wrap.has-applied-filters` = expandido. Limpa via `handleClearFiltersOnly` (refaz o fetch).
- **`/clients` adota o filtro de `/samples`** (batch de alinhamento de /clients ao design de Lotes, 2026-06-17): o `.hero-search-filter-btn` saiu do `.spv2-list-meta` e foi pro `.hero-search-wrap` (linha da busca, à direita; busca encurta via `flex:1`), virando **pílula branca + ícone verde + badge vermelho** (escopado `.clients-page-v2`). O painel deixou de ser **dropdown ancorado** (`.cv2-filters-*` removido) e virou **MODAL central** reusando `.app-modal.is-themed.samples-filter-modal` (CSS keyed por classe; mesmos campos de cliente — Responsável, Status, Tipo, Papel, Completude — em `<select>` simples; rascunho + Aplicar/Limpar). O contador `.spv2-list-count` alinha à **direita** no mobile (no desktop o `.spv2-list-meta` segue como header `space-between`). Estado de filtro mora em `components/clients/ClientsBrowser.tsx` — desde 2026-07-02 a lista de clientes (busca, filtro, scroll infinito, detalhe, criar) vive nesse componente compartilhado; desde a F1 do redesign (2026-07-20) ele e montado SO pela aba **Clientes** de `/cadastros` (que aplica a casca `.clients-page-v2`), e `app/clients/page.tsx` virou **redirect RSC** pra `/cadastros` (preserva o deep-link `?incomplete=true`; `app/clients/[clientId]/page.tsx` idem → `/cadastros?cliente=<id>`). O componente `ClientsFilterButton` segue **aposentado** (só exporta os tipos + `EMPTY_CLIENT_FILTERS`/`countActiveClientFilters`). A **lupa** virou **decorativa** (span `aria-hidden`, sem submit; Enter ainda busca via implicit submission do form) e a busca ganhou o botão **"X" de limpar** (reusa as classes globais `.hero-search-clear-*` + `has-applied-filters`, chamando `handleClearFiltersOnly`). Só **`/users`** mantém a lupa-botão + filtro base verde. A **busca da lista** também foi alinhada a /samples: casa por **PREFIXO de palavra** (backend `buildClientWhereFromSearch(search, { matchMode: 'prefix' })` em `src/clients/client-service.js` — começa-com OU contém `" "+termo`; CPF/CNPJ por prefixo) e dispara a partir de **2 caracteres** (`<2` desfiltra). O **lookup/typeahead** de cliente nos formulários segue por `contains` (`matchMode` default).
- A excecao se aplica **apenas ao estado persistente de "filtro ativo"** — nunca ao `:active` transitorio do clique.

### Campos de filtro multi-select (chips dentro do campo)

- No modal de filtros de `/samples`, campos de selecao multipla usam o box `.samples-filter-multi`. Duas variantes:
  - **`--lookup` RETRÁTIL** (Proprietário/Comprador/Enviado para — `ClientLookupField`): é um **disclosure**. Colapsado mostra SÓ o gatilho (`.samples-filter-retract-trigger`: nome do campo numa caixa de **borda fina** + seta `.samples-filter-retract-chevron` + bolinha `.samples-filter-retract-count` com a contagem) — sem caixa de input à vista. Clicar abre a caixa de busca (animação `samples-filter-field-reveal`; a borda do gatilho some). Aberto: chips dos selecionados (`.samples-filter-chips-row`, fila horizontal **rolável**, `nowrap`, rótulo truncado `8ch`) na **MESMA linha** do typeahead inline → o campo **não cresce de altura**; placeholder some quando há seleção; sem outline preto no input (`input:focus { outline: none }`). Fecha ao clicar fora, em outro campo ou ao **rolar o modal** (JS em `app/samples/page.tsx`, fecha via `.samples-filter-field--retractable.is-open`).
  - **`--select`** (`ClassificationFilterField`): box clicavel. O **campo FECHADO** enfileira os selecionados como chips numa **ÚNICA linha** (`.samples-filter-multi-chips`, `nowrap` + `overflow:hidden`, tokens **label-only** sem "×"); o que não couber na largura colapsa num **`+N`** (`.samples-filter-multi-more`) — a contagem do overflow é medida em JS (`ResizeObserver` + mirror invisível `.samples-filter-multi-measure`, que renderiza todos os chips no tamanho natural pra evitar loop de remedição) — e a **bolinha `.samples-filter-retract-count`** (verde, reaproveitada do `--lookup`) mostra o **total** selecionado, à direita antes do chevron. Clicar abre `.samples-filter-multi-dropdown` com a checklist. A **busca** no dropdown só aparece com a prop **`searchable`** (hoje **só a Catação**, ainda gated por `> 8` opções); Padrão/Aspecto/Certificado têm checklist **seca**. Campos: **Padrão/Aspecto/Catação/Certificado** (opções de `GET /samples/classification-values?field=padrao|aspecto|catacao|certif`) + **Safra** (multi-seleção; opções dos presets `buildHarvestPresets`, **sem** endpoint — match por componente via `contains` OR no backend, param `harvests` CSV com fallback ao `harvest` legado).
- **Campos da etapa "Tipo e classificadores" do sheet da câmera** (`components/camera/ClassificationMetaStepBody.tsx`, rodada 2/2026-07-20): NÃO usam o `ChipMultiSelectField` (os chips dele são display-only com `+N`, e ele tem consumidores em Clientes — estendê-lo seria risco de regressão). São um componente dedicado que **reusa o CSS**: casca e dropdown do `.chip-select-*`; fila de chips **removíveis** do `.samples-filter-chips-row` + `.samples-filter-token`/`-label`/`-remove` (nowrap + `overflow-x` + scrollbar escondida → desliza na horizontal e o campo **nunca cresce em altura**). Dois detalhes que não podem ser perdidos ao mexer: (1) o `×` do chip precisa de `stopPropagation`, senão remover abre a lista; (2) o drop-up mede contra o **`.bottom-sheet-body`**, não contra `window` — dentro de um sheet a janela mente (o fundo dela fica abaixo do rodapé) e o dropdown sai recortado, porque `.bottom-sheet` e `.bottom-sheet-body` têm `overflow`. Só uma lista abre por vez, e o ESC/voltar fecha a lista antes de o sheet cogitar descartar (o dropdown NÃO registra ESC próprio — quem decide é o `onDismissAttempt` do sheet).
- **`ChipMultiSelectField`** (`components/ChipMultiSelectField.tsx`): versão GENÉRICA e **id-based** do mesmo padrão `--select` (chips numa ÚNICA linha + `+N` medido com mirror invisível + `ResizeObserver` + dropdown checklist com busca opcional), com classes próprias `.chip-select-*` que casam com os inputs do modal (altura FIXA 2.5rem, borda 2px, raio 10px — o campo **nunca** cresce). Abre pra cima perto do rodapé (`.chip-select-wrap.is-drop-up`) — por heurística de espaço; o campo **Papel** (último do modal de novo cliente) força **sempre** pra cima via prop `forceDropUp` (as opções aparecem acima do campo sem gerar scroll na página). **Erro inline DENTRO do campo**: `errorMessage` vira o **placeholder vermelho** (`.chip-select-placeholder.is-error`) + borda vermelha (`.is-field-error`), NÃO uma mensagem abaixo — o campo não muda de posição (alinhado a `feedback_error_inside_field`). Usado no **modal de novo cliente** (`ClientQuickCreateModal`) em **Responsável** (`searchable`, options = usuários comerciais, obrigatório) e **Papel** (Vendedor/Comprador/Armazém → `isSeller`/`isBuyer`/`isWarehouse`, multi, obrigatório, vem vazio); e no **modal de editar do detalhe** (`/clients/[id]`) em **Papel** (mesmo mapeamento, ao lado do Telefone). O `UserMultiSelect` (input-de-busca com **chips em scroll horizontal**, altura fixa — não cresce) segue em `/clients/[id]` no **Responsável** (linha própria, largura toda). _(O resumo de validação do submit é um **toast** de erro, não inline (ver §13): "Preencha os campos obrigatórios destacados" quando falta campo; mas se o bloqueio é CPF/telefone **preenchido com a contagem de dígitos errada**, o toast traz a dica específica — ex. "CPF deve ter 11 dígitos (tem X)" / "Telefone deve ter 10 ou 11 dígitos" — porque o placeholder-dica do campo some quando há valor. (CPF/CNPJ **não** checa mais dígito verificador desde 2026-06-19, só comprimento — front e back.)_

### Regras universais de botao

> Pattern canonico completo (tap-highlight, `:active`, `:hover` em `@media (hover: hover)`, anti-patterns) na skill **`button-press-effect`** — esta secao mantem so os pontos especificos do design system.

- Nunca virar verde no `:active` transitorio (regra mantida — verde solido e exclusivo do estado persistente `.is-active` em filter chips, conforme acima)
- Sempre `-webkit-tap-highlight-color: transparent`
- Sempre `outline: none` ou outline neutro

## 8. Modais e Bottom Sheets

### Bottom Sheet (padrao mobile)

> Componente reusavel: `components/BottomSheet.tsx`. Usar este wrapper ao construir qualquer bottom sheet novo — nao replicar o CSS na mao. Em desktop (>900px) o mesmo componente transforma-se em modal centralizado via CSS responsivo.

**API:** `{ open, onClose, onDismissAttempt?, title?, footer?, children, dragToDismiss?, dragDisabled?, stacked?, manageHistory?, closeVariant?, ariaLabel?, className? }` (controlled, declarativo). `onDismissAttempt` async permite cancelar fechamento (ex: modal de confirmacao "Descartar?"). `closeVariant: 'x' | 'edge-back'` (default `'x'`) troca o X por uma **seta ← na borda esquerda** (metade pra fora no desktop) — o padrao dos paineis do detalhe da FV (ver "Paineis do detalhe" abaixo).

**Caracteristicas do CSS base (`bottom-sheet*` em globals.css):**

- Mobile: `position: fixed`, `transform: translate3d(0, 100%, 0)` → `translate3d(0, 0, 0)` ao abrir
- Transition: `0.46s cubic-bezier(0.22, 1, 0.36, 1)` (abertura de baixo pra cima mais lenta/natural; DEVE casar com `ANIMATION_MS` no `BottomSheet.tsx`)
- Overlay (**padrao de ACAO**): `rgba(0, 0, 0, 0.55)` **SEM blur** — a pagina de tras fica VISIVEL, so escurecida; fecha ao clicar (passa por `onDismissAttempt`). _(Inclui o `.camera-preview-sheet` desde 2026-06-18: herda este scrim escuro sem blur — antes forcava `rgba(0,0,0,0.4)` + `blur(16px)` via `:has()`.)_
- **Chrome = padrao de ACAO** (canonico desde 2026-06; antes scoped em `.is-operations`, agora e o BASE de TODOS os bottom sheets): **header BRANCO** (`background: transparent` = fundo do sheet, sem faixa verde, `justify-content: space-between`, colado no topo); **titulo VERDE** `var(--brand-green)` alinhado a **esquerda**; **X quadrado-arredondado claro** (`#eef1ee` / glifo `#4a5751`) NO FLUXO do header (`position: static`) — saiu o circulo translucido `absolute`; **drag handle transparente** e compacto com **barra cinza** `rgba(20, 50, 25, 0.18)`. _(O `.camera-preview-sheet` adota este chrome desde 2026-06-18 — header CLARO + titulo VERDE — mas numa variante: faixa branca edge-to-edge (`background:#fff` + borda inferior clara) com titulo CENTRADO e X/drag ocultos, porque o corpo e a area escura da foto. Antes era header verde edge-to-edge + titulo creme.)_
- Swipe down para fechar (threshold 60px); pausa se `dragDisabled=true` ou se target tem scroll
- Fundo: `var(--brand-cream-soft)`
- `border-radius` topo: `clamp(20px, 5vw, 28px)`
- `max-height: 98dvh` (fallback `calc(100vh - 2vh - env(safe-area-inset-top))` em iOS Safari < 15.4)
- Body flex com `min-height: 0` + `overflow-y: auto` (crítico pra teclado virtual)
- Footer sticky bottom (nao fixed) — acompanha scroll-into-view
- ESC dispara `onDismissAttempt`; back Android via `history.pushState` + `popstate` listener. Dismiss BLOQUEADO (`onDismissAttempt` → false) re-injeta a entry no popstate — a proxima volta continua protegida em vez de sair da pagina (fix CAM-G6, 2026-07-16)
- **GOTCHA — mexer no arbitro de `popstate` do `BottomSheet`:** o contador module-level `pendingInternalBacks` distingue o `history.back()` que o proprio cleanup dispara do back de verdade do usuario. Quem desconta o contador NAO pode rodar durante o dispatch do evento: o once-listener do cleanup e registrado ANTES do listener do sheet que remonta (Strict Mode roda mount → cleanup → mount), entao descontar na hora rouba o token, o listener vivo le 0, trata o back interno como back do usuario e FECHA o sheet ~17ms depois de abrir. O desconto vai num `setTimeout(…, 0)` (macrotask); microtask nao serve porque o checkpoint roda entre um listener e outro. Sintoma quando quebra: modal "nao abre" em dev e funciona em prod (Strict Mode so duplica efeitos em dev)
- **GOTCHA — navegar a partir de uma acao do sheet:** o sheet injeta uma entry de history (`state.bottomSheet`) e, no cleanup do close/unmount, chama `history.back()` pra desfaze-la. Como `router.push` (App Router) e assincrono, esse `back()` corre contra a navegacao e a DESFAZ (a acao "nao navega"). Antes do `router.push`, limpe o marcador: `history.replaceState({ ...history.state, bottomSheet: false }, '')`. Ver `HeaderAvatarMenu.go` (linhas do menu da conta). _(O antigo `useOperationModal.classifySample`, outro exemplo deste padrao, foi removido em 2026-07-12 — DSB-D2.)_
- Focus trap via `useFocusTrap`; `role="dialog"` + `aria-modal="true"`
- `translate3d` permanente: GPU layer; previne scroll lock iOS standalone PWA
- **Renderiza via `createPortal(document.body)`** (igual ao MobileTabbar): o sheet `position: fixed` escapa do contexto de empilhamento de onde o componente esta montado. Por isso pode ser montado em qualquer lugar (ex: dentro do header de uma pagina, como o `HeaderAvatarMenu`) sem ficar atras do conteudo.
- **`stacked` (sheet SOBRE outro sheet/modal):** a prop `stacked` eleva backdrop+sheet pro tier `--z-modal-stacked` (600/610, via `.bottom-sheet(-backdrop).is-stacked`) — acima do `--z-modal` do overlay de baixo — e **delega a history ao overlay-pai** (nao injeta entry propria). O **scroll-lock do body** + a classe **is-bottom-sheet-open** sao **ref-contados** (module-level `sheetStack`/`openIntentCount`: travam no 0→1 e restauram no 1→0), entao fechar o sheet de cima NAO destrava o scroll nem reexibe a tabbar enquanto o de baixo segue aberto. **ESC e back** so atuam no sheet do **TOPO** (gating por `sheetStack`). Sheet sozinho → comportamento identico ao anterior (stack chega no maximo a 1). No overlay-pai, use `dragDisabled={filhoAberto}` pra pausar o arraste dele enquanto o de cima esta aberto. Ex.: `ClientQuickCreateModal` ("Novo proprietário") sobre o `NewSampleModal` ("Novo lote"). Confirm de descarte do sheet de cima vai como **overlay INTERNO** (`position:absolute; inset:0`, como o overlay de sucesso) — evita um 3º tier de z-index.
- **`manageHistory` (F1 do redesign, 2026-07-20):** com `manageHistory={false}` o sheet NAO injeta entry de history propria (arbitro de `popstate` desligado) — o abrir/fechar pertence a quem controla a **URL** (ex.: `DetailOverlay` dirigido por query param: o back fecha porque consome a entry da propria URL). Diferente de `stacked`: mantem o tier de z-index BASE e continua participando de `sheetStack` (ESC/scroll-lock/tabbar). Default `true`.
- **Conteudo congelado no close:** ao fechar (`open=false`), o sheet fica montado por `ANIMATION_MS` (460ms) pro slide-down e renderiza um **snapshot do ultimo estado aberto** (children/title/footer/className/ariaLabel). Se o consumidor recomputar os props pro proximo estado durante o close (ex: trocar `flowState`), o conteudo e a altura **nao** mudam no meio da saida — evita o sheet "crescer + trocar de body" enquanto desce. Durante o close o `.bottom-sheet` fica `pointer-events: none` (sem clique fantasma no footer congelado). Snapshot gravado via layout-effect; ao reabrir volta aos props ao vivo.
- **Variante `.is-menu` (altura por conteudo):** `className="is-menu"` troca a altura fixa alta por `height: auto` + `max-height: min(72dvh, 30rem)`, pro sheet encolher ao conteudo (poucas linhas em vez de ocupar quase a tela). Usada pelo menu da conta no header mobile (`components/HeaderAvatarMenu.tsx`): botao de avatar (`.header-avatar-trigger`, mobile-only, substituiu o antigo sino) que abre um launcher com resumo (`UserAvatar` md a esquerda + coluna nome/cargo, classe `.header-avatar-menu-summary-text`) + linhas Perfil/Usuarios(adm)/Sair — cada linha fecha o sheet e navega. _(O "Resumo" migrou pra Relatorios na unificacao do `/informe`; a row "Metricas" foi removida em 2026-06-23 junto com a pagina.)_ **Excecao ao chrome do BASE:** sem titulo verde visivel (`title=""`) — o resumo ja encabeca o menu; o `<h3>` fica vazio mas presente, entao o X segue a direita (header `space-between`) e a altura nao muda; nome acessivel do dialog via `ariaLabel`.
- **Variante `.is-fit-content` (altura por conteudo, teto do BASE):** `className="is-fit-content"` so faz `height: auto` (NAO reduz o `max-height`, que segue o do BASE — ~tela cheia menos 8rem). Diferente da `.is-menu`/`.is-operations` (que apertam o `max-height` pra menus curtos), e pra FORMULARIOS curtos que precisam do teto alto quando crescem: o sheet encolhe ao conteudo (footer logo abaixo do ultimo campo, sem o vao do `flex:1` num form curto) mas rola ate quase a tela se preciso. Usada pelo `NewSampleModal` (Nova Amostra).
- **Variante `.is-operations` (lista de pendencias do dashboard) — CSS MANTIDO mas SEM USO desde 2026-07-12 (DSB-D2):** o `OperationModal` foi **removido**; estas regras ficam para o rebuild do fluxo de classificar-a-partir-da-fila na pagina de Lotes. Compartilha a altura-por-conteudo da `.is-menu`. Era usada pelo `OperationModal` ("**Lotes pendentes**"). O chrome (header claro etc.) e o do BASE — aqui sobra so o conteudo: lista (`.app-modal-list` com `max-height`/`overflow` neutralizados pro scroll ficar so no `.bottom-sheet-body`) e **cards no visual do card de Lotes (`.spv2-card*`)** colapsados/inertes, com **botao-seta quadrado de classificar** (`.spv2-card-classify-arrow`) no lugar do chevron. **Recuo lateral no body, nao no sheet:** diferente do BASE (recuo horizontal no `.bottom-sheet`, que NAO recorta), o `.is-operations` zera o padding lateral do sheet e move pra `.bottom-sheet-header` + `.bottom-sheet-body` (var `--ops-inset-x`). Como o body tem `overflow-x: hidden`, encostar os cards na borda dele decepava a `box-shadow` rente ao card (divisao dura card/borda); com o recuo no body, a sombra dissipa DENTRO do padding antes do corte. Mesma largura de card de antes — so muda onde o corte acontece. **2026-06-22 (pedido do usuario): o modal e BRANCO `#fff`** (`.bottom-sheet.is-operations` sobrescreve o creme do `.bottom-sheet` base) **+ cards tambem BRANCOS** (`background:#fff`, sai o gradiente quente do `.spv2-card` base) **com sombra da borda reforcada** (`.bottom-sheet.is-operations .spv2-card.is-static` ganha box-shadow propria, ~`0 8px 20px /.16` no meio) pra se definirem sobre o branco. Vale mobile (sheet) E desktop (modal central — mesmo elemento).
- **Modal de novo cliente (`.client-quick-create-sheet`, `ClientQuickCreateModal`) — superficie BRANCA** (`#fff`, pedido do usuario 2026-06-23): nao e uma variante de altura, e o BASE com override de cor — `.bottom-sheet.client-quick-create-sheet` sobrescreve o creme do `.bottom-sheet` base **e** o `.bottom-sheet-footer` (que tem fundo creme proprio, nao herda) pra a faixa das acoes (Cancelar/Cadastrar) tambem ficar branca. Campos (`.chip-select`/inputs) ja sao `#fff` com borda 2px, entao se definem sobre o branco pela borda. Vale mobile (sheet) E desktop (modal central — mesmo elemento). Espelha is-menu/is-operations.

**Modais aninhados sobre o sheet:** classes `.is-stacked` no `.app-modal-backdrop` + `.app-modal` elevam pra `var(--z-modal-stacked: 600)` (ex: o confirm "Descartar?" sobre um sheet). _(Sheet SOBRE sheet usa `.bottom-sheet.is-stacked` — ver bullet "stacked" acima. Ex.: `ClientQuickCreateModal` "Novo proprietário" sobre o `NewSampleModal`, com o "Descartar?" como overlay INTERNO.)_

- **Variante `.is-informe` (formularios de visita/relatorio):** torna o formulario NATIVO do sheet — as secoes `.inf-card` sao achatadas (sem fundo/sombra/borda de card; divisorias suaves entre secoes) e o `.inf-form` ganha padding lateral proprio (o `.bottom-sheet-body` nao tem padding horizontal; sem isso os cards batiam na borda do modal). Usada pelos sheets do prospector (`components/visits/VisitReportFormSheet`) e do comercial (`components/informe/CommercialVisitFormSheet` + `WeeklyReportFormSheet`). Confirm de descarte `.is-stacked` quando ha dados preenchidos (mesmo padrao do NewSampleModal).

**FAB de criar da /samples = LEQUE (speed-dial)** (`SampleCreateRadialFab`, modo `idle`): tap no "+" abre 2 opcoes circulares em ARCO de quarto de circulo — **Lote** (grao de cafe — **mesma silhueta do icone da aba "Lotes"**, `renderNavIcon('samples')` em `AppShell`: elipse inclinada 28° + fenda em S; o traco verde mais grosso vem do `.fab-fan-option-icon`) ACIMA do FAB e **Liga** no DIAGONAL a 45° — que emergem dele (a opcao **Aprovacao** saiu na AP29 — a geracao da etiqueta mora so na sub-aba Aprovacoes; a classe `.is-aprovacao` segue viva, reusada pelo `InformeCreateRadialFab`) (classes `.fab-fan-*` + `.is-lote`/`.is-liga`/`.is-aprovacao`; `scale 0.2→1` com `transform-origin` no lado do FAB + stagger varrendo do topo pra esquerda). Cada opcao tem o **rotulo centralizado ABAIXO do icone** (`.fab-fan-option-label` `position: absolute`, fora do fluxo — o botao tem o tamanho do circulo, entao a ancoragem por `right`/`bottom` mira o circulo e o arco fica uniforme independente do comprimento do texto). A pagina escurece com scrim no **tier de modal** (`.fab-fan-backdrop`, `rgba(0,0,0,0.55)` sem blur, `z: var(--z-modal-backdrop)` — ACIMA da tabbar z-70, bloqueia cliques; tap-fora fecha) e o FAB **encolhe + vira circular** com "×" (`.cv2-fab.is-expanded`, `z: var(--z-modal)`). Opcoes ancoradas nas vars `--fab-*`/`--fan-*`/`--fan-radius` de `.samples-page-v2:not(.informe-commercial-page)` (alinham com o FAB sozinhas; Liga usa `--fan-radius * 0.7071` no diagonal). Renomeado "Amostra"→"Lote". O **MESMO leque** (`.fab-fan-*`) e usado pelo `InformeCreateRadialFab` (3 opcoes + icone lapis, ver §"/informe"); o drawer antigo `.fab-menu-*` foi REMOVIDO. Tap-feedback so scale; guard de `prefers-reduced-motion` (so fade).

### DetailOverlay (detalhe-como-overlay — contentor canonico do redesign)

> Componente: `components/DetailOverlay.tsx` (casca fina sobre o `BottomSheet` com `className="detail-overlay"`, `manageHistory={false}`, `dragToDismiss={false}`; aceita `footer` — acoes fixas no rodape — e `className` extra pra overrides escopados do conteudo). E o contentor canonico de DETALHE do redesign (RD5): a pagina de detalhe morre e o conteudo abre como overlay **dirigido por URL** sobre a pagina de lista. Usos: detalhe do cliente em `/cadastros?cliente=<id>` (F1, 2026-07-20) e detalhe do contrato em `/contratos?details=<id>` (F3, 2026-07-20 — classe extra `.ctr-details-overlay` devolve o respiro/fundo que o conteudo `.ctr-details-*` esperava do sheet). Replicar este molde ao migrar outros detalhes.

- **Mobile**: sheet de TELA CHEIA (`--bottom-sheet-top-gap: 0`, sem raio, sem padding lateral — o conteudo carrega o proprio padding). **Desktop (>=901px)**: painel lateral DIREITO (peek) `min(620px, 92vw)`, desliza da direita, com a lista VIVA atras — o backdrop fica transparente e **atravessavel** (`pointer-events: none` no backdrop + `auto` no sheet; `display:none` NAO serve, o sheet e filho do backdrop) — clicar noutro card TROCA o item aberto. CSS no bloco `.detail-overlay` do `globals.css`.
- **URL e history (molde do `/cadastros`)**: `?cliente=<id>` aberto / ausente fechado. Abrir = `router.push` (+ flag `openedByPushRef`); trocar de item com o overlay aberto = `router.replace` (mantem UMA entry — back fecha em 1 passo); fechar = `router.back()` se abriu por push, senao `router.replace` limpando o param (deep-link/refresh). O back fecha o overlay porque consome a entry da propria URL — por isso `manageHistory={false}` no sheet (ver bullet na API acima).
- **Modais internos (GOTCHA de z-index)**: o overlay fica no tier BASE do sheet (400/410) — **NAO usar `stacked`** (600 ficaria ACIMA dos modais centrais internos, tier 500). Os modais abertos de dentro do conteudo devem renderizar via `createPortal(document.body)` — dentro do sheet, o `transform` permanente do `.bottom-sheet` vira containing block do `position: fixed` (ver `modals` §9). Com modal interno aberto, passar `dismissGuardRef` (ref boolean) pro overlay — ESC/X do overlay nao fecham enquanto `true`.
- **Conteudo**: o miolo da antiga pagina de detalhe vira componente (ex.: `components/clients/ClientDetailView.tsx`) montado como children; regras de coluna unica pro peek (620px nao comporta grids 2-colunas do desktop) entram escopadas em `.bottom-sheet.detail-overlay`.
- **Swap pra outro sheet a partir de uma acao do overlay (GOTCHA)**: rode o swap **POS-fechamento** — um ref com o callback pendente + um efeito que observa o param sair da URL (ver `afterDetailsCloseRef` no `ContratosPanel`). Abrir o proximo sheet no mesmo tick do `router.back()` faz o popstate atrasado engolir a entry de history que o sheet novo injeta — ele fecha sozinho logo apos abrir. E o primo, pra overlay por URL, do gotcha "navegar a partir de uma acao do sheet" da secao Bottom Sheet.

### Side-sheet (`.side-sheet` — form de criacao/edicao como painel lateral no desktop)

> NAO e componente novo: e uma **classe CSS** aplicada no `className` de um `BottomSheet` comum (ex.: `className="is-fit-content side-sheet"` no `NewSampleModal`; `client-quick-create-sheet side-sheet` no `ClientQuickCreateModal`). No **mobile nada muda** (sheet de baixo, como sempre); em **desktop (>=901px)** o CSS transforma o sheet num **painel lateral DIREITO** com a MESMA geometria do peek do DetailOverlay: `width: min(620px, 92vw)`, ancorado top/right/bottom, sem raio, desliza da direita (`translate3d(100%,0,0)` → `(0,0,0)` no `.is-open`), `border-left` hairline + `--shadow-xl`. Bloco `.bottom-sheet.side-sheet` no `globals.css`. Em producao desde 2026-07-20 (commits `875c777`/`7a2abbe`, extensao da F2 do redesign).

**Mesma geometria do DetailOverlay, contrato DIFERENTE** (diferencas deliberadas):

|                  | DetailOverlay (detalhe)                             | `.side-sheet` (criacao/edicao)                                                      |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Backdrop desktop | transparente + atravessavel (lista viva e clicavel) | **ESCURO BLOQUEANTE** (o padrao do sheet): form tem estado sujo, lista nao clicavel |
| URL              | dirigido por query param (`?cliente=`/`?lote=`)     | **SEM URL** — criar nao e recurso enderecavel                                       |
| History          | `manageHistory={false}` (a URL manda; back = URL)   | default (`true`) — o arbitro de popstate do proprio BottomSheet cuida do back       |
| Empilhamento     | tier BASE (modais internos 500 abrem POR CIMA)      | lateral-sobre-lateral via `stacked` (600) — o de cima desliza POR CIMA              |

- **Quando usar**: forms de **criacao** e **edicao** (regra de conteiner RD11 — arvore de decisao na skill `modals`). Detalhe de recurso → DetailOverlay; operacoes/avisos/confirms → centrais.
- **Lateral SOBRE lateral = push de navegacao**: um side-sheet aberto de dentro de outro (ex.: `ClientQuickCreateModal` "Novo proprietario" sobre o `NewSampleModal`) usa o padrao `stacked` normal — o de cima desliza cobrindo o de baixo pela mesma borda direita; fechar revela o form de baixo intacto. Nada de novo alem da classe.
- **Aplicado em**: `NewSampleModal` (Novo lote) e `ClientQuickCreateModal` (Novo cliente — padrao do componente em TODOS os contextos, sem prop). Os demais forms de criacao/edicao migram **pagina a pagina** no ciclo da FV (piloto `/cadastros` ja migrou os dele — ver "Paineis do detalhe" abaixo) — NAO converter isoladamente; ver `docs/Redesign-Plano-de-Trabalho.md` §2.5 e o inventario na skill `modals` §11.

### Paineis do detalhe (`.client-panel-sheet` + `closeVariant="edge-back"` — molde FV, rodadas 5–6 do piloto)

> Extensao do `.side-sheet` para os modais abertos DE DENTRO de um detalhe (drawer/DetailOverlay):
> criar/editar sub-recursos (filial, conta), preview e upload de anexo, editar o proprio recurso.
> Exemplares canonicos: `ClientUnitModal`, `ClientUnitDetailModal`, `ClientBankAccountModal`,
> `ClientBankAccountDetailModal`, `ClientAttachmentPreviewModal`, `ClientAttachmentAddModal` e o
> editor de cliente (BottomSheet inline no `ClientDetailView`). Replicar este molde nas proximas
> paginas do ciclo.

Receita (BottomSheet comum, sem componente novo):

- `stacked` + `closeVariant="edge-back"` + `className="client-panel-sheet side-sheet"`
  (+ classe especifica). Desliza da direita POR CIMA do drawer (mesma faixa de 620px); mobile
  empilha como bottom sheet. Sem `createPortal`/`useFocusTrap`/early-return proprios — o
  BottomSheet cuida (renderizar sempre; `open` controla).
- **Seta ← na borda = Cancelar** (`closeVariant="edge-back"`): circulo hairline METADE pra fora
  da borda esquerda no desktop (`.has-edge-close` libera `overflow: visible` + **header vira
  `position: static`** — sem isso o absolute ancora na caixa interna do header, nao no sheet);
  no mobile a seta fica no fluxo, ANTES do titulo. **O botao "Cancelar" textual MORREU** nos
  forms de criacao (a seta cancela); o "Cancelar" INTERNO do modo edicao de um view↔edit volta
  pro view (nao fecha o painel).
- **Submit no footer sticky** do sheet: form ganha `id` e o botao vai em `footer` com
  `form={id}` (`.app-modal-submit`, "Salvar"/"Criar X").
- **Guards**: `onDismissAttempt={() => !saving && !success && !dismissLocked}` +
  `dragDisabled={saving || success || dismissLocked}` (drag past-threshold com dismiss negado
  deixa o sheet deslocado — sempre pausar o drag nesses estados). `dismissLocked` = prop pra
  travar o painel enquanto um aviso aberto POR ELE esta na frente.
- **Avisos/confirms sobre o painel**: continuam dialogos centrais, mas o backdrop ganha
  `.fv-panel-scrim` — z `calc(var(--z-modal-stacked) + 20)` (acima dos paineis 600/610) e, no
  desktop, scrim escuro cobrindo SO a faixa direita de 620px (dialogo centrado DENTRO da area
  do painel; mobile = viewport inteiro). Confirms internos curtos (ex.: "Descartar?" do
  quick-create) podem ser overlay `position:absolute; inset:0` dentro do sheet — mesmo efeito.
- **Sucesso = check canonico** (`components/SuccessCheckOverlay.tsx`, filho DIRETO do conteudo
  do BottomSheet): overlay branco cobrindo o painel com circulo+tick por ~1s; acoes que fecham
  agendam o close no timeout. Frases "... com sucesso" nao existem mais nesses fluxos.
- **View espelha o edit**: modo visualizacao de um detalhe usa caixas com borda
  (`.cudm-view-value`, geometria EXATA do input do painel, vazio = "—" muted) na MESMA ordem do
  form de edicao — entrar em Editar nao muda a cara do painel.
- ESC/back fecham so o painel do TOPO (`sheetStack`); o `dismissGuardRef` do DetailOverlay segue
  como cinto (`anyModalOpen`). CSS do molde: bloco `.client-panel-sheet` no `globals.css`.

### Pagina /informe = "Relatorios" (role-adaptive; unifica o antigo /resumo)

- A rota `/informe` e a pagina **"Relatorios"** (`app/informe/page.tsx`); `/resumo` redireciona pra ela (server-side). **ACESSO UNIFICADO (2026-07-15):** guard `INFORME_ROLES` = `NON_PROSPECTOR_ROLES` — **todo papel nao-PROSPECTOR** (ADMIN, CLASSIFIER, REGISTRATION, COMMERCIAL, CADASTRO) entra como VIEWER unico; o antigo ramo "meus" do COMMERCIAL foi aposentado.
  - **Viewer (todo nao-PROSPECTOR, `isVisitReportViewer`)** → `components/informe/RelatoriosViewer.tsx`: feed de TODOS (`scope=all`, 3 tipos) + curadoria de vinculo, shell `.sdv-page`/`.rsm-content` (ver §1 item 5). Todos criam — `canCreate` fixo renderiza o `InformeCreateFab` em `.rsm-fab-anchor` (vars do leque proprias do viewer).
  - _(REMOVIDO 2026-07-15)_ o ramo **COMMERCIAL** `InformeCommercialPage.tsx` (feed `scope=mine`, shell `.samples-page-v2.informe-commercial-page`) foi apagado; o comercial usa o viewer acima. O CSS `.informe-commercial-page` residual pode ser limpo em follow-up.
  - Ate 2026-07-14, **CLASSIFIER, CADASTRO e REGISTRATION** NAO acessavam (item filtrado da tabbar, Perfil no 5o slot); agora acessam como os demais. _(A pagina **/metrics** e a logica `isMetricsNavRole` foram **REMOVIDAS** em 2026-06-23 — era so um placeholder "Em construcao"; nao ha mais item Metricas em navbar/menu/sidebar.)_
- **Formulario de Visita (`CommercialVisitForm`)**: as duas pilhas de "Identificacao do cliente" terminam num `Client` do cadastro. "Ja cadastrado" = `ClientLookupField`; "Cliente novo" = os campos de anotacao (nome/cidade/telefone) + CTA `.inf-newclient-cta` que abre o `ClientQuickCreateModal` (prefill do que foi digitado, `initialPersonType="PF"`). Depois de criar, o CTA da lugar ao chip inerte `.inf-newclient-linked` (nome canonico + codigo + "×" pra soltar). **O modal e renderizado FORA do `<form>`** — o BottomSheet usa portal, mas eventos de portal sobem pela arvore React e o submit dele chegaria ao `onSubmit` da visita (mesmo arranjo do `NewSampleModal`).
- O FAB de criar (Visita comercial + Relatorio semanal) foi extraido pra `components/informe/InformeCreateFab.tsx`, hoje usado por todo nao-PROSPECTOR (viewer unico).
- **FAB radial de LAPIS** (`InformeCreateRadialFab`): usa o MESMO **leque** (`.fab-fan-*`) da /samples, com 3 opcoes — **Visitas** (prancheta-check) na posicao `is-lote` (acima do FAB), **Informativo** (imagem/montanha) na `is-liga` (diagonal a 45°) e **Relatório** (calendario) na `is-aprovacao` (esquerda). Diferenca vs /samples: a variante `.cv2-fab.is-informe-fab` mantem o **icone LAPIS** (DOIS svgs empilhados lapis ↔ × em **crossfade**, neutraliza o rotate 45° do "+"). Escurece a tabbar via `body.is-fab-fan-*` (igual /samples). Vars `--fab-*`/`--fan-*` em `.samples-page-v2.informe-commercial-page` (`--fab-right` = right real do FAB do informe, que NAO e reposicionado como o do Lotes). O drawer antigo `.fab-menu-*` foi removido. **O leque SEMPRE abre**: Visitas e Informativo valem p/ todo nao-PROSPECTOR, entao ha no minimo 2 opcoes — o atalho antigo (`!canCreateWeekly` abria a visita direto, sem leque) saiu quando o Informativo entrou. **Pegadinha:** era esse atalho que escondia o "Relatório" de quem nao e autor do Semanal; hoje a condicao e EXPLICITA no JSX, senao um CLASSIFIER veria um botao que o backend recusa com 403.
- **Informativos** (`InformativoFormSheet` + `InformativoForm`, opcao "Informativo" do leque): BottomSheet (`.is-informe.is-informativo`) com **3 FASES** — mercado (21 campos) → meteorologico (6 campos, **pulavel**) → revisao. Gera PNGs 1080×1920 (story 9:16) desenhados em `<canvas>` no cliente; **nada e salvo** (sem rota de API, sem banco). **As acoes ficam no `footer` do BottomSheet** (uma por fase, `.ifm-footer-actions`), nao inline: na revisao o corpo rola DUAS pecas 9:16. O titulo do sheet muda por fase (o `.bottom-sheet-title` ja tem `aria-live`). O `shareOrDownloadFiles` entrega as duas (um share sheet no celular, 2 downloads no PC) e cada peca tem um "Baixar" proprio — cada botao e um gesto, entao nao dispara o aviso de "varios downloads" do Chrome.
  - **`PrevisaoPicker`** (`.ifm-drop-*`): a previsao do tempo e um **print colado** pelo usuario (colar/arrastar/escolher), nao uma API — ver `docs/Informativos-Plano-de-Trabalho.md` §4.3. **Armadilha:** arquivo solto FORA da caixa faz o browser navegar ate ele e os campos digitados evaporam; o picker recusa `dragover`/`drop` no `window` enquanto vive.
  - CSS proprio no prefixo **`.ifm-`**, herdando o achatamento de cards do `.is-informe`. As cores do toggle de direcao (`.ifm-dir.is-alta/.is-baixa`) sao hex da **peca**, nao tokens do app — a fonte-da-verdade e o `COLORS` de `lib/informativos/story-layout.ts` (mexeu num, mexeu nos dois).
  - **Icone DENTRO da peca** (rodape: instagram/e-mail/telefone) e `PathOp` — sub-paths de um viewBox 24×24 (a MESMA convencao Lucide dos icones da UI) desenhados via `Path2D` com translate+scale. Nao usar fonte (a Poppins nao tem os glifos → fallback) nem PNG (borra em 1080). `strokeWidth` fica em unidades do viewBox e escala junto, como no SVG.
  - Especificacao visual: `docs/Informativos-Plano-de-Trabalho.md` §5 (Mercado) e §5-B (Meteorologico). **Gotcha reusavel para qualquer canvas:** o next/font hasheia o nome da Poppins — ler a CSS var `--font-family-sans` (`resolveFontFamily` em `lib/informativos/story-draw.ts`), senao `ctx.font` cai em fallback silenciosamente.
- Feed proprio (scope=mine): cards `rsm-*` seguem o **visual do `.spv2-card`** (gradiente branco→`#faf8f4` + sombra leve de 3 camadas do Lotes, tap `scale(0.98)`, SEM hover de cor, SEM barra lateral; chevron verde ao expandir) — por tipo com **badge `.rsm-type-badge`** (`.is-visit` verde / `.is-weekly` azul / `.is-prospect` ambar — pill uppercase no canto direito do `.rsm-card-head`; convive com a lixeira via margin-right em `.has-quick-delete`); lixeira + confirm central; "Carregar mais" (mecanica rsm — o espelhamento da /samples e o shell visual, nao o cursor/sentinel)
- Relatorio semanal: campo read-only `.informe-week-label` ("Semana de DD/MM a DD/MM", espelho client-side `lib/weekly-report.ts`); 409 do servidor abre modal central de aviso `.is-stacked` ("Relatório já enviado", botao unico "Entendi") — regra bloqueante → modal, conforme skill feedback-messages
- O viewer Relatorios (`RelatoriosViewer`, todo nao-PROSPECTOR desde 2026-07-15) consome o mesmo feed (scope=all) e renderiza os 3 tipos: `VisitReportCard typeBadge="Prospecção"`, `CommercialVisitCard` (twin do `VisitReportCard` — mesmo card + curadoria, ver abaixo), `WeeklyReportCard`
- **Curadoria do vinculo (cards de Prospecção E visita comercial no viewer Relatorios)**: o formulario do prospector e DECLARACAO sem lookup ("Já é cliente" pede so o nome; "Cliente novo" tambem cidade/telefone, texto livre), entao o card mostra o **nome anotado** ate alguem vincular. Badge `.rsm-client-tag.is-pending-link` ("Aguardando vínculo", paleta ambar do `.is-prospect`) pra todos os viewers via prop `showLinkStatus`; todo nao-PROSPECTOR (`isVisitLinkCurator`, ACESSO UNIFICADO 2026-07-15) ganha acoes `.rsm-link-actions`/`.rsm-link-btn` no detalhe expandido (Vincular cliente; vinculado → Alterar/Remover vínculo `.is-remove` ambar). Cadastrar cliente novo nao e botao do card — vem do estado vazio do lookup no modal (ver abaixo). Modal de vinculo `.app-modal.is-themed.sample-detail-lookup-modal.rsm-link-modal` (portal) com bloco de contexto `.rsm-link-context` (anotado pelo prospector) + `ClientLookupField initialSearch` (sugestoes no primeiro foco) + estado vazio com CTA "Cadastrar e vincular" → `ClientQuickCreateModal` prefilled (PF/vendedor/`initialPhone`) que vincula no `onCreated`. Card vinculado mostra o nome canonico do cadastro + "Anotado na visita"/"Vinculado por" no detalhe. Dashboard do prospector NAO recebe nada disso (props default false). **Visita comercial (2026-06-18):** o `CommercialVisitCard` virou TWIN do `VisitReportCard` (mesmo client-block — cidade/telefone no detalhe expandido, "Aguardando vínculo" abaixo do nome via `.rsm-client-pending`) e adota a MESMA curadoria — PORÉM so quando `clientKind=NEW`: EXISTING NAO e curável (mostra so "Código X", sem ação). **Desde 2026-07-10 as DUAS opcoes do formulario comercial nascem vinculadas** (o "Cliente novo" cadastra o Client ali), entao a curadoria virou CORRECAO e "Aguardando vínculo" so aparece em visita legada ou desvinculada pelo ADMIN; o card exibe o nome canonico do cadastro sempre que ha vínculo. Backend espelhado: `linkCommercialVisitClient` (rota `PATCH /commercial-visits/[visitId]/client`; trio `linked_by_user_id`/`linked_at` no `commercial_visit`; rejeita EXISTING com `COMMERCIAL_VISIT_NOT_CURATABLE`). O viewer Relatorios generaliza o fluxo de vínculo (tipo `LinkableVisit`) despachando por `item.type`. O card novo (cidade/telefone no expandido) vale tambem no `/informe` do proprio comercial — sem vincular ali (só o visual)

### Modal central (`.app-modal.is-themed`)

> Padrao canonico documentado em detalhe na skill `modals` (`.claude/skills/modals/SKILL.md`). Esta secao e apenas resumo — sempre consultar a skill `modals` ao construir/editar modal.

**Resumo**: backdrop glass + container 38rem (`.is-themed`) ou 46rem (`.is-wide`), header verde brand, body branco, fields `.app-modal-field/.app-modal-input`, actions `[.app-modal-submit, .app-modal-secondary]` na ordem JSX (Submit primeiro). Variante destrutiva `.app-modal-submit.is-danger`. Variante de ACAO `.is-action` (header claro + titulo verde a esquerda + X claro + backdrop escuro sem blur) pra modais centrais que sao form que o usuario opera — ver `modals` §3.

```jsx
<div className="app-modal-backdrop">
  <section className="app-modal is-themed [is-wide]">
    <header className="app-modal-header">
      <div className="app-modal-title-wrap">
        <h3 className="app-modal-title">Titulo</h3>
      </div>
      <button className="app-modal-close" aria-label="Fechar">
        <span aria-hidden="true">×</span>
      </button>
    </header>
    <form className="app-modal-content" onSubmit={...}>
      <label className="app-modal-field">
        <span className="app-modal-label">Campo</span>
        <input className="app-modal-input" />
      </label>
      <div className="app-modal-actions">
        <button type="submit" className="app-modal-submit">Salvar</button>
        <button type="button" className="app-modal-secondary">Cancelar</button>
      </div>
    </form>
  </section>
</div>
```

Animacao de entrada coberta pelos keyframes `app-modal-backdrop-in` (0.3s) e `app-modal-card-in` (0.35s, fade + scale subtil) — nao inventar transicoes proprias.

## 9. Tipografia de Secao

### Hierarquia

| Elemento                       | Tamanho                         | Peso    | Cor                                                                   |
| ------------------------------ | ------------------------------- | ------- | --------------------------------------------------------------------- |
| Titulo de pagina (sobre verde) | `clamp(1.8rem, 7.5vw, 2.5rem)`  | 700     | `#ffffff`                                                             |
| Saudacao/label (sobre verde)   | `clamp(1.1rem, 4.5vw, 1.35rem)` | 400     | `rgba(255,255,255,0.7)`                                               |
| Cargo/meta (sobre verde)       | `clamp(0.72rem, 3vw, 0.82rem)`  | 400     | `rgba(255,255,255,0.5)`                                               |
| Titulo de secao (sobre bege)   | `clamp(18px, 5vw, 20px)`        | 700     | `#1a1a1a`                                                             |
| Subtitulo                      | `clamp(12px, 3.2vw, 13px)`      | 400     | `#999`                                                                |
| Label uppercase                | `clamp(9px, 2.6vw, 10px)`       | 600     | com opacidade, `letter-spacing: 0.8-1px`, `text-transform: uppercase` |
| Corpo de card                  | `clamp(11px, 3vw, 12px)`        | 400-500 | `#555`                                                                |
| Valor numerico destaque        | `clamp(36px, 11vw, 44px)`       | 700     | cor do contexto                                                       |

## 10. Elementos Decorativos

### Graos de cafe (SVG)

- Usados como textura sutil em headers verdes
- Elipse com fenda curva central (sulco do grao):
  ```svg
  <svg viewBox="0 0 20 28">
    <ellipse cx="10" cy="14" rx="8.5" ry="12.5" fill="currentColor" />
    <path d="M10 2.5c-1.8 4-2.2 8-0.5 11.5s1.8 7.5 0.5 11.5" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1.4" stroke-linecap="round" />
  </svg>
  ```
- Cor branca (`color: #ffffff`) com opacidade muito baixa (0.04 a 0.08)
- Distribuicao organica: varios tamanhos e rotacoes, `position: absolute`, `pointer-events: none`
- Quantidade: 6-10 por header, nunca exagerado

### Indicadores de legenda (dots)

- `width/height: clamp(8px, 2.5vw, 10px)`, `border-radius: 50%`
- Animacao pulse: `scale(1) → scale(1.2) opacity(0.7) → scale(1)`, `2s ease-in-out infinite`

## 11. Stacked Bar (barra de distribuicao)

- `height: clamp(8px, 2.5vw, 10px)`, `border-radius: 5px`
- Segmentos proporcionais separados por `gap: clamp(1px, 0.5vw, 2px)`
- Cada segmento tem cor do status e `border-radius: 5px`
- `min-width: clamp(4px, 1.5vw, 6px)` para segmentos pequenos nao sumirem
- Estado vazio: barra unica em `#e8e3d5`

## 12. Alertas Inline

- Fundo: `rgba(cor, 0.03)` (quase transparente)
- `border-top: 1px solid rgba(0,0,0,0.04)`
- Icone de atencao SVG + texto em `font-weight: 600`
- Cor do texto e icone na cor do status (ex: `#C0392B` para alertas criticos)

## 13. Toasts (feedback transiente global)

Para feedback nao-bloqueante vindo de acoes globais (bipador, API, navegacao), usar o sistema de toast em `lib/toast/ToastProvider.tsx`. Nao inventar componentes proprios de notificacao.

### Quando usar toast vs outras opcoes

- **Toast** — acao concluida ou falhou, feedback transiente que nao exige acao do usuario. Ex: "Amostra L-12345 encontrada", "QR nao reconhecido", "Sessao expirada".
- **Alerta inline** (secao 12) — estado persistente de uma area da pagina. Ex: aviso de que uma amostra esta invalidada.
- **Erro dentro do campo** — erro de validacao de formulario. Ex: "Obrigatorio" no input de sacas.
- **Modal de confirmacao** (ver `app-confirm-modal` em globals.css) — acao destrutiva ou navegacao que descarta trabalho nao-salvo.

### API

```tsx
import { useToast } from '@/lib/toast/ToastProvider';

const toast = useToast();
toast.success({ title: 'Lote criado', description: 'Lote 12345' });
toast.error({ title: 'Falha ao salvar', description: err.message });
toast.info({ title: 'Amostra ja aberta' });
```

### Posicao

- **Mobile** (< 901px): centro inferior, respeitando `safe-area-inset-bottom`
- **Desktop** (>= 901px): canto inferior direito

### Variantes

- `success` — verde (`--color-success`), icone de check
- `error` — vermelho (`--color-danger`), icone de alerta
- `info` — azul (`--color-info`), icone de info
- Barra lateral de 4px na cor da variante, fundo cream translucido

### Duracao padrao

- 4s auto-dismiss. Para toasts que levam o usuario a outra tela (ex: "abrindo..."), usar `durationMs: 2600`.
- Maximo de 3 visiveis simultaneamente — os mais antigos sao descartados.

### Dirty state e modal de confirmacao

Telas com estado nao-salvo devem se registrar via `useRegisterDirtyState('chave', isDirty, 'motivo')` em `lib/dirty-state/DirtyStateProvider.tsx`. Acoes globais (bipador, navegacao futura) consultam esse registro e mostram `app-confirm-modal` antes de descartar alteracoes.

## Checklist de Design

Ao construir ou revisar qualquer pagina:

- [ ] Fundo verde vem do app-shell (`is-dashboard-route`), header com `background: transparent`
- [ ] Header com `align-items: flex-end` (conteudo na base, proximo ao sheet)
- [ ] Sheet bege com `border-radius: 20px 20px 0 0` criando efeito 3D sobre o verde
- [ ] Cards com sombra 3D (3 camadas + inset)
- [ ] Linha lateral colorida em cards com status
- [ ] Campos com icone, fundo `#f8f6f2`, borda verde ao focar
- [ ] Erros como placeholder dentro do campo
- [ ] Botao primario com gradiente verde, nao muda cor ao clicar
- [ ] Modais como bottom sheet (nunca dropdown no mobile)
- [ ] Cores da paleta documentada (nunca cores inventadas)
- [ ] Skeleton loading no formato do componente final
- [ ] Tipografia seguindo a hierarquia definida
