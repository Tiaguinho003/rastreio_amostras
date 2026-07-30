# Shell, Navegação e Carregamento — Plano de Trabalho

Status: **8 decisões TRAVADAS · F1 e F2 IMPLEMENTADAS (2026-07-30)** — próxima é a F3 (estrutura aprovada 2026-07-24)
Escopo (1 linha): remover a atual "página de carregamento verde", tornar o **navbar/shell persistente** (nunca desmonta), fazer a transição entre páginas **sem loader full-screen** (só o conteúdo carrega), e definir a **política de cache/estado/atualização por página**.
Prefixo de decisões: **SN** (Shell & Navegação)
Documentos relacionados: `Redesign-Plano-de-Trabalho.md` (redesign visual página-a-página), `Dashboard-Visao-Geral.md`, `Lotes-Visao-Geral.md`, `Auditoria-Navegacao-por-Papel.md`, skill `page-redesign-cycle`.

> **Aviso:** as citações `arquivo:linha` foram **re-derivadas em 2026-07-30** contra o código em `main` (`dfc10a1`). Números de linha derivam; ao retomar, confirmar antes de agir.

---

## Como retomar este documento (leia isto primeiro)

Este doc tem **duas metades**:

- **Metade A — Contexto estável (§1–§3 + §9):** a fotografia de como o app funciona hoje e a arquitetura-alvo. Muda pouco. **Leia para se situar.**
- **Metade B — Decisões evolutivas (§4–§8):** o ledger de decisões, o mapa de páginas, a política de estado, o faseamento. **É onde o trabalho acontece.**

**Estado em 2026-07-30:** a reconciliação da Metade A com o código entregue pelo ciclo de redesign **foi feita** (§2 inteira re-verificada), a varredura encontrou **7 fatos que não estavam no doc** (§2.4, §2.7, §2.8) e **8 decisões foram travadas** (§4.1). Restam **2 em aberto** (SN-D2, SN-D11) e **2 derivadas a confirmar** (SN-D9, SN-D12) — a SN-D6 saiu da lista ao ser implementada na F2.

**A F1 e a F2 foram implementadas no mesmo dia.** O boot splash não existe mais (F1) e o shell parou de remontar (F2, com o `PageTransition` apagado junto). As marcas 🪦 na Metade A indicam o que caiu; o texto do "antes" fica porque é ele que explica **por que** as decisões seguintes são como são. **Próxima fase: F3** (§6) — sessão do cache, barramento de invalidação e fim do page loader. É a fase que resolve a queixa do dado velho (§2.7) e a única com um **alerta de ordem interna**: snapshot só depois do barramento.

Fluxo para uma sessão futura: ler §1–§3 → conferir §4.1 (travadas × abertas) → se for implementar, entrar pela fase correspondente no §6 → registrar no ledger o que mudar de plano.

**Pré-requisito de implementação (combinado com o Flavio):** a documentação precisa estar **completa** E a **disposição das páginas decidida** (§5.1) ANTES de escrever qualquer código. **Ambos foram cumpridos** — §5.1 fechou em 2026-07-28 (5 abas fixas) e as decisões de arquitetura fecharam em 2026-07-30.

---

# METADE A — Contexto estável

## §1. Objetivo & princípios

### Objetivo

1. **Remover** a página de carregamento verde que existe hoje (some ao entrar no app e ao transicionar entre páginas). Uma **nova** splash de entrada será criada **depois** — só apresentação do nome do app, disparada apenas na entrada após ficar **X tempo** fora (§3.5, fase futura F5).
2. **Navbar fixo (modelo _tab bar_):** o shell (navbar + chrome) **nunca desaparece** entre navegações. Intenção do Flavio (2026-07-24): o navbar funciona como **barra de abas** à la WhatsApp/Instagram — tocar numa aba dá **feedback de seleção instantâneo** e o conteúdo troca de forma **natural** (sem loader), a barra imóvel.
3. **Transição natural:** sem página de carregamento entre páginas; ao navegar, **só o conteúdo da página** carrega (skeleton/inline por área, não overlay full-screen).
4. **Estado & atualização:** definir, por página, **o que é cacheado, por quanto tempo o estado é mantido, quando revalida — e o que a invalida** (§5.2).

### Princípios (arbitram as decisões do ledger)

- **Nunca desmontar o shell.** O navbar/chrome monta uma vez e permanece.
- **Não bloquear a navegação em I/O.** Renderizar a casca imediatamente; dados chegam depois, sem tela cheia de espera.
- **Instantâneo > animação de espera.** Melhor navegação instantânea do que um loader "bonito".
- **Sem trocar verde por branco.** Remover o loader não pode expor tela branca (ver §3.3 / §6, alerta de sequência).
- **Sem trocar pisca por dado velho.** _(Acrescentado 2026-07-30, §2.7.)_ Hoje é a remontagem a cada navegação que disfarça a obsolescência. O shell persistente remove esse refresh acidental — então parar de remontar **exige** um canal de invalidação (SN-D13), ou a cura vira doença.

### Não-objetivos (fora deste doc)

- Redesign visual das páginas (isso é o `Redesign-Plano-de-Trabalho.md`).
- Mudança no backend de sessão/autenticação (contrato de `/api/v1/auth/session` fica; `middleware.ts` e `src/auth/*` não são tocados).
- Reescrever o service worker / estratégia de cache de assets (só o necessário para não regredir offline).

---

## §2. Estado atual (a fotografia)

> Re-verificada integralmente em **2026-07-30** contra `main`. As subseções §2.7 e §2.8 são novas.

### 2.1 As 5 camadas de carregamento hoje

Quando se vê "uma tela de carregamento", é **uma destas**:

| #   | Camada                                                                      | z-index         | Quando aparece                                                                                        |
| --- | --------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| 0   | **Splash nativo do SO** (PWA instalado)                                     | — (antes do JS) | Cold launch do app instalado. Vem de `manifest.background_color: #1f5d43`. **Independente do React.** |
| 1   | 🪦 **Boot splash** (`SplashScreen` + `SplashVisual`) — **APAGADA na F1**    | ~~99999~~       | ~~1ª carga por sessão de aba · volta de background ≥30min.~~ Não existe mais.                         |
| 2   | **Page loader** (`SplashVisual` com `pageLoader`, classe `.is-page-loader`) | **99998**       | Refetch de sessão de página autenticada que passa de **480ms**.                                       |
| 3   | **Telas dedicadas** `/offline` e `/maintenance`                             | página          | Sem rede · modo manutenção (não-ADMIN). UI própria — **não** é o splash.                              |
| 4   | **Loading in-page** (skeletons / spinners / "Carregando…")                  | conteúdo        | Cada fetch de dados de lista/modal/select.                                                            |

O alvo original eram as camadas **1 e 2** (e a **0** como decisão à parte). A camada 3 fica. **A camada 4 entrou no escopo em 2026-07-30 (SN-D10)** — não porque falte, mas porque **não é sistema** (§2.8).

### 2.2 A máquina do splash — de "dois controladores" para um

Era um único componente visual reutilizado por **dois** controladores independentes, coordenados só pelo z-index. **Desde a F1 (2026-07-30) sobrou um:** o `LoadingProvider` (page loader). O `SplashVisual` continua de pé **só** por causa dele — por isso nem o visual, nem o CSS, nem o logo saíram na F1 (§2.6).

| Peça                                       | Arquivo                                     | Papel                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SplashVisual`                             | `components/SplashVisual.tsx`               | Visual puro (logo `/logo-safras-branco.png` + halo + 14 partículas + barra + "Carregando…"). `aria-hidden`. Prop `pageLoader` alterna a variante.   |
| 🪦 `SplashScreen`                          | ~~`components/SplashScreen.tsx`~~           | **APAGADO na F1 (2026-07-30).** Era o controlador de **boot** (máquina de estado), montado no `app/layout.tsx` fora de todos os providers, z 99999. |
| `LoadingProvider` + `GlobalLoadingOverlay` | `components/LoadingProvider.tsx:21` / `:35` | Controlador do **page loader**. Portal p/ `document.body` (`:94`). Montado `app/layout.tsx:79`. z 99998.                                            |
| `useGlobalLoading` / `LoadingContext`      | `lib/loading/loading-context.ts:20` / `:10` | Ponte contador↔overlay (ref-counted `begin`/`end`).                                                                                                 |

**Timings:** 🪦 boot = `MIN_SPLASH_MS 1200` + `EXIT_ANIMATION_MS 700` ≈ **1,9s de piso — atraso artificial, não espera real**; **morreu na F1**, e é o maior ganho isolado do ciclo. Page loader (vivo) = `SHOW_DELAY_MS 480` (`LoadingProvider.tsx:11`) + `EXIT_MS 700` (`:13`); barra **para em 88%** (indeterminada).

**Gatilho único do page loader:** o hook `useGlobalLoading` só tem **um consumidor** no app inteiro — `useRequireAuth` (`lib/use-auth.ts:151`), com `loading` = _"o `GET /auth/session` desta página está em voo"_.

### 2.3 O fato estrutural (a causa do navbar que pisca)

**O `AppShell` (navbar + chrome) é renderizado DENTRO de cada `page.tsx`**, não no layout:

| Página        | `AppShell` em | Gate `null` em |
| ------------- | ------------- | -------------- |
| `/relatorios` | `:24`         | `:19`          |
| `/financeiro` | `:29`         | `:26`          |
| `/dashboard`  | `:34`         | `:29`          |
| `/contratos`  | `:41`         | `:36`          |
| `/cadastros`  | `:397`        | `:221`         |
| `/profile`    | `:425`        | `:227`         |
| `/users`      | `:959`        | `:581`         |
| `/samples`    | `:2501`       | `:1810`        |

- `app/layout.tsx` **não** monta o `AppShell`.

Consequência: no App Router **só o `layout` persiste**. A cada navegação, a página **desmonta e remonta** → o `AppShell` (navbar) **remonta junto** → pisca. Este é o item nº 1 a resolver para "navbar fixo".

> 🪦 **Resolvido na F2 (2026-07-30).** A tabela acima é **a fotografia de antes**, mantida porque é a justificativa da SN-D4/SN-D6. Hoje o `AppShell` é montado **uma vez**, em `app/(app)/layout.tsx`, e a sessão vem do `AuthProvider` (`lib/auth/AuthProvider.tsx`) do mesmo layout. Nenhuma das 8 páginas monta shell ou chama `useRequireAuth` — o que sobrou nelas é `useRequireRole(ROLES)` (gate de papel) ou `useAuth()`.

**A barra mobile (`components/MobileTabbar.tsx`) confirma o sintoma e a solução.** Ela já é renderizada via **portal no `document.body`** (`:70`, fora do `PageTransition`, para não herdar o `will-change:transform` que quebrava o `position:fixed`) e já traz o **efeito de seleção pronto** (`.mobile-tabbar-link.is-active` + `aria-current="page"`) — exatamente o feedback IG/WA que o Flavio quer. Mas o componente ainda vive **dentro do `AppShell` montado por página** → remonta a cada navegação, e seu gate `mounted` (`:35-43`) o **zera por um tick** (`return null`) antes de reaparecer = o "pisca". Ou seja: **o efeito de seleção já existe no código; o que o destrói é a remontagem** — precisamente o que o shell persistente (F2) elimina.

Abas mobile hoje: **5 fixas** (`MOBILE_NAV_ITEMS`, `AppShell.tsx:126`) — Início `/dashboard`, Lotes `/samples`, **Contratos `/contratos`**, Cadastros `/cadastros`, Relatórios `/relatorios`. Não há mais slot papel-dependente. Perfil, Usuários e Financeiro ficam no menu do avatar. `hideMobileTabbar = prospector` (`:400`).

### 2.4 Ciclo de vida de uma navegação hoje

1. Navega → página atual **desmonta** (AppShell junto).
2. Página destino **monta** → `useAuthState` dispara `getCurrentSession()` (`lib/api-client.ts:214`, `cache: 'no-store'` — fetch fresco, sem cache/dedup).
3. Enquanto `loading` → a página retorna `null` (gate, §2.3) → o **page loader verde** cobre o `null` se passar de 480ms.
4. Sessão resolve → conteúdo renderiza.
5. `PageTransition` (`components/PageTransition.tsx`, 300ms) anima a saída/entrada.

- **Não há indicador de navegação do router** (sem nprogress / `useLinkStatus` / barra de topo).

> 🪦 **Os passos 1, 2 e 5 caíram na F2 (2026-07-30).** Hoje: o shell **não** desmonta; `getCurrentSession()` roda **uma vez por carga**, no `AuthProvider` do layout do grupo (não uma vez por navegação); e a animação é CSS puro na `.app-shell-page-content`, reiniciada por `key={pathname}`. **Sobram os passos 3 e 4** — a página ainda é um segmento que remonta, e o page loader verde ainda cobre a espera. Quem os mata é a **F3** (sessão do cache, síncrona). O item do indicador de navegação (SN-D11) segue em aberto.

#### 🔴 F1 (2026-07-30) — `GET /auth/session` é round-trip ao BANCO

`getSession` (`src/api/v1/backend-api.js:361`) faz `resolveActorContext` (verifica o token **e** consulta `userSession` — `src/auth/database-auth-service.js:89`) e em seguida `userService.getMe(actor)`.

Como **cada página monta o seu próprio `useRequireAuth`**, **toda navegação custa uma query no Cloud SQL**. Navegar 10 vezes = 10 round-trips. Isto não é só latência percebida: é **carga de banco e custo de infra** (ver `Custo-Operacional-Analise.md`). Reforça a F3 muito além do argumento visual.

#### 🔴 F2 (2026-07-30) — `PageTransition` não é cosmético; é a peça mais cara por navegação

- `useEffect` **sem array de dependências** (`:34-39`) → `snapshotHtmlRef.current = contentRef.current.innerHTML`: **serialização do DOM inteiro para string**.
- Na navegação (`:89`) → `exitInner.innerHTML = snapshotHtmlRef.current`: **re-parse do HTML inteiro**, anexado ao documento (`:92`) e mantido por `DURATION 300` ms (`:10`) — **dobrando a contagem de nós** nesse intervalo.
- **`<canvas>` não serializa:** o simulador (React Flow, `/samples?tab=simulador`) e as peças de informativo saem **em branco** na camada de saída. Valores de `<input>` também se perdem (não viram atributo).
- É também a **causa raiz** de o `MobileTabbar` ter virado portal: o `will-change: transform` da animação torna o `.page-transition-content` o containing block de descendentes `position: fixed`.

**Consequência para o ledger:** a SN-D5 estava mal formulada. A pergunta nunca foi "manter a animação de 300ms" — é **"manter o clone do DOM"**. Reformulada como **SN-D5'** (§4.1).

> 🪦 **Executado na F2 (2026-07-30): o componente foi apagado.** Os 4 problemas acima morreram de uma vez — sem clone, não há serialização, re-parse, `<canvas>` em branco nem containing block. O que ficou no lugar são **3 linhas de CSS** (`@keyframes` de opacidade) e um `key={pathname}`. Ver a "Descoberta da F2" no §6 para o que isso obrigou a reescrever fora do componente.

### 2.5 🪦 Comportamentos "load-bearing" do `SplashScreen` — **todos caíram na F1**

> **Histórico, mantido de propósito.** O componente não existe mais desde 2026-07-30; esta seção fica porque descreve **o que mudou de comportamento** para quem for validar no device, e porque é a justificativa da SN-D3.

`resolveDestination()`: offline→`/offline`, sessão ok→`/dashboard`, 401→`/login`. No `mode==='initial'` **sempre** fazia `router.replace`.

| Comportamento de antes                                                                                 | O que acontece agora                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Deep-link a frio → `/dashboard`** (descartava o deep-link no 1º load) — era **defeito**, não recurso | ✅ **O deep-link ABRE a rota pedida.** É a correção mais visível da F1                                                  |
| **Boot offline → `/offline`** (proativo, antes da API)                                                 | O app abre normal com a sessão em cache; o SW leva a `/offline` só se o documento não estiver cacheado                  |
| **Resume após background**: re-checava sessão >30min, forçava `/dashboard` >60min                      | Nada acontece — o usuário volta onde estava. A frescura fica com a revalidação por foreground (F3)                      |
| **Flags** `splash-shown-this-session` (sessionStorage) · `splash-last-background` (localStorage)       | Ninguém mais escreve nem lê. As chaves antigas ficam órfãs nos aparelhos e são inofensivas — nenhuma limpeza necessária |

→ **SN-D3, travada e implementada na F1** — nenhum dos três sobreviveu (§4.1).

### 2.6 Grafo de deleção (o que sai / edita / vira morto)

**Remover — mas em DUAS fases, não numa:**

| O quê                                                                                                         | Fase            | Por quê                                                                                          |
| ------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| `components/SplashScreen.tsx`                                                                                 | **F1 ✅ feito** | Controlador de boot; nada mais o referencia                                                      |
| `components/SplashVisual.tsx` · `components/LoadingProvider.tsx` · `lib/loading/loading-context.ts` (+ pasta) | **F3**          | O `LoadingProvider` (page loader, camada 2) **segue vivo até a F3** e renderiza o `SplashVisual` |
| CSS `app/globals.css:13692–14056` (~**365 linhas**)                                                           | **F3**          | **Bloco inteiramente COMPARTILHADO** — ver abaixo                                                |

> **🔴 Erro corrigido em 2026-07-30, durante a F1:** o registro anterior dizia "Remover (100% órfão)" para os 4 arquivos e punha o CSS na F1. **Errado.** As 5 regras `.is-page-loader` (`:13715`, `:13719`, `:13723`, `:13727`, `:13731`) são **overrides sobre a mesma base** — o page loader renderiza o mesmo `SplashVisual` e precisa de `.splash-screen`, `.splash-particles`, `.splash-particle:nth-child(1..14)`, `.splash-center`, `.splash-logo-glow`, `.splash-logo`, `.splash-footer`, `.splash-progress-*`, `.splash-status`, `.splash-dots` e os 10 `@keyframes`. **Zero linha de CSS sai na F1.** O bloco morre inteiro na F3, quando o `LoadingProvider` morrer.

> **Corrigido em 2026-07-30:** a faixa anterior registrada (`20411–20798`) está obsoleta — a poda de CSS da §19 do ciclo RC encurtou `globals.css` para **28.116 linhas** e deslocou o bloco. `.splash-title` e `@keyframes splash-title-in`, antes registrados como "já mortos", **já não existem** (saíram na poda). O bloco é contíguo, de `.splash-screen` até o fim de `@keyframes splash-dots-pulse`; o bloco `.page-transition-*` começa em `:14058`.

**Editar:** `app/layout.tsx` (tira 2 mounts, `:75` e `:79` — **feito na F1**), o `useGlobalLoading(loading)` da auth (**saiu do `lib/use-auth.ts` na F2**; hoje mora no `AuthProvider`, e é lá que a F3 vai tirá-lo), skill `.claude/skills/design-system/SKILL.md` §loader (skill-maintenance).
**Não tocar (independentes, apesar de "verdes"):** `app/manifest.ts` `background_color/theme_color: #1f5d43` (splash nativo do SO) e `app/layout.tsx:60` `themeColor` (barra de status) — só mudam se for decisão explícita (SN-D2). `app/page.tsx` `redirect('/dashboard')` e os guards de `useRequireAuth` cobrem os redirects que o splash duplicava.
**Testes:** **0** referenciam a máquina — a suíte não quebra.
**🔴 Asset — erro corrigido em 2026-07-30, durante a F1:** o registro anterior dizia que `logo-safras-branco.png` "fica sem consumidor React (só o `SplashVisual` usava via `next/image`)". **É FALSO e apagá-lo quebraria o app.** Ele tem **6 outros consumidores**: `app/login/page.tsx:189`, `app/maintenance/page.tsx:43`, `components/AppShell.tsx:694` e `:941`, `lib/informativos/story-draw.ts:13` (`LOGO_SRC`) e `lib/informativos/story-layout.ts:45`. **O arquivo FICA, em todas as fases.** Segue no `STATIC_PATHS` do SW (`public/sw.js:12`) e não há `CACHE_NAME` para bumpar por causa dele.

**Os 8 gates `null`** (o principal impacto visual — hoje cobertos pelo page loader): linhas na tabela do §2.3. Sem o loader e sem outra solução, esse instante vira **tela branca** — é o que a SN-D8 + SN-D1 resolvem.

### 2.7 🔴 O que não atualiza, e por quê (seção nova — 2026-07-30)

Origem: relato do Flavio de que **algumas ações não se refletem na tela — só ao sair e voltar da página, e em alguns casos só ao sair e voltar do app**. A varredura confirmou a causa.

**Não existe canal de invalidação de cache no app.** O que existe são três mecanismos parciais e mutuamente desconectados:

| Mecanismo                                                                                       | Onde                                                                             | Alcance                                                                |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Callbacks ad-hoc (`onChanged`/`onSaved`/…) passados como prop                                   | **12 ocorrências em 7 arquivos**                                                 | Só dentro da mesma árvore de página, e só onde alguém lembrou de ligar |
| `useListRevalidation` (`lib/use-list-revalidation.ts`) — foreground + poll 60s, throttle 30s    | **3 lugares**: `app/samples/page.tsx:1357`, `ClientsBrowser`, `SampleDetailView` | Atualiza no tempo, não no evento                                       |
| `useRecentSendsFeed` (`lib/use-recent-sends-feed.ts`) — **segundo hook paralelo**, mesmo padrão | **1 lugar**: `DashboardDesktop.tsx:40`                                           | idem                                                                   |

**Sem revalidação nenhuma:** `ContratosPanel`, `FinanceiroPanel`, `RelatoriosViewer`, `AvisosCard`, `/users`.

Isso explica os **dois** sintomas distintos:

- **"só ao sair e voltar da página"** — a página desmonta e remonta, refazendo os fetches do zero. É força bruta, não atualização.
- **"só ao sair e voltar do app"** — são as superfícies sem hook nenhum. Voltar do background **não** remonta; só um restart de processo (o SO matando a aba) limpa o estado.

**🔴 O alerta que sustenta a SN-D13:** o que hoje disfarça a obsolescência é **exatamente a remontagem que a F2 elimina**. Entregar shell persistente sem canal de invalidação **piora** o problema: a página fica viva e velha, e nem sair-e-voltar resolve mais. Por isso o barramento é **pré-requisito da F3**, não melhoria futura — e o §6 ganhou um segundo alerta de sequência.

### 2.8 🔴 A camada 4 existe, mas não é sistema (seção nova — 2026-07-30)

- **6 famílias de skeleton / 9 classes**, todas com prefixo de página, nenhuma compartilhada: `.dashboard-skeleton-*` (4 classes), `.fv-cd-chart-skeleton`, `.fv-table-skel`, `.pg-canvas-skeleton`, `.rsm-skeleton-card`, `.spv2-skeleton-card`.
- **Nenhum primitivo compartilhado** — não há `components/ui/`, `components/common/` nem equivalente.
- **11 strings distintas** de "Carregando" na UI, com divergências de pontuação e acentuação: `Carregando` · `Carregando...` · `Carregando…` · `Carregando a etiqueta...` · `Carregando cliente…` · `Carregando corretores...` · `Carregando lote…` · `Carregando mais lotes` · `Carregando o histórico...` · `Carregando usuarios...` · `Carregando usuários...`

É onde a diferença entre "funciona" e "profissional" aparece. → **SN-D10, travada:** entra no ciclo, como fase própria (F4).

---

## §3. Arquitetura-alvo

### 3.1 App shell persistente

O `AppShell` (navbar + chrome + provedor de sessão) sobe para o **layout de um route group autenticado** (`app/(app)/layout.tsx`), que monta **uma vez**. A área de rota vira apenas o **conteúdo** que troca. A **sessão passa a viver no shell** (resolvida uma vez), não em cada página. → **SN-D4, travada.**

- Efeito: navbar nunca desmonta; navegação não refaz o `AppShell` nem o `GET /auth/session`.
- As públicas (`/login`, `/offline`, `/maintenance`) ficam **fora do grupo, estruturalmente** — não há lista de exceções para manter em dia.

### 3.2 Transição de conteúdo natural

Sem overlay de carregamento entre páginas. O shell permanece e a área de conteúdo troca com **cross-fade só na entrada**, em CSS puro. **O clone do DOM da página que sai é apagado** (§2.4/F2). → **SN-D5', travada.**

### 3.3 Sessão e dados por página (SWR / stale-while-revalidate)

Dados de página deixam de bloquear a renderização:

- **Sessão:** inicializada **sincronamente** a partir de `readCachedSession()` (`lib/offline/session-cache.ts:36`, leitura de `localStorage` — síncrona) já no primeiro render do shell, e revalidada em background. Elimina o gate `null`, o page loader e a tela branca. O HTML continua **sem identidade** — nada de dado de usuário no documento que o SW cacheia. → **SN-D8, travada.**
- **Conteúdo:** renderiza a casca imediatamente; dados chegam com **skeleton/inline por área**, nunca full-screen.
- **Estado por aba:** scroll, filtros e busca restaurados de um **snapshot com TTL**, no molde do que `/samples` já faz. → **SN-D7, travada.**
- **Atualização:** um **barramento de invalidação** por assunto — uma ação publica, quem exibe aquele assunto refaz o fetch, inclusive em outra página. → **SN-D13, travada.**

### 3.4 Boot / auth / offline / deep-link no novo modelo

- **Boot:** sem tela verde. Sessão do cache → instantâneo. Cache frio → **shell vazio com skeleton no conteúdo** (SN-D1), nunca tela cheia de espera.
- **Auth guard:** permanece em `useRequireAuth`, agora resolvido uma vez no shell.
- **Deep-link:** passa a **funcionar** (hoje é descartado). **Offline:** o app abre normal com a sessão em cache; o SW leva a `/offline` só se o documento não estiver cacheado. **Resume:** morre. → **SN-D3, travada.**

### 3.5 Splash de entrada nova (FASE FUTURA — placeholder)

Só apresentação do **nome do app**, disparada **apenas na entrada** após ficar **X tempo** fora. Não é o loader de navegação. Especificação e regra do "X tempo" ficam para a fase F5 (§6). _Placeholder — não detalhar até as fases anteriores fecharem._

---

# METADE B — Decisões evolutivas

## §4. Ledger de decisões (SN)

### §4.0 Protocolo de decisão (coerência entre decisões)

Toda decisão SN passa por este rito — **uma situação por vez** — antes de ser travada:

1. **Questão** — objetiva e isolada.
2. **Opções** — enumeradas, cada uma com seu trade-off (descartar as dominadas explicando por quê).
3. **Recomendação** — a opção escolhida e o porquê.
4. **Análise de impacto** (obrigatória, antes de travar) — responder:
   - (a) contradiz algum princípio de §1 ou fato de §2 (contexto estável)?
   - (b) afeta, ou é afetada por, alguma decisão **já travada**?
   - (c) mexe no faseamento (§6), no mapa de páginas (§5) ou nos riscos (§7)?
   - (d) o que esta decisão **restringe** nas decisões seguintes?
5. **Registro** — só após confirmação do Flavio: status → **TRAVADA** (com data) e as implicações **propagadas**.

**Regra de ouro:** nenhuma decisão trava se a análise revelar conflito não resolvido com uma decisão anterior — nesse caso, reabrir a anterior explicitamente antes de seguir.

### §4.1 Decisões TRAVADAS (2026-07-30)

#### SN-D8 · De onde vem a sessão

**Decisão:** cliente, do **cache local**, lido **sincronamente** no 1º render do shell (`readCachedSession`), com revalidação em background.
**Descartadas:** (i) _servidor, do cookie verificado_ — daria sessão pronta no HTML mesmo com cache frio e sem query no banco (`verifyAccessToken` já existe), **mas** o SW cacheia documentos (`public/sw.js`, `canCache` → `destination === 'document'`) e é isso que faz a navegação offline funcionar; o HTML cacheado passaria a guardar nome e papel do usuário, inclusive após logout — ou pararíamos de cachear e o offline regrediria. (ii) _híbrido_ — o servidor entregaria menos do que parece, já que a nav depende do papel; complexidade sem ganho.
**Impacto:** (a) atende "não bloquear a navegação em I/O"; (b) nenhuma travada antes; **(c) restringe a SN-D4** — sem sessão no servidor, o shell é client component e o route group vale pela clareza estrutural, não por SSR; (d) torna a SN-D1 quase vazia (a espera só existe com cache frio) e **elimina** o risco de PII no cache do SW (§7).
**Nota:** o cache é aquecido no 1º carregamento autenticado após o login (`use-auth.ts:74`), então mesmo o "primeiro acesso do aparelho" só espera uma vez.

#### SN-D4 · Onde vive o shell persistente

**Decisão:** **route group `(app)`** — as 8 páginas autenticadas passam para `app/(app)/`, com o shell em `app/(app)/layout.tsx`. As URLs **não** mudam (route groups não entram no path).
**Descartada:** _chrome condicional no layout raiz via `usePathname`_ — custo zero de refatoração, mas a lista de rotas públicas vira configuração escrita à mão: uma página pública nova esquecida ali nasce com o shell autenticado em volta.
**Reversão de recomendação:** o doc anterior descartava o route group por "mover 8 dirs + ~83 repaths". **O número real é 87 linhas de import relativo concentradas em 8 arquivos** (`samples` 33, `users` 12, `cadastros` 11, `profile` 10, `dashboard` 6, `contratos`/`financeiro`/`relatorios` 4 cada) — um find/replace por arquivo, uma vez. E o argumento de bundle levantado na análise **caiu**: `/laudo` é route handler, então as únicas públicas afetadas seriam `/login`, `/offline` e `/maintenance`.
**Impacto:** (a) atende "nunca desmontar o shell"; (b) compatível com SN-D8 (o layout do grupo é client component); (c) muda a F2; (d) restringe SN-D6 — o provider de sessão vive nesse layout.
**Confirmado:** `tsconfig.json` **não tem `paths`/alias `@/`** — os imports movidos são relativos e precisam do ajuste mecânico.

#### SN-D5' · O clone do DOM na transição _(reformula a SN-D5)_

**Decisão:** **cross-fade só na entrada**, em CSS puro. O clone da página que sai é apagado.
**Descartadas:** _troca seca_ (mais leve ainda, e o que IG/WA de fato fazem) — o Flavio preferiu manter suavidade; _manter como está_ — preserva o custo de §2.4/F2 e o canvas em branco.
**Impacto:** (a) atende "instantâneo > animação de espera" sem abrir mão do acabamento; (b) independente das demais; (c) some da F2 o risco do `will-change` (o `MobileTabbar` pode até sair do portal — **avaliar, não presumir**); (d) nenhuma.

#### SN-D7 · Estado por aba

**Decisão:** **snapshot estendido às 8 páginas** — scroll, filtros e busca, com TTL, no molde de `/samples`.
**Descartadas:** _abas montadas em memória_ — feel mais nativo, mas segura `/samples`, o simulador React Flow e as demais vivos ao mesmo tempo, e **some ao reabrir o app** (o snapshot não); _nada_ — regressão em relação ao que `/samples` e `/cadastros` já fazem bem.
**Impacto:** (a) compatível; **(b) depende da SN-D13** — sozinho, o snapshot serviria dado velho; com o barramento, ele vira só a primeira pintura; (c) preenche a §5.2 e entra na F3; (d) nenhuma.

#### SN-D13 · Canal de invalidação _(nova)_

**Decisão:** **barramento próprio** (~60 linhas, sem dependência nova). Uma ação publica um assunto (`lotes`, `contratos`, `clientes`…); quem exibe aquele assunto refaz o fetch, inclusive em outra página. Absorve `useListRevalidation` e `useRecentSendsFeed` em vez de virar um terceiro mecanismo.
**Cobertura obrigatória:** ao absorver os dois hooks, o barramento passa a dar **revalidação ao voltar ao primeiro plano para TODO assinante** — não só para os 4 lugares que a têm hoje (§2.7). Isto não é um extra: é o que sustenta a **SN-D3** ao matar o resume 30/60min. Sem essa universalização, as 5 superfícies sem revalidação nenhuma ficariam **pior** do que antes.
**Descartadas:** _TanStack Query_ (~13KB gz) — resolve invalidação, dedup e SWR de uma vez e é o padrão da indústria, **mas** exigiria reescrever como as 8 páginas pedem dado (incluindo a `/samples` e seu snapshot maduro) dentro da fase mais arriscada do ciclo; fica como **porta aberta**, um ciclo próprio no futuro, se o trabalho manual incomodar. _Só completar os callbacks_ — nunca resolve entre páginas, que é justamente o caso que piora com o shell persistente.
**Impacto:** (a) sustenta o princípio novo "sem trocar pisca por dado velho"; (b) habilita a SN-D7; **(c) vira pré-requisito da F3 e acrescenta o 2º alerta de sequência no §6**; (d) restringe a SN-D9 (o dono da política passa a ser o barramento + um registro de chaves).

#### SN-D1 · O que aparece na espera real

**Decisão:** **o shell vazio, com skeleton no conteúdo**. A barra e a estrutura aparecem imediatamente; só a área de conteúdo espera.
**Descartadas:** _loader mínimo neutro_ — ainda é tela de espera; _nada (branco breve)_ — contraria "sem trocar verde por branco".
**Impacto:** (a) atende o princípio diretamente; (b) só existe por causa da SN-D8 (que reduz o caso a "cache frio"); (c) entra na F3; (d) nenhuma.
**⚠️ Ordem com a SN-D10 (conflito detectado na conferência par-a-par e resolvido):** esta decisão pede skeleton na F3, mas o **kit** de skeleton só nasce na F4. Não é bloqueio: as 6 famílias de skeleton **já existem por página** (§2.8), então a F3 usa o skeleton que a página já tem e a F4 as unifica depois. **Não adiantar a F4 por causa disto** — o alerta de sequência do §6 vale mais.

#### SN-D3 · Comportamentos load-bearing do boot

**Decisão:** **nenhum dos três sobrevive.** Deep-link volta a **funcionar**; offline abre o app com a sessão em cache (o SW leva a `/offline` só se o documento não estiver cacheado, o que é melhor que expulsar proativamente); resume 30/60min morre — a revalidação por foreground e o barramento cobrem a atualização sem tirar o usuário de onde ele estava.
**Descartadas:** _preservar o resume_ — o preço é perder o lugar sem ter pedido; _preservar os três_ — manteria o descarte de deep-link, que é claramente um defeito.
**Impacto:** (a) compatível; (b) depende da SN-D8 (é o cache que sustenta o offline); (c) simplifica a F1 — não há o que reimplementar fora do splash; (d) nenhuma.

#### SN-D10 · A camada 4 entra no escopo _(nova)_

**Decisão:** **entra, como fase própria (F4)**, depois da F3 — unificar as 6 famílias de skeleton num primitivo único e padronizar o vocabulário de "Carregando" (§2.8).
**Descartadas:** _entrar junto na F3_ — misturaria mudança de arquitetura (com risco de tela branca) com acabamento visual, dificultando isolar a causa de uma quebra; _ficar fora_ — o app seguiria com 11 jeitos de dizer "Carregando".
**Impacto:** (a) compatível; (b) fornece o skeleton que a SN-D1 usa; (c) acrescenta a F4 e empurra a splash nova para F5; (d) o kit resultante vira material da skill `design-system`.

### §4.2 Decisões EM ABERTO

| ID         | Questão                                                                                                                                            | Status        | Nota                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------- |
| **SN-D2**  | A tela verde **nativa do SO** (manifest `background_color`/`theme_color`) — neutralizar também?                                                    | **EM ABERTO** | Adiada de propósito: decidir junto do visual da splash nova (F5) |
| **SN-D11** | **Indicador de navegação** — hoje não existe nenhum. Com shell instantâneo e conteúdo assíncrono, o que sinaliza "vindo" quando o conteúdo demora? | **EM ABERTO** | Decidir na F3, com o comportamento real na mão                   |

### §4.3 Decisões DERIVADAS (a confirmar antes de implementar)

Seguem das travadas, mas **não foram confirmadas explicitamente** — confirmar ao entrar na fase correspondente.

| ID            | Derivação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~**SN-D6**~~ | 🪦 _Onde a sessão é resolvida._ **CONFIRMADA E IMPLEMENTADA na F2 (2026-07-30).** O provider é `AuthProvider` em `lib/auth/AuthProvider.tsx`, montado em `app/(app)/layout.tsx`. **Contrato exposto:** `{ session, loading, logout, setSession }` — de propósito, a mesma forma que o antigo `useRequireAuth` devolvia, o que tornou a migração das 8 páginas mecânica. O `isAuthorized` **não** entrou no contexto: virou o hook separado `useRequireRole(allowedRoles)`, porque autorização é por rota e o layout não sabe (nem deve saber) quais papéis cada rota aceita. Falta só o init síncrono do cache, que é da F3 (SN-D8). |
| **SN-D9**     | _Dono da política de cache._ Segue de D13 + D7: **primitivo compartilhado + registro de chaves de snapshot**, substituindo a lista hardcoded de chaves no logout — que na F2 mudou de casa (`lib/use-auth.ts` → `lib/auth/AuthProvider.tsx:146-148`) mas continua hardcoded, e apodrece a cada página nova.                                                                                                                                                                                                                                                                                                                          |
| **SN-D12**    | _Restauração de scroll por aba._ Segue de D7: restaurado via snapshot. Falta decidir o comportamento no **voltar do navegador** vs. **tocar na aba**. _Atualizado na F2:_ o `isPopState` morava dentro do `PageTransition` (para escolher a direção da animação) e **foi apagado com ele** — hoje **nenhum código do app escuta `popstate` para navegação de página** (só o `BottomSheet`, para o back do Android, e o `ContratosPanel`). Ou seja, a D12 parte do zero em vez de herdar mecanismo.                                                                                                                                   |

### §4.4 Mudança de ordem do ledger (registro)

A ordem combinada em 2026-07-24 era **D4 → D6 → D1 → D3** (D5/D2 por último). A análise de 2026-07-30 a inverteu: **de onde vem a sessão restringe onde o shell vive**, então a decisão nova (D8) tinha de vir primeiro — se a sessão fosse resolvida no servidor, o shell teria de ser server component e o route group deixaria de ser preferência para virar requisito. Ordem executada: **D8 → D4 → D5' → D7 → D13 → D1 → D3 → D10**.

## §5. Mapa de páginas & política de estado

### 5.1 Mapa de rotas — **FECHADO**

**Ordem (combinado 2026-07-24):** o mapa de páginas é decidido **ANTES** do ledger SN-D — a disposição define as **abas do navbar**. Cumprido: fechou em 2026-07-28.

> **2026-07-27 — as 3 linhas de contrato saíram de "a decidir" E JÁ ESTÃO NO CÓDIGO** (ledger **RC**, `Contratos-Plano-de-Trabalho.md` §5.9): `/contratos` é página única, `/financeiro` é página própria só-ADMIN e `/embarques` é `redirect('/contratos')`. As sub-abas expansíveis do bloco desapareceram (`NAV_SUB_ITEMS` perdeu as 2 entradas).

> **2026-07-28 — a pergunta "quais são as abas" ACABOU.** Desktop: Início · Lotes · **Contratos** · Relatórios · Cadastros · Financeiro (ADMIN) · Usuários (ADMIN). **Tabbar mobile: 5 abas FIXAS** — Início · Lotes · **Contratos** · Cadastros · Relatórios. O menu do avatar ficou Perfil · Usuários · Financeiro · Sair, sem repetir nenhuma aba. **O 4º slot papel-dependente morreu:** desde o acesso unificado `INFORME_ROLES === NON_PROSPECTOR_ROLES`, o ramo Perfil nunca renderizava. Restam à SN o comportamento (SN-D7) e o chrome, não mais o elenco.

**Inventário verificado (re-conferido 2026-07-30):**

- **Abas mobile (`MOBILE_NAV_ITEMS`, 5 slots fixos):** Início `/dashboard` · Lotes `/samples` · Contratos `/contratos` · Cadastros `/cadastros` · Relatórios `/relatorios`.
- **Sidebar desktop (`DESKTOP_NAV_ITEMS`):** Início · Lotes · Contratos · Relatórios · Cadastros · Financeiro (ADMIN) · Usuários (ADMIN). Sub-abas via `?tab=` — restaram **2**: `/samples` (Lotes/Simulador) · `/cadastros` (Clientes/Corretores).
- **Páginas autenticadas reais (8):** `/dashboard`, `/samples`, `/cadastros`, `/contratos`, `/financeiro` (ADMIN), `/relatorios`, `/users` (ADMIN), `/profile`.
- **Redirects/aliases (não são páginas):** `/clients`→`/cadastros` · `/embarques`→`/contratos` · `/resumo`→`/relatorios` · `/informe`→`/relatorios` · `/settings`→`/profile` · `/forgot-password`→`/login?modal=forgot-password` · **`/samples/[sampleId]`→`/samples?lote=`** · **`/clients/[clientId]`→`/cadastros?cliente=`**.
- **Públicas (páginas, fora do grupo `(app)`):** `/login`, `/offline`, `/maintenance`.
- **Fora da árvore React:** **`/laudo/[token]` é route handler** (`app/laudo/[token]/route.ts`), não página — o laudo público do QR nunca carrega o shell nem o React.

> **Correções de 2026-07-30:** o registro anterior tratava `/samples/[sampleId]` como "lista + detalhe (drawer)" e `/laudo/*` como página pública. **Ambos estão errados hoje:** os detalhes de lote e cliente viraram **overlay por query-param** (RD2) e as rotas `[id]` são `redirect()` server-side; o laudo é route handler.

| Rota                                 | Tipo                        | Na tabbar?   | Alvo                                          |
| ------------------------------------ | --------------------------- | ------------ | --------------------------------------------- |
| `/dashboard`                         | página                      | sim (Início) | move p/ `(app)`                               |
| `/samples`                           | lista + overlay `?lote=`    | sim (Lotes)  | move p/ `(app)`; sub-abas Lotes/Simulador     |
| `/cadastros`                         | lista + overlay `?cliente=` | sim          | move p/ `(app)`; sub-abas Clientes/Corretores |
| `/contratos`                         | página única                | sim (3ª aba) | move p/ `(app)`                               |
| `/financeiro`                        | página (ADMIN)              | não (avatar) | move p/ `(app)`                               |
| `/relatorios`                        | feed                        | sim (5ª aba) | move p/ `(app)`                               |
| `/users`                             | lista (ADMIN)               | não          | move p/ `(app)`                               |
| `/profile`                           | perfil                      | não (avatar) | move p/ `(app)`                               |
| `/login`, `/offline`, `/maintenance` | públicas                    | —            | **ficam na raiz**, fora do grupo              |
| redirects e `/laudo`                 | redirect / route handler    | —            | ficam onde estão (não precisam de shell)      |

### 5.2 Política de estado, cache e atualização por página

> **Proposta derivada de SN-D7 + SN-D13** — confirmar por linha ao entrar na F3. O molde é o que `/samples` **já implementa**: `SAMPLES_SNAPSHOT_KEY` (`app/samples/page.tsx:429`), `SAMPLES_SNAPSHOT_TTL_MS = 30min` (`:431`), snapshot com itens + cursor + scroll + busca + filtros + `savedAt`, descarte explícito (`clearSamplesSnapshot`) em deep-link conflitante e mudança de busca/filtro, e revalidação silenciosa via `useListRevalidation`.

| Rota          | Carrega                              | Snapshot (o que restaura)                              | TTL   | Assuntos que a invalidam           |
| ------------- | ------------------------------------ | ------------------------------------------------------ | ----- | ---------------------------------- |
| `/dashboard`  | cards agregados (avisos, calendário) | — (agregados, sem scroll longo)                        | —     | `lotes`, `contratos`, `relatorios` |
| `/samples`    | lista por cursor + stats             | itens, cursor, scroll, busca, filtros ✅ **já existe** | 30min | `lotes`, `clientes`                |
| `/cadastros`  | clientes por cursor + corretores     | idem, por sub-aba ✅ **já existe** (2 chaves)          | 30min | `clientes`, `corretores`           |
| `/contratos`  | lista de contratos                   | itens, scroll, filtros                                 | 30min | `contratos`, `clientes`            |
| `/financeiro` | carteira de corretagem               | itens, scroll                                          | 30min | `contratos`, `corretagem`          |
| `/relatorios` | feed                                 | itens, scroll                                          | 30min | `relatorios`                       |
| `/users`      | lista por cursor (caps 30/60)        | itens, cursor, scroll, busca                           | 30min | `usuarios`                         |
| `/profile`    | dados do próprio usuário             | —                                                      | —     | `sessao`                           |

**Regras transversais:**

1. **O snapshot é só a primeira pintura.** Nunca é fonte de verdade: o fetch roda silencioso por baixo (stale-while-revalidate), como `/samples` já faz.
2. **Registro de chaves.** As chaves de snapshot passam a viver num registro único, consultado no logout — substituindo a lista hardcoded de `lib/use-auth.ts:202-204`, que hoje precisa ser editada à mão a cada página nova (e por isso apodrece).
3. **Mutação publica assunto.** Todo ponto de escrita publica o assunto afetado; nenhuma tela precisa saber quem mais o exibe.
4. **Trocar de usuário limpa tudo.** O logout já limpa os snapshots; o registro do item 2 garante que nenhum fique para trás.

## §6. Faseamento

> **🔴 Alerta de sequência 1 (tela branca):** NÃO apagar o **page loader** (camada 2) antes de F2+F3 — sem o shell persistente e a sessão do cache, a navegação vira **tela branca**. O **boot splash** (camada 1) pode sair antes.
>
> **🔴 Alerta de sequência 2 (dado velho) — acrescentado 2026-07-30, _corrigido ao iniciar a F2_:** dentro da F3, **NÃO ligar os snapshots (SN-D7) antes do barramento (SN-D13)**. Hoje o que disfarça a obsolescência (§2.7) é o **refetch no remount** da página; quem o elimina é o snapshot, que restaura em vez de refazer. Snapshot sem invalidação = dado velho servido de propósito, e aí nem sair-e-voltar resolve.
>
> _A versão anterior deste alerta dizia "não entregar a F2 sem o barramento da F3" — **impreciso, e travava a F2 sem motivo**. No App Router só o **layout** persiste: mover o `AppShell` para lá faz o **shell** parar de remontar, mas **cada página continua sendo um segmento que desmonta e remonta**, então os fetches dela seguem rodando na volta. O `AppShell` também não busca dado nenhum (só mutações de senha). **A F2 sozinha não piora a obsolescência** — a fronteira de risco é interna à F3._
>
> **🔴 Lição da F1 (2026-07-30):** o grafo de deleção do §2.6 é o total do ciclo, **não a lista de uma fase**. Antes de apagar qualquer peça numa fase, conferir **quem mais a consome** — na F1, três das quatro "órfãs" ainda tinham dono (o page loader), e o logo tinha **seis**. Apagar pela lista teria quebrado login, manutenção, o shell e o canvas dos informativos.
>
> **🔴 Descoberta da F2 (2026-07-30): mover o shell não bastava — a transição vinha junto, e era a mesma mudança da SN-D5'.** O `PageTransition` vivia no **layout raiz** e envolvia _tudo_, inclusive o `AppShell`. Sem tocar nele, o navbar pararia de **remontar** mas continuaria fazendo **cross-fade** a cada navegação — o objetivo da fase (barra imóvel) não seria atingido. E manter o clone do DOM exigiria inserir um wrapper **dentro** da `.app-shell-page-content`, que quebraria o seletor de filho direto `.app-shell-page-content > .sdv-page > .sdv-header` (`globals.css`). Ou seja: **relocar a transição e cumprir a SN-D5' eram fisicamente a mesma coisa.** A saída foi não inserir DOM nenhum — a animação passou a viver na própria `.app-shell-page-content`, reiniciada por `key={pathname}` (que ignora query, então `?lote=`/`?cliente=`/`?details=` **não** repintam a página).
>
> **A SN-D5' foi além do previsto: caiu também o `scale`.** A decisão previa "cross-fade só na entrada"; na implementação a animação ficou **só opacidade 0→1, 300ms**, sem `transform` e sem `will-change`. Isso apaga o **containing block** que o wrapper criava para descendentes `position: fixed` — o motivo original de `MobileTabbar`, modais centrais e `ResultDrawer` escaparem por portal. **Os portais ficam** (o `.bottom-sheet` tem `transform` permanente e páginas têm animação própria de entrada — a regra continua valendo), mas a **justificativa** foi reescrita na skill `modals` e nos 4 comentários de código que citavam o `PageTransition` como causa. Efeito colateral bom: a superfície de `innerHTML` do clone sumiu — **não há mais nenhuma atribuição a `innerHTML` no código** (`SECURITY-threat-model.md` e `SECURITY-audit.md` atualizados).
>
> **Diferença de comportamento aceita:** a animação agora roda também na **primeira pintura** (o `PageTransition` só animava a partir da 2ª rota), e `/login`, `/offline` e `/maintenance` ficam **sem** transição — nunca estiveram dentro do shell. Coberta por `prefers-reduced-motion: reduce`.

| Fase            | Objetivo                                                       | Entra                                                                                                                            | NÃO tocar                                                                                | Risco                                                                     | Pronto quando                                                                                      |
| --------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **F1** ✅       | Remover o **boot splash** e sua lógica                         | **só** `SplashScreen.tsx` + os 2 pontos no `app/layout.tsx`                                                                      | `SplashVisual`, `LoadingProvider`, o CSS e o logo — **todos compartilhados**, saem na F3 | deep-link e offline mudam de comportamento (SN-D3, intencional)           | **código feito e gates verdes 2026-07-30; falta o 🖥️/📱 do Flavio**                                |
| **F2** ✅       | **Shell persistente** no route group                           | 8 dirs → `app/(app)/` (85 imports), `AuthProvider` + `AppShell` no layout do grupo, `PageTransition` **apagado** (SN-D5')        | dados por página                                                                         | perda de estado, hidratação                                               | **código feito e gates verdes 2026-07-30; falta o 🖥️/📱 do Flavio**                                |
| **F3**          | **Sessão do cache + invalidação + fim do page loader**         | init síncrono via `readCachedSession`; **barramento (SN-D13)**; snapshots (SN-D7); registro de chaves; deletar `LoadingProvider` | —                                                                                        | tela branca se F2 incompleta; dado velho se o barramento ficar incompleto | navegação instantânea, sem verde nem branco; **ação numa página reflete em outra sem sair da aba** |
| **F4**          | **Camada 4 vira sistema** (SN-D10)                             | primitivo único de skeleton (absorve as 6 famílias); vocabulário de "Carregando"; SN-D11                                         | arquitetura da F3                                                                        | —                                                                         | um kit, um vocabulário; skill `design-system` atualizada                                           |
| **F5** (futura) | **Nova splash de entrada** (nome do app, só após X tempo fora) | novo componente; SN-D2 (verde nativo)                                                                                            | —                                                                                        | —                                                                         | especificado em doc próprio ou §3.5 expandido                                                      |

## §7. Riscos & questões abertas

- **Auth gate:** mover a sessão para o shell sem abrir janela de conteúdo protegido antes da validação (sessão expirada renderizar o app por um instante). Com SN-D8 o cache é validado por `expiresAt` na leitura (`session-cache.ts:53-57`), mas revogação server-side só aparece na revalidação.
- **F2 sem F3 (novo, 2026-07-30):** ver alerta de sequência 2. É o risco mais provável de passar despercebido, porque a F2 "parece pronta" — o navbar para de piscar e nada acusa o dado velho.
- **Offline/PWA:** não regredir o comportamento offline ao remover o `resolveDestination` do splash. O SW e o cache de sessão sustentam o caminho.
- **~~PII no HTML cacheado~~:** **eliminado pela SN-D8** — a sessão não entra no documento, então o cache do SW segue sem identidade. _(Seria risco real se tivéssemos escolhido resolver a sessão no servidor.)_
- **Splash nativo do SO:** só sai via manifest (SN-D2), não pelo React.
- **SSR/hidratação:** hoje o boot splash vem no HTML SSR (sem flash); removê-lo pode expor flash de `null` — mitigado pelo init síncrono do cache (F3).
- **Modal de senha inicial (novo):** o `AppShell` guarda o fluxo de `initialPasswordDecision` (`AppShell.tsx:401-409`). Com shell persistente esse estado passa a **sobreviver à navegação** — provavelmente melhora, mas é fluxo forçado: verificar no device.
- **~~O `transform` do `PageTransition` é load-bearing~~ — RESOLVIDO na F2 (2026-07-30).** O risco era real e se materializou: a implementação da SN-D5' removeu o `transform` **por completo** (opacidade pura), então o stacking context que obrigava o portal deixou de existir. O que se fez: **manter os portais** — o `.bottom-sheet` tem `transform` permanente e páginas têm animação de entrada com `translateY`, então a regra segue válida por outros ancestrais — e **reescrever a justificativa** na skill `modals` e nos comentários de `MobileTabbar`, `SampleSendFlow`, `SampleLookupResultModal`, `ResultDrawer` e 2 blocos do `globals.css`. A lição fica: **motivo revogado sem código revogado é dívida de documentação** — quem lesse a skill depois iria atrás de um componente que não existe.
- **Memória:** shell persistente não pode segurar todas as páginas montadas — só o chrome; conteúdo troca (foi o que a SN-D7 decidiu ao recusar "abas montadas").

## §8. Verificação (por fase)

Gates padrão (`lint` + `format:check` + `typecheck` + `build` + `test:unit`) + device do Flavio. Cenários a checar:

- Navegação entre páginas **sem branco e sem verde**; navbar **fixo**.
- Entrada no app (cold boot) com e sem sessão em cache.
- Offline: boot e navegação. **E offline após logout** — o documento cacheado não pode expor identidade.
- **Deep-link a frio deve ABRIR a rota pedida** (hoje cai no Início — a correção é o teste).
- Sessão expirada (redirect a `/login` sem vazar conteúdo).
- PWA instalado: abertura a frio (splash nativo, conforme SN-D2).
- **Ação numa página refletindo em outra sem sair da aba** (o teste da SN-D13).
- **Simulador (React Flow) e peças de informativo durante a transição** — o canvas não pode sair em branco (§2.4/F2).
- **Modal de senha inicial** atravessando navegação.

## §9. Glossário & referências

- **Shell / app shell:** navbar + chrome persistentes que envolvem o conteúdo da rota.
- **Boot splash:** camada 1 (`SplashScreen`), a tela verde na entrada — 🪦 **apagada na F1**.
- **Page loader:** camada 2 (`is-page-loader`), overlay verde na navegação.
- **SWR / stale-while-revalidate:** renderizar do cache e revalidar em background.
- **Staleness:** por quanto tempo um dado cacheado é considerado "fresco" antes de revalidar.
- **Invalidação:** o evento que declara um dado velho **fora do tempo** — por causa de uma ação, não de um relógio (§2.7, SN-D13).
- **Gate `null`:** o `if (loading || !session) return null` das páginas autenticadas.
- **Snapshot:** a primeira pintura restaurada (itens + scroll + filtros), nunca fonte de verdade (§5.2).

**Arquivos-chave:**

- Já saiu (F1): `components/SplashScreen.tsx`
- Sai na F3: `components/{SplashVisual,LoadingProvider}.tsx`, `lib/loading/`, `app/globals.css:13692–14056` — **nada disso podia sair antes**, ver §2.6
- **Fica sempre:** `public/logo-safras-branco.png` (6 consumidores fora do splash — §2.6)
- Muda: `app/layout.tsx`, `components/AppShell.tsx`, `lib/use-auth.ts`, as 8 páginas (movem p/ `app/(app)/`)
- Nasceu na F2: `app/(app)/layout.tsx`, `lib/auth/AuthProvider.tsx` (`AuthProvider` · `useAuth` · `useRequireRole`)
- 🪦 Apagados: `components/SplashScreen.tsx` (F1), `components/PageTransition.tsx` (F2)
- **Reusar, não recriar:** `lib/offline/session-cache.ts` (`readCachedSession` é **síncrono** — é o que torna a SN-D8 sem flash), `lib/use-list-revalidation.ts` (o barramento o absorve), `app/samples/page.tsx:429-495` (o molde do snapshot)
- Não tocar: `middleware.ts`, `src/auth/*`, `app/manifest.ts`, `public/sw.js` (salvo bump de `CACHE_NAME` se o logo sair)
