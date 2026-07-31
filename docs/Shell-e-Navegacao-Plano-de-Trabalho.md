# Shell, Navegação e Carregamento — Plano de Trabalho

Status: **CICLO COMPLETO — 12 decisões TRAVADAS · F1 a F5 IMPLEMENTADAS + correção pós-F5 (2026-07-30)**; falta a validação 🖥️/📱 do Flavio de tudo
Escopo (1 linha): remover a atual "página de carregamento verde", tornar o **navbar/shell persistente** (nunca desmonta), fazer a transição entre páginas **sem loader full-screen** (só o conteúdo carrega), e definir a **política de cache/estado/atualização por página**.
Prefixo de decisões: **SN** (Shell & Navegação)
Documentos relacionados: `Redesign-Plano-de-Trabalho.md` (redesign visual página-a-página), `Dashboard-Visao-Geral.md`, `Lotes-Visao-Geral.md`, `Auditoria-Navegacao-por-Papel.md`, skill `page-redesign-cycle`.

> **Aviso:** as citações `arquivo:linha` foram **re-derivadas em 2026-07-30** contra o código em `main` (`dfc10a1`). Números de linha derivam; ao retomar, confirmar antes de agir.

---

## Como retomar este documento (leia isto primeiro)

Este doc tem **duas metades**:

- **Metade A — Contexto estável (§1–§3 + §9):** a fotografia de como o app funciona hoje e a arquitetura-alvo. Muda pouco. **Leia para se situar.**
- **Metade B — Decisões evolutivas (§4–§8):** o ledger de decisões, o mapa de páginas, a política de estado, o faseamento. **É onde o trabalho acontece.**

**Estado em 2026-07-30:** a reconciliação da Metade A com o código entregue pelo ciclo de redesign **foi feita** (§2 inteira re-verificada), a varredura encontrou **7 fatos que não estavam no doc** (§2.4, §2.7, §2.8) e **as 12 decisões do ledger estão travadas** (§4.1 — a SN-D14 nasceu na F3, a SN-D11 fechou na F4, a SN-D2 na F5 e a **SN-D15** na correção pós-F5). **Nenhuma em aberto**; resta **1 derivada a confirmar** (SN-D12, comportamento do "voltar") — a SN-D6 saiu da lista na F2 e a SN-D9 na F3.

**As cinco fases foram implementadas no mesmo dia.** O boot splash não existe mais (F1), o shell parou de remontar (F2, com o `PageTransition` apagado junto), a queixa do dado velho foi curada (F3: barramento de invalidação, sessão lida do cache e o page loader verde apagado), a camada 4 virou sistema (F4: um kit de esqueleto, um vocabulário, a região `aria-live` como peça e a barra fina de navegação) e a **entrada** ganhou desenho (F5: a caixa verde que casa com a tela do SO, a splash de marca a cada 4h e a SN-D2 travada). As marcas 🪦 na Metade A indicam o que caiu; o texto do "antes" fica porque é ele que explica **por que** as decisões seguintes são como são — a §2.7 em especial: ela é o diagnóstico que desenhou o barramento.

🔴 **O ciclo está completo em código, e ZERO validado no device.** É o que sobrou: a lista do que só o Flavio vê está no fim do §8, fase a fase. O §7 tem uma proposta de **fase curta própria** (cache-first para `/_next/static`) que a F4 achou e não executou.

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

### 2.7 🪦 O que não atualiza, e por quê (seção nova — 2026-07-30; **curada pela F3 no mesmo dia**)

> 🪦 **Esta seção é a fotografia de ANTES da F3.** Tudo abaixo descreve o estado que a fase corrigiu, e fica pelo diagnóstico — é ele que justifica o desenho do barramento. **O estado de hoje:** existe um canal de invalidação (`lib/revalidation/`), a publicação é automática no ponto único (`request()` do `api-client`, **SN-D14**), os dois hooks paralelos viraram um (`useRevalidate`, que absorveu o `useListRevalidation`) e **as 5 superfícies sem revalidação nenhuma passaram a ter**. Ver §4.1 (SN-D13, SN-D14) e a linha F3 do §6.

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

_(O alerta foi respeitado: a F3 saiu em três commits nesta ordem — barramento, sessão + morte do loader, snapshots.)_

### 2.8 🪦 A camada 4 existe, mas não é sistema — **resolvida pela F4 (2026-07-30)**

_A fotografia abaixo é de antes da F4. Fica como registro do que a fase encontrou._

- **6 famílias de skeleton / 9 classes**, todas com prefixo de página, nenhuma compartilhada: `.dashboard-skeleton-*` (4 classes), `.fv-cd-chart-skeleton`, `.fv-table-skel`, `.pg-canvas-skeleton`, `.rsm-skeleton-card`, `.spv2-skeleton-card`.
- **Nenhum primitivo compartilhado** — não há `components/ui/`, `components/common/` nem equivalente.
- **11 strings distintas** de "Carregando" na UI, com divergências de pontuação e acentuação: `Carregando` · `Carregando...` · `Carregando…` · `Carregando a etiqueta...` · `Carregando cliente…` · `Carregando corretores...` · `Carregando lote…` · `Carregando mais lotes` · `Carregando o histórico...` · `Carregando usuarios...` · `Carregando usuários...`

É onde a diferença entre "funciona" e "profissional" aparece. → **SN-D10, travada:** entra no ciclo, como fase própria (F4).

**Estado depois da F4:** um kit (`.fv-skel-card` / `.fv-skel-line` / `.fv-skel-box`) + `components/Skeleton.tsx` (`SkeletonCards`, `SkeletonTableRows`, `SkeletonLine`, `SkeletonBox`, `SkeletonDetail`), uma animação, uma grafia (`Carregando…`). O que a leitura do código acrescentou à fotografia:

- Eram **três técnicas de animação e quatro durações** (1,1s / 1,2s / 1,4s / 1,5s) — duas telas carregando lado a lado piscavam fora de compasso. Cada um dos 4 `@keyframes` tinha **um consumidor só** e morreu com a família (o `sdv-fadeIn`, que o `.rsm-skeleton-card` também usava, tem outros 4 consumidores e ficou).
- 🔴 **`prefers-reduced-motion` cobria só 2 das 4 animações.** O shimmer do `.spv2-skeleton-card` — o mais usado, 7 vezes em 5 páginas — e o pulse do `.fv-table-skel` seguiam animando para quem pediu movimento reduzido. Agora é um bloco só, por construção.
- **A duplicação estava no JSX, não só no CSS:** 7 laços `Array.from({length:N}).map` de card e 5 laços aninhados (linhas × colunas) de tabela. Dois arquivos já tinham extraído um helper local (`skeletonCards`, `tableSkeletonRows`) — o pedido pelo primitivo estava escrito no código.
- Duas classes **sem CSS nenhum**: `.fv-table-skel-row` (gancho semântico, ficou) e `.avisos-list.is-skeleton` (modificador morto — apagado).
- 🔴 **`.pg-canvas-skeleton` FICOU fora, de propósito** — e o porquê está escrito ao lado dela no `globals.css`, senão a próxima varredura a "conserta". **Não é esqueleto:** é reserva de caixa para o `next/dynamic` do canvas do simulador, sem animação, pintando `--pg-canvas-bg` para não dar CLS. Fazê-la brilhar como card seria errado. Ou seja: **6 famílias → 1 kit + 1 exceção declarada.**

**O que o kit dá e o que ele não dá:** superfície + animação + raio. A **ALTURA** continua escopada por página, porque o esqueleto tem de ter o formato do card final (`design-system` §3) — daí `.rsm-list .fv-skel-card`, `.dashboard-operation-card.is-skeleton`, `.fv-cd-chart-skel`, `.fv-skel-detail-card` e `.usr-panel-skel .fv-skel-card`.

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

### 3.5 Splash de entrada nova — **especificada e implementada na F5 (2026-07-30)**

_Era placeholder até as fases anteriores fecharem. A F5 a especificou e a entregou; o texto abaixo é a especificação, não mais a promessa._

**O que a varredura achou antes de desenhar: o buraco branco é real.** A sequência ao tocar no ícone do PWA era `[verde do SO] → [DOCUMENTO BRANCO] → [shell]`. O `body` é branco de propósito (`--mobile-page-bg-base: #ffffff`) — e tem de ser, porque o `.app-shell-root` é **transparente** e depende dele — e a faixa verde de status bar (`.mobile-edge-shell-auth::after`) só existe **dentro** do `.app-shell-root`, que ainda não montou. Com cache de sessão a janela é curta (parse + hidratação); **sem** cache ela dura a ida ao servidor inteira, porque o gate do layout do grupo ficava em `null`. Ou seja: o princípio **"sem trocar verde por branco"** do §1 tinha um furo residual justamente na entrada.

**São DUAS camadas, e a separação é o desenho inteiro:**

| Camada                         | Condicional? | Onde                                                                 |
| ------------------------------ | ------------ | -------------------------------------------------------------------- |
| **A caixa verde** (`.fv-boot`) | Não          | No **HTML servido** — 1º filho do `<body>`, montada pelo layout raiz |
| **O logo** (`.fv-boot-logo`)   | Sim (4h)     | Por cima do verde, **depois** da hidratação                          |

A camada A faz a **primeira pintura ser verde**, no mesmo `#1f5d43` do `background_color` do manifest: a tela do SO e a do app viram uma só, sem costura (é a SN-D2). Ela não espera nada e não decide nada.

🔴 **É a ordem das camadas que dispensa o `<script>` inline.** O logo aparecer **sobre verde** depois da hidratação é a animação pretendida, não um flash — então a decisão pode morar num layout effect. Um seletor de tema exigiria script síncrono no parse (e `suppressHydrationWarning` no `<html>`); aqui não. _(O CSP permitiria: `script-src 'self' 'unsafe-inline'` em `next.config.mjs`. Não foi preciso.)_

**A regra do "X tempo" = 4 horas fora**, com carimbo em `localStorage` (`lib/boot/last-seen.ts`). 🔴 A regra existe porque **no iOS o sistema mata o processo do PWA com frequência**, então toda volta ao app vira um documento novo — sem ela, trocar para o WhatsApp por um minuto traria a tela de volta, que é exatamente a irritação que a F1 tirou.

🔴 **`readLastSeen` distingue TRÊS estados, não dois** — e é isso que justifica o arquivo existir:

- `null` (storage acessível, sem registro) → **mostra**. É a 1ª abertura depois de instalar, o momento de marca certo.
- `undefined` (storage indisponível: modo privado, quota) → **não mostra**. Ali o carimbo nunca persistiria e a tela voltaria em **toda** abertura.

Colapsar os dois num `null` daria o pior dos dois lados.

**O que ela NÃO é:** o loader de navegação (isso é a SN-D11, F4) nem cobertura de espera. O erro que matou a splash velha foi **acoplar apresentação a espera** — `MIN_SPLASH_MS 1200 + EXIT_ANIMATION_MS 700` = piso de 1,9s **em todo boot**. Aqui a caixa não segura nada (o app carrega por baixo dela) e o logo custa `650 + 260 = ~910ms` **quando aparece**, no máximo 1× a cada 4h.

**`?splash=force`** na URL força a marca uma vez: uma tela rara por design não se valida esperando.

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
**Implementada na F3** em `/contratos`, `/financeiro`, `/relatorios` e `/users` (as 4 que faltavam; `/samples` e `/cadastros` já tinham, `/dashboard` e `/profile` não levam — §5.2). Duas coisas que a implementação descobriu e que valem para qualquer página nova:

- **Mount restaurado refaz o fetch em silêncio.** Sem isso a página pinta a lista do snapshot e imediatamente a cobre com skeleton para repintar quase o mesmo conteúdo. Em `/users` isso ia além do skeleton: o `success-initial` zerava o `firstNewIndex` e **reanimava a cascata de entrada dos cards** a cada revalidação silenciosa (defeito que o barramento tinha acabado de introduzir, corrigido no mesmo commit).
- **A lista restaurada encolhe para a 1ª página no primeiro refetch**, porque a revalidação silenciosa refaz só a página 1 e o snapshot pode ter 3 acumuladas. **É o comportamento que `/samples` já tinha** (`success-initial` substitui o array); as 4 novas seguem o mesmo precedente de propósito, em vez de cada uma inventar o seu. Se um dia incomodar, o conserto é do molde inteiro, não de uma página.

#### SN-D13 · Canal de invalidação _(nova)_

**Decisão:** **barramento próprio** (~60 linhas, sem dependência nova). Uma ação publica um assunto (`lotes`, `contratos`, `clientes`…); quem exibe aquele assunto refaz o fetch, inclusive em outra página. Absorve `useListRevalidation` e `useRecentSendsFeed` em vez de virar um terceiro mecanismo.
**Cobertura obrigatória:** ao absorver os dois hooks, o barramento passa a dar **revalidação ao voltar ao primeiro plano para TODO assinante** — não só para os 4 lugares que a têm hoje (§2.7). Isto não é um extra: é o que sustenta a **SN-D3** ao matar o resume 30/60min. Sem essa universalização, as 5 superfícies sem revalidação nenhuma ficariam **pior** do que antes.
**Descartadas:** _TanStack Query_ (~13KB gz) — resolve invalidação, dedup e SWR de uma vez e é o padrão da indústria, **mas** exigiria reescrever como as 8 páginas pedem dado (incluindo a `/samples` e seu snapshot maduro) dentro da fase mais arriscada do ciclo; fica como **porta aberta**, um ciclo próprio no futuro, se o trabalho manual incomodar. _Só completar os callbacks_ — nunca resolve entre páginas, que é justamente o caso que piora com o shell persistente.
**Impacto:** (a) sustenta o princípio novo "sem trocar pisca por dado velho"; (b) habilita a SN-D7; **(c) vira pré-requisito da F3 e acrescenta o 2º alerta de sequência no §6**; (d) restringe a SN-D9 (o dono da política passa a ser o barramento + um registro de chaves).
**Implementada na F3** (`lib/revalidation/`): `subjects.ts` (o tipo + o mapa caminho→assunto), `bus.ts` (pub/sub singleton, sem React, com coalescedor de 120ms) e `use-revalidate.ts`, que absorveu o `useListRevalidation` — a origem virou `'publish' | 'foreground' | 'poll'`, e `publish` **não** passa pelo throttle. O `useRecentSendsFeed` foi reescrito por cima dele (mantendo o gate `matchMedia` de desktop que lhe é próprio) em vez de ser apagado.

#### SN-D14 · Quem publica no barramento _(nova — decidida com o Flavio ao iniciar a F3)_

**Decisão:** **publicação automática no ponto único.** O `request()` de `lib/api-client.ts` publica o assunto derivado do caminho após qualquer resposta OK de método ≠ GET. Nenhum dos **77 pontos de escrita** é tocado.
**Descartada:** _cada ponto de escrita publica na mão_ — era a regra 3 do §5.2 original. Dá controle fino (dá pra publicar assunto que o caminho não revela), **mas** são 77 lugares para lembrar, um a um, e esquecer não quebra nada na hora: só deixa aquela ação sem atualizar, que é exatamente o defeito relatado no §2.7 voltando pela porta dos fundos.
**Impacto:** (a) atende "sem trocar pisca por dado velho" sem depender de disciplina; (b) **altera a regra 3 do §5.2** (registro explícito, não silencioso); (c) não muda o faseamento; (d) nenhuma.
**A assimetria que o desenho assume:** o **publicador é estreito** (um caminho → um assunto, o mapa em `subjects.ts` não faz leque) e o **assinante é largo** (cada superfície declara todos os assuntos que exibe — `/contratos` assina `contratos` + `clientes` + `lotes` porque o card mostra os três). O leque mora na declaração de quem exibe, não em quem escreve: é lá que dá pra conferir olhando a tela.

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

#### SN-D11 · Indicador de navegação _(travada na F4, 2026-07-30)_

**Decisão:** **barra fina no topo** (2px, verde de marca), que só aparece depois de **180ms** de espera e some ao terminar. Não disputa com o conteúdo — o snapshot da F3 pinta como hoje e a barra apenas diz "estou indo".

**O caso, localizado no código antes de decidir:** **não existe nenhum `loading.tsx` no projeto** e o service worker é **network-first inclusive para os chunks de rota**, então em rede lenta o primeiro toque em cada aba da sessão deixa a **tela anterior** no lugar, sem sinal nenhum.

**Descartada — `loading.tsx` por rota:** é o mecanismo nativo do App Router e o que Instagram/WhatsApp fazem, mas ele pinta um esqueleto **antes** de a página montar, ou seja **antes de o snapshot ser lido** — desfaria exatamente o que a F3 acabou de entregar. _(Era a recomendação original; o Flavio escolheu a barra.)_

**Implementação:** três peças no molde do barramento da F3 — `lib/navigation/nav-progress.ts` (store no formato de `useSyncExternalStore`, guardando o **conjunto** de links pendentes, não um booleano), `<LinkPendingProbe />` (usa o `useLinkStatus()` do próprio Next, disponível no 15.5.12) e `<NavProgressBar />` no shell. `z-index` por token (`--z-toast`).

**Limite aceito:** `useLinkStatus` só funciona dentro da árvore de um `<Link>`, então navegação por `router.push` não acende a barra. O caso da SN-D11 é o toque na aba.

**Impacto:** (a) compatível; (b) nenhum; (c) fecha a última decisão do ciclo fora a SN-D2 (F5); (d) a barra entra na skill `containers` como chrome do shell.

#### SN-D2 · A tela verde nativa do SO _(travada na F5, 2026-07-30 — a última do ciclo)_

**Decisão:** **não neutralizar — casar com ela.** O `background_color`/`theme_color` `#1f5d43` do manifest **fica**, e a primeira pintura do app passa a ser o **mesmo** verde (`.fv-boot`, §3.5). A tela do SO e a do app viram uma só, sem costura.

**Por que isso e não o contrário:** neutralizar era a leitura literal da pergunta, mas contraria o princípio **"sem trocar verde por branco"** do §1 — e a varredura da F5 mostrou que o problema real nunca foi o verde do SO: era o **branco depois dele** (§3.5). Casar resolve os dois de uma vez, e sem tocar no manifest.

**Descartadas:** _neutralizar o `background_color`_ — trocaria a marca por nada e deixaria a entrada sem identidade; _manter o verde e não criar tela de nome_ — fecharia o buraco branco com uma linha, mas deixaria o objetivo 1 do §1 ("uma nova splash será criada depois") por cumprir, e o ciclo inteiro nasceu desse pedido.

**Impacto:** (a) compatível; (b) só existe depois da SN-D8 — sem a sessão vindo do cache, a caixa verde estaria cobrindo uma espera de rede, que é justamente o acoplamento que matou a splash antiga; (c) fecha o ciclo; (d) a `.fv-boot` entra nas skills `design-system` (chrome de entrada) e `containers` (tabela de tiers).

🔴 **O que esta decisão NÃO garante:** que a tela nativa do SO seja verde **no iPhone**. O `background_color` é honrado pelo Chrome/Android; no iOS o suporte é irregular e o projeto **não tem `apple-touch-startup-image`**. A fase garante da **primeira pintura do documento** em diante. Se o iOS abrir branco antes disso, a correção é gerar as ~10 PNGs de launch screen por tamanho de tela — **fora de escopo**, e só o device diz se é necessário.

#### SN-D15 · O primeiro render DENTRO da fronteira é uma constante _(travada 2026-07-30, correção pós-F5)_

**Decisão:** o gate do layout do route group `(app)` **não olha a sessão no primeiro render**. Um latch (`useState(false)` + layout effect) garante isso; só depois dele o gate consulta `loading`/`session`.

**Por que:** um `useLayoutEffect` **acima** de um `<Suspense>` roda **sempre antes** de o conteúdo **dentro** dele ser hidratado. Não é corrida: `updateSuspenseComponent` estaciona a fronteira no primeiro passe (grava `lanes = 536870912` — OffscreenLane, prioridade mínima — e devolve `null`, sem chamar quem está dentro), enquanto o layout effect do `AuthProvider` commita **naquele** passe. Com cache de sessão o mismatch é **garantido**, não provável: o servidor escreve a caixa verde e o cliente, chegando tarde e já com sessão, tenta casar o `.app-shell-root` contra ela.

🔴 **A F5 não criou este bug — tornou-o legível.** Com o `return null` de antes, o servidor mandava `<!--$--><!--/$-->`, `getNextHydratable` parava no `SUSPENSE_END_DATA` e o React lançava **o mesmo** `throwOnHydrationMismatch`; só que `warnNonHydratedInstance` gravava `serverProps = null` e o diff saía **só com linhas `+`**, que passava por ruído. **O instinto de "voltar pro `null`" está errado.**

**Descartadas:** _voltar ao `return null`_ (mesmo erro, diff ilegível, e devolve o buraco branco); _`suppressHydrationWarning`_ — **não funciona aqui**: o `<div>` do portão **foi** hidratado (`canHydrateInstance` só compara `nodeName`), e o throw vem do `<header className="app-topbar">`, filho sem contraparte; _subir o gate para acima da fronteira_ — estrutura melhor, e é por ali que se vai um dia, mas muda **bytes servidos** de 8 rotas antes de qualquer validação no device; _`useAuth()` devolvendo estado do servidor durante a hidratação_ (`useSyncExternalStore` + `getServerSnapshot`) — mecanismo mais robusto do lote, preço errado: mentira global no hook mais central para consertar um call site.

**Impacto:** (a) compatível; (b) troca o invariante **acidental** da SN-D7 ("página autenticada nunca renderiza no servidor **porque as rotas são estáticas**") por um **mecânico** (o gate corta antes dos `children` no primeiro render, sempre); (c) nenhuma decisão anterior cai; (d) a regra generalizável entra na skill `conventions`.

**Escopo medido:** hoje é erro **só de dev** — em produção `useSearchParams()` derruba o boundary para CSR e nada é hidratado ali. Conferido na build: `is-hold=0` no HTML pré-renderizado das 8 rotas, **antes e depois** do patch. Mas a imunidade é **acidental**: um `export const dynamic`, um `revalidate = 0` ou um `cookies()` no layout raiz a levaria para produção. O latch custa 4 linhas e **zero byte servido**.

### §4.2 Decisões EM ABERTO

**Nenhuma.** As 11 decisões do ledger estão travadas (§4.1); resta só a derivada SN-D12 (§4.3), que é de comportamento do "voltar" e não bloqueia nada.

| ID             | Questão                           | Status                                                                                                |
| -------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ~~**SN-D11**~~ | ~~**Indicador de navegação**~~    | 🪦 **TRAVADA na F4 (2026-07-30)** — ver §4.1. Barra fina no topo, com atraso de 180ms                 |
| ~~**SN-D2**~~  | ~~**A tela verde nativa do SO**~~ | 🪦 **TRAVADA na F5 (2026-07-30)** — ver §4.1. **Casar** com ela, não neutralizar; o manifest não muda |

### §4.3 Decisões DERIVADAS (a confirmar antes de implementar)

Seguem das travadas, mas **não foram confirmadas explicitamente** — confirmar ao entrar na fase correspondente.

| ID            | Derivação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~**SN-D6**~~ | 🪦 _Onde a sessão é resolvida._ **CONFIRMADA E IMPLEMENTADA na F2 (2026-07-30).** O provider é `AuthProvider` em `lib/auth/AuthProvider.tsx`, montado em `app/(app)/layout.tsx`. **Contrato exposto:** `{ session, loading, logout, setSession }` — de propósito, a mesma forma que o antigo `useRequireAuth` devolvia, o que tornou a migração das 8 páginas mecânica. O `isAuthorized` **não** entrou no contexto: virou o hook separado `useRequireRole(allowedRoles)`, porque autorização é por rota e o layout não sabe (nem deve saber) quais papéis cada rota aceita. Falta só o init síncrono do cache, que é da F3 (SN-D8).                                                                                                 |
| ~~**SN-D9**~~ | 🪦 _Dono da política de cache._ **CONFIRMADA E IMPLEMENTADA na F3 (2026-07-30).** O primitivo é `lib/snapshots/` — `registry.ts` (chaves + TTL + `readSnapshot`/`writeSnapshot`/`clearSnapshot`/`clearAllSnapshots`, leitura **pura**: não consome, porque a página re-salva continuamente e consumir na leitura perderia o estado no primeiro refetch) e `scroll.ts` (o par de leitura/aplicação de scroll **e** o `restoreListScrollTop`, ambos extraídos de `/samples`). O logout **itera o registro** em vez da lista hardcoded, e o `storageKey` do `ClientsBrowser` deixou de ser `string`: só aceita chave registrada (`SnapshotKey`) — chave inventada não existiria no registro e portanto sobreviveria à troca de usuário. |
| **SN-D12**    | _Restauração de scroll por aba._ Segue de D7: restaurado via snapshot. Falta decidir o comportamento no **voltar do navegador** vs. **tocar na aba**. _Atualizado na F2:_ o `isPopState` morava dentro do `PageTransition` (para escolher a direção da animação) e **foi apagado com ele** — hoje **nenhum código do app escuta `popstate` para navegação de página** (só o `BottomSheet`, para o back do Android, e o `ContratosPanel`). Ou seja, a D12 parte do zero em vez de herdar mecanismo.                                                                                                                                                                                                                                   |

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

> ✅ **IMPLEMENTADA na F3 (2026-07-30).** A tabela abaixo deixou de ser proposta: é o que está no código. O molde é o de `/samples` (`SAMPLES_SNAPSHOT_KEY`, TTL 30min, itens + cursor + scroll + busca + filtros + `savedAt`, descarte explícito em deep-link conflitante e mudança de busca/filtro) e as partes reusáveis dele viraram `lib/snapshots/`. A coluna de assuntos é o que cada superfície **declara** em `useRevalidate` — foi confirmada superfície a superfície, não presumida.

| Rota          | Carrega                              | Snapshot (o que restaura)                               | TTL   | Assuntos que a invalidam                                          |
| ------------- | ------------------------------------ | ------------------------------------------------------- | ----- | ----------------------------------------------------------------- |
| `/dashboard`  | cards agregados (avisos, calendário) | — (agregados, sem scroll longo)                         | —     | avisos: `lotes`+`contratos`+`relatorios`; calendário: `contratos` |
| `/samples`    | lista por cursor + stats             | itens, cursor, scroll, busca, filtros ✅ **já existia** | 30min | `lotes`, `clientes`                                               |
| `/cadastros`  | clientes por cursor + corretores     | idem, por sub-aba ✅ **já existia** (2 chaves)          | 30min | `clientes`, `corretores`                                          |
| `/contratos`  | lista de contratos                   | itens, cursor, `counts`, scroll, busca, filtros ✅ F3   | 30min | `contratos`, `clientes`, `lotes`                                  |
| `/financeiro` | carteira de corretagem               | itens, cursor, KPIs, scroll, busca, filtro ✅ F3        | 30min | `corretagem`, `contratos`                                         |
| `/relatorios` | feed                                 | itens, página, scroll, busca, tipo ✅ F3                | 30min | `relatorios`                                                      |
| `/users`      | lista por cursor (caps 30/60)        | itens, cursor, scroll, busca ✅ F3                      | 30min | `usuarios`                                                        |
| `/profile`    | dados do próprio usuário             | —                                                       | —     | `sessao`                                                          |

**Regras transversais:**

1. **O snapshot é só a primeira pintura.** Nunca é fonte de verdade: o fetch roda silencioso por baixo (stale-while-revalidate), como `/samples` já faz.
2. **Registro de chaves.** As chaves vivem em `lib/snapshots/registry.ts`, e o logout **itera o registro** — a lista hardcoded morreu. Página nova = uma linha no registro, e a limpeza vem de graça.
3. ~~**Mutação publica assunto.** Todo ponto de escrita publica o assunto afetado~~ → **revogada pela SN-D14.** Quem publica é o `request()` do `api-client`, automaticamente, para todo método ≠ GET. Nenhum ponto de escrita publica na mão — eram 77 lugares para lembrar. Uma tela **assina** os assuntos que exibe; nenhuma precisa saber quem mais os exibe.
4. **Trocar de usuário limpa tudo.** O logout limpa os snapshots via o registro do item 2, então nenhum fica para trás.
5. **Revalidação silenciosa não pisca** _(acrescentada na F3)_. Quem revalida por baixo — barramento, foreground, poll ou mount restaurado — **não** acende skeleton, **não** rola para o topo, **não** reanima entrada de item e **não** derruba a lista da tela em caso de falha (o usuário fica com o último dado bom). Skeleton é para carga real e troca de filtro, onde o conteúdo de fato muda.

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
>
> **🔴 Descobertas da F3 (2026-07-30) — três coisas que a fase achou e que valem para o resto do ciclo:**
>
> 1. **O page loader tinha uma fonte só.** `useGlobalLoading` era chamado em **exatamente um lugar** (o provider de auth). O comentário da skill `design-system` que falava em "páginas de detalhe também registram" estava obsoleto — os detalhes viraram overlay há tempos. Resolvida a sessão pelo cache, o `LoadingProvider` ficou sem fonte e **caiu inteiro**, junto com o `SplashVisual` e 366 linhas de CSS. **O `public/logo-safras-branco.png` FICOU** — tem 8 consumidores. É a lição da F1 se repetindo: conferir quem mais consome, sempre.
> 2. **O `/login` não gravava o cache de sessão** — quem gravava era o provider, depois do próprio fetch. Ou seja: **a primeira tela depois de todo login** caía no caminho lento. Sem corrigir isso, a SN-D8 não valeria justamente onde mais aparece.
> 3. **A hidratação é o gotcha desta fase, e tem dois casos distintos.** O cache de sessão é lido em **layout effect** (não no inicializador do `useState`): `readCachedSession()` devolve `null` no servidor e a sessão no cliente, e as 8 rotas são pré-renderizadas — o inicializador daria mismatch. Já os **snapshots de página** podem ser lidos no inicializador com segurança, porque o gate do layout do grupo **corta antes dos `children`**: as páginas **nunca renderizam no servidor**. Distinção que parece sutil e decide onde cada leitura mora.
>
> ⚠️ **Esta redação foi corrigida em 2026-07-30 — a original errava DUAS vezes** e vale registrar porque foi ela que autorizou o bug da SN-D15. Dizia (a) que o layout effect era seguro "porque roda **depois da hidratação**" — vale só para a árvore onde o `AuthProvider` está, **não** para quem consome atrás de um `<Suspense>`; e (b) que os snapshots eram seguros "porque o layout do grupo devolve **`null`**" — o `null` virou caixa verde na F5, e a garantia real hoje é o **latch** da SN-D15, que é mecânico e não depende de as rotas continuarem estáticas.
>
> **🔴 Descobertas da F4 (2026-07-30):**
>
> 1. **A acessibilidade era o achado maior da fase, não a estética.** Duas coisas que nenhuma varredura de CSS acharia: `prefers-reduced-motion` cobria só **2 das 4** animações de esqueleto (a mais usada de todas ficava de fora), e **só a `/samples`** tinha região `aria-live` do load-more — nas outras **cinco** listas a rolagem infinita trazia conteúdo **em silêncio**, porque o esqueleto é `aria-hidden`. Virou a peça `components/LoadingLive.tsx`.
> 2. **A região `aria-live` NÃO pode morar dentro do `SkeletonCards`**, por mais que pareça o lugar. Ela precisa estar **sempre no DOM**, com só o texto mudando — região recém-inserida costuma não disparar em parte dos leitores de tela. São duas peças porque são **dois tempos de vida**, e o porquê está escrito nos dois arquivos.
> 3. **Um 5º lugar que a varredura da fase não tinha contado:** o **painel do usuário** (`/users`) dizia "Carregando..." no corpo, com o cabeçalho de identidade já pintado por cima (ele vem da linha da lista). A regra 4 do vocabulário — _lista, detalhe e painel nunca dizem "Carregando"_ — o cobre. Foi convertido junto (`.usr-panel-skel`): deixar de fora significaria escrever na skill uma regra que o código não cumpre, que é exatamente a dívida que a F2 apontou.
> 4. **O "completa e some" da barra é feito trocando a DURAÇÃO da animação, não a animação.** Substituir por outra devolve o elemento ao `scaleX(0)` da base antes de recomeçar (o valor computado de uma animação não serve de ponto de partida para uma transição). Como o tempo decorrido já passa dos 0,2s, trocar `animation-duration` faz cair direto no último keyframe.
> 5. **O efeito que liga a barra depende SÓ de `pending`.** Com `phase` nas deps, o `setPhase('done')` dispararia a limpeza do próprio efeito e mataria o timer do 'done' — a barra ficaria presa em 100%. É o mesmo gênero de erro que a F3 teve com o `cancelAnimationFrame` da restauração de scroll.
>
> **🔴 Descobertas da F5 (2026-07-30) — a fase que fechou o ciclo:**
>
> 1. **O buraco branco era real e ninguém tinha olhado.** O ciclo inteiro girou em torno de "apagar o verde", e a F5 achou o oposto: entre a tela verde do SO e o shell havia um **documento branco** (§3.5). Foi o que transformou a fase de cosmética em correção de princípio.
> 2. **A ORDEM das camadas é o que dispensa o `<script>` inline.** Verde incondicional no HTML servido + logo condicional por cima, depois da hidratação. Se fossem uma peça só, a decisão teria de acontecer **antes da primeira pintura** — script síncrono no parse e `suppressHydrationWarning` no `<html>`. É o terceiro caso de hidratação do ciclo, e o único resolvido por **arranjo visual** em vez de por onde a leitura mora.
> 3. **🔴 `next/image` teria quebrado a splash offline, em silêncio.** Não há config de `images`, então o componente pede `/_next/image?url=…` — que **não está no cache do service worker**. O `STATIC_PATHS` do `sw.js` cacheia `/logo-safras-branco.png`, o caminho **cru**. `<img>` cru é obrigatório aqui, e o motivo está escrito ao lado.
> 4. **O atalho óbvio estava errado:** pintar o `body` de verde. O `.app-shell-root` é **transparente** — quem pinta o fundo do app é o `body` —, então verde ali deixaria o **app inteiro** verde.
> 5. **Três estados de storage, não dois.** `null` (sem registro → **mostra**, é a 1ª abertura depois de instalar) ≠ `undefined` (sem storage → **não mostra**, porque ali o carimbo nunca persistiria e a tela voltaria em toda abertura). Colapsá-los daria o pior dos dois lados.
> 6. **A rede de segurança fica FORA do `prefers-reduced-motion`.** Uma tela que cobre tudo precisa de saída se o JS não rodar; desligar movimento reduzido não pode significar ficar preso nela. É o sobre-escopo que a F4 acabou de mostrar ser fácil de cometer.
> 7. **🔴 O 4º caso de hidratação — e o item 2 acima estava incompleto.** O arranjo visual imunizou a `.fv-boot` **RAIZ**, e a imunidade vem de ela ser **INCONDICIONAL**, não de ela ser verde. O **portão** (`.is-hold`) é markup **condicional** atrás de uma fronteira de hidratação e não herdou imunidade nenhuma — virou mismatch garantido (**SN-D15**). Qualquer superfície nova que copie a caixa verde e a torne condicional herda o bug, não a imunidade.
> 8. **Duas caixas verdes irmãs com o mesmo z-index: a de baixo some.** O portão vem **depois** no DOM (o `<BootScreen>` é o 1º filho do `<body>`), então com empate ele pintava por cima — e é uma caixa **vazia**. Na combinação "sem cache de sessão + mais de 4h fora" (sessão cacheada expirada, comum) ele **cobria a `.fv-boot-logo`** e a splash de marca simplesmente não aparecia, com o gatilho de 4h funcionando perfeitamente. Corrigido: `.is-hold` é `calc(var(--z-tooltip) + 9)`.
> 9. **🔴 A espera que o portão cobre precisava de PRAZO — e era bug de produção, não de dev.** `getCurrentSession()` não passava `signal`, e o `.is-hold` desliga a rede de segurança em CSS de propósito. Resposta pendurada sem 401 e sem erro de rede (cold start do Cloud Run, portal cativo, proxy que engole a conexão) = `loading` em `true` para sempre = **verde eterno com o JS vivo**, e nenhuma animação conserta isso. Corrigido com `AbortSignal.timeout(10s)`. **A lição maior: uma superfície só pode abrir mão da rede de segurança se a espera que ela cobre tiver fim garantido.**

| Fase      | Objetivo                                                       | Entra                                                                                                                                                                                             | NÃO tocar                                                                                | Risco                                                                     | Pronto quando                                                                   |
| --------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **F1** ✅ | Remover o **boot splash** e sua lógica                         | **só** `SplashScreen.tsx` + os 2 pontos no `app/layout.tsx`                                                                                                                                       | `SplashVisual`, `LoadingProvider`, o CSS e o logo — **todos compartilhados**, saem na F3 | deep-link e offline mudam de comportamento (SN-D3, intencional)           | **código feito e gates verdes 2026-07-30; falta o 🖥️/📱 do Flavio**             |
| **F2** ✅ | **Shell persistente** no route group                           | 8 dirs → `app/(app)/` (85 imports), `AuthProvider` + `AppShell` no layout do grupo, `PageTransition` **apagado** (SN-D5')                                                                         | dados por página                                                                         | perda de estado, hidratação                                               | **código feito e gates verdes 2026-07-30; falta o 🖥️/📱 do Flavio**             |
| **F3** ✅ | **Sessão do cache + invalidação + fim do page loader**         | init do cache via layout effect; **barramento (SN-D13 + SN-D14)**; snapshots nas 4 restantes (SN-D7); registro de chaves (SN-D9); `LoadingProvider`+`SplashVisual`+366 linhas de CSS **apagados** | —                                                                                        | tela branca se F2 incompleta; dado velho se o barramento ficar incompleto | **código feito e gates verdes 2026-07-30 (3 commits); falta o 🖥️/📱 do Flavio** |
| **F4** ✅ | **Camada 4 vira sistema** (SN-D10)                             | primitivo único de skeleton (absorve as 6 famílias); vocabulário de "Carregando"; `LoadingLive`; **SN-D11** (barra de navegação)                                                                  | arquitetura da F3                                                                        | —                                                                         | **código feito e gates verdes 2026-07-30 (3 commits); falta o 🖥️/📱 do Flavio** |
| **F5** ✅ | **Nova splash de entrada** (nome do app, só após X tempo fora) | `lib/boot/last-seen.ts` + `components/BootScreen.tsx` + `.fv-boot`; o gate `null` do layout do grupo vira verde; **SN-D2** travada (o manifest NÃO muda)                                          | o manifest; o `background` do `body`                                                     | tela verde eterna se o JS falhar (rede de segurança em CSS)               | **código feito e gates verdes 2026-07-30 (2 commits); falta o 🖥️/📱 do Flavio** |

**Correção pós-F5 (2026-07-30, 3 commits + docs).** Um painel de 11 agentes investigou o mismatch de hidratação que o overlay do dev acusava em toda entrada de rota autenticada e achou mais dois defeitos junto:

| #          | O que era                                                                        | Escopo                                         | Conserto                                                         |
| ---------- | -------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| **SN-D15** | o gate olhava a sessão no primeiro render **dentro** da fronteira                | **só dev** (medido: `is-hold=0` no pré-render) | latch de hidratação, 4 linhas, **zero byte servido**             |
| —          | o portão **cobria o logo** da splash (empate de z-index, irmão posterior no DOM) | dev **e** prod                                 | `.is-hold` = `calc(var(--z-tooltip) + 9)`                        |
| —          | 🔴 `getCurrentSession()` **sem prazo** → verde eterno com o JS vivo              | **produção**                                   | `AbortSignal.timeout(10s)` → vira status 0, tratado como offline |

Risco: **nenhum byte de produção muda** nos três. Pronto quando: **falta o 🖥️/📱 do Flavio**, junto das cinco fases.

## §7. Riscos & questões abertas

- **Auth gate:** mover a sessão para o shell sem abrir janela de conteúdo protegido antes da validação (sessão expirada renderizar o app por um instante). Com SN-D8 o cache é validado por `expiresAt` na leitura (`session-cache.ts:53-57`), mas revogação server-side só aparece na revalidação.
- **~~F2 sem F3~~ — FECHADO em 2026-07-30:** a F3 saiu no mesmo dia, e na ordem certa (barramento → sessão → snapshots). A janela em que esse risco existiu não chegou a ser publicada.
- **Loop de revalidação (novo, F3):** um assinante que publicasse durante o próprio refetch realimentaria o barramento. Mitigado por construção — **só método ≠ GET publica** e o coalescedor de 120ms corta a rajada —, mas é o que conferir na aba de rede: **uma ação = um refetch por superfície**.
- **Offline/PWA:** não regredir o comportamento offline ao remover o `resolveDestination` do splash. O SW e o cache de sessão sustentam o caminho.
- **~~PII no HTML cacheado~~:** **eliminado pela SN-D8** — a sessão não entra no documento, então o cache do SW segue sem identidade. _(Seria risco real se tivéssemos escolhido resolver a sessão no servidor.)_
- **~~Splash nativo do SO~~ — RESOLVIDO na F5 (2026-07-30), por outro caminho.** O risco supunha que a única alavanca fosse o manifest. A saída foi **casar** em vez de sair: o manifest fica como está e o app pinta o mesmo verde na primeira pintura (SN-D2). Fica um resíduo honesto: **no iOS não dá para afirmar que a tela nativa é verde** (o `background_color` é irregular lá e não há `apple-touch-startup-image`) — a fase garante da primeira pintura do documento em diante, e só o device diz se falta mais.
- **Tela verde eterna se o JS falhar (novo, F5):** a `.fv-boot` cobre tudo. Mitigado por uma **rede de segurança em CSS puro** (animação de 1ms com 6s de atraso), que fica **fora** do bloco de `prefers-reduced-motion` de propósito — é saída de emergência, não movimento.
- **~~Tela verde eterna com o JS VIVO~~ — RESOLVIDO em 2026-07-30, e era bug de produção.** O risco acima cobria só o JS morto. O `.fv-boot.is-hold` desliga a rede de segurança de propósito (ele sai quando o shell o substitui, não por tempo), e `getCurrentSession()` não passava `signal`: uma resposta pendurada **sem** 401 e **sem** erro de rede deixava `loading` em `true` para sempre. Curado com `AbortSignal.timeout(10s)`. **Regra que fica: uma superfície só pode abrir mão da rede de segurança se a espera que ela cobre tiver fim garantido.**
- 🔴 **O portão não é uma linha inofensiva (novo, pós-F5).** Ele é markup **condicional** atrás de uma fronteira de hidratação — foi isso, e não a cor, que produziu o mismatch da SN-D15. **A imunidade da `.fv-boot` RAIZ vem de ela ser INCONDICIONAL.** Superfície nova que copie a caixa verde e a torne condicional herda o bug, não a imunidade.
- **A imunidade de produção da SN-D15 é acidental.** Ela depende de as 8 rotas continuarem **estáticas**: um `export const dynamic`, um `revalidate = 0` ou um `cookies()` no layout raiz levaria o mismatch para produção. O latch cobre isso, mas a guarda permanente seria um check de invariante sobre `.next/server/app/*.html` no CI (`is-hold=0`, `app-shell-root=0`) — **proposto, não feito.**
- **SSR/hidratação:** hoje o boot splash vem no HTML SSR (sem flash); removê-lo pode expor flash de `null` — mitigado pelo init síncrono do cache (F3).
- **Modal de senha inicial (novo):** o `AppShell` guarda o fluxo de `initialPasswordDecision` (`AppShell.tsx:401-409`). Com shell persistente esse estado passa a **sobreviver à navegação** — provavelmente melhora, mas é fluxo forçado: verificar no device.
- **~~O `transform` do `PageTransition` é load-bearing~~ — RESOLVIDO na F2 (2026-07-30).** O risco era real e se materializou: a implementação da SN-D5' removeu o `transform` **por completo** (opacidade pura), então o stacking context que obrigava o portal deixou de existir. O que se fez: **manter os portais** — o `.bottom-sheet` tem `transform` permanente e páginas têm animação de entrada com `translateY`, então a regra segue válida por outros ancestrais — e **reescrever a justificativa** na skill `modals` e nos comentários de `MobileTabbar`, `SampleSendFlow`, `SampleLookupResultModal`, `ResultDrawer` e 2 blocos do `globals.css`. A lição fica: **motivo revogado sem código revogado é dívida de documentação** — quem lesse a skill depois iria atrás de um componente que não existe.
- **Memória:** shell persistente não pode segurar todas as páginas montadas — só o chrome; conteúdo troca (foi o que a SN-D7 decidiu ao recusar "abas montadas").
- 🔴 **O service worker é network-first para `/_next/static` (achado da F4, FORA DE ESCOPO).** Essas URLs têm **hash de conteúdo** — são imutáveis por construção, então cache-first seria estritamente correto e deixaria toda navegação repetida instantânea, inclusive em rede ruim. **É a causa raiz do caso que a SN-D11 está mascarando:** a barra avisa que está demorando; isto faria não demorar. Não entrou na F4 porque é decisão de **cache**, não de "camada 4", e mexe no `sw.js` (exige bumpar o `CACHE_NAME`). Fica **proposto como fase curta própria**, para o Flavio decidir.

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

**Da F3, o que só o device mostra** (código feito e gates verdes em 2026-07-30):

- **A queixa curada:** mexer numa página e ver outra refletir **sem sair da aba**.
- **A tela verde não aparece mais** em navegação nenhuma.
- Abrir o app depois de **horas em background** e ver dado fresco **sem reiniciar**.
- **Login → `/dashboard` sem espera** — é o efeito de gravar o cache no `/login`.
- As **4 páginas novas** (`/contratos`, `/financeiro`, `/relatorios`, `/users`) restaurando **scroll e filtros** ao voltar, dentro dos 30min — e **sem piscar skeleton** ao restaurar.
- Em `/users`, os cards **não recascatam** quando a lista revalida por baixo.

**Da F4, o que só o device mostra** (código feito e gates verdes em 2026-07-30):

- **Um esqueleto só** em todas as listas — mesmo brilho, mesma cadência. Duas telas carregando lado a lado não podem mais piscar fora de compasso.
- ⚠️ **Muda a aparência em 2 telas:** o esqueleto de `/relatorios` e o do dashboard do PROSPECTOR ganharam a **borda e a sombra** do card do kit (eram retângulos chapados). É o objetivo da fase, mas é mudança visível — confirmar que ficou melhor.
- `/users` e `/cadastros` abrindo com **esqueleto**, não com a palavra "Carregando"; o **painel do usuário** idem.
- Detalhe de **lote** e de **cliente** abrindo **no formato do conteúdo** (linha de título + blocos), não com uma frase centralizada.
- A **barra do topo** aparecendo só quando a navegação demora, e **nunca piscando** na troca rápida. Se piscar, o número a ajustar é o `APPEAR_DELAY_MS` (180ms) — é chute calibrado, não medição.
- Posição da barra: **abaixo da faixa verde** no mobile (em `top: 0` ela ficaria embaixo da status bar do PWA) e **abaixo da top bar, à direita da sidenav** no desktop.
- **Movimento reduzido ligado no aparelho:** nenhum esqueleto animando, e a barra vira uma linha cheia parada.

**Da F5, o que só o device mostra** (código feito e gates verdes em 2026-07-30):

- **Abrir o PWA e não ver branco em momento nenhum** entre a tela do SO e o app. É o teste da fase.
- 🔴 **Se a tela nativa do iOS abrir branca ANTES da nossa**, o problema não é a `.fv-boot` — é a falta de `apple-touch-startup-image` (§4.1, SN-D2). Só o aparelho dele diz se acontece.
- O logo aparecendo **só** depois de uma pausa longa. Para forçar sem esperar 4h: **`?splash=force`** na URL.
- Trocar de app por 1 minuto e voltar: **sem** tela de marca. É o caso que a regra de 4h existe para cobrir.
- **Deslogado:** abrir o app e ver verde até o `/login`, não branco (é o `.fv-boot.is-hold`).
- **Offline** (modo avião, app já aberto antes): a splash com logo ainda pinta — é o teste do `<img>` cru contra o `next/image`.
- Movimento reduzido ligado: sem fades, e ainda assim sem branco.
- ⏱️ Se os ~910ms incomodarem, os dois números são constantes no topo do `BootScreen.tsx` (`MARK_HOLD_MS` e `BOOT_FADE_MS`) — chute calibrado, não medição, igual ao `APPEAR_DELAY_MS` da F4.

**Da correção pós-F5** (código feito e gates verdes em 2026-07-30):

- **O overlay de hidratação não pode mais aparecer** ao abrir uma rota autenticada em dev **com** cache de sessão. É o teste da SN-D15.
- Apagar `rastreio.cached-session.v1` do `localStorage` e recarregar: continua **verde até o `/login`**, sem overlay e sem branco. Não regressão.
- Navegar entre as 8 rotas: **nenhuma piscada verde** (o layout persiste, o latch fica `true`).
- 🔴 **`?splash=force` SEM cache de sessão: o logo tem de aparecer.** Era exatamente essa combinação que o portão engolia — se o logo continuar sumindo, o `z-index` não resolveu.
- **Sessão que não responde** (modo avião no meio da abertura, ou servidor frio): a tela verde tem de **desistir em ~10s** e cair no `/login`, nunca ficar presa. É o teste do prazo.

## §9. Glossário & referências

- **Shell / app shell:** navbar + chrome persistentes que envolvem o conteúdo da rota.
- **Boot splash:** camada 1 (`SplashScreen`), a tela verde na entrada — 🪦 **apagada na F1**.
- **Page loader:** camada 2 (`is-page-loader`), overlay verde na navegação — 🪦 **apagado na F3**.
- **Barramento / assunto:** o pub/sub de `lib/revalidation/`. **Assunto** é o eixo da invalidação (`lotes`, `contratos`, `clientes`, `corretores`, `corretagem`, `relatorios`, `usuarios`, `sessao`) — quem escreve **publica**, quem exibe **assina**.
- **SWR / stale-while-revalidate:** renderizar do cache e revalidar em background.
- **Staleness:** por quanto tempo um dado cacheado é considerado "fresco" antes de revalidar.
- **Invalidação:** o evento que declara um dado velho **fora do tempo** — por causa de uma ação, não de um relógio (§2.7, SN-D13).
- **Gate `null`:** o `if (loading || !session) return null` das páginas autenticadas.
- **Snapshot:** a primeira pintura restaurada (itens + scroll + filtros), nunca fonte de verdade (§5.2).

**Arquivos-chave:**

- Já saiu (F1): `components/SplashScreen.tsx`
- Já saiu (F2): `components/PageTransition.tsx`
- Já saiu (F3): `components/{SplashVisual,LoadingProvider}.tsx`, `lib/loading/`, `app/globals.css:13690–14055` (366 linhas) — **nada disso podia sair antes**, ver §2.6
- Nasceu na F3: `lib/revalidation/{subjects,bus,use-revalidate}.ts` (o `use-list-revalidation.ts` foi absorvido), `lib/snapshots/{registry,scroll}.ts`, `lib/use-isomorphic-layout-effect.ts`, `tests/revalidation-bus.test.ts`
- **Fica sempre:** `public/logo-safras-branco.png` (6 consumidores fora do splash — §2.6)
- Muda: `app/layout.tsx`, `components/AppShell.tsx`, `lib/use-auth.ts`, as 8 páginas (movem p/ `app/(app)/`)
- Nasceu na F2: `app/(app)/layout.tsx`, `lib/auth/AuthProvider.tsx` (`AuthProvider` · `useAuth` · `useRequireRole`)
- 🪦 Apagados: `components/SplashScreen.tsx` (F1), `components/PageTransition.tsx` (F2)
- **Reusar, não recriar:** `lib/offline/session-cache.ts` (`readCachedSession` é **síncrono** — é o que torna a SN-D8 sem flash), `lib/use-list-revalidation.ts` (o barramento o absorve), `app/samples/page.tsx:429-495` (o molde do snapshot)
- Não tocar: `middleware.ts`, `src/auth/*`, `app/manifest.ts`, `public/sw.js` (salvo bump de `CACHE_NAME` se o logo sair)
