# Shell, Navegação e Carregamento — Plano de Trabalho

Status: **Rascunho / em decisão** (estrutura aprovada 2026-07-24; decisões ainda em aberto)
Escopo (1 linha): remover a atual "página de carregamento verde", tornar o **navbar/shell persistente** (nunca desmonta), fazer a transição entre páginas **sem loader full-screen** (só o conteúdo carrega), e definir a **política de cache/estado por página**.
Prefixo de decisões: **SN** (Shell & Navegação)
Documentos relacionados: `Redesign-Plano-de-Trabalho.md` (redesign visual página-a-página), `Dashboard-Visao-Geral.md`, `Lotes-Visao-Geral.md`, `Auditoria-Navegacao-por-Papel.md`, skill `page-redesign-cycle`.

> **Aviso:** as citações `arquivo:linha` refletem a análise de **2026-07-24**. Números de linha derivam; ao retomar, confirmar contra o código antes de agir.

---

## Como retomar este documento (leia isto primeiro)

Este doc tem **duas metades**:

- **Metade A — Contexto estável (§1–§3 + §9):** a fotografia de como o app funciona hoje e a arquitetura-alvo. Muda pouco. **Leia para se situar.**
- **Metade B — Decisões evolutivas (§4–§8):** o ledger de decisões, o mapa de páginas, a política de estado, o faseamento. **É onde o trabalho acontece.**

Fluxo para uma sessão futura: ler §1–§3 → conferir §4 (o que já foi travado e o que está EM ABERTO) → decidir o próximo item → registrar no ledger → só implementar quando a fase estiver com as decisões travadas.

**Pré-requisito de implementação (combinado com o Flavio):** a documentação precisa estar **completa** E a **disposição das páginas decidida** (§5.1) ANTES de escrever qualquer código.

**Sequência acordada (2026-07-27):** a **disposição das páginas (§5.1) é executada PRIMEIRO**, num ciclo/agente separado (redesign das páginas — ver `Redesign-Plano-de-Trabalho.md`). A SN só retoma **depois**, provavelmente em outra conversa. **Por isso o 1º passo ao retomar a SN é RECONCILIAR a Metade A com o código já entregue** — a reorganização de páginas muda o inventário de rotas/abas do §5.1, a lista de páginas do §2.3, os gates do §2.6 e todos os `arquivo:linha` (re-derivar). Só depois preencher a coluna "alvo" do §5.1 e seguir o ledger na ordem **D4→D6→D1→D3** (D5/D2 por último). Este documento carrega o contexto conceitual; os fatos de código precisam ser re-conferidos.

---

# METADE A — Contexto estável

## §1. Objetivo & princípios

### Objetivo

1. **Remover** a página de carregamento verde que existe hoje (some ao entrar no app e ao transicionar entre páginas). Uma **nova** splash de entrada será criada **depois** — só apresentação do nome do app, disparada apenas na entrada após ficar **X tempo** fora (§3.5, fase futura).
2. **Navbar fixo (modelo _tab bar_):** o shell (navbar + chrome) **nunca desaparece** entre navegações. Intenção do Flavio (2026-07-24): o navbar funciona como **barra de abas** à la WhatsApp/Instagram — tocar numa aba dá **feedback de seleção instantâneo** e o conteúdo troca de forma **natural** (sem loader), a barra imóvel. Consequências: (a) os destinos (= abas) dependem do §5.1; (b) o grau de **preservação de estado por aba** (scroll/filtros ao voltar) é o **SN-D7** (§5.2).
3. **Transição natural:** sem página de carregamento entre páginas; ao navegar, **só o conteúdo da página** carrega (skeleton/inline por área, não overlay full-screen).
4. **Estado & atualização:** definir, por página, **o que é cacheado, por quanto tempo o estado é mantido e quando revalida**.

### Princípios (arbitram as decisões do ledger)

- **Nunca desmontar o shell.** O navbar/chrome monta uma vez e permanece.
- **Não bloquear a navegação em I/O.** Renderizar a casca imediatamente; dados chegam depois, sem tela cheia de espera.
- **Instantâneo > animação de espera.** Melhor navegação instantânea do que um loader "bonito".
- **Sem trocar verde por branco.** Remover o loader não pode expor tela branca (ver §3.3 / §6, alerta de sequência).

### Não-objetivos (fora deste doc)

- Redesign visual das páginas (isso é o `Redesign-Plano-de-Trabalho.md`).
- Mudança no backend de sessão/autenticação (contrato de `/api/v1/auth/session` fica).
- Reescrever o service worker / estratégia de cache de assets (só o necessário para não regredir offline).

---

## §2. Estado atual (a fotografia)

### 2.1 As 5 camadas de carregamento hoje

Quando se vê "uma tela de carregamento", é **uma destas**:

| #   | Camada                                                                      | z-index         | Quando aparece                                                                                        |
| --- | --------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| 0   | **Splash nativo do SO** (PWA instalado)                                     | — (antes do JS) | Cold launch do app instalado. Vem de `manifest.background_color: #1f5d43`. **Independente do React.** |
| 1   | **Boot splash** (`SplashScreen` + `SplashVisual`)                           | **99999**       | 1ª carga por sessão de aba · volta de background ≥30min.                                              |
| 2   | **Page loader** (`SplashVisual` com `pageLoader`, classe `.is-page-loader`) | **99998**       | Refetch de sessão de página autenticada que passa de **480ms**.                                       |
| 3   | **Telas dedicadas** `/offline` e `/maintenance`                             | página          | Sem rede · modo manutenção (não-ADMIN). UI própria — **não** é o splash.                              |
| 4   | **Loading in-page** (skeletons / spinners / "Carregando…")                  | conteúdo        | Cada fetch de dados de lista/modal/select.                                                            |

O alvo deste doc são as camadas **1 e 2** (e a **0** como decisão à parte). As camadas 3 e 4 ficam.

### 2.2 A máquina do splash — "um visual, dois controladores"

Um único componente visual reutilizado por dois controladores independentes, coordenados só pelo z-index.

| Peça                                       | Arquivo                                     | Papel                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SplashVisual`                             | `components/SplashVisual.tsx`               | Visual puro (logo `/logo-safras-branco.png` + halo + 14 partículas + barra + "Carregando…"). `aria-hidden`. Prop `pageLoader` alterna a variante. |
| `SplashScreen`                             | `components/SplashScreen.tsx:70`            | Controlador de **boot** (máquina de estado). Montado em `app/layout.tsx:75`, **fora de todos os providers**. z 99999.                             |
| `LoadingProvider` + `GlobalLoadingOverlay` | `components/LoadingProvider.tsx:21` / `:35` | Controlador do **page loader**. Portal p/ `document.body`. Montado `app/layout.tsx:79`. z 99998.                                                  |
| `useGlobalLoading` / `LoadingContext`      | `lib/loading/loading-context.ts:20` / `:10` | Ponte contador↔overlay (ref-counted `begin`/`end`).                                                                                               |

**Timings:** boot = `MIN_SPLASH_MS 1200` + `EXIT_ANIMATION_MS 700` ≈ **1,9s de piso**. Page loader = `SHOW_DELAY_MS 480` (só aparece se passar disso) + `EXIT_MS 700`; barra **para em 88%** (indeterminada).

**Gatilho único do page loader:** o hook `useGlobalLoading` só tem **um consumidor** no app inteiro — `useRequireAuth` (`lib/use-auth.ts:151`), com `loading` = _"o `GET /auth/session` desta página está em voo"_.

### 2.3 O fato estrutural (a causa do navbar que pisca)

**O `AppShell` (navbar + chrome) é renderizado DENTRO de cada `page.tsx`**, não no layout:

- `app/dashboard/page.tsx:34`, `app/samples/page.tsx`, `app/cadastros/page.tsx:397`, `app/contratos/page.tsx:71`, `app/embarques/page.tsx:47`, `app/users/page.tsx:702`, `app/relatorios/page.tsx:24`, `app/profile/page.tsx`.
- `app/layout.tsx` **não** monta o `AppShell`.

Consequência: no App Router **só o `layout` persiste**. A cada navegação, a página **desmonta e remonta** → o `AppShell` (navbar) **remonta junto** → pisca. Este é o item nº 1 a resolver para "navbar fixo".

**A barra mobile (`components/MobileTabbar.tsx`) confirma o sintoma e a solução.** Ela já é renderizada via **portal no `document.body`** (fora do `PageTransition`, para não herdar o `will-change:transform` que quebrava o `position:fixed`) e já traz o **efeito de seleção pronto** (`.mobile-tabbar-link.is-active` + `aria-current="page"`) — exatamente o feedback IG/WA que o Flavio quer. Mas o componente ainda vive **dentro do `AppShell` montado por página** → remonta a cada navegação, e seu gate `mounted` (`useEffect`) o **zera por um tick** (`return null`) antes de reaparecer = o "pisca". Ou seja: **o efeito de seleção já existe no código; o que o destrói é a remontagem** — precisamente o que o shell persistente (F2) elimina. Abas mobile hoje: **4** — Início `/dashboard`, Lotes `/samples`, Cadastros `/cadastros`, e um 4º slot papel-dependente (Relatórios `/relatorios` **ou** Perfil `/profile`). Contratos e Embarques não entram na tabbar (só no menu do avatar).

### 2.4 Ciclo de vida de uma navegação hoje

1. Navega → página atual **desmonta** (AppShell junto).
2. Página destino **monta** → `useAuthState` dispara `getCurrentSession()` (`lib/api-client.ts`, `cache: 'no-store'` — fetch fresco, sem cache/dedup).
3. Enquanto `loading` → a página retorna `null` (gate, §2.6) → o **page loader verde** cobre o `null` se passar de 480ms.
4. Sessão resolve → conteúdo renderiza.
5. `PageTransition` (`components/PageTransition.tsx`, cosmético 300ms) anima a saída/entrada — **não é loader**.

- **Não há indicador de navegação do router** (sem nprogress / `useLinkStatus` / barra de topo).

### 2.5 Comportamentos "load-bearing" do `SplashScreen` (não são só visuais)

`resolveDestination()` (`SplashScreen.tsx:55-68`): offline→`/offline`, sessão ok→`/dashboard`, 401→`/login`. No `mode==='initial'` **sempre** faz `router.replace`.

- **Deep-link a frio → `/dashboard`** (descarta o deep-link no 1º load da sessão). Remover = deep-link passa a funcionar (`app/page.tsx` RSC ainda cobre `/`→`/dashboard`).
- **Boot offline → `/offline`** (proativo, antes da API). Único ponto que força isso; o SW só leva a `/offline` para documento **não** cacheado.
- **Resume após background** (`visibilitychange`): re-checa sessão >30min, força `/dashboard` >60min. Nada mais faz isso.
- **Flag de sessão** `splash-shown-this-session` (sessionStorage) e `splash-last-background` (localStorage).

### 2.6 Grafo de deleção (o que sai / edita / vira morto)

**Remover (100% órfão):** `components/SplashScreen.tsx`, `components/SplashVisual.tsx`, `components/LoadingProvider.tsx`, `lib/loading/loading-context.ts` (+ pasta). CSS `app/globals.css:20411–20798` (~**388 linhas**, contíguas, splash-exclusivas — inclui `.splash-title` e `@keyframes splash-title-in` **já mortos**).
**Editar:** `app/layout.tsx` (tira 2 mounts; `<PageTransition>` vira filho direto), `lib/use-auth.ts` (tira import `:7` + `useGlobalLoading(loading)` `:151`), skill `.claude/skills/design-system/SKILL.md` §loader (skill-maintenance).
**Não tocar (independentes, apesar de "verdes"):** `app/manifest.ts` `background_color/theme_color: #1f5d43` (splash nativo do SO) e `app/layout.tsx` `themeColor` (barra de status) — só mudam se for decisão explícita (SN-D2). `app/page.tsx` `redirect('/dashboard')` e os guards de `useRequireAuth` cobrem os redirects que o splash duplicava.
**Testes:** **0** referenciam a máquina — a suíte não quebra.
**Asset:** `logo-safras-branco.png` fica sem consumidor React (só o `SplashVisual` usava via `next/image`); se apagar do `public/`, bumpar `CACHE_NAME` em `public/sw.js:11`.

**Os 8 "gates `null`"** (o principal impacto visual — hoje cobertos pelo page loader): `dashboard/page.tsx:29`, `samples/page.tsx:1817`, `cadastros/page.tsx:221`, `contratos/page.tsx:57`, `embarques/page.tsx:36`, `users/page.tsx:487`, `relatorios/page.tsx:19`, `profile/page.tsx:219` (`if (loading || !session) return null`). Sem o loader e sem outra solução, esse instante vira **tela branca**.

---

## §3. Arquitetura-alvo (a ideia)

> Detalhamento técnico será travado no ledger (§4). Aqui fica o conceito.

### 3.1 App shell persistente

Hastear o `AppShell` (navbar + chrome + provedores de sessão) para um **layout persistente** (layout raiz ou um _route group_ autenticado), que monta **uma vez**. A área de rota vira apenas o **conteúdo** que troca. A **sessão passa a viver no shell** (resolvida uma vez), não em cada página.

- Efeito: navbar nunca desmonta; navegação não refaz o `AppShell` nem, idealmente, o `GET /auth/session`.
- Questão em aberto: layout raiz único vs. _route group_ `(app)` para separar rotas públicas (`/login`, `/offline`, `/maintenance`) das autenticadas. → **SN-D4**.

### 3.2 Transição de conteúdo natural

Sem overlay de carregamento entre páginas. Ao navegar, o shell permanece e a área de conteúdo troca (com/sem a animação cosmética do `PageTransition` — decidir manter/ajustar/remover). → **SN-D5**.

### 3.3 Carregamento de dados por página (SWR / stale-while-revalidate)

Dados de página deixam de bloquear a renderização:

- Renderiza a casca/página imediatamente (com a sessão já resolvida no shell).
- Dados chegam com **skeleton/inline por área** (camada 4, que já existe), nunca full-screen.
- Sessão: inicializar `session`/`loading` a partir do **cache já existente** (`readCachedSession`/`writeCachedSession` em `use-auth`, hoje só usado offline) e **revalidar em background** → elimina o gate `null` e o page loader na navegação.

### 3.4 Boot / auth / offline / deep-link no novo modelo

- **Boot:** sem tela verde; primeira resolução de sessão no shell (com cache → instantâneo; sem cache → espera curta, tratada por SN-D1).
- **Auth guard:** permanece em `useRequireAuth` (redireciona a `/login`), mas **sem** bloquear a UI toda (decidir onde vive o guard no shell).
- **Offline / deep-link / resume:** mudanças de comportamento catalogadas em §2.5 → decisões SN-D3.

### 3.5 Splash de entrada nova (FASE FUTURA — placeholder)

Só apresentação do **nome do app**, disparada **apenas na entrada** após ficar **X tempo** fora. Não é o loader de navegação. Especificação e regra do "X tempo" ficam para a fase F4 (§6). _Placeholder — não detalhar até as fases anteriores fecharem._

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
5. **Registro** — só após confirmação do Flavio: status → **TRAVADA** (com data) e as implicações **propagadas** (editar §5/§6/§7 conforme a análise apontar).

**Regra de ouro:** nenhuma decisão trava se a análise revelar conflito não resolvido com uma decisão anterior — nesse caso, reabrir a anterior explicitamente antes de seguir.

### §4.1 Ledger

> Formato: **ID · questão · opções · decisão · data · implicação.** Enquanto `EM ABERTO`, registrar a recomendação (não travada) para acelerar a retomada.

| ID        | Questão                                                                                                                                                                                                                      | Status        | Recomendação (não travada)                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **SN-D1** | O que aparece durante a espera **real** de sessão (1ª carga sem cache)? Causa-raiz + loader neutro · causa-raiz + branco · cosmético (só deletar)                                                                            | **EM ABERTO** | Causa-raiz (init da sessão via cache) + loader mínimo neutro só na 1ª carga.                                           |
| **SN-D2** | A tela verde **nativa do SO** (manifest `background_color`/`theme_color`) — neutralizar também?                                                                                                                              | **EM ABERTO** | Decidir junto do visual da nova splash (F4).                                                                           |
| **SN-D3** | Quais comportamentos load-bearing do boot preservar? (offline→/offline · resume 30/60min · deep-link)                                                                                                                        | **EM ABERTO** | Adotar deep-link funcionando; avaliar repor offline; descartar resume.                                                 |
| **SN-D4** | Onde vive o shell persistente: layout raiz único vs. _route group_ `(app)` autenticado?                                                                                                                                      | **EM ABERTO** | _Route group_ autenticado, separando rotas públicas.                                                                   |
| **SN-D5** | Manter / ajustar / remover a animação `PageTransition` (300ms) na troca de conteúdo?                                                                                                                                         | **EM ABERTO** | Reavaliar após o shell persistente (pode ficar redundante).                                                            |
| **SN-D6** | Onde a **sessão** é resolvida no novo modelo (provider no shell)? Contrato do estado de sessão.                                                                                                                              | **EM ABERTO** | Provider único no shell, sessão via cache + revalidação.                                                               |
| **SN-D7** | **Modelo de navegação do navbar** (IG/WA): quanto **estado por aba** preservar ao trocar — nenhum (re-monta o conteúdo) · scroll/filtros restaurados do cache · abas mantidas montadas (feel mais nativo, custo de memória)? | **EM ABERTO** | Meio-termo: restaurar scroll/filtros do cache por aba; manter montado só se o feel exigir. Decidir junto de §5.1/§5.2. |

_(Adicionar SN-D8+ conforme surgirem. Decisões travadas migram para uma tabela "Travadas" com data.)_

## §5. Mapa de páginas & política de estado

> **Aqui mora a reorganização/unificação de páginas que o Flavio antecipou.** É a seção mais volátil — evoluir à vontade.

### 5.1 Mapa de rotas (atual → alvo) — **EM DECISÃO**

**Ordem (combinado 2026-07-24):** o mapa de páginas (§5.1) é decidido **ANTES** do ledger SN-D — a disposição define as **abas do navbar** e restringe D4/D6/D7. Implementar só com o §5.1 fechado.

**Inventário verificado (2026-07-24):**

- **Abas mobile hoje (`MobileTabbar`, 4 slots):** Início `/dashboard` · Lotes `/samples` · Cadastros `/cadastros` · 4º slot papel-dependente = Relatórios `/relatorios` **ou** Perfil `/profile`. Contratos e Embarques **não** estão na tabbar (entram pelo menu do avatar).
- **Sidebar desktop (`AppShell`):** Início · Lotes · Relatórios · Cadastros · Contratos · Embarques · Usuários (ADMIN). Sub-abas expansíveis via `?tab=`: `/samples` (Lotes/Simulador) · `/cadastros` (Clientes/Corretores) · `/contratos` (Contratos/Financeiro) · `/embarques` (Embarque/Aprovações).
- **Páginas autenticadas reais (8):** `/dashboard`, `/samples` (+ `/samples/[sampleId]`), `/cadastros`, `/contratos`, `/embarques`, `/relatorios`, `/users` (ADMIN), `/profile`.
- **Redirects/aliases (não são páginas):** `/clients`→`/cadastros` · `/financeiro`→`/contratos?tab=financeiro` · `/resumo`→`/relatorios` · `/informe`→`/relatorios` · `/settings`→`/profile` · `/forgot-password`→`/login?modal=forgot-password`.
- **Públicas (UI própria, fora do shell):** `/login`, `/offline`, `/maintenance`, `/laudo/*` (laudo público via QR).

Rotas de hoje (a preencher com o alvo conforme decidir unificações/ajustes):

| Rota atual                                       | Tipo                      | Na tabbar mobile? | Alvo (unificar/ajustar/manter)   | Notas                                                |
| ------------------------------------------------ | ------------------------- | ----------------- | -------------------------------- | ---------------------------------------------------- |
| `/dashboard`                                     | página autenticada        | sim (Início)      | _a decidir_                      |                                                      |
| `/samples` (+ `/samples/[sampleId]`)             | lista + detalhe (drawer)  | sim (Lotes)       | _a decidir_                      | sub-abas Lotes/Simulador                             |
| `/cadastros`                                     | lista + detalhe (overlay) | sim               | _a decidir_                      | absorve `/clients`; sub-abas Clientes/Corretores     |
| `/contratos`                                     | hub + sub-abas            | não (avatar)      | _a decidir_                      | absorve `/financeiro`; sub-abas Contratos/Financeiro |
| `/embarques`                                     | operação                  | não (avatar)      | _a decidir_                      | sub-abas Embarque/Aprovações                         |
| `/relatorios`                                    | feed                      | sim (4º slot A)   | _a decidir_                      | absorve `/resumo`, `/informe`                        |
| `/users`                                         | lista (ADMIN)             | não               | _a decidir_                      | só ADMIN                                             |
| `/profile`                                       | perfil                    | 4º slot B         | _a decidir_                      | absorve `/settings`; senão via avatar                |
| `/login`, `/offline`, `/maintenance`, `/laudo/*` | públicas                  | —                 | manter fora do shell autenticado | `/forgot-password` só bounce p/ `/login`             |

### 5.2 Política de estado por página — **ESQUELETO**

Preencher uma linha por rota-alvo (depois de §5.1):

| Rota          | Dados que carrega | O que cacheia | TTL / quando revalida | Estado preservado (scroll · filtros · seleção · aba) | Notas |
| ------------- | ----------------- | ------------- | --------------------- | ---------------------------------------------------- | ----- |
| _(preencher)_ |                   |               |                       |                                                      |       |

## §6. Faseamento

> **Alerta de sequência (crítico):** NÃO apagar o **page loader** (camada 2) antes de F2+F3 — sem o shell persistente e o cache de sessão, a navegação vira **tela branca**. O **boot splash** (camada 1) pode sair antes.

| Fase            | Objetivo                                                       | Entra                                                                    | NÃO tocar                                | Risco                        | Pronto quando                                            |
| --------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- | ---------------------------- | -------------------------------------------------------- |
| **F1**          | Remover o **boot splash** e sua lógica                         | `SplashScreen` + storage keys + resume; relocar/decidir offline (SN-D3)  | page loader ainda vive; manifest (SN-D2) | boot offline/deep-link mudam | app entra sem a tela verde de boot; gates verdes; device |
| **F2**          | **Shell persistente** (navbar fixo)                            | hastear `AppShell` p/ layout/route-group; sessão no shell (SN-D4, SN-D6) | dados por página                         | perda de estado, hidratação  | navbar não pisca ao navegar                              |
| **F3**          | **Cache/staleness por página** (§5.2) + remover o page loader  | init sessão via cache; SWR por página; deletar `LoadingProvider`         | —                                        | tela branca se F2 incompleta | navegação instantânea, sem verde nem branco              |
| **F4** (futura) | **Nova splash de entrada** (nome do app, só após X tempo fora) | novo componente; SN-D2 (verde nativo)                                    | —                                        | —                            | especificado em doc próprio ou §3.5 expandido            |

## §7. Riscos & questões abertas

- **Auth gate:** mover a sessão para o shell sem abrir janela de conteúdo protegido antes da validação (sessão expirada renderizar o app por um instante).
- **Offline/PWA:** não regredir o comportamento offline (SW + cache de sessão) ao remover o `resolveDestination` do splash.
- **Splash nativo do SO:** só sai via manifest (SN-D2), não pelo React.
- **SSR/hidratação:** hoje o boot splash vem no HTML SSR (sem flash); removê-lo pode expor flash de `null` — mitigado pela sessão em cache (F3).
- **Estado ao trocar de rota:** com shell persistente, decidir o que sobrevive (scroll/filtros) vs. o que reinicia (§5.2).
- **Memória:** shell persistente não pode segurar todas as páginas montadas — só o chrome; conteúdo troca.

## §8. Verificação (por fase)

Gates padrão (`lint` + `format:check` + `typecheck` + `build`) + device do Flavio. Cenários a checar:

- Navegação entre páginas **sem branco e sem verde**; navbar **fixo**.
- Entrada no app (cold boot) com e sem sessão em cache.
- Offline: boot e navegação.
- Deep-link a frio (deve abrir a rota pedida).
- Sessão expirada (redirect a `/login` sem vazar conteúdo).
- PWA instalado: abertura a frio (splash nativo, conforme SN-D2).

## §9. Glossário & referências

- **Shell / app shell:** navbar + chrome persistentes que envolvem o conteúdo da rota.
- **Boot splash:** camada 1 (`SplashScreen`), tela verde na entrada.
- **Page loader:** camada 2 (`is-page-loader`), overlay verde na navegação.
- **SWR / stale-while-revalidate:** renderizar do cache e revalidar em background.
- **Staleness:** por quanto tempo um dado cacheado é considerado "fresco" antes de revalidar.
- **Gate `null`:** o `if (loading || !session) return null` das páginas autenticadas.
- **Arquivos-chave:** `components/{SplashScreen,SplashVisual,LoadingProvider,AppShell,PageTransition}.tsx`, `lib/{use-auth,loading/loading-context,api-client}.ts`, `app/layout.tsx`, `app/manifest.ts`, `public/sw.js`, `app/globals.css:20411–20798`.
